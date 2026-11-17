import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { echoClient, NOVA_IFACE, NOVA_SIGNALS, type NovaAppInfo } from '@pyxis/app-sdk';
import {
  DEFAULT_APP_SIZE,
  PYXIS_APPS,
  __resetAppIconCache,
  appById,
  appHue,
  entryUrlFor,
  getCachedAppIcon,
  isCrossOriginPyxisUrl,
  resolveAppIcon,
  type PyxisAppDef,
} from '../apps/registry';

/**
 * One app as the shell renders it: Nova's registry entry, merged with
 * whatever presentation the built-in overlay has for it.
 *
 * `info` is always present — every DesktopApp comes from Nova's list, which
 * is what makes an `.ipk`-installed app a first-class citizen of the
 * launcher without anyone editing `registry.ts`. `def` is present only for
 * built-ins.
 */
export interface DesktopApp {
  id: string;
  name: string;
  /** Nova's projection — tier, permissions, removability, version. */
  info: NovaAppInfo;
  /** Presentation overlay, when this app is a built-in. */
  def?: PyxisAppDef;
  /** Lucide glyph, for built-ins. */
  icon?: PyxisAppDef['icon'];
  /** Image URL, for apps that ship their own artwork. */
  iconUrl?: string;
  /** Document URL, or null when not reachable in this context. */
  entryUrl: string | null;
  defaultSize: { width: number; height: number };
  category: string;
  pinned: boolean;
  /** Resolved `#rrggbb` accent from Nova's manifest, falling back to `APP_ACCENTS[id].hue`. */
  accent?: string;
}

/**
 * Reduce a manifest icon path to something resolvable against the app's own
 * pyxis:// origin.
 *
 * Nova sends app-root-relative paths, which pass straight through. It has
 * not always: before the alpha-4 on-device run, an ipk app's `icons` carried
 * the absolute *filesystem* path Nova builds for AppHost's benefit
 * (`/usr/pyxis/applications/<id>/icon.png`), and naively stripping the
 * leading slash produced `pyxis://<id>/usr/pyxis/applications/<id>/icon.png`
 * — a guaranteed 404. Nova is fixed, but a malformed manifest can still
 * declare an absolute path, so recover the relative form here rather than
 * emitting a URL that cannot resolve.
 */
function relativeIconPath(path: string, appId: string): string {
  if (!path.startsWith('/')) return path;
  // The common case: the absolute path contains the app dir.
  const marker = `/${appId}/`;
  const at = path.indexOf(marker);
  if (at >= 0) return path.slice(at + marker.length);
  // Otherwise the best guess left is the filename.
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * Highest-resolution icon an app declares, as an absolute URL on its own
 * pyxis:// origin. Nova's `icons` map is size-keyed; we take the numerically
 * largest key, because the launcher draws at 48-64 CSS px and downscaling a
 * 256 beats upscaling a 32.
 *
 * Returns undefined off-device: there is no pyxis:// handler there, so the
 * URL would just 404 and we would rather fall through to the glyph.
 */
export function iconUrlFrom(info: NovaAppInfo): string | undefined {
  const entryUrl = entryUrlFor(info.id, '');
  if (!entryUrl || !entryUrl.startsWith('pyxis://')) return undefined;
  const sizes = Object.keys(info.icons ?? {});
  if (sizes.length === 0) return undefined;
  const best = sizes.reduce((a, b) =>
    (Number(b) || 0) > (Number(a) || 0) ? b : a
  );
  const path = info.icons[best];
  if (!path) return undefined;
  return `pyxis://${info.id}/${relativeIconPath(path, info.id)}`;
}

function normalizeCategory(raw: string | null | undefined): string {
  const trimmed = raw?.trim().toLowerCase();
  if (!trimmed) return 'utility';
  if (trimmed === 'utilities') return 'utility';
  return trimmed;
}

function merge(info: NovaAppInfo): DesktopApp {
  const def = appById(info.id);
  const accent = appHue(info.id, info.accent);
  const rawIconUrl = def?.iconUrl ?? iconUrlFrom(info);
  const cachedDataUrl = rawIconUrl && isCrossOriginPyxisUrl(rawIconUrl) ? getCachedAppIcon(info.id, rawIconUrl) : undefined;
  return {
    id: info.id,
    // The overlay wins on name: a built-in's display name is a product
    // decision ("File Manager"), not something a manifest should be able to
    // restyle. Third-party apps have no overlay, so Nova's name is used.
    name: def?.name ?? info.name,
    info,
    def,
    icon: def?.icon,
    iconUrl: cachedDataUrl ?? rawIconUrl,
    entryUrl: entryUrlFor(info.id, info.entry || 'index.html'),
    defaultSize: def?.defaultSize ?? DEFAULT_APP_SIZE,
    category: def?.category ?? normalizeCategory(info.category),
    pinned: def?.pinned ?? false,
    ...(accent ? { accent } : {}),
  };
}

export interface AppsState {
  /** Every installed app, id-sorted. Nova's list is the source of truth. */
  apps: DesktopApp[];
  byId: (id: string) => DesktopApp | undefined;
  /** Apps to draw in the LeftLauncher's pinned strip. */
  pinned: DesktopApp[];
  /** True until the first List call settles, either way. */
  loading: boolean;
  /**
   * Set when Nova could not be reached. Distinguishes "no apps installed"
   * from "couldn't ask" — without it an unreachable Nova and an empty
   * system render identically, which is the class of lie alpha 3 was about.
   */
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Shared registry store.
 *
 * Every consumer must see the same list, and the list must be fetched once
 * — not once per consumer. Six components call useApps() (launcher, drawer,
 * search, dock, useWindows, Desktop); with per-hook state that was six
 * `nova.List` round trips on mount and six more on every RegistryChanged.
 * An on-device run made that visible: echo.log showed five List calls for a
 * single shell start.
 *
 * A module-level store read through useSyncExternalStore fixes it without a
 * provider, which matters because these components are mounted in several
 * places and threading a context through all of them would be the larger
 * change.
 */
interface Snapshot {
  apps: DesktopApp[];
  loading: boolean;
  error: string | null;
}

let snapshot: Snapshot = { apps: [], loading: true, error: null };
const listeners = new Set<() => void>();
let signalUnsubs: Array<() => void> = [];
let inFlight: Promise<void> | null = null;

function emit(next: Snapshot) {
  // useSyncExternalStore compares snapshots by identity, so this must be a
  // new object every time or React will not re-render.
  snapshot = next;
  listeners.forEach((l) => l());
}

const SHELL_APP_IDS = new Set(['bloom', 'bloom-overlay']);

let storeEpoch = 0;

function hydrateCrossOriginIcons(apps: DesktopApp[], epoch: number) {
  for (const app of apps) {
    if (app.icon || !app.iconUrl || !isCrossOriginPyxisUrl(app.iconUrl)) continue;
    const rawIconUrl = app.iconUrl;
    void resolveAppIcon(app.id, rawIconUrl).then((dataUrl) => {
      if (!dataUrl || epoch !== storeEpoch) return;
      let changed = false;
      const nextApps = snapshot.apps.map((entry) => {
        if (entry.id !== app.id || entry.iconUrl !== rawIconUrl) return entry;
        changed = true;
        return { ...entry, iconUrl: dataUrl };
      });
      if (changed) {
        emit({ ...snapshot, apps: nextApps });
      }
    });
  }
}

async function fetchApps(): Promise<void> {
  // Collapse concurrent refreshes: mount and a burst of registry signals can
  // otherwise queue several identical List calls.
  if (inFlight) return inFlight;
  const epoch = storeEpoch;
  inFlight = (async () => {
    try {
      const list = await echoClient.callMethod(
        'nova',
        NOVA_IFACE,
        'List',
        {}
      ) as { apps?: NovaAppInfo[] } | undefined;
      if (epoch !== storeEpoch) return;
      // Defensive filter: Nova::list excludes shell components, and the UI
      // mirrors the guard so bloom / bloom-overlay never surface in app lists.
      const merged = (list?.apps ?? [])
        .filter((a) => !SHELL_APP_IDS.has(a.id))
        .map(merge);
      emit({
        apps: merged,
        loading: false,
        error: null,
      });
      hydrateCrossOriginIcons(merged, epoch);
    } catch (err) {
      if (epoch !== storeEpoch) return;
      // Keep the last good list rather than blanking the launcher — a
      // transient bus hiccup should not empty the desktop.
      emit({
        ...snapshot,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    // First consumer: fetch, and start listening for registry changes.
    // AppInstalled/AppUninstalled cover nova.Install/Uninstall;
    // RegistryChanged covers nova.Reload, which is what the Installer
    // triggers after opkg — the path every .ipk app actually arrives by.
    void fetchApps();
    const reload = () => {
      __resetAppIconCache();
      void fetchApps();
    };
    signalUnsubs = [
      echoClient.onSignal(NOVA_IFACE, NOVA_SIGNALS.installed, reload),
      echoClient.onSignal(NOVA_IFACE, NOVA_SIGNALS.uninstalled, reload),
      echoClient.onSignal(NOVA_IFACE, NOVA_SIGNALS.registryChanged, reload),
    ];
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      signalUnsubs.forEach((u) => u());
      signalUnsubs = [];
    }
  };
}

const getSnapshot = () => snapshot;

/** Testing seam: subscribe the way useApps does, without rendering. */
export const __subscribeApps = subscribe;

/** Testing seam: drop all cached state so a suite starts clean. */
export function __resetAppsStore() {
  storeEpoch += 1;
  __resetAppIconCache();
  signalUnsubs.forEach((u) => u());
  signalUnsubs = [];
  listeners.clear();
  inFlight = null;
  snapshot = { apps: [], loading: true, error: null };
}

/**
 * useApps
 * -------
 * The shell's app list, from Nova (`org.geckoOS.nova` List), refreshed on
 * Nova's registry signals. Backed by one shared store, so N consumers cost
 * one round trip.
 *
 * This replaces reading `PYXIS_APPS` directly, which was the reason no
 * `.ipk`-installed app could ever appear on the desktop no matter how
 * cleanly it installed. `PYXIS_APPS` is still consulted, but only as a
 * presentation overlay — see `src/apps/registry.ts`.
 *
 * Deliberately carries no liveness: which apps are *running* is AppHost's
 * question and `useAppHost()` answers it. Merging the two here would put
 * two independent refresh cycles behind one hook and make a launch feel
 * like a registry change.
 */
export function useApps(): AppsState {
  const { apps, loading, error } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const byId = useCallback(
    (id: string) => apps.find((a) => a.id === id),
    [apps]
  );

  const pinned = useMemo(() => {
    // Pin order follows PYXIS_APPS, not Nova's alphabetical list, so the
    // launcher strip stays where users' muscle memory left it.
    const order = new Map(PYXIS_APPS.map((a, i) => [a.id, i]));
    return apps
      .filter((a) => a.pinned)
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }, [apps]);

  return { apps, byId, pinned, loading, error, refresh: fetchApps };
}

export default useApps;

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEcho, NOVA_IFACE, NOVA_SIGNALS, type NovaAppInfo } from '@pyxis/app-sdk';
import {
  DEFAULT_APP_SIZE,
  PYXIS_APPS,
  appById,
  entryUrlFor,
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
}

/**
 * Highest-resolution icon an app declares, as an absolute URL on its own
 * pyxis:// origin. Nova's `icons` map is size-keyed with app-root-relative
 * paths ({"128": "icon.png"}); we take the numerically largest key, because
 * the launcher draws at 48-64 CSS px and downscaling a 256 beats upscaling
 * a 32.
 *
 * Returns undefined off-device: there is no pyxis:// handler there, so the
 * URL would just 404 and we would rather fall through to the glyph.
 */
function iconUrlFrom(info: NovaAppInfo): string | undefined {
  const entryUrl = entryUrlFor(info.id, '');
  if (!entryUrl || !entryUrl.startsWith('pyxis://')) return undefined;
  const sizes = Object.keys(info.icons ?? {});
  if (sizes.length === 0) return undefined;
  const best = sizes.reduce((a, b) =>
    (Number(b) || 0) > (Number(a) || 0) ? b : a
  );
  const path = info.icons[best];
  if (!path) return undefined;
  return `pyxis://${info.id}/${path.replace(/^\/+/, '')}`;
}

function merge(info: NovaAppInfo): DesktopApp {
  const def = appById(info.id);
  return {
    id: info.id,
    // The overlay wins on name: a built-in's display name is a product
    // decision ("File Manager"), not something a manifest should be able to
    // restyle. Third-party apps have no overlay, so Nova's name is used.
    name: def?.name ?? info.name,
    info,
    def,
    icon: def?.icon,
    iconUrl: def?.iconUrl ?? iconUrlFrom(info),
    entryUrl: entryUrlFor(info.id, info.entry || 'index.html'),
    defaultSize: def?.defaultSize ?? DEFAULT_APP_SIZE,
    category: def?.category ?? info.category ?? 'utility',
    pinned: def?.pinned ?? false,
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
 * useApps
 * -------
 * The shell's app list, from Nova (`org.geckoOS.nova` List), refreshed on
 * Nova's registry signals.
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
  const echo = useEcho();
  const [apps, setApps] = useState<DesktopApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const echoRef = useRef(echo);
  useEffect(() => {
    echoRef.current = echo;
  }, [echo]);

  const refresh = useCallback(async () => {
    try {
      const list = await echoRef.current.listApps();
      setApps(list.map(merge));
      setError(null);
    } catch (err) {
      // Keep the last good list rather than blanking the launcher — a
      // transient bus hiccup should not empty the desktop.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) void refresh();
    };
    run();

    // AppInstalled/AppUninstalled cover nova.Install/Uninstall;
    // RegistryChanged covers nova.Reload, which is what the Installer
    // triggers after opkg — the path every .ipk app actually arrives by.
    const unsubs = [
      echoRef.current.onSignal(NOVA_IFACE, NOVA_SIGNALS.installed, run),
      echoRef.current.onSignal(NOVA_IFACE, NOVA_SIGNALS.uninstalled, run),
      echoRef.current.onSignal(NOVA_IFACE, NOVA_SIGNALS.registryChanged, run),
    ];
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [refresh]);

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

  return { apps, byId, pinned, loading, error, refresh };
}

export default useApps;

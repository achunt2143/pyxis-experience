import {
  Terminal,
  Folder,
  Settings,
  StickyNote,
  Users,
  CheckSquare,
  Package,
  type LucideIcon,
} from 'lucide-react';
import { getAppIcon } from '@pyxis/app-sdk';
import { VelaIcon } from '../components/VelaIcon';

/**
 * Presentation overlay for Pyxis's built-in apps.
 *
 * **This is no longer the app list.** Nova's registry is the source of truth
 * for which apps exist (`nova.List`, via `useApps()`); an app installed from
 * an `.ipk` has no entry here and must still appear in the launcher. What
 * this file supplies is the things Nova has no opinion about: which Lucide
 * glyph a built-in draws with, its accent colour, whether it is pinned, and
 * the window size it prefers on first open.
 *
 * So: every id here SHOULD be in Nova's list, but not every app in Nova's
 * list is here — and `useApps()` renders the ones that aren't with an icon
 * from the app's own manifest, falling back to a generic glyph. Adding an
 * app here does not make it exist; it only makes it prettier.
 *
 * Each app is an independent package under packages/apps/<id>/ (see
 * INTEGRATION_NOTES.md), loaded by URL — see `entryUrlFor`.
 */
export interface AppAccent {
  bg: string;
  border: string;
  iconColor: string;
  shadow: string;
  /**
   * The app's light, `#rrggbb`: what Evo's Lumen motion tints with (the
   * Droplet's orb) and the dock's landing ripple is drawn in. Sent to Evo
   * with each minimize target (overlay/useMinimizeTargets).
   */
  hue?: string;
}

export const APP_ACCENTS: Record<string, AppAccent> = {
  terminal: {
    bg: 'linear-gradient(180deg, #243040 0%, #161e29 100%)',
    hue: '#34d399',
    border: '#334155',
    iconColor: '#34d399',
    shadow: 'rgba(15, 23, 42, 0.24)',
  },
  browser: {
    bg: 'linear-gradient(180deg, #247db7 0%, #195f8f 100%)',
    hue: '#0284c7',
    border: '#38bdf8',
    iconColor: '#ffffff',
    shadow: 'rgba(25, 95, 143, 0.22)',
  },
  files: {
    bg: 'linear-gradient(180deg, #cf7824 0%, #a85b14 100%)',
    hue: '#d97706',
    border: '#f59e0b',
    iconColor: '#ffffff',
    shadow: 'rgba(168, 91, 20, 0.22)',
  },
  notes: {
    bg: 'linear-gradient(180deg, #d6a31d 0%, #b08210 100%)',
    hue: '#eab308',
    border: '#eab308',
    iconColor: '#ffffff',
    shadow: 'rgba(176, 130, 16, 0.22)',
  },
  contacts: {
    bg: 'linear-gradient(180deg, #198f86 0%, #116b64 100%)',
    hue: '#0d9488',
    border: '#2dd4bf',
    iconColor: '#ffffff',
    shadow: 'rgba(17, 107, 100, 0.22)',
  },
  tasks: {
    bg: 'linear-gradient(180deg, #6857d4 0%, #4d3ead 100%)',
    hue: '#7c3aed',
    border: '#818cf8',
    iconColor: '#ffffff',
    shadow: 'rgba(77, 62, 173, 0.22)',
  },
  settings: {
    bg: 'linear-gradient(180deg, #5f6f82 0%, #435060 100%)',
    hue: '#64748b',
    border: '#64748b',
    iconColor: '#f8fafc',
    shadow: 'rgba(67, 80, 96, 0.22)',
  },
  installer: {
    bg: 'linear-gradient(180deg, #d65c26 0%, #ab4214 100%)',
    hue: '#ea580c',
    border: '#fb923c',
    iconColor: '#ffffff',
    shadow: 'rgba(171, 66, 20, 0.22)',
  },
};

function canonicalAppId(id: string): string {
  return id === 'browser-window' ? 'browser' : id;
}

/** An app's Lumen hue (`AppAccent.hue`), or undefined for an app Bloom has no accent for. */
export function appHue(id: string, manifestAccent?: string | null): string | undefined {
  if (typeof manifestAccent === 'string' && /^#[0-9a-fA-F]{6}$/.test(manifestAccent)) {
    return manifestAccent.toLowerCase();
  }
  return APP_ACCENTS[canonicalAppId(id)]?.hue;
}

/** Synthesize a full `AppAccent` palette from any `#rrggbb` manifest color. */
export function accentFromHex(hex: string): AppAccent {
  const h = hex.toLowerCase();
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return {
    bg: `linear-gradient(135deg, ${h} 0%, color-mix(in srgb, ${h} 80%, #000) 100%)`,
    hue: h,
    border: `color-mix(in srgb, ${h} 70%, #fff)`,
    iconColor: '#ffffff',
    shadow: `rgba(${r}, ${g}, ${b}, 0.35)`,
  };
}

export function getAppAccent(id: string, manifestAccent?: string | null): AppAccent {
  const builtin = APP_ACCENTS[canonicalAppId(id)];
  if (typeof manifestAccent === 'string' && /^#[0-9a-fA-F]{6}$/.test(manifestAccent)) {
    const lower = manifestAccent.toLowerCase();
    if (builtin && builtin.hue?.toLowerCase() === lower) return builtin;
    return accentFromHex(lower);
  }
  return (
    builtin ?? {
      // --mochi-hover is translucent in Remochi 0.5.1, so use opaque panel tokens for fallback icon tiles.
      bg: 'linear-gradient(135deg, var(--mochi-panel-bg, #e2e8f0) 0%, var(--mochi-panel-hover, #cbd5e1) 100%)',
      border: 'var(--mochi-border, #cbd5e1)',
      iconColor: 'var(--color-primary, #2f6fed)',
      shadow: 'rgba(0, 0, 0, 0.15)',
    }
  );
}

export interface PyxisAppDef {
  id: string;
  name: string;
  /** Built-in glyph. Third-party apps have none and use `iconUrl` instead. */
  icon?: LucideIcon;
  /**
   * Absolute URL of an image to draw instead of `icon` — how a third-party
   * app supplies its own artwork (`pyxis://<id>/icon.png`, derived from the
   * `icons` map in its manifest). Built-ins leave this unset and keep their
   * Lucide glyph, which stays crisp at every launcher size.
   */
  iconUrl?: string;
  /**
   * Vite dev-server port for this package (see its vite.config.ts). Used
   * only off-device; on device the app is served from its pyxis:// origin
   * and this is ignored. See `entryUrlFor`.
   */
  devPort?: number;
  /** Show in the LeftLauncher pinned strip. */
  pinned?: boolean;
  defaultSize: { width: number; height: number };
  category: 'system' | 'pim' | 'utility';
}

/** Default window size for an app with no entry in PYXIS_APPS. */
export const DEFAULT_APP_SIZE = { width: 820, height: 560 } as const;

/**
 * True when the shell is running as a real pyxis:// app rather than off a
 * dev server. Bloom itself is staged at `pyxis://bloom/index.html`
 * (create-rootfs.sh's stage_bloom_app), so its own protocol is the honest
 * discriminator — more so than import.meta.env.DEV, which is a build-time
 * flag and would be wrong for a dev build run on device.
 */
export function isPyxisOrigin(): boolean {
  return typeof window !== 'undefined' && window.location.protocol === 'pyxis:';
}

/**
 * Where to load an app's document from.
 *
 * On device this is the app's own pyxis:// origin — a real, isolated,
 * secure-context origin per app, which is the whole point of the scheme.
 * Off device there is no pyxis:// handler, so built-ins fall back to their
 * package's dev server. A third-party app has no dev server at all, so it
 * returns null off-device and the caller renders a "not available in dev"
 * placeholder rather than an iframe pointed at nothing.
 *
 * `entry` comes from Nova (`NovaAppInfo.entry`, webroot-relative) and
 * defaults to index.html, matching nova.rs's `default_entry`.
 */
export function entryUrlFor(appId: string, entry = 'index.html'): string | null {
  if (isPyxisOrigin()) {
    return `pyxis://${appId}/${entry.replace(/^\/+/, '')}`;
  }
  const dev = appById(appId)?.devPort;
  return dev ? `http://localhost:${dev}/${entry.replace(/^\/+/, '')}` : null;
}

export const PYXIS_APPS: PyxisAppDef[] = [
  {
    id: 'terminal',
    name: 'Terminal',
    icon: Terminal,
    devPort: 5180,
    pinned: true,
    defaultSize: { width: 760, height: 460 },
    category: 'system',
  },
  {
    id: 'browser',
    name: 'Vela',
    icon: VelaIcon,
    devPort: 5181,
    pinned: true,
    defaultSize: { width: 960, height: 640 },
    category: 'system',
  },
  {
    id: 'files',
    name: 'File Manager',
    icon: Folder,
    devPort: 5182,
    pinned: true,
    defaultSize: { width: 720, height: 500 },
    category: 'system',
  },
  {
    id: 'notes',
    name: 'Notes',
    icon: StickyNote,
    devPort: 5183,
    pinned: true,
    defaultSize: { width: 860, height: 560 },
    category: 'pim',
  },
  {
    id: 'contacts',
    name: 'Contacts',
    icon: Users,
    devPort: 5184,
    defaultSize: { width: 860, height: 560 },
    category: 'pim',
  },
  {
    id: 'tasks',
    name: 'Tasks',
    icon: CheckSquare,
    devPort: 5185,
    defaultSize: { width: 640, height: 560 },
    category: 'pim',
  },
  {
    id: 'settings',
    name: 'Settings',
    icon: Settings,
    devPort: 5186,
    defaultSize: { width: 820, height: 580 },
    category: 'system',
  },
  {
    id: 'installer',
    name: 'App Installer',
    icon: Package,
    devPort: 5187,
    defaultSize: { width: 680, height: 520 },
    category: 'system',
  },
];

export function appById(id: string): PyxisAppDef | undefined {
  const canonical = canonicalAppId(id);
  return PYXIS_APPS.find((a) => a.id === canonical);
}

const resolvedIconCache = new Map<string, string>();
const iconInFlight = new Map<string, Promise<string | null>>();

function iconCacheKey(appId: string, iconUrl?: string | null): string {
  return `${appId}|${iconUrl ?? ''}`;
}

/** Extract the app id host from a `pyxis://<appId>/...` icon URL, if any. */
export function pyxisAppIdFromUrl(url?: string | null): string | undefined {
  if (!url || !url.startsWith('pyxis://')) return undefined;
  try {
    return new URL(url).host || undefined;
  } catch {
    return undefined;
  }
}

/**
 * True when `url` is a `pyxis://` icon URL from another origin (Gecko blocks
 * cross-origin `pyxis://<third-party>/...` reads in `<img>` and `<canvas>`).
 */
export function isCrossOriginPyxisUrl(url?: string | null): boolean {
  const host = pyxisAppIdFromUrl(url);
  if (!host) return false;
  if (typeof window !== 'undefined' && window.location.protocol === 'pyxis:') {
    return host !== window.location.host;
  }
  return true;
}

export function getCachedAppIcon(appId: string, iconUrl?: string | null): string | undefined {
  if (!appId) return undefined;
  return resolvedIconCache.get(iconCacheKey(appId, iconUrl));
}

/**
 * Resolve an app's icon via `nova.GetAppIcon` (`fetcher`) and cache non-empty
 * data URLs once without permanently caching transient failures or `null`.
 */
export async function resolveAppIcon(
  appId: string,
  iconUrl?: string | null,
  fetcher: (id: string) => Promise<string | null> = getAppIcon
): Promise<string | null> {
  if (!appId) return null;
  const key = iconCacheKey(appId, iconUrl);
  const cached = resolvedIconCache.get(key);
  if (cached) return cached;
  const pending = iconInFlight.get(key);
  if (pending) return pending;

  const promise = Promise.resolve()
    .then(() => fetcher(appId))
    .then((result) => {
      const trimmed = typeof result === 'string' ? result.trim() : '';
      if (trimmed) {
        resolvedIconCache.set(key, trimmed);
        return trimmed;
      }
      return null;
    })
    .catch(() => null)
    .finally(() => {
      iconInFlight.delete(key);
    });

  iconInFlight.set(key, promise);
  return promise;
}

export function __resetAppIconCache() {
  resolvedIconCache.clear();
  iconInFlight.clear();
}

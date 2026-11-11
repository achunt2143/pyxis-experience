import {
  Terminal,
  Folder,
  Globe,
  Settings,
  StickyNote,
  Users,
  CheckSquare,
  Package,
  type LucideIcon,
} from 'lucide-react';

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
    bg: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    hue: '#34d399',
    border: '#334155',
    iconColor: '#34d399',
    shadow: 'rgba(15, 23, 42, 0.35)',
  },
  browser: {
    bg: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
    hue: '#0284c7',
    border: '#38bdf8',
    iconColor: '#ffffff',
    shadow: 'rgba(2, 132, 199, 0.35)',
  },
  files: {
    bg: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
    hue: '#d97706',
    border: '#fbbf24',
    iconColor: '#ffffff',
    shadow: 'rgba(217, 119, 6, 0.35)',
  },
  notes: {
    bg: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
    hue: '#eab308',
    border: '#fde047',
    iconColor: '#422006',
    shadow: 'rgba(234, 179, 8, 0.35)',
  },
  contacts: {
    bg: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
    hue: '#0d9488',
    border: '#2dd4bf',
    iconColor: '#ffffff',
    shadow: 'rgba(13, 148, 136, 0.35)',
  },
  tasks: {
    bg: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
    hue: '#7c3aed',
    border: '#a78bfa',
    iconColor: '#ffffff',
    shadow: 'rgba(124, 58, 237, 0.35)',
  },
  settings: {
    bg: 'linear-gradient(135deg, #475569 0%, #334155 100%)',
    hue: '#64748b',
    border: '#64748b',
    iconColor: '#f8fafc',
    shadow: 'rgba(71, 85, 105, 0.35)',
  },
  installer: {
    bg: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
    hue: '#ea580c',
    border: '#fb923c',
    iconColor: '#ffffff',
    shadow: 'rgba(234, 88, 12, 0.35)',
  },
};

/** An app's Lumen hue (`AppAccent.hue`), or undefined for an app Bloom has no accent for. */
export function appHue(id: string): string | undefined {
  return APP_ACCENTS[id]?.hue;
}

export function getAppAccent(id: string): AppAccent {
  return (
    APP_ACCENTS[id] ?? {
      bg: 'linear-gradient(135deg, var(--mochi-surface, #e2e8f0) 0%, var(--mochi-hover, #cbd5e1) 100%)',
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
    name: 'Browser',
    icon: Globe,
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
  return PYXIS_APPS.find((a) => a.id === id);
}

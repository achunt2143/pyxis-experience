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
 * Central registry of Pyxis built-in apps.
 *
 * Every app is now its own independent package under packages/apps/<id>/
 * (see INTEGRATION_NOTES.md) — a standalone document/process from Bloom,
 * embedded here by URL. `entryHtml` currently points at each package's own
 * local dev server (see each package's vite.config.ts for its fixed port);
 * this becomes a real `pyxis://<id>/` URL once the Nova/kiosk launcher
 * lands — that wiring is deliberately out of scope for this pass.
 */
export interface AppAccent {
  bg: string;
  border: string;
  iconColor: string;
  shadow: string;
}

export const APP_ACCENTS: Record<string, AppAccent> = {
  terminal: {
    bg: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
    border: '#334155',
    iconColor: '#34d399',
    shadow: 'rgba(15, 23, 42, 0.35)',
  },
  browser: {
    bg: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
    border: '#38bdf8',
    iconColor: '#ffffff',
    shadow: 'rgba(2, 132, 199, 0.35)',
  },
  files: {
    bg: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
    border: '#fbbf24',
    iconColor: '#ffffff',
    shadow: 'rgba(217, 119, 6, 0.35)',
  },
  notes: {
    bg: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
    border: '#fde047',
    iconColor: '#422006',
    shadow: 'rgba(234, 179, 8, 0.35)',
  },
  contacts: {
    bg: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)',
    border: '#2dd4bf',
    iconColor: '#ffffff',
    shadow: 'rgba(13, 148, 136, 0.35)',
  },
  tasks: {
    bg: 'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
    border: '#a78bfa',
    iconColor: '#ffffff',
    shadow: 'rgba(124, 58, 237, 0.35)',
  },
  settings: {
    bg: 'linear-gradient(135deg, #475569 0%, #334155 100%)',
    border: '#64748b',
    iconColor: '#f8fafc',
    shadow: 'rgba(71, 85, 105, 0.35)',
  },
  installer: {
    bg: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
    border: '#fb923c',
    iconColor: '#ffffff',
    shadow: 'rgba(234, 88, 12, 0.35)',
  },
};

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
  icon: LucideIcon;
  /** Standalone document this app is embedded from. */
  entryHtml: string;
  /** Show in the LeftLauncher pinned strip. */
  pinned?: boolean;
  defaultSize: { width: number; height: number };
  category: 'system' | 'pim' | 'utility';
}

export const PYXIS_APPS: PyxisAppDef[] = [
  {
    id: 'terminal',
    name: 'Terminal',
    icon: Terminal,
    entryHtml: 'http://localhost:5180/index.html',
    pinned: true,
    defaultSize: { width: 760, height: 460 },
    category: 'system',
  },
  {
    id: 'browser',
    name: 'Browser',
    icon: Globe,
    entryHtml: 'http://localhost:5181/index.html',
    pinned: true,
    defaultSize: { width: 960, height: 640 },
    category: 'system',
  },
  {
    id: 'files',
    name: 'File Manager',
    icon: Folder,
    entryHtml: 'http://localhost:5182/index.html',
    pinned: true,
    defaultSize: { width: 720, height: 500 },
    category: 'system',
  },
  {
    id: 'notes',
    name: 'Notes',
    icon: StickyNote,
    entryHtml: 'http://localhost:5183/index.html',
    pinned: true,
    defaultSize: { width: 860, height: 560 },
    category: 'pim',
  },
  {
    id: 'contacts',
    name: 'Contacts',
    icon: Users,
    entryHtml: 'http://localhost:5184/index.html',
    defaultSize: { width: 860, height: 560 },
    category: 'pim',
  },
  {
    id: 'tasks',
    name: 'Tasks',
    icon: CheckSquare,
    entryHtml: 'http://localhost:5185/index.html',
    defaultSize: { width: 640, height: 560 },
    category: 'pim',
  },
  {
    id: 'settings',
    name: 'Settings',
    icon: Settings,
    entryHtml: 'http://localhost:5186/index.html',
    defaultSize: { width: 820, height: 580 },
    category: 'system',
  },
  {
    id: 'installer',
    name: 'App Installer',
    icon: Package,
    entryHtml: 'http://localhost:5187/index.html',
    defaultSize: { width: 680, height: 520 },
    category: 'system',
  },
];

export function appById(id: string): PyxisAppDef | undefined {
  return PYXIS_APPS.find((a) => a.id === id);
}

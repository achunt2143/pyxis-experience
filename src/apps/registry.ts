import {
  Terminal,
  Folder,
  Globe,
  Settings,
  StickyNote,
  Users,
  CheckSquare,
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
];

export function appById(id: string): PyxisAppDef | undefined {
  return PYXIS_APPS.find((a) => a.id === id);
}

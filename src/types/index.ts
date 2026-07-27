export type WindowState = 'normal' | 'minimized' | 'maximized';

// Every built-in app is now its own standalone package/document, embedded
// by URL — re-exported here so existing `from '../types'` imports across
// Bloom keep working without every call site needing to know these moved
// to @pyxis/app-sdk (the package every app and Bloom itself depend on).
export type {
  AppComponentProps,
  AppLifecycleState,
  AppManifest,
  AppSession,
  AppSurfaceBinding,
  AppHostAppEntry,
} from '@pyxis/app-sdk';

export interface DesktopWindowType {
  id: string;
  title: string;
  appId: string;
  state: WindowState;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  innerWidth: number;
  innerHeight: number;
  /**
   * Standalone document for this app (e.g. `http://localhost:5183/index.html`).
   * The window body embeds the app as a separate document/process/package.
   */
  entryHtml?: string;
}

export interface AppInfo {
  id: string;
  name: string;
  icon: string;
}

export interface WindowContextType {
  windows: DesktopWindowType[];
  createWindow: (appId: string, title?: string) => void;
  closeWindow: (windowId: string) => void;
  minimizeWindow: (windowId: string) => void;
  maximizeWindow: (windowId: string) => void;
  focusWindow: (windowId: string) => void;
  updateWindowPosition: (windowId: string, x: number, y: number) => void;
  updateWindowSize: (windowId: string, width: number, height: number) => void;
}

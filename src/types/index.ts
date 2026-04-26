import type { ComponentType } from 'react';

export type WindowState = 'normal' | 'minimized' | 'maximized';

/**
 * Props passed to every app component rendered inside a DesktopWindow.
 * Apps may accept additional props of their own type — this is the minimum
 * contract DesktopWindow guarantees.
 */
export interface AppComponentProps {
  windowId: string;
  onClose?: () => void;
}

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
  /** Component rendered inside the window body. Optional for backwards compat. */
  component?: ComponentType<AppComponentProps>;
}

export interface AppInfo {
  id: string;
  name: string;
  icon: string;
}

/**
 * AppEntry — registry entry for a built-in Pyxis app, including its component.
 */
export interface AppEntry extends AppInfo {
  component: ComponentType<AppComponentProps>;
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

// ---------- AppHost (lifecycle) types ----------

/**
 * Lifecycle states emitted by the systems-side AppHost over Echo.
 */
export type AppLifecycleState = 'starting' | 'running' | 'stopped' | 'crashed';

/**
 * Manifest as discovered by the AppHost. Mirrors echo/services/apphost.rs::AppManifest.
 */
export interface AppManifest {
  id: string;
  name: string;
  exec: string;
  icon?: string;
  version?: string;
  category?: string | null;
  /** Optional shell-side hint identifying which built-in component to render. */
  entry?: string | null;
}

/**
 * One launched instance of an app. Mirrors echo/services/apphost.rs::AppSession.
 */
export interface AppSession {
  sessionId: string;
  appId: string;
  pid: number;
  /** Seconds since UNIX epoch. */
  startedAt: number;
  state: AppLifecycleState;
  /**
   * Compositor surfaces (Wayland window ids) currently bound to this
   * session. Empty while the app is starting or has not yet produced a
   * window. The shell uses this to decide which DesktopWindow slots have
   * a live native surface to embed.
   */
  surfaces?: number[];
}

/**
 * Lightweight summary of a single compositor surface mapped into a session.
 * Returned by useEcho.listSurfaceSessions / used by useAppHost to feed the
 * embedded-surface slots in DesktopWindow.
 */
export interface AppSurfaceBinding {
  surfaceId: number;
  sessionId: string;
  appId: string;
  pid: number;
  state: AppLifecycleState;
}

/**
 * AppHost ListApps response — installed apps merged with running sessions.
 */
export interface AppHostAppEntry extends AppManifest {
  running: boolean;
  sessions: AppSession[];
}

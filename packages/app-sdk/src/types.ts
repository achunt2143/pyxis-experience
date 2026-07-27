/**
 * Props passed to every app component rendered inside a DesktopWindow.
 * Apps may accept additional props of their own type — this is the minimum
 * contract the host (Bloom) guarantees.
 */
export interface AppComponentProps {
  windowId: string;
  onClose?: () => void;
}

// ---------- AppHost (lifecycle) types ----------

/**
 * Lifecycle states emitted by the systems-side AppHost over Echo.
 *
 * `suspended` is a real state the daemon emits (apphost.rs `AppState::Suspended`
 * -> `AppSuspended` signal): Nova SIGSTOPs an app's process when Evo reports its
 * window minimized. It was previously missing from this union, so a minimized/
 * suspended app fell out of every `state === 'running'` check — including the
 * dock's running-session filter, which made its icon vanish the moment it was
 * minimized and left nothing to click to restore it.
 */
export type AppLifecycleState =
  | 'starting'
  | 'running'
  | 'suspended'
  | 'stopped'
  | 'crashed';

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

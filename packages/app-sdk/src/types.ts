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

// ---------- Nova (app registry) types ----------

/**
 * Where an app came from, which determines how much authority it may hold
 * and whether Nova is allowed to remove it. Mirrors nova.rs::AppTier.
 *
 * - `system` — shipped in the image under SYSTEM_APPS_ROOT.
 * - `opkg`   — installed by opkg under /usr/pyxis/applications. opkg owns the
 *              files, so `nova.Uninstall` refuses these and the UI should
 *              route removal through the Installer (`opkg remove`) instead.
 * - `user`   — installed at runtime via `nova.Install`. Least trusted; the
 *              only tier `removable` is ever true for.
 */
export type AppTier = 'system' | 'opkg' | 'user';

/** Which manifest format an app carries. Mirrors nova.rs::ManifestSource. */
export type AppManifestSource = 'manifest.webapp' | 'appinfo.json';

/**
 * One app as Nova's registry projects it — the response shape of
 * `org.geckoOS.nova` `List` (as `{ apps: NovaAppInfo[] }`) and `GetInfo`.
 *
 * Mirrors echo/src/services/nova.rs::RegistryEntry::info_json(), which is
 * WebAppManifest::to_info_json() plus `source`/`tier`/`removable`, with
 * `type` overridden to "native" for native apps and `requiredPermissions`
 * present only when the app declares any. `running`/`sessionId` are added by
 * `GetInfo` alone — `List` never carries them, so liveness comes from
 * useAppHost's session map, not from here.
 *
 * Keep this in sync with the Rust side; `useApps.contract.test.ts` asserts
 * the mock matches it, which is the check that catches drift at the desk
 * rather than on device.
 */
export interface NovaAppInfo {
  id: string;
  name: string;
  version: string;
  /** "web" | "native" — free-form in the manifest, so not narrowed. */
  type: string;
  /** Entry path relative to the app's webroot, e.g. "index.html". */
  entry: string;
  /** Size-keyed icon paths relative to the app root, e.g. { "128": "icon.png" }. */
  icons: Record<string, string>;
  /** App identity accent color (`#rrggbb`), normalized to lowercase by Nova. */
  accent?: string | null;
  category?: string | null;
  singleInstance: boolean;
  /** "windowed" | "fullscreen". */
  display: string;
  background: boolean;
  permissions: string[];
  installed: boolean;
  source: AppManifestSource;
  tier: AppTier;
  /** False for system and opkg apps — see AppTier. */
  removable: boolean;
  /** Raw pre-mapping permission strings, ipk apps only. */
  requiredPermissions?: string[];
  /** GetInfo only. */
  running?: boolean;
  /** GetInfo only, and only when running. */
  sessionId?: string;
}

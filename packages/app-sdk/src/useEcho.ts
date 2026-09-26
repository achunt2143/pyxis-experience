import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import echoClient from './EchoClient';
import {
  showNotification,
  listNotifications,
  dismissNotification,
  clearNotifications,
} from './notifications';
import type {
  AppHostAppEntry,
  AppLifecycleState,
  AppManifest,
  AppSession,
  AppSurfaceBinding,
  NovaAppInfo,
} from './types';

export interface BatteryStatus {
  /**
   * False on a machine with no battery (a desktop, or the QEMU target).
   * Distinguishing "no battery" from "battery at some level" is the caller's
   * job to render — `power.rs` reports it explicitly rather than emitting a
   * plausible-looking number.
   */
  present: boolean;
  /** Percentage 0-100, or null when `present` is false. */
  level: number | null;
  charging: boolean;
}

export interface NetworkStatus {
  connected: boolean;
  ssid: string;
  type: string;
}

export interface AppListEntry {
  id: string;
  name: string;
  icon: string;
  running?: boolean;
  pid?: number;
}

/** Result of `nova.Launch` — `raised` is true when single-instance policy
 * raised an already-running session instead of spawning a new one. */
export interface LaunchResult {
  sessionId: string;
  appId: string;
  raised: boolean;
}

// Service-name strings must exactly match what echo/src/bin/daemon.rs
// registers (`org.geckoOS.<service>`) — the native bridge builds the Echo
// destination as `org.geckoOS.${service}` verbatim, with no case-folding.
//
// App launch/close go through Nova (the app-runtime host), which owns
// single-instance policy + profile setup and delegates supervision to
// AppHost. AppHost is still queried directly for lifecycle/surface state
// (see the AppHost section below) — Nova delegates to it, doesn't replace it.
const NOVA_SERVICE = 'nova';
export const NOVA_IFACE = 'org.geckoOS.nova';

/**
 * Registry-mutating signals Nova emits (echo/src/services/nova.rs). A
 * consumer of `nova.List` must re-fetch on each of these or its app list
 * goes stale the moment anything is installed or removed.
 *
 * `registryChanged` is the broad one — Nova emits it from `reload()`, which
 * is what the Installer triggers after every `opkg install`/`remove`, so it
 * covers ipk apps that never go through `nova.Install` at all.
 */
export const NOVA_SIGNALS = {
  installed: 'AppInstalled',
  uninstalled: 'AppUninstalled',
  registryChanged: 'RegistryChanged',
} as const;
const POWER_IFACE = 'org.geckoOS.power';
const NETWORK_IFACE = 'org.geckoOS.network';
const TERMINAL_SERVICE = 'terminal';
export const TERMINAL_IFACE = 'org.geckoOS.terminal';
export const TERMINAL_SIGNALS = {
  output: 'TerminalOutput',
  closed: 'TerminalClosed',
} as const;

export const APPHOST_SERVICE = 'appHost';
export const APPHOST_IFACE = 'org.geckoOS.appHost';
export const APPHOST_SIGNALS = {
  starting: 'AppStarting',
  running: 'AppRunning',
  // Emitted when Nova SIGSTOPs a minimized app (apphost.rs transition ->
  // AppState::Suspended). Resume goes back through `AppRunning`, so there's no
  // separate "resumed" signal to subscribe to. Without listening for this, a
  // minimized app stayed 'running' in the local map until the next full
  // refresh, then flipped to a state nothing rendered.
  suspended: 'AppSuspended',
  stopped: 'AppStopped',
  crashed: 'AppCrashed',
  surfaceMapped: 'AppSurfaceMapped',
  surfaceUnmapped: 'AppSurfaceUnmapped',
} as const;

/**
 * useEcho
 * --------
 * React hook wrapping EchoClient. Methods return Promises and never throw —
 * mock fallbacks are used when running in dev / browser context.
 */
export function useEcho() {
  return useMemo(
    () => ({
      isNative: () => echoClient.isNative(),

      // Launch an app via Nova (org.geckoOS.nova). Nova enforces
      // single-instance (raises an existing card instead of spawning a
      // duplicate) and ensures the app's profile before delegating to AppHost,
      // which supervises the vela process Evo composites. Per-app lifecycle
      // still arrives via AppHost signals (see useAppHost). Returns null on a
      // launch failure so callers can show a badge; `raised` distinguishes a
      // raise-existing from a fresh spawn.
      async launchApp(
        appId: string,
        params?: Record<string, unknown>
      ): Promise<LaunchResult | null> {
        const res = (await echoClient.callMethod(NOVA_SERVICE, NOVA_IFACE, 'Launch', {
          appId,
          params: params ?? null,
        })) as LaunchResult | undefined;
        return res && res.sessionId ? res : null;
      },

      // Close every session of an app via Nova (resolves app-id → session,
      // delegates to AppHost.CloseApp). Session-scoped close still lives on
      // `closeSession` below.
      async closeApp(
        appId: string
      ): Promise<{ appId: string; sessionId: string | null }> {
        const res = (await echoClient.callMethod(NOVA_SERVICE, NOVA_IFACE, 'Close', {
          appId,
        })) as { appId: string; sessionId: string | null } | undefined;
        return res ?? { appId, sessionId: null };
      },

      // Raise and give keyboard focus to an already-running app's real
      // compositor window via Nova (org.geckoOS.nova.Focus -> evo's
      // FocusWindow Echo IPC command). Unlike `launchApp` on an already-
      // running single-instance app (which only updates AppHost's "active
      // session" bookkeeping), this actually moves compositor input focus
      // and restacks the window — see evo/src/enhancements/echo_ipc.rs's
      // `FocusWindow` and echo/src/services/nova.rs's `focus`.
      async focusApp(
        appId: string
      ): Promise<{ appId: string; sessionId: string; windowId: number } | null> {
        const res = (await echoClient.callMethod(NOVA_SERVICE, NOVA_IFACE, 'Focus', {
          appId,
        })) as { appId: string; sessionId: string; windowId: number } | undefined;
        return res && res.sessionId ? res : null;
      },

      // Open `url` in a real, independent vela browser window via Nova
      // (org.geckoOS.nova.OpenExternalBrowser) rather than embedding it in
      // an `<iframe>` — real sites' X-Frame-Options/CSP frame-ancestors
      // headers block framing outright, but a top-level browsing context
      // is never subject to those. See echo/src/services/nova.rs's
      // `open_external_browser` for the full rationale.
      async openExternalBrowser(
        url: string
      ): Promise<{ sessionId: string; appId: string; url: string } | null> {
        const res = (await echoClient.callMethod(NOVA_SERVICE, NOVA_IFACE, 'OpenExternalBrowser', {
          url,
        })) as { sessionId: string; appId: string; url: string } | undefined;
        return res && res.sessionId ? res : null;
      },

      async getBatteryLevel(): Promise<BatteryStatus | null> {
        // Method name must match echo/src/bin/daemon.rs's registered
        // handler exactly ("getBatteryStatus", not "getBattery") — the
        // mismatch meant every real call failed and silently fell back to
        // a hardcoded value, which is why the status bar always showed a
        // static 87% regardless of actual battery state.
        //
        // A failed call now returns null rather than a stand-in reading:
        // callers can render "unknown", but they can't be handed a number
        // that was never measured.
        const res = (await echoClient.callMethod(
          'power',
          POWER_IFACE,
          'getBatteryStatus',
          {}
        )) as BatteryStatus | undefined;
        return res ?? null;
      },

      async shutdown(delay?: number): Promise<{ success: boolean; action: string }> {
        const res = (await echoClient.callMethod(
          'power',
          POWER_IFACE,
          'shutdown',
          delay !== undefined ? { delay } : {}
        )) as { success: boolean; action: string } | undefined;
        return res ?? { success: false, action: 'shutdown' };
      },

      async reboot(delay?: number): Promise<{ success: boolean; action: string }> {
        const res = (await echoClient.callMethod(
          'power',
          POWER_IFACE,
          'reboot',
          delay !== undefined ? { delay } : {}
        )) as { success: boolean; action: string } | undefined;
        return res ?? { success: false, action: 'reboot' };
      },

      async sleep(): Promise<{ success: boolean; supported?: boolean; action: string }> {
        const res = (await echoClient.callMethod(
          'power',
          POWER_IFACE,
          'sleep',
          {}
        )) as { success: boolean; supported?: boolean; action: string } | undefined;
        return res ?? { success: false, action: 'sleep' };
      },

      async getNetworkStatus(): Promise<NetworkStatus | null> {
        // Also null-on-failure. The previous fallback claimed
        // `connected: true, ssid: 'GeckoNet'`, so an unreachable network
        // service rendered as a healthy connection to a network that does
        // not exist — the worst-case version of this bug, since it's
        // indistinguishable from success.
        const res = (await echoClient.callMethod(
          'network',
          NETWORK_IFACE,
          'getStatus',
          {}
        )) as NetworkStatus | undefined;
        return res ?? null;
      },

      // ---------- Notifications (see notifications.ts) ----------

      showNotification,
      getNotifications: listNotifications,
      dismissNotification,
      clearNotifications,

      // ---------- Nova (app registry) ----------

      // The installed-app list, from Nova — the registry authority for
      // *which apps exist* (system + opkg + user tiers). AppHost's ListApps
      // is a different thing: the set of apps it can supervise, keyed to
      // native manifests Nova itself generates. The shell asks Nova what is
      // installed and AppHost what is running.
      //
      // Returns [] rather than throwing on a failed call, so a launcher
      // renders empty instead of blank-screening; callers that need to tell
      // "no apps" from "couldn't ask" should use `useApps().error`.
      async listApps(): Promise<NovaAppInfo[]> {
        const res = (await echoClient.callMethod(NOVA_SERVICE, NOVA_IFACE, 'List', {})) as
          | { apps?: NovaAppInfo[] }
          | undefined;
        return res?.apps ?? [];
      },

      // Single-app projection, plus `running`/`sessionId` which `List` does
      // not carry. Null when the app is not installed.
      async getAppInfo(appId: string): Promise<NovaAppInfo | null> {
        const res = (await echoClient.callMethod(NOVA_SERVICE, NOVA_IFACE, 'GetInfo', {
          appId,
        })) as (NovaAppInfo & { error?: string }) | undefined;
        if (!res || res.error || !res.id) return null;
        return res;
      },

      // ---------- AppHost (lifecycle) ----------

      async listAppsHost(): Promise<{ apps: AppHostAppEntry[]; count: number }> {
        const res = (await echoClient.callMethod(
          APPHOST_SERVICE,
          APPHOST_IFACE,
          'ListApps',
          {}
        )) as { apps: AppHostAppEntry[]; count: number } | undefined;
        return res ?? { apps: [], count: 0 };
      },

      async listRunningApps(): Promise<{ sessions: AppSession[]; count: number }> {
        const res = (await echoClient.callMethod(
          APPHOST_SERVICE,
          APPHOST_IFACE,
          'ListRunningApps',
          {}
        )) as { sessions: AppSession[]; count: number } | undefined;
        return res ?? { sessions: [], count: 0 };
      },

      // (App launch is `launchApp`, above — it goes through Nova, which
      // delegates to AppHost.LaunchApp. The shell should not call
      // AppHost.LaunchApp directly: that bypasses Nova's single-instance +
      // profile setup.)

      async closeSession(sessionId: string): Promise<AppSession | null> {
        const res = (await echoClient.callMethod(
          APPHOST_SERVICE,
          APPHOST_IFACE,
          'CloseApp',
          { sessionId }
        )) as AppSession | undefined;
        return res && res.sessionId ? res : null;
      },

      async killSession(sessionId: string): Promise<AppSession | null> {
        const res = (await echoClient.callMethod(
          APPHOST_SERVICE,
          APPHOST_IFACE,
          'KillApp',
          { sessionId }
        )) as AppSession | undefined;
        return res && res.sessionId ? res : null;
      },

      async restartSession(sessionId: string): Promise<AppSession | null> {
        const res = (await echoClient.callMethod(
          APPHOST_SERVICE,
          APPHOST_IFACE,
          'RestartApp',
          { sessionId }
        )) as AppSession | undefined;
        return res && res.sessionId ? res : null;
      },

      async getAppState(
        sessionId: string
      ): Promise<{ sessionId: string; state: AppLifecycleState } | null> {
        const res = (await echoClient.callMethod(
          APPHOST_SERVICE,
          APPHOST_IFACE,
          'GetAppState',
          { sessionId }
        )) as { sessionId: string; state: AppLifecycleState } | undefined;
        return res?.sessionId ? res : null;
      },

      // ---------- AppHost surface bindings ----------
      //
      // These are normally driven by the systems-side compositor (evo) when
      // it maps an XDG toplevel. The shell calls them only to:
      //   - render an authoritative dock when the daemon and compositor are
      //     racing each other on startup (`listSurfaceSessions`)
      //   - manually unbind a surface during a controlled close.
      //
      // The dev-browser mock has no real Wayland; calls succeed and return
      // empty bindings so the UI stays consistent.

      async listSurfaceSessions(): Promise<{ sessions: AppSession[]; count: number }> {
        const res = (await echoClient.callMethod(
          APPHOST_SERVICE,
          APPHOST_IFACE,
          'ListSurfaceSessions',
          {}
        )) as { sessions: AppSession[]; count: number } | undefined;
        return res ?? { sessions: [], count: 0 };
      },

      async bindSurface(
        appId: string,
        surfaceId: number,
        sessionId?: string,
        pid?: number
      ): Promise<AppSession | null> {
        const res = (await echoClient.callMethod(
          APPHOST_SERVICE,
          APPHOST_IFACE,
          'BindSurface',
          {
            appId,
            surfaceId,
            ...(sessionId ? { sessionId } : {}),
            ...(pid !== undefined ? { pid } : {}),
          }
        )) as AppSession | undefined;
        return res && res.sessionId ? res : null;
      },

      async unbindSurface(surfaceId: number): Promise<AppSession | null> {
        const res = (await echoClient.callMethod(
          APPHOST_SERVICE,
          APPHOST_IFACE,
          'UnbindSurface',
          { surfaceId }
        )) as AppSession | undefined;
        return res && res.sessionId ? res : null;
      },

      async subscribeAppLifecycle(): Promise<{
        success: boolean;
        interface: string;
        signals: string[];
      }> {
        const res = (await echoClient.callMethod(
          APPHOST_SERVICE,
          APPHOST_IFACE,
          'SubscribeAppLifecycle',
          {}
        )) as
          | { success: boolean; interface: string; signals: string[] }
          | undefined;
        return (
          res ?? {
            success: true,
            interface: APPHOST_IFACE,
            signals: Object.values(APPHOST_SIGNALS),
          }
        );
      },

      // ---------- Terminal (real PTY-backed shell, echo/src/services/terminal.rs) ----------

      async openTerminal(cols = 80, rows = 24): Promise<{ terminalId: string } | null> {
        const res = (await echoClient.callMethod(
          TERMINAL_SERVICE,
          TERMINAL_IFACE,
          'Open',
          { cols, rows }
        )) as { terminalId: string } | undefined;
        return res && res.terminalId ? res : null;
      },

      async writeTerminal(terminalId: string, data: string): Promise<void> {
        await echoClient.callMethod(TERMINAL_SERVICE, TERMINAL_IFACE, 'Write', {
          terminalId,
          data,
        });
      },

      async resizeTerminal(terminalId: string, cols: number, rows: number): Promise<void> {
        await echoClient.callMethod(TERMINAL_SERVICE, TERMINAL_IFACE, 'Resize', {
          terminalId,
          cols,
          rows,
        });
      },

      async closeTerminal(terminalId: string): Promise<void> {
        await echoClient.callMethod(TERMINAL_SERVICE, TERMINAL_IFACE, 'Close', {
          terminalId,
        });
      },

      onSignal: echoClient.onSignal.bind(echoClient),
      emitSignal: echoClient.emitSignal.bind(echoClient),
    }),
    []
  );
}

/**
 * useAppHost
 * ----------
 * Reactive view of the AppHost: installed `manifests` plus a live
 * `sessions` map keyed by `sessionId`. Subscribes to `AppStarting`,
 * `AppRunning`, `AppStopped`, and `AppCrashed` signals and updates the local
 * map so callers can derive per-app state without polling.
 *
 * In dev/browser mode this is fully driven by the EchoClient mock.
 */
export interface AppHostState {
  manifests: AppManifest[];
  /** Sessions keyed by sessionId for fast lookup. */
  sessions: Record<string, AppSession>;
  /** Convenience: live state for an appId, or null if no session. */
  stateForApp: (appId: string) => AppLifecycleState | null;
  /** Convenience: most recent session for an appId, or null. */
  sessionForApp: (appId: string) => AppSession | null;
  /**
   * Convenience: surface bindings derived from `sessions[*].surfaces`.
   * One entry per mapped compositor surface, keyed by surface id. Used
   * by DesktopWindow to embed live native surfaces.
   */
  surfaceBindings: Record<number, AppSurfaceBinding>;
  /** All surfaces (Wayland window ids) currently bound to this app. */
  surfacesForApp: (appId: string) => number[];
  /** True iff the app has at least one mapped compositor surface. */
  hasLiveSurface: (appId: string) => boolean;
  /**
   * Relaunch an app cleanly: closes/kills any existing session for this
   * appId first, then issues a fresh `launchApp`. Used by crash
   * overlays to give users a one-click recovery path.
   */
  relaunch: (appId: string) => Promise<LaunchResult | null>;
  refresh: () => Promise<void>;
}

export function useAppHost(): AppHostState {
  const echo = useEcho();
  const [manifests, setManifests] = useState<AppManifest[]>([]);
  const [sessions, setSessions] = useState<Record<string, AppSession>>({});
  const echoRef = useRef(echo);
  useEffect(() => {
    echoRef.current = echo;
  }, [echo]);

  const refresh = useCallback(async () => {
    const [list, running] = await Promise.all([
      echoRef.current.listAppsHost(),
      echoRef.current.listRunningApps(),
    ]);
    if (list?.apps) {
      setManifests(
        list.apps.map(
          (entry): AppManifest => ({
            id: entry.id,
            name: entry.name,
            exec: entry.exec,
            icon: entry.icon,
            version: entry.version,
            category: entry.category,
            entry: entry.entry,
          })
        )
      );
    }
    if (running?.sessions) {
      const next: Record<string, AppSession> = {};
      for (const s of running.sessions) {
        next[s.sessionId] = s;
      }
      setSessions(next);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    refresh().catch((err) =>
      console.warn('[useAppHost] initial refresh failed', err)
    );

    const upsert = (data: unknown) => {
      if (cancelled) return;
      const s = data as AppSession;
      setSessions((prev) => ({ ...prev, [s.sessionId]: s }));
    };
    const drop = (data: unknown) => {
      if (cancelled) return;
      const s = data as AppSession;
      // Keep crashed sessions briefly so the badge can be observed, then drop.
      setSessions((prev) => {
        const next = { ...prev };
        next[s.sessionId] = s;
        return next;
      });
      window.setTimeout(() => {
        if (cancelled) return;
        setSessions((prev) => {
          if (!(s.sessionId in prev)) return prev;
          const next = { ...prev };
          delete next[s.sessionId];
          return next;
        });
      }, 4000);
    };

    // Surface map/unmap signals piggyback on the same session payload — the
    // payload carries an updated `surfaces` array. We just upsert; the
    // derived `surfaceBindings` map is recomputed from `sessions`.
    const unsubs = [
      echoRef.current.onSignal(APPHOST_IFACE, APPHOST_SIGNALS.starting, upsert),
      echoRef.current.onSignal(APPHOST_IFACE, APPHOST_SIGNALS.running, upsert),
      // Suspend is an update, not a teardown: keep the session (so its dock
      // icon stays, now flagged 'suspended') rather than dropping it.
      echoRef.current.onSignal(APPHOST_IFACE, APPHOST_SIGNALS.suspended, upsert),
      echoRef.current.onSignal(APPHOST_IFACE, APPHOST_SIGNALS.stopped, drop),
      echoRef.current.onSignal(APPHOST_IFACE, APPHOST_SIGNALS.crashed, drop),
      echoRef.current.onSignal(
        APPHOST_IFACE,
        APPHOST_SIGNALS.surfaceMapped,
        upsert
      ),
      echoRef.current.onSignal(
        APPHOST_IFACE,
        APPHOST_SIGNALS.surfaceUnmapped,
        upsert
      ),
    ];
    return () => {
      cancelled = true;
      unsubs.forEach((u) => {
        try {
          u();
        } catch {
          /* ignore */
        }
      });
    };
  }, [refresh]);

  const stateForApp = useCallback(
    (appId: string): AppLifecycleState | null => {
      const list = Object.values(sessions).filter((s) => s.appId === appId);
      if (list.length === 0) return null;
      // Prefer a live session (a suspended app is still live — just paused —
      // so it counts here) over a stopped/crashed one; otherwise most recent.
      const live = list.find(
        (s) =>
          s.state === 'running' ||
          s.state === 'starting' ||
          s.state === 'suspended'
      );
      const candidate = live ?? list.sort((a, b) => b.startedAt - a.startedAt)[0];
      return candidate?.state ?? null;
    },
    [sessions]
  );

  const sessionForApp = useCallback(
    (appId: string): AppSession | null => {
      const list = Object.values(sessions).filter((s) => s.appId === appId);
      if (list.length === 0) return null;
      const live = list.find(
        (s) =>
          s.state === 'running' ||
          s.state === 'starting' ||
          s.state === 'suspended'
      );
      return live ?? list.sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
    },
    [sessions]
  );

  // Derive surface bindings from `sessions[*].surfaces`. One entry per
  // mapped compositor surface; recomputed only when sessions change.
  const surfaceBindings = useMemo<Record<number, AppSurfaceBinding>>(() => {
    const out: Record<number, AppSurfaceBinding> = {};
    for (const s of Object.values(sessions)) {
      if (!s.surfaces || s.surfaces.length === 0) continue;
      for (const surfaceId of s.surfaces) {
        out[surfaceId] = {
          surfaceId,
          sessionId: s.sessionId,
          appId: s.appId,
          pid: s.pid,
          state: s.state,
        };
      }
    }
    return out;
  }, [sessions]);

  const surfacesForApp = useCallback(
    (appId: string): number[] => {
      const ids: number[] = [];
      for (const s of Object.values(sessions)) {
        if (s.appId !== appId) continue;
        if (s.surfaces) ids.push(...s.surfaces);
      }
      return ids;
    },
    [sessions]
  );

  const hasLiveSurface = useCallback(
    (appId: string): boolean => surfacesForApp(appId).length > 0,
    [surfacesForApp]
  );

  const relaunch = useCallback(
    async (appId: string): Promise<LaunchResult | null> => {
      // Best-effort: kill any lingering session for this app before relaunch.
      const lingering = Object.values(sessions).filter((s) => s.appId === appId);
      for (const s of lingering) {
        try {
          if (s.state === 'crashed' || s.state === 'stopped') continue;
          await echo.killSession(s.sessionId);
        } catch {
          /* ignore */
        }
      }
      try {
        return await echo.launchApp(appId);
      } catch {
        return null;
      }
    },
    [echo, sessions]
  );

  return {
    manifests,
    sessions,
    stateForApp,
    sessionForApp,
    surfaceBindings,
    surfacesForApp,
    hasLiveSurface,
    relaunch,
    refresh,
  };
}

/**
 * useBatteryStatus — convenience hook that polls battery level.
 */
export function useBatteryStatus(intervalMs = 30_000): BatteryStatus | null {
  const echo = useEcho();
  const [status, setStatus] = useState<BatteryStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      const s = await echo.getBatteryLevel();
      if (mounted) setStatus(s);
    };
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [echo, intervalMs]);

  return status;
}

/**
 * useNetworkStatus — convenience hook that polls network connectivity.
 */
export function useNetworkStatus(intervalMs = 30_000): NetworkStatus | null {
  const echo = useEcho();
  const [status, setStatus] = useState<NetworkStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      const s = await echo.getNetworkStatus();
      if (mounted) setStatus(s);
    };
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [echo, intervalMs]);

  return status;
}

export default useEcho;

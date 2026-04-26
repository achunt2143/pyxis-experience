import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import echoClient from './EchoClient';
import type {
  AppHostAppEntry,
  AppLifecycleState,
  AppManifest,
  AppSession,
  AppSurfaceBinding,
} from '../types';

export interface BatteryStatus {
  level: number;
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

export interface NotificationEntry {
  id: string;
  title: string;
  body: string;
  timestamp: number;
}

const APP_MGR_SERVICE = 'appmanager';
const APP_MGR_IFACE = 'com.geckoOS.AppManager';
const POWER_IFACE = 'com.geckoOS.Power';
const NETWORK_IFACE = 'com.geckoOS.Network';
const NOTIF_IFACE = 'com.geckoOS.Notifications';

// AppHost — lifecycle-aware interface. Service name uses the same
// snake convention as `appmanager`; Echo dispatches by destination + method,
// not by case, so the IPC layer accepts both forms.
export const APPHOST_SERVICE = 'apphost';
export const APPHOST_IFACE = 'org.geckoOS.appHost';
export const APPHOST_SIGNALS = {
  starting: 'AppStarting',
  running: 'AppRunning',
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

      async launchApp(appId: string): Promise<{ success: boolean; pid?: number }> {
        return echoClient.callMethod(APP_MGR_SERVICE, APP_MGR_IFACE, 'launch', {
          app_id: appId,
        });
      },

      async closeApp(appId: string) {
        return echoClient.callMethod(APP_MGR_SERVICE, APP_MGR_IFACE, 'close', {
          app_id: appId,
        });
      },

      async getAppList(): Promise<{ apps: AppListEntry[]; count: number }> {
        const res = await echoClient.callMethod(
          APP_MGR_SERVICE,
          APP_MGR_IFACE,
          'list',
          {}
        );
        return res ?? { apps: [], count: 0 };
      },

      async getBatteryLevel(): Promise<BatteryStatus> {
        const res = await echoClient.callMethod(
          'power',
          POWER_IFACE,
          'getBattery',
          {}
        );
        return res ?? { level: 87, charging: false };
      },

      async getNetworkStatus(): Promise<NetworkStatus> {
        const res = await echoClient.callMethod(
          'network',
          NETWORK_IFACE,
          'getStatus',
          {}
        );
        return res ?? { connected: true, ssid: 'GeckoNet', type: 'wifi' };
      },

      async getNotifications(): Promise<NotificationEntry[]> {
        const res = await echoClient.callMethod(
          'notifications',
          NOTIF_IFACE,
          'list',
          {}
        );
        return Array.isArray(res) ? res : (res?.notifications ?? []);
      },

      // ---------- AppHost (lifecycle) ----------

      async listAppsHost(): Promise<{ apps: AppHostAppEntry[]; count: number }> {
        const res = await echoClient.callMethod(
          APPHOST_SERVICE,
          APPHOST_IFACE,
          'ListApps',
          {}
        );
        return res ?? { apps: [], count: 0 };
      },

      async listRunningApps(): Promise<{ sessions: AppSession[]; count: number }> {
        const res = await echoClient.callMethod(
          APPHOST_SERVICE,
          APPHOST_IFACE,
          'ListRunningApps',
          {}
        );
        return res ?? { sessions: [], count: 0 };
      },

      async launchAppHost(
        appId: string,
        params?: Record<string, unknown>
      ): Promise<AppSession | null> {
        const res = await echoClient.callMethod(
          APPHOST_SERVICE,
          APPHOST_IFACE,
          'LaunchApp',
          { appId, params: params ?? null }
        );
        return res && res.sessionId ? (res as AppSession) : null;
      },

      async closeSession(sessionId: string): Promise<AppSession | null> {
        const res = await echoClient.callMethod(
          APPHOST_SERVICE,
          APPHOST_IFACE,
          'CloseApp',
          { sessionId }
        );
        return res && res.sessionId ? (res as AppSession) : null;
      },

      async killSession(sessionId: string): Promise<AppSession | null> {
        const res = await echoClient.callMethod(
          APPHOST_SERVICE,
          APPHOST_IFACE,
          'KillApp',
          { sessionId }
        );
        return res && res.sessionId ? (res as AppSession) : null;
      },

      async restartSession(sessionId: string): Promise<AppSession | null> {
        const res = await echoClient.callMethod(
          APPHOST_SERVICE,
          APPHOST_IFACE,
          'RestartApp',
          { sessionId }
        );
        return res && res.sessionId ? (res as AppSession) : null;
      },

      async getAppState(
        sessionId: string
      ): Promise<{ sessionId: string; state: AppLifecycleState } | null> {
        const res = await echoClient.callMethod(
          APPHOST_SERVICE,
          APPHOST_IFACE,
          'GetAppState',
          { sessionId }
        );
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
        const res = await echoClient.callMethod(
          APPHOST_SERVICE,
          APPHOST_IFACE,
          'ListSurfaceSessions',
          {}
        );
        return res ?? { sessions: [], count: 0 };
      },

      async bindSurface(
        appId: string,
        surfaceId: number,
        sessionId?: string,
        pid?: number
      ): Promise<AppSession | null> {
        const res = await echoClient.callMethod(
          APPHOST_SERVICE,
          APPHOST_IFACE,
          'BindSurface',
          {
            appId,
            surfaceId,
            ...(sessionId ? { sessionId } : {}),
            ...(pid !== undefined ? { pid } : {}),
          }
        );
        return res && res.sessionId ? (res as AppSession) : null;
      },

      async unbindSurface(surfaceId: number): Promise<AppSession | null> {
        const res = await echoClient.callMethod(
          APPHOST_SERVICE,
          APPHOST_IFACE,
          'UnbindSurface',
          { surfaceId }
        );
        return res && res.sessionId ? (res as AppSession) : null;
      },

      async subscribeAppLifecycle(): Promise<{
        success: boolean;
        interface: string;
        signals: string[];
      }> {
        const res = await echoClient.callMethod(
          APPHOST_SERVICE,
          APPHOST_IFACE,
          'SubscribeAppLifecycle',
          {}
        );
        return (
          res ?? {
            success: true,
            interface: APPHOST_IFACE,
            signals: Object.values(APPHOST_SIGNALS),
          }
        );
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
  refresh: () => Promise<void>;
}

export function useAppHost(): AppHostState {
  const echo = useEcho();
  const [manifests, setManifests] = useState<AppManifest[]>([]);
  const [sessions, setSessions] = useState<Record<string, AppSession>>({});
  const echoRef = useRef(echo);
  echoRef.current = echo;

  const refresh = useCallback(async () => {
    const [list, running] = await Promise.all([
      echoRef.current.listAppsHost(),
      echoRef.current.listRunningApps(),
    ]);
    if (list?.apps) {
      setManifests(
        list.apps.map(({ running: _r, sessions: _s, ...m }) => m as AppManifest)
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

    const upsert = (s: AppSession) => {
      if (cancelled) return;
      setSessions((prev) => ({ ...prev, [s.sessionId]: s }));
    };
    const drop = (s: AppSession) => {
      if (cancelled) return;
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
      // Prefer non-stopped/crashed first, otherwise the most recent.
      const live = list.find(
        (s) => s.state === 'running' || s.state === 'starting'
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
        (s) => s.state === 'running' || s.state === 'starting'
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

  return {
    manifests,
    sessions,
    stateForApp,
    sessionForApp,
    surfaceBindings,
    surfacesForApp,
    hasLiveSurface,
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

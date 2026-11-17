import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import echoClient from './EchoClient';
import { EVO_SERVICE, type EvoWindowInfo } from './evo';
import { EVO_IFACE } from './overlay';
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
import {
  APPHOST_IFACE,
  APPHOST_SERVICE,
  APPHOST_SIGNALS,
  NOVA_IFACE,
  NOVA_SERVICE,
  NOVA_SIGNALS,
  POWER_IFACE,
  closeApp,
  focusApp,
  getAppIcon,
  getNetworkStatus,
  launchApp,
  openExternalBrowser,
  powerCall,
  type BatteryStatus,
  type LaunchResult,
  type NetworkStatus,
} from './services';

export {
  APPHOST_IFACE,
  APPHOST_SERVICE,
  APPHOST_SIGNALS,
  NOVA_IFACE,
  NOVA_SIGNALS,
  type BatteryStatus,
  type LaunchResult,
  type NetworkStatus,
};

export interface AppListEntry {
  id: string;
  name: string;
  icon: string;
  running?: boolean;
  pid?: number;
}

const TERMINAL_SERVICE = 'terminal';
export const TERMINAL_IFACE = 'org.geckoOS.terminal';
export const TERMINAL_SIGNALS = {
  output: 'TerminalOutput',
  closed: 'TerminalClosed',
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
      launchApp,

      // Close every session of an app via Nova (resolves app-id → session,
      // delegates to AppHost.CloseApp). Session-scoped close still lives on
      // `closeSession` below.
      closeApp,

      // Raise and give keyboard focus to an already-running app's real
      // compositor window via Nova (org.geckoOS.nova.Focus -> evo's
      // FocusWindow Echo IPC command). Unlike `launchApp` on an already-
      // running single-instance app (which only updates AppHost's "active
      // session" bookkeeping), this actually moves compositor input focus
      // and restacks the window — see evo/src/enhancements/echo_ipc.rs's
      // `FocusWindow` and echo/src/services/nova.rs's `focus`.
      focusApp,

      // ---------- Evo (compositor windows) ----------
      //
      // Keyed by compositor `window_id`, not app id (use `focusApp` for the
      // latter). These need `windows:manage`, which only the shell holds.

      async listWindows(): Promise<EvoWindowInfo[]> {
        const res = (await echoClient.callMethod(EVO_SERVICE, EVO_IFACE, 'ListWindows', {})) as
          | { windows?: EvoWindowInfo[] }
          | undefined;
        return res?.windows ?? [];
      },

      // Ask the toplevel to close, as its titlebar X does. The app may still
      // veto (an unsaved-changes prompt), unlike `closeApp`, which signals
      // the process.
      async closeWindow(windowId: number): Promise<void> {
        await echoClient.callMethod(EVO_SERVICE, EVO_IFACE, 'CloseWindow', {
          window_id: windowId,
        });
      },

      async focusWindow(windowId: number): Promise<void> {
        await echoClient.callMethod(EVO_SERVICE, EVO_IFACE, 'FocusWindow', {
          window_id: windowId,
        });
      },

      async minimizeWindow(windowId: number): Promise<void> {
        await echoClient.callMethod(EVO_SERVICE, EVO_IFACE, 'MinimizeWindow', {
          window_id: windowId,
        });
      },

      async restoreWindow(windowId: number): Promise<void> {
        await echoClient.callMethod(EVO_SERVICE, EVO_IFACE, 'RestoreWindow', {
          window_id: windowId,
        });
      },

      // Open `url` in a real, independent vela browser window via Nova
      // (org.geckoOS.nova.OpenExternalBrowser) rather than embedding it in
      // an `<iframe>` — real sites' X-Frame-Options/CSP frame-ancestors
      // headers block framing outright, but a top-level browsing context
      // is never subject to those. See echo/src/services/nova.rs's
      // `open_external_browser` for the full rationale.
      openExternalBrowser,

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

      shutdown(delay?: number): Promise<{ success: boolean; action: string }> {
        return powerCall('shutdown', delay);
      },

      reboot(delay?: number): Promise<{ success: boolean; action: string }> {
        return powerCall('reboot', delay);
      },

      sleep(): Promise<{ success: boolean; supported?: boolean; action: string }> {
        return powerCall('sleep');
      },

      getNetworkStatus,

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

      getAppIcon,

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

interface RawAppHost {
  manifests: AppManifest[];
  sessions: Record<string, AppSession>;
}

const LIVE_SESSION = (s: AppSession) =>
  s.state === 'running' || s.state === 'starting' || s.state === 'suspended';

function sessionsOf(sessions: Record<string, AppSession>, appId: string): AppSession[] {
  return Object.values(sessions).filter((s) => s.appId === appId);
}

function pickSession(list: AppSession[]): AppSession | null {
  if (list.length === 0) return null;
  return list.find(LIVE_SESSION) ?? [...list].sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
}

async function relaunchSession(
  sessions: Record<string, AppSession>,
  appId: string
): Promise<LaunchResult | null> {
  for (const s of sessionsOf(sessions, appId)) {
    try {
      if (s.state === 'crashed' || s.state === 'stopped') continue;
      await echoClient.callMethod(APPHOST_SERVICE, APPHOST_IFACE, 'KillApp', {
        sessionId: s.sessionId,
      });
    } catch {
      /* ignore */
    }
  }
  try {
    return await launchApp(appId);
  } catch {
    return null;
  }
}

function deriveAppHostState(raw: RawAppHost, refresh: () => Promise<void>): AppHostState {
  const { manifests, sessions } = raw;
  const surfaceBindings: Record<number, AppSurfaceBinding> = {};
  for (const s of Object.values(sessions)) {
    for (const surfaceId of s.surfaces ?? []) {
      surfaceBindings[surfaceId] = {
        surfaceId,
        sessionId: s.sessionId,
        appId: s.appId,
        pid: s.pid,
        state: s.state,
      };
    }
  }
  const surfacesForApp = (appId: string): number[] =>
    sessionsOf(sessions, appId).flatMap((s) => s.surfaces ?? []);
  return {
    manifests,
    sessions,
    stateForApp: (appId): AppLifecycleState | null =>
      pickSession(sessionsOf(sessions, appId))?.state ?? null,
    sessionForApp: (appId) => pickSession(sessionsOf(sessions, appId)),
    surfaceBindings,
    surfacesForApp,
    hasLiveSurface: (appId) => surfacesForApp(appId).length > 0,
    relaunch: (appId) => relaunchSession(sessions, appId),
    refresh,
  };
}

export interface AppHostExternalStore {
  get(): AppHostState;
  peek(): AppHostState;
  set(next: AppHostState): void;
  subscribe(listener: () => void): () => void;
}

const MAX_SEQ_ENTRIES = 256;

function setBoundedSeq(map: Map<string, number>, key: string, seq: number): void {
  // Re-insert so Map iteration order tracks recency for cap eviction.
  map.delete(key);
  map.set(key, seq);
}

function createAppHostStore(): AppHostExternalStore {
  let snapshot = deriveAppHostState({ manifests: [], sessions: {} }, async () => {});
  const listeners = new Set<() => void>();
  let stop: (() => void) | null = null;

  const start = (control: AppHostExternalStore): (() => void) => {
    let cancelled = false;
    let raw: RawAppHost = { manifests: [], sessions: {} };
    // Monotonic sequence so an in-flight `refresh()` never overwrites or
    // resurrects sessions mutated or stopped by signals while ListRunningApps
    // was in flight.
    let mutationSeq = 0;
    const sessionMutationAt = new Map<string, number>();
    const removedAfterSeq = new Map<string, number>();
    const activeRefreshSeqs = new Map<number, number>();
    const dropTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const pruneSeqMaps = () => {
      let minSeq = mutationSeq;
      for (const seq of activeRefreshSeqs.keys()) {
        if (seq < minSeq) minSeq = seq;
      }
      for (const [sid, seq] of removedAfterSeq) {
        if (seq <= minSeq) removedAfterSeq.delete(sid);
      }
      for (const [sid, seq] of sessionMutationAt) {
        if (!(sid in raw.sessions) && seq <= minSeq) {
          sessionMutationAt.delete(sid);
        }
      }
      while (removedAfterSeq.size > MAX_SEQ_ENTRIES) {
        const oldest = removedAfterSeq.keys().next().value;
        if (oldest === undefined) break;
        removedAfterSeq.delete(oldest);
      }
      while (sessionMutationAt.size > MAX_SEQ_ENTRIES) {
        const oldest = sessionMutationAt.keys().next().value;
        if (oldest === undefined) break;
        sessionMutationAt.delete(oldest);
      }
    };

    const emit = () => control.set(deriveAppHostState(raw, refresh));
    const update = (patch: (r: RawAppHost) => RawAppHost) => {
      if (cancelled) return;
      raw = patch(raw);
      emit();
    };

    async function refresh(): Promise<void> {
      const seqAtStart = mutationSeq;
      activeRefreshSeqs.set(seqAtStart, (activeRefreshSeqs.get(seqAtStart) ?? 0) + 1);
      try {
        const [list, running] = await Promise.all([
          echoClient.callMethod(APPHOST_SERVICE, APPHOST_IFACE, 'ListApps', {}) as Promise<
            { apps: AppHostAppEntry[] } | undefined
          >,
          echoClient.callMethod(APPHOST_SERVICE, APPHOST_IFACE, 'ListRunningApps', {}) as Promise<
            { sessions: AppSession[] } | undefined
          >,
        ]);
        if (cancelled) return;
        update((r) => {
          let next = r;
          if (list?.apps) {
            next = {
              ...next,
              manifests: list.apps.map(
                (e): AppManifest => ({
                  id: e.id,
                  name: e.name,
                  exec: e.exec,
                  icon: e.icon,
                  version: e.version,
                  category: e.category,
                  entry: e.entry,
                })
              ),
            };
          }
          if (running?.sessions) {
            const sessions: Record<string, AppSession> = {};
            for (const s of running.sessions) {
              const removedSeq = removedAfterSeq.get(s.sessionId) ?? 0;
              if (removedSeq > seqAtStart) {
                continue;
              }
              const mutatedSeq = sessionMutationAt.get(s.sessionId) ?? 0;
              const current = r.sessions[s.sessionId];
              if (mutatedSeq > seqAtStart && current) {
                sessions[s.sessionId] = current;
              } else {
                sessions[s.sessionId] = s;
              }
            }
            for (const [sid, current] of Object.entries(r.sessions)) {
              if (!(sid in sessions) && (sessionMutationAt.get(sid) ?? 0) > seqAtStart) {
                sessions[sid] = current;
              }
            }
            next = { ...next, sessions };
          }
          return next;
        });
      } finally {
        const count = activeRefreshSeqs.get(seqAtStart) ?? 0;
        if (count <= 1) activeRefreshSeqs.delete(seqAtStart);
        else activeRefreshSeqs.set(seqAtStart, count - 1);
        pruneSeqMaps();
      }
    }

    const clearDropTimer = (sessionId: string) => {
      const prev = dropTimers.get(sessionId);
      if (prev !== undefined) {
        clearTimeout(prev);
        dropTimers.delete(sessionId);
      }
    };

    const upsert = (data: unknown) => {
      const s = data as AppSession;
      clearDropTimer(s.sessionId);
      mutationSeq += 1;
      setBoundedSeq(sessionMutationAt, s.sessionId, mutationSeq);
      removedAfterSeq.delete(s.sessionId);
      update((r) => ({ ...r, sessions: { ...r.sessions, [s.sessionId]: s } }));
      pruneSeqMaps();
    };
    const drop = (data: unknown) => {
      const s = data as AppSession;
      clearDropTimer(s.sessionId);
      mutationSeq += 1;
      setBoundedSeq(sessionMutationAt, s.sessionId, mutationSeq);
      update((r) => ({ ...r, sessions: { ...r.sessions, [s.sessionId]: s } }));
      pruneSeqMaps();
      // Keep crashed/stopped sessions briefly so the badge can be observed, then drop.
      const t = setTimeout(() => {
        if (dropTimers.get(s.sessionId) === t) {
          dropTimers.delete(s.sessionId);
        }
        mutationSeq += 1;
        setBoundedSeq(removedAfterSeq, s.sessionId, mutationSeq);
        setBoundedSeq(sessionMutationAt, s.sessionId, mutationSeq);
        update((r) => {
          const cur = r.sessions[s.sessionId];
          if (!cur || LIVE_SESSION(cur)) return r;
          const sessions = { ...r.sessions };
          delete sessions[s.sessionId];
          return { ...r, sessions };
        });
        pruneSeqMaps();
      }, 4000);
      dropTimers.set(s.sessionId, t);
    };

    emit();
    refresh().catch((err) => console.warn('[useAppHost] initial refresh failed', err));
    const unsubs = [
      echoClient.onSignal(APPHOST_IFACE, APPHOST_SIGNALS.starting, upsert),
      echoClient.onSignal(APPHOST_IFACE, APPHOST_SIGNALS.running, upsert),
      echoClient.onSignal(APPHOST_IFACE, APPHOST_SIGNALS.suspended, upsert),
      echoClient.onSignal(APPHOST_IFACE, APPHOST_SIGNALS.stopped, drop),
      echoClient.onSignal(APPHOST_IFACE, APPHOST_SIGNALS.crashed, drop),
      echoClient.onSignal(APPHOST_IFACE, APPHOST_SIGNALS.surfaceMapped, upsert),
      echoClient.onSignal(APPHOST_IFACE, APPHOST_SIGNALS.surfaceUnmapped, upsert),
    ];
    return () => {
      cancelled = true;
      dropTimers.forEach(clearTimeout);
      dropTimers.clear();
      activeRefreshSeqs.clear();
      sessionMutationAt.clear();
      removedAfterSeq.clear();
      unsubs.forEach((u) => {
        try {
          u();
        } catch {
          /* ignore */
        }
      });
    };
  };

  const control: AppHostExternalStore = {
    get: () => snapshot,
    peek: () => snapshot,
    set(next) {
      snapshot = next;
      for (const l of [...listeners]) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      if (!stop) stop = start(control);
      return () => {
        if (!listeners.delete(listener)) return;
        if (listeners.size === 0 && stop) {
          const s = stop;
          stop = null;
          s();
        }
      };
    },
  };
  return control;
}

/**
 * Shared reference-counted AppHost store backing both `useAppHostState()`
 * (React `AppHostProvider`) and Duyo's `bindAppHost` (`duyo/stores/apphost.ts`),
 * so mixing React islands and Duyo kinds never doubles the 7 AppHost signal
 * subscriptions or `ListApps`/`ListRunningApps` calls.
 */
export const appHostStore: AppHostExternalStore = createAppHostStore();

/**
 * The live AppHost state, built once. Mount `AppHostProvider` at the root and
 * read it with `useAppHost()`: the shell used to call this hook in every
 * component that wanted a session, and each call made its own `ListApps` +
 * `ListRunningApps` round trips and its own seven signal subscriptions.
 */
export function useAppHostState(): AppHostState {
  return useSyncExternalStore(appHostStore.subscribe, appHostStore.get, appHostStore.get);
}

export const AppHostContext = createContext<AppHostState | null>(null);

export function useAppHost(): AppHostState {
  const state = useContext(AppHostContext);
  // Throw rather than quietly start a private copy: that is the duplicate
  // subscription set the provider exists to remove.
  if (!state) throw new Error('useAppHost() needs an <AppHostProvider> above it');
  return state;
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

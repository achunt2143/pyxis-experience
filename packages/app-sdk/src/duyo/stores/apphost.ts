/**
 * The AppHost state as a store, for Duyo code-behind: the same data
 * `useAppHost()` exposes (manifests, sessions, derived lookups, relaunch,
 * refresh), over the same Echo calls and the same seven signals, one
 * subscription set shared by every `bindAppHost`.
 *
 * Not extracted from `useAppHostState`: that hook is built on `useEcho()`
 * (a hook) and React state, and refactoring it would risk the shell's
 * behaviour for no gain. `binders.apphost.test.tsx` renders the real hook and
 * this store against the same mock and compares them, so they cannot drift
 * unnoticed.
 */
import { echoClient } from '../../EchoClient';
import {
  APPHOST_IFACE,
  APPHOST_SERVICE,
  APPHOST_SIGNALS,
  NOVA_IFACE,
  type AppHostState,
  type LaunchResult,
} from '../../useEcho';
import type {
  AppHostAppEntry,
  AppLifecycleState,
  AppManifest,
  AppSession,
  AppSurfaceBinding,
} from '../../types';
import { createStore } from './store';

const NOVA_SERVICE = 'nova';

interface Raw {
  manifests: AppManifest[];
  sessions: Record<string, AppSession>;
}

const LIVE = (s: AppSession) => s.state === 'running' || s.state === 'starting' || s.state === 'suspended';

function sessionsOf(sessions: Record<string, AppSession>, appId: string): AppSession[] {
  return Object.values(sessions).filter((s) => s.appId === appId);
}

function pick(list: AppSession[]): AppSession | null {
  if (list.length === 0) return null;
  return list.find(LIVE) ?? [...list].sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
}

async function relaunch(sessions: Record<string, AppSession>, appId: string): Promise<LaunchResult | null> {
  for (const s of sessionsOf(sessions, appId)) {
    try {
      if (s.state === 'crashed' || s.state === 'stopped') continue;
      await echoClient.callMethod(APPHOST_SERVICE, APPHOST_IFACE, 'KillApp', { sessionId: s.sessionId });
    } catch {
      /* ignore */
    }
  }
  try {
    const res = (await echoClient.callMethod(NOVA_SERVICE, NOVA_IFACE, 'Launch', {
      appId,
      params: null,
    })) as LaunchResult | undefined;
    if (!res || !res.sessionId) return null;
    if (res.raised) {
      try {
        await echoClient.callMethod(NOVA_SERVICE, NOVA_IFACE, 'Focus', { appId });
      } catch {
        /* no mapped window yet */
      }
    }
    return res;
  } catch {
    return null;
  }
}

function derive(raw: Raw, refresh: () => Promise<void>): AppHostState {
  const { manifests, sessions } = raw;
  const surfaceBindings: Record<number, AppSurfaceBinding> = {};
  for (const s of Object.values(sessions)) {
    for (const surfaceId of s.surfaces ?? []) {
      surfaceBindings[surfaceId] = { surfaceId, sessionId: s.sessionId, appId: s.appId, pid: s.pid, state: s.state };
    }
  }
  const surfacesForApp = (appId: string): number[] =>
    sessionsOf(sessions, appId).flatMap((s) => s.surfaces ?? []);
  return {
    manifests,
    sessions,
    stateForApp: (appId): AppLifecycleState | null => pick(sessionsOf(sessions, appId))?.state ?? null,
    sessionForApp: (appId) => pick(sessionsOf(sessions, appId)),
    surfaceBindings,
    surfacesForApp,
    hasLiveSurface: (appId) => surfacesForApp(appId).length > 0,
    relaunch: (appId) => relaunch(sessions, appId),
    refresh,
  };
}

export const appHostStore = createStore<AppHostState>(
  () => derive({ manifests: [], sessions: {} }, async () => {}),
  (control) => {
    let cancelled = false;
    let raw: Raw = { manifests: [], sessions: {} };
    const emit = () => control.set(derive(raw, refresh));
    const update = (patch: (r: Raw) => Raw) => {
      if (cancelled) return;
      raw = patch(raw);
      emit();
    };

    async function refresh(): Promise<void> {
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
              }),
            ),
          };
        }
        if (running?.sessions) {
          const sessions: Record<string, AppSession> = {};
          for (const s of running.sessions) sessions[s.sessionId] = s;
          next = { ...next, sessions };
        }
        return next;
      });
    }

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const upsert = (data: unknown) => {
      const s = data as AppSession;
      update((r) => ({ ...r, sessions: { ...r.sessions, [s.sessionId]: s } }));
    };
    const drop = (data: unknown) => {
      const s = data as AppSession;
      update((r) => ({ ...r, sessions: { ...r.sessions, [s.sessionId]: s } }));
      // Keep crashed sessions briefly so the badge can be observed, then drop.
      const t = setTimeout(() => {
        timers.delete(t);
        update((r) => {
          if (!(s.sessionId in r.sessions)) return r;
          const sessions = { ...r.sessions };
          delete sessions[s.sessionId];
          return { ...r, sessions };
        });
      }, 4000);
      timers.add(t);
    };

    emit();
    refresh().catch((err) => console.warn('[bindAppHost] initial refresh failed', err));
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
      timers.forEach(clearTimeout);
      timers.clear();
      unsubs.forEach((u) => {
        try {
          u();
        } catch {
          /* ignore */
        }
      });
    };
  },
);

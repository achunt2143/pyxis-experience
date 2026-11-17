import { describe, it, expect, vi, afterEach } from 'vitest';
import { appHostStore, echoClient, APPHOST_IFACE, APPHOST_SIGNALS } from '../index';

describe('appHostStore refresh() vs. signal race', () => {
  const unsubs: Array<() => void> = [];

  afterEach(() => {
    unsubs.splice(0).forEach((u) => u());
    vi.restoreAllMocks();
  });

  it('preserves signal mutations and removals made while ListRunningApps is in flight', async () => {
    let resolveRunning!: (value: unknown) => void;
    const realCallMethod = echoClient.callMethod.bind(echoClient);
    let callCount = 0;

    vi.spyOn(echoClient, 'callMethod').mockImplementation((svc, iface, method, args) => {
      if (svc === 'appHost' && method === 'ListApps') {
        return Promise.resolve({ apps: [] });
      }
      if (svc === 'appHost' && method === 'ListRunningApps') {
        callCount += 1;
        if (callCount === 1) {
          return Promise.resolve({
            sessions: [
              {
                sessionId: 'sess-1',
                appId: 'files',
                pid: 100,
                startedAt: 1,
                state: 'running',
                surfaces: [],
              },
            ],
          });
        }
        return new Promise((resolve) => {
          resolveRunning = resolve;
        });
      }
      return realCallMethod(svc, iface, method, args);
    });

    const unsub = appHostStore.subscribe(() => {});
    unsubs.push(unsub);

    await vi.waitFor(() => expect(Object.keys(appHostStore.get().sessions)).toHaveLength(1));

    // Start a second refresh(), leaving ListRunningApps in flight.
    const refreshPromise = appHostStore.get().refresh();
    await new Promise((r) => setTimeout(r, 10));

    // While ListRunningApps is in flight, a signal updates sess-1 (suspended)
    // and launches sess-2 (terminal).
    await echoClient.emitSignal(APPHOST_IFACE, APPHOST_SIGNALS.suspended, {
      sessionId: 'sess-1',
      appId: 'files',
      pid: 100,
      startedAt: 1,
      state: 'suspended',
      surfaces: [],
    });
    await echoClient.emitSignal(APPHOST_IFACE, APPHOST_SIGNALS.running, {
      sessionId: 'sess-2',
      appId: 'terminal',
      pid: 101,
      startedAt: 2,
      state: 'running',
      surfaces: [],
    });

    // Now the stale ListRunningApps snapshot (from before the signals) resolves.
    resolveRunning({
      sessions: [
        {
          sessionId: 'sess-1',
          appId: 'files',
          pid: 100,
          startedAt: 1,
          state: 'running',
          surfaces: [],
        },
      ],
    });
    await refreshPromise;

    const sessions = appHostStore.get().sessions;
    const s1 = sessions['sess-1'];
    const s2 = sessions['sess-2'];
    expect(s1?.state).toBe('suspended');
    expect(s2?.appId).toBe('terminal');
  });

  it('repopulates running and suspended sessions from ListRunningApps after shell respawn', async () => {
    const realCallMethod = echoClient.callMethod.bind(echoClient);
    vi.spyOn(echoClient, 'callMethod').mockImplementation((svc, iface, method, args) => {
      if (svc === 'appHost' && method === 'ListApps') {
        return Promise.resolve({ apps: [] });
      }
      if (svc === 'appHost' && method === 'ListRunningApps') {
        return Promise.resolve({
          sessions: [
            {
              sessionId: 'respawn-1',
              appId: 'notes',
              pid: 201,
              startedAt: 10,
              state: 'running',
              surfaces: [11],
            },
            {
              sessionId: 'respawn-2',
              appId: 'files',
              pid: 202,
              startedAt: 11,
              state: 'suspended',
              surfaces: [],
            },
          ],
        });
      }
      return realCallMethod(svc, iface, method, args);
    });

    const unsub = appHostStore.subscribe(() => {});
    unsubs.push(unsub);
    await appHostStore.get().refresh();

    const sessions = appHostStore.get().sessions;
    expect(Object.keys(sessions).sort()).toEqual(['respawn-1', 'respawn-2']);
    expect(sessions['respawn-1']).toMatchObject({
      appId: 'notes',
      pid: 201,
      state: 'running',
      surfaces: [11],
    });
    expect(sessions['respawn-2']).toMatchObject({
      appId: 'files',
      pid: 202,
      state: 'suspended',
    });
  });

  it('contains AppCrashed to the crashed session without disrupting other running apps', async () => {
    vi.useFakeTimers();
    try {
      const realCallMethod = echoClient.callMethod.bind(echoClient);
      vi.spyOn(echoClient, 'callMethod').mockImplementation((svc, iface, method, args) => {
        if (svc === 'appHost' && method === 'ListApps') {
          return Promise.resolve({ apps: [] });
        }
        if (svc === 'appHost' && method === 'ListRunningApps') {
          return Promise.resolve({
            sessions: [
              {
                sessionId: 'sess-notes',
                appId: 'notes',
                pid: 301,
                startedAt: 20,
                state: 'running',
                surfaces: [21],
              },
              {
                sessionId: 'sess-files',
                appId: 'files',
                pid: 302,
                startedAt: 21,
                state: 'running',
                surfaces: [22],
              },
            ],
          });
        }
        return realCallMethod(svc, iface, method, args);
      });

      const unsub = appHostStore.subscribe(() => {});
      unsubs.push(unsub);
      await appHostStore.get().refresh();

      expect(appHostStore.get().sessions['sess-notes']?.state).toBe('running');
      expect(appHostStore.get().sessions['sess-files']?.state).toBe('running');

      await echoClient.emitSignal(APPHOST_IFACE, APPHOST_SIGNALS.crashed, {
        sessionId: 'sess-notes',
        appId: 'notes',
        pid: 301,
        startedAt: 20,
        state: 'crashed',
        surfaces: [],
      });

      expect(appHostStore.get().sessions['sess-notes']?.state).toBe('crashed');
      expect(appHostStore.get().sessions['sess-files']?.state).toBe('running');

      await vi.advanceTimersByTimeAsync(4100);
      expect(appHostStore.get().sessions['sess-notes']).toBeUndefined();
      expect(appHostStore.get().sessions['sess-files']?.state).toBe('running');
    } finally {
      vi.useRealTimers();
    }
  });

  it('prunes closed session sequence entries across many session lifecycles without breaking refresh()', async () => {
    vi.useFakeTimers();
    try {
      const realCallMethod = echoClient.callMethod.bind(echoClient);
      vi.spyOn(echoClient, 'callMethod').mockImplementation((svc, iface, method, args) => {
        if (svc === 'appHost' && method === 'ListApps') return Promise.resolve({ apps: [] });
        if (svc === 'appHost' && method === 'ListRunningApps') return Promise.resolve({ sessions: [] });
        return realCallMethod(svc, iface, method, args);
      });

      const unsub = appHostStore.subscribe(() => {});
      unsubs.push(unsub);
      await appHostStore.get().refresh();

      for (let i = 0; i < 300; i += 1) {
        const sid = `churn-${i}`;
        await echoClient.emitSignal(APPHOST_IFACE, APPHOST_SIGNALS.running, {
          sessionId: sid,
          appId: 'notes',
          pid: 1000 + i,
          startedAt: i,
          state: 'running',
          surfaces: [],
        });
        await echoClient.emitSignal(APPHOST_IFACE, APPHOST_SIGNALS.stopped, {
          sessionId: sid,
          appId: 'notes',
          pid: 1000 + i,
          startedAt: i,
          state: 'stopped',
          surfaces: [],
        });
      }

      await vi.advanceTimersByTimeAsync(4100);
      expect(Object.keys(appHostStore.get().sessions)).toHaveLength(0);

      // Subsequent refresh works cleanly after pruning.
      await appHostStore.get().refresh();
      expect(Object.keys(appHostStore.get().sessions)).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

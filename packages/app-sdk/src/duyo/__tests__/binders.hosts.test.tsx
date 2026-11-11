import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createRuntime, defineKind, type Component } from '@duyojs/duyo';
import { echoClient } from '../../EchoClient';
import { APPHOST_IFACE, APPHOST_SIGNALS, useAppHostState } from '../../useEcho';
import { INSTALLER_IFACE, INSTALLER_SIGNALS, useInstaller } from '../../useInstaller';
import { bindAppHost, bindInstaller } from '../binders';

/**
 * The binders reimplement the hooks' state over the same calls and signals
 * (see stores/apphost.ts, stores/installer.ts), so these tests run the real
 * hook and the binder against the same mock and require the same answers.
 */

defineKind({ name: 'BinderHosts.Host', kind: 'duyo.Component', published: { host: null, installer: null } });

const flush = () => act(() => vi.advanceTimersByTimeAsync(10));
const runtime = createRuntime();
const make = (): Component => runtime.create({ kind: 'BinderHosts.Host' });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const session = (over: Record<string, unknown> = {}) => ({
  sessionId: 's1',
  appId: 'files',
  pid: 42,
  state: 'running',
  startedAt: 1000,
  surfaces: [7],
  ...over,
});

describe('bindAppHost', () => {
  it('matches useAppHostState: manifests, sessions, derived lookups', async () => {
    const hook = renderHook(() => useAppHostState());
    const c = make();
    bindAppHost(c, 'host');
    await flush();
    type S = ReturnType<typeof useAppHostState>;
    const bound = () => c.get('host') as S;

    expect(bound().manifests.length).toBeGreaterThan(0);
    expect(bound().manifests).toEqual(hook.result.current.manifests);
    expect(bound().sessions).toEqual(hook.result.current.sessions);

    for (const data of [
      session(),
      session({ sessionId: 's2', appId: 'files', state: 'crashed', startedAt: 2000, surfaces: [] }),
      session({ sessionId: 's3', appId: 'notes', state: 'suspended', surfaces: [9, 10] }),
    ]) {
      await act(() => echoClient.emitSignal(APPHOST_IFACE, APPHOST_SIGNALS.running, data));
    }
    await flush();
    const h = hook.result.current;
    expect(bound().sessions).toEqual(h.sessions);
    expect(bound().surfaceBindings).toEqual(h.surfaceBindings);
    for (const id of ['files', 'notes', 'nothing']) {
      expect(bound().stateForApp(id)).toEqual(h.stateForApp(id));
      expect(bound().sessionForApp(id)).toEqual(h.sessionForApp(id));
      expect(bound().surfacesForApp(id)).toEqual(h.surfacesForApp(id));
      expect(bound().hasLiveSurface(id)).toBe(h.hasLiveSurface(id));
    }
    expect(bound().stateForApp('files')).toBe('running');

    // A stop keeps the session for 4 s, then drops it (as the hook does).
    await act(() => echoClient.emitSignal(APPHOST_IFACE, APPHOST_SIGNALS.stopped, session({ state: 'stopped' })));
    expect(bound().sessions.s1?.state).toBe('stopped');
    await act(() => vi.advanceTimersByTimeAsync(4001));
    expect(bound().sessions.s1).toBeUndefined();
    expect(hook.result.current.sessions.s1).toBeUndefined();
    hook.unmount();
  });

  it('stops listening, and cancels its timers, when the component is destroyed', async () => {
    const c = make();
    bindAppHost(c, 'host');
    await flush();
    await act(() => echoClient.emitSignal(APPHOST_IFACE, APPHOST_SIGNALS.crashed, session({ state: 'crashed' })));
    const spy = vi.spyOn(c, 'set');
    c.destroy();
    await act(() => echoClient.emitSignal(APPHOST_IFACE, APPHOST_SIGNALS.running, session({ sessionId: 'z' })));
    await act(() => vi.advanceTimersByTimeAsync(5000)); // the drop timer must not fire either
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('bindInstaller', () => {
  it('matches useInstaller: list, progress, terminal phase wins over late signals', async () => {
    const hook = renderHook(() => useInstaller());
    const c = make();
    bindInstaller(c, 'installer');
    await flush();
    type S = ReturnType<typeof useInstaller>;
    const bound = () => c.get('installer') as S;

    expect(bound().loading).toBe(false);
    expect(bound().packages.length).toBeGreaterThan(0);
    expect(bound().packages).toEqual(hook.result.current.packages);

    await act(() =>
      echoClient.emitSignal(INSTALLER_IFACE, INSTALLER_SIGNALS.progress, { phase: 'installing', message: 'm', package: 'p' }),
    );
    expect(bound().progress).toEqual(hook.result.current.progress);
    expect(bound().progress.phase).toBe('installing');

    const target = bound().packages.find((p) => !p.installed) ?? bound().packages[0]!;
    let a: unknown;
    let b: unknown;
    await act(async () => {
      const done = Promise.all([bound().install(target), hook.result.current.install(target)]);
      await vi.advanceTimersByTimeAsync(5000);
      [a, b] = await done;
    });
    expect(a).toEqual(b);
    expect(bound().progress).toEqual(hook.result.current.progress);
    expect(bound().progress.phase).toBe('done');
    expect(bound().result).toEqual(hook.result.current.result);
    expect(bound().packages).toEqual(hook.result.current.packages);

    await act(() =>
      echoClient.emitSignal(INSTALLER_IFACE, INSTALLER_SIGNALS.progress, { phase: 'registering', message: '', package: 'p' }),
    );
    expect(bound().progress.phase).toBe('done');
    expect(hook.result.current.progress.phase).toBe('done');

    act(() => bound().reset());
    expect(bound().progress.phase).toBe('idle');
    expect(bound().result).toBeNull();
    hook.unmount();
  });

  it('writes nothing after destroy', async () => {
    const c = make();
    bindInstaller(c, 'installer');
    await flush();
    const spy = vi.spyOn(c, 'set');
    c.destroy();
    await act(() =>
      echoClient.emitSignal(INSTALLER_IFACE, INSTALLER_SIGNALS.progress, { phase: 'installing', message: '', package: 'p' }),
    );
    expect(spy).not.toHaveBeenCalled();
  });
});

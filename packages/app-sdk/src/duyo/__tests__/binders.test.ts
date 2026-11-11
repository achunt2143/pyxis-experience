import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { createRuntime, defineKind, type Component, type Runtime } from '@duyojs/duyo';
import { echoClient } from '../../EchoClient';
import { setSetting } from '../../settingsBus';
import { settingDefault } from '../../settingsSchema';
import { asBoolean, oneOf } from '../../useSetting';
import { setVolume } from '../../audio';
import { setTimezone } from '../../clock';
import { resetMockTime } from '../../timeMock';
import { bindClock, bindSetting, bindSignal, bindVolume, onDestroy } from '../binders';

const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

const log: string[] = [];

defineKind({
  name: 'BinderTest.Base',
  kind: 'duyo.Component',
  published: { theme: 'x', flag: false, clock: null, volume: null },
  destroy() {
    log.push('base.destroy');
    return this.inherited();
  },
});
defineKind({
  name: 'BinderTest.Sub',
  kind: 'BinderTest.Base',
  published: { hits: 0 },
  onPing(payload: unknown) {
    log.push(`ping:${JSON.stringify(payload)}`);
  },
  destroy() {
    log.push('sub.destroy');
    return this.inherited();
  },
});
defineKind({ name: 'BinderTest.Plain', kind: 'duyo.Component', published: { flag: false } });

let runtime: Runtime;
const make = (kindName = 'BinderTest.Sub'): Component => runtime.create({ kind: kindName });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse('2026-11-09T20:00:30Z'));
  resetMockTime();
  log.length = 0;
  runtime = createRuntime();
});
afterEach(() => {
  runtime.destroy();
  vi.useRealTimers();
  resetMockTime();
});

describe('onDestroy', () => {
  it('runs after the kind chain, once, without breaking inherited()', () => {
    const c = make();
    onDestroy(c, () => log.push('cleanup'));
    onDestroy(c, () => log.push('cleanup2'));
    c.destroy();
    c.destroy();
    expect(log).toEqual(['sub.destroy', 'base.destroy', 'cleanup', 'cleanup2']);
    expect(c.destroyed).toBe(true);
  });

  it('works on a kind with no destroy override, and when a parent destroys the child', () => {
    const parent = runtime.create({ kind: 'duyo.Component', components: [{ kind: 'BinderTest.Plain', name: 'kid' }] });
    const kid = parent.$.kid as Component;
    onDestroy(kid, () => log.push('kid cleanup'));
    parent.destroy();
    expect(log).toEqual(['kid cleanup']);
  });

  it('can be cancelled', () => {
    const c = make();
    const cancel = onDestroy(c, () => log.push('never'));
    cancel();
    c.destroy();
    expect(log).toEqual(['sub.destroy', 'base.destroy']);
  });
});

describe('bindSetting', () => {
  it('writes the default, then the stored value, then each change', async () => {
    const c = make();
    bindSetting(c, 'pyxis.theme', 'theme', 'fallback', oneOf('light', 'dark', 'auto'));
    expect(c.get('theme')).toBe('fallback');
    await flush();
    expect(c.get('theme')).toBe(settingDefault('pyxis.theme'));
    await setSetting('pyxis.theme', 'dark');
    await flush();
    expect(c.get('theme')).toBe('dark');
    await setSetting('pyxis.theme', 'light');
    expect(c.get('theme')).toBe('light');
  });

  it('uses the fallback when parse rejects, and ignores other keys', async () => {
    const c = make();
    bindSetting(c, 'pyxis.clock24h', 'flag', true, asBoolean);
    await flush();
    const before = c.get('flag');
    await setSetting('pyxis.theme', 'dark');
    expect(c.get('flag')).toBe(before);
    await setSetting('pyxis.clock24h', true);
    expect(c.get('flag')).toBe(true);
    await setSetting('pyxis.clock24h', false);
    expect(c.get('flag')).toBe(false);
  });

  it('stops on unsubscribe', async () => {
    await setSetting('pyxis.theme', 'light');
    const c = make();
    const off = bindSetting(c, 'pyxis.theme', 'theme', 'x', oneOf('light', 'dark', 'auto'));
    await flush();
    off();
    await setSetting('pyxis.theme', 'dark');
    expect(c.get('theme')).not.toBe('dark');
  });

  it('writes nothing after destroy, and does not throw', async () => {
    const c = make();
    bindSetting(c, 'pyxis.theme', 'theme', 'x', oneOf('light', 'dark', 'auto'));
    await flush();
    const set = vi.spyOn(c, 'set');
    c.destroy();
    await setSetting('pyxis.theme', 'dark');
    await flush();
    expect(set).not.toHaveBeenCalled();
  });

  it('a late initial read does not overwrite a newer change', async () => {
    const c = make();
    let release!: (v: unknown) => void;
    const real = echoClient.callMethod.bind(echoClient);
    vi.spyOn(echoClient, 'callMethod').mockImplementation((s, i, m, a) =>
      m === 'get' && s === 'settings' ? new Promise((r) => (release = r)) : real(s, i, m, a),
    );
    bindSetting(c, 'pyxis.theme', 'theme', 'x', oneOf('light', 'dark', 'auto'));
    await echoClient.emitSignal('org.geckoOS.settings', 'SettingChanged', { key: 'pyxis.theme', value: 'dark' });
    release({ value: 'light' });
    await flush();
    expect(c.get('theme')).toBe('dark');
    vi.restoreAllMocks();
  });

  it('binding the same property twice replaces the first binding', async () => {
    const c = make();
    const spy = vi.spyOn(c, 'set');
    bindSetting(c, 'pyxis.theme', 'theme', 'x', oneOf('light', 'dark', 'auto'));
    bindSetting(c, 'pyxis.theme', 'theme', 'x', oneOf('light', 'dark', 'auto'));
    await flush();
    spy.mockClear();
    await echoClient.emitSignal('org.geckoOS.settings', 'SettingChanged', { key: 'pyxis.theme', value: 'light' });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('bindSignal', () => {
  it('calls the method with each payload, until unsubscribed or destroyed', async () => {
    const c = make();
    const off = bindSignal(c, 'org.test', 'Ping', 'onPing');
    await echoClient.emitSignal('org.test', 'Ping', { n: 1 });
    await echoClient.emitSignal('org.test', 'Ping', { n: 2 });
    expect(log).toEqual(['ping:{"n":1}', 'ping:{"n":2}']);
    off();
    await echoClient.emitSignal('org.test', 'Ping', { n: 3 });
    expect(log).toHaveLength(2);

    bindSignal(c, 'org.test', 'Ping', 'onPing');
    c.destroy();
    log.length = 0;
    await echoClient.emitSignal('org.test', 'Ping', { n: 4 });
    expect(log).toEqual([]);
  });

  it('throws for a method the component lacks', () => {
    expect(() => bindSignal(make(), 'org.test', 'Ping', 'nope')).toThrow(/nope/);
  });
});

describe('bindVolume', () => {
  it('reads, follows changes, and stops after destroy', async () => {
    const c = make();
    bindVolume(c, 'volume');
    expect(c.get('volume')).toBeNull();
    await flush();
    const first = c.get('volume') as { volume: number; muted: boolean };
    expect(typeof first.volume).toBe('number');
    await setVolume(first.volume === 33 ? 34 : 33);
    await flush();
    expect((c.get('volume') as { volume: number }).volume).toBe(first.volume === 33 ? 34 : 33);
    const spy = vi.spyOn(c, 'set');
    c.destroy();
    await setVolume(70);
    await flush();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('bindClock', () => {
  it("sets useClock's shape, ticks on the minute, follows the zone", async () => {
    await setTimezone('Asia/Kathmandu');
    const c = make();
    bindClock(c, 'clock');
    await flush();
    expect(c.get('clock')).toMatchObject({ synced: true, timezone: 'Asia/Kathmandu', utcOffsetMinutes: 345, hour: 1, minute: 45 });
    await advance(29_999);
    expect((c.get('clock') as { minute: number }).minute).toBe(45);
    await advance(1);
    expect((c.get('clock') as { minute: number }).minute).toBe(46);
    await setTimezone('UTC');
    await flush();
    expect(c.get('clock')).toMatchObject({ timezone: 'UTC', hour: 20 });
  });

  it('shares one loop between components and stops it with the last', async () => {
    const calls = vi.spyOn(echoClient, 'callMethod');
    const a = make();
    const b = make();
    bindClock(a, 'clock');
    bindClock(b, 'clock');
    await flush();
    expect(calls.mock.calls.filter((x) => x[2] === 'getClock')).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(1);
    a.destroy();
    expect(vi.getTimerCount()).toBe(1);
    const set = vi.spyOn(a, 'set');
    b.destroy();
    expect(vi.getTimerCount()).toBe(0);
    await advance(120_000);
    expect(set).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

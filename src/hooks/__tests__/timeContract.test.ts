import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { echoClient, TIME_IFACE, TIME_SIGNALS } from '@pyxis/app-sdk';
import { parseIso6709, resetMockTime } from '../../../packages/app-sdk/src/timeMock';

/**
 * Time contract tests: the SDK and its mock against echo's time service
 * (echo/src/services/time.rs). Same pattern as the nova and audio suites:
 * each shape is read out of the Rust source, so a field added to time.rs, a
 * method renamed in daemon.rs, or a bridge entry dropped fails here instead
 * of on a device.
 */

const GECKOS = resolve(__dirname, '../../../../geckos');
const TIME_RS = resolve(GECKOS, 'echo/src/services/time.rs');
const DAEMON_RS = resolve(GECKOS, 'echo/src/bin/daemon.rs');
const BRIDGE = resolve(GECKOS, 'gecko/patches/pyxis/toolkit/actors/PyxisBridgeParent.sys.mjs');
const ZONE_TAB = '/usr/share/zoneinfo/zone1970.tab';
const haveRust = existsSync(TIME_RS) && existsSync(DAEMON_RS) && existsSync(BRIDGE);

/** Field names of a Rust struct. time.rs keeps serde's names as written
 *  (snake_case), so these are the JSON keys. */
function rustStructFields(source: string, name: string): string[] {
  const at = source.indexOf(`pub struct ${name} {`);
  if (at < 0) throw new Error(`pub struct ${name} not found`);
  const body = source.slice(at, source.indexOf('\n}', at));
  return [...body.matchAll(/^\s+pub (\w+):/gm)].map((m) => m[1]);
}

/** The `time: { ... }` block of a bridge table, as name -> capability. */
function bridgeTimeBlock(source: string, table: string): Record<string, string | null> {
  const at = source.indexOf(`const ${table} = {`);
  const open = source.indexOf('\n  time: {', at);
  if (at < 0 || open < 0) throw new Error(`${table} has no time block`);
  const body = source.slice(open, source.indexOf('\n  },', open));
  return Object.fromEntries(
    [...body.matchAll(/^\s+(\w+): (null|"[^"]+"),/gm)].map((m) => [
      m[1],
      m[2] === 'null' ? null : m[2].slice(1, -1),
    ])
  );
}

const call = (method: string, args: Record<string, unknown> = {}) =>
  echoClient.callMethod('time', TIME_IFACE, method, args) as Promise<Record<string, unknown>>;

afterEach(() => resetMockTime());

describe('time mock matches the Rust service', () => {
  it.runIf(haveRust)('answers with exactly the fields time.rs serializes', async () => {
    const rust = readFileSync(TIME_RS, 'utf8');
    const keys = (o: object) => Object.keys(o).sort();

    const clockFields = rustStructFields(rust, 'Clock');
    expect(clockFields).toEqual(
      expect.arrayContaining(['epoch_ms', 'timezone', 'utc_offset_minutes', 'next_transition_ms'])
    );
    expect(keys(await call('getClock'))).toEqual([...clockFields].sort());

    const zoneFields = rustStructFields(rust, 'ZoneEntry');
    const { timezones } = (await call('listTimezones')) as { timezones: object[] };
    expect(timezones.length).toBeGreaterThan(10);
    expect(keys(timezones[0])).toEqual([...zoneFields].sort());

    const locationFields = rustStructFields(rust, 'Location');
    expect(keys(await call('getLocation'))).toEqual([...locationFields].sort());

    const changeFields = rustStructFields(rust, 'TimezoneChange');
    expect(keys(await call('setTimezone', { timezone: 'Europe/Paris' }))).toEqual([...changeFields].sort());
  });

  it.runIf(haveRust)('uses the location sources time.rs produces', () => {
    const rust = readFileSync(TIME_RS, 'utf8');
    const sources = [...rust.matchAll(/source: "(\w+)"/g)].map((m) => m[1]);
    expect([...new Set(sources)].sort()).toEqual(['manual', 'none', 'zone']);
  });

  it.runIf(haveRust)('calls only methods echo-daemon registers, and uses its signal name', () => {
    const daemon = readFileSync(DAEMON_RS, 'utf8');
    const rust = readFileSync(TIME_RS, 'utf8');
    const registered = [...daemon.matchAll(/TIME_IFACE,\s*"(\w+)"/g)].map((m) => m[1]);
    expect(registered.sort()).toEqual(['getClock', 'getLocation', 'listTimezones', 'setTimezone']);
    expect(rust.match(/pub const TIME_IFACE: &str = "([^"]+)";/)?.[1]).toBe(TIME_IFACE);
    expect(rust.match(/pub const SIGNAL_TIMEZONE_CHANGED: &str = "([^"]+)";/)?.[1]).toBe(
      TIME_SIGNALS.timezoneChanged
    );
  });

  it.runIf(haveRust)('is reachable through the bridge: reads open, setTimezone privileged', () => {
    const bridge = readFileSync(BRIDGE, 'utf8');
    expect(bridgeTimeBlock(bridge, 'BRIDGE_CAPABILITIES')).toEqual({
      getClock: null,
      listTimezones: null,
      getLocation: null,
      setTimezone: 'settings:write',
    });
    expect(bridgeTimeBlock(bridge, 'BRIDGE_SIGNALS')).toEqual({ [TIME_SIGNALS.timezoneChanged]: null });
  });
});

describe('time mock', () => {
  it('parses ISO 6709 in both of zone1970.tab forms', () => {
    expect(parseIso6709('+3430-11815')).toEqual([34.5, -118.25]);
    const [lat, lon] = parseIso6709('+340308-1181434')!;
    expect(lat).toBeCloseTo(34 + 3 / 60 + 8 / 3600, 9);
    expect(lon).toBeCloseTo(-(118 + 14 / 60 + 34 / 3600), 9);
    for (const bad of ['', '3430-11815', '+3430', '+3470-11815', '+3430-1181434', '+9500+00000']) {
      expect(parseIso6709(bad)).toBeNull();
    }
  });

  it.runIf(existsSync(ZONE_TAB))('offers only real zone1970.tab rows, coordinates included', async () => {
    const tab = new Map(
      readFileSync(ZONE_TAB, 'utf8')
        .split('\n')
        .filter((l) => l && !l.startsWith('#'))
        .map((l) => l.split('\t'))
        .map(([codes, coords, id]) => [id, { countries: codes.split(','), at: parseIso6709(coords) }])
    );
    const { timezones } = (await call('listTimezones')) as {
      timezones: { id: string; countries: string[]; lat: number; lon: number }[];
    };
    for (const z of timezones) {
      const row = tab.get(z.id);
      expect(row, z.id).toBeDefined();
      expect(z.countries).toEqual(row!.countries);
      expect([z.lat, z.lon]).toEqual(row!.at);
    }
  });

  it('changes zone, signals it, and refuses a made-up one', async () => {
    const heard: unknown[] = [];
    const off = echoClient.onSignal(TIME_IFACE, TIME_SIGNALS.timezoneChanged, (d) => heard.push(d));

    const change = await call('setTimezone', { timezone: 'Asia/Kathmandu' });
    expect(change).toEqual({ timezone: 'Asia/Kathmandu', utc_offset_minutes: 345 });
    expect(heard).toEqual([change]);
    const clock = await call('getClock');
    expect(clock.timezone).toBe('Asia/Kathmandu');
    expect(clock.next_transition_ms).toBeNull();
    expect(await call('getLocation')).toMatchObject({ source: 'zone', label: 'Kathmandu' });

    const refused = await call('setTimezone', { timezone: 'Mars/Olympus_Mons' });
    expect(refused.error).toMatch(/unknown time zone/);
    expect(heard).toHaveLength(1);
    off();
  });

  it('finds the next DST transition', async () => {
    await call('setTimezone', { timezone: 'America/Los_Angeles' });
    const clock = await call('getClock');
    const next = clock.next_transition_ms as number;
    expect(next).toBeGreaterThan(clock.epoch_ms as number);
    // A minute either side of it, the offset differs by an hour.
    const { intlOffsetMinutes } = await import('../../../packages/app-sdk/src/timeMock');
    expect(Math.abs(intlOffsetMinutes('America/Los_Angeles', next - 60_000) - intlOffsetMinutes('America/Los_Angeles', next + 60_000))).toBe(60);
  });
});

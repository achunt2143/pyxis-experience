import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SETTING_CHANGED_SIGNAL,
  SETTING_DEFAULTS,
  SETTING_KEYS,
  SETTING_SCHEMA,
  SETTINGS_IFACE,
  asBoolean,
  echoClient,
  getSetting,
  onSettingChange,
  resolveTheme,
  setSetting,
  useSetting,
  validateSetting,
  type SettingChange,
  type SettingKind,
} from '@pyxis/app-sdk';

/**
 * Settings contract tests: the SDK's keys, defaults and checks against
 * echo's settings schema, and the bus's change reporting. Same pattern as
 * the nova suite: the schema is read out of the Rust source, so a key added
 * to schema.rs without the SDK learning it (or a default changed on one
 * side only) fails here instead of on a device.
 */

const SCHEMA_RS = resolve(__dirname, '../../../../geckos/echo/src/services/settings/schema.rs');
const BRIDGE = resolve(
  __dirname,
  '../../../../geckos/gecko/patches/pyxis/toolkit/actors/PyxisBridgeParent.sys.mjs'
);
const haveRust = existsSync(SCHEMA_RS);

interface RustSpec {
  key: string;
  kind: SettingKind;
  default: unknown;
}

/** The strings of a `pub const NAME: &[&str] = &[...];`. */
function rustStrConst(source: string, name: string): string[] {
  const m = source.match(new RegExp(`pub const ${name}: &\\[&str\\] = &\\[([^\\]]*)\\];`));
  if (!m) throw new Error(`pub const ${name} not found in schema.rs`);
  return [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]);
}

function parseKind(source: string, text: string): SettingKind {
  const t = text.trim();
  let m = t.match(/^Kind::OneOf\(&\[([^\]]*)\]\)$/);
  if (m) return { type: 'oneOf', values: [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]) };
  m = t.match(/^Kind::OneOf\(([A-Z_]+)\)$/);
  if (m) return { type: 'oneOf', values: rustStrConst(source, m[1]) };
  if (t === 'Kind::Bool') return { type: 'bool' };
  if (t === 'Kind::Location') return { type: 'location' };
  m = t.match(
    /^Kind::Number\s*\{\s*min:\s*(-?[\d.]+),\s*max:\s*(-?[\d.]+),\s*integer:\s*(true|false),\s*nullable:\s*(true|false)\s*\}$/
  );
  if (m) {
    return { type: 'number', min: Number(m[1]), max: Number(m[2]), integer: m[3] === 'true', nullable: m[4] === 'true' };
  }
  throw new Error(`unparsed kind: ${t}`);
}

function parseDefault(text: string): unknown {
  const t = text.trim();
  let m = t.match(/^Default::Str\("([^"]*)"\)$/);
  if (m) return m[1];
  m = t.match(/^Default::Bool\((true|false)\)$/);
  if (m) return m[1] === 'true';
  m = t.match(/^Default::Int\((-?\d+)\)$/);
  if (m) return Number(m[1]);
  if (t === 'Default::Null') return null;
  throw new Error(`unparsed default: ${t}`);
}

/** `SCHEMA`'s entries: `Spec { key: "...", kind: Kind::..., default: Default::... }`. */
function rustSchema(source: string): RustSpec[] {
  const at = source.indexOf('pub const SCHEMA: &[Spec] = &[');
  if (at < 0) throw new Error('pub const SCHEMA not found in schema.rs');
  const body = source.slice(at, source.indexOf('\n];', at));
  const entries = [
    ...body.matchAll(/Spec\s*\{\s*key:\s*"([^"]+)",\s*kind:\s*([\s\S]*?),\s*default:\s*(Default::[^}]*?)\s*\},/g),
  ];
  return entries.map((e) => ({ key: e[1], kind: parseKind(source, e[2]), default: parseDefault(e[3]) }));
}

describe('settings SDK matches the Rust schema', () => {
  it.runIf(haveRust)('SETTING_KEYS, SETTING_SCHEMA and schema.rs list the same keys', () => {
    const rust = rustSchema(readFileSync(SCHEMA_RS, 'utf8'));
    // A parse that found nothing would pass the comparisons vacuously.
    expect(rust.length).toBeGreaterThanOrEqual(11);
    const rustKeys = rust.map((s) => s.key).sort();
    expect([...Object.values(SETTING_KEYS)].sort()).toEqual(rustKeys);
    expect(Object.keys(SETTING_SCHEMA).sort()).toEqual(rustKeys);
  });

  it.runIf(haveRust)('every key has the same kind and default on both sides', () => {
    for (const spec of rustSchema(readFileSync(SCHEMA_RS, 'utf8'))) {
      expect(SETTING_SCHEMA[spec.key].kind, spec.key).toEqual(spec.kind);
      expect(SETTING_DEFAULTS[spec.key], spec.key).toEqual(spec.default);
    }
  });

  it('the plan\'s new keys and defaults are there', () => {
    expect(SETTING_DEFAULTS[SETTING_KEYS.wallpaper]).toBe('daylight');
    expect(SETTING_DEFAULTS[SETTING_KEYS.wallpaperMotion]).toBe('flow');
    expect(SETTING_DEFAULTS[SETTING_KEYS.wallpaperPinnedTime]).toBeNull();
    expect(SETTING_DEFAULTS[SETTING_KEYS.location]).toBeNull();
    expect(SETTING_DEFAULTS[SETTING_KEYS.clock24h]).toBe(false);
    expect(validateSetting(SETTING_KEYS.theme, 'auto')).toBeNull();
  });

  it('the launch bar sits at the bottom unless the rail is picked', () => {
    expect(SETTING_KEYS.launchBarPosition).toBe('pyxis.launchBar.position');
    expect(SETTING_DEFAULTS[SETTING_KEYS.launchBarPosition]).toBe('bottom');
    expect(validateSetting(SETTING_KEYS.launchBarPosition, 'left')).toBeNull();
    expect(validateSetting(SETTING_KEYS.launchBarPosition, 'right')).toContain(SETTING_KEYS.launchBarPosition);
  });

  it('validateSetting refuses what echo refuses, naming the key', () => {
    const bad: [string, unknown][] = [
      [SETTING_KEYS.theme, 42],
      [SETTING_KEYS.wallpaper, 'vaporwave'],
      [SETTING_KEYS.wallpaperPinnedTime, 1440],
      [SETTING_KEYS.wallpaperPinnedTime, 12.5],
      [SETTING_KEYS.clock24h, 'true'],
      [SETTING_KEYS.location, { lat: 91, lon: 0, label: 'x', source: 'manual' }],
      [SETTING_KEYS.location, { lat: 0, lon: 0, label: 'x', source: 'gps' }],
      ['pyxis.nonsense', true],
    ];
    for (const [key, value] of bad) {
      expect(validateSetting(key, value), `${key} = ${JSON.stringify(value)}`).toContain(key);
    }
    expect(validateSetting('com.example.app.thing', { any: 1 })).toBeNull();
    expect(
      validateSetting(SETTING_KEYS.location, { lat: 34.05, lon: -118.24, label: 'Los Angeles', source: 'zone' })
    ).toBeNull();
  });

  it.runIf(existsSync(BRIDGE))('the bridge delivers settings.SettingChanged to every app', () => {
    const src = readFileSync(BRIDGE, 'utf8');
    const table = src.slice(src.indexOf('const BRIDGE_SIGNALS = {'), src.indexOf('\n};', src.indexOf('const BRIDGE_SIGNALS = {')));
    expect(table).toMatch(/settings:\s*\{\s*(\/\/[^\n]*\n\s*)*SettingChanged:\s*null,/);
  });
});

describe('settings bus (mock)', () => {
  beforeEach(async () => {
    window.localStorage.clear();
  });

  it('an absent key reads as its default, and a bad value is refused', async () => {
    expect(await getSetting(SETTING_KEYS.wallpaper)).toBe('daylight');
    expect(await getSetting(SETTING_KEYS.wallpaperPinnedTime)).toBeNull();
    expect(await getSetting('com.example.unset')).toBeNull();
    await expect(setSetting(SETTING_KEYS.theme, 42)).rejects.toThrow(/pyxis\.theme/);
    await setSetting(SETTING_KEYS.theme, 'auto');
    expect(await getSetting(SETTING_KEYS.theme)).toBe('auto');
  });

  it('a change heard on the signal, the channel and the local event is reported once', async () => {
    const heard: SettingChange[] = [];
    const off = onSettingChange((c) => heard.push(c));
    await setSetting(SETTING_KEYS.clock24h, true);
    // The BroadcastChannel copy arrives a task later.
    await new Promise((r) => setTimeout(r, 50));
    expect(heard.map((c) => [c.key, c.value])).toEqual([[SETTING_KEYS.clock24h, true]]);

    // A different value is a new change; the same value again soon after is not.
    await setSetting(SETTING_KEYS.clock24h, false);
    await new Promise((r) => setTimeout(r, 50));
    expect(heard.map((c) => c.value)).toEqual([true, false]);
    off();
  });

  it('hears a change made by another app, through Echo\'s signal alone', async () => {
    const heard: SettingChange[] = [];
    const off = onSettingChange((c) => heard.push(c));
    await echoClient.emitSignal(SETTINGS_IFACE, SETTING_CHANGED_SIGNAL, {
      key: SETTING_KEYS.wallpaper,
      value: 'forest',
      previous: 'daylight',
      exists: true,
    });
    expect(heard).toEqual([{ key: SETTING_KEYS.wallpaper, value: 'forest', previous: 'daylight', exists: true }]);
    off();
  });

  it('useSetting starts at the fallback, reads the stored value, and follows changes', async () => {
    await setSetting(SETTING_KEYS.showBatteryPercent, false);
    const { result } = renderHook(() => useSetting(SETTING_KEYS.showBatteryPercent, true, asBoolean));
    await waitFor(() => expect(result.current).toBe(false));
    const emit = (value: unknown) =>
      act(async () => {
        await echoClient.emitSignal(SETTINGS_IFACE, SETTING_CHANGED_SIGNAL, {
          key: SETTING_KEYS.showBatteryPercent,
          value,
        });
      });
    // A value the parser rejects reads as the fallback.
    await emit('garbage');
    expect(result.current).toBe(true);
    await emit(false);
    expect(result.current).toBe(false);
    // So does null (a deleted app key).
    await emit(null);
    expect(result.current).toBe(true);
  });

  it('useSetting reads a pyxis.* default with nothing stored', async () => {
    const { result } = renderHook(() => useSetting<string>(SETTING_KEYS.wallpaper, 'aurora'));
    await waitFor(() => expect(result.current).toBe('daylight'));
  });
});

describe('Auto theme', () => {
  const LA = { lat: 34.05, lon: -118.24 };
  // 2026-06-21, Los Angeles (UTC-7): civil dusk about 20:37, civil dawn about 05:13.
  const at = (hh: number, mm: number) => Date.UTC(2026, 5, 21, hh + 7, mm);

  it('is dark from civil dusk to civil dawn where the device is', () => {
    expect(resolveTheme('auto', at(12, 0), -420, LA)).toBe('light');
    expect(resolveTheme('auto', at(20, 15), -420, LA)).toBe('light');
    expect(resolveTheme('auto', at(21, 0), -420, LA)).toBe('dark');
    expect(resolveTheme('auto', at(3, 0), -420, LA)).toBe('dark');
    expect(resolveTheme('auto', at(5, 45), -420, LA)).toBe('light');
  });

  it('with no location, follows the stand-in day on the local clock', () => {
    expect(resolveTheme('auto', at(13, 0), -420, null)).toBe('light');
    expect(resolveTheme('auto', at(23, 0), -420, null)).toBe('dark');
  });

  it('light and dark are what they say', () => {
    expect(resolveTheme('dark', at(12, 0), -420, LA)).toBe('dark');
    expect(resolveTheme('light', at(0, 0), -420, LA)).toBe('light');
  });
});

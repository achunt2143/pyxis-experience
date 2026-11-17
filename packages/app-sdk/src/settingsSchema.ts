/**
 * The system's own settings (`pyxis.*`): each key's type, allowed values and
 * default. This mirrors `SCHEMA` in echo/src/services/settings/schema.rs,
 * which is what Echo enforces (`set` refuses a bad value; `get` answers an
 * absent key with its default and `exists: false`). The copy here is for
 * the dev server's mock, which has no Echo behind it, and for code that wants
 * a default without a round trip. The contract test
 * (src/hooks/__tests__/settingsContract.test.ts) parses the Rust table and
 * fails when the two drift.
 */

export type SettingKind =
  | { type: 'oneOf'; values: readonly string[] }
  | { type: 'bool' }
  | { type: 'number'; min: number; max: number; integer: boolean; nullable: boolean }
  | { type: 'location' };

export interface SettingSpec {
  kind: SettingKind;
  default: unknown;
}

export type ThemePreference = 'light' | 'dark' | 'auto';
export type WallpaperMotion = 'flow' | 'still';
export type CursorSize = 'default' | 'large' | 'xlarge';
export const CURSOR_SIZES: readonly CursorSize[] = ['default', 'large', 'xlarge'];
/** `pyxis.launchBar.position`: the launch bar along the bottom edge, or as a rail down the left. */
export type LaunchBarPosition = 'bottom' | 'left';
/** `pyxis.launchBar.position`'s values, in the order the Settings app offers them. */
export const LAUNCH_BAR_POSITIONS: readonly LaunchBarPosition[] = ['bottom', 'left'];

/** `pyxis.location`: null means "from the time zone". */
export interface PyxisLocation {
  lat: number;
  lon: number;
  label: string;
  source: 'zone' | 'manual';
}

export const LOCATION_LABEL_MAX = 120;

const oneOf = (...values: string[]): SettingKind => ({ type: 'oneOf', values });
const number = (min: number, max: number, integer = false, nullable = false): SettingKind => ({
  type: 'number',
  min,
  max,
  integer,
  nullable,
});

export const SETTING_SCHEMA: Readonly<Record<string, SettingSpec>> = {
  'pyxis.theme': { kind: oneOf('light', 'dark', 'auto'), default: 'light' },
  'pyxis.wallpaper': { kind: oneOf('daylight', 'aurora', 'sunset', 'forest', 'mochi'), default: 'daylight' },
  'pyxis.wallpaper.motion': { kind: oneOf('flow', 'still'), default: 'flow' },
  'pyxis.wallpaper.pinnedTime': { kind: number(0, 1439, true, true), default: null },
  'pyxis.location': { kind: { type: 'location' }, default: null },
  'pyxis.clock24h': { kind: { type: 'bool' }, default: false },
  'pyxis.showBatteryPercent': { kind: { type: 'bool' }, default: true },
  'pyxis.volume': { kind: number(0, 100), default: 50 },
  'pyxis.brightness': { kind: number(0, 100), default: 80 },
  'pyxis.dnd': { kind: { type: 'bool' }, default: false },
  'pyxis.animations': { kind: oneOf('full', 'reduced', 'off'), default: 'full' },
  'pyxis.launchBar.position': { kind: oneOf('bottom', 'left'), default: 'bottom' },
  'pyxis.lock.after': { kind: number(1, 120, true, true), default: 10 },
  'pyxis.lock.onSleep': { kind: { type: 'bool' }, default: true },
  'pyxis.lock.notifications': { kind: oneOf('hidden', 'count', 'full'), default: 'count' },
  'pyxis.accessibility.textScale': { kind: number(75, 150, true), default: 100 },
  'pyxis.accessibility.highContrast': { kind: { type: 'bool' }, default: false },
  'pyxis.accessibility.reduceTransparency': { kind: { type: 'bool' }, default: false },
  'pyxis.accessibility.cursorSize': { kind: oneOf('default', 'large', 'xlarge'), default: 'default' },
};

/** Every listed key's default, the same map Echo's `getAll` returns as `defaults`. */
export const SETTING_DEFAULTS: Readonly<Record<string, unknown>> = Object.fromEntries(
  Object.entries(SETTING_SCHEMA).map(([key, spec]) => [key, spec.default])
);

/** What `get` answers for an absent key: its default, or null for an app's own key. */
export function settingDefault(key: string): unknown {
  return Object.hasOwn(SETTING_SCHEMA, key) ? SETTING_SCHEMA[key].default : null;
}

/** Echo's check, in TS: null when `value` is fine for `key`, else why not (naming the key). */
export function validateSetting(key: string, value: unknown): string | null {
  if (!key) return 'a setting needs a non-empty `key`';
  if (!Object.hasOwn(SETTING_SCHEMA, key)) {
    return key.startsWith('pyxis.')
      ? `unknown setting ${key}: pyxis.* keys are the system's own, and this one is not one of them`
      : null;
  }
  const { kind } = SETTING_SCHEMA[key];
  const shown = JSON.stringify(value);
  switch (kind.type) {
    case 'oneOf':
      return typeof value === 'string' && kind.values.includes(value)
        ? null
        : `${key} must be one of ${kind.values.join(', ')}, not ${shown}`;
    case 'bool':
      return typeof value === 'boolean' ? null : `${key} must be true or false, not ${shown}`;
    case 'number': {
      if (value === null && kind.nullable) return null;
      const ok =
        typeof value === 'number' &&
        Number.isFinite(value) &&
        value >= kind.min &&
        value <= kind.max &&
        (!kind.integer || Number.isInteger(value));
      return ok
        ? null
        : `${key} must be ${kind.integer ? 'a whole number' : 'a number'} from ${kind.min} to ${kind.max}${
            kind.nullable ? ' (or null)' : ''
          }, not ${shown}`;
    }
    case 'location':
      return isPyxisLocation(value) || value === null
        ? null
        : `${key} must be null or {lat, lon, label, source}, not ${shown}`;
  }
}

export function isPyxisLocation(value: unknown): value is PyxisLocation {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const inRange = (n: unknown, limit: number) => typeof n === 'number' && n >= -limit && n <= limit;
  return (
    Object.keys(v).every((k) => ['lat', 'lon', 'label', 'source'].includes(k)) &&
    inRange(v.lat, 90) &&
    inRange(v.lon, 180) &&
    typeof v.label === 'string' &&
    v.label.length <= LOCATION_LABEL_MAX &&
    (v.source === 'zone' || v.source === 'manual')
  );
}

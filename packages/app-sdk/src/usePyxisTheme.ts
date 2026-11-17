import { useEffect } from 'react';
import { ANIMATION_MODES, type AnimationMode } from './animations';
import { useClock, useLocation } from './clock';
import { SETTING_KEYS } from './settingsBus';
import { CURSOR_SIZES, type CursorSize, type PyxisLocation, type ThemePreference } from './settingsSchema';
import { oneOf, useSetting } from './useSetting';
import { daylightSun } from './wallpaper/daylight';

export type PyxisTheme = 'light' | 'dark';

/** Auto is dark from the end of civil dusk to the start of civil dawn: the sun 6° below the horizon. */
export const AUTO_DARK_BELOW_DEG = -6;

/**
 * The theme a preference comes to at an instant. `auto` asks the sun: with
 * a location, its real elevation there; without one, the Daylight
 * wallpaper's stand-in day (sunrise 06:30, sunset 18:30 on the local clock),
 * so the theme and the wallpaper agree on whether it is night.
 */
export function resolveTheme(
  preference: ThemePreference,
  nowMs: number,
  utcOffsetMinutes: number,
  location: Pick<PyxisLocation, 'lat' | 'lon'> | null
): PyxisTheme {
  if (preference !== 'auto') return preference;
  const { elevation } = daylightSun({ nowMs, utcOffsetMinutes, location });
  return elevation < AUTO_DARK_BELOW_DEG ? 'dark' : 'light';
}

const parsePreference = oneOf<ThemePreference>('light', 'dark', 'auto');

/**
 * usePyxisTheme
 * -------------
 * The theme to draw, `light` or `dark`, from the user's `pyxis.theme`
 * (`light`, `dark` or `auto`), read through `useSetting`. A change made in
 * Settings reaches every open app, whatever its origin, through Echo's
 * `SettingChanged` signal, on a vela whose bridge lists it; on an older
 * vela only documents of Settings' own origin follow live, and the rest
 * pick the theme up at their next launch.
 *
 * `auto` is resolved here from Echo's clock and the device's location
 * (`useClock`, `useLocation`: the `pyxis.location` setting, else the time
 * zone's city), and again at every minute the clock ticks, so the theme
 * turns at each civil twilight.
 */
export function usePyxisTheme(defaultTheme: PyxisTheme = 'light'): PyxisTheme {
  const preference = useSetting<ThemePreference>(SETTING_KEYS.theme, defaultTheme, parsePreference);
  const clock = useClock();
  const place = useLocation();
  const location = place && place.lat !== null && place.lon !== null ? { lat: place.lat, lon: place.lon } : null;
  return resolveTheme(preference, clock.epochMs, clock.utcOffsetMinutes, location);
}

const parseAnimationMode = oneOf<AnimationMode>(...ANIMATION_MODES);

/**
 * usePyxisAnimationMode
 * ---------------------
 * The user's `pyxis.animations` mode (`'full' | 'reduced' | 'off'`), read
 * through `useSetting` and synced onto `document.documentElement.dataset.motion`
 * (`data-motion="full|reduced|off"`).
 */
export function usePyxisAnimationMode(): AnimationMode {
  const mode = useSetting<AnimationMode>(SETTING_KEYS.animations, 'full', parseAnimationMode);
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.motion = mode;
    }
  }, [mode]);
  return mode;
}

const parseTextScale = (raw: unknown): number | undefined =>
  typeof raw === 'number' && Number.isInteger(raw) && raw >= 75 && raw <= 150 ? raw : undefined;
const parseBool = (raw: unknown): boolean | undefined => (typeof raw === 'boolean' ? raw : undefined);
const parseCursorSize = oneOf<CursorSize>(...CURSOR_SIZES);

/**
 * Syncs `pyxis.accessibility.*` settings (`textScale`, `highContrast`,
 * `reduceTransparency`, `cursorSize`) onto `document.documentElement`.
 */
export function usePyxisAccessibility() {
  const textScale = useSetting<number>(SETTING_KEYS.textScale, 100, parseTextScale);
  const highContrast = useSetting<boolean>(SETTING_KEYS.highContrast, false, parseBool);
  const reduceTransparency = useSetting<boolean>(SETTING_KEYS.reduceTransparency, false, parseBool);
  const cursorSize = useSetting<CursorSize>(SETTING_KEYS.cursorSize, 'default', parseCursorSize);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.dataset.textScale = String(textScale);
    root.style.fontSize = textScale === 100 ? '' : `${textScale}%`;
    root.dataset.highContrast = String(highContrast);
    root.dataset.reduceTransparency = String(reduceTransparency);
    root.dataset.cursorSize = cursorSize;
    if (document.body) {
      document.body.dataset.cursorSize = cursorSize;
    }
  }, [textScale, highContrast, reduceTransparency, cursorSize]);

  return { textScale, highContrast, reduceTransparency, cursorSize };
}

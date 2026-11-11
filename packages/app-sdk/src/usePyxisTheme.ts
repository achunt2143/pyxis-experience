import { useClock, useLocation } from './clock';
import { SETTING_KEYS } from './settingsBus';
import type { PyxisLocation, ThemePreference } from './settingsSchema';
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

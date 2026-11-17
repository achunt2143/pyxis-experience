import { useEffect, useMemo } from 'react';
import { useClock, useLocation } from './clock';
import { applyShellTint, shellTint, type ShellTint } from './identity';
import { SETTING_KEYS } from './settingsBus';
import type { ThemePreference } from './settingsSchema';
import { resolveTheme } from './usePyxisTheme';
import { oneOf, useSetting, type SettingParser } from './useSetting';
import { DEFAULT_WALLPAPER_ID } from './wallpapers';
import { skyFor } from './wallpaper/engine';

const asWallpaper: SettingParser<string> = (raw) => (typeof raw === 'string' ? raw : undefined);
const asPinnedTime: SettingParser<number | null> = (raw) =>
  typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw < 1440 ? raw : undefined;
const asTheme = oneOf<ThemePreference>('light', 'dark', 'auto');

export interface ShellTintOptions {
  /**
   * Minutes after local midnight to tint for, as DynamicWallpaper's `time`:
   * undefined (the default) reads `pyxis.wallpaper.pinnedTime`, null
   * follows the day.
   */
  time?: number | null;
  /** Where to write the variables. Default `document.documentElement`; null writes nothing. */
  target?: HTMLElement | null;
}

/**
 * useShellTint
 * ------------
 * The shell's tint (see `shellTint`) for the wallpaper on screen, written
 * as the `--px-material`, `--px-ink`, … variables (SHELL_TINT_VARS) on the
 * document root, and returned.
 *
 * It draws the palette the way the wallpaper does (`skyFor`: Daylight at
 * the device's clock and place, or at `pyxis.wallpaper.pinnedTime`; a
 * fixed palette as it is), so it needs no IPC of its own and each document
 * (Bloom's desktop and overlay) works it out alike. `dark` is `pyxis.theme`,
 * `auto` resolved as `usePyxisTheme` does. It is re-read at each minute the
 * clock ticks and on any change to those settings or the location.
 */
export function useShellTint(options: ShellTintOptions = {}): ShellTint {
  const wallpaper = useSetting<string>(SETTING_KEYS.wallpaper, DEFAULT_WALLPAPER_ID, asWallpaper);
  const settingPinned = useSetting<number | null>(SETTING_KEYS.wallpaperPinnedTime, null, asPinnedTime);
  const preference = useSetting<ThemePreference>(SETTING_KEYS.theme, 'light', asTheme);
  const clock = useClock();
  const place = useLocation();
  const lat = place?.lat ?? null;
  const lon = place?.lon ?? null;
  const time = options.time !== undefined ? options.time : settingPinned;

  // The clock changes once a minute; the tint is worked out once per change.
  const { epochMs, utcOffsetMinutes } = clock;
  const tint = useMemo(() => {
    const location = lat !== null && lon !== null ? { lat, lon } : null;
    const { palette } = skyFor(wallpaper, {
      nowMs: epochMs,
      utcOffsetMinutes,
      location,
      time,
      daySpeed: 1,
      anchorMs: epochMs,
    });
    return shellTint(palette, resolveTheme(preference, epochMs, utcOffsetMinutes, location));
  }, [wallpaper, time, preference, epochMs, utcOffsetMinutes, lat, lon]);

  const target = options.target === undefined ? (typeof document !== 'undefined' ? document.documentElement : null) : options.target;
  useEffect(() => {
    if (target) applyShellTint(tint, target);
  }, [tint, target]);

  return tint;
}

/**
 * What Settings says about the sun: Daylight's phase names, today's sunrise
 * and sunset, and when the Auto theme next turns. All of it is the SDK's own
 * maths (`sunTimes`, `daylightSun`, `resolveTheme`), so what Settings says is
 * what the wallpaper and the theme do.
 */
import {
  FALLBACK_SCHEDULE,
  formatClockTime,
  resolveTheme,
  sunTimes,
  wallClock,
  type DaylightPhase,
  type DeviceLocation,
  type GeoPoint,
  type PyxisTheme,
} from '@pyxis/app-sdk';

const MINUTE = 60_000;

export const PHASE_NAMES: Record<DaylightPhase, string> = {
  night: 'Night',
  blue: 'Blue hour',
  dawn: 'Dawn',
  goldenMorning: 'Golden morning',
  day: 'Day',
  goldenEvening: 'Golden evening',
  dusk: 'Dusk',
};

/** The sun's place from the time service's location; null when it has none (UTC). */
export function geoOf(location: DeviceLocation | null): GeoPoint | null {
  return location && location.lat !== null && location.lon !== null ? { lat: location.lat, lon: location.lon } : null;
}

/** "06:30", or "06:30 AM", for minutes after local midnight. */
export function formatMinutes(minutes: number, hour24: boolean): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return formatClockTime({ hour: Math.floor(m / 60), minute: m % 60 }, hour24);
}

/** An instant on the device's clock, as the top bar would show it. */
export function formatInstant(ms: number, utcOffsetMinutes: number, hour24: boolean): string {
  return formatClockTime(wallClock(ms, utcOffsetMinutes), hour24);
}

export interface TodaySun {
  /** Minutes after local midnight; null when the sun doesn't rise or set today. */
  sunrise: number | null;
  sunset: number | null;
  polar: 'day' | 'night' | null;
  /** True with no location: the fixed 06:30/18:30 day stands in. */
  fixed: boolean;
}

/** Today's sunrise and sunset on the device's clock, at `location`. */
export function todaySun(nowMs: number, utcOffsetMinutes: number, location: GeoPoint | null): TodaySun {
  if (!location) {
    return {
      sunrise: FALLBACK_SCHEDULE.sunriseMinutes,
      sunset: FALLBACK_SCHEDULE.sunsetMinutes,
      polar: null,
      fixed: true,
    };
  }
  const t = sunTimes(nowMs, location.lat, location.lon);
  const local = (d: Date | null) => (d ? wallClock(d.getTime(), utcOffsetMinutes).minutesOfDay : null);
  return { sunrise: local(t.sunrise), sunset: local(t.sunset), polar: t.polar, fixed: false };
}

/** "Sunrise 06:41 · Sunset 17:02", or the polar case. */
export function todaySunText(sun: TodaySun, hour24: boolean): string {
  if (sun.polar === 'day' && (sun.sunrise === null || sun.sunset === null)) return 'The sun stays up all day today';
  if (sun.polar === 'night' && (sun.sunrise === null || sun.sunset === null)) return 'The sun stays down all day today';
  const rise = sun.sunrise === null ? '—' : formatMinutes(sun.sunrise, hour24);
  const set = sun.sunset === null ? '—' : formatMinutes(sun.sunset, hour24);
  return `Sunrise ${rise} · Sunset ${set}`;
}

export interface ThemeSwitch {
  atMs: number;
  to: PyxisTheme;
}

const SCAN_STEP_MS = 5 * MINUTE;
const SCAN_SPAN_MS = 48 * 60 * MINUTE;

/**
 * The next instant the Auto theme changes, found by asking `resolveTheme`
 * itself (so it is exactly when `usePyxisTheme` will turn), to the minute.
 * Null when it doesn't change in the next two days (polar day or night).
 */
export function nextThemeSwitch(nowMs: number, utcOffsetMinutes: number, location: GeoPoint | null): ThemeSwitch | null {
  const at = (ms: number) => resolveTheme('auto', ms, utcOffsetMinutes, location);
  const current = at(nowMs);
  let prev = nowMs;
  for (let t = nowMs + SCAN_STEP_MS; t <= nowMs + SCAN_SPAN_MS; t += SCAN_STEP_MS) {
    if (at(t) !== current) {
      let lo = prev;
      let hi = t;
      while (hi - lo > 15_000) {
        const mid = (lo + hi) / 2;
        if (at(mid) === current) lo = mid;
        else hi = mid;
      }
      return { atMs: Math.ceil(hi / MINUTE) * MINUTE, to: at(t) };
    }
    prev = t;
  }
  return null;
}

/**
 * The line under Auto: what it is now and when it next turns, e.g.
 * "Light now. Turns dark at 17:31, at civil dusk."
 */
export function autoSwitchText(
  nowMs: number,
  utcOffsetMinutes: number,
  location: GeoPoint | null,
  hour24: boolean
): string {
  const now = resolveTheme('auto', nowMs, utcOffsetMinutes, location);
  const next = nextThemeSwitch(nowMs, utcOffsetMinutes, location);
  const nowWord = now === 'dark' ? 'Dark' : 'Light';
  if (!next) {
    return `${nowWord} all day: the sun ${now === 'dark' ? 'stays below' : 'never goes below'} civil twilight here.`;
  }
  const today = wallClock(nowMs, utcOffsetMinutes);
  const then = wallClock(next.atMs, utcOffsetMinutes);
  const sameDay = today.year === then.year && today.month === then.month && today.day === then.day;
  const when = `${sameDay ? '' : 'tomorrow '}at ${formatClockTime(then, hour24)}`;
  const why = next.to === 'dark' ? 'civil dusk' : 'civil dawn';
  const fixed = location ? '' : ' (no location: on a fixed 06:30–18:30 day)';
  return `${nowWord} now. Turns ${next.to} ${when}, at ${why}${fixed}.`;
}

/**
 * Daylight: the palette as a function of where the sun is.
 *
 * Keyframes sit on the sun's elevation (palettes.ts, MORNING_KEYS and
 * EVENING_KEYS), smootherstep between neighbours. Morning and evening are
 * two separate ladders so dawn and dusk can differ; they are blended by a
 * weight that follows the hour angle smoothly through solar noon and solar
 * midnight, rather than switched by its sign. A hard switch would jump at
 * noon wherever the sun stays below the day key (a northern winter), and
 * at midnight under a midnight sun.
 */
import { solarPosition } from '../sun';
import {
  EVENING_KEYS,
  MORNING_KEYS,
  PHASE_PALETTES,
  mixPalette,
  smootherstep,
  type DaylightPhase,
  type Palette,
  type PhaseKey,
} from './palettes';

const RAD = Math.PI / 180;

export interface SunState {
  /** Degrees above the horizon. */
  elevation: number;
  /** Degrees from solar noon: negative before it. */
  hourAngle: number;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

/** The fixed schedule used with no location: sunrise 06:30, sunset 18:30 (local clock). */
export const FALLBACK_SCHEDULE = {
  sunriseMinutes: 6 * 60 + 30,
  sunsetMinutes: 18 * 60 + 30,
  /** The sun's highest, in degrees: a mid-latitude spring day. */
  peakElevation: 50,
} as const;

/**
 * The stand-in sun for a local clock time, with no location: noon half-way
 * between sunrise and sunset, and elevation a cosine of the hour angle that
 * crosses zero at sunrise and sunset. Twilight then lasts about 80 minutes,
 * close to a real mid-latitude day.
 */
export function fallbackSun(localMinutes: number): SunState {
  const { sunriseMinutes, sunsetMinutes, peakElevation } = FALLBACK_SCHEDULE;
  const noon = (sunriseMinutes + sunsetMinutes) / 2;
  const halfDay = (sunsetMinutes - sunriseMinutes) / 2;
  // Degrees per minute such that the hour angle is ±90° at sunrise and sunset.
  let h = ((localMinutes - noon) * 90) / halfDay;
  h = ((((h + 180) % 360) + 360) % 360) - 180;
  return { elevation: peakElevation * Math.cos(h * RAD), hourAngle: h };
}

export interface DaylightClock {
  /** Now, epoch milliseconds. */
  nowMs: number;
  /** The device's offset from UTC now, minutes (east positive). */
  utcOffsetMinutes: number;
  /** Where the device is; null means the fixed schedule. */
  location: GeoPoint | null;
}

const DAY_MIN = 1440;

/** Minutes after local midnight, 0..1440. */
export function localMinutes(nowMs: number, utcOffsetMinutes: number): number {
  const m = nowMs / 60_000 + utcOffsetMinutes;
  return ((m % DAY_MIN) + DAY_MIN) % DAY_MIN;
}

/**
 * The instant at `minutes` after local midnight today (today as the local
 * clock has it). A pinned time and a preview time are both local clock
 * times; the sun needs an instant.
 */
export function instantAtLocalTime(nowMs: number, utcOffsetMinutes: number, minutes: number): number {
  return nowMs + (minutes - localMinutes(nowMs, utcOffsetMinutes)) * 60_000;
}

/**
 * Where the sun is for a clock, optionally at a given local time of day
 * instead of now (a pinned or previewed time).
 */
export function daylightSun(clock: DaylightClock, atLocalMinutes?: number | null): SunState {
  const ms =
    atLocalMinutes === null || atLocalMinutes === undefined
      ? clock.nowMs
      : instantAtLocalTime(clock.nowMs, clock.utcOffsetMinutes, atLocalMinutes);
  if (!clock.location) return fallbackSun(localMinutes(ms, clock.utcOffsetMinutes));
  return solarPosition(ms, clock.location.lat, clock.location.lon);
}

function ladder(keys: readonly PhaseKey[], elevation: number): Palette {
  if (elevation <= keys[0].elevation) return PHASE_PALETTES[keys[0].phase];
  for (let i = 1; i < keys.length; i++) {
    const hi = keys[i];
    if (elevation <= hi.elevation) {
      const lo = keys[i - 1];
      const t = smootherstep((elevation - lo.elevation) / (hi.elevation - lo.elevation));
      return mixPalette(PHASE_PALETTES[lo.phase], PHASE_PALETTES[hi.phase], t);
    }
  }
  return PHASE_PALETTES[keys[keys.length - 1].phase];
}

/** How far the hour angle has to move off noon or midnight to be all morning or all evening. */
const SIDE_BLEND_DEG = 20;

/** 0 is morning, 1 evening; continuous and periodic in the hour angle. */
export function eveningWeight(hourAngle: number): number {
  const s = Math.sin(hourAngle * RAD) / Math.sin(SIDE_BLEND_DEG * RAD);
  return smootherstep((Math.max(-1, Math.min(1, s)) + 1) / 2);
}

/** Above the day key the sky keeps brightening a little, to solar noon. */
const LIFT = { from: 25, to: 60, lightness: 0.035 } as const;

/** The Daylight palette for a sun. */
export function daylightPalette(sun: SunState): Palette {
  const w = eveningWeight(sun.hourAngle);
  const morning = ladder(MORNING_KEYS, sun.elevation);
  const evening = ladder(EVENING_KEYS, sun.elevation);
  const mixed = mixPalette(morning, evening, w);
  const lift = LIFT.lightness * smootherstep((sun.elevation - LIFT.from) / (LIFT.to - LIFT.from));
  if (lift <= 0) return mixed;
  return mixed.map(([L, a, b]) => [Math.min(0.98, L + lift), a, b] as const);
}

/**
 * The phase a sun is in, by the plan's table (night below -12°, blue hour
 * to -4°, dawn or dusk to 4°, golden to 15°, day above). Used where only a
 * change of phase may change the picture (animation mode `off`).
 */
export function daylightPhase(sun: SunState): DaylightPhase {
  const morning = sun.hourAngle < 0;
  const e = sun.elevation;
  if (e < -12) return 'night';
  if (e < -4) return 'blue';
  if (e < 4) return morning ? 'dawn' : 'dusk';
  if (e < 15) return morning ? 'goldenMorning' : 'goldenEvening';
  return 'day';
}

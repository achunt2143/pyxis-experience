/**
 * Where the sun is: NOAA's solar-position formulas (the ones behind its
 * solar calculator spreadsheet, after Meeus), good to about a minute for
 * sunrise and sunset between 1901 and 2099.
 *
 * Pure: everything is a function of an instant and a place. The time zone
 * plays no part (an instant is an instant), so a device whose `Date` runs
 * in UTC gets the right sky as long as it knows where it is.
 *
 * The Daylight wallpaper (wallpaper/daylight.ts) keys its palette on
 * `sunElevation` and `hourAngle`, and `usePyxisTheme`'s Auto theme reads
 * `sunTimes`' civil twilight. Keep these names stable.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const DAY_MS = 86_400_000;

/** The zenith NOAA uses for sunrise and sunset: refraction plus the sun's radius. */
const ZENITH_RISE = 90.833;
/** Civil twilight: the sun 6° below the horizon. */
const ZENITH_CIVIL = 96;

function julianCentury(ms: number): number {
  return (ms / DAY_MS + 2440587.5 - 2451545) / 36525;
}

interface SolarTerms {
  /** Declination, degrees. */
  decl: number;
  /** Equation of time, minutes. */
  eqTime: number;
}

function solarTerms(ms: number): SolarTerms {
  const t = julianCentury(ms);
  const l0 = (((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) + 360) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(m * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const appLong = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const meanObliq = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliq = meanObliq + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(obliq * RAD) * Math.sin(appLong * RAD)) * DEG;
  const y = Math.tan((obliq / 2) * RAD) ** 2;
  const eqTime =
    4 *
    DEG *
    (y * Math.sin(2 * l0 * RAD) -
      2 * e * Math.sin(m * RAD) +
      4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD) -
      0.5 * y * y * Math.sin(4 * l0 * RAD) -
      1.25 * e * e * Math.sin(2 * m * RAD));
  return { decl, eqTime };
}

/** NOAA's atmospheric refraction correction, degrees, for a geometric elevation. */
function refraction(elev: number): number {
  if (elev > 85) return 0;
  const te = Math.tan(elev * RAD);
  let arcsec: number;
  if (elev > 5) arcsec = 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5;
  else if (elev > -0.575)
    arcsec = 1735 + elev * (-518.2 + elev * (103.4 + elev * (-12.79 + elev * 0.711)));
  else arcsec = -20.772 / te;
  return arcsec / 3600;
}

export interface SolarPosition {
  /** Degrees above the horizon, corrected for refraction (negative below it). */
  elevation: number;
  /** Degrees from solar noon: negative in the morning, positive in the afternoon, ±180 at solar midnight. */
  hourAngle: number;
}

/** The sun's elevation and hour angle at an instant, seen from a place (degrees; east and north positive). */
export function solarPosition(date: Date | number, lat: number, lon: number): SolarPosition {
  const ms = typeof date === 'number' ? date : date.getTime();
  const { decl, eqTime } = solarTerms(ms);
  const utcMinutes = (((ms % DAY_MS) + DAY_MS) % DAY_MS) / 60_000;
  const trueSolar = (((utcMinutes + eqTime + 4 * lon) % 1440) + 1440) % 1440;
  const hourAngle = trueSolar / 4 < 0 ? trueSolar / 4 + 180 : trueSolar / 4 - 180;
  const cosZenith =
    Math.sin(lat * RAD) * Math.sin(decl * RAD) +
    Math.cos(lat * RAD) * Math.cos(decl * RAD) * Math.cos(hourAngle * RAD);
  const geometric = 90 - Math.acos(Math.max(-1, Math.min(1, cosZenith))) * DEG;
  return { elevation: geometric + refraction(geometric), hourAngle };
}

/** Degrees above the horizon (refraction included). */
export function sunElevation(date: Date | number, lat: number, lon: number): number {
  return solarPosition(date, lat, lon).elevation;
}

/** Before solar noon (the sun is climbing). */
export function isMorning(date: Date | number, lat: number, lon: number): boolean {
  return solarPosition(date, lat, lon).hourAngle < 0;
}

export interface SunTimes {
  solarNoon: Date;
  /** Null when the sun doesn't rise or set that day (polar day or night). */
  sunrise: Date | null;
  sunset: Date | null;
  /** Start of civil twilight (sun 6° below), and its end. Null when it doesn't happen. */
  civilDawn: Date | null;
  civilDusk: Date | null;
  /** Set on a day with no sunrise: whether the sun stays up or down. */
  polar: 'day' | 'night' | null;
}

/** Minutes after the day's UTC midnight of solar noon. */
function noonMinutes(dayStartMs: number, lon: number): number {
  // Two passes: the equation of time read at the noon itself.
  let noon = 720 - 4 * lon;
  for (let i = 0; i < 2; i++) noon = 720 - 4 * lon - solarTerms(dayStartMs + noon * 60_000).eqTime;
  return noon;
}

/** Hour angle (degrees) at which the sun crosses `zenith`, or NaN if it never does. */
function crossingAngle(lat: number, decl: number, zenith: number): number {
  const cosH =
    Math.cos(zenith * RAD) / (Math.cos(lat * RAD) * Math.cos(decl * RAD)) -
    Math.tan(lat * RAD) * Math.tan(decl * RAD);
  return cosH < -1 || cosH > 1 ? NaN : Math.acos(cosH) * DEG;
}

/**
 * One crossing of `zenith`, refined by recomputing the sun at the crossing
 * itself (the declination moves a little between noon and sunset).
 */
function crossing(
  dayStartMs: number,
  noon: number,
  lat: number,
  lon: number,
  zenith: number,
  side: -1 | 1
): Date | null {
  let at = noon;
  for (let i = 0; i < 3; i++) {
    const { decl, eqTime } = solarTerms(dayStartMs + at * 60_000);
    const h = crossingAngle(lat, decl, zenith);
    if (Number.isNaN(h)) return null;
    at = 720 - 4 * lon - eqTime + side * 4 * h;
  }
  return new Date(dayStartMs + at * 60_000);
}

/**
 * Sunrise, sunset, civil twilight and solar noon for the solar day that
 * contains `date` at that place (the day runs from one solar midnight to
 * the next, so it is the local day, whatever the time zone).
 */
export function sunTimes(date: Date | number, lat: number, lon: number): SunTimes {
  const ms = typeof date === 'number' ? date : date.getTime();
  // The UTC calendar day whose solar noon is nearest to `date`.
  const dayStartMs = Math.floor((ms + (lon / 360) * DAY_MS) / DAY_MS) * DAY_MS;
  const noon = noonMinutes(dayStartMs, lon);
  const solarNoon = new Date(dayStartMs + noon * 60_000);
  const sunrise = crossing(dayStartMs, noon, lat, lon, ZENITH_RISE, -1);
  const sunset = crossing(dayStartMs, noon, lat, lon, ZENITH_RISE, 1);
  let polar: SunTimes['polar'] = null;
  if (!sunrise || !sunset) polar = sunElevation(solarNoon, lat, lon) > 0 ? 'day' : 'night';
  return {
    solarNoon,
    sunrise,
    sunset,
    civilDawn: crossing(dayStartMs, noon, lat, lon, ZENITH_CIVIL, -1),
    civilDusk: crossing(dayStartMs, noon, lat, lon, ZENITH_CIVIL, 1),
    polar,
  };
}

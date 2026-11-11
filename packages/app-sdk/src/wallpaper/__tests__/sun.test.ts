import { describe, expect, it } from 'vitest';
import { isMorning, solarPosition, sunElevation, sunTimes } from '../../sun';

/**
 * Reference times from the US Naval Observatory's API
 * (aa.usno.navy.mil/api/rstt/oneday, fetched 2026-11-09), which agrees with
 * NOAA's calculator to within a minute. Local clock times, rounded to the
 * minute; `tz` is the offset USNO was asked for.
 */
const CASES = [
  { city: 'London', lat: 51.5074, lon: -0.1278, date: '2024-06-21', tz: 0, dawn: '02:55', rise: '03:43', noon: '12:02', set: '20:22', dusk: '21:09' },
  { city: 'London', lat: 51.5074, lon: -0.1278, date: '2024-12-21', tz: 0, dawn: '07:24', rise: '08:04', noon: '11:59', set: '15:54', dusk: '16:34' },
  { city: 'New York', lat: 40.7128, lon: -74.006, date: '2024-06-21', tz: -4, dawn: '04:52', rise: '05:25', noon: '12:58', set: '20:31', dusk: '21:04' },
  { city: 'New York', lat: 40.7128, lon: -74.006, date: '2024-12-21', tz: -5, dawn: '06:46', rise: '07:17', noon: '11:54', set: '16:32', dusk: '17:03' },
  { city: 'Sydney', lat: -33.8688, lon: 151.2093, date: '2024-06-21', tz: 10, dawn: '06:32', rise: '07:00', noon: '11:57', set: '16:54', dusk: '17:22' },
  { city: 'Sydney', lat: -33.8688, lon: 151.2093, date: '2024-12-21', tz: 11, dawn: '05:12', rise: '05:41', noon: '12:53', set: '20:06', dusk: '20:35' },
];

/** A local clock time on a date, as an epoch ms. */
function at(date: string, hhmm: string, tz: number): number {
  const [h, m] = hhmm.split(':').map(Number);
  return Date.parse(`${date}T00:00:00Z`) + ((h - tz) * 60 + m) * 60_000;
}

const TWO_MIN = 2 * 60_000;

describe('sunTimes against USNO/NOAA', () => {
  for (const c of CASES) {
    it(`${c.city} ${c.date}`, () => {
      // Ask with an instant in the middle of that local day.
      const t = sunTimes(at(c.date, '12:00', c.tz), c.lat, c.lon);
      expect(t.polar).toBeNull();
      expect(Math.abs(t.sunrise!.getTime() - at(c.date, c.rise, c.tz))).toBeLessThan(TWO_MIN);
      expect(Math.abs(t.sunset!.getTime() - at(c.date, c.set, c.tz))).toBeLessThan(TWO_MIN);
      expect(Math.abs(t.civilDawn!.getTime() - at(c.date, c.dawn, c.tz))).toBeLessThan(TWO_MIN);
      expect(Math.abs(t.civilDusk!.getTime() - at(c.date, c.dusk, c.tz))).toBeLessThan(TWO_MIN);
      expect(Math.abs(t.solarNoon.getTime() - at(c.date, c.noon, c.tz))).toBeLessThan(TWO_MIN);
    });
  }

  it('gives the same day for any instant within it', () => {
    const c = CASES[2];
    const a = sunTimes(at(c.date, '01:00', c.tz), c.lat, c.lon);
    const b = sunTimes(at(c.date, '23:00', c.tz), c.lat, c.lon);
    expect(Math.abs(a.sunrise!.getTime() - b.sunrise!.getTime())).toBeLessThan(1000);
  });

  it('reports polar night and polar day', () => {
    // Tromsø.
    const winter = sunTimes(Date.parse('2024-12-21T11:00:00Z'), 69.65, 18.96);
    expect(winter.sunrise).toBeNull();
    expect(winter.polar).toBe('night');
    const summer = sunTimes(Date.parse('2024-06-21T11:00:00Z'), 69.65, 18.96);
    expect(summer.sunset).toBeNull();
    expect(summer.polar).toBe('day');
  });
});

describe('sunElevation', () => {
  it('is near zero at sunrise (refraction included) and high at noon', () => {
    const c = CASES[2];
    const t = sunTimes(at(c.date, '12:00', c.tz), c.lat, c.lon);
    // At NOAA's sunrise the sun's centre is at about -0.83° geometric, which
    // refraction lifts to about -0.27° apparent.
    expect(Math.abs(sunElevation(t.sunrise!, c.lat, c.lon) + 0.27)).toBeLessThan(0.3);
    // New York at the June solstice: 90 - 40.71 + 23.44.
    expect(sunElevation(t.solarNoon, c.lat, c.lon)).toBeCloseTo(72.7, 0);
  });

  it('is about -6° at civil dusk', () => {
    const c = CASES[0];
    const t = sunTimes(at(c.date, '12:00', c.tz), c.lat, c.lon);
    expect(sunElevation(t.civilDusk!, c.lat, c.lon)).toBeCloseTo(-6, 0);
  });

  it('isMorning flips at solar noon', () => {
    const c = CASES[1];
    const noon = sunTimes(at(c.date, '12:00', c.tz), c.lat, c.lon).solarNoon.getTime();
    expect(isMorning(noon - 60_000, c.lat, c.lon)).toBe(true);
    expect(isMorning(noon + 60_000, c.lat, c.lon)).toBe(false);
    expect(Math.abs(solarPosition(noon, c.lat, c.lon).hourAngle)).toBeLessThan(0.1);
  });
});

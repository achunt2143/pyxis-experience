import { describe, expect, it } from 'vitest';
import { resolveTheme, sunTimes } from '@pyxis/app-sdk';
import { autoSwitchText, formatMinutes, nextThemeSwitch, todaySun, todaySunText } from '../sunInfo';

const LA = { lat: 34.0522, lon: -118.2437 };
const LA_OFFSET = -480; // PST in November
const SVALBARD = { lat: 78.22, lon: 15.65 };
const MIN = 60_000;

/** The instant of a wall-clock time on 2026-11-09 at UTC offset `offset`. */
const at = (hour: number, minute: number, offset = LA_OFFSET) => Date.UTC(2026, 10, 9, hour, minute) - offset * MIN;

describe('nextThemeSwitch', () => {
  it('in the afternoon is the end of civil dusk, to dark', () => {
    const now = at(14, 0);
    const next = nextThemeSwitch(now, LA_OFFSET, LA)!;
    expect(next.to).toBe('dark');
    const dusk = sunTimes(now, LA.lat, LA.lon).civilDusk!.getTime();
    expect(Math.abs(next.atMs - dusk)).toBeLessThanOrEqual(MIN);
  });

  it('at night is the next civil dawn, to light, tomorrow', () => {
    const now = at(22, 0);
    const next = nextThemeSwitch(now, LA_OFFSET, LA)!;
    expect(next.to).toBe('light');
    const dawn = sunTimes(now + 12 * 60 * MIN, LA.lat, LA.lon).civilDawn!.getTime();
    expect(Math.abs(next.atMs - dawn)).toBeLessThanOrEqual(MIN);
    expect(next.atMs).toBeGreaterThan(now);
  });

  it('is exactly where resolveTheme turns, to the minute', () => {
    const now = at(9, 13);
    const next = nextThemeSwitch(now, LA_OFFSET, LA)!;
    expect(resolveTheme('auto', next.atMs, LA_OFFSET, LA)).toBe(next.to);
    expect(resolveTheme('auto', next.atMs - MIN, LA_OFFSET, LA)).not.toBe(next.to);
  });

  it('with no location follows the fixed day', () => {
    // The stand-in day's sun reaches -6° a little after 18:30.
    const next = nextThemeSwitch(at(12, 0, 0), 0, null)!;
    expect(next.to).toBe('dark');
    const local = new Date(next.atMs).getUTCHours() * 60 + new Date(next.atMs).getUTCMinutes();
    expect(local).toBeGreaterThan(18 * 60 + 30);
    expect(local).toBeLessThan(19 * 60 + 30);
  });

  it('is null under a polar night', () => {
    expect(nextThemeSwitch(Date.UTC(2026, 11, 21, 12), 60, SVALBARD)).toBeNull();
  });
});

describe('autoSwitchText', () => {
  it('says what it is now and when it turns, on the device clock', () => {
    const text = autoSwitchText(at(14, 0), LA_OFFSET, LA, true);
    expect(text).toMatch(/^Light now\. Turns dark at 17:\d\d, at civil dusk\.$/);
  });

  it('says tomorrow when the switch is after midnight, in 12-hour form', () => {
    const text = autoSwitchText(at(22, 0), LA_OFFSET, LA, false);
    expect(text).toMatch(/^Dark now\. Turns light tomorrow at 05:\d\d AM, at civil dawn\.$/);
  });

  it('says when there is no location', () => {
    expect(autoSwitchText(at(12, 0, 0), 0, null, true)).toMatch(/\(no location: on a fixed 06:30–18:30 day\)\.$/);
  });

  it('says when it never turns', () => {
    expect(autoSwitchText(Date.UTC(2026, 11, 21, 12), 60, SVALBARD, true)).toBe(
      'Dark all day: the sun stays below civil twilight here.'
    );
    expect(autoSwitchText(Date.UTC(2026, 5, 21, 12), 120, SVALBARD, true)).toBe(
      'Light all day: the sun never goes below civil twilight here.'
    );
  });
});

describe('todaySun', () => {
  it('is today’s sunrise and sunset on the device clock', () => {
    const sun = todaySun(at(12, 0), LA_OFFSET, LA);
    expect(sun.fixed).toBe(false);
    // Los Angeles, 9 Nov: about 06:18 and 16:56 PST.
    expect(sun.sunrise!).toBeGreaterThan(6 * 60 + 10);
    expect(sun.sunrise!).toBeLessThan(6 * 60 + 26);
    expect(sun.sunset!).toBeGreaterThan(16 * 60 + 48);
    expect(sun.sunset!).toBeLessThan(17 * 60 + 4);
    expect(todaySunText(sun, true)).toMatch(/^Sunrise 06:\d\d · Sunset 16:\d\d$/);
  });

  it('is the fixed day with no location', () => {
    const sun = todaySun(at(12, 0), LA_OFFSET, null);
    expect(sun).toEqual({ sunrise: 390, sunset: 1110, polar: null, fixed: true });
    expect(todaySunText(sun, false)).toBe('Sunrise 06:30 AM · Sunset 06:30 PM');
  });

  it('says so under a polar day or night', () => {
    expect(todaySunText(todaySun(Date.UTC(2026, 11, 21, 12), 60, SVALBARD), true)).toBe('The sun stays down all day today');
    expect(todaySunText(todaySun(Date.UTC(2026, 5, 21, 12), 120, SVALBARD), true)).toBe('The sun stays up all day today');
  });
});

describe('formatMinutes', () => {
  it('wraps and rounds', () => {
    expect(formatMinutes(0, true)).toBe('00:00');
    expect(formatMinutes(1110, false)).toBe('06:30 PM');
    expect(formatMinutes(1439.6, true)).toBe('00:00');
    expect(formatMinutes(-30, true)).toBe('23:30');
  });
});

import { describe, expect, it } from 'vitest';
import { parseClockTime, skyFor, skyInstant, wallpaperState, type SkyInputs } from '../engine';
import { STATIC_HEX, oklabToHex } from '../palettes';
import { WALLPAPERS, wallpaperById } from '../../wallpapers';

const BASE: SkyInputs = {
  nowMs: Date.parse('2024-06-21T15:00:00Z'),
  utcOffsetMinutes: 0,
  location: null,
  time: null,
  daySpeed: 1,
  anchorMs: Date.parse('2024-06-21T15:00:00Z'),
};

describe('wallpaperState', () => {
  it('flows only in full mode with motion on, and pauses when asked', () => {
    expect(wallpaperState('flow', 'full', false)).toBe('flowing');
    expect(wallpaperState('flow', 'full', true)).toBe('paused');
    expect(wallpaperState('still', 'full', false)).toBe('still');
    expect(wallpaperState('flow', 'reduced', false)).toBe('still');
    expect(wallpaperState('flow', 'off', true)).toBe('still');
  });
});

describe('skyInstant', () => {
  it('is now, normally', () => {
    expect(skyInstant(BASE)).toBe(BASE.nowMs);
  });

  it('freezes a pinned time at that local time today', () => {
    const later = { ...BASE, time: 18 * 60, utcOffsetMinutes: -240, nowMs: BASE.nowMs + 3_600_000 };
    // 18:00 at UTC-4 is 22:00Z on the local day of 11:00 local.
    expect(skyInstant(later)).toBe(Date.parse('2024-06-21T22:00:00Z'));
  });

  it('runs the day faster from the pinned time or from now', () => {
    const s = { ...BASE, daySpeed: 60, nowMs: BASE.anchorMs + 60_000 };
    expect(skyInstant(s)).toBe(BASE.anchorMs + 3_600_000);
    const pinned = { ...s, time: 6 * 60 };
    expect(skyInstant(pinned)).toBe(Date.parse('2024-06-21T07:00:00Z'));
  });
});

describe('skyFor', () => {
  it('draws a fixed wallpaper with its own palette and no phase', () => {
    const sky = skyFor('forest', BASE);
    expect(sky.phase).toBeNull();
    expect(sky.palette.map((c) => oklabToHex(c))).toEqual([...STATIC_HEX.forest]);
  });

  it('draws Daylight by the sun (the fallback schedule with no location)', () => {
    expect(skyFor('daylight', { ...BASE, time: 3 * 60 }).phase).toBe('night');
    expect(skyFor('daylight', { ...BASE, time: 12 * 60 }).phase).toBe('day');
    expect(skyFor('daylight', { ...BASE, time: 18 * 60 + 30 }).phase).toBe('dusk');
    // An unknown id is Daylight.
    expect(skyFor('nope', { ...BASE, time: 3 * 60 }).phase).toBe('night');
  });
});

describe('registry', () => {
  it('keeps the four classic ids and adds Daylight first', () => {
    expect(WALLPAPERS.map((w) => w.id)).toEqual(['daylight', 'aurora', 'sunset', 'forest', 'mochi']);
    expect(wallpaperById('mochi').kind).toBe('palette');
    expect(wallpaperById(undefined).id).toBe('daylight');
    for (const w of WALLPAPERS) expect(w.css).toMatch(/gradient/);
  });
});

describe('parseClockTime', () => {
  it('reads HH:MM', () => {
    expect(parseClockTime('06:30')).toBe(390);
    expect(parseClockTime('6:05')).toBe(365);
    expect(parseClockTime('23:59')).toBe(1439);
    expect(parseClockTime('24:00')).toBeNull();
    expect(parseClockTime('noon')).toBeNull();
    expect(parseClockTime(null)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  EVENING_KEYS,
  MORNING_KEYS,
  PHASE_HEX,
  hexToOklab,
  oklabToHex,
  type Palette,
} from '../palettes';
import { daylightPalette, daylightPhase, daylightSun, eveningWeight, fallbackSun } from '../daylight';

/** The largest OKLab channel difference between two palettes. */
function jump(a: Palette, b: Palette): number {
  let m = 0;
  a.forEach((c, i) => {
    for (let k = 0; k < 3; k++) m = Math.max(m, Math.abs(c[k] - b[i][k]));
  });
  return m;
}

describe('OKLab', () => {
  it('round-trips every phase colour through hex', () => {
    for (const hexes of Object.values(PHASE_HEX)) {
      for (const h of hexes) expect(oklabToHex(hexToOklab(h))).toBe(h);
    }
  });

  it('has white at L=1 and black at L=0', () => {
    expect(hexToOklab('#ffffff')[0]).toBeCloseTo(1, 4);
    expect(hexToOklab('#000000')[0]).toBeCloseTo(0, 6);
  });
});

describe('Daylight palette continuity', () => {
  const EPS = 1e-3;

  it('has no step across any keyframe, morning or evening', () => {
    for (const hourAngle of [-90, 90]) {
      for (const key of [...MORNING_KEYS, ...EVENING_KEYS]) {
        const below = daylightPalette({ elevation: key.elevation - 1e-4, hourAngle });
        const above = daylightPalette({ elevation: key.elevation + 1e-4, hourAngle });
        expect(jump(below, above)).toBeLessThan(EPS);
      }
    }
  });

  it('has no step across the plan-table phase boundaries', () => {
    for (const hourAngle of [-100, 100]) {
      for (const e of [-12, -4, 4, 15]) {
        const a = daylightPalette({ elevation: e - 1e-4, hourAngle });
        const b = daylightPalette({ elevation: e + 1e-4, hourAngle });
        expect(jump(a, b)).toBeLessThan(EPS);
      }
    }
  });

  it('crosses solar noon and midnight smoothly, at any elevation', () => {
    // Where the sun stays low at noon (a northern winter) morning and evening
    // ladders differ there; the blend must still be continuous.
    for (const elevation of [-30, -10, -2, 2, 8, 14, 20, 40]) {
      for (const h of [0, 180, -180]) {
        const a = daylightPalette({ elevation, hourAngle: h - 1e-3 });
        const b = daylightPalette({ elevation, hourAngle: h + 1e-3 });
        expect(jump(a, b)).toBeLessThan(EPS);
      }
    }
    expect(eveningWeight(-90)).toBe(0);
    expect(eveningWeight(90)).toBe(1);
    expect(eveningWeight(0)).toBeCloseTo(0.5, 6);
  });

  /** Minute by minute through a whole day, midnight included. */
  function maxStepOverDay(location: { lat: number; lon: number } | null, dateIso: string, offset: number) {
    const start = Date.parse(`${dateIso}T00:00:00Z`) - offset * 60_000 - 60 * 60_000;
    let prev = daylightPalette(daylightSun({ nowMs: start, utcOffsetMinutes: offset, location }));
    let worst = 0;
    for (let m = 1; m <= 26 * 60; m++) {
      const p = daylightPalette(
        daylightSun({ nowMs: start + m * 60_000, utcOffsetMinutes: offset, location })
      );
      worst = Math.max(worst, jump(prev, p));
      prev = p;
    }
    return worst;
  }

  // At the fastest sunrise (the equator, or the fallback schedule) blue hour
  // to dawn moves L by ~0.5 over ~35 minutes; under 0.03 a minute is about
  // one just-noticeable OKLab step, and never a jump.
  it('changes by under 0.03 a minute through real days', () => {
    // New York in winter and summer, Tromsø under the midnight sun and in
    // polar night, Quito on the equator (the fastest sunrise), Sydney.
    const places: [{ lat: number; lon: number }, string, number][] = [
      [{ lat: 40.71, lon: -74.01 }, '2024-12-21', -300],
      [{ lat: 40.71, lon: -74.01 }, '2024-06-21', -240],
      [{ lat: 69.65, lon: 18.96 }, '2024-06-21', 120],
      [{ lat: 69.65, lon: 18.96 }, '2024-12-21', 60],
      [{ lat: -0.18, lon: -78.47 }, '2024-03-20', -300],
      [{ lat: -33.87, lon: 151.21 }, '2024-12-21', 660],
    ];
    for (const [loc, date, offset] of places) {
      expect(maxStepOverDay(loc, date, offset)).toBeLessThan(0.03);
    }
  });

  it('changes by under 0.03 a minute through the fallback schedule, midnight included', () => {
    expect(maxStepOverDay(null, '2024-06-21', 0)).toBeLessThan(0.03);
  });
});

describe('Daylight phases', () => {
  it('follows the fallback schedule: night, dawn at 06:30, day at noon, dusk at 18:30', () => {
    expect(daylightPhase(fallbackSun(2 * 60))).toBe('night');
    expect(daylightPhase(fallbackSun(6 * 60 + 30))).toBe('dawn');
    expect(daylightPhase(fallbackSun(12 * 60 + 30))).toBe('day');
    expect(daylightPhase(fallbackSun(18 * 60 + 30))).toBe('dusk');
    expect(fallbackSun(6 * 60 + 30).elevation).toBeCloseTo(0, 6);
    expect(fallbackSun(18 * 60 + 30).elevation).toBeCloseTo(0, 6);
  });

  it('is the keyed palette exactly at a key', () => {
    const night = daylightPalette({ elevation: -40, hourAngle: 180 });
    expect(night.map((c) => oklabToHex(c))).toEqual([...PHASE_HEX.night]);
    const dawn = daylightPalette({ elevation: 0, hourAngle: -90 });
    expect(dawn.map((c) => oklabToHex(c))).toEqual([...PHASE_HEX.dawn]);
    const dusk = daylightPalette({ elevation: 0, hourAngle: 90 });
    expect(dusk.map((c) => oklabToHex(c))).toEqual([...PHASE_HEX.dusk]);
  });
});

import { describe, expect, it } from 'vitest';
import { EXPOSURE_PAUSE_AT, exposedFraction, exposureVerdict, unionArea } from '../useWallpaperExposure';

const OUT = { x: 0, y: 0, width: 1280, height: 800 };

describe('exposure maths', () => {
  it('unions overlapping rectangles once', () => {
    const a = { x: 0, y: 0, width: 100, height: 100 };
    const b = { x: 50, y: 50, width: 100, height: 100 };
    expect(unionArea([a, b], OUT)).toBe(10000 + 10000 - 2500);
    expect(unionArea([a, a, a], OUT)).toBe(10000);
    expect(unionArea([], OUT)).toBe(0);
  });

  it('clips windows to the output', () => {
    const off = { x: 1200, y: 700, width: 400, height: 400 };
    expect(unionArea([off], OUT)).toBe(80 * 100);
    expect(unionArea([{ x: -500, y: 0, width: 100, height: 100 }], OUT)).toBe(0);
  });

  it('handles a window inside another and disjoint windows', () => {
    const big = { x: 100, y: 100, width: 600, height: 400 };
    const inner = { x: 200, y: 200, width: 50, height: 50 };
    const far = { x: 900, y: 600, width: 100, height: 100 };
    expect(unionArea([big, inner, far], OUT)).toBe(600 * 400 + 100 * 100);
  });

  it('pauses under a maximized app (only the bar and dock strips show)', () => {
    // The reference VM's work area (alpha5-shell-layering): a 44 px bar,
    // 76 px for the dock. The frame alone leaves exactly 15%.
    const frame = { x: 0, y: 44, width: 1280, height: 800 - 44 - 76 };
    expect(exposedFraction(OUT, [frame])).toBeCloseTo(0.15, 9);
    expect(exposureVerdict(OUT, [frame], false).pause).toBe(true);
    // A taller dock still pauses, because the window is maximized.
    const taller = { x: 0, y: 44, width: 1280, height: 800 - 44 - 96, maximized: true };
    expect(exposedFraction(OUT, [taller])).toBeGreaterThan(EXPOSURE_PAUSE_AT);
    expect(exposureVerdict(OUT, [taller], false).pause).toBe(true);
    expect(exposureVerdict(OUT, [{ ...taller, minimized: true }], false).pause).toBe(false);
  });

  it('keeps flowing with a floating window', () => {
    const v = exposureVerdict(OUT, [{ x: 200, y: 120, width: 800, height: 500 }], false);
    expect(v.exposed).toBeCloseTo(1 - (800 * 500) / (1280 * 800), 6);
    expect(v.pause).toBe(false);
  });

  it('ignores minimized windows', () => {
    const full = { x: 0, y: 0, width: 1280, height: 800, minimized: true };
    expect(exposedFraction(OUT, [full])).toBe(1);
    expect(exposureVerdict(OUT, [full], false).pause).toBe(false);
  });

  it('pauses for a fullscreen app and for a hidden document', () => {
    const fs = { x: 0, y: 0, width: 1280, height: 800, fullscreen: true };
    expect(exposureVerdict(OUT, [fs], false)).toMatchObject({ fullscreen: true, pause: true });
    const minimizedFs = { ...fs, minimized: true };
    expect(exposureVerdict(OUT, [minimizedFs], false).pause).toBe(false);
    expect(exposureVerdict(OUT, [], true).pause).toBe(true);
  });

  it('pauses when several windows together cover it', () => {
    const left = { x: 0, y: 0, width: 700, height: 800 };
    const right = { x: 600, y: 0, width: 680, height: 760 };
    const v = exposureVerdict(OUT, [left, right], false);
    expect(v.exposed).toBeCloseTo((580 * 40) / (1280 * 800), 6);
    expect(v.pause).toBe(true);
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  CLEAR_MS,
  CLEAR_PAD_PX,
  CLEAR_SOFT_PX,
  REDUCED_MS,
  VEIL_CLOCK_FROM,
  VEIL_MS,
  clearMs,
  clearRadius,
  clearReach,
  easeInOut,
  holeMask,
  ringOpacity,
  veilClockScale,
  veilMs,
} from '../clearMath';
import { runTween } from '../tween';

/**
 * Veil and Clear's numbers, pinned to the contract both sides use
 * (docs/internal/pyxis-glass-and-lock-plan.md, "Contracts"): Veil 600 ms, the
 * clock from 106%; Clear 900 ms, r(t) = D(0.5t + 0.5t²), D = the farthest
 * corner's distance + 60, a 50 px soft edge.
 */

describe('Clear', () => {
  const screen = { width: 1280, height: 800 };

  it('D is the distance to the farthest corner, plus 60', () => {
    // From the centre every corner is the same distance away.
    expect(clearReach({ x: 640, y: 400 }, screen)).toBeCloseTo(Math.hypot(640, 400) + CLEAR_PAD_PX, 6);
    // From the field, low and central: the top corners are farthest.
    expect(clearReach({ x: 640, y: 479 }, screen)).toBeCloseTo(Math.hypot(640, 479) + 60, 6);
    // From a corner, the opposite one.
    expect(clearReach({ x: 0, y: 0 }, screen)).toBeCloseTo(Math.hypot(1280, 800) + 60, 6);
    expect(CLEAR_PAD_PX).toBe(60);
  });

  it('r(t) = D(0.5t + 0.5t²): nothing at 0, everything at 1, slow then quick', () => {
    const D = 1000;
    expect(clearRadius(0, D)).toBe(0);
    expect(clearRadius(1, D)).toBe(D);
    expect(clearRadius(0.5, D)).toBeCloseTo(375, 9);
    expect(clearRadius(0.25, D)).toBeCloseTo(D * (0.125 + 0.03125), 9);
    // It speeds up: the second half covers more than the first.
    expect(clearRadius(1, D) - clearRadius(0.5, D)).toBeGreaterThan(clearRadius(0.5, D) - clearRadius(0, D));
  });

  it('is monotone, and clamped outside 0..1', () => {
    let last = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const r = clearRadius(t, 800);
      expect(r).toBeGreaterThanOrEqual(last);
      last = r;
    }
    expect(clearRadius(-1, 800)).toBe(0);
    expect(clearRadius(2, 800)).toBe(800);
  });

  it('the hole has cleared every corner, soft edge included, by the end', () => {
    for (const origin of [{ x: 640, y: 479 }, { x: 0, y: 0 }, { x: 1280, y: 800 }, { x: 640, y: 400 }]) {
      const D = clearReach(origin, screen);
      const farthest = Math.max(
        Math.hypot(origin.x, origin.y),
        Math.hypot(1280 - origin.x, origin.y),
        Math.hypot(origin.x, 800 - origin.y),
        Math.hypot(1280 - origin.x, 800 - origin.y)
      );
      // The mask is fully clear out to r; the corner is within it.
      expect(clearRadius(1, D)).toBeGreaterThan(farthest);
    }
  });

  it('the mask is clear inside r and opaque 50 px beyond it', () => {
    expect(holeMask({ x: 640, y: 461 }, 120)).toBe('radial-gradient(circle at 640px 461px, transparent 120px, #000 170px)');
    expect(CLEAR_SOFT_PX).toBe(50);
    expect(holeMask({ x: 0, y: 0 }, -5)).toContain('transparent 0px');
  });

  it('the ring is bright as it leaves and gone before the end', () => {
    expect(ringOpacity(0)).toBe(1);
    expect(ringOpacity(0.5)).toBeCloseTo(1 - 0.575, 9);
    expect(ringOpacity(1)).toBe(0);
    expect(ringOpacity(0.9)).toBe(0);
  });
});

describe('Veil', () => {
  it('the clock comes forward from 106% to 100%', () => {
    expect(VEIL_CLOCK_FROM).toBe(1.06);
    expect(veilClockScale(0)).toBeCloseTo(1.06, 9);
    expect(veilClockScale(1)).toBe(1);
    expect(veilClockScale(0.5)).toBeCloseTo(1.03, 9);
  });

  it('eases in and out', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 9);
    expect(easeInOut(0.25)).toBeLessThan(0.25);
    expect(easeInOut(0.75)).toBeGreaterThan(0.75);
  });
});

describe('the durations by motion mode', () => {
  it('600 and 900 ms; a fade of at most 150 ms when reduced; instant when off', () => {
    expect([VEIL_MS, CLEAR_MS]).toEqual([600, 900]);
    expect([veilMs('full'), clearMs('full')]).toEqual([600, 900]);
    expect([veilMs('reduced'), clearMs('reduced')]).toEqual([REDUCED_MS, REDUCED_MS]);
    expect(REDUCED_MS).toBeLessThanOrEqual(150);
    expect([veilMs('off'), clearMs('off')]).toEqual([0, 0]);
  });
});

describe('runTween', () => {
  afterEach(() => vi.useRealTimers());

  it('runs frames from 0 to 1 and then done, and cancel stops it', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout'] });
    const ts: number[] = [];
    const done = vi.fn();
    runTween(100, (t) => ts.push(t), done);
    expect(ts).toEqual([0]);
    vi.advanceTimersByTime(60);
    expect(ts.at(-1)!).toBeGreaterThan(0);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(ts.at(-1)).toBe(1);
    expect(done).toHaveBeenCalledTimes(1);

    const seen = vi.fn();
    const cancel = runTween(100, seen, done);
    cancel();
    vi.advanceTimersByTime(300);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('zero milliseconds is the last frame and done, at once', () => {
    const frame = vi.fn();
    const done = vi.fn();
    runTween(0, frame, done);
    expect(frame).toHaveBeenCalledWith(1);
    expect(done).toHaveBeenCalledTimes(1);
  });
});

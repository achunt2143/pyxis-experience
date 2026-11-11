import { describe, expect, it } from 'vitest';
import { PHASE_PALETTES, STATIC_HEX, paletteFromHex } from '../palettes';
import { WARP_PERIOD_S, meanColor, sampleField, scene, warp } from '../scene';

const palette = PHASE_PALETTES.day;

describe('scene', () => {
  it('is deterministic', () => {
    for (const t of [0, 1234.5, 86_400_000, 7 * 86_400_000 + 17]) {
      expect(scene(t, palette)).toEqual(scene(t, palette));
    }
  });

  it('moves with time', () => {
    const a = scene(0, palette);
    const b = scene(30_000, palette);
    expect(a.masses.some((m, i) => Math.abs(m.x - b.masses[i].x) > 0.01)).toBe(true);
    expect(a.warpPhase).not.toBe(b.warpPhase);
  });

  it('keeps every mass about on screen, for a week of flow', () => {
    for (let s = 0; s < 7 * 86_400; s += 397) {
      for (const m of scene(s * 1000, palette).masses) {
        expect(m.x).toBeGreaterThan(-0.05);
        expect(m.x).toBeLessThan(1.05);
        expect(m.y).toBeGreaterThan(-0.05);
        expect(m.y).toBeLessThan(1.05);
      }
    }
  });

  it('moves subtly: a few px a second on a 1280 px screen', () => {
    const W = 1280;
    const H = 800;
    let peak = 0;
    let sum = 0;
    let n = 0;
    for (let s = 0; s < 3600; s += 0.5) {
      const a = scene(s * 1000, palette).masses;
      const b = scene((s + 0.1) * 1000, palette).masses;
      a.forEach((m, i) => {
        const v = Math.hypot((b[i].x - m.x) * W, (b[i].y - m.y) * H) / 0.1;
        peak = Math.max(peak, v);
        sum += v;
        n++;
      });
    }
    // The plan: 2 to 6 px/s; at 10 fps a frame moves under a pixel.
    expect(sum / n).toBeGreaterThan(2);
    expect(sum / n).toBeLessThan(6);
    expect(peak).toBeLessThan(10);
  });

  it('wraps the warp phase seamlessly', () => {
    // Ten turns of the warp is where the phase wraps.
    const wrapMs = WARP_PERIOD_S * 10 * 1000;
    const before = scene(wrapMs - 1, palette);
    const after = scene(wrapMs + 1, palette);
    const [ax, ay] = warp(0.4, 0.6, before.warpPhase, before.warpAmount);
    const [bx, by] = warp(0.4, 0.6, after.warpPhase, after.warpAmount);
    expect(Math.abs(ax - bx)).toBeLessThan(1e-4);
    expect(Math.abs(ay - by)).toBeLessThan(1e-4);
    expect(after.warpPhase).toBeLessThan(0.01);
  });

  it('samples colours inside the palette', () => {
    const p = paletteFromHex(STATIC_HEX.forest);
    const sc = scene(42_000, p);
    const Ls = p.map((c) => c[0]);
    for (let y = 0; y <= 1; y += 0.1) {
      for (let x = 0; x <= 1; x += 0.1) {
        const [L] = sampleField(sc, x, y, 1.6);
        expect(L).toBeGreaterThanOrEqual(Math.min(...Ls) - 1e-9);
        expect(L).toBeLessThanOrEqual(Math.max(...Ls) + 1e-9);
      }
    }
    // Near a mass, its colour dominates.
    const m = sc.masses[2];
    const near = sampleField({ ...sc, warpAmount: 0 }, m.x, m.y, 1.6);
    expect(Math.abs(near[0] - m.color[0])).toBeLessThan(Math.abs(meanColor(p)[0] - m.color[0]) + 0.02);
  });
});

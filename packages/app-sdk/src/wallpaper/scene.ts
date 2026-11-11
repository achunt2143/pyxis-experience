/**
 * The flowing wallpaper's scene: where each colour mass is at a moment.
 *
 * Pure and deterministic: the same flow time and palette give the same
 * scene, so both backends draw the same picture and the tests can pin it.
 * Each mass drifts on a sum of two sines per axis with periods between 60
 * and 140 s that share no small common multiple, so the field never visibly
 * repeats; peak speeds are a few px a second on a 1280 px screen ("subtle":
 * the whole field takes about a minute to look different).
 *
 * Coordinates are fractions of the output: x of its width, y of its height.
 * A radius is a fraction of the output's longer side, the gaussian's sigma.
 */
import { MASS_COUNT, oklabToRgb, type Oklab, type Palette, type Rgb } from './palettes';

interface Axis {
  base: number;
  /** Two sines: amplitude (fraction), period (s), phase (rad). */
  a1: number;
  p1: number;
  f1: number;
  a2: number;
  p2: number;
  f2: number;
}

interface MassPath {
  x: Axis;
  y: Axis;
  radius: number;
  /** The radius breathes by this fraction, over `breathe` seconds. */
  swell: number;
  breathe: number;
}

/**
 * Roles as in palettes.ts: 0 the broad sky (upper left), 1 the second sky
 * tone (upper right), 2 the warm accent (centre, low), 3 the glow low in the
 * frame, 4 the deep anchor (lower right).
 */
const PATHS: readonly MassPath[] = [
  {
    x: { base: 0.24, a1: 0.0525, p1: 97, f1: 0.0, a2: 0.03, p2: 61, f2: 1.3 },
    y: { base: 0.22, a1: 0.045, p1: 113, f1: 2.1, a2: 0.0225, p2: 71, f2: 0.4 },
    radius: 0.24,
    swell: 0.06,
    breathe: 89,
  },
  {
    x: { base: 0.8, a1: 0.045, p1: 127, f1: 4.0, a2: 0.0263, p2: 67, f2: 2.6 },
    y: { base: 0.26, a1: 0.0525, p1: 83, f1: 1.1, a2: 0.0225, p2: 139, f2: 5.0 },
    radius: 0.21,
    swell: 0.07,
    breathe: 107,
  },
  {
    x: { base: 0.56, a1: 0.06, p1: 73, f1: 2.7, a2: 0.03, p2: 131, f2: 0.9 },
    y: { base: 0.62, a1: 0.045, p1: 101, f1: 3.3, a2: 0.0263, p2: 63, f2: 4.4 },
    radius: 0.17,
    swell: 0.09,
    breathe: 79,
  },
  {
    x: { base: 0.3, a1: 0.0525, p1: 119, f1: 5.2, a2: 0.03, p2: 77, f2: 3.0 },
    y: { base: 0.9, a1: 0.0263, p1: 91, f1: 0.6, a2: 0.015, p2: 137, f2: 2.2 },
    radius: 0.2,
    swell: 0.06,
    breathe: 97,
  },
  {
    x: { base: 0.86, a1: 0.0375, p1: 109, f1: 1.8, a2: 0.0263, p2: 69, f2: 5.7 },
    y: { base: 0.84, a1: 0.0375, p1: 79, f1: 4.6, a2: 0.0225, p2: 123, f2: 1.5 },
    radius: 0.22,
    swell: 0.05,
    breathe: 113,
  },
];

const TAU = Math.PI * 2;

function axisAt(a: Axis, s: number): number {
  return a.base + a.a1 * Math.sin((TAU * s) / a.p1 + a.f1) + a.a2 * Math.sin((TAU * s) / a.p2 + a.f2);
}

export interface Mass {
  x: number;
  y: number;
  radius: number;
  color: Oklab;
  rgb: Rgb;
}

export interface Scene {
  masses: Mass[];
  /**
   * Phase of the domain warp, radians; advances one turn per WARP_PERIOD_S.
   * Wrapped at 10 turns: every multiplier `warp()` applies to it is a whole
   * number of tenths, so the wrap is seamless, and a shader's float keeps
   * its precision however long the wallpaper has flowed.
   */
  warpPhase: number;
  /** Strength of the domain warp, as a fraction of the output. */
  warpAmount: number;
}

export const WARP_PERIOD_S = 131;
export const WARP_AMOUNT = 0.1;

/** The scene at `flowMs` of flow time (milliseconds the wallpaper has spent flowing). */
export function scene(flowMs: number, palette: Palette): Scene {
  if (palette.length !== MASS_COUNT) throw new Error(`a palette is ${MASS_COUNT} colours`);
  const s = flowMs / 1000;
  return {
    masses: PATHS.map((p, i) => ({
      x: axisAt(p.x, s),
      y: axisAt(p.y, s),
      radius: p.radius * (1 + p.swell * Math.sin((TAU * s) / p.breathe + i)),
      color: palette[i],
      rgb: oklabToRgb(palette[i]),
    })),
    warpPhase: ((TAU * s) / WARP_PERIOD_S) % (10 * TAU),
    warpAmount: WARP_AMOUNT,
  };
}

/**
 * The domain warp, the same maths as the shader's `warp()`: two octaves of
 * sines, low frequency, so edges between colours curl rather than read as
 * circles. Input and output in output fractions, x scaled by the aspect.
 */
export function warp(x: number, y: number, phase: number, amount: number): [number, number] {
  const wx1 = Math.sin(y * 4.3 + phase) + Math.sin(x * 2.9 - phase * 0.7);
  const wy1 = Math.cos(x * 3.7 - phase * 1.3) + Math.sin(y * 3.1 + phase);
  const qx = x + amount * 0.5 * wx1;
  const qy = y + amount * 0.5 * wy1;
  const wx2 = Math.sin(qy * 8.9 - phase * 0.9 + 1.7);
  const wy2 = Math.cos(qx * 7.9 + phase * 1.1 + 0.3);
  return [qx + amount * 0.35 * wx2, qy + amount * 0.35 * wy2];
}

/**
 * The colour at a point, the same maths as the shader: gaussian weights,
 * the colours averaged in OKLab. `aspect` is width / height. A reference
 * for tests and for anything that needs one pixel's colour.
 */
export function sampleField(sc: Scene, x: number, y: number, aspect: number): Oklab {
  const [wx, wy] = warp(x * aspect, y, sc.warpPhase, sc.warpAmount);
  const long = Math.max(aspect, 1);
  let L = 0;
  let A = 0;
  let B = 0;
  let total = 0;
  for (const m of sc.masses) {
    const dx = wx - m.x * aspect;
    const dy = wy - m.y;
    const sigma = m.radius * long;
    const w = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)) + 1e-4;
    L += w * m.color[0];
    A += w * m.color[1];
    B += w * m.color[2];
    total += w;
  }
  return [L / total, A / total, B / total];
}

/** The palette's mean colour: what a CSS backend lays underneath its masses. */
export function meanColor(palette: Palette): Oklab {
  let L = 0;
  let a = 0;
  let b = 0;
  for (const c of palette) {
    L += c[0];
    a += c[1];
    b += c[2];
  }
  return [L / palette.length, a / palette.length, b / palette.length];
}

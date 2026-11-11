/**
 * Colour for the flowing wallpapers: OKLab maths, Daylight's phase
 * keyframes, and the fixed palettes of the four classic wallpapers.
 *
 * Every palette is five colours, one per colour mass, and a mass keeps its
 * role across Daylight's phases (mass 0 is the broad sky, mass 2 the warm
 * accent), so a phase change reads as colours flowing rather than swapping.
 * Mixing is in OKLab: sRGB goes muddy between complementary hues, which is
 * exactly where a sunset lives.
 */

/** [L, a, b] in OKLab. */
export type Oklab = readonly [number, number, number];
/** [r, g, b], each 0..1, gamma-encoded sRGB. */
export type Rgb = readonly [number, number, number];

export const MASS_COUNT = 5;
/** Five colours, mass i first to last. */
export type Palette = readonly Oklab[];

function toLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** `#rrggbb` (or `#rgb`) to sRGB 0..1. */
export function hexToRgb(hex: string): Rgb {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const c = (x: number) => Math.round(clamp01(x) * 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Björn Ottosson's OKLab, from gamma-encoded sRGB. */
export function rgbToOklab([r, g, b]: Rgb): Oklab {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab to gamma-encoded sRGB, clamped into gamut. */
export function oklabToRgb([L, a, b]: Oklab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    clamp01(fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clamp01(fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clamp01(fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ];
}

export const hexToOklab = (hex: string): Oklab => rgbToOklab(hexToRgb(hex));
export const oklabToHex = (c: Oklab): string => rgbToHex(oklabToRgb(c));

export function mixOklab(a: Oklab, b: Oklab, t: number): Oklab {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function mixPalette(a: Palette, b: Palette, t: number): Palette {
  return a.map((c, i) => mixOklab(c, b[i], t));
}

export function paletteFromHex(hex: readonly string[]): Palette {
  if (hex.length !== MASS_COUNT) throw new Error(`a palette is ${MASS_COUNT} colours, got ${hex.length}`);
  return hex.map(hexToOklab);
}

export function paletteToHex(p: Palette): string[] {
  return p.map(oklabToHex);
}

/** Ken Perlin's smootherstep on 0..1: zero first and second derivatives at both ends. */
export function smootherstep(t: number): number {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

// ---- Daylight's phases ----

export type DaylightPhase =
  | 'night'
  | 'blue'
  | 'dawn'
  | 'goldenMorning'
  | 'day'
  | 'goldenEvening'
  | 'dusk';

/**
 * Roles, mass 0 to 4: the broad sky; the second sky tone; the warm accent;
 * a glow low in the frame; the deep anchor.
 */
export const PHASE_HEX: Record<DaylightPhase, readonly string[]> = {
  night: ['#0b1026', '#1b2350', '#2a1f4d', '#0f3b4a', '#141a3a'],
  blue: ['#1d2b5c', '#3a4d8f', '#6b5ea8', '#2c6e8f', '#24366e'],
  dawn: ['#ff9a8b', '#ffc3a0', '#a18cd1', '#fbc2eb', '#6c7fd8'],
  goldenMorning: ['#ffd29d', '#8fd3f4', '#9ef0c0', '#fff1c1', '#7fb8f0'],
  day: ['#4facfe', '#38e0f5', '#a6f5d6', '#dff4ff', '#5b8cff'],
  goldenEvening: ['#f6c365', '#fd9a6e', '#e77fd8', '#ffd9a0', '#9a6cf0'],
  dusk: ['#ee9ca7', '#8e54e9', '#4776e6', '#ffc6cf', '#3a2f7a'],
};

export const PHASE_PALETTES: Record<DaylightPhase, Palette> = Object.fromEntries(
  Object.entries(PHASE_HEX).map(([k, v]) => [k, paletteFromHex(v)])
) as Record<DaylightPhase, Palette>;

export interface PhaseKey {
  /** Sun elevation, degrees. */
  elevation: number;
  phase: DaylightPhase;
}

/** Keyframes on the sun's elevation, rising. Below the first and above the last, held. */
export const MORNING_KEYS: readonly PhaseKey[] = [
  { elevation: -18, phase: 'night' },
  { elevation: -8, phase: 'blue' },
  { elevation: 0, phase: 'dawn' },
  { elevation: 9, phase: 'goldenMorning' },
  { elevation: 25, phase: 'day' },
];

export const EVENING_KEYS: readonly PhaseKey[] = [
  { elevation: -18, phase: 'night' },
  { elevation: -8, phase: 'blue' },
  { elevation: 0, phase: 'dusk' },
  { elevation: 9, phase: 'goldenEvening' },
  { elevation: 25, phase: 'day' },
];

// ---- The classic wallpapers, as fixed palettes on the same engine ----

export const STATIC_HEX = {
  aurora: ['#667eea', '#764ba2', '#8f6fe0', '#4fb3d9', '#3f3f9e'],
  sunset: ['#ff7e5f', '#feb47b', '#f0607a', '#ffd7a1', '#c2546e'],
  forest: ['#134e5e', '#71b280', '#2f7a6a', '#b5dca0', '#0d3640'],
  mochi: ['#4a8bc2', '#6aaedb', '#ffd479', '#bfe0f5', '#35689a'],
} as const satisfies Record<string, readonly string[]>;

export type StaticWallpaperId = keyof typeof STATIC_HEX;

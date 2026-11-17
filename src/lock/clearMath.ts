/**
 * Veil (lock) and Clear (unlock): the numbers, pure.
 *
 * Both sides use these (docs/internal/pyxis-glass-and-lock-plan.md,
 * "Contracts"): Evo draws the windows' half of each from snapshots, the page
 * draws its own. Veil is 600 ms, the opaque lock layer fading in while the
 * clock comes forward from 106%. Clear is 900 ms from the password field's
 * centre: the layer opens a hole of radius `r(t) = D(0.5t + 0.5t²)`, with a
 * 50 px soft edge and a ring of light at `r`, and the desktop is already
 * there beneath, coming into focus. Reduced: fades of at most 150 ms. Off:
 * instant.
 */
import type { AnimationMode } from '@pyxis/app-sdk';

export const VEIL_MS = 600;
export const CLEAR_MS = 900;
export const REDUCED_MS = 150;
/** The hole's soft edge, px. */
export const CLEAR_SOFT_PX = 50;
/** `D` is the farthest corner's distance plus this, so the soft edge clears it. */
export const CLEAR_PAD_PX = 60;
/** The clock's scale at the start of Veil. */
export const VEIL_CLOCK_FROM = 1.06;

export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** How long each takes in a motion mode. */
export function veilMs(mode: AnimationMode): number {
  return mode === 'full' ? VEIL_MS : mode === 'reduced' ? REDUCED_MS : 0;
}
export function clearMs(mode: AnimationMode): number {
  return mode === 'full' ? CLEAR_MS : mode === 'reduced' ? REDUCED_MS : 0;
}

/** `D`: the distance from `origin` to the farthest screen corner, plus the soft edge's pad. */
export function clearReach(origin: Point, screen: Size): number {
  const far = Math.max(
    Math.hypot(origin.x, origin.y),
    Math.hypot(screen.width - origin.x, origin.y),
    Math.hypot(origin.x, screen.height - origin.y),
    Math.hypot(screen.width - origin.x, screen.height - origin.y)
  );
  return far + CLEAR_PAD_PX;
}

/** The hole's radius at progress `t` (0..1): slow at first, quickening past the corners, like a released wave. */
export function clearRadius(t: number, reach: number): number {
  const u = clamp01(t);
  return reach * (0.5 * u + 0.5 * u * u);
}

/** The ring's opacity: full as it leaves the field, gone just before the end. */
export function ringOpacity(t: number): number {
  return Math.max(0, 1 - clamp01(t) * 1.15);
}

/** CSS mask that is clear inside `radius` and opaque `soft` px beyond it. */
export function holeMask(origin: Point, radius: number, soft = CLEAR_SOFT_PX): string {
  const r = Math.max(0, radius);
  return `radial-gradient(circle at ${origin.x}px ${origin.y}px, transparent ${r}px, #000 ${r + soft}px)`;
}

/** Veil's easing (the layer's fade and the clock's approach share it). */
export function easeInOut(t: number): number {
  const u = clamp01(t);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/** The clock's scale during Veil at eased progress `e`: 1.06 coming to 1. */
export function veilClockScale(e: number): number {
  return VEIL_CLOCK_FROM - (VEIL_CLOCK_FROM - 1) * clamp01(e);
}

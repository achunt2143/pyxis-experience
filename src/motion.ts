import type { Transition } from 'framer-motion';
import type { AnimationMode } from '@pyxis/app-sdk';

export type { AnimationMode };

/**
 * Bloom's motion vocabulary. The names and values are the motion spec in
 * docs/internal/evo-animation-plan.md (geckos repo), which Evo's
 * `evo/src/anim/` mirrors; change one side and the other must follow.
 *
 * Durations are seconds, as framer-motion wants them (the spec table is in
 * milliseconds). Components take a token through `useMotion().tr(...)`
 * (MotionProvider.tsx), which resolves it for the user's animation mode:
 * `full` as written, `reduced` opacity-only and short, `off` instant.
 */

export type Bezier = readonly [number, number, number, number];

/** Spec durations at scale 1, in seconds. */
export const DURATION = {
  open: 0.26,
  close: 0.18,
  popupIn: 0.12,
  popupOut: 0.08,
  minimize: 0.32,
  restore: 0.3,
  geometry: 0.28,
  focus: 0.15,
  lift: 0.12,
  /** Ceiling for any transition in `reduced` mode. */
  reduced: 0.15,
} as const;

/** Gap between successive cards of an entrance (the overview), in seconds. */
export const STAGGER = 0.03;

/** Spec curves. */
export const EASE = {
  /** Entrances: fast start, long settle. The house curve. */
  expoOut: [0.16, 1, 0.3, 1],
  /** Exits: slow start, leaves quickly. */
  accelerate: [0.3, 0, 0.8, 0.15],
  /** State changes: focus, lift, hover. */
  standard: [0.2, 0, 0, 1],
} as const satisfies Record<string, Bezier>;

/**
 * Spec springs. framer-motion's (stiffness, damping, mass) with the spec's
 * damping ratio ζ = damping / (2·√(stiffness·mass)): minimize/restore ζ=0.9,
 * geometry ζ=1.0. Nothing here overshoots by more than a hair; a window or a
 * card that bounces reads as a toy.
 */
export const SPRING = {
  /** ζ = 0.9: settles in about 320 ms. */
  minimize: { type: 'spring', stiffness: 260, damping: 29, mass: 1 },
  /** Same spring, run back. */
  restore: { type: 'spring', stiffness: 260, damping: 29, mass: 1 },
  /** ζ = 1.0 (critical): maximize, fullscreen, fit, layout moves. */
  geometry: { type: 'spring', stiffness: 300, damping: 34.64, mass: 1 },
} as const satisfies Record<string, Transition>;

/** Ready-to-use transitions, one per spec token that Bloom draws. */
export const TRANSITION = {
  open: { duration: DURATION.open, ease: EASE.expoOut },
  close: { duration: DURATION.close, ease: EASE.accelerate },
  popupIn: { duration: DURATION.popupIn, ease: EASE.expoOut },
  popupOut: { duration: DURATION.popupOut, ease: 'linear' },
  minimize: SPRING.minimize,
  restore: SPRING.restore,
  geometry: SPRING.geometry,
  focus: { duration: DURATION.focus, ease: EASE.standard },
  lift: { duration: DURATION.lift, ease: EASE.standard },
  /** What `reduced` and `off` fall back to: no curve to speak of. */
  reduced: { duration: DURATION.reduced, ease: 'linear' },
} as const satisfies Record<string, Transition>;

/**
 * Lumen, Bloom's half (docs/internal/evo-animation-plan.md, "Lumen"). Evo
 * draws the windows; the shell answers with light of its own:
 *
 * - `ripple`: on `MinimizeLanded` the dock icon rings in its app's hue, the
 *   ring spreading `spreadPx` past the icon and fading.
 * - `dip`: the icon's glyph gives under the landing, a damped `px` dip.
 * - `wallpaper`: show desktop pushes the wallpaper in a little while the
 *   windows recede, and lets it back out when they return.
 */
export const LUMEN = {
  ripple: { duration: 0.62, spreadPx: 14, ease: EASE.expoOut, from: 0.85 },
  dip: { duration: 0.55, px: 5, keyframes: [0, 1, -0.32, 0.12, 0], times: [0, 0.22, 0.5, 0.76, 1] },
  wallpaper: { duration: 0.7, scale: 1.035, ease: [0.42, 0, 0.58, 1] as Bezier },
} as const;

/** The "starting" dot's pulse. A loop, so `full` only: no spec token. */
export const PULSE: Transition = { duration: 1.2, repeat: Infinity };

/** A shell scrim (backdrop) fades with the panel it sits behind. */
export const SCRIM_IN: Transition = { duration: DURATION.open, ease: EASE.standard };
export const SCRIM_OUT: Transition = { duration: DURATION.close, ease: EASE.standard };

/** Entrance offset for panels: a few pixels of travel and a hair of scale. */
export const PANEL_ENTER = { opacity: 0, y: 8, scale: 0.97 } as const;
export const PANEL_REST = { opacity: 1, y: 0, scale: 1 } as const;

/**
 * A transition as the animation mode wants it. `full` is the token as
 * written; `reduced` swaps springs and long curves for a linear fade of at
 * most DURATION.reduced; `off` is instant.
 */
export function resolveTransition(t: Transition, mode: AnimationMode): Transition {
  if (mode === 'full') return t;
  if (mode === 'off') return { duration: 0 };
  const own = (t as { duration?: number }).duration;
  const duration = Math.min(typeof own === 'number' ? own : DURATION.reduced, DURATION.reduced);
  return { duration, ease: 'linear' };
}

/**
 * The same for a target: `reduced` keeps opacity and drops every transform,
 * since the spec allows no scale or translate there. (`off` keeps the target
 * too; its transition is instant, so only the end state shows.)
 */
export function resolveTarget<T extends Record<string, unknown>>(target: T, mode: AnimationMode): Partial<T> {
  if (mode !== 'reduced') return target;
  return ('opacity' in target ? { opacity: target.opacity } : {}) as Partial<T>;
}

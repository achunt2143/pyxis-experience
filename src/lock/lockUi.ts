import { formatClockTime, type ClockState } from '@pyxis/app-sdk';
import type { Point } from './clearMath';

/** The id `-moz-element()` borrows: the lock's own wallpaper, behind the digits. */
export const LOCK_WALLPAPER_ID = 'lock-wallpaper';

/** The accent when Echo names none (the mockup's violet). */
export const DEFAULT_ACCENT = '#7c6cf0';

/** A user's accent as Echo gave it, or the default when it isn't a `#rrggbb`. */
export function accentOf(accent: string | undefined | null): string {
  return /^#[0-9a-fA-F]{6}$/.test(accent ?? '') ? accent! : DEFAULT_ACCENT;
}

/** "6:42" (12-hour, no leading zero, no meridiem: the day's line has room for neither) or "18:42". */
export function bigTime(clock: Pick<ClockState, 'hour' | 'minute'>, hour24: boolean): string {
  const text = formatClockTime(clock, hour24);
  return hour24 ? text : text.split(' ')[0].replace(/^0(?=\d:)/, '');
}

/** Where Clear opens from when the field was never on screen (press-to-enter): the field's usual place. */
export function defaultOrigin(): Point {
  return { x: window.innerWidth / 2, y: Math.round(window.innerHeight * 0.565) };
}

export type ActiveLockPhase = 'off' | 'veil' | 'locked' | 'clear';

let activeLockPhase: ActiveLockPhase = 'off';
const lockPhaseListeners = new Set<() => void>();

export function getActiveLockPhase(): ActiveLockPhase {
  return activeLockPhase;
}

export function setActiveLockPhase(phase: ActiveLockPhase): void {
  if (activeLockPhase === phase) return;
  activeLockPhase = phase;
  for (const listener of lockPhaseListeners) {
    listener();
  }
}

export function subscribeActiveLockPhase(listener: () => void): () => void {
  lockPhaseListeners.add(listener);
  return () => {
    lockPhaseListeners.delete(listener);
  };
}

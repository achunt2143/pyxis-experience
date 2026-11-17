import type { UnlockResult } from '@pyxis/app-sdk';

/**
 * The lock screen's state machine, pure: a model, the events the page hears,
 * and the one effect it asks for (try this password). No clock of its own
 * (every event carries `now`), no IPC, no DOM, so the whole walk from rest to
 * unlocked is tested without a screen. The component feeds it keys, pointer
 * touches, a once-a-second tick and Echo's answers, and draws `stateName`.
 *
 * Phases (plan: docs/internal/pyxis-glass-and-lock-plan.md, Part 2):
 * - `rest`: the wallpaper and the clock. Any key or click wakes it, and the
 *   waking key is the password's first character ("Just type").
 * - `awake`: the avatar and the field; characters drip in.
 * - `verify`: Echo is checking. Keys are ignored; the button is a spinner.
 * - `wrong`: the field shakes and the drops burn away (about 700 ms), then
 *   back to `awake`, or to `wait` when Echo has started a wait. Keys typed
 *   while it burns are kept for the next try.
 * - `wait`: Echo's rate limit; a ring counts down to `retryAtMs`.
 * - `unlocking`: `LockChanged {locked: false}` arrived; Clear is running.
 * - `ambient`: 30 s untouched: the wallpaper still and dimmed, the clock an
 *   outline. Any touch wakes it.
 *
 * With no password set the screen is press-to-enter: it shows as
 * `no-password` (a `rest` with another hint), Enter asks Echo to unlock with
 * an empty password, and there is no field.
 */

export type LockPhase = 'rest' | 'awake' | 'verify' | 'wrong' | 'wait' | 'unlocking' | 'ambient';
/** What `data-lock-state` says: the phase, with `rest` named `no-password` when none is set. */
export type LockStateName = LockPhase | 'no-password';

/** Untouched this long, the lock screen goes ambient. */
export const AMBIENT_AFTER_MS = 30_000;
/** How long a wrong try's burn lasts before the field is ready again. */
export const WRONG_BURN_MS = 700;
/** Longest password the field takes (a paste-by-key-repeat guard, not a policy). */
export const MAX_PASSWORD_LENGTH = 256;

export interface LockModel {
  phase: LockPhase;
  /** What is typed; during `wrong`, what was tried (it is burning). */
  password: string;
  /** Keys typed while `wrong` burns, which become the next try. */
  queued: string;
  hasPassword: boolean;
  /** Epoch ms the next try is allowed, while Echo says wait. */
  retryAtMs: number | null;
  /** When this wait was first heard of (the ring drains from here to `retryAtMs`). */
  waitStartMs: number | null;
  attemptsLeft: number | null;
  /** The last try was wrong and nothing has been typed since ("Not quite. Try again."). */
  notQuite: boolean;
  /** Unlock succeeded on IPC, but LockChanged was not confirmed within grace timeout. */
  unconfirmed: boolean;
  /** When the screen was last touched (`now` of the last key or pointer). */
  lastTouch: number;
}

export type LockEvent =
  | { type: 'key'; key: string; now: number }
  | { type: 'paste'; text: string; now: number }
  | { type: 'pointer'; now: number }
  | { type: 'tick'; now: number }
  /** What `getState` knows (at start, and again after a lock). */
  | { type: 'session'; hasPassword: boolean; retryAtMs: number | null; attemptsLeft: number | null; resetPassword?: boolean; now: number }
  | { type: 'result'; result: UnlockResult; now: number }
  /** Grace timeout expired without confirmation that the session unlocked. */
  | { type: 'unlockTimeout'; hasPassword: boolean; retryAtMs: number | null; attemptsLeft: number | null; now: number }
  /** The wrong try's burn is over. */
  | { type: 'burned'; now: number }
  /** `LockChanged {locked: false}`: Clear begins. */
  | { type: 'unlocked' };

/** The one thing the machine asks the outside for. */
export type LockEffect = { type: 'unlock'; password: string } | null;

export interface Step {
  model: LockModel;
  effect: LockEffect;
}

export function initialModel(now: number, hasPassword = true): LockModel {
  return {
    phase: 'rest',
    password: '',
    queued: '',
    hasPassword,
    retryAtMs: null,
    waitStartMs: null,
    attemptsLeft: null,
    notQuite: false,
    unconfirmed: false,
    lastTouch: now,
  };
}

export function stateName(model: LockModel): LockStateName {
  return model.phase === 'rest' && !model.hasPassword ? 'no-password' : model.phase;
}

/** Echo says wait, and the wait isn't over. */
export function isWaiting(model: Pick<LockModel, 'retryAtMs'>, now: number): boolean {
  return model.retryAtMs !== null && model.retryAtMs > now;
}

/** A wait that Echo reports differently from the one held is a new one, starting now. */
function startOf(model: LockModel, retryAtMs: number | null, now: number): number | null {
  if (retryAtMs === null) return null;
  return retryAtMs === model.retryAtMs && model.waitStartMs !== null ? model.waitStartMs : now;
}

/** How much of a wait is left, 0..1 (1 when it was just heard of): what the ring shows. */
export function waitFraction(model: Pick<LockModel, 'retryAtMs' | 'waitStartMs'>, now: number): number {
  if (model.retryAtMs === null || model.waitStartMs === null) return 0;
  const total = Math.max(1, model.retryAtMs - model.waitStartMs);
  return Math.min(1, Math.max(0, (model.retryAtMs - now) / total));
}

/** Seconds left of a wait, rounded up (never shows 0 while it is still running). */
export function waitSecondsLeft(retryAtMs: number, now: number): number {
  return Math.max(0, Math.ceil((retryAtMs - now) / 1000));
}

/** "0:27", "12:05". */
export function formatWait(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'OS', 'Super', 'Hyper', 'CapsLock', 'NumLock', 'ScrollLock', 'Fn', 'FnLock', 'Dead', 'Process', 'Unidentified']);

/** A key that types a character (a space included). */
export const isPrintable = (key: string): boolean => key.length === 1 || (key.length === 2 && key.codePointAt(0)! > 0xffff);

const step = (model: LockModel, effect: LockEffect = null): Step => ({ model, effect });

/** Wake from rest or ambient: to the field (or the wait), with `first` already typed. */
function wake(model: LockModel, now: number, first: string): Step {
  if (isWaiting(model, now)) {
    return step({ ...model, phase: 'wait', password: '', queued: '', unconfirmed: false, lastTouch: now });
  }
  return step({
    ...model,
    phase: 'awake',
    password: first.slice(0, MAX_PASSWORD_LENGTH),
    queued: '',
    notQuite: false,
    unconfirmed: false,
    lastTouch: now,
  });
}

function sanitizePastedText(text: string): string {
  return [...text]
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join('');
}

export function reduce(model: LockModel, event: LockEvent): Step {
  switch (event.type) {
    case 'unlocked':
      return step({ ...model, phase: 'unlocking', unconfirmed: false });

    case 'session': {
      let next: LockModel = {
        ...model,
        hasPassword: event.hasPassword,
        retryAtMs: event.retryAtMs,
        waitStartMs: startOf(model, event.retryAtMs, event.now),
        attemptsLeft: event.attemptsLeft,
      };
      if (event.resetPassword) {
        next = {
          ...next,
          password: '',
          queued: '',
          notQuite: false,
          unconfirmed: false,
          phase: next.phase === 'wrong' ? (event.hasPassword ? 'awake' : 'rest') : next.phase,
        };
      }
      // Awake, and Echo says a wait is on (a reload mid-wait, a try from elsewhere).
      if (next.phase === 'awake' && isWaiting(next, event.now)) {
        next = { ...next, phase: 'wait', password: '', unconfirmed: false };
      }
      // A password was set while the field was up: it is a real lock now, nothing to type into yet.
      if (!event.hasPassword && next.phase === 'awake') {
        next = { ...next, phase: 'rest', password: '', unconfirmed: false };
      }
      return step(next);
    }

    case 'pointer': {
      const touched = { ...model, lastTouch: event.now, unconfirmed: false };
      if (model.phase === 'ambient' || model.phase === 'rest') {
        // A click wakes it; with no password there is nothing to type, and a click must not unlock.
        return model.hasPassword
          ? wake({ ...touched, phase: 'rest' }, event.now, '')
          : step({ ...touched, phase: 'rest' });
      }
      return step(touched);
    }

    case 'key':
      return onKey(model, event.key, event.now);

    case 'paste': {
      const clean = sanitizePastedText(event.text);
      if (!clean) return step(model);
      const touched = { ...model, lastTouch: event.now, unconfirmed: false };
      switch (model.phase) {
        case 'ambient':
        case 'rest':
          if (!model.hasPassword) return step({ ...touched, phase: 'rest' });
          return wake({ ...touched, phase: 'rest' }, event.now, clean);
        case 'awake':
          return step({
            ...touched,
            password: (model.password + clean).slice(0, MAX_PASSWORD_LENGTH),
            notQuite: false,
          });
        case 'wrong':
          return step({
            ...touched,
            queued: (model.queued + clean).slice(0, MAX_PASSWORD_LENGTH),
          });
        case 'wait':
          return step(touched);
        case 'verify':
        case 'unlocking':
          return step(model);
      }
      break;
    }

    case 'tick': {
      const { now } = event;
      if (model.phase === 'wait' && model.retryAtMs !== null && model.retryAtMs <= now) {
        // The wait is over; the field is ready (unless the screen has gone quiet: it checks again on waking).
        return step({ ...model, phase: 'awake', password: '', retryAtMs: null, notQuite: false, unconfirmed: false });
      }
      const quiet = now - model.lastTouch >= AMBIENT_AFTER_MS;
      if (quiet && (model.phase === 'rest' || model.phase === 'awake' || model.phase === 'wait')) {
        return step({ ...model, phase: 'ambient', password: '', queued: '', notQuite: false, unconfirmed: false });
      }
      return step(model);
    }

    case 'result': {
      if (model.phase !== 'verify') return step(model);
      const { result, now } = event;
      if (result.ok) return step(model); // Clear starts when LockChanged says so
      if (result.reason === 'wait') {
        return step({
          ...model,
          phase: 'wait',
          password: '',
          queued: '',
          retryAtMs: result.retry_at_ms,
          waitStartMs: startOf(model, result.retry_at_ms, now),
          attemptsLeft: result.attempts_left,
          notQuite: false,
          unconfirmed: false,
          lastTouch: now,
        });
      }
      return step({
        ...model,
        phase: 'wrong',
        queued: '',
        retryAtMs: result.retry_at_ms,
        waitStartMs: startOf(model, result.retry_at_ms, now),
        attemptsLeft: result.attempts_left,
        notQuite: true,
        unconfirmed: false,
        lastTouch: now,
      });
    }

    case 'unlockTimeout': {
      if (model.phase !== 'verify') return step(model);
      const next: LockModel = {
        ...model,
        hasPassword: event.hasPassword,
        retryAtMs: event.retryAtMs,
        waitStartMs: startOf(model, event.retryAtMs, event.now),
        attemptsLeft: event.attemptsLeft,
        password: '',
        queued: '',
        notQuite: false,
        lastTouch: event.now,
      };
      if (isWaiting(next, event.now)) {
        return step({ ...next, phase: 'wait', unconfirmed: false });
      }
      return step({
        ...next,
        phase: event.hasPassword ? 'awake' : 'rest',
        unconfirmed: true,
      });
    }

    case 'burned': {
      if (model.phase !== 'wrong') return step(model);
      if (isWaiting(model, event.now)) {
        return step({ ...model, phase: 'wait', password: '', queued: '', lastTouch: event.now });
      }
      return step({ ...model, phase: 'awake', password: model.queued, queued: '', lastTouch: event.now });
    }
  }
}

function onKey(model: LockModel, key: string, now: number): Step {
  if (MODIFIER_KEYS.has(key) || key === 'Tab') return step(model);
  const touched = { ...model, lastTouch: now };

  switch (model.phase) {
    case 'ambient':
    case 'rest': {
      if (!model.hasPassword) {
        // Press-to-enter: Enter asks, anything else only wakes the display.
        if (key === 'Enter' && model.phase === 'rest') {
          return step({ ...touched, phase: 'verify', unconfirmed: false }, { type: 'unlock', password: '' });
        }
        return step({ ...touched, phase: 'rest', unconfirmed: false });
      }
      if (key === 'Escape' && model.phase === 'rest') return step(touched);
      return wake({ ...touched, phase: 'rest' }, now, isPrintable(key) ? key : '');
    }

    case 'awake': {
      if (isPrintable(key)) {
        return step({
          ...touched,
          password: (model.password + key).slice(0, MAX_PASSWORD_LENGTH),
          notQuite: false,
          unconfirmed: false,
        });
      }
      if (key === 'Backspace') {
        return step({
          ...touched,
          password: [...model.password].slice(0, -1).join(''),
          unconfirmed: false,
        });
      }
      if (key === 'Enter') {
        if (model.password.length === 0) return step(touched);
        return step(
          { ...touched, phase: 'verify', notQuite: false, unconfirmed: false },
          { type: 'unlock', password: model.password }
        );
      }
      if (key === 'Escape') {
        return step({ ...touched, phase: 'rest', password: '', notQuite: false, unconfirmed: false });
      }
      return step(touched);
    }

    case 'wrong': {
      if (isPrintable(key)) return step({ ...touched, queued: (model.queued + key).slice(0, MAX_PASSWORD_LENGTH) });
      if (key === 'Backspace') return step({ ...touched, queued: [...model.queued].slice(0, -1).join('') });
      return step(touched);
    }

    case 'wait':
      if (key === 'Escape') return step({ ...touched, phase: 'rest', password: '', unconfirmed: false });
      return step(touched);

    case 'verify':
    case 'unlocking':
      return step(model);
  }
}

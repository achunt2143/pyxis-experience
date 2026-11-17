import { describe, it, expect } from 'vitest';
import {
  AMBIENT_AFTER_MS,
  MAX_PASSWORD_LENGTH,
  formatWait,
  initialModel,
  isWaiting,
  reduce,
  stateName,
  waitFraction,
  waitSecondsLeft,
  type LockEvent,
  type LockModel,
  type Step,
} from '../lockMachine';

/**
 * The lock screen's walk, with no screen: rest, awake, verify, wrong, wait,
 * unlocking, ambient, and the press-to-enter screen with no password.
 */

const T0 = 1_000_000;

/** Feed events in order; the last step, and every effect asked for. */
function run(model: LockModel, events: LockEvent[]): { step: Step; effects: NonNullable<Step['effect']>[] } {
  let step: Step = { model, effect: null };
  const effects: NonNullable<Step['effect']>[] = [];
  for (const event of events) {
    step = reduce(step.model, event);
    if (step.effect) effects.push(step.effect);
  }
  return { step, effects };
}
const keys = (text: string, now = T0): LockEvent[] => [...text].map((key) => ({ type: 'key', key, now }));
const key = (k: string, now = T0): LockEvent => ({ type: 'key', key: k, now });

describe('rest wakes on any key or click', () => {
  it('the waking key is the first character of the password', () => {
    const { step } = run(initialModel(T0), [key('p')]);
    expect(step.model).toMatchObject({ phase: 'awake', password: 'p' });
  });

  it('keeps what is typed after it', () => {
    const { step } = run(initialModel(T0), keys('pyxis'));
    expect(step.model).toMatchObject({ phase: 'awake', password: 'pyxis' });
  });

  it('a space is a character, not a wake-up', () => {
    expect(run(initialModel(T0), [key(' ')]).step.model.password).toBe(' ');
  });

  it('Enter or a click wakes with nothing typed', () => {
    expect(run(initialModel(T0), [key('Enter')]).step.model).toMatchObject({ phase: 'awake', password: '' });
    expect(run(initialModel(T0), [{ type: 'pointer', now: T0 }]).step.model).toMatchObject({ phase: 'awake', password: '' });
  });

  it('a modifier or Tab alone wakes nothing', () => {
    for (const k of ['Shift', 'Control', 'Alt', 'Meta', 'Super', 'CapsLock', 'Tab']) {
      expect(run(initialModel(T0), [key(k)]).step.model.phase).toBe('rest');
    }
  });

  it('caps the password at its limit', () => {
    const { step } = run(initialModel(T0), keys('a'.repeat(MAX_PASSWORD_LENGTH + 20)));
    expect(step.model.password).toHaveLength(MAX_PASSWORD_LENGTH);
  });
});

describe('awake', () => {
  const awake = (text = 'pyxis') => run(initialModel(T0), keys(text)).step.model;

  it('Backspace removes a character, Escape goes back to rest', () => {
    expect(run(awake('pyxis'), [key('Backspace')]).step.model.password).toBe('pyxi');
    expect(run(awake('pyxis'), [key('Escape')]).step.model).toMatchObject({ phase: 'rest', password: '' });
  });

  it('Enter verifies, asking for exactly one unlock with what was typed', () => {
    const { step, effects } = run(awake('pyxis'), [key('Enter')]);
    expect(step.model.phase).toBe('verify');
    expect(effects).toEqual([{ type: 'unlock', password: 'pyxis' }]);
  });

  it('Enter with nothing typed does nothing', () => {
    const { step, effects } = run(awake(''), [key('Enter')]);
    expect(step.model.phase).toBe('awake');
    expect(effects).toEqual([]);
  });

  it('is ignored while verifying, and a second Enter is not a second try', () => {
    const verifying = run(awake('pyxis'), [key('Enter')]).step.model;
    const { step, effects } = run(verifying, [key('x'), key('Enter')]);
    expect(step.model.password).toBe('pyxis');
    expect(effects).toEqual([]);
  });
});

describe('a wrong try', () => {
  const verifying = (now = T0) => run(initialModel(now), [...keys('nope', now), key('Enter', now)]).step.model;
  const wrongResult = (retry: number | null, left = 4): LockEvent => ({
    type: 'result',
    now: T0,
    result: { ok: false, reason: 'wrong', attempts_left: left, retry_at_ms: retry },
  });

  it('shakes and burns, says so, and keeps the keys typed meanwhile for the next try', () => {
    const { step } = run(verifying(), [wrongResult(null), ...keys('ne')]);
    expect(step.model).toMatchObject({ phase: 'wrong', password: 'nope', queued: 'ne', notQuite: true, attemptsLeft: 4 });
    const after = reduce(step.model, { type: 'burned', now: T0 + 700 }).model;
    expect(after).toMatchObject({ phase: 'awake', password: 'ne', queued: '', notQuite: true });
  });

  it('the message goes when typing resumes', () => {
    const burned = run(verifying(), [wrongResult(null), { type: 'burned', now: T0 + 700 }]).step.model;
    expect(burned.notQuite).toBe(true);
    expect(reduce(burned, key('x')).model.notQuite).toBe(false);
  });

  it('a wrong try that starts a wait goes to the wait after the burn', () => {
    const retry = T0 + 30_000;
    const { step } = run(verifying(), [wrongResult(retry, 0), { type: 'burned', now: T0 + 700 }]);
    expect(step.model).toMatchObject({ phase: 'wait', retryAtMs: retry, password: '' });
  });

  it('a late result (no try outstanding) is ignored', () => {
    const awake = run(initialModel(T0), keys('a')).step.model;
    expect(reduce(awake, wrongResult(null)).model).toEqual(awake);
  });
});

describe('the wait', () => {
  const retry = T0 + 30_000;
  const waiting = () =>
    run(initialModel(T0), [
      ...keys('x'),
      key('Enter'),
      { type: 'result', now: T0, result: { ok: false, reason: 'wait', attempts_left: 0, retry_at_ms: retry } },
    ]).step.model;

  it('a try that comes back "wait" is the wait, with its ring starting full', () => {
    const model = waiting();
    expect(model).toMatchObject({ phase: 'wait', retryAtMs: retry, waitStartMs: T0, password: '' });
    expect(waitFraction(model, T0)).toBe(1);
    expect(waitFraction(model, T0 + 15_000)).toBeCloseTo(0.5, 5);
    expect(waitFraction(model, retry)).toBe(0);
  });

  it('counts down in whole seconds, rounding up', () => {
    expect(waitSecondsLeft(retry, T0)).toBe(30);
    expect(waitSecondsLeft(retry, T0 + 29_001)).toBe(1);
    expect(waitSecondsLeft(retry, retry + 5)).toBe(0);
    expect(formatWait(27)).toBe('0:27');
    expect(formatWait(605)).toBe('10:05');
  });

  it('takes no typing, and the field is ready when it ends', () => {
    const typed = run(waiting(), [...keys('abc', T0 + 1000)]).step.model;
    expect(typed).toMatchObject({ phase: 'wait', password: '' });
    expect(reduce(typed, { type: 'tick', now: retry - 1 }).model.phase).toBe('wait');
    expect(reduce(typed, { type: 'tick', now: retry }).model).toMatchObject({ phase: 'awake', retryAtMs: null, password: '' });
  });

  it('waking while a wait is on goes to the wait, not the field', () => {
    const rest = reduce(initialModel(T0), {
      type: 'session',
      hasPassword: true,
      retryAtMs: retry,
      attemptsLeft: 0,
      now: T0,
    }).model;
    expect(isWaiting(rest, T0)).toBe(true);
    expect(reduce(rest, key('a', T0 + 1)).model).toMatchObject({ phase: 'wait', password: '' });
  });

  it('a wait Echo reports while the field is up (a try from elsewhere) moves it to the wait', () => {
    const awake = run(initialModel(T0), keys('a')).step.model;
    const next = reduce(awake, { type: 'session', hasPassword: true, retryAtMs: retry, attemptsLeft: 0, now: T0 + 5 }).model;
    expect(next).toMatchObject({ phase: 'wait', waitStartMs: T0 + 5 });
  });

  it('a new wait restarts the ring, the same one does not', () => {
    const model = waiting();
    const same = reduce(model, { type: 'session', hasPassword: true, retryAtMs: retry, attemptsLeft: 0, now: T0 + 9000 }).model;
    expect(same.waitStartMs).toBe(T0);
    const longer = reduce(model, { type: 'session', hasPassword: true, retryAtMs: retry + 30_000, attemptsLeft: 0, now: T0 + 9000 }).model;
    expect(longer.waitStartMs).toBe(T0 + 9000);
  });
});

describe('unlocking', () => {
  it('LockChanged {locked: false} starts Clear from wherever the screen was', () => {
    for (const events of [[], keys('abc'), [...keys('abc'), key('Enter')]]) {
      const { step } = run(initialModel(T0), [...events, { type: 'unlocked' }]);
      expect(step.model.phase).toBe('unlocking');
    }
  });

  it('an accepted answer waits for the signal rather than starting Clear itself', () => {
    const { step } = run(initialModel(T0), [
      ...keys('pyxis'),
      key('Enter'),
      { type: 'result', now: T0, result: { ok: true } },
    ]);
    expect(step.model.phase).toBe('verify');
  });

  it('takes no input once Clear is under way', () => {
    const unlocking = reduce(initialModel(T0), { type: 'unlocked' }).model;
    const { step, effects } = run(unlocking, [key('a'), key('Enter'), { type: 'pointer', now: T0 }]);
    expect(step.model.phase).toBe('unlocking');
    expect(step.model.password).toBe('');
    expect(effects).toEqual([]);
  });
});

describe('ambient', () => {
  it('after 30 s untouched, from rest or from the field', () => {
    expect(reduce(initialModel(T0), { type: 'tick', now: T0 + AMBIENT_AFTER_MS - 1 }).model.phase).toBe('rest');
    expect(reduce(initialModel(T0), { type: 'tick', now: T0 + AMBIENT_AFTER_MS }).model.phase).toBe('ambient');
    const awake = run(initialModel(T0), keys('abc')).step.model;
    const quiet = reduce(awake, { type: 'tick', now: T0 + AMBIENT_AFTER_MS }).model;
    expect(quiet).toMatchObject({ phase: 'ambient', password: '' });
  });

  it('every touch restarts the 30 s', () => {
    const typed = run(initialModel(T0), [key('a', T0 + 20_000)]).step.model;
    expect(reduce(typed, { type: 'tick', now: T0 + 40_000 }).model.phase).toBe('awake');
    expect(reduce(typed, { type: 'tick', now: T0 + 50_000 }).model.phase).toBe('ambient');
  });

  it('not while a try is being checked', () => {
    const verifying = run(initialModel(T0), [...keys('x'), key('Enter')]).step.model;
    expect(reduce(verifying, { type: 'tick', now: T0 + AMBIENT_AFTER_MS * 3 }).model.phase).toBe('verify');
  });

  it('any key or click wakes it, and the waking key still starts the password', () => {
    const ambient = reduce(initialModel(T0), { type: 'tick', now: T0 + AMBIENT_AFTER_MS }).model;
    expect(reduce(ambient, key('p', T0 + 40_000)).model).toMatchObject({ phase: 'awake', password: 'p' });
    expect(reduce(ambient, { type: 'pointer', now: T0 + 40_000 }).model).toMatchObject({ phase: 'awake', password: '' });
  });
});

describe('no password set: press Enter', () => {
  const open = initialModel(T0, false);

  it('shows as its own state, not as rest', () => {
    expect(stateName(open)).toBe('no-password');
    expect(stateName(initialModel(T0))).toBe('rest');
  });

  it('Enter asks to unlock with an empty password; typing and clicking do not', () => {
    const { step, effects } = run(open, [...keys('abc'), { type: 'pointer', now: T0 }, key('Enter')]);
    expect(effects).toEqual([{ type: 'unlock', password: '' }]);
    expect(step.model.phase).toBe('verify');
    expect(run(open, [...keys('abc'), { type: 'pointer', now: T0 }]).step.model.phase).toBe('rest');
  });

  it('has no field to wake to, and waking from ambient only brings the display back', () => {
    const ambient = reduce(open, { type: 'tick', now: T0 + AMBIENT_AFTER_MS }).model;
    expect(stateName(ambient)).toBe('ambient');
    const woken = reduce(ambient, { type: 'pointer', now: T0 + AMBIENT_AFTER_MS + 1 }).model;
    expect(stateName(woken)).toBe('no-password');
  });

  it('a password set while the field was up (Settings → Users) leaves a field with nothing to type into: back to rest', () => {
    const awake = run(initialModel(T0), keys('a')).step.model;
    const next = reduce(awake, { type: 'session', hasPassword: false, retryAtMs: null, attemptsLeft: 5, now: T0 }).model;
    expect(stateName(next)).toBe('no-password');
  });
});

describe('paste and unlockTimeout', () => {
  it('paste wakes from rest, appends in awake, strips control characters, and respects MAX_PASSWORD_LENGTH', () => {
    const woken = reduce(initialModel(T0), { type: 'paste', text: 'ab\nc\td', now: T0 }).model;
    expect(woken).toMatchObject({ phase: 'awake', password: 'abcd' });

    const appended = reduce(woken, { type: 'paste', text: 'ef\r\n', now: T0 }).model;
    expect(appended.password).toBe('abcdef');

    const capped = reduce(appended, { type: 'paste', text: 'z'.repeat(MAX_PASSWORD_LENGTH + 20), now: T0 }).model;
    expect(capped.password).toHaveLength(MAX_PASSWORD_LENGTH);

    // No-password mode never wakes into password entry on paste.
    const noPass = reduce(initialModel(T0, false), { type: 'paste', text: 'secret', now: T0 }).model;
    expect(stateName(noPass)).toBe('no-password');
    expect(noPass.password).toBe('');
  });

  it('unlockTimeout restores interactive retry with unconfirmed flag when still locked, or wait when rate-limited', () => {
    const verifying = run(initialModel(T0), [...keys('pyxis'), key('Enter')]).step.model;
    expect(verifying.phase).toBe('verify');

    const retried = reduce(verifying, {
      type: 'unlockTimeout',
      hasPassword: true,
      retryAtMs: null,
      attemptsLeft: 4,
      now: T0 + 1500,
    }).model;
    expect(retried).toMatchObject({ phase: 'awake', password: '', unconfirmed: true });

    // Typing clears the unconfirmed message.
    expect(reduce(retried, key('p', T0 + 1600)).model.unconfirmed).toBe(false);

    // Rate-limited timeout enters wait instead of awake.
    const waited = reduce(verifying, {
      type: 'unlockTimeout',
      hasPassword: true,
      retryAtMs: T0 + 30_000,
      attemptsLeft: 0,
      now: T0 + 1500,
    }).model;
    expect(waited).toMatchObject({ phase: 'wait', unconfirmed: false, retryAtMs: T0 + 30_000 });
  });
});

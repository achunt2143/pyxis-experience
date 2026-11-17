import { describe, expect, it } from 'vitest';
import {
  ACCENT_SWATCHES,
  DEFAULT_ACCENT,
  LOCK_NEVER,
  accentOf,
  avatarStyle,
  formatWait,
  initialOf,
  lockAfterOptions,
  lockAfterSetting,
  parseLockAfter,
  refusalText,
  validatePasswordForm,
  waitText,
} from '../usersModel';

describe('usersModel: the password form', () => {
  const form = { hasPassword: true, current: 'a', next: 'b', confirm: 'b' };
  it('accepts a complete form', () => {
    expect(validatePasswordForm(form)).toBeNull();
    expect(validatePasswordForm({ ...form, hasPassword: false, current: '' })).toBeNull();
  });
  it('wants the current password only while one is set', () => {
    expect(validatePasswordForm({ ...form, current: '' })).toBe('Enter your current password.');
    expect(validatePasswordForm({ ...form, hasPassword: false, current: '' })).toBeNull();
  });
  it('wants a new one, and the same twice', () => {
    expect(validatePasswordForm({ ...form, next: '', confirm: '' })).toBe('Enter a new password.');
    expect(validatePasswordForm({ ...form, confirm: 'c' })).toBe("The two new passwords don't match.");
  });
  it('does not trim: a password may be spaces', () => {
    expect(validatePasswordForm({ ...form, next: ' ', confirm: ' ' })).toBeNull();
  });
});

describe('usersModel: waits', () => {
  it('formats m:ss, rounding up', () => {
    expect(formatWait(30_000)).toBe('0:30');
    expect(formatWait(29_001)).toBe('0:30');
    expect(formatWait(65_000)).toBe('1:05');
    expect(formatWait(15 * 60_000)).toBe('15:00');
    expect(formatWait(-5)).toBe('0:00');
  });
  it('says how long is left, and nothing once it is over', () => {
    expect(waitText(100_000, 70_000)).toBe('Too many tries. Try again in 0:30');
    expect(waitText(100_000, 100_000)).toBe('');
    expect(waitText(null, 0)).toBe('Too many tries. Try again in 0:30');
  });
  it('words each refusal', () => {
    expect(refusalText({ ok: false, reason: 'wrong' }, 0)).toBe("That's not the current password.");
    expect(refusalText({ ok: false, reason: 'wait', retry_at_ms: 90_000 }, 0)).toBe('Too many tries. Try again in 1:30');
  });
});

describe('usersModel: the avatar and accents', () => {
  it('takes the first letter of the name, upper-cased', () => {
    expect(initialOf('  ada')).toBe('A');
    expect(initialOf('émile')).toBe('É');
    expect(initialOf('')).toBe('');
  });
  it('falls back to the default accent unless given #rrggbb', () => {
    expect(accentOf('#EF4444')).toBe('#ef4444');
    expect(accentOf('red')).toBe(DEFAULT_ACCENT);
    expect(accentOf('')).toBe(DEFAULT_ACCENT);
    expect(accentOf(null)).toBe(DEFAULT_ACCENT);
  });
  it('offers only valid, distinct #rrggbb swatches, the default among them', () => {
    const hexes = ACCENT_SWATCHES.map((s) => s.hex);
    expect(new Set(hexes).size).toBe(hexes.length);
    expect(hexes.every((h) => /^#[0-9a-f]{6}$/.test(h))).toBe(true);
    expect(hexes).toContain(DEFAULT_ACCENT);
  });
  it("draws the waterdrop at the size's own radii", () => {
    expect(avatarStyle(40, '#ef4444')).toContain('border-radius:12px 3px 12px 12px');
    expect(avatarStyle(108, '#ef4444')).toContain('border-radius:16px 4px 16px 16px');
  });
});

describe('usersModel: lock after', () => {
  it('lists Never and the stock minutes', () => {
    expect(lockAfterOptions(10).map((o) => o.label)).toEqual(['Never', '1 minute', '5 minutes', '10 minutes', '15 minutes', '30 minutes', '1 hour']);
    expect(lockAfterOptions(10).map((o) => o.value)).toEqual([0, 1, 5, 10, 15, 30, 60]);
  });
  it('adds a stored value that is not a stock choice, in order', () => {
    expect(lockAfterOptions(20).map((o) => o.value)).toEqual([0, 1, 5, 10, 15, 20, 30, 60]);
    expect(lockAfterOptions(120).at(-1)).toEqual({ value: 120, label: '120 minutes' });
  });
  it('maps Never to null and minutes to themselves', () => {
    expect(lockAfterSetting(LOCK_NEVER)).toBeNull();
    expect(lockAfterSetting(15)).toBe(15);
  });
  it('reads only whole minutes 1..120', () => {
    expect(parseLockAfter(10)).toBe(10);
    for (const bad of [0, 121, 1.5, '10', null, undefined]) expect(parseLockAfter(bad)).toBeUndefined();
  });
});

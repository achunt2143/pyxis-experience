/**
 * Users & Lock, without Duyo: the validation, the wording, the swatches and the lock-after
 * choices, as pure functions the section's kinds and the tests share.
 *
 * Nothing here ever sees more than the strings it is handed, and none of it logs: a password
 * passes through `validatePasswordForm` and nowhere else in this file.
 */
import { SESSION_FIRST_WAIT_MS, installErrorText, waterdrop, type SetPasswordResult } from '@pyxis/app-sdk';

/** The accent when Echo names none (the lock screen's violet). */
export const DEFAULT_ACCENT = '#7c6cf0';

/** A user's accent as Echo gave it, or the default when it isn't a `#rrggbb`. */
export function accentOf(accent: string | undefined | null): string {
  return /^#[0-9a-fA-F]{6}$/.test(accent ?? '') ? accent!.toLowerCase() : DEFAULT_ACCENT;
}

export interface Swatch {
  hex: string;
  name: string;
}

/** The accents on offer: a small, even set, the default first. */
export const ACCENT_SWATCHES: readonly Swatch[] = [
  { hex: '#7c6cf0', name: 'Violet' },
  { hex: '#3b82f6', name: 'Blue' },
  { hex: '#0ea5e9', name: 'Sky' },
  { hex: '#14b8a6', name: 'Teal' },
  { hex: '#10b981', name: 'Green' },
  { hex: '#f59e0b', name: 'Amber' },
  { hex: '#f97316', name: 'Orange' },
  { hex: '#ef4444', name: 'Red' },
  { hex: '#ec4899', name: 'Pink' },
];

/** What a Swatch row is drawn from. */
export interface SwatchItem extends Swatch {
  checked: boolean;
}

/** The first letter of a name, upper-cased: what the avatar shows when there is no picture. */
export function initialOf(displayName: string): string {
  return [...displayName.trim()][0]?.toUpperCase() ?? '';
}

/**
 * The avatar's style at `size` px: the user's waterdrop, the accent as a light-to-dark
 * gradient, as the lock screen draws it (src/lock/LockScreen.css `.lock-avatar`).
 */
export function avatarStyle(size: number, accent: string): string {
  const a = accentOf(accent);
  return [
    `width:${size}px`,
    `height:${size}px`,
    `border-radius:${waterdrop(size)}`,
    'display:grid',
    'place-items:center',
    'flex-shrink:0',
    'color:#fff',
    `font-size:${Math.round(size / 2)}px`,
    'font-weight:300',
    `background:linear-gradient(150deg, color-mix(in srgb, ${a} 60%, #fff), ${a} 55%, color-mix(in srgb, ${a} 70%, #000))`,
    'box-shadow:inset 0 1px 0 rgba(255,255,255,0.4)',
  ].join(';');
}

// ---- The password form ----

export interface PasswordForm {
  /** Whether the account has a password now: `current` is asked for only then. */
  hasPassword: boolean;
  current: string;
  next: string;
  confirm: string;
}

/** What is wrong with the form before it is sent, or null when it can be. */
export function validatePasswordForm(form: PasswordForm): string | null {
  if (form.hasPassword && form.current === '') return 'Enter your current password.';
  if (form.next === '') return 'Enter a new password.';
  if (form.next !== form.confirm) return "The two new passwords don't match.";
  return null;
}

/** `m:ss` for a wait of `ms` (rounded up to the second). */
export function formatWait(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "Too many tries. Try again in m:ss", or '' once `retryAtMs` is past (or unknown, which reads as 30 s from now). */
export function waitText(retryAtMs: number | null | undefined, nowMs: number): string {
  const until = typeof retryAtMs === 'number' ? retryAtMs : nowMs + SESSION_FIRST_WAIT_MS;
  if (until <= nowMs) return '';
  return `Too many tries. Try again in ${formatWait(until - nowMs)}`;
}

export const WRONG_PASSWORD_TEXT = "That's not the current password.";

/** The line a refused `setPassword` shows. */
export function refusalText(result: Extract<SetPasswordResult, { ok: false }>, nowMs: number): string {
  if (result.reason === 'wrong') return WRONG_PASSWORD_TEXT;
  return waitText(result.retry_at_ms, nowMs) || WRONG_PASSWORD_TEXT;
}

// ---- Lock settings ----

/** The "Lock after" dropdown's values: 0 is Never (the setting's null). */
export const LOCK_NEVER = 0;
const LOCK_AFTER_MINUTES = [1, 5, 10, 15, 30, 60] as const;

export const lockAfterLabel = (minutes: number): string =>
  minutes === LOCK_NEVER ? 'Never' : minutes === 60 ? '1 hour' : minutes === 1 ? '1 minute' : `${minutes} minutes`;

export interface LockAfterOption {
  value: number;
  label: string;
}

/**
 * The dropdown's options. A stored value that isn't one of the stock choices (echo-cli set 2,
 * say) is added in its place so the dropdown never claims something else is stored.
 */
export function lockAfterOptions(current: number): LockAfterOption[] {
  const minutes: number[] = [...LOCK_AFTER_MINUTES];
  if (current > 0 && !minutes.includes(current)) minutes.push(current);
  minutes.sort((a, b) => a - b);
  return [LOCK_NEVER, ...minutes].map((value) => ({ value, label: lockAfterLabel(value) }));
}

/** The dropdown's value to the setting's: Never is null. */
export const lockAfterSetting = (value: number): number | null => (value === LOCK_NEVER ? null : value);

/** A stored idle time as the dropdown's value; anything else is not a minutes value (undefined: keep the fallback). */
export function parseLockAfter(raw: unknown): number | undefined {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 120 ? raw : undefined;
}

export type LockNotifications = 'hidden' | 'count' | 'full';

export const LOCK_NOTIFICATION_CHOICES: ReadonlyArray<{
  value: LockNotifications;
  label: string;
  hint: string;
  glyph: string;
}> = [
  { value: 'hidden', label: 'Hidden', hint: 'Nothing about them on the lock screen', glyph: 'EyeOff' },
  { value: 'count', label: 'Count only', hint: 'How many, not what they say', glyph: 'Hash' },
  { value: 'full', label: 'Full', hint: 'Who and what, in full', glyph: 'Eye' },
];

// ---- The session user ----

/** What the Users section knows of the session user: the account list's row, or the session's own answer. */
export interface UserSummary {
  /** The login (`geckouser`). */
  user: string;
  display_name: string;
  /** `#rrggbb`, or '' for none. */
  accent: string;
  has_password: boolean;
}

const VALID_USERNAME_RE = /^[a-z_][a-z0-9_-]{0,31}$/;
const RESERVED_USERNAMES = new Set(['root', 'pyxisapp', 'nobody', 'daemon', 'bin', 'sys']);

export interface NewUserForm {
  user: string;
  displayName: string;
  password: string;
}

/** Validate the Add User form before calling `accounts.create`. */
export function validateNewUserForm(form: NewUserForm): string | null {
  const u = form.user.trim();
  if (u === '') return 'Enter a username.';
  if (!VALID_USERNAME_RE.test(u)) {
    return 'Username must start with a lowercase letter or _ and use only a-z, 0-9, _ or -.';
  }
  if (RESERVED_USERNAMES.has(u)) return 'That username is reserved.';
  return null;
}

export const errorMessage = (err: unknown): string =>
  err instanceof Error ? installErrorText(err.message) : String(err);

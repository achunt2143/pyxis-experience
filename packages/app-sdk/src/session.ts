/**
 * The session: whether the screen is locked, and the lock screen's side of
 * unlocking it.
 *
 * Echo owns the decision and Evo owns the secret: the lock itself is Evo's
 * state (it draws only the overlay while locked), and it starts and ends only
 * through echo's `org.geckoOS.session` (echo/src/services/session.rs). A page
 * can ask to lock (`lock`). It can never unlock by itself: `unlock` hands the
 * password to Echo, which checks it, applies the rate limit, and tells Evo.
 * `lock` and `logout` need `settings:write` (the shell, and Settings' Users &
 * Lock section); the two signals need `windows:manage` (shell ids); `unlock`
 * is the lock screen's alone.
 *
 * The password is never logged, here or on the Echo side. Don't add it to an
 * error message or a console line.
 */
import { echoClient } from './EchoClient';

export const SESSION_IFACE = 'org.geckoOS.session';
const SESSION_SERVICE = 'session';

export const SESSION_SIGNALS = {
  /** `{ locked: boolean, seq: number, mac: string }`; `seq`/`mac` are for Evo, not pages. */
  lockChanged: 'LockChanged',
  /** `{ attempts_left: number, retry_at_ms: number | null }` */
  unlockFailed: 'UnlockFailed',
} as const;

/** `getState`'s answer. */
export interface SessionState {
  locked: boolean;
  /** The session user's login (`geckouser`). */
  user: string;
  display_name: string;
  /** `#rrggbb`: the user's colour, the avatar's and the halo's. */
  accent: string;
  /** false: the lock screen is press-to-enter and says how to set one. */
  has_password: boolean;
  /** Wrong tries left before a wait starts. */
  attempts_left: number;
  /** Epoch ms the next try is allowed, while waiting; else null. */
  retry_at_ms: number | null;
}

/**
 * `unlock`'s answer. A refusal is a normal answer, not an error: `wrong`
 * counts against the rate limit, `wait` (a try while waiting) doesn't.
 */
export type UnlockResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'wrong' | 'wait';
      attempts_left: number;
      retry_at_ms: number | null;
    };

export interface LockChange {
  locked: boolean;
}

export interface UnlockFailure {
  attempts_left: number;
  retry_at_ms: number | null;
}

/** Wrong tries before the first wait, and the waits (the daemon's rule, for the dev mock and the UI's copy). */
export const SESSION_FREE_TRIES = 5;
export const SESSION_FIRST_WAIT_MS = 30_000;
export const SESSION_MAX_WAIT_MS = 15 * 60_000;

/** Lock now. Resolves to whether the session is locked afterwards. */
export async function lock(): Promise<boolean> {
  try {
    const res = (await echoClient.callMethodStrict(SESSION_SERVICE, SESSION_IFACE, 'lock', {})) as
      | { locked?: boolean }
      | undefined;
    return res?.locked ?? false;
  } catch {
    return false;
  }
}

/**
 * Log out the active user session (`org.geckoOS.session.logout`): closes
 * running user apps, revokes privilege grants, and locks the session back to
 * the lock / user-picker screen.
 */
export async function logout(): Promise<boolean> {
  try {
    const res = (await echoClient.callMethodStrict(SESSION_SERVICE, SESSION_IFACE, 'logout', {})) as
      | { ok?: boolean; locked?: boolean }
      | undefined;
    return res?.locked ?? res?.ok ?? false;
  } catch {
    return false;
  }
}

/**
 * Switch the active session to `user` and lock the screen so the target user
 * can authenticate (`org.geckoOS.session.switchUser`).
 */
export async function switchUser(user: string): Promise<boolean> {
  try {
    const res = (await echoClient.callMethodStrict(SESSION_SERVICE, SESSION_IFACE, 'switchUser', {
      user,
    })) as { ok?: boolean; locked?: boolean } | undefined;
    return res?.ok === true;
  } catch {
    return false;
  }
}

function isRefusal(value: unknown): value is Extract<UnlockResult, { ok: false }> {
  const r = value as Partial<Extract<UnlockResult, { ok: false }>> | undefined;
  return r?.ok === false && (r.reason === 'wrong' || r.reason === 'wait');
}

/**
 * Try to unlock (optionally switching to `user` at the same time). On success
 * Echo tells Evo and `LockChanged {locked: false}` follows; the shell reacts to
 * that, not to this answer. A call that fails outright (no session service) is
 * reported as a wrong try with nothing known, so a broken bus never reads as
 * unlocked.
 */
export async function unlock(password: string, user?: string): Promise<UnlockResult> {
  try {
    const payload: { password: string; user?: string } = { password };
    if (user && user.trim()) payload.user = user.trim();
    const res = await echoClient.callMethodStrict(SESSION_SERVICE, SESSION_IFACE, 'unlock', payload);
    if ((res as { ok?: unknown } | undefined)?.ok === true) return { ok: true };
    if (isRefusal(res)) {
      return {
        ok: false,
        reason: res.reason,
        attempts_left: typeof res.attempts_left === 'number' ? res.attempts_left : 0,
        retry_at_ms: typeof res.retry_at_ms === 'number' ? res.retry_at_ms : null,
      };
    }
  } catch {
    /* fall through to a refusal */
  }
  return { ok: false, reason: 'wrong', attempts_left: 0, retry_at_ms: null };
}

/** null if there is no session service to ask. */
export async function getSessionState(): Promise<SessionState | null> {
  try {
    const res = (await echoClient.callMethodStrict(SESSION_SERVICE, SESSION_IFACE, 'getState', {})) as
      | Partial<SessionState>
      | undefined;
    if (typeof res?.locked !== 'boolean') return null;
    return {
      locked: res.locked,
      user: typeof res.user === 'string' ? res.user : '',
      display_name: typeof res.display_name === 'string' ? res.display_name : '',
      accent: typeof res.accent === 'string' ? res.accent : '',
      has_password: res.has_password !== false,
      attempts_left: typeof res.attempts_left === 'number' ? res.attempts_left : SESSION_FREE_TRIES,
      retry_at_ms: typeof res.retry_at_ms === 'number' ? res.retry_at_ms : null,
    };
  } catch {
    return null;
  }
}

export function onLockChanged(callback: (change: LockChange) => void): () => void {
  return echoClient.onSignal(SESSION_IFACE, SESSION_SIGNALS.lockChanged, (data) => {
    const locked = (data as { locked?: unknown } | undefined)?.locked;
    if (typeof locked === 'boolean') callback({ locked });
  });
}

export function onUnlockFailed(callback: (failure: UnlockFailure) => void): () => void {
  return echoClient.onSignal(SESSION_IFACE, SESSION_SIGNALS.unlockFailed, (data) => {
    const d = data as Partial<UnlockFailure> | undefined;
    callback({
      attempts_left: typeof d?.attempts_left === 'number' ? d.attempts_left : 0,
      retry_at_ms: typeof d?.retry_at_ms === 'number' ? d.retry_at_ms : null,
    });
  });
}

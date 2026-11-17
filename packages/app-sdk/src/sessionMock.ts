/**
 * Stand-ins for echo's session and accounts services (and Evo's lock calls)
 * for the dev server and tests. A password is set, and it is `pyxis`.
 * Responses follow the contract pinned in
 * docs/internal/pyxis-glass-and-lock-plan.md ("Contracts"); sessionContract.test.ts
 * checks the names against the Rust source once it exists.
 *
 * The mock enforces the same rate limit the daemon does: 5 wrong tries, then
 * a wait of 30 s that doubles per further wrong try up to 15 min, reset on
 * success; a try while waiting is refused with `reason: "wait"` and doesn't
 * count. It emits `LockChanged` and `UnlockFailed` like the real service.
 * State lives in memory (a reload unlocks).
 */

const FREE_TRIES = 5;
const FIRST_WAIT_MS = 30_000;
const MAX_WAIT_MS = 15 * 60_000;

/** The mock's one password, until `setPassword` changes it. */
export const MOCK_PASSWORD = 'pyxis';

interface MockAccount {
  user: string;
  uid: number;
  display_name: string;
  accent: string;
  avatar: string | null;
  /** null: no password set (press-to-enter). */
  password: string | null;
}

interface MockSession {
  locked: boolean;
  failures: number;
  retryAt: number | null;
  seq: number;
  activeUser: string;
  accounts: MockAccount[];
}

const freshPrimaryAccount = (password: string | null = MOCK_PASSWORD): MockAccount => ({
  user: 'geckouser',
  uid: 1000,
  display_name: 'Andrew',
  accent: '#7c6cf0',
  avatar: null,
  password,
});

const session: MockSession = {
  locked: false,
  failures: 0,
  retryAt: null,
  seq: 0,
  activeUser: 'geckouser',
  accounts: [freshPrimaryAccount()],
};

function currentAccount(): MockAccount {
  return session.accounts.find((a) => a.user === session.activeUser) ?? session.accounts[0];
}

/** Check `password` against the active mock account's password (matches `session.unlock`). */
export function verifyMockAccountPassword(password: string): boolean {
  const target = currentAccount();
  return target.password === null || password === target.password;
}

function findAccount(user: unknown): MockAccount | undefined {
  if (typeof user !== 'string' || !user.trim()) return currentAccount();
  return session.accounts.find((a) => a.user === user.trim());
}

function toPublicAccount(a: MockAccount) {
  return {
    user: a.user,
    uid: a.uid,
    display_name: a.display_name,
    accent: a.accent,
    avatar: a.avatar,
    has_password: a.password !== null,
  };
}

/** Back to the start (tests): unlocked, password `pyxis` (or `password`; null for none), no failures. */
export function resetMockSession(password: string | null = MOCK_PASSWORD): void {
  session.locked = false;
  session.failures = 0;
  session.retryAt = null;
  session.seq = 0;
  session.activeUser = 'geckouser';
  session.accounts = [freshPrimaryAccount(password)];
}

type FanOut = (signal: string, data: unknown, ifaceOverride?: string) => void;

const SESSION_IFACE = 'org.geckoOS.session';

/** What `Date.now()` is: a function so a test can set the clock. */
const now = () => Date.now();

function waitFor(failures: number): number {
  return Math.min(FIRST_WAIT_MS * 2 ** Math.max(0, failures - FREE_TRIES), MAX_WAIT_MS);
}

function emitLock(fanOut: FanOut | undefined, locked: boolean): void {
  session.seq = Math.max(now(), session.seq + 1);
  fanOut?.('LockChanged', { locked, seq: session.seq, mac: '' }, SESSION_IFACE);
}

function setLocked(fanOut: FanOut | undefined, locked: boolean): void {
  // Like the daemon: a change signals, a repeat doesn't.
  if (session.locked === locked) return;
  session.locked = locked;
  emitLock(fanOut, locked);
}

/** The wrong-try bookkeeping, shared by `unlock` and `setPassword`'s `current`. */
function wrongTry(fanOut: FanOut | undefined): {
  ok: false;
  reason: 'wrong' | 'wait';
  attempts_left: number;
  retry_at_ms: number | null;
} {
  const t = now();
  if (session.retryAt !== null && t < session.retryAt) {
    return { ok: false, reason: 'wait', attempts_left: 0, retry_at_ms: session.retryAt };
  }
  session.failures += 1;
  if (session.failures >= FREE_TRIES) session.retryAt = t + waitFor(session.failures);
  const answer = {
    ok: false as const,
    reason: 'wrong' as const,
    attempts_left: Math.max(0, FREE_TRIES - session.failures),
    retry_at_ms: session.retryAt !== null && session.retryAt > t ? session.retryAt : null,
  };
  fanOut?.(
    'UnlockFailed',
    { attempts_left: answer.attempts_left, retry_at_ms: answer.retry_at_ms },
    SESSION_IFACE
  );
  return answer;
}

export function mockSession(method: string, args: Record<string, unknown>, fanOut?: FanOut): unknown {
  switch (method) {
    case 'lock':
      setLocked(fanOut, true);
      return { locked: true };
    case 'logout':
      setLocked(fanOut, true);
      return { ok: true, locked: true, closed_apps: 0 };
    case 'switchUser': {
      const requested = typeof args.user === 'string' ? args.user.trim() : '';
      const target = session.accounts.find((a) => a.user === requested);
      if (!target) {
        return { ok: false, error: `no user '${requested}'` };
      }
      const userChanged = session.activeUser !== target.user;
      session.activeUser = target.user;
      if (!session.locked) {
        setLocked(fanOut, true);
      } else if (userChanged) {
        emitLock(fanOut, true);
      }
      return { ok: true, user: target.user, locked: true };
    }
    case 'unlock': {
      const password = typeof args.password === 'string' ? args.password : '';
      const target = findAccount(args.user);
      if (!target) {
        return { ok: false, error: `no user '${String(args.user)}'` };
      }
      if (session.retryAt !== null && now() < session.retryAt) {
        return { ok: false, reason: 'wait', attempts_left: 0, retry_at_ms: session.retryAt };
      }
      // No password set on target account: anything unlocks, the empty one included.
      if (target.password === null || password === target.password) {
        session.activeUser = target.user;
        session.failures = 0;
        session.retryAt = null;
        setLocked(fanOut, false);
        return { ok: true };
      }
      return wrongTry(fanOut);
    }
    case 'getState': {
      const t = now();
      const waiting = session.retryAt !== null && t < session.retryAt;
      const active = currentAccount();
      return {
        locked: session.locked,
        user: active.user,
        display_name: active.display_name,
        accent: active.accent,
        has_password: active.password !== null,
        attempts_left: Math.max(0, FREE_TRIES - session.failures),
        retry_at_ms: waiting ? session.retryAt : null,
      };
    }
    default:
      return { ok: false, error: `mock session service has no '${method}'` };
  }
}

const VALID_USER_RE = /^[a-z_][a-z0-9_-]{0,31}$/;
const RESERVED_USERS = new Set(['root', 'pyxisapp', 'nobody', 'daemon', 'bin', 'sys']);

export function mockAccounts(method: string, args: Record<string, unknown>, fanOut?: FanOut): unknown {
  switch (method) {
    case 'list':
      return {
        users: [...session.accounts]
          .sort((a, b) => a.uid - b.uid)
          .map(toPublicAccount),
      };
    case 'setPassword': {
      const target = findAccount(args.user);
      if (!target) return { ok: false, error: `no user '${String(args.user)}'` };
      const next = typeof args.new === 'string' ? args.new : '';
      if (next.length < 1) return { ok: false, error: 'the new password must have at least 1 character' };
      if (target.password !== null && args.current !== target.password) return wrongTry(fanOut);
      target.password = next;
      session.failures = 0;
      session.retryAt = null;
      return { ok: true };
    }
    case 'setProfile': {
      const target = findAccount(args.user);
      if (!target) return { ok: false, error: `no user '${String(args.user)}'` };
      if (typeof args.display_name === 'string' && args.display_name.trim()) {
        target.display_name = args.display_name.trim();
      }
      if (typeof args.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(args.accent)) {
        target.accent = args.accent.toLowerCase();
      }
      if (typeof args.avatar === 'string') target.avatar = args.avatar;
      return { ok: true };
    }
    case 'create': {
      const user = typeof args.user === 'string' ? args.user.trim() : '';
      if (!VALID_USER_RE.test(user) || RESERVED_USERS.has(user)) {
        return { ok: false, error: `invalid or reserved username '${user}'` };
      }
      if (session.accounts.some((a) => a.user === user)) {
        return { ok: false, error: `user '${user}' already exists` };
      }
      let nextUid = 1002;
      const usedUids = new Set(session.accounts.map((a) => a.uid));
      while (usedUids.has(nextUid)) nextUid += 1;

      const displayName =
        typeof args.display_name === 'string' && args.display_name.trim()
          ? args.display_name.trim()
          : user;
      const accent =
        typeof args.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(args.accent)
          ? args.accent.toLowerCase()
          : '';
      const avatar = typeof args.avatar === 'string' && args.avatar ? args.avatar : null;
      const password =
        typeof args.password === 'string' && args.password.length > 0 ? args.password : null;

      const created: MockAccount = {
        user,
        uid: nextUid,
        display_name: displayName,
        accent,
        avatar,
        password,
      };
      session.accounts.push(created);
      return { ok: true, user: toPublicAccount(created) };
    }
    case 'delete': {
      const user = typeof args.user === 'string' ? args.user.trim() : '';
      const target = session.accounts.find((a) => a.user === user);
      if (!target) return { ok: false, error: `no user '${user}'` };
      if (target.user === 'geckouser' || target.uid === 1000) {
        return { ok: false, error: 'cannot delete the primary system user' };
      }
      if (target.user === session.activeUser) {
        return { ok: false, error: 'cannot delete the currently active user' };
      }
      session.accounts = session.accounts.filter((a) => a.user !== user);
      return { ok: true };
    }
    default:
      return { ok: false, error: `mock accounts service has no '${method}'` };
  }
}

/** Evo's lock calls, as far as the dev server can pretend: `Lock` locks (and signals, as Echo would). */
export function mockEvoLock(method: string, args: Record<string, unknown>, fanOut?: FanOut): unknown {
  switch (method) {
    case 'Lock':
      setLocked(fanOut, true);
      return { ok: true };
    case 'SetIdleLock':
      return { ok: true, seconds: Number(args.seconds) || 0 };
    case 'SetLockOrigin':
      return { ok: true };
    default:
      return undefined;
  }
}

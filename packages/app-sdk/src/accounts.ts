/**
 * Accounts: who the people of this machine are, and their password and
 * profile. Echo's `org.geckoOS.accounts` (echo/src/services/accounts.rs);
 * every call needs `settings:write`, which only the shell and Settings hold.
 *
 * One user for now (the session user); the shape is a list so the lock
 * screen's row of waterdrops and Settings' Users page grow into more without
 * a redesign. The password never appears in a log or an error message.
 */
import { echoClient } from './EchoClient';

export const ACCOUNTS_IFACE = 'org.geckoOS.accounts';
const ACCOUNTS_SERVICE = 'accounts';

export interface Account {
  user: string;
  uid: number;
  display_name: string;
  /** `#rrggbb`, or '' for none. */
  accent: string;
  /** A data URL, or null: the avatar falls back to the name's initial. */
  avatar: string | null;
  has_password: boolean;
}

/** `setPassword`'s answer: a wrong `current` is a normal refusal, counted by the lock's rate limit. */
export type SetPasswordResult =
  | { ok: true }
  | { ok: false; reason: 'wrong' | 'wait'; attempts_left?: number; retry_at_ms?: number | null };

export interface ProfileUpdate {
  display_name?: string;
  /** `#rrggbb` */
  accent?: string;
  /** A data URL. */
  avatar?: string;
}

export interface CreateAccountInput {
  user: string;
  display_name?: string;
  /** `#rrggbb` */
  accent?: string;
  /** A data URL. */
  avatar?: string;
  password?: string;
}

export async function listAccounts(): Promise<Account[]> {
  try {
    const res = (await echoClient.callMethodStrict(ACCOUNTS_SERVICE, ACCOUNTS_IFACE, 'list', {})) as
      | { users?: Account[] }
      | undefined;
    return res?.users ?? [];
  } catch {
    return [];
  }
}

/**
 * Create a new local user account (`org.geckoOS.accounts.create`).
 * Rejects when the username is invalid, reserved, or already exists.
 */
export async function createAccount(input: CreateAccountInput): Promise<Account> {
  const res = (await echoClient.callMethodStrict(ACCOUNTS_SERVICE, ACCOUNTS_IFACE, 'create', {
    ...input,
  })) as { ok?: boolean; user?: Account; error?: string } | undefined;
  if (res?.ok !== true || !res.user) {
    throw new Error(res?.error ?? 'createAccount failed');
  }
  return res.user;
}

/**
 * Delete a secondary user account (`org.geckoOS.accounts.delete`).
 * Cannot delete the primary user (`geckouser`) or the currently active user.
 */
export async function deleteAccount(user: string): Promise<void> {
  const res = (await echoClient.callMethodStrict(ACCOUNTS_SERVICE, ACCOUNTS_IFACE, 'delete', {
    user,
  })) as { ok?: boolean; error?: string } | undefined;
  if (res?.ok !== true) {
    throw new Error(res?.error ?? 'deleteAccount failed');
  }
}

/**
 * Set `user`'s password. `current` is required when one is set (pass '' when
 * none is). Rejects when the service itself refuses (a bad request, no
 * service); a wrong `current` resolves to `{ ok: false, reason: 'wrong' }`.
 */
export async function setPassword(user: string, current: string, next: string): Promise<SetPasswordResult> {
  const res = (await echoClient.callMethodStrict(ACCOUNTS_SERVICE, ACCOUNTS_IFACE, 'setPassword', {
    user,
    current,
    new: next,
  })) as (Partial<SetPasswordResult> & { error?: string }) | undefined;
  if (res?.ok === true) return { ok: true };
  if (res?.ok === false && (res.reason === 'wrong' || res.reason === 'wait')) {
    return { ok: false, reason: res.reason, attempts_left: res.attempts_left, retry_at_ms: res.retry_at_ms };
  }
  throw new Error(res?.error ?? 'setPassword failed');
}

/** Change the display name, accent or avatar. Rejects when the service refuses. */
export async function setProfile(user: string, profile: ProfileUpdate): Promise<void> {
  const res = (await echoClient.callMethodStrict(ACCOUNTS_SERVICE, ACCOUNTS_IFACE, 'setProfile', {
    user,
    ...profile,
  })) as { ok?: boolean; error?: string } | undefined;
  if (res?.ok !== true) throw new Error(res?.error ?? 'setProfile failed');
}

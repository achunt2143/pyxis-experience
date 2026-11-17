import { view } from '@duyojs/duyo';
import { getSessionState, listAccounts, type Account } from '@pyxis/app-sdk';
import { present } from '../parts/present';
import type { UserSummary } from '../usersModel';
import './UserProfile';
import './UserPassword';
import './UserAccounts';
import './LockSettings';
import spec from './Users.view.json';
import type { CodeBehind } from './Users.view.gen';

/**
 * Users & Lock: who you are (name, accent), the password, other accounts on the machine, and when
 * the screen locks. This kind reads the session user (`session.getState` names the login,
 * `accounts.list` holds the rows) and hands it to the profile, password, and accounts roster;
 * each of those writes through `accounts`/`session` and calls `onChanged`, which reads it again.
 */
export default view(spec, {
  create() {
    this.inherited();
    this.draw();
    void this.reload();
  },

  accountChanged() {
    this.draw();
  },
  accountsChanged() {
    this.draw();
  },
  accountStateChanged() {
    this.draw();
  },

  /** Reads the session user and their account row. A service that doesn't answer isn't an exception: the section says so. */
  async reload() {
    const [session, accounts] = await Promise.all([getSessionState(), listAccounts()]);
    if (this.destroyed) return true;
    const row = accounts.find((a) => a.user === session?.user) ?? (session ? undefined : accounts[0]);
    const account: UserSummary | null = row
      ? { user: row.user, display_name: row.display_name, accent: row.accent, has_password: row.has_password }
      : session
        ? { user: session.user, display_name: session.display_name, accent: session.accent, has_password: session.has_password }
        : null;
    this.setAccounts(accounts);
    this.setAccount(account);
    this.setAccountState(account ? 'ready' : 'failed');
    return true;
  },

  draw() {
    const account = this.account as UserSummary | null;
    const accounts = (this.accounts as Account[] | undefined) ?? [];
    const state = this.accountState as string;
    const { unavailable, profile, password, userAccounts } = this.$;
    present(unavailable, state === 'failed', { role: 'alert', 'data-users-unavailable': true });
    profile.setShowing(account !== null);
    password.setShowing(account !== null);
    userAccounts.setShowing(account !== null);
    profile.set('account', account);
    password.set('account', account);
    userAccounts.set('accounts', accounts);
    userAccounts.set('activeUser', account?.user ?? 'geckouser');
  },
} satisfies CodeBehind);

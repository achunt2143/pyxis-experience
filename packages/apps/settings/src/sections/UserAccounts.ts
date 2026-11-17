import { view, type Component, type ComponentEvent } from '@duyojs/duyo';
import { createAccount, deleteAccount, switchUser, type Account } from '@pyxis/app-sdk';
import { present } from '../parts/present';
import '../parts/Field';
import '../islands';
import { ACCENT_SWATCHES, errorMessage, validateNewUserForm } from '../usersModel';
import spec from './UserAccounts.view.json';
import type { CodeBehind } from './UserAccounts.view.gen';

/**
 * Multi-user accounts management (`Settings.UserAccounts`):
 * - Lists every real account on the machine (`accounts.list`), marking the active session user.
 * - Switches session to another account (`session.switchUser`).
 * - Removes secondary non-active accounts (`accounts.delete`).
 * - Creates a new account (`accounts.create`) with username, display name, accent, and optional password.
 */
export default view(spec, {
  create() {
    this.inherited();
    this._busy = false;
    this.draw();
  },

  accountsChanged() {
    const accounts = (this.accounts as Account[] | undefined) ?? [];
    if (this.confirmingUser && !accounts.some((a) => a.user === this.confirmingUser)) {
      this.setConfirmingUser(null);
    }
    this.draw();
  },
  activeUserChanged() {
    if (this.confirmingUser && this.confirmingUser === this.activeUser) {
      this.setConfirmingUser(null);
    }
    this.draw();
  },
  busyUserChanged() {
    this.draw();
  },
  confirmingUserChanged() {
    this.draw();
  },
  statusChanged() {
    this.draw();
  },
  errorChanged() {
    this.draw();
  },

  async addUser() {
    if (this._busy) return true;
    const { loginField, displayField, passwordField } = this.$;
    const user = String(loginField.text).trim();
    const displayName = String(displayField.text).trim();
    const password = String(passwordField.text);
    const problem = validateNewUserForm({ user, displayName, password });
    if (problem) {
      this.setStatus('');
      this.setError(problem);
      return true;
    }
    this._busy = true;
    this.setError('');
    this.setStatus('');
    try {
      const existing = (this.accounts as Account[]) ?? [];
      const swatch = ACCENT_SWATCHES[existing.length % ACCENT_SWATCHES.length]?.hex ?? '#0ea5e9';
      const created = await createAccount({
        user,
        display_name: displayName || user,
        accent: swatch,
        ...(password ? { password } : {}),
      });
      if (this.destroyed) return true;
      loginField.setText('');
      displayField.setText('');
      passwordField.setText('');
      this.setStatus(`Added ${created.display_name || created.user}.`);
      this.doChanged();
    } catch (err) {
      if (!this.destroyed) {
        passwordField.setText('');
        this.setError(`Couldn't add user: ${errorMessage(err)}`);
      }
    } finally {
      this._busy = false;
    }
    return true;
  },

  async switchAccount(_sender: Component, event: ComponentEvent) {
    const user = String(event['user'] ?? '');
    if (!user || this._busy) return true;
    this._busy = true;
    this.setBusyUser(user);
    this.setError('');
    this.setStatus('');
    try {
      const ok = await switchUser(user);
      if (this.destroyed) return true;
      if (!ok) {
        this.setError(`Couldn't switch to ${user}.`);
      } else {
        this.setStatus(`Switching to ${user}…`);
        this.doChanged();
      }
    } catch (err) {
      if (!this.destroyed) this.setError(`Couldn't switch user: ${errorMessage(err)}`);
    } finally {
      this._busy = false;
      if (!this.destroyed) this.setBusyUser(null);
    }
    return true;
  },

  askRemoveAccount(_sender: Component, event: ComponentEvent) {
    const user = String(event['user'] ?? '');
    if (!user || this._busy) return true;
    this.setError('');
    this.setStatus('');
    this.setConfirmingUser(user);
    return true;
  },

  cancelRemoveAccount() {
    this.setConfirmingUser(null);
    return true;
  },

  async removeAccount(_sender: Component, event: ComponentEvent) {
    const user = String(event['user'] ?? '');
    if (!user || this._busy || this.confirmingUser !== user) return true;
    this._busy = true;
    this.setConfirmingUser(null);
    this.setBusyUser(user);
    this.setError('');
    this.setStatus('');
    try {
      await deleteAccount(user);
      if (this.destroyed) return true;
      this.setStatus(`Removed ${user}.`);
      this.doChanged();
    } catch (err) {
      if (!this.destroyed) this.setError(`Couldn't remove ${user}: ${errorMessage(err)}`);
    } finally {
      this._busy = false;
      if (!this.destroyed) this.setBusyUser(null);
    }
    return true;
  },

  draw() {
    const { roster, statusLine, errorLine } = this.$;
    roster.set('accounts', this.accounts ?? []);
    roster.set('activeUser', this.activeUser || 'geckouser');
    roster.set('busyUser', this.busyUser ?? null);
    roster.set('confirmingUser', this.confirmingUser ?? null);
    statusLine.setContent(this.status);
    present(statusLine, this.status !== '', { role: 'status', 'data-accounts-status': true });
    errorLine.setContent(this.error);
    present(errorLine, this.error !== '', { role: 'alert', 'data-accounts-error': true });
  },
} satisfies CodeBehind);

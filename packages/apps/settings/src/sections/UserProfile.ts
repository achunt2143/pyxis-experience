import { view, type Component } from '@duyojs/duyo';
import { setProfile, type ProfileUpdate } from '@pyxis/app-sdk';
import { present } from '../parts/present';
import '../parts/Field';
import '../parts/Swatch';
import {
  ACCENT_SWATCHES,
  accentOf,
  avatarStyle,
  errorMessage,
  initialOf,
  type SwatchItem,
  type UserSummary,
} from '../usersModel';
import spec from './UserProfile.view.json';
import type { CodeBehind } from './UserProfile.view.gen';

/**
 * The "You" groupbox: the session user's waterdrop avatar (their initial on their accent, as
 * the lock screen draws it), the display name and the accent swatches. The owner pushes
 * `account`; a save goes to `accounts.setProfile` and a refusal is shown, then `onChanged`
 * asks the owner to read the account again, which comes back as the new `account`.
 */
export default view(spec, {
  create() {
    this.inherited();
    // The name the field was last filled with, so a name changed elsewhere refills it and typing isn't overwritten by a redraw.
    this._seeded = null as string | null;
    this.draw();
  },

  accountChanged() {
    this.draw();
  },
  statusChanged() {
    this.draw();
  },
  errorChanged() {
    this.draw();
  },

  async saveName() {
    const account = this.account as UserSummary | null;
    if (!account) return true;
    const name = String(this.$.nameField.text).trim();
    if (name === '') {
      this.setStatus('');
      this.setError("Your name can't be empty.");
    } else if (name === account.display_name) {
      this.setError('');
      this.setStatus('');
    } else {
      await this.commit({ display_name: name }, 'Name saved.');
    }
    return true;
  },

  async pickAccent(sender: Component) {
    const account = this.account as UserSummary | null;
    const hex = (sender['item'] as SwatchItem).hex;
    if (account && accentOf(account.accent) !== hex) await this.commit({ accent: hex }, 'Accent saved.');
    return true;
  },

  /** Sends a profile change; says so, or says why not. */
  async commit(patch: ProfileUpdate, done: string) {
    const account = this.account as UserSummary | null;
    if (!account) return;
    this.setError('');
    this.setStatus('');
    try {
      await setProfile(account.user, patch);
      if (this.destroyed) return;
      this.setStatus(done);
      this.doChanged();
    } catch (err) {
      if (!this.destroyed) this.setError(`Couldn't save: ${errorMessage(err)}`);
    }
  },

  draw() {
    const account = this.account as UserSummary | null;
    const name = account?.display_name ?? '';
    const accent = accentOf(account?.accent);
    const { avatar, nameField, swatches, statusLine, errorLine } = this.$;
    avatar.setStyle(avatarStyle(72, accent));
    avatar.setContent(initialOf(name));
    if (account && name !== this._seeded) {
      nameField.setText(name);
      this._seeded = name;
    }
    swatches.setItems(ACCENT_SWATCHES.map((s): SwatchItem => ({ ...s, checked: s.hex === accent })));
    statusLine.setContent(this.status);
    present(statusLine, this.status !== '', { role: 'status', 'data-profile-status': true });
    errorLine.setContent(this.error);
    present(errorLine, this.error !== '', { role: 'alert', 'data-profile-error': true });
  },
} satisfies CodeBehind);

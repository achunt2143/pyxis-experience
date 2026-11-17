import { view, type Component } from '@duyojs/duyo';
import { setPassword } from '@pyxis/app-sdk';
import { onDestroy } from '@pyxis/app-sdk/duyo';
import { present } from '../parts/present';
import '../parts/Field';
import { errorMessage, refusalText, validatePasswordForm, waitText, type UserSummary } from '../usersModel';
import spec from './UserPassword.view.json';
import type { CodeBehind } from './UserPassword.view.gen';

type Tone = '' | 'ok' | 'error' | 'wait';

/**
 * The Password groupbox: whether the account has one, and the set / change form. The current
 * password is asked for only while one is set. The form is checked before anything is sent
 * (empty, mismatch); an answer of `wrong` or `wait` from `accounts.setPassword` is shown in the
 * words the lock screen uses, the wait counting down; any other failure shows its reason.
 *
 * No password is kept: the three fields hold what is being typed and are emptied on success
 * (the current one on every answer), and nothing here logs or puts a password in a message.
 * `onChanged` asks the owner to read the account again, so `has_password` is the service's.
 */
export default view(spec, {
  create() {
    this.inherited();
    this._current = null as Component | null;
    this._busy = false;
    this._timer = null as ReturnType<typeof setInterval> | null;
    onDestroy(this, () => this.stopTicking());
    this.draw();
  },

  accountChanged() {
    this.draw();
  },
  messageChanged() {
    this.drawStatus();
  },
  toneChanged() {
    this.drawStatus();
  },

  async save() {
    const account = this.account as UserSummary | null;
    if (!account || this._busy) return true;
    const { newField, confirmField } = this.$;
    const current = this._current as Component | null;
    const hasPassword = account.has_password;
    const form = {
      hasPassword,
      current: current ? String(current.text) : '',
      next: String(newField.text),
      confirm: String(confirmField.text),
    };
    const problem = validatePasswordForm(form);
    if (problem) {
      this.say(problem, 'error');
      return true;
    }
    this._busy = true;
    try {
      const result = await setPassword(account.user, hasPassword ? form.current : '', form.next);
      if (this.destroyed) return true;
      if (result.ok) {
        current?.setText('');
        newField.setText('');
        confirmField.setText('');
        this.say(hasPassword ? 'Password changed.' : 'Password set.', 'ok');
        this.doChanged();
      } else {
        current?.setText('');
        const now = Date.now();
        if (result.reason === 'wait') {
          const until = typeof result.retry_at_ms === 'number' ? result.retry_at_ms : now + 30_000;
          this.say(refusalText({ ...result, retry_at_ms: until }, now), 'wait');
          this.startTicking(until);
        } else {
          this.say(refusalText(result, now), 'error');
        }
      }
    } catch (err) {
      if (!this.destroyed) {
        current?.setText('');
        this.say(`Couldn't change the password: ${errorMessage(err)}`, 'error');
      }
    } finally {
      this._busy = false;
    }
    return true;
  },

  /** Sets the status line; saying anything else ends a countdown. */
  say(message: string, tone: Tone) {
    if (tone !== 'wait') this.stopTicking();
    this.setTone(tone);
    this.setMessage(message);
  },

  /** Counts a wait down, once a second, until it is over. */
  startTicking(until: number) {
    this.stopTicking();
    this.setRetryAt(until);
    this._timer = setInterval(() => {
      if (this.destroyed) return;
      const text = waitText(until, Date.now());
      if (text === '') this.say('', '');
      else this.setMessage(text);
    }, 1000);
  },
  stopTicking() {
    if (this._timer) clearInterval(this._timer as ReturnType<typeof setInterval>);
    this._timer = null;
  },

  draw() {
    const account = this.account as UserSummary | null;
    const has = account?.has_password ?? false;
    const { setState, setIcon, setText, hint, saveButton } = this.$;
    setState.setAttributes({ 'data-password-set': has });
    setIcon.setIcon(has ? 'ShieldCheck' : 'ShieldAlert');
    setText.setContent(has ? 'A password is set.' : 'No password is set.');
    hint.setContent(
      has
        ? 'Changing it asks for the current one first.'
        : 'The lock screen opens with a press. Set a password to keep it closed.'
    );
    saveButton.setContent(has ? 'Change password' : 'Set password');

    // The current password is asked for only while one is set.
    const current = this._current as Component | null;
    if (has && !current) {
      this._current = this.$.currentHost.createComponent(
        {
          kind: 'Settings.Field',
          label: 'Current password',
          attr: 'data-password-current',
          inputType: 'password',
          onEnter: 'save',
        },
        { owner: this }
      );
    } else if (!has && current) {
      current.destroy();
      this._current = null;
    }
    this.drawStatus();
  },

  drawStatus() {
    const tone = this.tone as Tone;
    const shown = this.message !== '' && tone !== '';
    const { statusLine } = this.$;
    statusLine.setContent(this.message);
    statusLine.addRemoveClass('st-status', tone === 'ok');
    statusLine.addRemoveClass('st-error', tone !== 'ok');
    present(statusLine, shown, { 'data-password-status': tone, role: tone === 'ok' ? 'status' : 'alert' });
  },
} satisfies CodeBehind);

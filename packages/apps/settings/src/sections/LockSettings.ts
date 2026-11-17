import { view, type Component, type ComponentEvent } from '@duyojs/duyo';
import { SETTING_KEYS, lock, logout, oneOf, setSetting } from '@pyxis/app-sdk';
import { bindSetting } from '@pyxis/app-sdk/duyo';
import { forwardAriaLabel, present } from '../parts/present';
import '../parts/Choice';
import {
  LOCK_NEVER,
  errorMessage,
  lockAfterOptions,
  lockAfterSetting,
  parseLockAfter,
  type LockNotifications,
} from '../usersModel';
import spec from './LockSettings.view.json';
import type { CodeBehind } from './LockSettings.view.gen';

const parseNotifications = oneOf<LockNotifications>('hidden', 'count', 'full');

/**
 * The Lock groupbox: when the screen locks by itself (`pyxis.lock.after`, minutes or never),
 * whether it locks as the device sleeps (`pyxis.lock.onSleep`), what the lock screen shows of
 * the notifications (`pyxis.lock.notifications`), and Lock now (`session.lock`). Each setting is
 * read live (bindSetting) and written through Echo's validated `settings.set`; a refusal is
 * shown and the control goes back to the stored value.
 */
export default view(spec, {
  create() {
    this.inherited();
    this._optionsKey = '';
    // `after` is minutes, with 0 for never: the setting's null (which bindSetting reads as its fallback).
    bindSetting<number>(this, SETTING_KEYS.lockAfter, 'after', LOCK_NEVER, parseLockAfter);
    bindSetting<boolean>(this, SETTING_KEYS.lockOnSleep, 'onSleep', true, (raw) => (typeof raw === 'boolean' ? raw : undefined));
    bindSetting<LockNotifications>(this, SETTING_KEYS.lockNotifications, 'notifications', 'count', parseNotifications);
    this.draw();
  },

  rendered() {
    this.inherited();
    forwardAriaLabel(this.$.afterDropdown, '[role="combobox"]', 'Lock after');
    forwardAriaLabel(this.$.sleepToggle, '[role="switch"]', 'Lock when the device sleeps');
  },

  afterChanged() {
    this.draw();
  },
  onSleepChanged() {
    this.draw();
  },
  notificationsChanged() {
    this.draw();
  },
  errorChanged() {
    this.draw();
  },
  statusChanged() {
    this.draw();
  },

  /** Writes a setting; a refusal is shown and the controls go back to what is stored. */
  write(key: string, value: unknown) {
    this.setError('');
    this.setStatus('');
    setSetting(key, value).catch((err: unknown) => {
      if (this.destroyed) return;
      this.setError(`Couldn't save ${key}: ${errorMessage(err)}`);
      this.draw();
    });
  },

  afterPicked(_sender: Component, event: ComponentEvent) {
    const value = Number(event['value']);
    if (Number.isFinite(value)) this.write(SETTING_KEYS.lockAfter, lockAfterSetting(value));
    return true;
  },
  sleepToggled(_sender: Component, event: ComponentEvent) {
    this.write(SETTING_KEYS.lockOnSleep, Boolean(event['value']));
    return true;
  },
  pickNotifications(sender: Component) {
    this.write(SETTING_KEYS.lockNotifications, sender['option']);
    return true;
  },

  async lockNow() {
    this.setError('');
    this.setStatus('');
    const locked = await lock();
    if (this.destroyed) return true;
    if (locked) this.setStatus('Locking…');
    else this.setError("Couldn't lock the screen: the session service didn't answer.");
    return true;
  },
  async logoutNow() {
    this.setError('');
    this.setStatus('');
    const signedOut = await logout();
    if (this.destroyed) return true;
    if (signedOut) this.setStatus('Signing out…');
    else this.setError("Couldn't log out: the session service didn't answer.");
    return true;
  },

  draw() {
    const after = this.after as number;
    const notifications = this.notifications as LockNotifications;
    const { afterDropdown, sleepToggle, notificationGroup, notifyHidden, notifyCount, notifyFull, statusLine, errorLine } = this.$;
    // The options change only when a stored value is not a stock choice; redrawing an open menu would close it.
    const options = lockAfterOptions(after);
    const key = options.map((o) => o.value).join();
    if (key !== this._optionsKey) {
      afterDropdown.setOptions(options);
      this._optionsKey = key;
    }
    afterDropdown.setValue(after);
    sleepToggle.setValue(this.onSleep);
    notificationGroup.setAttributes({
      role: 'radiogroup',
      'aria-label': 'Notifications on the lock screen',
      'data-lock-notifications': notifications,
    });
    notifyHidden.setChecked(notifications === 'hidden');
    notifyCount.setChecked(notifications === 'count');
    notifyFull.setChecked(notifications === 'full');

    statusLine.setContent(this.status);
    present(statusLine, this.status !== '', { role: 'status', 'data-lock-status': true });
    errorLine.setContent(this.error);
    present(errorLine, this.error !== '', { role: 'alert', 'data-lock-error': true });
  },
} satisfies CodeBehind);

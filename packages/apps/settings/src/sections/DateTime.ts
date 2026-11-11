import { view } from '@duyojs/duyo';
import { SETTING_KEYS, formatClockTime, setSetting, type ClockState } from '@pyxis/app-sdk';
import { bindClock, bindSetting } from '@pyxis/app-sdk/duyo';
import { present } from '../parts/present';
import { formatOffset } from '../timezones';
import './TimeZone';
import './Location';
import spec from './DateTime.view.json';
import type { CodeBehind } from './DateTime.view.gen';

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Date & Time: the clock (with the 24-hour switch), the time zone picker and the location.
 * The clock is the SDK's one-per-document loop, so it ticks on Echo's minute and follows a zone
 * change made here at once. The zone and the location are their own kinds.
 */
export default view(spec, {
  create() {
    this.inherited();
    bindClock(this, 'clock');
    bindSetting<boolean>(this, SETTING_KEYS.clock24h, 'hour24', false, (raw) => (typeof raw === 'boolean' ? raw : undefined));
    this.draw();
  },

  clockChanged() {
    this.draw();
  },
  hour24Changed() {
    this.draw();
  },
  clockErrorChanged() {
    this.draw();
  },

  toggled(_sender, event) {
    this.setClockError('');
    const value = Boolean(event['value']);
    setSetting(SETTING_KEYS.clock24h, value).catch((err: unknown) => {
      if (this.destroyed) return;
      this.setClockError(`Couldn't save: ${message(err)}`);
      // A refused change leaves the switch where the stored value is (remochi 0.4's Toggle is controlled).
      this.$.toggle.setValue(this.hour24);
    });
    return true;
  },

  draw() {
    const clock = this.clock as ClockState | null;
    const hour24 = this.hour24 as boolean;
    const { time, dateText, zoneText, offsetText, unsynced, toggle, error } = this.$;
    if (clock) {
      const date = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(Date.UTC(clock.year, clock.month - 1, clock.day)));
      time.setContent(formatClockTime(clock, hour24));
      dateText.setContent(date);
      zoneText.setContent(clock.timezone);
      offsetText.setContent(
        clock.abbreviation
          ? ` (${clock.abbreviation}, ${formatOffset(clock.utcOffsetMinutes)})`
          : ` (${formatOffset(clock.utcOffsetMinutes)})`
      );
      unsynced.setShowing(!clock.synced);
    }
    toggle.setValue(hour24);
    error.setContent(this.clockError);
    present(error, this.clockError !== '', { role: 'alert' });
  },
} satisfies CodeBehind);

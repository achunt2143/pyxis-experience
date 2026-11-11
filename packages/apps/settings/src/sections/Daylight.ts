import { view } from '@duyojs/duyo';
import { formatMinutes } from '../sunInfo';
import '../islands';
import spec from './Daylight.view.json';
import type { CodeBehind } from './Daylight.view.gen';

/**
 * The Daylight wallpaper's controls: the preview scrubber, what the sun is doing today and what
 * the desktop shows, and Follow the day / Pin this time. Everything is pushed in by the
 * Appearance section; presses go out as `onScrub {minutes}` (null = back), `onFollow`, `onPin`.
 */
export default view(spec, {
  create() {
    this.inherited();
    this.draw();
  },
  shownMinutesChanged() {
    this.draw();
  },
  scrubbingChanged() {
    this.draw();
  },
  pinnedChanged() {
    this.draw();
  },
  hour24Changed() {
    this.draw();
  },
  nowMinutesChanged() {
    this.draw();
  },
  nowPhaseChanged() {
    this.draw();
  },
  pinnedPhaseChanged() {
    this.draw();
  },
  sunTextChanged() {
    this.draw();
  },
  fixedDayChanged() {
    this.draw();
  },

  scrubbed(_sender, event) {
    this.doScrub({ minutes: event['minutes'] });
    return true;
  },
  followTap() {
    this.doFollow();
    return true;
  },
  pinTap() {
    this.doPin();
    return true;
  },

  draw() {
    const shown = this.shownMinutes as number;
    const pinned = this.pinned as number | null;
    const hour24 = this.hour24 as boolean;
    const fmt = (m: number) => formatMinutes(m, hour24);
    const { scrubber, sun, desktop, follow, pin } = this.$;

    scrubber.setShownMinutes(shown);
    scrubber.setScrubbing(this.scrubbing);
    scrubber.setPinned(pinned);
    scrubber.setHour24(hour24);

    sun.setContent(this.sunText + (this.fixedDay ? ' (no location: a fixed day)' : ''));
    desktop.setContent(
      pinned === null
        ? `Desktop follows the day: now ${fmt(this.nowMinutes)}, ${this.nowPhase}`
        : `Desktop pinned at ${fmt(pinned)}, ${this.pinnedPhase}`
    );

    follow.setChecked(pinned === null);
    pin.setChecked(pinned !== null);
    pin.setHint(
      pinned === null
        ? `Always show ${fmt(shown)}`
        : this.scrubbing && Math.round(shown) !== pinned
          ? `Always ${fmt(pinned)}; choose to pin ${fmt(shown)} instead`
          : `Always ${fmt(pinned)} (${this.pinnedPhase})`
    );
  },
} satisfies CodeBehind);

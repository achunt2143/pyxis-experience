import { view, type Component, type ComponentEvent } from '@duyojs/duyo';
import {
  DEFAULT_WALLPAPER_ID,
  SETTING_KEYS,
  WALLPAPERS,
  asBoolean,
  daylightPhase,
  daylightSun,
  isAnimationMode,
  isWallpaperId,
  oneOf,
  setSetting,
  type AnimationMode,
  type ClockState,
  type DeviceLocation,
  type SettingParser,
  type ThemePreference,
  type WallpaperMotion,
} from '@pyxis/app-sdk';
import { bindClock, bindSetting } from '@pyxis/app-sdk/duyo';
import { bindLocation } from '../bindLocation';
import { present } from '../parts/present';
import { PHASE_NAMES, autoSwitchText, formatMinutes, geoOf, todaySun, todaySunText } from '../sunInfo';
import '../islands';
import './Daylight';
import spec from './Appearance.view.json';
import type { CodeBehind } from './Appearance.view.gen';

const parseTheme = oneOf<ThemePreference>('light', 'dark', 'auto');
const parseMotion = oneOf<WallpaperMotion>('flow', 'still');
const parseWallpaper: SettingParser<string> = (raw) => (isWallpaperId(raw) ? raw : undefined);
const parsePinned: SettingParser<number | null> = (raw) =>
  typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw < 1440 ? raw : undefined;
const parseAnimations: SettingParser<AnimationMode> = (raw) => (isAnimationMode(raw) ? raw : undefined);

/**
 * Appearance: the theme (Light / Dark / Auto), the desktop wallpaper (thumbnails, a large
 * preview with a time-of-day scrubber for Daylight, follow or pin the day) and its motion.
 * Each setting is read live (bindSetting), so one changed in quick settings or by echo-cli
 * shows here; each write goes through Echo's validated `settings.set`, and a refusal is shown.
 */
export default view(spec, {
  create() {
    this.inherited();
    this._daylight = null;
    bindSetting<ThemePreference>(this, SETTING_KEYS.theme, 'theme', 'light', parseTheme);
    bindSetting<string>(this, SETTING_KEYS.wallpaper, 'wallpaper', DEFAULT_WALLPAPER_ID, parseWallpaper);
    bindSetting<WallpaperMotion>(this, SETTING_KEYS.wallpaperMotion, 'motion', 'flow', parseMotion);
    bindSetting<number | null>(this, SETTING_KEYS.wallpaperPinnedTime, 'pinned', null, parsePinned);
    bindSetting<boolean>(this, SETTING_KEYS.clock24h, 'hour24', false, asBoolean);
    bindSetting<AnimationMode>(this, SETTING_KEYS.animations, 'animationMode', 'full', parseAnimations);
    bindClock(this, 'clock');
    bindLocation(this, 'location');
    this.refresh();
  },

  themeChanged() {
    this.refresh();
  },
  wallpaperChanged() {
    this.refresh();
  },
  motionChanged() {
    this.refresh();
  },
  pinnedChanged() {
    this.refresh();
  },
  hour24Changed() {
    this.refresh();
  },
  animationModeChanged() {
    this.refresh();
  },
  clockChanged() {
    this.refresh();
  },
  locationChanged() {
    this.refresh();
  },
  scrubChanged() {
    this.refresh();
  },
  failureChanged() {
    this.refresh();
  },

  /** Writes a setting; a refusal is shown, not swallowed. */
  write(key: string, value: unknown) {
    this.setFailure('');
    setSetting(key, value).catch((err: unknown) => {
      if (!this.destroyed) this.setFailure(`Couldn't save ${key}: ${err instanceof Error ? err.message : String(err)}`);
    });
  },

  pickTheme(sender: Component) {
    this.write(SETTING_KEYS.theme, sender['option']);
    return true;
  },
  wallpaperPicked(_sender, event) {
    this.write(SETTING_KEYS.wallpaper, event['id']);
    return true;
  },
  pickMotion(sender: Component) {
    this.write(SETTING_KEYS.wallpaperMotion, sender['option']);
    return true;
  },
  scrubbed(_sender: Component, event: ComponentEvent) {
    this.setScrub(event['minutes'] ?? null);
    return true;
  },
  follow() {
    this.write(SETTING_KEYS.wallpaperPinnedTime, null);
    this.setScrub(null);
    return true;
  },
  pinHere() {
    this.write(SETTING_KEYS.wallpaperPinnedTime, Math.round(this.shownMinutes()) % 1440);
    this.setScrub(null);
    return true;
  },

  /** What the scrubber shows: the scrubbed time, else what the desktop shows (the pinned time, or now). */
  shownMinutes(): number {
    const clock = this.clock as ClockState | null;
    return (this.scrub as number | null) ?? (this.pinned as number | null) ?? Math.floor(clock?.minutesOfDay ?? 0);
  },

  refresh() {
    const clock = this.clock as ClockState | null;
    if (!clock) return;
    const theme = this.theme as ThemePreference;
    const wallpaper = this.wallpaper as string;
    const motion = this.motion as WallpaperMotion;
    const pinned = this.pinned as number | null;
    const hour24 = this.hour24 as boolean;
    const animationMode = this.animationMode as AnimationMode;
    const scrub = this.scrub as number | null;
    const geo = geoOf(this.location as DeviceLocation | null);
    const {
      themeLight, themeDark, themeAuto, autoNext, autoNextText, grid, preview, daylightHost,
      motionFlow, motionStill, motionNote, errorLine,
    } = this.$;

    themeLight.setChecked(theme === 'light');
    themeDark.setChecked(theme === 'dark');
    themeAuto.setChecked(theme === 'auto');
    present(autoNext, theme === 'auto', { 'data-auto-next': true });
    if (theme === 'auto') autoNextText.setContent(autoSwitchText(clock.epochMs, clock.utcOffsetMinutes, geo, hour24));

    const nowMinutes = Math.floor(clock.minutesOfDay);
    const shown = scrub ?? pinned ?? nowMinutes;
    const sunClock = { nowMs: clock.epochMs, utcOffsetMinutes: clock.utcOffsetMinutes, location: geo };
    const phaseAt = (minutes: number | null) => PHASE_NAMES[daylightPhase(daylightSun(sunClock, minutes))];
    const isDaylight = wallpaper === 'daylight';
    const selected = WALLPAPERS.find((w) => w.id === wallpaper) ?? WALLPAPERS[0];

    grid.setWallpaper(wallpaper);
    grid.setMotion(motion);
    grid.setPinned(pinned);

    preview.setWallpaper(selected.id);
    preview.setMotion(motion);
    preview.setTime(isDaylight ? (scrub ?? pinned) : null);
    preview.setLabel(`${selected.name} preview${isDaylight ? ` at ${formatMinutes(shown, hour24)}` : ''}`);
    preview.setPill(isDaylight ? `${formatMinutes(shown, hour24)} · ${phaseAt(shown)}` : '');

    // Daylight's controls exist only while Daylight is the wallpaper (their `data-daylight-*` with them).
    if (!isDaylight && this._daylight) {
      (this._daylight as Component).destroy();
      this._daylight = null;
    }
    if (isDaylight && !this._daylight) {
      this._daylight = daylightHost.createComponent(
        { kind: 'Settings.Daylight', onScrub: 'scrubbed', onFollow: 'follow', onPin: 'pinHere' },
        { owner: this }
      );
    }
    if (isDaylight) {
      const daylight = this._daylight as Component;
      daylight.set('shownMinutes', shown);
      daylight.set('scrubbing', scrub !== null);
      daylight.set('pinned', pinned);
      daylight.set('hour24', hour24);
      daylight.set('nowMinutes', nowMinutes);
      daylight.set('nowPhase', phaseAt(null));
      daylight.set('pinnedPhase', pinned === null ? '' : phaseAt(pinned));
      daylight.set('sunText', todaySunText(todaySun(clock.epochMs, clock.utcOffsetMinutes, geo), hour24));
      daylight.set('fixedDay', !geo);
    }

    motionFlow.setChecked(motion === 'flow');
    motionStill.setChecked(motion === 'still');
    motionStill.setHint(isDaylight ? 'Stands still; the colours still follow the day' : 'Stands still');

    const note = animationMode !== 'full' && motion === 'flow';
    present(motionNote, note, { 'data-wallpaper-motion-note': true });
    if (note) {
      motionNote.setContent(
        `Animations are ${animationMode === 'off' ? 'off' : 'reduced'} (Accessibility), so the wallpaper stands still` +
          (animationMode === 'off' ? ' and changes colour only when the phase of the day does.' : ' and its colours change once a minute.')
      );
    }

    errorLine.setContent(this.failure);
    present(errorLine, this.failure !== '', { role: 'alert', 'data-settings-error': true });
  },
} satisfies CodeBehind);

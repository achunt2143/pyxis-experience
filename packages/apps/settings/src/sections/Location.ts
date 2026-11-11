import { view } from '@duyojs/duyo';
import {
  SETTING_KEYS,
  isPyxisLocation,
  setSetting,
  type DeviceLocation,
  type PyxisLocation,
} from '@pyxis/app-sdk';
import { bindClock, bindSetting } from '@pyxis/app-sdk/duyo';
import type { ClockState } from '@pyxis/app-sdk';
import { bindLocation } from '../bindLocation';
import { present } from '../parts/present';
import { formatLatLon, validateManualLocation, type ManualLocationInput } from '../location';
import { geoOf, todaySun, todaySunText } from '../sunInfo';
import { splitZoneId } from '../timezones';
import '../parts/Field';
import spec from './Location.view.json';
import type { CodeBehind } from './Location.view.gen';

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * The Location groupbox: where the sun is for the Daylight wallpaper and the Auto theme.
 * From the time zone's city, or set by hand (`pyxis.location`, validated by location.ts).
 */
export default view(spec, {
  create() {
    this.inherited();
    bindClock(this, 'clock');
    bindLocation(this, 'location');
    bindSetting<PyxisLocation | null>(this, SETTING_KEYS.location, 'stored', null, (raw) =>
      isPyxisLocation(raw) ? raw : undefined
    );
    bindSetting<boolean>(this, SETTING_KEYS.clock24h, 'hour24', false, (raw) => (typeof raw === 'boolean' ? raw : undefined));
    this.draw();
  },

  clockChanged() {
    this.draw();
  },
  locationChanged() {
    this.draw();
  },
  storedChanged() {
    this.draw();
  },
  hour24Changed() {
    this.draw();
  },
  editingChanged() {
    this.draw();
  },
  saveErrorChanged() {
    this.draw();
  },

  startEditing() {
    const stored = this.stored as PyxisLocation | null;
    const geo = geoOf(this.location as DeviceLocation | null);
    const base = stored ?? (geo ? { lat: geo.lat, lon: geo.lon, label: '' } : null);
    const { fLabel, fLat, fLon } = this.$;
    fLat.setText(base ? String(Math.round(base.lat * 1e4) / 1e4) : '');
    fLon.setText(base ? String(Math.round(base.lon * 1e4) / 1e4) : '');
    fLabel.setText(stored?.label ?? '');
    for (const f of [fLabel, fLat, fLon]) f.setError('');
    this.setSaveError('');
    this.setEditing(true);
    return true;
  },
  cancelEditing() {
    this.setEditing(false);
    return true;
  },

  async save() {
    const { fLabel, fLat, fLon } = this.$;
    const result = validateManualLocation({
      lat: fLat.text,
      lon: fLon.text,
      label: fLabel.text,
    } satisfies ManualLocationInput);
    if (!result.ok) {
      fLabel.setError(result.errors.label ?? '');
      fLat.setError(result.errors.lat ?? '');
      fLon.setError(result.errors.lon ?? '');
      return true;
    }
    for (const f of [fLabel, fLat, fLon]) f.setError('');
    try {
      await setSetting(SETTING_KEYS.location, result.location);
      if (this.destroyed) return true;
      this.setEditing(false);
      this.setSaveError('');
    } catch (err) {
      if (!this.destroyed) this.setSaveError(`Couldn't save the location: ${message(err)}`);
    }
    return true;
  },

  async revertToZone() {
    try {
      await setSetting(SETTING_KEYS.location, null);
      if (this.destroyed) return true;
      this.setEditing(false);
      this.setSaveError('');
    } catch (err) {
      if (!this.destroyed) this.setSaveError(`Couldn't go back to the time zone's location: ${message(err)}`);
    }
    return true;
  },

  draw() {
    const clock = this.clock as ClockState | null;
    const location = this.location as DeviceLocation | null;
    const stored = this.stored as PyxisLocation | null;
    const hour24 = this.hour24 as boolean;
    const editing = this.editing as boolean;
    const { source, coords, sun, actions, editWrap, useZone, editButton, form, error } = this.$;
    const geo = geoOf(location);

    const kind = location?.source ?? (stored ? 'manual' : 'zone');
    const zoneCity = location?.label ?? splitZoneId(clock?.timezone ?? 'UTC').city;
    source.setText(
      kind === 'manual'
        ? `Set by hand: ${location?.label ?? stored?.label ?? ''}`
        : kind === 'none'
          ? `None: ${clock?.timezone} has no city, so a fixed 06:30–18:30 day stands in.`
          : `From time zone: ${zoneCity}`
    );
    source.setAttributes({ 'data-location-source': kind });

    present(coords, !!geo, { 'data-location-coords': true });
    if (geo) coords.setText(formatLatLon(geo.lat, geo.lon));
    if (clock) sun.setText(todaySunText(todaySun(clock.epochMs, clock.utcOffsetMinutes, geo), hour24) + (geo ? '' : ' (fixed day)'));

    actions.setShowing(!editing);
    editWrap.setAttributes({ 'data-location-edit': true });
    editButton.setContent(kind === 'manual' ? 'Change location…' : 'Set by hand…');
    present(useZone, !!stored, { 'data-location-use-zone': true });
    present(form, editing, { 'data-location-form': true });

    error.setContent(this.saveError);
    present(error, this.saveError !== '', { role: 'alert', 'data-location-error': true });
  },
} satisfies CodeBehind);

/**
 * A location typed by hand: latitude and longitude checked and turned into
 * the `pyxis.location` value Echo accepts (`{lat, lon, label, source:
 * "manual"}`, see settingsSchema.ts's `isPyxisLocation`).
 */
import { LOCATION_LABEL_MAX, type PyxisLocation } from '@pyxis/app-sdk';

export type Axis = 'lat' | 'lon';

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const AXIS = {
  lat: { name: 'latitude', limit: 90, positive: 'N', negative: 'S' },
  lon: { name: 'longitude', limit: 180, positive: 'E', negative: 'W' },
} as const;

/**
 * A coordinate in decimal degrees: "34.05", "-118.24", "34.05 N",
 * "118.24°W". A hemisphere letter must suit the axis and can't be combined
 * with a minus sign.
 */
export function parseCoordinate(text: string, axis: Axis): Parsed<number> {
  const spec = AXIS[axis];
  const t = text.trim().replace(/−/g, '-');
  if (!t) return { ok: false, error: `Enter a ${spec.name}.` };
  const m = /^([+-]?)(\d+(?:\.\d+)?|\.\d+)\s*°?\s*([a-z])?$/i.exec(t);
  if (!m) return { ok: false, error: `${capital(spec.name)} must be a number of degrees, like ${axis === 'lat' ? '34.05' : '-118.24'}.` };
  const [, sign, digits, hemi] = m;
  let value = Number(digits);
  if (hemi) {
    const h = hemi.toUpperCase();
    if (h !== spec.positive && h !== spec.negative) {
      return { ok: false, error: `${capital(spec.name)} takes ${spec.positive} or ${spec.negative}, not ${h}.` };
    }
    if (sign) return { ok: false, error: `Use either a sign or ${spec.positive}/${spec.negative}, not both.` };
    if (h === spec.negative) value = -value;
  } else if (sign === '-') {
    value = -value;
  }
  if (Math.abs(value) > spec.limit) {
    return { ok: false, error: `${capital(spec.name)} must be between -${spec.limit} and ${spec.limit}.` };
  }
  // Six places is about 10 cm; anything finer is noise.
  return { ok: true, value: Math.round(value * 1e6) / 1e6 + 0 };
}

/** "34.05° N, 118.24° W". */
export function formatLatLon(lat: number, lon: number): string {
  const part = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2)}° ${v < 0 ? neg : pos}`;
  return `${part(lat, 'N', 'S')}, ${part(lon, 'E', 'W')}`;
}

export interface ManualLocationInput {
  lat: string;
  lon: string;
  label: string;
}

export type ManualLocationResult =
  | { ok: true; location: PyxisLocation }
  | { ok: false; errors: Partial<Record<keyof ManualLocationInput, string>> };

/** The form's three fields checked together; an empty label becomes the coordinates. */
export function validateManualLocation(input: ManualLocationInput): ManualLocationResult {
  const lat = parseCoordinate(input.lat, 'lat');
  const lon = parseCoordinate(input.lon, 'lon');
  const label = input.label.trim();
  const errors: Partial<Record<keyof ManualLocationInput, string>> = {};
  if (!lat.ok) errors.lat = lat.error;
  if (!lon.ok) errors.lon = lon.error;
  if (label.length > LOCATION_LABEL_MAX) errors.label = `Keep the name to ${LOCATION_LABEL_MAX} characters.`;
  if (!lat.ok || !lon.ok || errors.label) return { ok: false, errors };
  return {
    ok: true,
    location: { lat: lat.value, lon: lon.value, label: label || formatLatLon(lat.value, lon.value), source: 'manual' },
  };
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

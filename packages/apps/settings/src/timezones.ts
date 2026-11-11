/**
 * Time zones as people read them: zone1970.tab's rows (`listTimezones`)
 * labelled by city, country and current UTC offset, and searched by any of
 * those or by the IANA id.
 *
 * The offset comes from `Intl` for the zone named, which every engine knows
 * from its own tz data. That is fine for a label; the device's *own* offset
 * is Echo's (`useClock`), since vela caches the zone it started with.
 */
import type { TimeZoneEntry } from '@pyxis/app-sdk';

export interface ZoneOption {
  id: string;
  /** "Los Angeles", "Buenos Aires, Argentina" (the middle of a three-part id). */
  city: string;
  /** The id's first part: "America", "Europe", ... */
  region: string;
  /** English names of the zone's countries, most populous first. */
  countries: string[];
  /** The ISO 3166 codes behind `countries` ("US"), matched exactly by search. */
  countryCodes: string[];
  /** Minutes east of UTC at the instant asked for; null if the engine doesn't know the zone. */
  offsetMinutes: number | null;
  /** "UTC−08:00", "UTC+05:30", "UTC". */
  offsetText: string;
}

const MINUS = '−';

/** "UTC", "UTC+09:00", "UTC−03:30". */
export function formatOffset(minutes: number | null): string {
  if (minutes === null) return 'UTC?';
  if (minutes === 0) return 'UTC';
  const sign = minutes < 0 ? MINUS : '+';
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

/** The zone's offset from UTC at `atMs`, in minutes east; null for a zone `Intl` refuses. */
export function zoneOffsetMinutes(zone: string, atMs: number): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(
      new Date(atMs)
    );
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    if (name === 'GMT' || name === 'UTC') return 0;
    const m = /^(?:GMT|UTC)([+−-])(\d{1,2})(?::(\d{2}))?$/.exec(name);
    if (!m) return null;
    const value = Number(m[2]) * 60 + Number(m[3] ?? 0);
    return m[1] === '+' ? value : -value;
  } catch {
    return null;
  }
}

let regionNames: Intl.DisplayNames | null | undefined;
function countryName(code: string): string {
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** "America/Argentina/Buenos_Aires" → { city: "Buenos Aires, Argentina", region: "America" }. */
export function splitZoneId(id: string): { city: string; region: string } {
  const parts = id.split('/').map((p) => p.replace(/_/g, ' '));
  if (parts.length === 1) return { city: parts[0], region: '' };
  const city = parts[parts.length - 1];
  const middle = parts.slice(1, -1);
  return { city: middle.length ? `${city}, ${middle.join(', ')}` : city, region: parts[0] };
}

export function zoneOption(entry: Pick<TimeZoneEntry, 'id' | 'countries'>, atMs: number): ZoneOption {
  const offsetMinutes = zoneOffsetMinutes(entry.id, atMs);
  return {
    id: entry.id,
    ...splitZoneId(entry.id),
    countries: entry.countries.map(countryName),
    countryCodes: entry.countries,
    offsetMinutes,
    offsetText: formatOffset(offsetMinutes),
  };
}

/** The line under a zone's city: "United States · UTC−08:00". */
export function zoneDetail(option: ZoneOption): string {
  const where = option.countries.length > 2 ? `${option.countries.slice(0, 2).join(', ')} +${option.countries.length - 2}` : option.countries.join(', ');
  return [where, option.offsetText].filter(Boolean).join(' · ');
}

/** A query that reads as an offset ("+9", "utc-8", "GMT+05:30", "5:30"), in minutes; else null. */
export function parseOffsetQuery(query: string): number | null {
  const m = /^(?:utc|gmt)?\s*([+−-])?\s*(\d{1,2})(?::?(\d{2}))?$/i.exec(query.trim());
  if (!m) return null;
  // A bare number with no sign and no "utc" is a city search ("5" matches nothing useful) unless it has minutes.
  if (!m[1] && !/^(utc|gmt)/i.test(query.trim()) && m[3] === undefined) return null;
  const hours = Number(m[2]);
  const mins = Number(m[3] ?? 0);
  if (hours > 14 || mins >= 60) return null;
  const value = hours * 60 + mins;
  return m[1] === '-' || m[1] === MINUS ? -value : value;
}

const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/_/g, ' ')
    .toLowerCase();

/**
 * The options matching `query`, best first: a city that starts with it, then
 * a city containing it, then a country, then the id; an offset query
 * ("+9", "UTC-8") matches every zone at that offset, and nothing else. An empty query is
 * every option, by region then city.
 */
export function searchZones(options: readonly ZoneOption[], query: string): ZoneOption[] {
  const q = fold(query.trim());
  if (!q) {
    return [...options].sort((a, b) => a.region.localeCompare(b.region) || a.city.localeCompare(b.city));
  }
  const offset = parseOffsetQuery(query);
  const scored: { option: ZoneOption; score: number }[] = [];
  for (const option of options) {
    const city = fold(option.city);
    let score = -1;
    if (offset !== null) {
      // An offset query matches by offset alone ("utc+0" is not a substring search).
      if (option.offsetMinutes === offset) scored.push({ option, score: 0 });
      continue;
    }
    if (city.startsWith(q) || city.split(/[\s,]+/).some((w) => w.startsWith(q))) score = city.startsWith(q) ? 0 : 1;
    else if (city.includes(q)) score = 2;
    else if (option.countries.some((c) => fold(c).includes(q)) || option.countryCodes.some((c) => c.toLowerCase() === q)) score = 3;
    else if (fold(option.id).includes(q) || fold(option.offsetText).includes(q)) score = 4;
    if (score >= 0) scored.push({ option, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.option.city.localeCompare(b.option.city))
    .map((s) => s.option);
}

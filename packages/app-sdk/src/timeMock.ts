/**
 * A stand-in for echo's time service (echo/src/services/time.rs) for the dev
 * server and tests: the browser's own clock, in a zone that starts as the
 * browser's and that `setTimezone` can change (offsets from `Intl`, so a
 * Settings page in a dev tab sees the clock move). Response shapes follow
 * time.rs's `Clock`, `ZoneEntry`, `Location` and `TimezoneChange`;
 * timeContract.test.ts checks them against the Rust source.
 */
import { safeGetItem, safeSetItem } from './safeStorage';

const ZONE_KEY = 'pyxis.mock.timezone';
/** Where EchoClient's settings mock keeps its store. */
const SETTINGS_KEY = 'pyxis.mock.settings';

/**
 * A sample of zone1970.tab's rows, coordinates verbatim. The device offers
 * all ~310; the dev server needs only enough to search and pick from.
 */
const ZONE_ROWS = `AE,OM,RE,SC,TF	+2518+05518	Asia/Dubai
AR	-3436-05827	America/Argentina/Buenos_Aires
AU	-3352+15113	Australia/Sydney
AU	-3455+13835	Australia/Adelaide
AU	-3157+11551	Australia/Perth
BR	-2332-04637	America/Sao_Paulo
CA,BS	+4339-07923	America/Toronto
CA	+4916-12307	America/Vancouver
CN	+3114+12128	Asia/Shanghai
DE,DK,NO,SE,SJ	+5230+01322	Europe/Berlin
EG	+3003+03115	Africa/Cairo
ES	+4024-00341	Europe/Madrid
FR,MC	+4852+00220	Europe/Paris
GB,GG,IM,JE	+513030-0000731	Europe/London
IN	+2232+08822	Asia/Kolkata
IT,SM,VA	+4154+01229	Europe/Rome
JP,AU	+353916+1394441	Asia/Tokyo
KE,DJ,ER,ET,KM,MG,SO,TZ,UG,YT	-0117+03649	Africa/Nairobi
KR	+3733+12658	Asia/Seoul
MX	+1924-09909	America/Mexico_City
NG,AO,BJ,CD,CF,CG,CM,GA,GQ,NE	+0627+00324	Africa/Lagos
NP	+2743+08519	Asia/Kathmandu
NZ,AQ	-3652+17446	Pacific/Auckland
RU	+554521+0373704	Europe/Moscow
SG,AQ,MY	+0117+10351	Asia/Singapore
TH,CX,KH,LA,VN	+1345+10031	Asia/Bangkok
TR	+4101+02858	Europe/Istanbul
US	+404251-0740023	America/New_York
US	+415100-0873900	America/Chicago
US	+394421-1045903	America/Denver
US	+340308-1181434	America/Los_Angeles
US	+611305-1495401	America/Anchorage
US	+211825-1575130	Pacific/Honolulu
ZA,LS,SZ	-2615+02800	Africa/Johannesburg`;

export interface MockZoneEntry {
  id: string;
  countries: string[];
  lat: number;
  lon: number;
}

/** ISO 6709 as zone1970.tab writes it, `±DDMM±DDDMM` or `±DDMMSS±DDDMMSS`,
 *  as time.rs's `parse_iso6709` reads it. */
export function parseIso6709(s: string): [number, number] | null {
  const m = /^([+-])(\d{2})(\d{2})(\d{2})?([+-])(\d{3})(\d{2})(\d{2})?$/.exec(s);
  if (!m || (m[4] === undefined) !== (m[8] === undefined)) return null;
  const angle = (sign: string, d: string, mm: string, ss?: string) =>
    (sign === '-' ? -1 : 1) * (Number(d) + Number(mm) / 60 + Number(ss ?? 0) / 3600);
  if (Number(m[3]) >= 60 || Number(m[7]) >= 60 || Number(m[4] ?? 0) >= 60 || Number(m[8] ?? 0) >= 60) {
    return null;
  }
  const lat = angle(m[1], m[2], m[3], m[4]);
  const lon = angle(m[5], m[6], m[7], m[8]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null;
}

const MOCK_ZONES: MockZoneEntry[] = ZONE_ROWS.split('\n')
  .map((row) => {
    const [codes, coords, id] = row.split('\t');
    const at = parseIso6709(coords);
    return at ? { id, countries: codes.split(','), lat: at[0], lon: at[1] } : null;
  })
  .filter((z): z is MockZoneEntry => z !== null)
  .sort((a, b) => (a.id < b.id ? -1 : 1));

function browserZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function isZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

let mockZone: string | null = null;
function currentZone(): string {
  if (mockZone === null) {
    const saved = safeGetItem(ZONE_KEY);
    mockZone = saved && isZone(saved) ? saved : browserZone();
  }
  return mockZone;
}

/** `zone`'s UTC offset at `epochMs`, in minutes, from Intl's `longOffset`
 *  ("GMT-08:00"; plain "GMT" for UTC). */
export function intlOffsetMinutes(zone: string, epochMs: number): number {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
      .formatToParts(epochMs)
      .find((p) => p.type === 'timeZoneName')?.value;
    const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name ?? '');
    if (!m) return 0;
    return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
  } catch {
    return 0;
  }
}

function abbreviation(zone: string, epochMs: number): string {
  try {
    return (
      new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' })
        .formatToParts(epochMs)
        .find((p) => p.type === 'timeZoneName')?.value ?? zone
    );
  } catch {
    return zone;
  }
}

const DAY = 86_400_000;

/** The next change of `zone`'s offset within a year of `epochMs`, or null:
 *  a day-by-day walk, then a bisection to the minute. */
export function nextTransition(zone: string, epochMs: number): number | null {
  const now = intlOffsetMinutes(zone, epochMs);
  for (let day = 1; day <= 366; day++) {
    let hi = epochMs + day * DAY;
    if (intlOffsetMinutes(zone, hi) === now) continue;
    let lo = hi - DAY;
    while (hi - lo > 60_000) {
      const mid = lo + Math.floor((hi - lo) / 2);
      if (intlOffsetMinutes(zone, mid) === now) lo = mid;
      else hi = mid;
    }
    return Math.floor(hi / 60_000) * 60_000;
  }
  return null;
}

/** Winter and summer offsets differ: the zone keeps DST, and is in it when
 *  its offset now is the larger. */
function inDst(zone: string, epochMs: number): boolean {
  const year = new Date(epochMs).getUTCFullYear();
  const jan = intlOffsetMinutes(zone, Date.UTC(year, 0, 1));
  const jul = intlOffsetMinutes(zone, Date.UTC(year, 6, 1));
  return jan !== jul && intlOffsetMinutes(zone, epochMs) === Math.max(jan, jul);
}

export function mockClock(epochMs = Date.now()) {
  const timezone = currentZone();
  return {
    epoch_ms: epochMs,
    timezone,
    utc_offset_minutes: intlOffsetMinutes(timezone, epochMs),
    abbreviation: abbreviation(timezone, epochMs),
    dst: inDst(timezone, epochMs),
    next_transition_ms: nextTransition(timezone, epochMs),
  };
}

function mockLocation() {
  const timezone = currentZone();
  let setting: unknown = null;
  try {
    setting = (JSON.parse(safeGetItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>)['pyxis.location'];
  } catch {
    /* no store yet */
  }
  const s = setting as { lat?: unknown; lon?: unknown; label?: unknown } | null | undefined;
  if (
    s &&
    typeof s.lat === 'number' &&
    typeof s.lon === 'number' &&
    Math.abs(s.lat) <= 90 &&
    Math.abs(s.lon) <= 180
  ) {
    return {
      lat: s.lat,
      lon: s.lon,
      label: typeof s.label === 'string' ? s.label : null,
      source: 'manual',
      timezone,
    };
  }
  const zone = MOCK_ZONES.find((z) => z.id === timezone);
  if (!zone) return { lat: null, lon: null, label: null, source: 'none', timezone };
  return {
    lat: zone.lat,
    lon: zone.lon,
    label: (timezone.split('/').pop() ?? timezone).replace(/_/g, ' '),
    source: 'zone',
    timezone,
  };
}

/** Put the mock back on the browser's zone (tests). */
export function resetMockTime(): void {
  mockZone = null;
  safeSetItem(ZONE_KEY, '');
}

export function mockTime(
  method: string,
  args: Record<string, unknown>,
  fanOut?: (signal: string, data: unknown) => void
): unknown {
  switch (method) {
    case 'getClock':
      return mockClock();
    case 'listTimezones':
      return { timezones: MOCK_ZONES.map((z) => ({ ...z, countries: [...z.countries] })) };
    case 'getLocation':
      return mockLocation();
    case 'setTimezone': {
      const zone = String(args.timezone ?? '');
      if (zone !== 'UTC' && !MOCK_ZONES.some((z) => z.id === zone) && zone !== browserZone()) {
        return { success: false, error: `unknown time zone "${zone}" (not in zone1970.tab)` };
      }
      mockZone = zone;
      safeSetItem(ZONE_KEY, zone);
      const change = { timezone: zone, utc_offset_minutes: intlOffsetMinutes(zone, Date.now()) };
      fanOut?.('TimezoneChanged', change);
      return change;
    }
    default:
      return { success: false, error: `mock time service has no '${method}'` };
  }
}

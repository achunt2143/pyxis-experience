import { describe, expect, it } from 'vitest';
import {
  formatOffset,
  parseOffsetQuery,
  searchZones,
  splitZoneId,
  zoneDetail,
  zoneOffsetMinutes,
  zoneOption,
} from '../timezones';

const JAN = Date.UTC(2026, 0, 15, 12);
const JUL = Date.UTC(2026, 6, 15, 12);

// zone1970.tab rows, as listTimezones answers them.
const ROWS = [
  { id: 'America/Los_Angeles', countries: ['US'], lat: 34.05, lon: -118.24 },
  { id: 'America/Argentina/Buenos_Aires', countries: ['AR'], lat: -34.6, lon: -58.45 },
  { id: 'America/Sao_Paulo', countries: ['BR'], lat: -23.53, lon: -46.62 },
  { id: 'Asia/Kolkata', countries: ['IN'], lat: 22.53, lon: 88.37 },
  { id: 'Asia/Tokyo', countries: ['JP', 'AU'], lat: 35.65, lon: 139.74 },
  { id: 'Europe/London', countries: ['GB', 'GG', 'IM', 'JE'], lat: 51.51, lon: -0.12 },
  { id: 'Asia/Kathmandu', countries: ['NP'], lat: 27.72, lon: 85.32 },
  { id: 'America/Lima', countries: ['PE'], lat: -12.05, lon: -77.05 },
];
const options = ROWS.map((r) => zoneOption(r, JAN));
const ids = (q: string) => searchZones(options, q).map((o) => o.id);

describe('formatOffset', () => {
  it('writes UTC, a sign, and hours:minutes', () => {
    expect(formatOffset(0)).toBe('UTC');
    expect(formatOffset(330)).toBe('UTC+05:30');
    expect(formatOffset(-480)).toBe('UTC−08:00');
    expect(formatOffset(545)).toBe('UTC+09:05');
    expect(formatOffset(null)).toBe('UTC?');
  });
});

describe('zoneOffsetMinutes', () => {
  it('reads the zone’s offset at the instant, DST included', () => {
    expect(zoneOffsetMinutes('America/Los_Angeles', JAN)).toBe(-480);
    expect(zoneOffsetMinutes('America/Los_Angeles', JUL)).toBe(-420);
    expect(zoneOffsetMinutes('Asia/Kolkata', JAN)).toBe(330);
    expect(zoneOffsetMinutes('Asia/Kathmandu', JAN)).toBe(345);
    expect(zoneOffsetMinutes('UTC', JAN)).toBe(0);
    expect(zoneOffsetMinutes('Europe/London', JAN)).toBe(0);
  });

  it('is null for a zone the engine refuses', () => {
    expect(zoneOffsetMinutes('Mars/Olympus_Mons', JAN)).toBeNull();
  });
});

describe('labels', () => {
  it('names the city, with the middle of a three-part id', () => {
    expect(splitZoneId('America/Los_Angeles')).toEqual({ city: 'Los Angeles', region: 'America' });
    expect(splitZoneId('America/Argentina/Buenos_Aires')).toEqual({ city: 'Buenos Aires, Argentina', region: 'America' });
    expect(splitZoneId('UTC')).toEqual({ city: 'UTC', region: '' });
  });

  it('says the country and the current offset', () => {
    const la = options.find((o) => o.id === 'America/Los_Angeles')!;
    expect(la.countries).toEqual(['United States']);
    expect(zoneDetail(la)).toBe('United States · UTC−08:00');
    const london = options.find((o) => o.id === 'Europe/London')!;
    expect(zoneDetail(london)).toBe('United Kingdom, Guernsey +2 · UTC');
  });
});

describe('parseOffsetQuery', () => {
  it('reads offsets with a sign or a utc/gmt prefix', () => {
    expect(parseOffsetQuery('+9')).toBe(540);
    expect(parseOffsetQuery('-8')).toBe(-480);
    expect(parseOffsetQuery('UTC+5:30')).toBe(330);
    expect(parseOffsetQuery('gmt-03')).toBe(-180);
    expect(parseOffsetQuery('utc')).toBeNull();
    expect(parseOffsetQuery('5:45')).toBe(345);
    expect(parseOffsetQuery('−8')).toBe(-480);
  });

  it('leaves a bare number and words to the city search', () => {
    expect(parseOffsetQuery('5')).toBeNull();
    expect(parseOffsetQuery('tokyo')).toBeNull();
    expect(parseOffsetQuery('+25')).toBeNull();
  });
});

describe('searchZones', () => {
  it('lists every zone by region then city with no query', () => {
    expect(ids('')).toEqual([
      'America/Argentina/Buenos_Aires',
      'America/Lima',
      'America/Los_Angeles',
      'America/Sao_Paulo',
      'Asia/Kathmandu',
      'Asia/Kolkata',
      'Asia/Tokyo',
      'Europe/London',
    ]);
  });

  it('finds a city by any word, accents and case aside', () => {
    expect(ids('tokyo')).toEqual(['Asia/Tokyo']);
    expect(ids('angeles')).toEqual(['America/Los_Angeles']);
    expect(ids('SÃO')).toEqual(['America/Sao_Paulo']);
    expect(ids('são')).toEqual(['America/Sao_Paulo']);
    expect(ids('buenos')).toEqual(['America/Argentina/Buenos_Aires']);
  });

  it('puts a city that starts with the query before one that only contains it', () => {
    // "Paulo" only contains "lo", so it comes after the two that start with it.
    expect(ids('lo')).toEqual(['Europe/London', 'America/Los_Angeles', 'America/Sao_Paulo']);
    // A word of the city ("Paulo") before the countries that contain it ("Nepal", "Japan").
    expect(ids('pa')).toEqual(['America/Sao_Paulo', 'Asia/Kathmandu', 'Asia/Tokyo']);
  });

  it('finds zones by country name or code', () => {
    expect(ids('brazil')).toEqual(['America/Sao_Paulo']);
    expect(ids('jp')).toEqual(['Asia/Tokyo']);
    expect(ids('australia')).toEqual(['Asia/Tokyo']);
    expect(ids('india')).toEqual(['Asia/Kolkata']);
  });

  it('finds every zone at an offset', () => {
    expect(ids('+5:30')).toEqual(['Asia/Kolkata']);
    expect(ids('utc+0')).toEqual(['Europe/London']);
    expect(ids('-5')).toEqual(['America/Lima']);
  });

  it('matches the IANA id too', () => {
    expect(ids('asia/kol')).toEqual(['Asia/Kolkata']);
  });
});

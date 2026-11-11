import { describe, expect, it } from 'vitest';
import { SETTING_KEYS, isPyxisLocation, validateSetting } from '@pyxis/app-sdk';
import { formatLatLon, parseCoordinate, validateManualLocation } from '../location';

const value = (text: string, axis: 'lat' | 'lon') => {
  const r = parseCoordinate(text, axis);
  return r.ok ? r.value : r.error;
};

describe('parseCoordinate', () => {
  it('reads signed decimal degrees', () => {
    expect(value('34.05', 'lat')).toBe(34.05);
    expect(value('-118.24', 'lon')).toBe(-118.24);
    expect(value('+12.5', 'lon')).toBe(12.5);
    expect(value('.5', 'lat')).toBe(0.5);
    expect(value('  -0  ', 'lat')).toBe(0);
    expect(value('−33.9', 'lat')).toBe(-33.9);
  });

  it('reads a hemisphere letter, with or without a degree sign', () => {
    expect(value('34.05 N', 'lat')).toBe(34.05);
    expect(value('33.9S', 'lat')).toBe(-33.9);
    expect(value('118.24°W', 'lon')).toBe(-118.24);
    expect(value('151.2 e', 'lon')).toBe(151.2);
  });

  it('accepts the limits and refuses beyond them', () => {
    expect(value('90', 'lat')).toBe(90);
    expect(value('-180', 'lon')).toBe(-180);
    expect(value('90.01', 'lat')).toBe('Latitude must be between -90 and 90.');
    expect(value('181', 'lon')).toBe('Longitude must be between -180 and 180.');
  });

  it('refuses what is not a coordinate, saying why', () => {
    expect(value('', 'lat')).toBe('Enter a latitude.');
    expect(value('abc', 'lon')).toMatch(/^Longitude must be a number of degrees/);
    expect(value('34,05', 'lat')).toMatch(/^Latitude must be a number of degrees/);
    expect(value('12 E', 'lat')).toBe('Latitude takes N or S, not E.');
    expect(value('12 N', 'lon')).toBe('Longitude takes E or W, not N.');
    expect(value('-12 S', 'lat')).toBe('Use either a sign or N/S, not both.');
  });

  it('keeps six decimal places', () => {
    expect(value('34.0522342', 'lat')).toBe(34.052234);
  });
});

describe('validateManualLocation', () => {
  it('makes a pyxis.location value Echo accepts', () => {
    const r = validateManualLocation({ lat: '64.15 N', lon: '21.94 W', label: '  Reykjavík ' });
    expect(r).toEqual({ ok: true, location: { lat: 64.15, lon: -21.94, label: 'Reykjavík', source: 'manual' } });
    if (!r.ok) return;
    expect(isPyxisLocation(r.location)).toBe(true);
    expect(validateSetting(SETTING_KEYS.location, r.location)).toBeNull();
  });

  it('names an unnamed place by its coordinates', () => {
    const r = validateManualLocation({ lat: '-33.87', lon: '151.21', label: '' });
    expect(r.ok && r.location.label).toBe('33.87° S, 151.21° E');
  });

  it('reports every bad field at once', () => {
    const r = validateManualLocation({ lat: '95', lon: 'x', label: 'a'.repeat(121) });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(['label', 'lat', 'lon']);
  });

  it('allows a name of exactly the limit', () => {
    const r = validateManualLocation({ lat: '1', lon: '2', label: 'a'.repeat(120) });
    expect(r.ok).toBe(true);
  });
});

describe('formatLatLon', () => {
  it('writes hemispheres', () => {
    expect(formatLatLon(34.0522, -118.2437)).toBe('34.05° N, 118.24° W');
    expect(formatLatLon(-33.87, 151.21)).toBe('33.87° S, 151.21° E');
  });
});

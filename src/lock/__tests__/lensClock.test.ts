import { describe, it, expect } from 'vitest';
import { hexToOklab, paletteToHex, skyFor } from '@pyxis/app-sdk';
import { lensGradient, lighten, supportsMozElement } from '../lensClock';

const NOON = Date.UTC(2026, 5, 21, 12, 0, 0);
const palette = skyFor('daylight', {
  nowMs: NOON,
  utcOffsetMinutes: 0,
  location: null,
  time: null,
  daySpeed: 1,
  anchorMs: NOON,
}).palette;

describe('the lens clock without -moz-element', () => {
  it('is not claimed outside Gecko', () => {
    // jsdom (like Chrome) has no -moz-element().
    expect(supportsMozElement()).toBe(false);
  });

  it('lightens toward white and keeps white white', () => {
    const base = '#1b2350';
    expect(hexToOklab(lighten(base, 0.6))[0]).toBeGreaterThan(hexToOklab(base)[0]);
    expect(lighten(base, 0)).toBe(base);
    expect(lighten('#336699', 1)).toBe('#ffffff');
  });

  it('is five masses and a base, every layer an image (a bare colour drops the whole value)', () => {
    const layers = lensGradient(palette).split(/,\s*(?=radial-gradient|linear-gradient)/);
    expect(layers).toHaveLength(6);
    expect(layers.slice(0, 5).every((l) => l.startsWith('radial-gradient('))).toBe(true);
    expect(layers[5]).toMatch(/^linear-gradient\(#[0-9a-f]{6}, #[0-9a-f]{6}\)$/);
  });

  it('is lighter than the wallpaper it stands in for', () => {
    const lensHex = lensGradient(palette).match(/#[0-9a-f]{6}/g)!;
    const wallHex = paletteToHex(palette);
    const mean = (hex: string[]) => hex.reduce((a, h) => a + hexToOklab(h)[0], 0) / hex.length;
    expect(mean(lensHex)).toBeGreaterThan(mean(wallHex));
  });
});

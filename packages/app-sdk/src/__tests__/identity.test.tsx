import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import {
  BUILTIN_APP_ACCENTS,
  CORNER,
  IDENTITY_FONT_WEIGHTS,
  SHELL_TINT_VARS,
  applyShellTint,
  contrastRatio,
  cornerCss,
  materialBases,
  paletteMean,
  resolveAppAccent,
  shellTint,
  waterdrop,
  waterdropRadii,
} from '../identity';
import { SETTING_KEYS } from '../settingsBus';
import { usePyxisAccessibility } from '../usePyxisTheme';
import { useShellTint } from '../useShellTint';
import { daylightPalette, fallbackSun } from '../wallpaper/daylight';
import { STATIC_HEX, hexToRgb, oklabToHex, paletteFromHex, type Palette } from '../wallpaper/palettes';

/** Daylight on the fixed schedule (no location) at a local clock time. */
const daylightAt = (h: number, m = 0): Palette => daylightPalette(fallbackSun(h * 60 + m));

const TIMES = {
  night: daylightAt(2),
  dawn: daylightAt(6, 40),
  day: daylightAt(12, 30),
  goldenEvening: daylightAt(17, 10),
  dusk: daylightAt(18, 30),
};

/** The rgb channels of an `rgba(r, g, b, a)` string, 0..1, and its alpha. */
function parseRgba(s: string): { rgb: [number, number, number]; alpha: number } {
  const m = s.match(/^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/);
  if (!m) throw new Error(`not rgba(): ${s}`);
  return { rgb: [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255], alpha: Number(m[4]) };
}

const lum = ([r, g, b]: readonly number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

describe('the waterdrop corner', () => {
  it('is 16 4 16 16 at window size', () => {
    expect(CORNER).toEqual({ tl: 16, tr: 4, br: 16, bl: 16 });
    expect(cornerCss(CORNER)).toBe('16px 4px 16px 16px');
    expect(waterdrop(800)).toBe('16px 4px 16px 16px');
  });

  it('is 12 3 12 12 for a 40 px icon and 7 2 7 7 for a 20 px one', () => {
    expect(waterdrop(40)).toBe('12px 3px 12px 12px');
    expect(waterdrop(20)).toBe('7px 2px 7px 7px');
  });

  it('never shrinks as an element grows, and keeps the top-right the sharpest', () => {
    let prev = waterdropRadii(0);
    for (let s = 1; s <= 120; s++) {
      const r = waterdropRadii(s);
      expect(r.tl).toBeGreaterThanOrEqual(prev.tl);
      expect(r.tr).toBeGreaterThanOrEqual(prev.tr);
      expect(r.tr).toBeLessThanOrEqual(r.tl);
      expect(r.tl).toBeLessThanOrEqual(s / 2);
      prev = r;
    }
  });
});

describe('shellTint', () => {
  const cases: [string, Palette][] = [
    ...Object.entries(TIMES),
    ...Object.entries(STATIC_HEX).map(([id, hex]) => [id, paletteFromHex(hex)] as [string, Palette]),
  ];

  for (const [name, palette] of cases) {
    for (const theme of ['light', 'dark'] as const) {
      it(`${name}, ${theme}: ink reads on the wallpaper and material ink on the material`, () => {
        const t = shellTint(palette, theme);
        expect(t.mean).toBe(oklabToHex(paletteMean(palette)));
        expect(contrastRatio(t.ink, t.mean)).toBeGreaterThanOrEqual(4.5);
        const material = parseRgba(t.material);
        expect(material.alpha).toBe(0.82);
        expect(parseRgba(t.materialStrong)).toEqual({ rgb: material.rgb, alpha: 0.94 });
        expect(contrastRatio(t.materialInk, material.rgb)).toBeGreaterThanOrEqual(4.5);
        expect(t.dark).toBe(theme === 'dark');
        // Light material is mostly white; dark material mostly #10132a.
        if (theme === 'dark') expect(lum(material.rgb)).toBeLessThan(0.3);
        else expect(lum(material.rgb)).toBeGreaterThan(0.75);
      });
    }
  }

  it('turns the ink light at night and dark by day, whatever the theme', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(lum(hexToRgb(shellTint(TIMES.night, theme).ink))).toBeGreaterThan(0.8);
      expect(lum(hexToRgb(shellTint(TIMES.day, theme).ink))).toBeLessThan(0.2);
    }
  });

  it('gives the launch bar a material that follows the wallpaper, not the theme', () => {
    for (const theme of ['light', 'dark'] as const) {
      // A pale bar over a night wallpaper is a band across the screen.
      const night = shellTint(TIMES.night, theme);
      expect(lum(parseRgba(night.edgeMaterial).rgb)).toBeLessThan(0.3);
      const day = shellTint(TIMES.day, theme);
      expect(lum(parseRgba(day.edgeMaterial).rgb)).toBeGreaterThan(0.75);
    }
    for (const [, palette] of Object.entries(TIMES)) {
      const t = shellTint(palette, 'light');
      const edge = parseRgba(t.edgeMaterial);
      expect(parseRgba(t.edgeMaterialStrong)).toEqual({ rgb: edge.rgb, alpha: 0.94 });
      expect(contrastRatio(t.edgeInk, edge.rgb)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('puts a dark shadow under light ink and a light one under dark ink', () => {
    expect(lum(parseRgba(shellTint(TIMES.night, 'light').inkShadow).rgb)).toBeLessThan(0.2);
    expect(lum(parseRgba(shellTint(TIMES.day, 'light').inkShadow).rgb)).toBeGreaterThan(0.8);
  });

  it('tints each fixed palette from its own colours', () => {
    const means = Object.values(STATIC_HEX).map((hex) => shellTint(paletteFromHex(hex), 'light').mean);
    expect(new Set(means).size).toBe(means.length);
  });
});

describe('applyShellTint and useShellTint', () => {
  it('writes every variable and data-px-tint', () => {
    const el = document.createElement('div');
    const t = shellTint(TIMES.dusk, 'dark');
    applyShellTint(t, el);
    for (const [field, name] of Object.entries(SHELL_TINT_VARS)) {
      expect(el.style.getPropertyValue(name)).toBe(t[field as keyof typeof SHELL_TINT_VARS]);
    }
    expect(el.dataset.pxTint).toBe('dark');
  });

  it('writes the tint for a pinned time onto its target', async () => {
    const el = document.createElement('div');
    function Probe({ time }: { time: number }) {
      useShellTint({ time, target: el });
      return null;
    }
    const view = render(<Probe time={2 * 60} />);
    await act(async () => {});
    const night = el.style.getPropertyValue('--px-ink');
    expect(lum(hexToRgb(night))).toBeGreaterThan(0.8);
    view.rerender(<Probe time={12 * 60 + 30} />);
    await act(async () => {});
    expect(lum(hexToRgb(el.style.getPropertyValue('--px-ink')))).toBeLessThan(0.2);
  });
});

describe('titleMaterial (what Evo’s flat title bar is made from)', () => {
  it('is a light and a dark base colour, whichever theme is on', () => {
    for (const palette of Object.values(TIMES)) {
      const asLight = shellTint(palette, 'light').titleMaterial;
      const asDark = shellTint(palette, 'dark').titleMaterial;
      expect(asLight).toEqual(asDark);
      expect(asLight.light).toMatch(/^#[0-9a-f]{6}$/);
      expect(asLight.dark).toMatch(/^#[0-9a-f]{6}$/);
      expect(lum(hexToRgb(asLight.light))).toBeGreaterThan(lum(hexToRgb(asLight.dark)));
      expect(materialBases(palette)).toEqual(asLight);
    }
  });

  it('is the colour the theme’s own material is made of', () => {
    const t = shellTint(TIMES.day, 'light');
    const { rgb } = parseRgba(t.material);
    const light = hexToRgb(t.titleMaterial.light);
    rgb.forEach((c, i) => expect(Math.abs(c - light[i])).toBeLessThan(0.01));
    const d = shellTint(TIMES.day, 'dark');
    const dark = hexToRgb(d.titleMaterial.dark);
    parseRgba(d.material).rgb.forEach((c, i) => expect(Math.abs(c - dark[i])).toBeLessThan(0.01));
  });
});

describe('font weight, accents, and accessibility attributes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    delete document.documentElement.dataset.cursorSize;
    delete document.documentElement.dataset.highContrast;
    delete document.documentElement.dataset.reduceTransparency;
    delete document.documentElement.dataset.textScale;
    delete document.body.dataset.cursorSize;
    document.documentElement.style.fontSize = '';
  });

  it('aligns display weight to 400 and BUILTIN_APP_ACCENTS to manifest hues', () => {
    expect(IDENTITY_FONT_WEIGHTS.display).toBe(400);
    expect(BUILTIN_APP_ACCENTS).toMatchObject({
      terminal: '#34d399',
      browser: '#0284c7',
      files: '#d97706',
      notes: '#eab308',
      contacts: '#0d9488',
      tasks: '#7c3aed',
      settings: '#64748b',
      installer: '#ea580c',
    });
    expect(resolveAppAccent(undefined, 'browser-window')).toBe('#0284c7');
  });

  it('usePyxisAccessibility syncs accessibility traits including cursorSize onto root and body', async () => {
    const { setSetting } = await import('../settingsBus');
    await setSetting(SETTING_KEYS.cursorSize, 'xlarge');
    await setSetting(SETTING_KEYS.highContrast, true);
    await setSetting(SETTING_KEYS.textScale, 125);

    function Probe() {
      usePyxisAccessibility();
      return null;
    }

    const view = render(<Probe />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(document.documentElement.dataset.cursorSize).toBe('xlarge');
    expect(document.body.dataset.cursorSize).toBe('xlarge');
    expect(document.documentElement.dataset.highContrast).toBe('true');
    expect(document.documentElement.style.fontSize).toBe('125%');
    view.unmount();
  });
});

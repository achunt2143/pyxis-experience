/**
 * Pyxis's visual identity as values: the waterdrop corner, the remochi
 * spinner's colours, Mochi type, and the shell's tint from the wallpaper.
 * Plan: geckos/docs/internal/pyxis-visual-identity-plan.md (lane T).
 *
 * Evo keeps its own copy of the corner and the spinner colours
 * (evo/src/shell/identity.rs) for the title bar it draws;
 * `identityContract.test.ts` reads that file and fails when the two differ.
 * The CSS half is `@pyxis/app-sdk/identity.css`, whose `--px-*` variables carry
 * the same values; the tint variables are written at run time by `useShellTint`.
 */
import {
  hexToOklab,
  hexToRgb,
  mixOklab,
  oklabToRgb,
  rgbToHex,
  type Oklab,
  type Palette,
  type Rgb,
} from './wallpaper/palettes';

// ---- Corner ----

/**
 * The waterdrop corner, px, for a window-sized element: every corner round
 * but the top-right, which is nearly sharp. Maximized and fullscreen
 * windows are square instead.
 */
export const CORNER = { tl: 16, tr: 4, br: 16, bl: 16 } as const;

export interface CornerRadii {
  tl: number;
  tr: number;
  br: number;
  bl: number;
}

/** A corner as a CSS `border-radius` shorthand (top-left, top-right, bottom-right, bottom-left). */
export function cornerCss(r: CornerRadii): string {
  return `${r.tl}px ${r.tr}px ${r.br}px ${r.bl}px`;
}

/**
 * The waterdrop corner for an element `size` px high. Small things get a
 * smaller drop: a 40 px icon `12 3 12 12`, a 20 px one `7 2 7 7`; between
 * and above those the radii grow on the same line until they reach
 * CORNER's (from about 56 px), and below 20 px they shrink in proportion.
 */
export function waterdropRadii(size: number): CornerRadii {
  const s = Math.max(0, size);
  const round = s < 20 ? (7 * s) / 20 : 7 + (s - 20) * 0.25;
  const sharp = s < 20 ? (2 * s) / 20 : 2 + (s - 20) * 0.05;
  const r = Math.min(CORNER.tl, Math.round(round));
  const t = Math.min(CORNER.tr, Math.round(sharp));
  return { tl: r, tr: t, br: r, bl: r };
}

/** `waterdropRadii` as a `border-radius` shorthand, e.g. `waterdrop(40)` is `12px 3px 12px 12px`. */
export function waterdrop(size: number): string {
  return cornerCss(waterdropRadii(size));
}

// ---- The spinner ----

/**
 * The remochi spinner's colours, sampled from its GIF: red circle, blue
 * square, yellow triangle, each with a thin dark outline. Evo draws the
 * window controls in these.
 */
export const SPINNER = {
  red: '#ff4a4a',
  redOutline: '#a12c2c',
  blue: '#69cdff',
  blueOutline: '#33647c',
  yellow: '#ffb80d',
  yellowOutline: '#5d4305',
} as const;

// ---- Type ----

/**
 * Mochi, as the apps use it (remochi's faces: Prelude where installed,
 * else the Lato it bundles). Display is set uppercase with DISPLAY_TRACKING.
 */
export const IDENTITY_FONTS = {
  /** Mochi Light (registered at weight 400 in remochi), then Lato: the clock, panel heads. */
  display: "'Mochi Light', 'Mochi Lato', 'Lato', sans-serif",
  /** Mochi Medium, then Lato: everything else. */
  ui: "'Mochi Medium', 'Mochi Lato', 'Lato', sans-serif",
  /** Mochi Bold Oblique, then Lato 700 italic: the one emphasised word. */
  accent: "'Mochi Bold Oblique', 'Mochi Lato', 'Lato', sans-serif",
} as const;

export const IDENTITY_FONT_WEIGHTS = {
  display: 400,
  ui: 400,
  accent: 700,
} as const;

export const DISPLAY_TRACKING = '0.14em';

// ---- The shell's tint ----

/** Where the light and dark materials are mixed toward. */
export const LIGHT_BASE = '#f7f6f2';
export const DARK_BASE = '#14161f';

/** The tint rule's numbers (the plan's "Material" row). */
export const TINT = {
  light: LIGHT_BASE,
  dark: DARK_BASE,
  lightMix: 0.91,
  darkMix: 0.88,
  alpha: 0.82,
  strongAlpha: 0.94,
  /** WCAG AA for body text. */
  minContrast: 4.5,
} as const;

export interface ShellTint {
  /** The palette's mean colour, `#rrggbb`: what the wallpaper averages to. */
  mean: string;
  /** Panel/bar material, `rgba()`. */
  material: string;
  /** The same, nearly opaque, for things that sit over busy content. */
  materialStrong: string;
  /** Ink drawn straight on the wallpaper, `#rrggbb`: >= 4.5:1 against `mean`. */
  ink: string;
  /** `ink`, quieter (secondary text, idle glyphs), `rgba()`. */
  inkQuiet: string;
  /** A soft shadow behind `ink` for legibility over the moving wallpaper, `rgba()`. */
  inkShadow: string;
  /** Ink drawn on the material, `#rrggbb`: >= 4.5:1 against the material's colour. */
  materialInk: string;
  /** `materialInk`, quieter, `rgba()`. */
  materialInkQuiet: string;
  /** The palette's light: its most colourful mass, kept bright, `#rrggbb`. */
  glow: string;
  /**
   * Material for things that sit on the wallpaper's edge (the launch bar and
   * what is on it), `rgba()`. It follows the wallpaper, as `ink` does, not the
   * theme: a light bar over a night wallpaper is a pale band across the
   * screen. Dark when the wallpaper is dark, light when it is light.
   */
  edgeMaterial: string;
  /** The same, nearly opaque (tiles and chips on the bar). */
  edgeMaterialStrong: string;
  /** Ink on the edge material, `#rrggbb`: >= 4.5:1 against it. */
  edgeInk: string;
  /** `edgeInk`, quieter, `rgba()`. */
  edgeInkQuiet: string;
  /**
   * The material's base colour for each theme, `#rrggbb` (the colour before
   * its alpha), whichever theme is on: what Evo's flat title bar is made from
   * when it has nothing to frost (`SetAppIdentity`'s `material`).
   */
  titleMaterial: TitleMaterial;
  /** Whether the material is the dark one. */
  dark: boolean;
}

/** The title bar's material base colour for each theme, `#rrggbb`. */
export interface TitleMaterial {
  light: string;
  dark: string;
}

function linear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a gamma-encoded sRGB colour. */
export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio of two colours (`#rrggbb` or sRGB 0..1), 1..21. */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const la = relativeLuminance(typeof a === 'string' ? hexToRgb(a) : a);
  const lb = relativeLuminance(typeof b === 'string' ? hexToRgb(b) : b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** The palette's mean colour, averaged in OKLab as the wallpaper mixes. */
export function paletteMean(palette: Palette): Oklab {
  const n = palette.length || 1;
  const sum = palette.reduce<[number, number, number]>(
    (acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]],
    [0, 0, 0]
  );
  return [sum[0] / n, sum[1] / n, sum[2] / n];
}

const BLACK: Oklab = [0, 0, 0];
const WHITE: Oklab = [1, 0, 0];

/**
 * Ink for a background: a near-black or near-white carrying a little of the
 * background's hue, whichever reads better, taken further toward pure black
 * or white until it reaches 4.5:1. Pure black or white always gets there
 * (one of them is at least 4.58:1 against any colour).
 */
export function inkFor(background: Oklab): Oklab {
  // Measured as written out (#rrggbb), so rounding can't cost the last 0.01.
  const quantize = (c: Oklab): Rgb => hexToRgb(rgbToHex(oklabToRgb(c)));
  const bg = quantize(background);
  const tint = (L: number, keep: number): Oklab => [L, background[1] * keep, background[2] * keep];
  const candidates = [
    { start: tint(0.22, 0.35), end: BLACK },
    { start: tint(0.97, 0.15), end: WHITE },
  ].map((c) => {
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const ink = mixOklab(c.start, c.end, Math.min(1, t));
      const ratio = contrastRatio(quantize(ink), bg);
      if (ratio >= TINT.minContrast) return { ink, ratio, steps: t };
    }
    return { ink: c.end, ratio: contrastRatio(quantize(c.end), bg), steps: 2 };
  });
  // The one that needed least pushing, then the higher contrast.
  candidates.sort((x, y) => x.steps - y.steps || y.ratio - x.ratio);
  return candidates[0].ink;
}

function rgba(c: Oklab | Rgb, alpha: number, isRgb = false): string {
  const [r, g, b] = isRgb ? (c as Rgb) : oklabToRgb(c as Oklab);
  const to = (x: number) => Math.round(x * 255);
  return `rgba(${to(r)}, ${to(g)}, ${to(b)}, ${alpha})`;
}

const hex = (c: Oklab) => rgbToHex(oklabToRgb(c));

/**
 * The material's base colour for both themes: the palette's mean mixed
 * toward white (light) or DARK_BASE (dark), as `shellTint` mixes the
 * material. Pure.
 */
export function materialBases(palette: Palette): TitleMaterial {
  const mean = paletteMean(palette);
  return {
    light: hex(mixOklab(mean, hexToOklab(LIGHT_BASE), TINT.lightMix)),
    dark: hex(mixOklab(mean, hexToOklab(DARK_BASE), TINT.darkMix)),
  };
}

/**
 * The shell's tint for a wallpaper palette (Daylight's of the moment, or a
 * fixed one) and a theme. Material: the palette's mean mixed 91% toward
 * warm alabaster stone, or 88% toward DARK_BASE when `dark`, at alpha 0.82 (strong 0.94).
 * Ink: what reads on the mean, so it follows the wallpaper whatever the
 * theme (dark by day, light at night); material ink: what reads on the
 * material. Pure.
 */
export function shellTint(palette: Palette, theme: 'light' | 'dark'): ShellTint {
  const dark = theme === 'dark';
  const mean = paletteMean(palette);
  const base = dark
    ? mixOklab(mean, hexToOklab(DARK_BASE), TINT.darkMix)
    : mixOklab(mean, hexToOklab(LIGHT_BASE), TINT.lightMix);
  const ink = inkFor(mean);
  const inkIsLight = ink[0] > mean[0];
  const materialInk = inkFor(base);
  // Light ink means a dark wallpaper: the edge takes the dark material.
  const edge = inkIsLight
    ? mixOklab(mean, hexToOklab(DARK_BASE), TINT.darkMix)
    : mixOklab(mean, hexToOklab(LIGHT_BASE), TINT.lightMix);
  const edgeInk = inkFor(edge);

  // The most colourful mass, held between L 0.72 and 0.9 so it reads as light.
  const vivid = palette.reduce((best, c) => (Math.hypot(c[1], c[2]) > Math.hypot(best[1], best[2]) ? c : best), mean);
  const glow: Oklab = [Math.min(0.9, Math.max(0.72, vivid[0])), vivid[1], vivid[2]];

  // The shadow is the opposite of the ink: dark under light ink, light under dark.
  const shadow = inkIsLight ? mixOklab(mean, BLACK, 0.8) : mixOklab(mean, WHITE, 0.85);

  return {
    mean: hex(mean),
    material: rgba(base, TINT.alpha),
    materialStrong: rgba(base, TINT.strongAlpha),
    ink: hex(ink),
    inkQuiet: rgba(ink, 0.72),
    inkShadow: rgba(shadow, inkIsLight ? 0.45 : 0.55),
    materialInk: hex(materialInk),
    materialInkQuiet: rgba(materialInk, 0.68),
    edgeMaterial: rgba(edge, TINT.alpha),
    edgeMaterialStrong: rgba(edge, TINT.strongAlpha),
    edgeInk: hex(edgeInk),
    edgeInkQuiet: rgba(edgeInk, 0.68),
    glow: hex(glow),
    titleMaterial: materialBases(palette),
    dark,
  };
}

/** The CSS variable each ShellTint field is written to. */
export const SHELL_TINT_VARS = {
  material: '--px-material',
  materialStrong: '--px-material-strong',
  ink: '--px-ink',
  inkQuiet: '--px-ink-quiet',
  inkShadow: '--px-ink-shadow',
  materialInk: '--px-material-ink',
  materialInkQuiet: '--px-material-ink-quiet',
  edgeMaterial: '--px-edge-material',
  edgeMaterialStrong: '--px-edge-material-strong',
  edgeInk: '--px-edge-ink',
  edgeInkQuiet: '--px-edge-ink-quiet',
  glow: '--px-glow',
  mean: '--px-wallpaper-mean',
} as const satisfies Partial<Record<keyof ShellTint, string>>;

/**
 * Write a tint onto an element (the document root, normally): every
 * SHELL_TINT_VARS variable, and `data-px-tint="light|dark"` for CSS that
 * has to choose by it.
 */
export function applyShellTint(tint: ShellTint, el: HTMLElement): void {
  for (const [field, name] of Object.entries(SHELL_TINT_VARS)) {
    el.style.setProperty(name, tint[field as keyof typeof SHELL_TINT_VARS]);
  }
  el.dataset.pxTint = tint.dark ? 'dark' : 'light';
}

// ---- Per-app accents (P2) ----

/**
 * Fallback accents for the eight built-in Pyxis apps, matching their
 * `manifest.webapp` / `pyxis.json` `"accent"` field and Bloom's `APP_ACCENTS`.
 */
export const BUILTIN_APP_ACCENTS: Readonly<Record<string, string>> = {
  terminal: '#34d399',
  browser: '#0284c7',
  'browser-window': '#0284c7',
  files: '#d97706',
  notes: '#eab308',
  contacts: '#0d9488',
  tasks: '#7c3aed',
  settings: '#64748b',
  installer: '#ea580c',
};

/**
 * Resolve an app's `#rrggbb` accent from an explicit hex string or from its
 * app id / Duyo root kind name (e.g. `'notes'` or `'Notes.App'`).
 */
export function resolveAppAccent(
  accent?: string | null,
  appIdOrRootKind?: string
): string | undefined {
  if (typeof accent === 'string') {
    const trimmed = accent.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
  }
  if (typeof appIdOrRootKind === 'string' && appIdOrRootKind.length > 0) {
    const lower = appIdOrRootKind.trim().toLowerCase();
    if (BUILTIN_APP_ACCENTS[lower]) return BUILTIN_APP_ACCENTS[lower];
    const head = lower.split('.')[0];
    if (head && BUILTIN_APP_ACCENTS[head]) return BUILTIN_APP_ACCENTS[head];
  }
  return undefined;
}

/**
 * Build the `ThemeWrapper` `tokens` map for an app's accent: `--px-accent`
 * only. Deliberately does not override `--mochi-accent` (since Remochi 0.5 the
 * "on" of every Toggle, Radio and Checkbox is amber `--mochi-selected`, and the
 * sky-blue `--mochi-accent` marks interaction; an app colour there would turn
 * every "on" into that app's colour) nor `--mochi-primary` (Notes' `#eab308`
 * on white fails text contrast).
 */
export function appAccentTokens(
  accent?: string | null,
  appIdOrRootKind?: string
): Record<string, string> | undefined {
  const resolved = resolveAppAccent(accent, appIdOrRootKind);
  if (!resolved) return undefined;
  return {
    '--px-accent': resolved,
  };
}


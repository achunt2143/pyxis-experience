/**
 * Wallpapers are shared vocabulary between the Bloom desktop shell (renders
 * the current one) and the Settings app (lets the user pick one). Stored via
 * the real `org.geckoOS.settings` service and broadcast on the settings bus
 * so the running shell reacts live even though Settings is a separate
 * process/package.
 *
 * Every wallpaper is drawn by the flowing engine in `wallpaper/`: Daylight's
 * palette follows the sun, the others are a fixed palette that flows but
 * doesn't follow the day. `css` is a static stand-in (a swatch, or what a
 * page shows before the engine's first frame).
 */
import { STATIC_HEX, paletteFromHex, type Palette } from './wallpaper/palettes';

export type WallpaperKind = 'daylight' | 'palette';

export interface WallpaperDef {
  id: string;
  name: string;
  kind: WallpaperKind;
  /** Five colours, one per colour mass; only on `palette` wallpapers. */
  colors?: readonly string[];
  css: string;
}

export const DEFAULT_WALLPAPER_ID = 'daylight';

export const WALLPAPERS: readonly WallpaperDef[] = [
  {
    id: 'daylight',
    name: 'Daylight',
    kind: 'daylight',
    css: 'linear-gradient(135deg, #1b2350 0%, #6b5ea8 22%, #ff9a8b 42%, #4facfe 64%, #f6c365 82%, #8e54e9 100%)',
  },
  {
    id: 'aurora',
    name: 'Aurora',
    kind: 'palette',
    colors: STATIC_HEX.aurora,
    css: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    kind: 'palette',
    colors: STATIC_HEX.sunset,
    css: 'linear-gradient(135deg, #ff7e5f 0%, #feb47b 100%)',
  },
  {
    id: 'forest',
    name: 'Forest',
    kind: 'palette',
    colors: STATIC_HEX.forest,
    css: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
  },
  {
    id: 'mochi',
    name: 'Mochi',
    kind: 'palette',
    colors: STATIC_HEX.mochi,
    css: 'linear-gradient(135deg, #4a8bc2 0%, #6aaedb 55%, #ffd479 100%)',
  },
];

export function isWallpaperId(id: unknown): id is string {
  return typeof id === 'string' && WALLPAPERS.some((w) => w.id === id);
}

/** The wallpaper with that id; an unknown id is Daylight. */
export function wallpaperById(id: string | null | undefined): WallpaperDef {
  return WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0];
}

/** A `palette` wallpaper's fixed palette (OKLab); null for Daylight. */
export function wallpaperPalette(def: WallpaperDef): Palette | null {
  return def.kind === 'palette' && def.colors ? paletteFromHex(def.colors) : null;
}

// The flowing wallpaper engine (Daylight and the fixed-palette wallpapers).
export { DynamicWallpaper, type DynamicWallpaperProps } from './DynamicWallpaper';
export {
  EXPOSURE_PAUSE_AT,
  exposedFraction,
  exposureVerdict,
  unionArea,
  useWallpaperExposure,
  type ExposureRect,
  type ExposureVerdict,
  type ExposureWindow,
} from './useWallpaperExposure';
export {
  STILL_CHECK_MS,
  WALLPAPER_FPS,
  parseClockTime,
  skyFor,
  skyInstant,
  wallpaperState,
  type Sky,
  type SkyInputs,
  type WallpaperState,
} from './engine';
export {
  FALLBACK_SCHEDULE,
  daylightPalette,
  daylightPhase,
  daylightSun,
  fallbackSun,
  type DaylightClock,
  type GeoPoint,
  type SunState,
} from './daylight';
export {
  PHASE_HEX,
  hexToOklab,
  oklabToHex,
  paletteToHex,
  type DaylightPhase,
  type Oklab,
  type Palette,
} from './palettes';
export type { WallpaperBackend } from './renderers/types';

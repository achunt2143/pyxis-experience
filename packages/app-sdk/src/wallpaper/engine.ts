/**
 * The decisions behind DynamicWallpaper, pure so they can be tested: what
 * state the wallpaper is in, which instant the sky is drawn for, and the
 * palette for a wallpaper at that instant.
 */
import type { AnimationMode } from '../animations';
import type { WallpaperMotion } from '../settingsSchema';
import { wallpaperById, wallpaperPalette } from '../wallpapers';
import { daylightPalette, daylightPhase, daylightSun, instantAtLocalTime, type GeoPoint } from './daylight';
import type { DaylightPhase, Palette } from './palettes';

/** `flowing`: drawing frames. `paused`: would flow but nobody can see it. `still`: not meant to move. */
export type WallpaperState = 'flowing' | 'paused' | 'still';
export type { WallpaperMotion };

/** Frames a second while flowing: masses move under a pixel a frame, so more would look the same. */
export const WALLPAPER_FPS = 10;
/** How often a wallpaper that isn't flowing looks at the sky again. */
export const STILL_CHECK_MS = 60_000;
/** A still wallpaper's palette crossfade (`reduced`). */
export const STILL_CROSSFADE_MS = 3_000;
/** A frame that comes late (a stall, a throttled timer) advances the flow at most this much. */
export const MAX_FRAME_STEP_MS = 250;

export function wallpaperState(motion: WallpaperMotion, mode: AnimationMode, paused: boolean): WallpaperState {
  if (motion === 'still' || mode !== 'full') return 'still';
  return paused ? 'paused' : 'flowing';
}

export interface SkyInputs {
  /** Now, epoch ms (the device's clock). */
  nowMs: number;
  utcOffsetMinutes: number;
  location: GeoPoint | null;
  /** Minutes after local midnight to show, or null for now. */
  time: number | null;
  /** The day runs this many times faster than real time (dev), from `anchorMs`. */
  daySpeed: number;
  /** When `time` or `daySpeed` last changed, epoch ms. */
  anchorMs: number;
}

/**
 * The instant the sky is drawn for. Now, normally. A pinned or previewed
 * `time` is that local time today, frozen; with a `daySpeed` the day runs on
 * from it (or from now, with no `time`) that many times faster.
 */
export function skyInstant(s: SkyInputs): number {
  const speed = s.daySpeed > 0 ? s.daySpeed : 1;
  if (s.time === null && speed === 1) return s.nowMs;
  const start = s.time === null ? s.anchorMs : instantAtLocalTime(s.anchorMs, s.utcOffsetMinutes, s.time);
  const rate = s.time === null ? speed : speed === 1 ? 0 : speed;
  return start + (s.nowMs - s.anchorMs) * rate;
}

export interface Sky {
  palette: Palette;
  /** Daylight's phase; null for a fixed palette (it never changes). */
  phase: DaylightPhase | null;
}

export function skyFor(wallpaperId: string, s: SkyInputs): Sky {
  const def = wallpaperById(wallpaperId);
  const fixed = wallpaperPalette(def);
  if (fixed) return { palette: fixed, phase: null };
  const sun = daylightSun({ nowMs: skyInstant(s), utcOffsetMinutes: s.utcOffsetMinutes, location: s.location });
  return { palette: daylightPalette(sun), phase: daylightPhase(sun) };
}

/** `HH:MM` (24-hour) to minutes after midnight, or null. For the `?wallpaperTime=` override. */
export function parseClockTime(text: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((text ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

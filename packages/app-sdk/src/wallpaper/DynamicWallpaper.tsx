import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useAnimationMode, type AnimationMode } from '../animations';
import { useClock, useLocation } from '../clock';
import { SETTING_KEYS } from '../settingsBus';
import { oneOf, useSetting, type SettingParser } from '../useSetting';
import { wallpaperById } from '../wallpapers';
import type { GeoPoint } from './daylight';
import {
  MAX_FRAME_STEP_MS,
  STILL_CHECK_MS,
  STILL_CROSSFADE_MS,
  WALLPAPER_FPS,
  skyFor,
  wallpaperState,
  type SkyInputs,
  type WallpaperMotion,
  type WallpaperState,
} from './engine';
import { mixPalette, smootherstep, type DaylightPhase, type Palette } from './palettes';
import { createCssRenderer } from './renderers/css';
import { GRAIN_TILE, grainTileUrl } from './renderers/grain';
import type { WallpaperBackend, WallpaperRenderer } from './renderers/types';
import { createWebglRenderer } from './renderers/webgl';
import { scene } from './scene';

export interface DynamicWallpaperProps {
  /** A wallpaper id from WALLPAPERS; an unknown one draws Daylight. */
  wallpaper: string;
  /**
   * Preview (the Settings app's thumbnails): fills its parent at whatever
   * size it has, reads no settings, never pauses on exposure and logs
   * nothing. Pass `time` to show a time of day, `motion` and
   * `animationMode` to override the device's.
   */
  preview?: boolean;
  /**
   * Minutes after local midnight to draw Daylight at (0..1439), frozen.
   * Not in preview: overrides `pyxis.wallpaper.pinnedTime`; null follows
   * the day. Undefined (the default) means: the setting, or in preview, now.
   */
  time?: number | null;
  /** `flow` or `still`. Default: `pyxis.wallpaper.motion` (preview: `flow`). */
  motion?: WallpaperMotion;
  /** Default: the device's animation mode (`useAnimationMode`). */
  animationMode?: AnimationMode;
  /** Stop drawing frames (the desktop's exposure verdict). Ignored in preview. */
  paused?: boolean;
  /** Default `auto`: webgl where it works, else css. */
  backend?: 'auto' | WallpaperBackend;
  /** Frames a second while flowing. Default WALLPAPER_FPS (10). */
  fps?: number;
  /** Where to draw the sun for. Default: the device's (`useLocation`); null is the fixed schedule. */
  location?: GeoPoint | null;
  /** The day runs this many times faster (dev: `?wallpaperSpeed=`). Default 1. */
  daySpeed?: number;
  /** The masses drift this many times faster (dev). Default 1. */
  flowSpeed?: number;
  /** Appended to the `PYXIS-WALLPAPER` log line (the desktop says why it paused). */
  logDetail?: string;
  className?: string;
  style?: CSSProperties;
}

const asPinnedTime: SettingParser<number | null> = (raw) =>
  typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && raw < 1440 ? raw : undefined;
const asMotion = oneOf<WallpaperMotion>('flow', 'still');

const samePalette = (a: Palette, b: Palette) =>
  a.every((c, i) => Math.abs(c[0] - b[i][0]) + Math.abs(c[1] - b[i][1]) + Math.abs(c[2] - b[i][2]) < 1e-4);

/**
 * The flowing wallpaper. On the desktop it reads the motion and pinned-time
 * settings and follows the device's clock and location; with `preview` it
 * is a pure function of its props.
 *
 * Motion rules: `full` flows at `fps`; `reduced` is still and crossfades the
 * palette once a minute; `off` is still and changes only when Daylight's
 * phase does. `motion: 'still'` is still the `reduced` way. While `paused`
 * (or the document is hidden) no frames are drawn, and the palette is
 * updated once a minute.
 */
export function DynamicWallpaper(props: DynamicWallpaperProps) {
  return props.preview ? <WallpaperSurface {...props} /> : <DesktopWallpaper {...props} />;
}

function DesktopWallpaper(props: DynamicWallpaperProps) {
  const settingMotion = useSetting<WallpaperMotion>(SETTING_KEYS.wallpaperMotion, 'flow', asMotion);
  const settingPinned = useSetting<number | null>(SETTING_KEYS.wallpaperPinnedTime, null, asPinnedTime);
  return (
    <WallpaperSurface
      {...props}
      motion={props.motion ?? settingMotion}
      time={props.time !== undefined ? props.time : settingPinned}
    />
  );
}

function WallpaperSurface({
  wallpaper,
  preview = false,
  time,
  motion = 'flow',
  animationMode,
  paused = false,
  backend: backendPref = 'auto',
  fps = WALLPAPER_FPS,
  location: locationProp,
  daySpeed = 1,
  flowSpeed = 1,
  logDetail,
  className,
  style,
}: DynamicWallpaperProps) {
  const deviceMode = useAnimationMode();
  const mode = animationMode ?? deviceMode;
  const clock = useClock();
  const deviceLocation = useLocation();
  const chosen =
    locationProp !== undefined
      ? locationProp
      : deviceLocation && deviceLocation.lat !== null && deviceLocation.lon !== null
        ? { lat: deviceLocation.lat, lon: deviceLocation.lon }
        : null;
  const lat = chosen?.lat ?? null;
  const lon = chosen?.lon ?? null;
  const location = useMemo<GeoPoint | null>(
    () => (lat !== null && lon !== null ? { lat, lon } : null),
    [lat, lon]
  );
  const pinned = time ?? null;
  const state = wallpaperState(motion, mode, preview ? false : paused);

  const containerRef = useRef<HTMLDivElement>(null);
  const [renderer, setRenderer] = useState<WallpaperRenderer | null>(null);

  // What the frame loop reads: refreshed every render, read at draw time, so
  // a change of clock or location reaches the next frame without
  // restarting the loop.
  const skewRef = useRef(0);
  const anchorRef = useRef<number | null>(null);
  const inputsRef = useRef({ wallpaper, pinned, location, daySpeed, flowSpeed, fps, mode, offset: 0 });
  useEffect(() => {
    skewRef.current = clock.epochMs - Date.now();
  }, [clock.epochMs]);
  useEffect(() => {
    inputsRef.current = {
      wallpaper,
      pinned,
      location,
      daySpeed,
      flowSpeed,
      fps,
      mode,
      offset: clock.utcOffsetMinutes,
    };
  });
  // A new pinned time or day speed starts the day's clock from there.
  useEffect(() => {
    anchorRef.current = null;
  }, [pinned, daySpeed]);

  const flowMsRef = useRef(0);
  const paletteRef = useRef<Palette | null>(null);
  const phaseRef = useRef<DaylightPhase | null>(null);

  // The renderer: webgl where it works, else css. A lost webgl context
  // falls back to css for the rest of this mount.
  const [webglLost, setWebglLost] = useState(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let r: WallpaperRenderer | null = null;
    if (backendPref !== 'css' && !webglLost) r = createWebglRenderer(el, { onLost: () => setWebglLost(true) });
    if (!r) r = createCssRenderer(el);
    const made = r;
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            made.resize(el.clientWidth, el.clientHeight);
            if (paletteRef.current) made.draw(scene(flowMsRef.current, paletteRef.current));
          })
        : null;
    ro?.observe(el);
    // Published from the effect so the frame loop starts with a renderer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRenderer(made);
    return () => {
      ro?.disconnect();
      made.dispose();
      setRenderer(null);
    };
  }, [backendPref, webglLost]);

  const inputsKey = useMemo(
    () => JSON.stringify([wallpaper, pinned, location, daySpeed, mode, clock.utcOffsetMinutes]),
    [wallpaper, pinned, location, daySpeed, mode, clock.utcOffsetMinutes]
  );

  // The frame loop for the current state.
  useEffect(() => {
    if (!renderer) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));

    const sky = () => {
      const i = inputsRef.current;
      const nowMs = Date.now() + skewRef.current;
      if (anchorRef.current === null) anchorRef.current = nowMs;
      const s: SkyInputs = {
        nowMs,
        utcOffsetMinutes: i.offset,
        location: i.location,
        time: i.pinned,
        daySpeed: i.daySpeed,
        anchorMs: anchorRef.current,
      };
      return skyFor(i.wallpaper, s);
    };
    const draw = (palette: Palette, paletteMs = 0) => {
      paletteRef.current = palette;
      renderer.draw(scene(flowMsRef.current, palette), { paletteMs });
    };
    // With the day sped up (dev), look at the sky as often as it moves.
    const checkMs = () => Math.max(1000 / inputsRef.current.fps, STILL_CHECK_MS / Math.max(1, inputsRef.current.daySpeed));

    if (state === 'flowing') {
      let last = performance.now();
      const tick = () => {
        const now = performance.now();
        flowMsRef.current += Math.min(now - last, MAX_FRAME_STEP_MS) * inputsRef.current.flowSpeed;
        last = now;
        const s = sky();
        phaseRef.current = s.phase;
        draw(s.palette);
        later(tick, 1000 / inputsRef.current.fps);
      };
      tick();
    } else if (state === 'paused') {
      // One frame for whatever changed, then the palette once a minute.
      const tick = () => {
        const s = sky();
        phaseRef.current = s.phase;
        draw(s.palette);
        later(tick, checkMs());
      };
      tick();
    } else {
      const first = sky();
      phaseRef.current = first.phase;
      draw(first.palette);
      const crossfade = (from: Palette, to: Palette) => {
        if (renderer.backend === 'css') {
          draw(to, STILL_CROSSFADE_MS);
          return;
        }
        const start = performance.now();
        const step = () => {
          const t = Math.min(1, (performance.now() - start) / STILL_CROSSFADE_MS);
          draw(mixPalette(from, to, smootherstep(t)));
          if (t < 1) later(step, 1000 / inputsRef.current.fps);
        };
        step();
      };
      const tick = () => {
        const s = sky();
        if (inputsRef.current.mode === 'off') {
          // Only a change of phase changes the picture, and at once.
          if (s.phase !== phaseRef.current) draw(s.palette);
        } else if (paletteRef.current && !samePalette(paletteRef.current, s.palette)) {
          crossfade(paletteRef.current, s.palette);
        }
        phaseRef.current = s.phase;
        later(tick, checkMs());
      };
      later(tick, checkMs());
    }
    return () => timers.forEach(clearTimeout);
  }, [renderer, state, inputsKey]);

  // One line per change of state or backend, for the on-device suite, with
  // the caller's account of why (read when the state changes, not a reason
  // to log). vela's log gets a page's `dump()`, not its console.
  const backend = renderer?.backend ?? null;
  const detailRef = useRef(logDetail);
  useEffect(() => {
    detailRef.current = logDetail;
  });
  useEffect(() => {
    if (preview || !backend) return;
    const line = `PYXIS-WALLPAPER state=${state} backend=${backend}${detailRef.current ? ` ${detailRef.current}` : ''}`;
    console.log(line);
    try {
      (globalThis as { dump?: (s: string) => void }).dump?.(`${line}\n`);
    } catch {
      /* dump is Gecko's, and may be off */
    }
  }, [preview, state, backend]);

  const grain = useMemo(() => grainTileUrl(), []);
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  return (
    <div
      ref={containerRef}
      className={className}
      data-wallpaper-id={wallpaperById(wallpaper).id}
      data-wallpaper-state={state}
      data-wallpaper-backend={backend ?? ''}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        // Until the first frame: the wallpaper's static stand-in.
        background: wallpaperById(wallpaper).css,
        pointerEvents: 'none',
        ...style,
      }}
    >
      {grain && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            backgroundImage: `url(${grain})`,
            backgroundSize: `${GRAIN_TILE / dpr}px ${GRAIN_TILE / dpr}px`,
            imageRendering: 'pixelated',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}

export type { WallpaperState };

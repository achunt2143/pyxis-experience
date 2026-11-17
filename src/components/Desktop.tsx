import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useWindows } from '../hooks/useWindows';
import { useWallpaperDrift } from '../hooks/useWallpaperDrift';
import { useCompositorWindows } from '../hooks/useAppWindows';
import { useMotion } from '../useMotion';
import { LUMEN } from '../motion';
import { IN_COMPOSITOR } from '../utils/environment';
import { useOverlayPresence } from '../overlay/overlayChannel';
import { useForwardJustType } from '../overlay/useForwardJustType';
import ShellLayer from './ShellLayer';
import DesktopWindow from './DesktopWindow';
import {
  DEFAULT_WALLPAPER_ID,
  DynamicWallpaper,
  EVO_IFACE,
  EVO_SERVICE,
  echoClient,
  isWallpaperId,
  parseClockTime,
  SETTING_KEYS,
  asNumber,
  oneOf,
  useSessionState,
  useSetting,
  useWallpaperExposure,
  type DynamicWallpaperProps,
  type EvoWindowInfo,
  type ExposureWindow,
} from '@pyxis/app-sdk';
import type { WindowsState } from '../hooks/compositorWindows';

/** Evo lists the shell's own windows too; they are the desktop, not over it. */
const SHELL_APP_IDS = new Set(['bloom', 'bloom-overlay']);

const asWallpaperId = (raw: unknown) => (isWallpaperId(raw) ? raw : undefined);

/**
 * `npm run dev` only: look at the whole day quickly.
 * `?wallpaperTime=HH:MM` draws Daylight at that time; `?wallpaperSpeed=N`
 * runs the day N times faster (from that time, or from now);
 * `?wallpaperFlow=N` drifts the masses N times faster;
 * `?wallpaper=<id>` and `?wallpaperBackend=webgl|css` pick those.
 */
function devOverrides(): Partial<DynamicWallpaperProps> {
  if (!import.meta.env.DEV || typeof location === 'undefined') return {};
  const q = new URLSearchParams(location.search);
  const out: Partial<DynamicWallpaperProps> = {};
  const time = parseClockTime(q.get('wallpaperTime'));
  if (time !== null) out.time = time;
  const speed = Number(q.get('wallpaperSpeed'));
  if (speed > 0) out.daySpeed = speed;
  const flow = Number(q.get('wallpaperFlow'));
  if (flow > 0) out.flowSpeed = flow;
  const id = q.get('wallpaper');
  if (isWallpaperId(id)) out.wallpaper = id;
  const backend = q.get('wallpaperBackend');
  if (backend === 'webgl' || backend === 'css') out.backend = backend;
  return out;
}

const DEV_OVERRIDES = devOverrides();

/** How often the frames are re-read while an app window is on screen (a resize sends no signal). */
const FRAMES_POLL_MS = 10_000;

type ListedWindow = ExposureWindow & { id: number; appId: string };

const toExposure = (w: EvoWindowInfo): ListedWindow => ({
  id: w.window_id,
  appId: w.app_id,
  x: w.x,
  y: w.y,
  width: w.width,
  height: w.height,
  minimized: w.minimized ?? w.visible === false,
  maximized: w.maximized ?? false,
  fullscreen: w.fullscreen ?? false,
});

/**
 * The app windows' frames, for the wallpaper's exposure. Evo's window store
 * is live for state (minimized, maximized, fullscreen, moves) but no signal
 * carries a size change, so a window keeps the size it was created with
 * (often 0x0, before its first buffer). So the frames are re-read with
 * `ListWindows`: shortly after any window signal, again once the
 * configure has landed, and every few seconds while a window is up.
 */
function useExposureWindows(compositor: WindowsState): ExposureWindow[] | null {
  const [listed, setListed] = useState<ListedWindow[] | null>(null);
  const anyOnScreen = Object.values(compositor.byId).some(
    (w) => !SHELL_APP_IDS.has(w.waylandAppId) && !w.minimized
  );
  const anyOnScreenRef = useRef(anyOnScreen);
  useEffect(() => {
    anyOnScreenRef.current = anyOnScreen;
  }, [anyOnScreen]);

  // Steady 10s poll while an app window is on screen; kept in its own effect
  // so focus/move updates never tear down and reset the interval.
  useEffect(() => {
    if (!IN_COMPOSITOR) return;
    let cancelled = false;
    const poll = setInterval(() => {
      if (!anyOnScreenRef.current) return;
      void (async () => {
        try {
          const res = (await echoClient.callMethod(EVO_SERVICE, EVO_IFACE, 'ListWindows', {})) as
            | { windows?: EvoWindowInfo[] }
            | undefined;
          if (!cancelled && res?.windows) {
            setListed(res.windows.map(toExposure));
          }
        } catch {
          /* keep the last list */
        }
      })();
    }, FRAMES_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    if (!IN_COMPOSITOR) return;
    let cancelled = false;
    const list = async () => {
      try {
        const res = (await echoClient.callMethod(EVO_SERVICE, EVO_IFACE, 'ListWindows', {})) as
          | { windows?: EvoWindowInfo[] }
          | undefined;
        if (!cancelled && res?.windows) {
          setListed(res.windows.map(toExposure));
        }
      } catch {
        /* keep the last list */
      }
    };
    const timers = [setTimeout(list, 300), setTimeout(list, 1500)];
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [compositor]);

  // Frames from the last list, flags from the store (live, where the list
  // can be a few hundred ms old); a window the list hasn't seen yet comes
  // from the store alone.
  return useMemo(() => {
    if (!IN_COMPOSITOR) return null;
    const frames = new Map((listed ?? []).map((w) => [w.id, w]));
    // The list's app id over the store's: the store can hold a window under
    // the id it had when it was first seen ("unknown", "vela-default").
    return Object.values(compositor.byId)
      .filter((w) => !SHELL_APP_IDS.has(frames.get(w.windowId)?.appId ?? w.waylandAppId))
      .map((w) => {
        const f = frames.get(w.windowId);
        return {
          x: f?.x ?? w.x,
          y: f?.y ?? w.y,
          width: f?.width ?? w.width,
          height: f?.height ?? w.height,
          minimized: w.minimized,
          maximized: w.maximized,
          fullscreen: w.fullscreen,
        };
      });
  }, [compositor, listed]);
}

/**
 * The desktop: the wallpaper, beneath every app window (Evo stacks it
 * there). The shell UI that has to be seen over apps (top bar, dock, every
 * panel, toasts) is the overlay's (src/overlay/OverlayApp.tsx, drawn by
 * ShellLayer). This window draws that same ShellLayer itself only while no
 * overlay is alive, so the shell is never lost: in the browser dev server
 * (which has no compositor to stack anything), or if the overlay window
 * failed to open. Drawn here it sits beneath apps, like the rest of the
 * desktop, and tells Evo nothing.
 */
export const Desktop: React.FC = () => {
  const windowStore = useWindows();
  const {
    windows,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    focusWindow,
    updateWindowPosition,
    activeWindowId,
  } = windowStore;

  const wallpaper = useSetting<string>(SETTING_KEYS.wallpaper, DEFAULT_WALLPAPER_ID, asWallpaperId);
  const wallpaperMotion = useSetting(SETTING_KEYS.wallpaperMotion, 'flow', oneOf('flow', 'still'));
  const pinnedTime = useSetting<number | null>(SETTING_KEYS.wallpaperPinnedTime, null, asNumber);
  // What the desktop is showing, one line per change, for the on-device
  // suites: a choice made in Settings (another origin) has reached the shell
  // when this line says so. vela's log gets `dump()`, not the console.
  useEffect(() => {
    const line = `PYXIS-WALLPAPER-SETTING wallpaper=${wallpaper} motion=${wallpaperMotion} pinned=${pinnedTime ?? 'none'}`;
    console.log(line);
    try {
      (globalThis as { dump?: (s: string) => void }).dump?.(`${line}\n`);
    } catch {
      /* dump is Gecko's, and may be off */
    }
  }, [wallpaper, wallpaperMotion, pinnedTime]);

  // The wallpaper stops drawing while nobody can see it move: the app
  // windows on screen (Evo's frames, which are this document's CSS px)
  // leave at most 15% of it showing, or one is maximized or fullscreen.
  // Outside the compositor nothing covers it.
  const compositor = useCompositorWindows();
  const exposureWindows = useExposureWindows(compositor);
  const exposure = useWallpaperExposure(exposureWindows);
  // Locked, Evo draws only the overlay over black: nobody can see this
  // wallpaper, so it stops drawing frames (the lock screen has its own).
  const { locked } = useSessionState();
  // The exposure as it settles, for the on-device suites: the state line is
  // written when the state changes, which is before the frames are re-read
  // (flags arrive by signal, sizes by ListWindows), so its figure is stale.
  const loggedExposure = useRef<number | null>(null);
  const windowCount = exposureWindows?.length ?? 0;
  useEffect(() => {
    if (!IN_COMPOSITOR) return;
    const last = loggedExposure.current;
    if (last !== null && Math.abs(exposure.exposed - last) < 0.05) return;
    loggedExposure.current = exposure.exposed;
    // `store=` is every window the store holds, by app id, shell included:
    // what to read when the count looks wrong.
    const store = Object.values(compositor.byId)
      .map((w) => w.waylandAppId || '?')
      .join(',');
    const line = `PYXIS-WALLPAPER-EXPOSURE exposed=${exposure.exposed.toFixed(2)} windows=${windowCount} store=${store}`;
    try {
      (globalThis as { dump?: (s: string) => void }).dump?.(`${line}\n`);
    } catch {
      /* dump is Gecko's, and may be off */
    }
  }, [exposure.exposed, windowCount, compositor]);

  // Lumen: while Super+D has the windows receded, the wallpaper eases in a
  // little, and back out when they return. A scale, so full mode only.
  const receded = useWallpaperDrift();
  const { mode, tr } = useMotion();
  const drift = mode === 'full' && receded ? LUMEN.wallpaper.scale : 1;

  // `unknown` is the overlay's startup: draw nothing of the shell yet, so it
  // does not flash up here and vanish when the overlay arrives.
  const { presence, postSearch } = useOverlayPresence();
  const shellHere = !IN_COMPOSITOR || presence === 'absent';
  // With no app focused it is this window that has the keyboard, and the
  // search box is in the overlay.
  useForwardJustType(IN_COMPOSITOR && presence === 'present', postSearch);

  return (
    <>
      <div
        style={{
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          position: 'relative',
          perspective: '1200px',
        }}
      >
        <motion.div
          data-wallpaper=""
          data-receded={receded ? 'true' : 'false'}
          initial={false}
          animate={{ scale: drift }}
          transition={tr({ duration: LUMEN.wallpaper.duration, ease: LUMEN.wallpaper.ease })}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
          }}
        >
          {/* Daylight (or a fixed palette), flowing; see wallpaper/ in the SDK. */}
          <DynamicWallpaper
            wallpaper={wallpaper}
            animationMode={mode}
            paused={exposure.pause || locked}
            logDetail={`mode=${mode} exposed=${exposure.exposed.toFixed(2)} fullscreen=${exposure.fullscreen} hidden=${exposure.documentHidden} locked=${locked} windows=${exposureWindows?.length ?? 'none'}`}
            {...DEV_OVERRIDES}
          />
        </motion.div>

        {/* Desktop Windows — dev/design preview only. In the real
            compositor, launched apps are separate Evo-composited,
            Evo-decorated vela windows; Bloom draws no window/frame for
            them at all (see DesktopWindow.tsx's IN_COMPOSITOR gate and
            useWindows.ts — `windows` stays empty for real launches). */}
        {!IN_COMPOSITOR && (
          <AnimatePresence>
            {windows
              .filter((w) => w.state !== 'minimized')
              .map((window) => (
                <DesktopWindow
                  key={window.id}
                  window={window}
                  isActive={window.id === activeWindowId}
                  onClose={() => closeWindow(window.id)}
                  onMinimize={() => minimizeWindow(window.id)}
                  onMaximize={() => {
                    maximizeWindow(window.id);
                    focusWindow(window.id);
                  }}
                  onFocus={() => focusWindow(window.id)}
                  onPositionChange={(id, x, y) => updateWindowPosition(id, x, y)}
                />
              ))}
          </AnimatePresence>
        )}

      </div>

      {shellHere && <ShellLayer windowStore={windowStore} reporting={false} />}
    </>
  );
};

export default Desktop;

import { useEffect, useMemo, useState } from 'react';

/**
 * How much of the desktop anyone can see: the output minus the union of
 * the app windows on it. The wallpaper stops drawing frames when at most
 * EXPOSURE_PAUSE_AT of it shows (a maximized app leaves only the strip
 * behind the translucent bar), while a fullscreen app is up, and while the
 * document is hidden.
 *
 * The windows come from the caller (Bloom has Evo's live list,
 * `CompositorWindowsProvider`); this file is only the maths and the
 * verdict, so it needs no Evo change and no bridge entry of its own.
 */

export const EXPOSURE_PAUSE_AT = 0.15;
/** Frames are whole px, the fraction isn't: 120 of 800 rows must count as 15%. */
const EXPOSURE_EPS = 1e-6;

export interface ExposureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExposureWindow extends ExposureRect {
  minimized?: boolean;
  /**
   * A maximized window fills the work area, so what shows around it is only
   * the shell's strips (the bar, the dock's row). It pauses the wallpaper
   * whatever those measure: on the reference VM they are 44 + 76 px, exactly
   * 15% of 800, and a dock a few px taller must not start the flow again.
   */
  maximized?: boolean;
  fullscreen?: boolean;
}

/** Area of the union of `rects`, each clipped to `bounds` (coordinate compression; n is small). */
export function unionArea(rects: readonly ExposureRect[], bounds: ExposureRect): number {
  const clipped: [number, number, number, number][] = [];
  const bx2 = bounds.x + bounds.width;
  const by2 = bounds.y + bounds.height;
  for (const r of rects) {
    const x1 = Math.max(bounds.x, r.x);
    const y1 = Math.max(bounds.y, r.y);
    const x2 = Math.min(bx2, r.x + r.width);
    const y2 = Math.min(by2, r.y + r.height);
    if (x2 > x1 && y2 > y1) clipped.push([x1, y1, x2, y2]);
  }
  if (clipped.length === 0) return 0;
  const xs = [...new Set(clipped.flatMap((r) => [r[0], r[2]]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const xa = xs[i];
    const xb = xs[i + 1];
    // The y-intervals covering this vertical strip, merged.
    const spans = clipped
      .filter((r) => r[0] <= xa && r[2] >= xb)
      .map((r) => [r[1], r[3]] as const)
      .sort((a, b) => a[0] - b[0]);
    let covered = 0;
    let curA = -Infinity;
    let curB = -Infinity;
    for (const [a, b] of spans) {
      if (a > curB) {
        if (curB > curA) covered += curB - curA;
        curA = a;
        curB = b;
      } else if (b > curB) curB = b;
    }
    if (curB > curA) covered += curB - curA;
    area += covered * (xb - xa);
  }
  return area;
}

/** The fraction of `output` no window that is on screen covers, 0..1. */
export function exposedFraction(output: ExposureRect, windows: readonly ExposureWindow[]): number {
  const total = output.width * output.height;
  if (total <= 0) return 0;
  const onScreen = windows.filter((w) => !w.minimized);
  return Math.max(0, Math.min(1, 1 - unionArea(onScreen, output) / total));
}

export interface ExposureVerdict {
  /** 0..1 of the output showing. */
  exposed: number;
  fullscreen: boolean;
  documentHidden: boolean;
  /** Whether the wallpaper should stop drawing frames. */
  pause: boolean;
}

export function exposureVerdict(
  output: ExposureRect,
  windows: readonly ExposureWindow[],
  documentHidden: boolean
): ExposureVerdict {
  const exposed = exposedFraction(output, windows);
  const fullscreen = windows.some((w) => !w.minimized && w.fullscreen);
  const maximized = windows.some((w) => !w.minimized && w.maximized);
  return {
    exposed,
    fullscreen,
    documentHidden,
    pause: documentHidden || fullscreen || maximized || exposed <= EXPOSURE_PAUSE_AT + EXPOSURE_EPS,
  };
}

function useDocumentHidden(): boolean {
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return hidden;
}

function useViewport(): ExposureRect {
  const read = () => ({
    x: 0,
    y: 0,
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });
  const [vp, setVp] = useState<ExposureRect>(read);
  useEffect(() => {
    const on = () => setVp(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vp;
}

/**
 * The verdict for the desktop document. `windows` are the app windows in
 * output-logical px (Evo's `ListWindows` frames, which are the desktop's CSS
 * px: it covers the output at scale 1); null when the caller has no window
 * list (the dev server without `?compositor`), which counts as nothing
 * covering it. `output` defaults to the document's viewport.
 */
export function useWallpaperExposure(
  windows: readonly ExposureWindow[] | null,
  output?: ExposureRect
): ExposureVerdict {
  const hidden = useDocumentHidden();
  const viewport = useViewport();
  const out = output ?? viewport;
  return useMemo(
    () => exposureVerdict(out, windows ?? [], hidden),
    // `out` is a fresh object when passed inline; compare its fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [windows, hidden, out.x, out.y, out.width, out.height]
  );
}

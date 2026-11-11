import { DURATION } from '../motion';
import type { AnimationMode } from '../motion';

/**
 * The geometry of the overview's matched transitions: a card is the window it
 * stands for, flown between its place in the grid and its window's real frame
 * (Evo's `ListWindows` rectangle, which is the overlay's CSS pixels).
 *
 * Pure maths, so it is tested without a DOM. CardOverview measures with
 * getBoundingClientRect and animates what this returns.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A transform about the card's own centre (its `transform-origin`). */
export interface Flight {
  x: number;
  y: number;
  scale: number;
}

const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/**
 * The transform that lays a card's preview exactly over `target`.
 *
 * `card` is the card's box and `preview` the picture's box inside it, both as
 * measured at rest (no transform on the card). A transform about the card's
 * centre sends a point p to `C + s·(p − C) + t`, so putting the preview's
 * centre on the target's centre at scale `s` needs
 * `t = F − C − s·(P − C)`.
 *
 * `fit: 'width'` makes the preview as wide as the target (a window frame has
 * the preview's aspect, so it is also as tall). `'contain'` makes it fit
 * inside the target (a dock icon, which is square).
 */
export function flightTransform(
  card: Rect,
  preview: Rect,
  target: Rect,
  fit: 'width' | 'contain' = 'width'
): Flight | null {
  if (preview.width <= 0 || preview.height <= 0 || target.width <= 0 || target.height <= 0) return null;
  const sw = target.width / preview.width;
  const scale = fit === 'width' ? sw : Math.min(sw, target.height / preview.height);
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const c = centre(card);
  const p = centre(preview);
  const f = centre(target);
  return { x: f.x - c.x - scale * (p.x - c.x), y: f.y - c.y - scale * (p.y - c.y), scale };
}

/**
 * The window's frame as Evo reports it, or undefined when it is not on screen
 * to fly to or from: minimized (Evo lists it at 0,0), or no size yet.
 */
export function visibleFrame(w: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  minimized?: boolean;
} | undefined): Rect | undefined {
  if (!w || w.minimized) return undefined;
  const { x, y, width, height } = w;
  if (typeof x !== 'number' || typeof y !== 'number' || !width || !height || width <= 0 || height <= 0) return undefined;
  return { x, y, width, height };
}

/**
 * Where a minimized window will be when it is restored. Evo doesn't report
 * it, so the card lands where a window of its size would sit centred on the
 * screen, and the real window comes up beneath it as it fades.
 */
export function centredFrame(size: { width: number; height: number }, screen: { width: number; height: number }): Rect {
  const width = Math.min(size.width, screen.width);
  const height = Math.min(size.height, screen.height);
  return { x: (screen.width - width) / 2, y: (screen.height - height) / 2, width, height };
}

/** Card preview size: a fixed height, the window's aspect, within limits. */
export const PREVIEW_HEIGHT = 170;
const PREVIEW_MIN_WIDTH = 150;
const PREVIEW_MAX_WIDTH = 400;
const DEFAULT_ASPECT = 16 / 10;

export function previewBox(size?: { width: number; height: number }): { width: number; height: number } {
  const aspect = size && size.width > 0 && size.height > 0 ? size.width / size.height : DEFAULT_ASPECT;
  const width = Math.round(Math.min(PREVIEW_MAX_WIDTH, Math.max(PREVIEW_MIN_WIDTH, PREVIEW_HEIGHT * aspect)));
  return { width, height: PREVIEW_HEIGHT };
}

/** The chosen card's zoom (an arrival's curve), then a short fade to reveal the window. */
export const COMMIT_ZOOM_S = DURATION.open;
export const COMMIT_FADE_S = 0.1;

/**
 * How long a committed overview stays up before it is taken down, for the
 * user's animation mode: the zoom plus the fade for `full`, a fade for
 * `reduced`, nothing for `off`.
 */
export function commitMs(mode: AnimationMode): number {
  if (mode === 'off') return 0;
  if (mode === 'reduced') return DURATION.reduced * 1000;
  return (COMMIT_ZOOM_S + COMMIT_FADE_S * 0.6) * 1000;
}

/** Whether cards fly at all: only `full` moves things; the others fade. */
export const flies = (mode: AnimationMode) => mode === 'full';

/**
 * Undo a card's current transform on two boxes measured with
 * getBoundingClientRect, giving them as they would sit at rest. A card that
 * is still flying in when it is committed (a quick Alt+Tab) can then be sent
 * to its window from where it is laid out, not from where it happens to be.
 * The transform is about the card's centre, as `flightTransform` assumes.
 */
export function restRects(card: Rect, preview: Rect, now: Flight): { card: Rect; preview: Rect } {
  const s = now.scale > 0 ? now.scale : 1;
  const cardW = card.width / s;
  const cardH = card.height / s;
  const c = { x: card.x + card.width / 2 - now.x, y: card.y + card.height / 2 - now.y };
  const pc = {
    x: c.x + (preview.x + preview.width / 2 - (card.x + card.width / 2)) / s,
    y: c.y + (preview.y + preview.height / 2 - (card.y + card.height / 2)) / s,
  };
  const pw = preview.width / s;
  const ph = preview.height / s;
  return {
    card: { x: c.x - cardW / 2, y: c.y - cardH / 2, width: cardW, height: cardH },
    preview: { x: pc.x - pw / 2, y: pc.y - ph / 2, width: pw, height: ph },
  };
}

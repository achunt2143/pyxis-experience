import { describe, it, expect } from 'vitest';
import {
  centredFrame,
  commitMs,
  flightTransform,
  flies,
  previewBox,
  restRects,
  visibleFrame,
  PREVIEW_HEIGHT,
  type Rect,
} from '../flight';

/** Where a point of the card lands under a transform about the card's centre. */
function apply(card: Rect, f: { x: number; y: number; scale: number }, p: { x: number; y: number }) {
  const cx = card.x + card.width / 2;
  const cy = card.y + card.height / 2;
  return { x: cx + f.scale * (p.x - cx) + f.x, y: cy + f.scale * (p.y - cy) + f.y };
}

describe('flightTransform', () => {
  const card: Rect = { x: 100, y: 200, width: 340, height: 250 };
  const preview: Rect = { x: 108, y: 242, width: 324, height: 200 };

  it('lays the preview exactly over a window frame', () => {
    const frame: Rect = { x: 60, y: 80, width: 900, height: 600 };
    const f = flightTransform(card, preview, frame)!;
    const tl = apply(card, f, { x: preview.x, y: preview.y });
    const br = apply(card, f, { x: preview.x + preview.width, y: preview.y + preview.height });
    expect(tl.x).toBeCloseTo(frame.x);
    expect(br.x).toBeCloseTo(frame.x + frame.width);
    // The preview has the frame's aspect only if the test says so; the height follows the width ratio.
    expect(br.y - tl.y).toBeCloseTo(preview.height * f.scale);
    const mid = apply(card, f, { x: preview.x + preview.width / 2, y: preview.y + preview.height / 2 });
    expect(mid.x).toBeCloseTo(frame.x + frame.width / 2);
    expect(mid.y).toBeCloseTo(frame.y + frame.height / 2);
  });

  it('is the identity when the preview already is the target', () => {
    const f = flightTransform(card, preview, preview)!;
    expect(f.scale).toBeCloseTo(1);
    expect(f.x).toBeCloseTo(0);
    expect(f.y).toBeCloseTo(0);
  });

  it('"contain" fits a square dock icon whole inside it', () => {
    const icon: Rect = { x: 600, y: 740, width: 48, height: 48 };
    const f = flightTransform(card, preview, icon, 'contain')!;
    expect(preview.width * f.scale).toBeLessThanOrEqual(48 + 1e-9);
    expect(preview.height * f.scale).toBeLessThanOrEqual(48 + 1e-9);
    const mid = apply(card, f, { x: preview.x + preview.width / 2, y: preview.y + preview.height / 2 });
    expect(mid.x).toBeCloseTo(624);
    expect(mid.y).toBeCloseTo(764);
  });

  it('refuses a measurement it cannot use (a card not laid out yet)', () => {
    expect(flightTransform(card, { x: 0, y: 0, width: 0, height: 0 }, { x: 0, y: 0, width: 10, height: 10 })).toBeNull();
    expect(flightTransform(card, preview, { x: 0, y: 0, width: 0, height: 10 })).toBeNull();
  });
});

describe('visibleFrame', () => {
  it('is Evo\'s rectangle for a window on screen', () => {
    expect(visibleFrame({ x: 10, y: 20, width: 300, height: 200 })).toEqual({ x: 10, y: 20, width: 300, height: 200 });
  });
  it('is nothing for a minimized window (Evo lists it at 0,0) or one without a size', () => {
    expect(visibleFrame({ x: 0, y: 0, width: 300, height: 200, minimized: true })).toBeUndefined();
    expect(visibleFrame({ x: 1, y: 1 })).toBeUndefined();
    expect(visibleFrame(undefined)).toBeUndefined();
  });
});

describe('centredFrame', () => {
  it('centres a window and keeps it on a small screen', () => {
    expect(centredFrame({ width: 800, height: 500 }, { width: 1280, height: 800 })).toEqual({ x: 240, y: 150, width: 800, height: 500 });
    expect(centredFrame({ width: 2000, height: 500 }, { width: 1280, height: 800 }).width).toBe(1280);
  });
});

describe('previewBox', () => {
  it('keeps the window\'s aspect within limits, at one height', () => {
    expect(previewBox({ width: 1280, height: 800 })).toEqual({ width: 272, height: PREVIEW_HEIGHT });
    expect(previewBox({ width: 4000, height: 300 }).width).toBe(400);
    expect(previewBox({ width: 300, height: 4000 }).width).toBe(150);
    expect(previewBox(undefined).height).toBe(PREVIEW_HEIGHT);
  });
});

describe('modes', () => {
  it('only full flies; the commit lasts as long as the mode\'s motion', () => {
    expect(flies('full')).toBe(true);
    expect(flies('reduced')).toBe(false);
    expect(flies('off')).toBe(false);
    expect(commitMs('off')).toBe(0);
    expect(commitMs('reduced')).toBeLessThanOrEqual(150);
    expect(commitMs('full')).toBeGreaterThan(commitMs('reduced'));
  });
});

describe('restRects', () => {
  it('undoes a transform about the card\'s centre', () => {
    const card: Rect = { x: 100, y: 200, width: 340, height: 250 };
    const preview: Rect = { x: 108, y: 242, width: 324, height: 200 };
    const now = { x: 37, y: -12, scale: 0.6 };
    // What the DOM would report once `now` is applied.
    const move = (r: Rect): Rect => {
      const cx = card.x + card.width / 2;
      const cy = card.y + card.height / 2;
      const nx = cx + now.scale * (r.x + r.width / 2 - cx) + now.x;
      const ny = cy + now.scale * (r.y + r.height / 2 - cy) + now.y;
      return { x: nx - (r.width * now.scale) / 2, y: ny - (r.height * now.scale) / 2, width: r.width * now.scale, height: r.height * now.scale };
    };
    const back = restRects(move(card), move(preview), now);
    for (const k of ['x', 'y', 'width', 'height'] as const) {
      expect(back.card[k]).toBeCloseTo(card[k]);
      expect(back.preview[k]).toBeCloseTo(preview[k]);
    }
  });
});

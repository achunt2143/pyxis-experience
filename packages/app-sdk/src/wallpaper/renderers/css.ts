/**
 * The css backend: each mass a large radial-gradient disc over the
 * palette's mean colour, moved by transforms and coloured through
 * `currentColor`, so a palette change is a `color` transition.
 *
 * Positions are set per frame by the caller, at the same capped rate as the
 * webgl backend, not by CSS keyframes: a keyframe animation runs at the
 * compositor's full rate, and every one of those frames is a full-output
 * commit to Evo. A transform change repaints nothing (each disc's gradient
 * is rasterized once), so a frame costs WebRender a re-composite only.
 *
 * No domain warp, and the discs blend in sRGB by alpha, not OKLab: visibly
 * simpler than webgl, which is why it is the fallback.
 */
import { oklabToRgb, type Rgb } from '../palettes';
import { meanColor } from '../scene';
import type { WallpaperRenderer } from './types';

/** A disc's radius in sigmas: past 2.6 a gaussian is under 4% and the gradient ends. */
const DISC_SIGMAS = 2.6;

const rgbCss = ([r, g, b]: Rgb) => `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;

const DISC_GRADIENT =
  'radial-gradient(closest-side, currentColor 0%, ' +
  'color-mix(in srgb, currentColor 78%, transparent) 25%, ' +
  'color-mix(in srgb, currentColor 42%, transparent) 50%, ' +
  'color-mix(in srgb, currentColor 14%, transparent) 75%, ' +
  'transparent 100%)';

export function createCssRenderer(container: HTMLElement): WallpaperRenderer {
  const root = document.createElement('div');
  Object.assign(root.style, {
    position: 'absolute',
    inset: '0',
    overflow: 'hidden',
    contain: 'strict',
  } satisfies Partial<CSSStyleDeclaration>);
  const discs: HTMLDivElement[] = [];
  container.appendChild(root);

  let cssW = 1;
  let cssH = 1;
  let lastPaletteMs = -1;
  // The disc size the gradients were laid out for; a disc's radius changes
  // through a scale against it, so the gradient is never re-rasterized.
  let unit = 1;

  const setTransition = (ms: number) => {
    if (ms === lastPaletteMs) return;
    lastPaletteMs = ms;
    const t = ms > 0 ? `color ${ms}ms linear, background-color ${ms}ms linear` : 'none';
    root.style.transition = t;
    discs.forEach((d) => (d.style.transition = t));
  };

  const ensureDiscs = (n: number) => {
    while (discs.length < n) {
      const d = document.createElement('div');
      Object.assign(d.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        borderRadius: '50%',
        backgroundImage: DISC_GRADIENT,
        willChange: 'transform',
        transformOrigin: '50% 50%',
      } satisfies Partial<CSSStyleDeclaration>);
      root.appendChild(d);
      discs.push(d);
    }
  };

  const renderer: WallpaperRenderer = {
    backend: 'css',
    resize(width, height) {
      cssW = Math.max(1, width);
      cssH = Math.max(1, height);
      unit = Math.max(cssW, cssH) * 0.4 * DISC_SIGMAS;
      discs.forEach((d) => {
        d.style.width = `${unit * 2}px`;
        d.style.height = `${unit * 2}px`;
      });
    },
    draw(sc, opts) {
      setTransition(opts?.paletteMs ?? 0);
      root.style.backgroundColor = rgbCss(oklabToRgb(meanColor(sc.masses.map((m) => m.color))));
      ensureDiscs(sc.masses.length);
      const long = Math.max(cssW, cssH);
      sc.masses.forEach((m, i) => {
        const d = discs[i];
        if (d.style.width === '') {
          d.style.width = `${unit * 2}px`;
          d.style.height = `${unit * 2}px`;
        }
        const r = m.radius * long * DISC_SIGMAS;
        const x = m.x * cssW - unit;
        const y = m.y * cssH - unit;
        d.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${(r / unit).toFixed(4)})`;
        d.style.color = rgbCss(m.rgb);
      });
    },
    dispose() {
      root.remove();
    },
  };
  renderer.resize(container.clientWidth, container.clientHeight);
  return renderer;
}

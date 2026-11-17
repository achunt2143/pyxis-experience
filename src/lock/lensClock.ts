import { hexToOklab, oklabToHex, paletteToHex, type Palette } from '@pyxis/app-sdk';

/**
 * The lens clock's wallpaper, for browsers that can't borrow the real one.
 *
 * The lock clock's digits are lenses: the wallpaper seen through them,
 * lighter, ringed with light. On vela (Gecko) that is the lock's own Daylight
 * canvas, borrowed with `background: -moz-element(#lock-wallpaper)` and
 * clipped to the text. Nothing else has `-moz-element`, so the dev server
 * falls back to a gradient laid out like the palette's colour masses and
 * lightened toward white: the same look, without the live canvas.
 */

/** Whether this browser can paint an element as a background (Gecko). */
export function supportsMozElement(): boolean {
  try {
    return typeof CSS !== 'undefined' && CSS.supports('background', '-moz-element(#lock-wallpaper)');
  } catch {
    return false;
  }
}

/** A colour mixed `amount` (0..1) toward white, in OKLab as the wallpaper mixes. */
export function lighten(hex: string, amount: number): string {
  const [L, a, b] = hexToOklab(hex);
  const k = Math.min(1, Math.max(0, amount));
  return oklabToHex([L + (1 - L) * k, a * (1 - k), b * (1 - k)]);
}

/**
 * The five colour masses as radial gradients, lightened (62% toward white by
 * default), for a 100% x 100% background the size of the screen. The layout
 * is the mockup's.
 */
export function lensGradient(palette: Palette, amount = 0.62): string {
  const [a, b, c, d, e] = paletteToHex(palette).map((hex) => lighten(hex, amount));
  return [
    `radial-gradient(60% 70% at 18% 28%, ${a} 0%, transparent 70%)`,
    `radial-gradient(55% 60% at 82% 18%, ${b} 0%, transparent 70%)`,
    `radial-gradient(60% 65% at 72% 82%, ${c} 0%, transparent 72%)`,
    `radial-gradient(50% 55% at 22% 88%, ${d} 0%, transparent 70%)`,
    `radial-gradient(45% 50% at 50% 50%, ${d} 0%, transparent 70%)`,
    // The base colour, as an image layer: a bare colour is only valid last in the `background`
    // shorthand, and `background-image` (which leaves background-clip alone) drops the whole value.
    `linear-gradient(${e}, ${e})`,
  ].join(', ');
}

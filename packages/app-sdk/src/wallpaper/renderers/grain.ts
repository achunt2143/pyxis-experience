/**
 * A static grain over the wallpaper, against banding: large smooth
 * gradients in 8 bits always show steps, and noise of about 1.5% hides
 * them. One small tile, made once, repeated at one tile pixel per device
 * pixel, so the webgl backend's upscale never blurs it.
 */

export const GRAIN_TILE = 128;
/** Peak alpha of a grain pixel; the mean amplitude is about half (≈1.5%). */
export const GRAIN_ALPHA = 0.03;

let cached: string | null | undefined;

/** A data URL of the grain tile, or null where there is no 2D canvas (jsdom). */
export function grainTileUrl(): string | null {
  if (cached !== undefined) return cached;
  cached = null;
  try {
    const c = document.createElement('canvas');
    c.width = GRAIN_TILE;
    c.height = GRAIN_TILE;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(GRAIN_TILE, GRAIN_TILE);
    // A fixed generator, so the grain is the same on every start.
    let seed = 0x9e3779b9;
    const rand = () => {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      return (seed >>> 0) / 4294967296;
    };
    for (let i = 0; i < img.data.length; i += 4) {
      // Triangular noise in -1..1: white above zero, black below.
      const n = rand() - rand();
      const v = n > 0 ? 255 : 0;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = Math.round(Math.abs(n) * GRAIN_ALPHA * 255);
    }
    ctx.putImageData(img, 0, 0);
    cached = c.toDataURL('image/png');
  } catch {
    cached = null;
  }
  return cached;
}

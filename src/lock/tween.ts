/**
 * Run `frame(t)` for `ms` milliseconds on animation frames, t from 0 to 1
 * (linear: callers ease), then `done()`. With `ms <= 0` it runs `frame(1)` and
 * `done()` at once, which is how the `off` motion mode is instant. Returns
 * a cancel function that stops it without calling `done`.
 */
export function runTween(ms: number, frame: (t: number) => void, done?: () => void): () => void {
  if (ms <= 0) {
    frame(1);
    done?.();
    return () => {};
  }
  let raf = 0;
  let cancelled = false;
  const start = performance.now();
  const tick = (now: number) => {
    if (cancelled) return;
    const t = Math.min(1, Math.max(0, (now - start) / ms));
    frame(t);
    if (t < 1) raf = requestAnimationFrame(tick);
    else done?.();
  };
  frame(0);
  raf = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
  };
}

// remochi's Repanel (0.6) observes its own size; jsdom has no ResizeObserver.
// Tests that need to drive the observer install their own stub over this.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

// remochi's loader (0.6) steps its frames from `(rafTime - performance.now()-at-start)`;
// jsdom's rAF timestamp predates that, giving a negative frame index and a throw.
// Hand callbacks a performance.now() timestamp, as browsers do.
if (typeof window !== 'undefined') {
  const raf = window.requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (cb: FrameRequestCallback) => raf(() => cb(performance.now()))
}

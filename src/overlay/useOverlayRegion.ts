import { useEffect, type RefObject } from 'react';
import { setOverlayRegion, type OverlayRect } from '@pyxis/app-sdk';

/**
 * Keep Evo's input region for the overlay in step with what the shell draws:
 * the boxes in the region take clicks, and the rest of the screen passes them
 * through to whatever is beneath (see packages/app-sdk/src/overlay.ts).
 *
 * Evo holds one region for the whole overlay, but the pieces that make it
 * (the top bar, the dock, a toast stack, a panel's click-away backdrop) come
 * and go on their own. So each piece registers what it covers here, and the
 * union is what Evo is sent, when it changes. A piece that stops (unmount, or
 * `enabled` turning false) drops out, and an empty union sends an empty
 * region, so nothing is left eating clicks where it used to be.
 */

type Measure = () => OverlayRect[];

const sources = new Map<symbol, Measure>();
let last: string | null = null;

/** Send the union of every source, if it differs from what was sent. */
function flush() {
  const rects = [...sources.values()].flatMap((measure) => measure());
  const key = JSON.stringify(rects);
  if (key === last) return;
  last = key;
  void setOverlayRegion(rects);
}

/** Forget what was sent (tests; and a page that is being torn down). */
export function resetOverlayRegion() {
  sources.clear();
  last = null;
}

/** The boxes `element` draws in, in screen pixels: itself and its popups. */
function boxesOf(element: Element, popups: boolean): OverlayRect[] {
  const list = popups ? [element, ...element.querySelectorAll('[data-shell-popup]')] : [element];
  const rects: OverlayRect[] = [];
  for (const el of list) {
    const box = el.getBoundingClientRect();
    if (box.width > 0 && box.height > 0) {
      rects.push({
        x: Math.floor(box.left),
        y: Math.floor(box.top),
        width: Math.ceil(box.width),
        height: Math.ceil(box.height),
      });
    }
  }
  return rects;
}

/**
 * Times after a layout change at which the region is measured again. An
 * element that animates in (the dock springs up from below) keeps moving
 * after the last resize or mutation anyone can observe, so a measurement at
 * the change alone would leave it where it began.
 */
const SETTLE_MS = [60, 200, 500, 1200];

export interface OverlayRegionOptions {
  /** Filter `MutationObserver` batches before scheduling `settle()`. */
  shouldSettle?: (records: MutationRecord[]) => boolean;
  /** Debounce window (ms) for `MutationObserver`-triggered `settle()` calls. */
  mutationDebounceMs?: number;
  /** `MutationObserverInit` options (defaults to `{ childList: true, subtree: true }`). */
  mutationOptions?: MutationObserverInit;
  /** Extra elements to track with `ResizeObserver` (synced on mount & relevant mutations). */
  observeResizeTargets?: () => Element[];
}

function isShellRegionElement(node: Node): boolean {
  return (
    node instanceof Element &&
    (node.matches('[data-shell-region], [data-shell-popup]') ||
      node.querySelector('[data-shell-region], [data-shell-popup]') !== null)
  );
}

/** True only when a DOM mutation touches a `[data-shell-region]` or `[data-shell-popup]` subtree. */
export function isShellRegionMutation(records: MutationRecord[]): boolean {
  for (const record of records) {
    if (record.type === 'attributes') {
      if (
        record.attributeName === 'data-shell-region' ||
        record.attributeName === 'data-shell-popup'
      ) {
        return true;
      }
      continue;
    }
    if (
      record.target instanceof Element &&
      record.target.closest('[data-shell-region], [data-shell-popup]') !== null
    ) {
      return true;
    }
    for (const node of record.addedNodes) {
      if (isShellRegionElement(node)) return true;
    }
    for (const node of record.removedNodes) {
      if (isShellRegionElement(node)) return true;
    }
  }
  return false;
}

/**
 * Register `measure` as one of the region's pieces while `enabled`. It is
 * measured when the page resizes, when `watch` (an element, or the document)
 * changes its children or size, and a few times just after, to catch
 * animations.
 */
export function useOverlayRegionRects(
  measure: Measure,
  enabled: boolean,
  watch: () => Element | null = () => null,
  options?: OverlayRegionOptions
) {
  useEffect(() => {
    if (!enabled) return;
    const key = Symbol('region');
    sources.set(key, measure);
    const timers: number[] = [];
    let mutationDebounce: number | undefined;
    const settle = () => {
      flush();
      timers.forEach((t) => window.clearTimeout(t));
      timers.length = 0;
      for (const ms of SETTLE_MS) timers.push(window.setTimeout(flush, ms));
    };
    const element = watch();
    const observedResize = new Set<Element>();
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(settle);
    const syncResizeTargets = () => {
      if (!resize) return;
      const desired = new Set<Element>();
      if (element) desired.add(element);
      if (options?.observeResizeTargets) {
        for (const el of options.observeResizeTargets()) desired.add(el);
      }
      for (const el of observedResize) {
        if (!desired.has(el)) {
          resize.unobserve?.(el);
          observedResize.delete(el);
        }
      }
      for (const el of desired) {
        if (!observedResize.has(el)) {
          resize.observe(el);
          observedResize.add(el);
        }
      }
    };
    const onMutations = (records: MutationRecord[]) => {
      if (options?.shouldSettle && !options.shouldSettle(records)) return;
      syncResizeTargets();
      const delay = options?.mutationDebounceMs ?? 0;
      if (delay > 0) {
        window.clearTimeout(mutationDebounce);
        mutationDebounce = window.setTimeout(settle, delay);
      } else {
        settle();
      }
    };
    const mutations =
      element && typeof MutationObserver !== 'undefined' ? new MutationObserver(onMutations) : null;
    if (element) {
      syncResizeTargets();
      mutations?.observe(
        element,
        options?.mutationOptions ?? { childList: true, subtree: true }
      );
    }
    window.addEventListener('resize', settle);
    settle();
    return () => {
      window.clearTimeout(mutationDebounce);
      timers.forEach((t) => window.clearTimeout(t));
      resize?.disconnect();
      mutations?.disconnect();
      window.removeEventListener('resize', settle);
      sources.delete(key);
      flush();
    };
    // `measure` and `watch` are read when the effect runs; a caller whose
    // measurement changes meaning changes `enabled`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
}

/**
 * Register the box of the element `ref` points at (and its `data-shell-popup`
 * descendants): it takes clicks, and the rest of the screen passes them
 * through. Used by the toast stack.
 */
export function useOverlayRegion(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useOverlayRegionRects(
    () => (ref.current ? boxesOf(ref.current, true) : []),
    enabled,
    () => ref.current
  );
}

/** Register everything in the document marked `data-shell-region`. */
export function useShellRegion(enabled: boolean) {
  useOverlayRegionRects(
    () => [...document.querySelectorAll('[data-shell-region]')].flatMap((el) => boxesOf(el, true)),
    enabled,
    () => document.body,
    {
      shouldSettle: isShellRegionMutation,
      mutationDebounceMs: 16,
      mutationOptions: {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-shell-region', 'data-shell-popup'],
      },
      observeResizeTargets: () => [...document.querySelectorAll('[data-shell-region]')],
    }
  );
}

/** Register the whole screen: a panel is open, and its backdrop takes every click. */
export function useFullScreenRegion(enabled: boolean) {
  useOverlayRegionRects(
    () => [{ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }],
    enabled
  );
}

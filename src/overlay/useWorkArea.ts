import { useEffect } from 'react';
import { setWorkArea } from '@pyxis/app-sdk';

/** Space left between a maximized window and the dock, so they do not touch. */
const DOCK_GAP = 6;

/**
 * Tell Evo which edges of the screen the shell occupies, so maximized and
 * newly placed windows keep out of them (see evo/src/shell/work_area.rs).
 *
 * The edges are the elements marked `data-shell-edge="top"` and `="bottom"`:
 * the top bar, and the dock with the margin it floats at. They are measured
 * by layout (offsetHeight and the computed `bottom`), not by
 * getBoundingClientRect, because the dock springs up from below when it
 * appears and a transformed box would report the edge 80px too low. An edge
 * that is not on the page (a fullscreen app hides the bar and dock) keeps
 * its last value: the app that is fullscreen covers everything anyway, and
 * the windows beneath it must not resize and back as it comes and goes.
 *
 * The dock does not shrink while a window is maximized, since it no longer
 * floats over it, so the edge only changes when the page resizes.
 */
export function useWorkArea(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let sent = '';
    let top: number | null = null;
    let bottom: number | null = null;

    const measure = () => {
      const topEl = document.querySelector<HTMLElement>('[data-shell-edge="top"]');
      const dockEl = document.querySelector<HTMLElement>('[data-shell-edge="bottom"]');
      if (topEl) top = Math.ceil(topEl.offsetHeight);
      if (dockEl) {
        const margin = parseFloat(getComputedStyle(dockEl).bottom) || 0;
        bottom = Math.ceil(dockEl.offsetHeight + margin + DOCK_GAP);
      }
      if (top === null && bottom === null) return;
      const insets = { top: top ?? 0, bottom: bottom ?? 0 };
      const key = JSON.stringify(insets);
      if (key === sent) return;
      sent = key;
      void setWorkArea(insets);
    };

    const timers: number[] = [];
    const settle = () => {
      measure();
      timers.forEach((t) => window.clearTimeout(t));
      timers.length = 0;
      for (const ms of [60, 200, 500, 1200]) timers.push(window.setTimeout(measure, ms));
    };
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(settle);
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(settle);
    mutations?.observe(document.body, { childList: true, subtree: true });
    resize?.observe(document.body);
    window.addEventListener('resize', settle);
    settle();

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      resize?.disconnect();
      mutations?.disconnect();
      window.removeEventListener('resize', settle);
      // The shell is going away: give the screen back.
      if (sent) void setWorkArea({ top: 0, bottom: 0 });
    };
  }, [enabled]);
}

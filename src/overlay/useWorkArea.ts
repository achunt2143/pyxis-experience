import { useEffect } from 'react';
import { setWorkArea, type WorkAreaInsets } from '@pyxis/app-sdk';

/**
 * Tell Evo which edges of the screen the shell occupies, so maximized and
 * newly placed windows keep out of them (see evo/src/shell/work_area.rs).
 *
 * The edges are the elements marked `data-shell-edge="top"` and `="bottom"`:
 * the top bar, and the launch bar (components/LaunchBar.tsx), which is flush
 * to the bottom edge, so the bottom inset is exactly its height, 64 px: a
 * maximized window ends where the bar's material begins (an offset from the
 * edge, were the bar ever lifted, would count too). They are measured by
 * layout (offsetHeight and the computed `bottom`), not by
 * getBoundingClientRect, because the launch bar slides up from below when it
 * appears and a transformed box would report the edge too low. An edge
 * that is not on the page (a fullscreen app hides both bars) keeps its last
 * value: the app that is fullscreen covers everything anyway, and the windows
 * beneath it must not resize and back as it comes and goes.
 *
 * The launch bar can be a rail down the left instead
 * (`pyxis.launchBar.position`), marked `data-shell-edge="left"`: then its
 * width (plus any offset from the edge) is the left inset and the bottom is
 * 0. Which edge the bar is on is read from the bar itself, so a placement
 * switched in Settings re-sends the work area as soon as the bar has moved
 * (the bar remounts, which the observer below sees, and the edge attribute is
 * watched too), and Evo re-fits the open windows. Only a bar that is on
 * neither edge (hidden by a fullscreen app) keeps the last insets.
 */
export function measureWorkArea(
  root: ParentNode,
  last: { top: number | null; bar: Omit<WorkAreaInsets, 'top'> | null }
): { top: number | null; bar: Omit<WorkAreaInsets, 'top'> | null } {
  const topEl = root.querySelector<HTMLElement>('[data-shell-edge="top"]');
  const bottomEl = root.querySelector<HTMLElement>('[data-shell-edge="bottom"]');
  const leftEl = root.querySelector<HTMLElement>('[data-shell-edge="left"]');
  const top = topEl ? Math.ceil(topEl.offsetHeight) : last.top;
  let bar = last.bar;
  if (bottomEl) {
    const offset = parseFloat(getComputedStyle(bottomEl).bottom) || 0;
    bar = { bottom: Math.ceil(bottomEl.offsetHeight + offset), left: 0, right: 0 };
  } else if (leftEl) {
    const offset = parseFloat(getComputedStyle(leftEl).left) || 0;
    bar = { bottom: 0, left: Math.ceil(leftEl.offsetWidth + offset), right: 0 };
  }
  return { top, bar };
}

export function useWorkArea(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let sent = '';
    let last: ReturnType<typeof measureWorkArea> = { top: null, bar: null };

    const measure = () => {
      last = measureWorkArea(document, last);
      if (last.top === null && last.bar === null) return;
      const insets: Required<WorkAreaInsets> = {
        top: last.top ?? 0,
        bottom: last.bar?.bottom ?? 0,
        left: last.bar?.left ?? 0,
        right: last.bar?.right ?? 0,
      };
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
    mutations?.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-shell-edge'],
    });
    resize?.observe(document.body);
    window.addEventListener('resize', settle);
    settle();

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      resize?.disconnect();
      mutations?.disconnect();
      window.removeEventListener('resize', settle);
      // The shell is going away: give the screen back.
      if (sent) void setWorkArea({ top: 0, bottom: 0, left: 0, right: 0 });
    };
  }, [enabled]);
}

import { useEffect } from 'react';
import { setMinimizeTargets, type MinimizeTarget } from '@pyxis/app-sdk';
import { appHue } from '../apps/registry';

/**
 * A box measured by layout: its offset up the `offsetParent` chain. A
 * transformed box (`getBoundingClientRect`) would report the dock where it is
 * mid-spring, 80px low as it slides in, or an icon at its hover scale; Evo
 * wants the place the icon comes to rest.
 */
export function layoutBox(el: HTMLElement): { x: number; y: number; width: number; height: number } {
  let x = 0;
  let y = 0;
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft;
    y += node.offsetTop;
  }
  return { x, y, width: el.offsetWidth, height: el.offsetHeight };
}

/**
 * Every app icon on the dock, as Evo's minimize targets, each with the app's
 * accent when Bloom knows one (`hueFor`), for Evo's Lumen Droplet.
 */
export function measureDockIcons(
  root: ParentNode = document,
  hueFor: (appId: string) => string | undefined = appHue
): MinimizeTarget[] {
  const targets = new Map<string, MinimizeTarget>();
  root
    .querySelectorAll<HTMLElement>('[data-shell-edge="bottom"] [data-app]')
    .forEach((el) => {
      const appId = el.getAttribute('data-app');
      if (!appId) return;
      const box = layoutBox(el);
      if (box.width <= 0 || box.height <= 0) return;
      const accent = hueFor(appId);
      targets.set(appId, accent ? { appId, ...box, accent } : { appId, ...box });
    });
  return [...targets.values()];
}

/**
 * Tell Evo where the dock's app icons are (see `setMinimizeTargets`), whenever
 * the dock lays out or moves: an app opening or closing adds or removes an
 * icon and shifts the others, and the page resizing re-centres the dock.
 * Measurements repeat a few times after a change because the dock springs in
 * and nothing observable says when it has stopped.
 */
export function useMinimizeTargets(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let sent = '';

    const measure = () => {
      const targets = measureDockIcons();
      // A dock that is not on the page (a fullscreen app hides it) keeps the
      // last table: the windows under that app still minimize into it.
      if (targets.length === 0) return;
      const key = JSON.stringify(targets);
      if (key === sent) return;
      sent = key;
      void setMinimizeTargets(targets);
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
      // The shell is going away: leave nothing aimed at icons nobody draws.
      if (sent) void setMinimizeTargets([]);
    };
  }, [enabled]);
}

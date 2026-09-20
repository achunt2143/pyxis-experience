import { useEffect, useRef, useState } from 'react';

/**
 * Tracks the live rendered height of a DOM node via ResizeObserver.
 *
 * remochi's MochiSlidingMenu.ContentShifter shifts its content by an exact
 * `menuHeight` CSS length rather than measuring the paired menu itself, so
 * callers pairing a top/bottom MochiSlidingMenu with a ContentShifter need
 * to supply that value themselves.
 *
 * The ref this hook returns is meant to be attached inside a
 * MochiSlidingMenu, which renders children inside its own
 * `.mochi-sliding-menu-inner` wrapper (16px/24px padding) inside a `nav`
 * with its own 1px border. Measuring the ref element itself undercounts
 * the menu's true rendered height by that padding/border, leaving the
 * ContentShifter's shift a few pixels short of the menu's real edge — so
 * this walks up to the actual `.mochi-sliding-menu` nav (falling back to
 * the ref element if one isn't found) and measures its full border-box.
 */
export function useMeasuredHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = el.closest<HTMLElement>('.mochi-sliding-menu') ?? el;
    const measure = () => setHeight(target.getBoundingClientRect().height);
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    measure();
    return () => observer.disconnect();
  }, []);

  return [ref, height] as const;
}

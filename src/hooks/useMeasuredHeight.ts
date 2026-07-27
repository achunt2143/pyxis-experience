import { useEffect, useRef, useState } from 'react';

/**
 * Tracks the live rendered height of a DOM node via ResizeObserver.
 *
 * remochi's MochiSlidingMenu.ContentShifter shifts its content by an exact
 * `menuHeight` CSS length rather than measuring the paired menu itself, so
 * callers pairing a top/bottom MochiSlidingMenu with a ContentShifter need
 * to supply that value themselves.
 */
export function useMeasuredHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      setHeight(entries[0].contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, height] as const;
}

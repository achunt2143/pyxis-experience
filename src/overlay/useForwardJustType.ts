import { useEffect, useRef } from 'react';

/**
 * "Just type" for the desktop window. The search box is in the overlay, but
 * with no app focused it is the desktop beneath that has the keyboard. So
 * while `enabled`, a printable key typed there, or the search hotkey
 * (Ctrl+Space, Meta+K), is handed to the overlay, which opens the box, asks
 * Evo for the keyboard and starts the query with the key. Keys with Alt,
 * Ctrl or Meta held, and keys typed into a field, are left alone.
 */
export function useForwardJustType(enabled: boolean, send: (text?: string) => void) {
  const latest = useRef(send);
  useEffect(() => {
    latest.current = send;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if ((e.ctrlKey && e.code === 'Space') || (e.metaKey && e.code === 'KeyK')) {
        e.preventDefault();
        latest.current();
        return;
      }
      if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
      if (e.key.length === 1) {
        e.preventDefault();
        latest.current(e.key);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}

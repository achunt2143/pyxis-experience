import { useCallback, useEffect, useReducer, useRef } from 'react';
import { onSwitcherChanged, type SwitcherPayload } from '@pyxis/app-sdk';

/**
 * Alt+Tab as the shell shows it: Bloom's overview, driven by Evo's
 * `SwitcherChanged` signal (see `SwitcherPayload` for the protocol). Evo keeps
 * the keys and the order; this only follows. It never asks Evo for the
 * keyboard: the switcher is a view of what Evo is doing, and Alt is held
 * down in whatever app has it.
 */
export interface SwitcherState {
  /** Evo window ids, most recently used first. */
  order: number[];
  /** The window highlighted. */
  selected: number;
  /** Set when Alt was released: the window the cards zoom toward. */
  committed: number | null;
}

export type SwitcherAction = SwitcherPayload | { phase: 'dismiss' };

export function switcherReducer(state: SwitcherState | null, action: SwitcherAction): SwitcherState | null {
  switch (action.phase) {
    case 'open':
      return { order: action.order, selected: action.selected, committed: null };
    case 'step':
      // A step with no open before it (the overlay restarted mid-walk) is
      // as good an open.
      return { order: action.order, selected: action.selected, committed: null };
    case 'commit':
      // A quick tap commits with nothing shown: nothing to close.
      return state ? { ...state, order: action.order, selected: action.selected, committed: action.selected } : null;
    case 'cancel':
    case 'dismiss':
      return null;
  }
}

/**
 * @param commitMs how long the committed card's zoom takes before the
 *   overview is taken down (the close transition, resolved for the user's
 *   animation mode).
 */
export function useSwitcher(commitMs: number) {
  const [state, dispatch] = useReducer(switcherReducer, null);
  const timer = useRef<number | undefined>(undefined);
  const commitMsRef = useRef(commitMs);
  useEffect(() => {
    commitMsRef.current = commitMs;
  });

  const later = useCallback((ms: number) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => dispatch({ phase: 'dismiss' }), ms);
  }, []);

  useEffect(
    () =>
      onSwitcherChanged((payload) => {
        window.clearTimeout(timer.current);
        dispatch(payload);
        if (payload.phase === 'commit') later(commitMsRef.current + 40);
      }),
    [later]
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const dismiss = useCallback(() => {
    window.clearTimeout(timer.current);
    dispatch({ phase: 'dismiss' });
  }, []);

  /**
   * A card was clicked: Evo is told to focus that window, and answers with
   * the `commit` that zooms the overview away. If it never does (Evo down),
   * don't leave a screen-sized panel up.
   */
  const guard = useCallback(() => later(1200), [later]);

  return { switcher: state, dismiss, guard };
}

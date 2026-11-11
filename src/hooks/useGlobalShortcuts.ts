import { useEffect, useRef } from 'react';
import {
  EVO_IFACE,
  EVO_SHORTCUT_SIGNAL,
  echoClient,
  type EvoShortcutAction,
  type EvoShortcutPayload,
} from '@pyxis/app-sdk';

/**
 * Dispatched on `window` to open and focus the desktop search box. `detail`
 * may carry `{ text }`, the key that started "just type", to begin the query
 * with.
 */
export const FOCUS_SEARCH_EVENT = 'pyxis:focus-search';

/** Dispatched on `window` to close the desktop search box, clearing its query. */
export const CLOSE_SEARCH_EVENT = 'pyxis:close-search';

export type ShortcutHandlers = Record<EvoShortcutAction, () => void>;

/**
 * Run `handlers` when Evo reports a global shortcut. Bloom's own key
 * listeners only hear keys while Bloom has the keyboard, which is never while
 * an app is focused; Evo sees every key and tells the shell instead. Needs
 * `windows:manage`, like the window signals.
 */
export function useGlobalShortcuts(handlers: ShortcutHandlers) {
  // The subscription is made once; the handlers it calls are the latest.
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(
    () =>
      echoClient.onSignal(EVO_IFACE, EVO_SHORTCUT_SIGNAL, (data) => {
        const { action } = data as EvoShortcutPayload;
        latest.current[action]?.();
      }),
    []
  );
}

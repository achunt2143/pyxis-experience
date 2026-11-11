import { useEffect, useRef } from 'react';
import { onOverlayFocusChanged, setOverlayFocus } from '@pyxis/app-sdk';

/**
 * Hold Evo's keyboard for the overlay while `wanted`. Evo never gives the
 * overlay the keyboard on its own (a toast must not take what an app is
 * typing into), so a panel that takes typing asks, for as long as it is open,
 * and gives it back on close, which returns it to the app beneath.
 *
 * Evo also reports when the overlay loses the keyboard to something else,
 * an Alt+Tab or a click on an app. A panel that was typing then has nothing
 * to type into, so `onTaken` is called, and the shell closes its panels.
 */
export function useOverlayKeyboard(wanted: boolean, onTaken: () => void) {
  const takenRef = useRef(onTaken);
  useEffect(() => {
    takenRef.current = onTaken;
  });
  const wantedRef = useRef(false);
  const grantedRef = useRef(false);
  const askedRef = useRef(false);

  useEffect(() => {
    wantedRef.current = wanted;
    if (!wanted) grantedRef.current = false;
    // Nothing to give back before the first ask.
    if (!wanted && !askedRef.current) return;
    askedRef.current = true;
    void setOverlayFocus(wanted);
  }, [wanted]);

  useEffect(
    () =>
      onOverlayFocusChanged((focused) => {
        if (focused) {
          grantedRef.current = true;
        } else if (wantedRef.current && grantedRef.current) {
          grantedRef.current = false;
          takenRef.current();
        }
      }),
    []
  );
}

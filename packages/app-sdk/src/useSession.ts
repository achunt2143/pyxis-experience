import { useEffect, useMemo, useState } from 'react';
import { getSessionState, onLockChanged, type SessionState } from './session';

/**
 * useSessionState
 * ---------------
 * The session as the shell sees it, kept live: `getState` once at mount (so
 * an overlay that restarts while the screen is locked comes up locked), then
 * `LockChanged` for every change. `state` is null until Echo has answered, or
 * with no session service; `locked` is then false.
 *
 * `locked` follows the signals, which are newer than any read: a change
 * heard before the first answer isn't overwritten by it. Each change also
 * re-reads the rest of the state, since the user's name, accent and password
 * flag (what the lock screen draws) and the failure count (reset by an
 * unlock) may have moved.
 */
export function useSessionState(): { state: SessionState | null; locked: boolean } {
  const [session, setSession] = useState<SessionState | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let mounted = true;
    let heardChange = false;

    void getSessionState().then((s) => {
      if (!mounted || !s) return;
      setSession(s);
      if (!heardChange) setLocked(s.locked);
    });

    const off = onLockChanged((change) => {
      heardChange = true;
      setLocked(change.locked);
      void getSessionState().then((s) => {
        if (mounted && s) setSession(s);
      });
    });
    return () => {
      mounted = false;
      off();
    };
  }, []);

  const state = useMemo(() => (session ? { ...session, locked } : null), [session, locked]);
  return { state, locked };
}

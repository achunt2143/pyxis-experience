import { useEffect, useReducer, useRef, type ReactNode } from 'react';
import {
  EVO_IFACE,
  EVO_SERVICE,
  EVO_SIGNALS,
  echoClient,
  type EvoWindowClosedPayload,
  type EvoWindowCreatedPayload,
  type EvoWindowFocusChangedPayload,
  type EvoWindowFullscreenPayload,
  type EvoWindowInfo,
  type EvoWindowMaximizedPayload,
  type EvoWindowMinimizedPayload,
  type EvoWindowMovedPayload,
} from '@pyxis/app-sdk';
import { EMPTY_WINDOWS, windowsReducer } from './compositorWindows';
import { CompositorWindowsContext } from './useAppWindows';

/**
 * Evo's window list, kept live: one `ListWindows` for the baseline, then the
 * window signals applied over it. Needs `windows:manage` for both, which
 * Bloom's manifest holds.
 *
 * A signal about a window the list never mentioned (Evo's list is sampled
 * every 250 ms, and a signal can beat it, or be lost across a reconnect)
 * triggers a fresh list instead of being guessed at.
 */
/** How old Evo's ListWindows sample can be (it is refreshed every 250 ms), with a margin. */
export const LIST_SAMPLE_AGE_MS = 300;

export function CompositorWindowsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(windowsReducer, EMPTY_WINDOWS);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;

    // Evo's list is a sample up to 250 ms old, so a list asked for just after
    // a signal can predate it. Windows a signal created or closed since
    // shortly before the request are kept or dropped over what the list says
    // (`keep`/`drop`), and a list that may have missed a signal is followed by
    // one more once the sample has caught up. Without that, Files opening
    // maximized (created, focused, maximized, then quiet) could be erased by a
    // list a focus signal had asked for, and stay missing until some later
    // signal named it: the dock, the overview and the wallpaper never saw it.
    const created = new Map<number, number>();
    const closed = new Map<number, number>();
    let lastSignalAt = -Infinity;
    const signalled = () => {
      lastSignalAt = Date.now();
    };

    // One list at a time: a burst of signals about windows Evo doesn't list
    // (its own overlay, say) must not become a burst of calls. A request
    // made while one is out runs once it is back.
    let listing = false;
    let again = false;
    let followUp: ReturnType<typeof setTimeout> | undefined;
    const relist = async () => {
      if (listing) {
        again = true;
        return;
      }
      listing = true;
      const since = Date.now() - LIST_SAMPLE_AGE_MS;
      try {
        const res = (await echoClient.callMethod(EVO_SERVICE, EVO_IFACE, 'ListWindows', {})) as
          | { windows?: EvoWindowInfo[] }
          | undefined;
        const recent = (m: Map<number, number>) =>
          [...m].filter(([, at]) => at >= since).map(([id]) => id);
        if (!cancelled) {
          dispatch({ type: 'list', windows: res?.windows ?? [], keep: recent(created), drop: recent(closed) });
        }
        for (const m of [created, closed]) {
          for (const [id, at] of m) if (at < since) m.delete(id);
        }
      } catch (err) {
        // Keep what we have. `ready` stays false until a list lands once.
        console.warn('[CompositorWindows] ListWindows failed', err);
      } finally {
        listing = false;
        if (!cancelled && (again || lastSignalAt >= since)) {
          again = false;
          clearTimeout(followUp);
          followUp = setTimeout(() => void relist(), LIST_SAMPLE_AGE_MS + 50);
        }
      }
    };

    const known = (id: number) => id in stateRef.current.byId;
    // Apply a signal for a window we know; otherwise re-list.
    const onKnown = (id: number, apply: () => void) => {
      if (known(id)) apply();
      else void relist();
    };

    void relist();

    const on = <T,>(signal: string, cb: (p: T) => void) =>
      echoClient.onSignal(EVO_IFACE, signal, (data) => {
        if (cancelled) return;
        signalled();
        cb(data as T);
      });

    const unsubs = [
      on<EvoWindowCreatedPayload>(EVO_SIGNALS.created, (p) => {
        created.set(p.window_id, Date.now());
        closed.delete(p.window_id);
        dispatch({
          type: 'created',
          windowId: p.window_id,
          appId: p.app_id,
          width: p.width,
          height: p.height,
        });
      }),
      on<EvoWindowClosedPayload>(EVO_SIGNALS.closed, (p) => {
        closed.set(p.window_id, Date.now());
        created.delete(p.window_id);
        dispatch({ type: 'closed', windowId: p.window_id });
      }),
      on<EvoWindowFocusChangedPayload>(EVO_SIGNALS.focusChanged, (p) => {
        if (p.window_id === null) dispatch({ type: 'focus', windowId: null });
        else {
          const id = p.window_id;
          onKnown(id, () => dispatch({ type: 'focus', windowId: id }));
        }
      }),
      on<EvoWindowMinimizedPayload>(EVO_SIGNALS.minimized, (p) =>
        onKnown(p.window_id, () =>
          dispatch({ type: 'minimized', windowId: p.window_id, minimized: p.minimized })
        )
      ),
      on<EvoWindowMaximizedPayload>(EVO_SIGNALS.maximized, (p) =>
        onKnown(p.window_id, () =>
          dispatch({ type: 'maximized', windowId: p.window_id, maximized: p.maximized })
        )
      ),
      on<EvoWindowFullscreenPayload>(EVO_SIGNALS.fullscreen, (p) =>
        onKnown(p.window_id, () =>
          dispatch({ type: 'fullscreen', windowId: p.window_id, fullscreen: p.fullscreen })
        )
      ),
      on<EvoWindowMovedPayload>(EVO_SIGNALS.moved, (p) =>
        onKnown(p.window_id, () =>
          dispatch({ type: 'moved', windowId: p.window_id, x: p.x, y: p.y })
        )
      ),
    ];

    return () => {
      cancelled = true;
      clearTimeout(followUp);
      unsubs.forEach((u) => {
        try {
          u();
        } catch {
          /* ignore */
        }
      });
    };
  }, []);

  return (
    <CompositorWindowsContext.Provider value={state}>{children}</CompositorWindowsContext.Provider>
  );
}

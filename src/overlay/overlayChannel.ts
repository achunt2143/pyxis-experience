import { useEffect, useRef, useState } from 'react';

/**
 * How the desktop and the overlay coordinate. They are two windows of the
 * same pyxis://bloom origin, so a BroadcastChannel reaches from one to the
 * other. The overlay holds the whole shell UI (see ShellLayer); the desktop
 * is the wallpaper beneath apps. What passes between them:
 *
 *  - the overlay says it is `alive` when it starts, every couple of
 *    seconds, and whenever the desktop sends a `ping`;
 *  - the desktop forwards "just type": with no app focused, the desktop is
 *    the window that has the keyboard, but the search box is in the overlay.
 *    A printable key (or the search hotkey) typed there goes over as
 *    `search`, and the overlay opens the box, asks Evo for the keyboard and
 *    starts the query with it.
 *
 * The desktop draws the shell itself only while no overlay is alive: in the
 * browser dev server, or if the overlay window failed to open. The shell is
 * then never lost, and never drawn twice.
 */
const CHANNEL = 'pyxis-overlay';
/** How often the overlay says it is alive. */
export const HEARTBEAT_MS = 2000;
/** How long without a heartbeat before the desktop stops relying on it. */
export const STALE_MS = 5000;
/** How long after the desktop starts the overlay has to show up. */
export const STARTUP_GRACE_MS = 8000;

export type OverlayMessage =
  | { type: 'alive' }
  | { type: 'ping' }
  | { type: 'search'; text?: string };

function openChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
}

/**
 * For the overlay: announce it to the desktop, and hand `onSearch` what the
 * desktop forwards ("just type", and the search hotkey).
 */
export function useOverlayAnnouncer(onSearch?: (text?: string) => void) {
  const latest = useRef(onSearch);
  useEffect(() => {
    latest.current = onSearch;
  });

  useEffect(() => {
    const channel = openChannel();
    if (!channel) return;
    const alive = () => channel.postMessage({ type: 'alive' } satisfies OverlayMessage);
    channel.onmessage = (event: MessageEvent<OverlayMessage>) => {
      if (event.data?.type === 'ping') alive();
      else if (event.data?.type === 'search') latest.current?.(event.data.text);
    };
    alive();
    const timer = window.setInterval(alive, HEARTBEAT_MS);
    return () => {
      window.clearInterval(timer);
      channel.close();
    };
  }, []);
}

/** What the desktop knows about the overlay. */
export type OverlayPresence = 'unknown' | 'present' | 'absent';

/**
 * For the desktop: whether an overlay is alive, and so drawing the shell.
 * `unknown` is the wait at startup, before the overlay has had its chance to
 * speak; the desktop draws nothing of the shell then, so it does not flash
 * up and vanish when the overlay arrives. It becomes `absent` when the
 * overlay never comes, or goes quiet.
 *
 * `postSearch` sends "just type" to the overlay.
 */
export function useOverlayPresence(): { presence: OverlayPresence; postSearch: (text?: string) => void } {
  const [presence, setPresence] = useState<OverlayPresence>(() =>
    typeof BroadcastChannel === 'undefined' ? 'absent' : 'unknown'
  );
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const channel = openChannel();
    if (!channel) return;
    channelRef.current = channel;
    const startedAt = Date.now();
    let lastSeen = 0;
    channel.onmessage = (event: MessageEvent<OverlayMessage>) => {
      if (event.data?.type !== 'alive') return;
      lastSeen = Date.now();
      setPresence('present');
    };
    channel.postMessage({ type: 'ping' } satisfies OverlayMessage);
    const timer = window.setInterval(() => {
      const now = Date.now();
      if (lastSeen === 0) {
        if (now - startedAt > STARTUP_GRACE_MS) setPresence('absent');
      } else if (now - lastSeen > STALE_MS) {
        setPresence('absent');
      }
    }, HEARTBEAT_MS);
    return () => {
      window.clearInterval(timer);
      channel.close();
      channelRef.current = null;
    };
  }, []);

  const postSearch = (text?: string) =>
    channelRef.current?.postMessage({ type: 'search', text } satisfies OverlayMessage);

  return { presence, postSearch };
}

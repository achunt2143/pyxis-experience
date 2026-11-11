import { useSyncExternalStore } from 'react';
import { getWindowThumbnails, type WindowThumbnail } from '@pyxis/app-sdk';

/**
 * The shell's copy of Evo's window thumbnails (`GetWindowThumbnails`).
 *
 * The overview opens at once with what is here and refreshes in the
 * background, so a card never waits on Evo: a picture that is a moment old
 * is replaced when the new one lands, and a window with none yet shows its
 * icon. `useThumbnailPrefetch` keeps it warm while windows come and go, so the
 * Alt+Tab switcher, which opens 150 ms after the first Tab, usually has every
 * picture on its first frame.
 */

let thumbs: ReadonlyMap<number, WindowThumbnail> = new Map();
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;
let again: number[] | null | undefined; // undefined: nothing queued

function publish(next: Map<number, WindowThumbnail>) {
  thumbs = next;
  listeners.forEach((l) => l());
}

/**
 * Ask Evo for fresh pictures. `liveIds` are the windows that exist: the rest
 * are forgotten. Calls made while one is in flight collapse into a single
 * follow-up, so a burst of focus changes costs one more round trip, not many.
 */
export function refreshThumbnails(liveIds: number[]): Promise<void> {
  if (inFlight) {
    again = liveIds;
    return inFlight;
  }
  const run = async (ids: number[]) => {
    const rows = await getWindowThumbnails({ windowIds: ids.length ? ids : undefined });
    const live = new Set(ids);
    const next = new Map<number, WindowThumbnail>();
    for (const [id, t] of thumbs) if (live.has(id)) next.set(id, t);
    for (const row of rows) if (live.size === 0 || live.has(row.windowId)) next.set(row.windowId, row);
    publish(next);
  };
  inFlight = (async () => {
    try {
      await run(liveIds);
      while (again !== undefined) {
        const queued = again;
        again = undefined;
        await run(queued ?? []);
      }
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export function getThumbnails(): ReadonlyMap<number, WindowThumbnail> {
  return thumbs;
}

export function subscribeThumbnails(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function useThumbnails(): ReadonlyMap<number, WindowThumbnail> {
  return useSyncExternalStore(subscribeThumbnails, getThumbnails);
}

/** Forget everything (tests). */
export function resetThumbnails() {
  thumbs = new Map();
  again = undefined;
}

/**
 * State that outlives a remount of the whole app.
 *
 * The SDK's AppShell used to key remochi's ThemeWrapper by the theme, so
 * every theme change remounted Settings from the root (with Auto, choosing a
 * time zone where it is night did it mid-choice). It no longer remounts, but
 * what the user was looking at (the section) and what they were just told (a
 * time-zone confirmation or error) still live here, for the life of the
 * document, so nothing that rebuilds the tree can lose them.
 */
import { useCallback, useSyncExternalStore } from 'react';

const values = new Map<string, unknown>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function remember<T>(key: string, value: T): void {
  values.set(key, value);
  listeners.forEach((l) => l());
}

export function useRemembered<T>(key: string, initial: T): [T, (value: T) => void] {
  const value = useSyncExternalStore(subscribe, () => (values.has(key) ? (values.get(key) as T) : initial));
  const set = useCallback((next: T) => remember(key, next), [key]);
  return [value, set];
}

/** The remembered value now (for code that can't call hooks: a Duyo kind). */
export function recall<T>(key: string, initial: T): T {
  return values.has(key) ? (values.get(key) as T) : initial;
}

/** Calls `listener` after any remembered value changes; returns the unsubscribe. */
export function watchRemembered(listener: () => void): () => void {
  return subscribe(listener);
}

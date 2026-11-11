/**
 * A tiny external store with a reference-counted lifetime: `start` runs when
 * the first listener subscribes and its returned stop function when the last
 * leaves. `get` is always the latest immutable snapshot (a new object on every
 * change), the same contract `useSyncExternalStore` uses.
 */
export interface Store<S> {
  get(): S;
  subscribe(listener: () => void): () => void;
}

export interface StoreControl<S> extends Store<S> {
  set(next: S): void;
  /** Replace the snapshot without notifying (resets on stop). */
  peek(): S;
}

export function createStore<S>(
  initial: () => S,
  start: (control: StoreControl<S>) => () => void,
): StoreControl<S> {
  let snapshot = initial();
  const listeners = new Set<() => void>();
  let stop: (() => void) | null = null;

  const control: StoreControl<S> = {
    get: () => snapshot,
    peek: () => snapshot,
    set(next) {
      snapshot = next;
      for (const l of [...listeners]) l();
    },
    subscribe(listener) {
      listeners.add(listener);
      if (!stop) stop = start(control);
      return () => {
        if (!listeners.delete(listener)) return;
        if (listeners.size === 0 && stop) {
          const s = stop;
          stop = null;
          s();
        }
      };
    },
  };
  return control;
}

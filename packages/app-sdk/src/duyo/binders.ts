/**
 * Service binders: let a Duyo kind's code-behind (which cannot call React
 * hooks) consume the SDK's services. Each one writes a published property (or
 * calls a method) and keeps it live, returns an unsubscribe function, and
 * cleans itself up when the component is destroyed.
 *
 * CALL THEM FROM `create()`, AFTER `this.inherited(arguments)`:
 *
 *     create() {
 *       this.inherited(arguments);
 *       bindSetting(this, 'pyxis.clock24h', 'hour24', false, asBoolean);
 *       bindClock(this, 'clock');
 *     },
 *
 * Not from `rendered()`. A renderer calls `rendered()` once per draw, and under
 * React.StrictMode (and on any re-render that remounts) more than once, so
 * binders placed there would subscribe repeatedly (gap 5 of the port plan).
 * `create()` runs exactly once per instance. As a backstop the property
 * binders are idempotent per (component, property): binding the same property
 * again replaces the earlier binding rather than doubling it.
 *
 * Everything here sits on the SDK's existing non-hook exports and shared
 * stores. Nothing is imported by the SDK's main entry.
 */
import type { Component } from '@duyojs/duyo';
import { getSetting, onSettingChange } from '../settingsBus';
import type { SettingParser } from '../useSetting';
import { echoClient } from '../EchoClient';
import { getVolume, onVolumeChanged } from '../audio';
import { appHostStore } from './stores/apphost';
import { clockStore } from './stores/clock';
import { installerStore } from './stores/installer';
import type { Store } from './stores/store';

// ---------------------------------------------------------------------------
// Cleanup on destroy

const cleanups = new WeakMap<Component, Set<() => void>>();

/**
 * Run `fn` once when `component` is destroyed, after its own `destroy` chain
 * (a kind's override, `inherited`, children) has run. Returns a function that
 * cancels it. Duyo has no public on-destroy hook, so the first call wraps the
 * instance's `destroy` property once: the wrapper calls the previous `destroy`
 * (the kind's installed closure, or the prototype's) with the component as
 * `this`, so `this.inherited(arguments)` inside a kind's destroy is untouched
 * (its frame stack lives in the closure the wrapper calls).
 */
export function onDestroy(component: Component, fn: () => void): () => void {
  let list = cleanups.get(component);
  if (!list) {
    const set = (list = new Set<() => void>());
    cleanups.set(component, set);
    const previous = component.destroy as (...args: unknown[]) => unknown;
    Object.defineProperty(component, 'destroy', {
      value: function destroyWithCleanup(...args: unknown[]) {
        try {
          return previous.apply(component, args);
        } finally {
          if (component.destroyed) {
            const pending = [...set];
            set.clear();
            for (const f of pending) {
              try {
                f();
              } catch (err) {
                console.error('[binders] cleanup threw', err);
              }
            }
          }
        }
      },
      writable: true,
      configurable: true,
    });
  }
  const set = list;
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}

// ---------------------------------------------------------------------------
// Plumbing

const bindings = new WeakMap<Component, Map<string, () => void>>();

/**
 * Register a binding under `key`, replacing (and tearing down) any earlier one
 * with the same key on this component. Returns the unsubscribe function.
 */
function register(component: Component, key: string, teardown: () => void): () => void {
  let map = bindings.get(component);
  if (!map) bindings.set(component, (map = new Map()));
  map.get(key)?.();
  let done = false;
  const unbind = () => {
    if (done) return;
    done = true;
    if (map.get(key) === unbind) map.delete(key);
    cancel();
    teardown();
  };
  map.set(key, unbind);
  const cancel = onDestroy(component, unbind);
  return unbind;
}

/** A write that is dropped once the component is destroyed. */
function writer(component: Component, property: string) {
  return (value: unknown) => {
    if (!component.destroyed) component.set(property, value);
  };
}

function bindStore<S>(component: Component, key: string, property: string, store: Store<S>): () => void {
  const write = writer(component, property);
  const off = store.subscribe(() => write(store.get()));
  write(store.get());
  return register(component, key, off);
}

// ---------------------------------------------------------------------------
// Binders

/**
 * One setting into `component.set(property, …)`, live. Same semantics as
 * `useSetting`: `fallback` until the saved value arrives, and whenever the
 * stored value is null or `parse` rejects it (an absent `pyxis.*` key reads as
 * Echo's default, so `fallback` shows only briefly); a change heard before the
 * initial read answers wins over that answer.
 */
export function bindSetting<T>(
  component: Component,
  key: string,
  property: string,
  fallback: T,
  parse?: SettingParser<T>,
): () => void {
  const write = writer(component, property);
  const read = (raw: unknown): T => {
    if (raw === null || raw === undefined) return fallback;
    if (!parse) return raw as T;
    const parsed = parse(raw);
    return parsed === undefined ? fallback : parsed;
  };
  let live = true;
  let heardChange = false;
  write(fallback);
  getSetting<unknown>(key)
    .then((raw) => {
      if (live && !heardChange) write(read(raw));
    })
    .catch(() => {});
  const off = onSettingChange((change) => {
    if (!live || change.key !== key) return;
    heardChange = true;
    write(read(change.value));
  });
  return register(component, `setting:${property}`, () => {
    live = false;
    off();
  });
}

/**
 * The device clock into `property` as a `ClockState` (what `useClock`
 * returns: wall clock fields, `epochMs`, `timezone`, `utcOffsetMinutes`,
 * `abbreviation`, `synced`). Ticks on Echo's minute, re-syncs every 10 minutes
 * and across DST, follows `TimezoneChanged`; one loop per document is shared
 * by every bound component.
 */
export function bindClock(component: Component, property: string): () => void {
  return bindStore(component, `clock:${property}`, property, clockStore);
}

/**
 * Calls `component[method](payload)` for each `iface`/`event` Echo signal. A
 * signal arriving after the unsubscribe or the component's destruction is
 * dropped. Throws if `method` is not a function on the component, so a typo
 * fails at bind time rather than silently never firing.
 */
export function bindSignal(component: Component, iface: string, event: string, method: string): () => void {
  if (typeof component[method] !== 'function') {
    throw new TypeError(`bindSignal: ${component.kind} has no method "${method}"`);
  }
  let live = true;
  const off = echoClient.onSignal(iface, event, (payload) => {
    if (!live || component.destroyed) return;
    (component[method] as (p: unknown) => void).call(component, payload);
  });
  return register(component, `signal:${iface}:${event}:${method}`, () => {
    live = false;
    off();
  });
}

/** The AppHost state (`AppHostState`, as `useAppHost()` returns) into `property`. */
export function bindAppHost(component: Component, property: string): () => void {
  return bindStore(component, `apphost:${property}`, property, appHostStore);
}

/** The installer state (`InstallerState`, as `useInstaller()` returns) into `property`. */
export function bindInstaller(component: Component, property: string): () => void {
  return bindStore(component, `installer:${property}`, property, installerStore);
}

/**
 * The output volume into `property` as `{ volume, muted }`, or null until the
 * audio service answers (and for good on a machine with no audio). Follows
 * `VolumeChanged`; a change heard before the first read wins over it.
 */
export function bindVolume(component: Component, property: string): () => void {
  const write = writer(component, property);
  let live = true;
  let heard = false;
  write(null);
  void getVolume().then((state) => {
    if (live && !heard && state) write(state);
  });
  const off = onVolumeChanged((state) => {
    if (!live) return;
    heard = true;
    write(state);
  });
  return register(component, `volume:${property}`, () => {
    live = false;
    off();
  });
}

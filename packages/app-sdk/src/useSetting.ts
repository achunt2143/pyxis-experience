import { useEffect, useRef, useState } from 'react';
import { getSetting, onSettingChange } from './settingsBus';

/**
 * Turns a raw stored value into `T`, or `undefined` when it isn't one (the
 * hook then reads `fallback`).
 */
export type SettingParser<T> = (raw: unknown) => T | undefined;

/**
 * useSetting
 * ----------
 * One setting, read from the `org.geckoOS.settings` Echo service and kept
 * live: it follows a change made in any app (Echo's `SettingChanged`), in a
 * sibling document, or in this one (see settingsBus.ts).
 *
 * `fallback` is the value until the saved one arrives, and whenever the
 * stored value is null (absent with no default, or deleted) or `parse`
 * rejects it. A `pyxis.*` key that isn't stored reads as Echo's default, so
 * `fallback` only shows briefly at mount, or when Echo isn't there.
 *
 * Without `parse` the raw value is taken as `T` unchecked; pass one (e.g.
 * `asBoolean`, `oneOf(...)`) when a wrong type would hurt. `fallback` and
 * `parse` are read when a value arrives, so passing fresh ones each render
 * is fine; a change of `key` starts over.
 */
export function useSetting<T>(key: string, fallback: T, parse?: SettingParser<T>): T {
  const [state, setState] = useState<{ key: string; value: T } | null>(null);
  const fallbackRef = useRef(fallback);
  const parseRef = useRef(parse);
  useEffect(() => {
    fallbackRef.current = fallback;
    parseRef.current = parse;
  });

  useEffect(() => {
    let mounted = true;
    // A change heard before the initial read answers is newer than that
    // answer, so the answer must not overwrite it.
    let heardChange = false;

    const read = (raw: unknown): T => {
      if (raw === null || raw === undefined) return fallbackRef.current;
      const p = parseRef.current;
      if (!p) return raw as T;
      const parsed = p(raw);
      return parsed === undefined ? fallbackRef.current : parsed;
    };

    getSetting<unknown>(key)
      .then((raw) => {
        if (mounted && !heardChange) setState({ key, value: read(raw) });
      })
      .catch(() => {});

    const unsub = onSettingChange((change) => {
      if (change.key !== key) return;
      heardChange = true;
      setState({ key, value: read(change.value) });
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, [key]);

  return state && state.key === key ? state.value : fallback;
}

/** A boolean; the strings "true"/"false" count, as older builds stored them. */
export const asBoolean: SettingParser<boolean> = (raw) => {
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined;
};

/** A finite number. */
export const asNumber: SettingParser<number> = (raw) =>
  typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;

/** One of a fixed set of strings. */
export function oneOf<T extends string>(...values: readonly T[]): SettingParser<T> {
  return (raw) => (typeof raw === 'string' && (values as readonly string[]).includes(raw) ? (raw as T) : undefined);
}

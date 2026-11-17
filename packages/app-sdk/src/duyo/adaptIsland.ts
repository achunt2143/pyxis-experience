import { adapt, type AdaptOptions, type PackEntry } from '@duyojs/duyo/react';
import { memo, type ComponentType } from 'react';

const REACT_MEMO_TYPE = Symbol.for('react.memo');

function shallowStyleEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const sa = a as Record<string, unknown>;
  const sb = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(sa), ...Object.keys(sb)]);
  for (const k of keys) {
    if (!Object.is(sa[k], sb[k])) return false;
  }
  return true;
}

/**
 * Shallow prop comparison for adapted React islands: treats functions as equal
 * (callbacks returned by a props mapper simply forward to `node.doX(...)`), compares
 * `style` objects shallowly (for `host: 'props'`), and uses `Object.is` for data props.
 */
export function sameIslandProps(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (typeof a[key] === 'function' && typeof b[key] === 'function') continue;
    if (key === 'style' && shallowStyleEqual(a[key], b[key])) continue;
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}

type PlainMemoComponent<P> = { $$typeof?: symbol; type?: ComponentType<P>; compare?: unknown };

/**
 * `adapt()` with a `React.memo` boundary that skips re-rendering a leaf island when
 * unrelated state changes elsewhere in the Duyo tree and the island's data props are
 * unchanged.
 */
export function adaptIsland<P extends object = Record<string, unknown>>(
  options: Omit<AdaptOptions, 'component'> & { component: ComponentType<P> }
): PackEntry {
  const raw = options.component as PlainMemoComponent<P>;
  const inner =
    raw && raw.$$typeof === REACT_MEMO_TYPE && !raw.compare && raw.type
      ? raw.type
      : options.component;
  const MemoIsland = memo(inner as ComponentType<Record<string, unknown>>, sameIslandProps);
  return adapt({
    ...options,
    component: MemoIsland,
  });
}

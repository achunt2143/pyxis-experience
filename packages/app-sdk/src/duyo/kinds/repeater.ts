import { kindName, type Component, type KindDefinition, type KindInput } from '@duyojs/duyo';

/**
 * pyxis.Repeater: one child component per item, as Enyo's Repeater, but keyed and reusing.
 *
 *     { kind: 'pyxis.Repeater', name: 'list', itemKind: 'Files.Row',
 *       itemProps: { ontap: 'openRow' }, onSetupItem: 'setupRow' }
 *
 * Rows are created `{...itemProps, kind: itemKind, [itemProperty]: item, index}` and OWNED
 * BY THE REPEATER'S OWNER (`createComponent(def, { owner })`), parented to the Repeater. So
 * a row's own `ontap: 'openRow'` (from `itemProps`) resolves to a method of the view that
 * wrote the Repeater, which is where Enyo resolves a repeater row's handlers. Events a row's
 * own chrome raises resolve against the row (it owns them), then bubble up to the Repeater
 * and the view, with `event.originator` the row (read `originator.item`).
 *
 * `itemKind` must publish `item` (the `itemProperty`), and may publish `index`; `pyxis.Row`
 * is a ready-made base that does.
 *
 * Reuse: on `itemsChanged` a row whose KEY survives keeps its component (identity, state and
 * named children); it gets the new item (`set`, so `itemChanged()` fires) and index. The key
 * is `item[keyField]` for objects that have it, the value for strings/numbers/booleans, else
 * the position; a repeated key gets a `~n` suffix, so duplicates are kept, not merged.
 * Rows for keys that left are destroyed, new ones created, and the rendered order follows
 * `items`. Changing `itemKind`, `keyField`, `itemProperty` or `itemProps` rebuilds every row.
 *
 * `items` is compared by identity like every property: replace the array to change it. A
 * row's `set(item)` of the SAME object is a no-op, so `itemChanged()` does not fire for an
 * item mutated in place; `refresh()` after such a mutation (or after mutating `items`) only
 * re-raises `onSetupItem`, which is where in-place changes must be applied.
 *
 * `onSetupItem {index, item, component}` is raised (through `doSetupItem`, so the Repeater's
 * own delegate gets it) for EVERY row on every refresh, new, moved or unchanged. A handler
 * is the place to derive row state, and an item mutated in place gives no other hint.
 *
 * `create()` builds the first rows, so an `onSetupItem` for them runs while the owner is
 * still constructing: its methods exist, but `this.$` is not complete. Defer `$` lookups to
 * `rendered()` or to a later `itemsChanged`.
 *
 * Rows are reordered in place via `this.moveChild()`, so `node.children`, DOM order,
 * `waterfall`s, and `rows()` all agree (with any non-row static children kept ahead of rows).
 */
export const repeaterKind: KindInput = {
  name: 'pyxis.Repeater',
  kind: 'pyxis.Control',
  published: {
    items: [],
    /** Name of the kind to create per item (`'Files.Row'`). */
    itemKind: '',
    keyField: 'id',
    /** The row property that receives the item. */
    itemProperty: 'item',
    /** Extra definition for every row: properties and `on<Event>` delegates. */
    itemProps: {},
  },
  events: { onSetupItem: '' },

  create() {
    this['_rows'] = new Map<string, Component>();
    this['_order'] = [] as Component[];
    this.inherited();
    this['refresh']();
  },

  itemsChanged() {
    this['refresh']();
  },
  itemKindChanged() {
    this['rebuild']();
  },
  keyFieldChanged() {
    this['rebuild']();
  },
  itemPropertyChanged() {
    this['rebuild']();
  },
  itemPropsChanged() {
    this['rebuild']();
  },

  /** The rows, in item order. */
  rows() {
    return [...(this['_order'] as Component[])];
  },

  /** The row for an item key (see the key rule above), if there is one. */
  rowFor(key: unknown) {
    const rows = this['_rows'] as Map<string, Component>;
    return rows.get(`k:${String(key)}`) ?? rows.get(`p:${typeof key}:${String(key)}`);
  },

  rebuild() {
    const rows = this['_rows'] as Map<string, Component>;
    for (const row of [...rows.values()].reverse()) row.destroy();
    rows.clear();
    this['_order'] = [];
    this['refresh']();
  },

  refresh() {
    if (this.destroyed) return;
    const old = this['_rows'] as Map<string, Component>;
    const wanted = this.get('itemKind');
    const itemKind = typeof wanted === 'string' ? wanted : wanted ? kindName(wanted as { name: string }) : '';

    if (itemKind === '') {
      for (const row of [...old.values()].reverse()) row.destroy();
      old.clear();
      this['_order'] = [];
      return;
    }
    // Resolves first, so an unknown kind throws before any row is touched.
    const resolved = this.runtime.resolveKind(itemKind);

    const items = Array.isArray(this.get('items')) ? (this.get('items') as unknown[]) : [];
    const keyField = String(this.get('keyField') ?? '');
    const itemProperty = String(this.get('itemProperty') || 'item');
    const owner = this.getInstanceOwner();
    const base = { ...(this.get('itemProps') as Record<string, unknown> | undefined) };
    delete base['kind'];
    delete base['name'];
    delete base['components'];

    const seen = new Map<string, number>();
    const keyFor = (item: unknown, index: number): string => {
      let key: string;
      if (item !== null && typeof item === 'object' && keyField !== '' && keyField in item) {
        key = `k:${String((item as Record<string, unknown>)[keyField])}`;
      } else if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        key = `p:${typeof item}:${String(item)}`;
      } else {
        key = `i:${index}`;
      }
      const count = seen.get(key) ?? 0;
      seen.set(key, count + 1);
      return count === 0 ? key : `${key}~${count}`;
    };

    const rows = new Map<string, Component>();
    const order: Component[] = [];
    const claimed = new Set<Component>();

    items.forEach((item, index) => {
      const key = keyFor(item, index);
      let row: Component | undefined = old.get(key);
      if (row && !row.destroyed && row.kind === itemKind) {
        claimed.add(row);
        row.set(itemProperty, item);
        if (resolved.published.has('index')) row.set('index', index);
      } else {
        row = this.createComponent(
          {
            ...base,
            kind: itemKind,
            [itemProperty]: item,
            ...(resolved.published.has('index') ? { index } : {}),
          },
          { owner },
        );
      }
      rows.set(key, row);
      order.push(row);
    });

    // Whatever was not claimed has left; destroy back to front, as destroyComponents does.
    for (const row of [...old.values()].reverse()) if (!claimed.has(row)) row.destroy();

    const rowSet = new Set(order);
    const prefix = this.children.filter((child) => !rowSet.has(child)).length;
    order.forEach((row, index) => {
      const target = prefix + index;
      if (this.children[target] !== row) this.moveChild(row, target);
    });

    this['_rows'] = rows;
    this['_order'] = order;

    order.forEach((component, index) => {
      this['doSetupItem']({ index, item: items[index], component });
    });
  },
};

/**
 * A row base kind for Repeaters: a pyxis.Control that publishes what the Repeater sets.
 * Subkind it (or publish `item`/`index` yourself on any other kind).
 */
export const rowKind: KindDefinition = {
  name: 'pyxis.Row',
  kind: 'pyxis.Control',
  published: { item: null, index: 0 },
};

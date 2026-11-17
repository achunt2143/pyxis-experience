import type { Component, ComponentEvent, Instance, KindInput } from '@duyojs/duyo';
import { act, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { elementOf, mount } from './packHelpers';

interface Item {
  id: string | number;
  name: string;
}

const items = (...names: string[]): Item[] => names.map((name) => ({ id: name, name }));

/**
 * A view with a Repeater of Test.Rows. The row kind draws its item's name in a named child
 * (so each row has its own `$`) and records what it was told.
 */
function fixture(initial: readonly unknown[] = items('a', 'b', 'c')) {
  const log = {
    picks: [] as Array<{ self: unknown; sender: Component; originator: unknown; item: unknown }>,
    setups: [] as Array<{ index: number; item: unknown; component: Component }>,
    itemChanges: 0,
  };

  const kinds: KindInput[] = [
    {
      name: 'Test.Row',
      kind: 'pyxis.Row',
      components: [{ kind: 'pyxis.Control', name: 'label' }],
      itemChanged(this: Component) {
        log.itemChanges++;
        const item = this['item'] as Item | null;
        this.$['label']!.set('content', item ? item.name : '');
      },
      create(this: Component) {
        this.inherited();
        this['itemChanged']();
      },
    },
    {
      name: 'Test.List',
      kind: 'pyxis.Control',
      components: [
        {
          kind: 'pyxis.Repeater',
          name: 'list',
          itemKind: 'Test.Row',
          items: initial,
          itemProps: { ontap: 'pick', classes: 'row' },
          onSetupItem: 'setup',
        },
      ],
      pick(this: Component, sender: Component, event: ComponentEvent) {
        log.picks.push({ self: this, sender, originator: event.originator, item: sender['item'] });
      },
      setup(_sender: Component, event: ComponentEvent) {
        log.setups.push({ index: event['index'], item: event['item'], component: event['component'] });
      },
    },
  ];

  const m = mount({ kind: 'Test.List' }, kinds);
  // Typed through the KindTypes augmentation (kinds/types.ts): setItems/rows are checked.
  const list = m.root.$['list']! as Instance<'pyxis.Repeater'>;
  list.setItems(initial);
  const rows = () => list.rows() as Component[];
  /** Row labels in DOM order. */
  const dom = () => Array.from(m.container.querySelectorAll('.row')).map((el) => el.textContent);
  const set = (next: readonly unknown[]) =>
    act(() => {
      list.set('items', next);
    });
  return { ...m, log, list, rows, dom, set };
}

describe('pyxis.Repeater', () => {
  it('draws one row per item, in order, parented to the Repeater', () => {
    const { rows, dom, list, log } = fixture();
    expect(dom()).toEqual(['a', 'b', 'c']);
    expect(rows().map((r) => r.get('index'))).toEqual([0, 1, 2]);
    expect(rows().every((r) => r.parent === list && r.kind === 'Test.Row')).toBe(true);
    expect(log.setups.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(log.setups[0]!.component).toBe(rows()[0]);
  });

  it('draws nothing for an empty list, no itemKind, or non-array items', () => {
    const f = fixture([]);
    expect(f.dom()).toEqual([]);
    f.set(items('x'));
    expect(f.dom()).toEqual(['x']);
    act(() => {
      f.list.set('items', null as never);
    });
    expect(f.dom()).toEqual([]);
    act(() => {
      f.list.set('items', items('y'));
      f.list.set('itemKind', '');
    });
    expect(f.rows()).toEqual([]);
  });

  it('REUSES a row whose key survives, setting the new item on it', () => {
    const f = fixture();
    const before = f.rows();
    const changesBefore = f.log.itemChanges;

    f.set([
      { id: 'a', name: 'A!' },
      { id: 'b', name: 'b' },
      { id: 'c', name: 'C!' },
    ]);

    const after = f.rows();
    expect(after).toEqual(before);
    after.forEach((row, i) => expect(row).toBe(before[i]));
    expect(f.dom()).toEqual(['A!', 'b', 'C!']);
    // itemChanged fired for the items that are new objects (all three), none was rebuilt.
    expect(f.log.itemChanges - changesBefore).toBe(3);
    expect(before.every((r) => !r.destroyed)).toBe(true);
  });

  it('keeps component identity and DOM nodes across a reorder, and draws in item order', () => {
    const f = fixture(items('a', 'b', 'c'));
    const [a, b, c] = f.rows() as [Component, Component, Component];
    const elA = elementOf(f.container, a);

    f.set(items('c', 'a', 'b'));
    expect(f.rows()).toEqual([c, a, b]);
    f.rows().forEach((row, i) => expect(row).toBe([c, a, b][i]));
    expect(f.dom()).toEqual(['c', 'a', 'b']);
    expect(f.rows().map((r) => r.get('index'))).toEqual([0, 1, 2]);
    expect(elementOf(f.container, a)).toBe(elA);

    // Duyo's own child list now follows item order via moveChild().
    expect(f.list.children.map((x) => x.id)).toEqual([c.id, a.id, b.id]);
  });

  it('destroys rows for removed keys, creates new ones, and keeps the order', () => {
    const f = fixture(items('a', 'b', 'c'));
    const [a, b, c] = f.rows() as [Component, Component, Component];

    f.set(items('c', 'd', 'a'));
    const [first, second, third] = f.rows() as [Component, Component, Component];
    expect(first).toBe(c);
    expect(third).toBe(a);
    expect(second).not.toBe(b);
    expect(b.destroyed).toBe(true);
    expect(f.dom()).toEqual(['c', 'd', 'a']);
    expect(f.list.children).toHaveLength(3);
    expect(f.list.children).not.toContain(b);
    expect(f.container.querySelector(`[data-duyo-id="${b.id}"]`)).toBeNull();
  });

  it('raises onSetupItem {index, item, component} for every row on every refresh', () => {
    const f = fixture(items('a', 'b'));
    f.log.setups.length = 0;
    const next = items('b', 'z');
    f.set(next);
    expect(f.log.setups.map((s) => [s.index, (s.item as Item).id])).toEqual([
      [0, 'b'],
      [1, 'z'],
    ]);
    expect(f.log.setups.map((s) => s.component)).toEqual(f.rows());
  });

  it('resolves a row delegate (itemProps ontap) to the OWNER view, with the row as sender', () => {
    const f = fixture();
    const [, b] = f.rows() as [Component, Component];
    expect(b.owner).toBe(f.root);

    fireEvent.click(elementOf(f.container, b));
    expect(f.log.picks).toHaveLength(1);
    expect(f.log.picks[0]!.self).toBe(f.root);
    expect(f.log.picks[0]!.sender).toBe(b);
    expect(f.log.picks[0]!.item).toEqual({ id: 'b', name: 'b' });

    // A click on the row's own label bubbles up to the row and resolves the same way.
    fireEvent.click(elementOf(f.container, b.$['label']!));
    expect(f.log.picks).toHaveLength(2);
    expect(f.log.picks[1]!.sender).toBe(b);
    expect(f.log.picks[1]!.originator).toBe(b.$['label']);
  });

  it('a reused row still taps with its new item', () => {
    const f = fixture(items('a', 'b'));
    f.set(items('b', 'a'));
    fireEvent.click(f.container.querySelectorAll('.row')[0]!);
    expect(f.log.picks[0]!.item).toEqual({ id: 'b', name: 'b' });
  });

  it('keeps duplicate keys as separate rows and treats primitives as their own key', () => {
    const f = fixture([{ id: 1, name: 'one' }, { id: 1, name: 'uno' }, 'str', 7]);
    expect(f.rows()).toHaveLength(4);
    const [one, uno] = f.rows() as [Component, Component];
    f.set([{ id: 1, name: 'uno' }, { id: 1, name: 'one' }]);
    expect(f.rows()[0]).toBe(one);
    expect(f.rows()[1]).toBe(uno);
    expect(f.rows()).toHaveLength(2);
  });

  it('rebuilds every row when itemKind, keyField or itemProps change', () => {
    const f = fixture(items('a', 'b'));
    const before = f.rows();
    act(() => {
      f.list.set('keyField', 'name');
    });
    expect(f.rows().some((r) => before.includes(r))).toBe(false);
    expect(before.every((r) => r.destroyed)).toBe(true);
    expect(f.dom()).toEqual(['a', 'b']);

    const second = f.rows();
    act(() => {
      f.list.set('itemProps', { classes: 'row wide' });
    });
    expect(second.every((r) => r.destroyed)).toBe(true);
    expect(f.container.querySelectorAll('.wide')).toHaveLength(2);
  });

  it('refresh() re-raises onSetupItem for an item mutated in place (itemChanged does not fire: same object)', () => {
    const f = fixture(items('a'));
    const row = f.rows()[0]!;
    const item = row.get('item') as Item;
    f.log.setups.length = 0;
    const changes = f.log.itemChanges;
    item.name = 'mutated';
    f.set([item]);
    expect(f.log.setups).toHaveLength(1);
    act(() => {
      f.list.refresh();
    });
    expect(f.log.setups).toHaveLength(2);
    expect(f.log.setups[1]!.item).toBe(item);
    expect(f.log.itemChanges).toBe(changes);
    expect(f.rows()[0]).toBe(row);
  });

  it('reports a row kind that does not publish the item property', () => {
    const { diagnostics } = mount(
      { kind: 'pyxis.Repeater', itemKind: 'pyxis.Control', items: items('a') },
    );
    expect(diagnostics.some((d) => d.includes('"item" is not a property'))).toBe(true);
    expect(diagnostics.some((d) => d.includes('"index"'))).toBe(false);
  });

  it('supports another itemProperty name', () => {
    const { root } = mount(
      { kind: 'pyxis.Repeater', itemKind: 'Test.Entry', itemProperty: 'entry', items: items('a', 'b'), keyField: 'id' },
      [{ name: 'Test.Entry', kind: 'pyxis.Control', published: { entry: null } }],
    );
    expect(root.rows().map((r: Component) => (r.get('entry') as Item).name)).toEqual(['a', 'b']);
  });
});

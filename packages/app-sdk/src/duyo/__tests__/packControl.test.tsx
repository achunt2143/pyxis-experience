import { type Component, type ComponentEvent } from '@duyojs/duyo';
import { act, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { filterAttributes } from '../kinds/attributes';
import { elementOf, mount } from './packHelpers';

const PC = 'pyxis.Control';

describe('filterAttributes', () => {
  it('keeps data-*, aria-*, role, tabIndex, id, title and draggable', () => {
    expect(
      filterAttributes({
        'data-shell-region': '',
        'data-app': 'files',
        'data-count': 3,
        'data-on': true,
        'aria-label': 'Close',
        role: 'button',
        tabindex: '0',
        id: 'x',
        title: 'T',
        draggable: 'true',
      }),
    ).toEqual({
      'data-shell-region': '',
      'data-app': 'files',
      'data-count': 3,
      'data-on': true,
      'aria-label': 'Close',
      role: 'button',
      tabIndex: 0,
      id: 'x',
      title: 'T',
      draggable: true,
    });
  });

  it('drops everything that could carry behaviour, and non-scalar values', () => {
    const out = filterAttributes({
      dangerouslySetInnerHTML: { __html: '<b>x</b>' },
      onClick: () => {},
      onclick: 'alert(1)',
      style: 'color:red',
      className: 'x',
      ref: {},
      href: 'x',
      'data-duyo-id': 'spoof',
      'data-': 'x',
      'data-obj': { a: 1 },
      'data-fn': () => {},
      'data-nil': null,
      tabIndex: 'abc',
      role: 4,
      __proto__: { 'data-inherited': 'x' },
    });
    expect(out).toEqual({});
  });

  it('answers a shared empty object for junk input', () => {
    expect(filterAttributes(undefined)).toBe(filterAttributes('x'));
    expect(filterAttributes([1])).toEqual({});
  });
});

describe('pyxis.Control', () => {
  it('draws attributes on its element and updates them', () => {
    const { container, root } = mount({
      kind: 'pyxis.Control',
      attributes: { 'data-shell-region': '', 'data-app': 'files', 'aria-label': 'Files', role: 'toolbar', tabIndex: 0 },
      classes: 'bar',
      content: 'hi',
    });
    const el = elementOf(container, root);
    expect(el.tagName).toBe('DIV');
    expect(el.getAttribute('data-shell-region')).toBe('');
    expect(el.getAttribute('data-app')).toBe('files');
    expect(el.getAttribute('aria-label')).toBe('Files');
    expect(el.getAttribute('role')).toBe('toolbar');
    expect(el.getAttribute('tabindex')).toBe('0');
    expect(el.className).toBe('bar');
    expect(el.textContent).toBe('hi');

    act(() => {
      root.set('attributes', { 'data-app': 'notes' });
    });
    expect(el.getAttribute('data-app')).toBe('notes');
    expect(el.hasAttribute('data-shell-region')).toBe(false);
  });

  it('cannot be made to inject markup, handlers, or spoof its identity', () => {
    const { container, root } = mount({
      kind: 'pyxis.Control',
      attributes: {
        dangerouslySetInnerHTML: { __html: '<i id="evil"></i>' },
        onClick: () => {
          throw new Error('injected');
        },
        'data-duyo-id': 'spoof',
        'data-duyo-kind': 'spoof',
        style: 'display:none',
      },
      content: 'safe',
    });
    const el = elementOf(container, root);
    expect(container.querySelector('#evil')).toBeNull();
    expect(el.textContent).toBe('safe');
    expect(el.getAttribute('data-duyo-kind')).toBe('pyxis.Control');
    expect(el.style.display).toBe('');
    fireEvent.click(el);
  });

  it('allows the wider tags and reports one outside them', () => {
    const { container, root, diagnostics } = mount({
      kind: 'pyxis.Control',
      components: [
        { kind: PC, tag: 'button', content: 'Go', name: 'b' },
        { kind: PC, tag: 'ul', components: [{ kind: PC, tag: 'li', content: 'one' }] },
        { kind: PC, tag: 'canvas', name: 'c' },
        { kind: PC, tag: 'form', name: 'f' },
        { kind: PC, tag: 'blink', name: 'bad' },
      ],
    });
    expect(container.querySelector('button')!.getAttribute('type')).toBe('button');
    expect(container.querySelector('ul > li')!.textContent).toBe('one');
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(container.querySelector('form')).not.toBeNull();
    expect(elementOf(container, root.$['c']!).tagName).toBe('CANVAS');
    expect(diagnostics.some((d) => d.includes('blink'))).toBe(true);
  });

  it('draws img (no children) and a, and refuses a javascript: link', () => {
    const { container, root } = mount({
      kind: 'pyxis.Control',
      components: [
        { kind: PC, tag: 'img', src: 'a.png', alt: 'A', content: 'ignored', name: 'img' },
        { kind: PC, tag: 'a', href: 'https://x.test/', target: '_blank', content: 'x', name: 'a' },
        { kind: PC, tag: 'a', href: ' java\nscript:alert(1)', content: 'y', name: 'evil' },
      ],
    });
    const img = elementOf(container, root.$['img']!) as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('a.png');
    expect(img.getAttribute('alt')).toBe('A');
    expect(img.childNodes.length).toBe(0);
    const a = elementOf(container, root.$['a']!);
    expect(a.getAttribute('href')).toBe('https://x.test/');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(elementOf(container, root.$['evil']!).hasAttribute('href')).toBe(false);
  });

  it('draws an input two-way, as duyo.Input does', () => {
    const seen: string[] = [];
    const { container, root } = mount(
      { kind: 'Test.Form', components: [{ kind: PC, tag: 'input', name: 'q', placeholder: 'Search', oninput: 'typed', onchange: 'done', attributes: { 'data-timezone-search': '' } }] },
      [
        {
          name: 'Test.Form',
          kind: 'pyxis.Control',
          typed(_sender: Component, event: ComponentEvent) {
            seen.push(`input:${event['value']}`);
          },
          done(_sender: Component, event: ComponentEvent) {
            seen.push(`change:${event['value']}`);
          },
        },
      ],
    );
    const input = container.querySelector<HTMLInputElement>('[data-timezone-search]')!;
    expect(input.placeholder).toBe('Search');
    fireEvent.change(input, { target: { value: 'par' } });
    expect(root.$['q']!.get('value')).toBe('par');
    expect(input.value).toBe('par');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(seen).toEqual(['input:par', 'change:par']);
    act(() => {
      root.$['q']!.set('value', 'rome');
    });
    expect(input.value).toBe('rome');
  });

  it('keeps ontap working', () => {
    const tap = vi.fn();
    const { container, root } = mount(
      { kind: 'Test.Tap', components: [{ kind: PC, name: 'b', tag: 'button', ontap: 'tapped', content: 'x' }] },
      [{ name: 'Test.Tap', kind: 'pyxis.Control', tapped: tap }],
    );
    fireEvent.click(elementOf(container, root.$['b']!));
    expect(tap).toHaveBeenCalledTimes(1);
  });
});

describe('pyxis.Control DOM events', () => {
  const log: Array<{ at: string; name: string; type?: unknown; key?: unknown; x?: unknown; y?: unknown; originator?: unknown }> = [];
  const note = (at: string, name: string, stop = false) =>
    function (this: Component, _sender: Component, event: ComponentEvent) {
      log.push({ at, name, type: event.type, key: event['key'], x: event['clientX'], y: event['clientY'], originator: event.originator });
      return stop;
    };

  /** outer (handlers) > inner (handlers) > leaf, plus a view method per event name. */
  const setup = (stopAtInner = false) => {
    log.length = 0;
    return mount(
      {
        kind: 'Test.Events',
        components: [
          {
            kind: PC,
            name: 'outer',
            onkeydown: 'outerKey',
            onpointerenter: 'outerEnter',
            oncontextmenu: 'outerMenu',
            onwheel: 'outerWheel',
            ondoubleclick: 'outerDouble',
            onfocus: 'outerFocus',
            components: [
              {
                kind: PC,
                name: 'inner',
                onkeydown: 'innerKey',
                onpointerenter: 'innerEnter',
                onpointerleave: 'innerLeave',
                onpointermove: 'innerMove',
                attributes: { tabIndex: 0 },
                components: [{ kind: PC, name: 'leaf', content: 'leaf', attributes: { tabIndex: 0 } }],
              },
            ],
          },
        ],
      },
      [
        {
          name: 'Test.Events',
          kind: 'pyxis.Control',
          outerKey: note('outer', 'keydown'),
          innerKey: note('inner', 'keydown', stopAtInner),
          outerEnter: note('outer', 'enter'),
          innerEnter: note('inner', 'enter'),
          innerLeave: note('inner', 'leave'),
          innerMove: note('inner', 'move'),
          outerMenu: note('outer', 'menu'),
          outerWheel: note('outer', 'wheel'),
          outerDouble: note('outer', 'dbl'),
          outerFocus: note('outer', 'focus'),
        },
      ],
    );
  };

  it('bubbles keydown from a descendant to each owner method once, carrying the payload', () => {
    const { container, root } = setup();
    const leaf = elementOf(container, root.$['leaf']!);
    fireEvent.keyDown(leaf, { key: 'k', code: 'KeyK', ctrlKey: true });
    expect(log.map((l) => `${l.at}:${l.name}`)).toEqual(['inner:keydown', 'outer:keydown']);
    expect(log[0]).toMatchObject({ type: 'keydown', key: 'k', originator: root.$['leaf'] });
  });

  it('stops bubbling when a handler returns truthy', () => {
    const { container, root } = setup(true);
    fireEvent.keyDown(elementOf(container, root.$['leaf']!), { key: 'x' });
    expect(log.map((l) => l.at)).toEqual(['inner']);
  });

  it('carries the native event, modifiers and a working preventDefault', () => {
    const seen: ComponentEvent[] = [];
    const { container, root } = mount(
      { kind: 'Test.Pd', components: [{ kind: PC, name: 'c', oncontextmenu: 'menu', onwheel: 'wheel' }] },
      [
        {
          name: 'Test.Pd',
          kind: 'pyxis.Control',
          menu(_s: Component, e: ComponentEvent) {
            seen.push(e);
            e['preventDefault']();
          },
          wheel(_s: Component, e: ComponentEvent) {
            seen.push(e);
          },
        },
      ],
    );
    const el = elementOf(container, root.$['c']!);
    const notPrevented = fireEvent.contextMenu(el, { clientX: 5, clientY: 6 });
    expect(notPrevented).toBe(false);
    expect(seen[0]!['nativeEvent']).toBeInstanceOf(Event);
    expect(seen[0]).toMatchObject({ type: 'contextmenu', clientX: 5, clientY: 6 });
    // Truthy-return semantics are Enyo's (stop bubbling only): an unprevented event stays default.
    expect(fireEvent.wheel(el, { deltaY: 40 })).toBe(true);
    expect(seen[1]).toMatchObject({ type: 'wheel', deltaY: 40 });
  });

  it('does not bubble pointerenter/leave, and sends them to the node itself', () => {
    const { container, root } = setup();
    // Entered from `outer`: React fires enter on `inner` only. A Duyo bubble would also reach outer.
    const outerEl = elementOf(container, root.$['outer']!);
    const innerEl = elementOf(container, root.$['inner']!);
    // jsdom's pointer events take no relatedTarget, so dispatch the mouse event React derives enter/leave from.
    const move = (type: string, target: HTMLElement, relatedTarget: HTMLElement) =>
      act(() => {
        target.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget }));
      });
    // React raises enter from the `out` event of the element being left.
    move('pointerout', outerEl, innerEl);
    expect(log.map((l) => `${l.at}:${l.name}`)).toEqual(['inner:enter']);
    expect(log[0]!.originator).toBe(root.$['inner']);
    move('pointerout', innerEl, outerEl);
    expect(log.map((l) => `${l.at}:${l.name}`)).toEqual(['inner:enter', 'inner:leave']);
  });

  it('maps pointermove (with coordinates), contextmenu, dblclick, wheel and focus', () => {
    const { container, root } = setup();
    const leaf = elementOf(container, root.$['leaf']!);
    fireEvent.pointerMove(leaf, { clientX: 10, clientY: 20 });
    fireEvent.contextMenu(leaf);
    fireEvent.doubleClick(leaf);
    fireEvent.wheel(leaf);
    fireEvent.focus(leaf);
    expect(log.map((l) => `${l.at}:${l.name}`)).toEqual([
      'inner:move',
      'outer:menu',
      'outer:dbl',
      'outer:wheel',
      'outer:focus',
    ]);
    expect(log[0]).toMatchObject({ x: 10, y: 20, type: 'pointermove' });
  });

  it('does not leak when the node is destroyed', () => {
    const { container, root } = setup();
    const leaf = elementOf(container, root.$['leaf']!);
    act(() => {
      root.$['outer']!.destroy();
    });
    expect(container.contains(leaf)).toBe(false);
  });
});

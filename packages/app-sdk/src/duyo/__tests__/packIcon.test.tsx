import { act, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { findIcon } from '../kinds/icon';
import { elementOf, mount } from './packHelpers';

afterEach(() => vi.restoreAllMocks());

describe('pyxis.Icon', () => {
  it('draws the named lucide icon as an svg with size, color and stroke width', () => {
    const { container, root } = mount({ kind: 'pyxis.Icon', icon: 'Trash2', size: 24, color: 'red', strokeWidth: 1.5 });
    const svg = elementOf(container, root);
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('class')).toContain('lucide-trash-2');
    expect(svg.getAttribute('width')).toBe('24');
    expect(svg.getAttribute('height')).toBe('24');
    expect(svg.getAttribute('stroke')).toBe('red');
    expect(svg.getAttribute('stroke-width')).toBe('1.5');
    expect(svg.getAttribute('data-duyo-kind')).toBe('pyxis.Icon');
  });

  it('defaults to 18px, 2 stroke, currentColor, and follows set()', () => {
    const { container, root } = mount({ kind: 'pyxis.Icon', icon: 'Search' });
    const svg = elementOf(container, root);
    expect(svg.getAttribute('width')).toBe('18');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('stroke-width')).toBe('2');
    act(() => {
      root.set('icon', 'Trash2');
      root.set('size', 30);
    });
    const next = elementOf(container, root);
    expect(next.getAttribute('class')).toContain('lucide-trash-2');
    expect(next.getAttribute('width')).toBe('30');
  });

  it('accepts the kebab-case spelling', () => {
    expect(findIcon('trash-2')).toBe(findIcon('Trash2'));
    expect(findIcon('Trash2')).toBeDefined();
    expect(findIcon('NoSuchIconAnywhere')).toBeUndefined();
    expect(findIcon('constructor')).toBeUndefined();
    expect(findIcon(42)).toBeUndefined();
  });

  it('draws nothing for an unknown name and warns once per name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container, root } = mount({ kind: 'pyxis.Icon', icon: 'NopeNotAnIcon' });
    expect(container.querySelector('svg')).toBeNull();
    act(() => {
      root.set('size', 20);
    });
    act(() => {
      root.set('icon', 'NopeNotAnIcon2');
    });
    act(() => {
      root.set('icon', 'NopeNotAnIcon');
    });
    expect(container.querySelector('svg')).toBeNull();
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.filter((m) => m.includes('"NopeNotAnIcon"'))).toHaveLength(1);
    expect(messages.filter((m) => m.includes('"NopeNotAnIcon2"'))).toHaveLength(1);
  });

  it('draws nothing and stays quiet for an empty name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = mount({ kind: 'pyxis.Icon' });
    expect(container.querySelector('svg')).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('carries attributes, classes, ontap and DOM events on the svg', () => {
    const taps: string[] = [];
    const keys: string[] = [];
    const { container, root } = mount(
      {
        kind: 'Test.IconHost',
        components: [{ kind: 'pyxis.Icon', name: 'i', icon: 'X', classes: 'close', attributes: { 'data-close': '', 'aria-label': 'Close' }, ontap: 'tap', onkeydown: 'key' }],
      },
      [
        {
          name: 'Test.IconHost',
          kind: 'pyxis.Control',
          tap() {
            taps.push('tap');
          },
          key(_s: unknown, e: { key: string }) {
            keys.push(e.key);
          },
        },
      ],
    );
    const svg = elementOf(container, root.$['i']!);
    expect(svg.getAttribute('data-close')).toBe('');
    expect(svg.getAttribute('aria-label')).toBe('Close');
    expect(svg.getAttribute('class')).toContain('close');
    fireEvent.click(svg);
    fireEvent.keyDown(svg, { key: 'Enter' });
    expect(taps).toEqual(['tap']);
    expect(keys).toEqual(['Enter']);
  });

  it('hides with showing=false', () => {
    const { container, root } = mount({ kind: 'pyxis.Icon', icon: 'X', showing: false });
    expect(elementOf(container, root).style.display).toBe('none');
  });
});

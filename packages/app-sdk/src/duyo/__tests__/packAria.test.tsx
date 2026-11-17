// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { kind } from '@duyojs/duyo';
import { mountDuyoApp, type DuyoApp } from '../mount';

// remochi's Button measures its label on a canvas, which jsdom has no 2d context for.
HTMLCanvasElement.prototype.getContext = (() => ({
  font: '',
  measureText: (text: string) => ({ width: text.length * 8 }),
})) as unknown as typeof HTMLCanvasElement.prototype.getContext;

kind({
  name: 'PackAriaTest.App',
  kind: 'duyo.Control',
  components: [
    {
      kind: 'remochi.Button',
      name: 'attrBtn',
      attributes: { 'aria-label': 'Close panel' },
    },
    {
      kind: 'remochi.Button',
      name: 'propBtn',
      ariaLabel: 'Star contact',
    },
    {
      kind: 'remochi.Toggle',
      name: 'toggleCtrl',
      attributes: { 'aria-label': 'High contrast' },
    },
    {
      kind: 'remochi.Slider',
      name: 'sliderCtrl',
      ariaLabel: 'Volume',
    },
  ],
});

let host: HTMLElement;
let app: DuyoApp | undefined;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

afterEach(() => {
  act(() => app?.unmount());
  app = undefined;
  host.remove();
});

describe('Duyo remochi aria-label forwarding', () => {
  it('forwards aria-label from attributes or ariaLabel onto inner button, toggle, and slider', async () => {
    await act(async () => {
      app = mountDuyoApp('PackAriaTest.App', { element: host });
    });

    const attrBtnWrapper = host.querySelector('[data-duyo-kind="remochi.Button"]')!;
    const buttons = [...host.querySelectorAll('button')];
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Close panel');
    expect(attrBtnWrapper.hasAttribute('aria-label')).toBe(false);
    expect(buttons[1]?.getAttribute('aria-label')).toBe('Star contact');

    const toggleEl = host.querySelector('[role="switch"]')!;
    expect(toggleEl.getAttribute('aria-label')).toBe('High contrast');
    expect(host.querySelector('[data-duyo-kind="remochi.Toggle"]')!.hasAttribute('aria-label')).toBe(false);

    const sliderEl = host.querySelector('[role="slider"]')!;
    expect(sliderEl.getAttribute('aria-label')).toBe('Volume');
    expect(host.querySelector('[data-duyo-kind="remochi.Slider"]')!.hasAttribute('aria-label')).toBe(false);

    // Reactive update via set('ariaLabel', ...) updates inner <button> without remounting.
    const firstBtn = buttons[1]!;
    act(() => {
      app!.root.$.propBtn!.set('ariaLabel', 'Unstar contact');
    });
    expect(host.querySelectorAll('button')[1]).toBe(firstBtn);
    expect(firstBtn.getAttribute('aria-label')).toBe('Unstar contact');
  });
});

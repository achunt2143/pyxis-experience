// Shared by the Terminal tests: a fake xterm, a mounted app, and DOM finders.
import { act, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { type DuyoApp } from '@pyxis/app-sdk/duyo';
import { mountDuyoApp as mountApp } from '@pyxis/app-sdk/duyo';
import { terminalPack } from '../pack';
import '../TerminalApp';

export { terms, FakeTerminal, FakeFit } from './fakeXterm';

/** remochi's Button measures its label on a canvas, which jsdom has no 2d context for. */
export function stubCanvas() {
  // Anything else a control draws with (remochi's Slider clears and strokes its track) is a no-op.
  const context = new Proxy(
    { font: '', measureText: (text: string) => ({ width: text.length * 8 }) } as Record<string, unknown>,
    { get: (target, key: string) => (key in target ? target[key] : () => undefined) }
  );
  HTMLCanvasElement.prototype.getContext = (() => context) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

export interface Mounted {
  app: DuyoApp;
  host: HTMLElement;
  unmount(): void;
}

/**
 * jsdom measures every element as 0 wide, which makes remochi's stack draw one pane at a time
 * (the Sessions pane collapses to a door and is not rendered). Measure the stack as a desktop window.
 */
function measureAsDesktop() {
  const real = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList?.contains('repanel')) return { x: 0, y: 0, left: 0, top: 0, right: 1024, bottom: 768, width: 1024, height: 768, toJSON() {} };
    return real.call(this);
  });
}

export async function mountTerminal(): Promise<Mounted> {
  measureAsDesktop();
  const host = document.createElement('div');
  document.body.appendChild(host);
  let app!: DuyoApp;
  await act(async () => {
    app = mountApp('Terminal.App', { defaultTheme: 'dark', element: host, packs: [terminalPack] });
  });
  await act(async () => {}); // the Open call's promise
  // remochi draws the stack's other panes a frame or two after the front one.
  for (let i = 0; i < 50 && !host.querySelector('.term-row'); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
  return {
    app,
    host,
    unmount: () => {
      act(() => app.unmount());
      host.remove();
    },
  };
}

export const $ = (host: HTMLElement, selector: string) => host.querySelector<HTMLElement>(selector);
export const $$ = (host: HTMLElement, selector: string) => [...host.querySelectorAll<HTMLElement>(selector)];

/** Session rows (the Start In rows share the class `term-row`, with `term-folder`). */
export const rows = (host: HTMLElement) => $$(host, '.term-row:not(.term-folder)');
export const folderRows = (host: HTMLElement) => $$(host, '.term-folder');
export const rowTitle = (row: HTMLElement) => $(row, '.term-row-title')?.textContent;
export const rowTitles = (host: HTMLElement) => rows(host).map(rowTitle);
/** The state word of a row (Idle, Running, Done, Exited 2, Bell). */
export const rowState = (row: HTMLElement) => $(row, '.term-row-state > span:last-child')?.textContent;
export const rowStates = (host: HTMLElement) => rows(host).map(rowState);
export const rowCaption = (row: HTMLElement) => $(row, '.term-row-caption')?.textContent;
/** The bell count's Badge: the text, or null while it is hidden. */
export const rowBells = (row: HTMLElement) => {
  const badge = $(row, '[data-duyo-kind="remochi.Badge"]');
  return !badge || badge.style.display === 'none' ? null : badge.textContent;
};
export const currentRow = (host: HTMLElement) => $(host, '.term-row.on');
export const summaryText = (host: HTMLElement) => $(host, '.mochi-subheader-content')?.textContent;
/** Header and Subheader of the session pane (the second panel; the first is Sessions). */
export const screenHeader = (host: HTMLElement) => $$(host, '.mochi-header-content')[1]?.textContent;
export const screenSubheader = (host: HTMLElement) => $$(host, '.mochi-subheader-content')[1]?.textContent;
export const keyButton = (host: HTMLElement, label: string) =>
  $$(host, '.term-key button').find((k) => k.textContent?.replace(/^\(|\)$/g, '') === label)!;
export const keyLabels = (host: HTMLElement) => $$(host, '.term-key button').map((k) => k.textContent?.replace(/^\(|\)$/g, ''));
export const buttonLabelled = (host: HTMLElement, label: string) => $(host, `button[aria-label="${label}"]`)!;
export const newButton = (host: HTMLElement) =>
  $$(host, 'button').find((b) => b.textContent?.includes('New Session'))!;
export const screens = (host: HTMLElement) => $(host, '.term-screens')!;

export const click = (el: HTMLElement) =>
  act(() => {
    fireEvent.click(el);
  });
export const settle = () => act(async () => {});


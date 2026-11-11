// Shared by the Terminal tests: a fake xterm, a mounted app, and DOM finders.
import { act, fireEvent } from '@testing-library/react';
import { type DuyoApp } from '@pyxis/app-sdk/duyo';
import { mountDuyoApp as mountApp } from '@pyxis/app-sdk/duyo';
import { terminalPack } from '../pack';
import '../TerminalApp';

export { terms, FakeTerminal, FakeFit } from './fakeXterm';

/** remochi's Button measures its label on a canvas, which jsdom has no 2d context for. */
export function stubCanvas() {
  HTMLCanvasElement.prototype.getContext = (() => ({
    font: '',
    measureText: (text: string) => ({ width: text.length * 8 }),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

export interface Mounted {
  app: DuyoApp;
  host: HTMLElement;
  unmount(): void;
}

export async function mountTerminal(): Promise<Mounted> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let app!: DuyoApp;
  await act(async () => {
    app = mountApp('Terminal.App', { defaultTheme: 'dark', element: host, packs: [terminalPack] });
  });
  await act(async () => {}); // the Open call's promise
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

export const tabs = (host: HTMLElement) => $$(host, '.term-tab');
export const tabTitles = (host: HTMLElement) => tabs(host).map((t) => t.textContent);
export const activeTab = (host: HTMLElement) => $(host, '.term-tab.active');
export const titled = (host: HTMLElement, title: string) => $(host, `[title="${title}"] button`)!;
export const keyButton = (host: HTMLElement, label: string) =>
  $$(host, '.term-key').find((k) => k.textContent === label)!;
export const screenFor = (host: HTMLElement, tabId: string) => $(host, `[aria-label="terminal-tab-${tabId}"]`)!.parentElement!;

export const click = (el: HTMLElement) =>
  act(() => {
    fireEvent.click(el);
  });
export const settle = () => act(async () => {});


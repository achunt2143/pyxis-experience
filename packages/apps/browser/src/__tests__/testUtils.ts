// Shared by the Browser tests: a mounted app over a fake Echo, and DOM finders.
import { act, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { echoClient } from '@pyxis/app-sdk';
import type { DuyoApp } from '@pyxis/app-sdk/duyo';
import { mountDuyoApp as mountApp } from '@pyxis/app-sdk/duyo';
import { browserPack } from '../pack';
import '../BrowserApp';

/** remochi's Button measures its label on a canvas, which jsdom has no 2d context for. */
export function stubCanvas() {
  HTMLCanvasElement.prototype.getContext = (() => ({
    font: '',
    measureText: (text: string) => ({ width: text.length * 8 }),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

/** What the fake Echo does: every call, whether the browser opens, what the network says. */
export const echo = {
  calls: [] as Array<{ service: string; method: string; args: Record<string, unknown> }>,
  opens: true,
  network: undefined as { connected: boolean; ssid: string; type: string } | undefined,
};

export function fakeEcho() {
  echo.calls = [];
  echo.opens = true;
  echo.network = undefined;
  vi.spyOn(echoClient, 'callMethod').mockImplementation(async (service, _iface, method, args = {}) => {
    echo.calls.push({ service, method, args });
    if (method === 'OpenExternalBrowser') return echo.opens ? { sessionId: 's1', appId: 'browser', url: args['url'] } : undefined;
    if (method === 'getStatus') return echo.network;
    return undefined;
  });
}

export const opened = () => echo.calls.filter((c) => c.method === 'OpenExternalBrowser').map((c) => c.args['url']);

export interface Mounted {
  app: DuyoApp;
  host: HTMLElement;
  unmount(): void;
}

export async function mountBrowser(): Promise<Mounted> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let app!: DuyoApp;
  await act(async () => {
    app = mountApp('Browser.App', { element: host, packs: [browserPack] });
  });
  await act(async () => {});
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

export const addressBar = (host: HTMLElement) => $(host, 'input[aria-label="address bar"]') as HTMLInputElement;
export const titled = (host: HTMLElement, title: string) => $(host, `[title="${title}"]`)!;
export const titledButton = (host: HTMLElement, title: string) => $(host, `[title="${title}"] button`)!;
/** Hidden things (`showing: false` is display:none) stay in the DOM, so look at what is visible. */
export function visible(el: HTMLElement | null): boolean {
  for (let e = el; e; e = e.parentElement) if (e.style.display === 'none') return false;
  return !!el;
}
/** The text a user can read: everything under a display:none node is left out. */
export function shownText(host: HTMLElement): string {
  const walk = (n: Node): string => {
    if (n.nodeType === Node.TEXT_NODE) return n.textContent ?? '';
    const el = n as HTMLElement;
    if (el.style?.display === 'none') return '';
    return [...n.childNodes].map(walk).join('');
  };
  return walk(host);
}
export const buttonText = (host: HTMLElement, text: string) =>
  $$(host, 'button').find((b) => b.textContent?.includes(text) && visible(b));
export const pill = (host: HTMLElement, label: string) => $$(host, '.br-pill').find((p) => p.textContent?.includes(label))!;
export const tiles = (host: HTMLElement) => $$(host, '.br-tile');
export const rows = (host: HTMLElement) => $$(host, '.br-row');
export const suggestions = (host: HTMLElement) => $$(host, '.br-suggestion');

export const type = (el: HTMLInputElement, value: string) =>
  act(() => {
    fireEvent.change(el, { target: { value } });
  });
export const focus = (el: HTMLElement) =>
  act(() => {
    fireEvent.focus(el);
  });
export const click = (el: HTMLElement) =>
  act(() => {
    fireEvent.click(el);
  });
/** Enter in the address bar: the form submits. */
export const submit = (el: HTMLElement) =>
  act(() => {
    fireEvent.submit(el.closest('form')!);
  });
export const settle = () => act(async () => {});

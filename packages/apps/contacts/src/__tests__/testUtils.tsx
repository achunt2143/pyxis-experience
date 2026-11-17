// Shared by the Contacts tests: a mounted app over an in-memory store, and DOM finders.
import { act, fireEvent } from '@testing-library/react';
import { mountDuyoApp, type DuyoApp } from '@pyxis/app-sdk/duyo';
import { islandPack } from '../islands';
import type { Contact } from '../model';
import '../ContactsApp';

/** remochi's Button measures its label on a canvas, which jsdom has no 2d context for. */
export function stubCanvas() {
  HTMLCanvasElement.prototype.getContext = (() => ({
    font: '',
    measureText: (text: string) => ({ width: text.length * 8 }),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

export const storage = {
  doc: { contacts: [] as Contact[] },
  saves: [] as Array<{ contacts: Contact[] }>,
  /** While set, saveAppData answers false (the store refused the write). */
  fail: false,
};

export function seedContact(i: number, over: Partial<Contact> = {}): Contact {
  const names = ['Ada Lovelace', 'Bob Brown', 'Cleo Carter', 'Dan Dunn', 'Eve Ellis', 'Fay Fox', '9 Lives'];
  const cats = ['Personal', 'Work', 'Family', 'Other'];
  return {
    id: `c${i}`,
    name: names[i % names.length]!,
    email: `p${i}@example.com`,
    phone: `555-000${i}`,
    starred: false,
    category: cats[i % 4],
    company: '',
    jobTitle: '',
    address: '',
    birthday: '',
    notes: '',
    updatedAt: 1_700_000_000_000 + i,
    ...over,
  };
}

export interface Mounted {
  app: DuyoApp;
  host: HTMLElement;
  unmount(): void;
}

export async function mountContacts(contacts: Contact[]): Promise<Mounted> {
  storage.doc = { contacts: structuredClone(contacts) };
  storage.saves = [];
  storage.fail = false;
  const host = document.createElement('div');
  document.body.appendChild(host);
  let app!: DuyoApp;
  await act(async () => {
    app = mountDuyoApp('Contacts.App', { element: host, packs: [islandPack()] });
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

/** The directory's rows (remochi Items), by their drawn titles. */
export const rowTitles = (host: HTMLElement) =>
  $$(host, '.contacts-scroll [data-mochi-item], .contacts-scroll .mochi-item').map((r) => r.textContent ?? '');
export const searchInput = (host: HTMLElement) => $(host, 'input[placeholder="Search contacts…"]') as HTMLInputElement;
export const nameInput = (host: HTMLElement) => $(host, 'input[placeholder="Contact Name"]') as HTMLInputElement;
export const titled = (host: HTMLElement, title: string) => $(host, `[title="${title}"] button`)!;
export const pill = (host: HTMLElement, label: string) =>
  $$(host, '.contacts-pill').find((p) => p.textContent?.includes(label))!;

export const type = (el: HTMLInputElement | HTMLTextAreaElement, value: string) =>
  act(() => {
    fireEvent.change(el, { target: { value } });
  });
export const click = (el: HTMLElement) =>
  act(() => {
    fireEvent.click(el);
  });

// Shared by the Notes tests: a mounted app over an in-memory store, and DOM finders.
import { act, fireEvent } from '@testing-library/react';
import { mountDuyoApp, type DuyoApp } from '@pyxis/app-sdk/duyo';
import type { Note } from '../model';
import '../NotesApp';

/** remochi's Button measures its label on a canvas, which jsdom has no 2d context for. */
export function stubCanvas() {
  HTMLCanvasElement.prototype.getContext = (() => ({
    font: '',
    measureText: (text: string) => ({ width: text.length * 8 }),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

export const storage = {
  /** What `loadAppData` answers: a notes document (the shape on disk). */
  doc: { notes: [] as Note[] },
  /** Every document `saveAppData` was given, in order. */
  saves: [] as Array<{ notes: Note[] }>,
  /** Boolean returned by mocked `saveAppData`. */
  saveResult: true,
};

export function seedNote(i: number, over: Partial<Note> = {}): Note {
  const categories = ['Personal', 'Work', 'Ideas', 'General'];
  return {
    id: `n${i}`,
    title: `Note number ${i}`,
    body: `# Heading ${i}\n${'lorem ipsum dolor sit amet '.repeat(12)}`,
    pinned: false,
    category: categories[i % 4],
    updatedAt: Date.now() - i * 60_000,
    ...over,
  };
}

export interface Mounted {
  app: DuyoApp;
  host: HTMLElement;
  unmount(): void;
}

/** Mounts Notes over `notes` and lets the load land. */
export async function mountNotes(notes: Note[]): Promise<Mounted> {
  storage.doc = { notes: structuredClone(notes) };
  storage.saves = [];
  storage.saveResult = true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  let app!: DuyoApp;
  await act(async () => {
    app = mountDuyoApp('Notes.App', { element: host });
  });
  await act(async () => {}); // the load's promise
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

export const rows = (host: HTMLElement) => $$(host, '.notes-row');
export const rowTitles = (host: HTMLElement) => rows(host).map((r) => $(r, '.notes-title')!.textContent);
export const titleInput = (host: HTMLElement) => $(host, 'input[aria-label="note title"]') as HTMLInputElement;
export const bodyArea = (host: HTMLElement) => $(host, 'textarea') as HTMLTextAreaElement;
export const searchInput = (host: HTMLElement) => $(host, 'input[placeholder="Search notes…"]') as HTMLInputElement;
export const pill = (host: HTMLElement, label: string) =>
  $$(host, '.notes-pill').find((p) => p.textContent?.startsWith(label))!;
export const titled = (host: HTMLElement, title: string) => $(host, `[title="${title}"] button`)!;
export const buttonText = (host: HTMLElement, text: string) =>
  $$(host, 'button').find((b) => b.textContent?.includes(text))!;

export const type = (el: HTMLInputElement | HTMLTextAreaElement, value: string) =>
  act(() => {
    fireEvent.change(el, { target: { value } });
  });
export const click = (el: HTMLElement) =>
  act(() => {
    fireEvent.click(el);
  });

// Shared by the Tasks tests: a mounted app over an in-memory store, and DOM finders.
import { act, fireEvent } from '@testing-library/react';
import { mountDuyoApp, type DuyoApp } from '@pyxis/app-sdk/duyo';
import { islandPack } from '../islands';
import type { Task } from '../model';
import '../TasksApp';

/** remochi's Button measures its label on a canvas, which jsdom has no 2d context for. */
export function stubCanvas() {
  HTMLCanvasElement.prototype.getContext = (() => ({
    font: '',
    measureText: (text: string) => ({ width: text.length * 8 }),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

export const storage = {
  doc: { tasks: [] as Task[] },
  saves: [] as Array<{ tasks: Task[] }>,
  /** While set, saveAppData answers false (the store refused the write). */
  fail: false,
};

export function seedTask(i: number, over: Partial<Task> = {}): Task {
  return {
    id: `t${i}`,
    text: `Task number ${i}`,
    done: false,
    priority: 'none',
    category: 'Inbox',
    createdAt: 1_700_000_000_000 + i * 1000,
    ...over,
  };
}

export interface Mounted {
  app: DuyoApp;
  host: HTMLElement;
  unmount(): void;
}

export async function mountTasks(tasks: Task[]): Promise<Mounted> {
  storage.doc = { tasks: structuredClone(tasks) };
  storage.saves = [];
  storage.fail = false;
  const host = document.createElement('div');
  document.body.appendChild(host);
  let app!: DuyoApp;
  await act(async () => {
    app = mountDuyoApp('Tasks.App', { element: host, packs: [islandPack()] });
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

export const rows = (host: HTMLElement) => $$(host, '.tasks-row');
export const rowTexts = (host: HTMLElement) => rows(host).map((r) => $(r, '.tasks-row-text')!.textContent);
export const draftInput = (host: HTMLElement) =>
  $(host, 'input[placeholder="Add a task and press Enter…"]') as HTMLInputElement;
export const nameInput = (host: HTMLElement) => $(host, 'input[placeholder="Task name"]') as HTMLInputElement;
export const notesArea = (host: HTMLElement) => $(host, 'textarea') as HTMLTextAreaElement;
export const buttonText = (host: HTMLElement, text: string) =>
  $$(host, 'button').find((b) => b.textContent?.includes(text))!;
/** A sidebar entry by its title. */
export const listEntry = (host: HTMLElement, label: string) =>
  $$(host, '[data-duyo-kind="Tasks.ViewRow"]').find((r) => r.textContent?.includes(label))!;
export const chip = (host: HTMLElement, label: string) =>
  $$(host, '[data-duyo-kind="Tasks.Pill"]').find((p) => p.textContent === label)!;

export const type = (el: HTMLInputElement | HTMLTextAreaElement, value: string) =>
  act(() => {
    fireEvent.change(el, { target: { value } });
  });
export const click = (el: HTMLElement) =>
  act(() => {
    fireEvent.click(el);
  });

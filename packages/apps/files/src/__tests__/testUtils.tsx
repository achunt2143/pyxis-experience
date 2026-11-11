// Shared by the Files tests: a mounted app over a fake filesystem service, and DOM finders.
import { act, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { echoClient } from '@pyxis/app-sdk';
import { mountDuyoApp, type DuyoApp } from '@pyxis/app-sdk/duyo';
import { islandPack } from '../islands';
import type { FsEntry } from '../model';
import '../FilesApp';

/** remochi's Button measures its label on a canvas, which jsdom has no 2d context for. */
export function stubCanvas() {
  HTMLCanvasElement.prototype.getContext = (() => ({
    font: '',
    measureText: (text: string) => ({ width: text.length * 8 }),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

export const dir = (path: string, size = 0): FsEntry => entry(path, { isDirectory: true, isFile: false, size });
export const file = (path: string, size = 100): FsEntry => entry(path, { size });
function entry(path: string, over: Partial<FsEntry>): FsEntry {
  return {
    name: path.split('/').pop()!,
    path,
    isFile: true,
    isDirectory: false,
    isSymlink: false,
    size: 0,
    ...over,
  };
}

export interface Call {
  method: string;
  args: Record<string, unknown>;
}

/** The fake service: listings by path, file contents by path, every call recorded. */
export const fake = {
  dirs: {} as Record<string, FsEntry[]>,
  files: {} as Record<string, string>,
  calls: [] as Call[],
  /** Methods that answer `{ error }`, by method name. */
  failing: {} as Record<string, string>,
  /** Resolves a readDirectory later: path -> release function. */
  held: {} as Record<string, () => void>,
  hold: new Set<string>(),
};

export function resetFake(dirs: Record<string, FsEntry[]>) {
  fake.dirs = structuredClone(dirs);
  fake.files = {};
  fake.calls = [];
  fake.failing = {};
  fake.held = {};
  fake.hold = new Set();
}

export const callsOf = (method: string) => fake.calls.filter((c) => c.method === method);

export function installFake() {
  vi.spyOn(echoClient, 'callMethod').mockImplementation(async (service, iface, method, args = {}) => {
    if (service !== 'filesystem' || iface !== 'org.geckoOS.filesystem') throw new Error(`unexpected call ${service}.${method}`);
    fake.calls.push({ method, args });
    if (fake.failing[method]) return { error: fake.failing[method] };
    const path = String(args['path'] ?? '');
    switch (method) {
      case 'readDirectory':
        if (fake.hold.has(path)) await new Promise<void>((resolve) => (fake.held[path] = resolve));
        return fake.dirs[path] ? { entries: structuredClone(fake.dirs[path]) } : { error: `No such directory: ${path}` };
      case 'stat':
        return { size: 1234, permissions: 'rw-r--r--', modified: 1_700_000_000 };
      case 'readFile':
        return { content: fake.files[path] ?? '' };
      case 'createDirectory': {
        const parent = path.slice(0, path.lastIndexOf('/'));
        fake.dirs[parent]?.push(dir(path));
        return { success: true };
      }
      case 'move': {
        const from = String(args['source']);
        const to = String(args['destination']);
        const parent = from.slice(0, from.lastIndexOf('/'));
        fake.dirs[parent] = (fake.dirs[parent] ?? []).map((e) =>
          e.path === from ? { ...e, path: to, name: to.split('/').pop()! } : e
        );
        return { success: true };
      }
      case 'deleteFile':
      case 'deleteDirectory': {
        const parent = path.slice(0, path.lastIndexOf('/'));
        fake.dirs[parent] = (fake.dirs[parent] ?? []).filter((e) => e.path !== path);
        return { success: true };
      }
      default:
        return { error: `unknown method ${method}` };
    }
  });
}

export interface Mounted {
  app: DuyoApp;
  host: HTMLElement;
  unmount(): void;
}

/** Mounts Files over the fake filesystem and lets the first listing land. */
export async function mountFiles(): Promise<Mounted> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let app!: DuyoApp;
  await act(async () => {
    app = mountDuyoApp('Files.App', { element: host, packs: [islandPack()] });
  });
  await flush();
  return {
    app,
    host,
    unmount: () => {
      act(() => app.unmount());
      host.remove();
    },
  };
}

export const flush = () => act(async () => {});

export const $ = (host: ParentNode, selector: string) => host.querySelector<HTMLElement>(selector);
export const $$ = (host: ParentNode, selector: string) => [...host.querySelectorAll<HTMLElement>(selector)];

export const entryNames = (host: HTMLElement) => $$(host, '.files-entry-name').map((e) => e.textContent);
export const entryRow = (host: HTMLElement, path: string) => $(host, `.files-entry[data-path="${path}"]`)!;
export const crumbs = (host: HTMLElement) => $$(host, '.files-crumb').map((e) => e.textContent);
export const status = (host: HTMLElement) =>
  $$(host, 'span').find((s) => /^\d+ items?/.test(s.textContent ?? ''))?.textContent ?? '';
export const buttonText = (host: ParentNode, text: string) =>
  ([...host.querySelectorAll('button')] as HTMLButtonElement[]).find(
    // remochi 0.4 draws a button's "( )" caps as text.
    (b) => b.textContent?.trim().replace(/^\(\s*|\s*\)$/g, '') === text
  );
export const searchInput = (host: HTMLElement) => $(host, 'input[placeholder="Search…"]') as HTMLInputElement;
/** remochi draws every Dialog, closed ones too (hidden by `aria-hidden`); this is the open one. */
export const openDialog = (title?: string): HTMLElement | undefined =>
  $$(document.body, '[role="dialog"]').find(
    (d) => d.parentElement?.getAttribute('aria-hidden') === 'false' && (!title || d.textContent?.includes(title))
  );
export const dialogButton = (text: string, title?: string) => {
  const dialog = openDialog(title);
  return dialog ? buttonText(dialog.parentElement!, text) : undefined;
};
/** The name field of the open dialog, or null when none is open. */
export const nameInput = (placeholder: string) =>
  openDialog()?.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`) ?? null;

export const click = (el: HTMLElement | null | undefined) =>
  act(() => {
    fireEvent.click(el!);
  });
export const rightClick = (el: HTMLElement) =>
  act(() => {
    fireEvent.contextMenu(el);
  });
export const type = (el: HTMLInputElement, value: string) =>
  act(() => {
    fireEvent.change(el, { target: { value } });
  });
export const press = (el: HTMLElement, key: string) =>
  act(() => {
    fireEvent.keyDown(el, { key });
  });

/** Whether an element is drawn: no ancestor is `display: none` (a `showing: false` Duyo control). */
export function shown(el: HTMLElement | null | undefined): boolean {
  for (let node: HTMLElement | null | undefined = el; node; node = node.parentElement) {
    if (node.style.display === 'none') return false;
  }
  return !!el;
}

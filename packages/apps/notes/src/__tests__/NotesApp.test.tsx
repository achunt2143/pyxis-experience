// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Note } from '../model';
import {
  $,
  $$,
  bodyArea,
  buttonText,
  click,
  mountNotes,
  pill,
  rowTitles,
  rows,
  searchInput,
  seedNote,
  storage,
  stubCanvas,
  titled,
  titleInput,
  type,
  type Mounted,
} from './testUtils';

// The store the app reads and writes, and the theme hook (it would start the Echo clock).
vi.mock('../../../../app-sdk/src/appStorage', () => ({
  loadAppData: async () => structuredClone(storage.doc),
  saveAppData: async (_store: string, data: { notes: Note[] }) => {
    storage.saves.push(structuredClone(data));
    return true;
  },
}));
vi.mock('../../../../app-sdk/src/usePyxisTheme', () => ({ usePyxisTheme: () => 'light' }));

stubCanvas();

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

let m: Mounted | undefined;
afterEach(() => {
  m?.unmount();
  m = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// n0 (Personal, newest), n1 Work, n2 Ideas, n3 General, n4 Personal, pinned n4.
const five = () => [0, 1, 2, 3, 4].map((i) => seedNote(i, i === 4 ? { pinned: true } : {}));

describe('Notes: loading', () => {
  it('shows the stored notes, pinned first then newest, with the first one open', async () => {
    m = await mountNotes(five());
    expect(rowTitles(m.host)).toEqual([
      'Note number 4', // pinned
      'Note number 0',
      'Note number 1',
      'Note number 2',
      'Note number 3',
    ]);
    // The first stored note (not the first row) is selected, and the row says so.
    expect(titleInput(m.host).value).toBe('Note number 0');
    expect(rows(m.host).filter((r) => r.classList.contains('selected')).map((r) => $(r, '.notes-title')!.textContent)).toEqual([
      'Note number 0',
    ]);
    expect(bodyArea(m.host).value).toContain('# Heading 0');
    expect($(m.host, '[title="Pin Note to Top"]')).toBeTruthy();
  });

  it('draws every icon it names (pyxis.Icon warns once for a name lucide lacks, and draws nothing)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    m = await mountNotes(five());
    expect(warn.mock.calls.filter(([text]) => String(text).startsWith('pyxis.Icon'))).toEqual([]);
    const svgs = $$(m.host, 'svg[data-duyo-kind="pyxis.Icon"]');
    // Plus, Search, 6 pill pins, 5 row pins, FileText x2, 4 action icons, the saved tick.
    expect(svgs.length).toBe(20);
  });

  it('counts per pill, the list heading and its badge', async () => {
    m = await mountNotes(five());
    const counts = Object.fromEntries(
      $$(m.host, '.notes-pill').map((p) => [p.children[p.children.length - 2]!.textContent, p.lastElementChild!.textContent])
    );
    expect(counts).toEqual({ All: '5', Pinned: '1', Personal: '2', Work: '1', Ideas: '1', General: '1' });
    expect(m.host.textContent).toContain('All Notes');
  });

  it('with nothing stored: an empty list and the editor placeholder', async () => {
    m = await mountNotes([]);
    expect(rows(m.host)).toEqual([]);
    expect(m.host.textContent).toContain('No notes in this category.');
    expect(m.host.textContent).toContain('Select a note from the left, or create a new one.');
    expect(titleInput(m.host).closest('[style*="display: none"]')).toBeTruthy();
  });

  it('shows a spinner until the load lands', async () => {
    storage.doc = { notes: [seedNote(0)] };
    const { mountDuyoApp } = await import('@pyxis/app-sdk/duyo');
    const host = document.createElement('div');
    document.body.appendChild(host);
    let app!: ReturnType<typeof mountDuyoApp>;
    act(() => {
      app = mountDuyoApp('Notes.App', { element: host });
    });
    expect(app.root.$['list']!.get('loaded')).toBe(false);
    await act(async () => {});
    expect(app.root.$['list']!.get('loaded')).toBe(true);
    act(() => app.unmount());
    host.remove();
  });
});

describe('Notes: creating', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  it('adds an untitled General note on top, opens it, and saves after 500 ms', async () => {
    m = await mountNotes(five());
    click(titled(m.host, 'New Note'));
    expect(rows(m.host).length).toBe(6);
    expect(titleInput(m.host).value).toBe('Untitled note');
    expect(rows(m.host).find((r) => r.classList.contains('selected'))!.textContent).toContain('Untitled note');
    expect(m.host.textContent).toContain('Saving…');
    await advance(499);
    expect(storage.saves).toHaveLength(0);
    await advance(1);
    expect(storage.saves).toHaveLength(1);
    expect(storage.saves[0]!.notes).toHaveLength(6);
    const saved = storage.saves[0]!.notes[0]!;
    expect(saved).toMatchObject({ title: 'Untitled note', body: '', pinned: false, category: 'General' });
    expect(Object.keys(saved).sort()).toEqual(['body', 'category', 'id', 'pinned', 'title', 'updatedAt']);
    expect(m.host.textContent).toContain('Saved to Pyxis PIM storage');
  });

  it('files the new note under the active category pill (not All or Pinned)', async () => {
    m = await mountNotes(five());
    click(pill(m.host, 'Work'));
    click(titled(m.host, 'New Note'));
    expect(m.app.root.$['editor']!.get('note')).toMatchObject({ category: 'Work' });
    click(pill(m.host, 'Pinned'));
    click(titled(m.host, 'New Note'));
    expect(m.app.root.$['editor']!.get('note')).toMatchObject({ category: 'General' });
  });
});

describe('Notes: editing and autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  it('autosaves a title edit 500 ms after the last keystroke, as one save', async () => {
    m = await mountNotes(five());
    type(titleInput(m.host), 'Groceries');
    await advance(300);
    type(titleInput(m.host), 'Groceries list');
    await advance(499);
    expect(storage.saves).toHaveLength(0);
    expect(m.host.textContent).toContain('Saving…');
    await advance(1);
    expect(storage.saves).toHaveLength(1);
    expect(storage.saves[0]!.notes.find((n) => n.id === 'n0')!.title).toBe('Groceries list');
    expect(m.host.textContent).toContain('Saved to Pyxis PIM storage');
    // The list row follows the field at once.
    expect(rowTitles(m.host)).toContain('Groceries list');
  });

  it('autosaves a body edit, updates the stats and preview, and moves the note to the top', async () => {
    m = await mountNotes(five());
    type(bodyArea(m.host), 'one two three');
    expect(bodyArea(m.host).value).toBe('one two three');
    expect(m.host.textContent).toContain('3 words · 13 chars');
    expect(rowTitles(m.host)[1]).toBe('Note number 0'); // pinned n4 stays first; n0 newest after it
    expect(rows(m.host).find((r) => r.classList.contains('selected'))!.textContent).toContain('one two three');
    await advance(500);
    expect(storage.saves.at(-1)!.notes.find((n) => n.id === 'n0')!.body).toBe('one two three');
  });

  it('says "1 word" for one, and counts an empty body as 0 words', async () => {
    m = await mountNotes(five());
    type(bodyArea(m.host), 'hello');
    expect(m.host.textContent).toContain('1 word · 5 chars');
    type(bodyArea(m.host), '');
    expect(m.host.textContent).toContain('0 words · 0 chars');
  });

  it('changes the category from the dropdown', async () => {
    m = await mountNotes(five());
    const dropdown = m.app.root.$['editor']!.$['category']!;
    act(() => {
      dropdown.set('value', 'Ideas');
      dropdown.doChange({ value: 'Ideas' });
    });
    await advance(500);
    expect(storage.saves.at(-1)!.notes.find((n) => n.id === 'n0')!.category).toBe('Ideas');
    expect(m.app.root.$['editor']!.get('note')).toMatchObject({ category: 'Ideas' });
  });

  it('saves what is pending when the app goes away, and on beforeunload', async () => {
    m = await mountNotes(five());
    type(titleInput(m.host), 'About to close');
    expect(storage.saves).toHaveLength(0);
    act(() => {
      window.dispatchEvent(new Event('beforeunload'));
    });
    expect(storage.saves).toHaveLength(1);
    expect(storage.saves[0]!.notes.find((n) => n.id === 'n0')!.title).toBe('About to close');

    type(titleInput(m.host), 'And again');
    m.unmount();
    m = undefined;
    expect(storage.saves).toHaveLength(2);
    expect(storage.saves[1]!.notes.find((n) => n.id === 'n0')!.title).toBe('And again');
    // The pending timer died with it: no third save.
    await advance(1000);
    expect(storage.saves).toHaveLength(2);
  });
});

describe('Notes: pin', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  it('pins the open note: it jumps ahead, the pill counts it, and it is saved', async () => {
    m = await mountNotes(five());
    click(titled(m.host, 'Pin Note to Top'));
    expect($(m.host, '[title="Unpin Note"]')).toBeTruthy();
    expect(rowTitles(m.host).slice(0, 2).sort()).toEqual(['Note number 0', 'Note number 4']);
    expect(pill(m.host, 'Pinned').lastElementChild!.textContent).toBe('2');
    await advance(500);
    expect(storage.saves.at(-1)!.notes.filter((n) => n.pinned).map((n) => n.id).sort()).toEqual(['n0', 'n4']);

    click(titled(m.host, 'Unpin Note'));
    expect(pill(m.host, 'Pinned').lastElementChild!.textContent).toBe('1');
  });
});

describe('Notes: filtering', () => {
  it('filters by category pill and by Pinned', async () => {
    m = await mountNotes(five());
    click(pill(m.host, 'Personal'));
    expect(rowTitles(m.host).sort()).toEqual(['Note number 0', 'Note number 4']);
    expect(m.host.textContent).toContain('Personal Notes');
    click(pill(m.host, 'Pinned'));
    expect(rowTitles(m.host)).toEqual(['Note number 4']);
    click(pill(m.host, 'Ideas'));
    expect(rowTitles(m.host)).toEqual(['Note number 2']);
    click(pill(m.host, 'All'));
    expect(rows(m.host)).toHaveLength(5);
  });

  it('searches titles and bodies, case-insensitively, within the category', async () => {
    const notes = five();
    notes[2]!.body = 'The quick Brown fox';
    m = await mountNotes(notes);
    type(searchInput(m.host), 'number 3');
    expect(rowTitles(m.host)).toEqual(['Note number 3']);
    type(searchInput(m.host), 'BROWN');
    expect(rowTitles(m.host)).toEqual(['Note number 2']);
    type(searchInput(m.host), '  ');
    expect(rows(m.host)).toHaveLength(5);

    click(pill(m.host, 'Work'));
    type(searchInput(m.host), 'brown');
    expect(rows(m.host)).toHaveLength(0); // n2 is Ideas
    expect(m.host.textContent).toContain('No notes match your search.');
    type(searchInput(m.host), '');
    expect(rowTitles(m.host)).toEqual(['Note number 1']);
  });
});

describe('Notes: opening and deleting', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  it('clicking a row opens that note', async () => {
    m = await mountNotes(five());
    click(rows(m.host).find((r) => r.textContent!.includes('Note number 3'))!);
    expect(titleInput(m.host).value).toBe('Note number 3');
    expect(rows(m.host).find((r) => r.classList.contains('selected'))!.textContent).toContain('Note number 3');
  });

  it('asks inline, can be cancelled, and deletes on Confirm', async () => {
    m = await mountNotes(five());
    expect(buttonText(m.host, 'Confirm')!.closest('[style*="display: none"]')).toBeTruthy();
    click(titled(m.host, 'Delete Note'));
    expect($(m.host, '[title="Delete Note"]')!.style.display).toBe('none');
    click(buttonText(m.host, 'Cancel'));
    expect($(m.host, '[title="Delete Note"]')!.style.display).not.toBe('none');
    expect(rows(m.host)).toHaveLength(5);

    click(titled(m.host, 'Delete Note'));
    click(buttonText(m.host, 'Confirm'));
    expect(rowTitles(m.host)).not.toContain('Note number 0');
    expect(rows(m.host)).toHaveLength(4);
    // Nothing is open any more.
    expect(m.host.textContent).toContain('Select a note from the left, or create a new one.');
    expect(titleInput(m.host).closest('[style*="display: none"]')).toBeTruthy();
    await advance(500);
    expect(storage.saves.at(-1)!.notes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3', 'n4']);
  });

  it('opening another note drops a half-made delete', async () => {
    m = await mountNotes(five());
    click(titled(m.host, 'Delete Note'));
    click(rows(m.host).find((r) => r.textContent!.includes('Note number 3'))!);
    expect($(m.host, '[title="Delete Note"]')!.style.display).not.toBe('none');
  });
});

describe('Notes: copy and export', () => {
  it('copies "title, blank line, body" and shows a tick for two seconds', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    m = await mountNotes([seedNote(0, { title: 'T', body: 'B' })]);
    click(titled(m.host, 'Copy Note Content'));
    expect(writeText).toHaveBeenCalledWith('T\n\nB');
    expect(m.app.root.$['editor']!.$['copyIcon']!.get('icon')).toBe('Check');
    await advance(2000);
    expect(m.app.root.$['editor']!.$['copyIcon']!.get('icon')).toBe('Copy');
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('exports the note as markdown named after its title', async () => {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      blobs.push(b as Blob);
      return 'blob:x';
    });
    URL.revokeObjectURL = vi.fn();
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    m = await mountNotes([seedNote(0, { title: 'My: Note!', body: 'text' })]);
    click(titled(m.host, 'Export Note as Markdown (.md)'));
    expect(downloads).toEqual(['my__note_.md']);
    expect(await blobs[0]!.text()).toBe('# My: Note!\n\ntext');
  });
});

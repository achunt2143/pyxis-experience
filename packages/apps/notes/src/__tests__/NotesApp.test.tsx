// @vitest-environment jsdom
import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { snippetOf, type Note } from '../model';
import {
  $,
  $$,
  bodyArea,
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
    return storage.saveResult;
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
    // AlertCircle (save banner), Plus, Search, X (clear search), 6 pill pins, 5 row pins, FileText x2, 4 action icons, the saved tick.
    expect(svgs.length).toBe(22);
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

  it('files the new note under the active category pill, and pins when viewing Pinned', async () => {
    m = await mountNotes(five());
    click(pill(m.host, 'Work'));
    click(titled(m.host, 'New Note'));
    expect(m.app.root.$['editor']!.get('note')).toMatchObject({ category: 'Work', pinned: false });
    click(pill(m.host, 'Pinned'));
    click(titled(m.host, 'New Note'));
    expect(m.app.root.$['editor']!.get('note')).toMatchObject({ category: 'General', pinned: true });
    expect(rowTitles(m.host)).toContain('Untitled note');
  });

  it('clears search when a new note would be hidden and scrolls it into view', async () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    m = await mountNotes(five());
    type(searchInput(m.host), 'nonexistent-filter');
    expect(rows(m.host)).toHaveLength(0);
    click(titled(m.host, 'New Note'));
    await advance(0);
    expect(searchInput(m.host).value).toBe('');
    expect(rowTitles(m.host)).toContain('Untitled note');
    expect(scrollSpy).toHaveBeenCalled();
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

  it('asks via warning Dialog, can be cancelled, and deletes on Confirm returning stack to 0', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    m = await mountNotes(five());
    click(titled(m.host, 'Delete Note'));
    expect(document.body.textContent).toContain('? This cannot be undone.');
    const dialog = document.body.querySelector('.mochi-dialog-overlay.open [role="dialog"]');
    expect(dialog?.getAttribute('data-tone')).toBe('warning');
    click($$(document.body, 'button').filter((b) => b.textContent === '(Cancel)').at(-1)!);
    expect(close).not.toHaveBeenCalled();
    expect(rows(m.host)).toHaveLength(5);

    click(titled(m.host, 'Delete Note'));
    click($$(document.body, 'button').filter((b) => b.textContent === '(Delete)').at(-1)!);
    expect(rowTitles(m.host)).not.toContain('Note number 0');
    expect(rows(m.host)).toHaveLength(4);
    expect(m.app.root.$['stack']!.get('activeIndex')).toBe(0);
    expect(m.host.textContent).toContain('Select a note from the left, or create a new one.');
    expect(titleInput(m.host).closest('[style*="display: none"]')).toBeTruthy();
    await advance(500);
    expect(storage.saves.at(-1)!.notes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3', 'n4']);
  });

  it('Back button returns stack activeIndex to 0', async () => {
    m = await mountNotes(five());
    expect(m.app.root.$['stack']!.get('activeIndex')).toBe(1);
    const backBtn = $(m.host, 'button[aria-label="Back to Notes"]')!;
    expect(backBtn).toBeTruthy();
    click(backBtn);
    expect(m.app.root.$['stack']!.get('activeIndex')).toBe(0);
  });
});

describe('Notes: copy and export', () => {
  it('copies "title, blank line, body" and shows a tick for two seconds only after resolution', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    m = await mountNotes([seedNote(0, { title: 'T', body: 'B' })]);
    click(titled(m.host, 'Copy Note Content'));
    expect(writeText).toHaveBeenCalledWith('T\n\nB');
    await act(async () => {});
    expect(m.app.root.$['editor']!.$['copyIcon']!.get('icon')).toBe('Check');
    await advance(2000);
    expect(m.app.root.$['editor']!.$['copyIcon']!.get('icon')).toBe('Copy');
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  it('shows inline error on clipboard rejection and does not flash Copied', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const writeText = vi.fn(async () => {
      throw new Error('denied');
    });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    m = await mountNotes([seedNote(0, { title: 'T', body: 'B' })]);
    click(titled(m.host, 'Copy Note Content'));
    await act(async () => {});
    expect(m.app.root.$['editor']!.$['copyIcon']!.get('icon')).toBe('Copy');
    expect($(m.host, '[role="alert"]')!.textContent).toContain('Could not copy');
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

describe('Notes: Wave B regression, save failure, accessibility & shortcuts', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  it('snippetOf preserves digits and uppercase letters (regression for "Hello World\\n123 Test")', () => {
    expect(snippetOf('Hello World\n123 Test')).toBe('Hello World\n123 Test');
    expect(snippetOf('# Heading\n--- 42 Items')).toBe('Heading\n42 Items');
  });

  it('shows role=alert save error banner with Retry when saveAppData returns false, and recovers on retry', async () => {
    m = await mountNotes(five());
    storage.saveResult = false;
    type(titleInput(m.host), 'Unsaved');
    await advance(500);
    await act(async () => {});
    expect(m.app.root.get('saveStatus')).toBe('error');
    const alert = $$(m.host, '[role="alert"]').find((el) => el.style.display !== 'none');
    expect(alert?.textContent).toContain('Could not save changes');

    storage.saveResult = true;
    const retryBtn = $$(alert!, 'button').find((b) => b.textContent?.includes('Retry'))!;
    click(retryBtn);
    await act(async () => {});
    expect(m.app.root.get('saveStatus')).toBe('saved');
    expect(m.host.textContent).toContain('Saved to Pyxis PIM storage');
  });

  it('flushes pending edits on pagehide', async () => {
    m = await mountNotes(five());
    type(titleInput(m.host), 'Pagehide edit');
    expect(storage.saves).toHaveLength(0);
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(storage.saves).toHaveLength(1);
    expect(storage.saves[0]!.notes.find((n) => n.id === 'n0')!.title).toBe('Pagehide edit');
  });

  it('search clear button, keyboard accessible NoteRow, aria-labels, and Ctrl+N/Ctrl+F/Escape', async () => {
    m = await mountNotes(five());
    // aria-labels on icon buttons
    for (const label of ['Pin Note to Top', 'Copy Note Content', 'Export Note as Markdown (.md)', 'Delete Note', 'Back to Notes']) {
      expect($(m.host, `button[aria-label="${label}"]`), label).toBeTruthy();
    }

    // Keyboard focusable NoteRow (tabIndex=0 + Enter/Space)
    const targetRow = rows(m.host).find((r) => r.textContent!.includes('Note number 3'))!;
    expect(targetRow.getAttribute('tabindex')).toBe('0');
    act(() => {
      fireEvent.keyDown(targetRow, { key: 'Enter' });
    });
    expect(titleInput(m.host).value).toBe('Note number 3');
    const row2 = rows(m.host).find((r) => r.textContent!.includes('Note number 2'))!;
    act(() => {
      fireEvent.keyDown(row2, { key: ' ' });
    });
    expect(titleInput(m.host).value).toBe('Note number 2');

    // Ctrl+F focuses search, clear button clears it
    act(() => {
      fireEvent.keyDown(document, { key: 'f', ctrlKey: true });
    });
    expect(document.activeElement).toBe(searchInput(m.host));
    type(searchInput(m.host), 'number 1');
    expect(rowTitles(m.host)).toEqual(['Note number 1']);
    click($(m.host, 'button[aria-label="Clear Search"]')!);
    expect(searchInput(m.host).value).toBe('');
    expect(rows(m.host)).toHaveLength(5);

    // Escape clears search
    type(searchInput(m.host), 'number 1');
    expect(rows(m.host)).toHaveLength(1);
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(searchInput(m.host).value).toBe('');
    expect(rows(m.host)).toHaveLength(5);

    // Ctrl+N creates a new note
    act(() => {
      fireEvent.keyDown(document, { key: 'n', ctrlKey: true });
    });
    expect(rows(m.host)).toHaveLength(6);
    expect(titleInput(m.host).value).toBe('Untitled note');
  });
});

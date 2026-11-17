import { view } from '@duyojs/duyo';
import { loadAppData, saveAppData } from '@pyxis/app-sdk';
import { onDestroy, registerIcons } from '@pyxis/app-sdk/duyo';
import { AlertCircle, Check, CircleCheck, Copy, FileText, Pin, Plus, Search, Share2, Trash2, X } from 'lucide-react';
import spec from './NotesApp.view.json';
import {
  AUTOSAVE_MS,
  STORE,
  categoryCounts,
  filterNotes,
  newNote,
  type Note,
  type NotesDoc,
} from './model';
import type { CodeBehind } from './NotesApp.view.gen';
import './NotesList';
import './NoteEditor';
import './notes.css';

// Every icon the Notes views name (specs, and NoteEditor's Copy/Check swap).
registerIcons({ AlertCircle, Check, CircleCheck, Copy, FileText, Pin, Plus, Search, Share2, Trash2, X });

function hasOpenModalOrPopup(): boolean {
  return Boolean(
    document.querySelector(
      '.mochi-dialog-overlay.open, [role="dialog"][aria-modal="true"]:not(.mochi-dialog):not([aria-hidden="true"]), .mochi-dropdown-trigger[aria-expanded="true"]'
    )
  );
}

/**
 * Notes: Palm webOS Mochi-styled memo and note taking, with card previews, category pill
 * filtering, a silent auto-save indicator and non-blocking direct actions.
 *
 * This kind owns the data (the notes, the selection, the filters) and the persistence; the
 * two panels are views of it. A change goes: handler -> `mutate` (new array, autosave
 * scheduled) -> `sync` (push what the panels show). Nothing else writes to the panels.
 */
export default view(spec, {
  create() {
    this.inherited();
    this.setAttributes({ 'data-window-id': this.windowId });
    this._saveTimer = null as ReturnType<typeof setTimeout> | null;
    this._saveSeq = 0;
    this._dirty = false;
    this._countsKey = '';

    // Save what is pending when the page goes (a closing window) or the app is destroyed.
    const flush = () => {
      if (this._saveTimer) {
        clearTimeout(this._saveTimer);
        this._saveTimer = null;
      }
      if (!this._dirty) return;
      this._dirty = false;
      const seq = ++(this._saveSeq as number);
      void this.persist(seq);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!this.destroyed) this.handleKeyDown(e);
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('keydown', onKeyDown);
    onDestroy(this, () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('keydown', onKeyDown);
      flush();
    });

    void loadAppData<NotesDoc>(STORE, { notes: [] }).then((doc) => {
      if (this.destroyed) return;
      const first = doc.notes[0];
      this.setNotes(doc.notes);
      this.setSelectedId(first?.id ?? null);
      this.setLoaded(true);
      this.$.stack.setActiveIndex(first ? 1 : 0);
      this.sync();
    });
    this.sync();
  },

  handleKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (
      this.$.deleteDialog.getOpen() ||
      hasOpenModalOrPopup() ||
      target?.closest?.('.mochi-dialog-overlay, .mochi-contextual-popup')
    ) {
      return;
    }

    const key = e.key;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && key.toLowerCase() === 'n') {
      e.preventDefault();
      this.addNote();
      return;
    }
    if (mod && !e.altKey && key.toLowerCase() === 'f') {
      e.preventDefault();
      const stackHost = document.querySelector(`[data-duyo-id="${this.$.stack.id}"]`);
      const isNarrow = Boolean(stackHost?.querySelector('.repanel[data-narrow="true"]')) || window.innerWidth <= 768;
      if (isNarrow && this.$.stack.getActiveIndex() !== 0) {
        this.$.stack.setActiveIndex(0);
      }
      this.$.list.focusSearch();
      return;
    }
    if (!mod && !e.altKey && key === 'Escape' && this.search !== '') {
      e.preventDefault();
      this.setSearch('');
      this.sync();
    }
  },

  // Handlers for the panels' events.
  addNote() {
    const note = newNote(this.category);
    const q = (this.search as string).trim().toLowerCase();
    if (q && !note.title.toLowerCase().includes(q) && !note.body.toLowerCase().includes(q)) {
      this.setSearch('');
    }
    this.mutate((prev: Note[]) => [note, ...prev]);
    this.select(note.id);
    this.$.list.scrollToId(note.id);
    return true;
  },
  selectNote(_sender, event) {
    this.select(event['id']);
    return true;
  },
  backToList() {
    this.$.stack.setActiveIndex(0);
    return true;
  },
  askDelete() {
    const note = this.selected() as Note | null;
    if (!note) return true;
    this.$.deleteName.setContent(note.title || 'Untitled note');
    this.$.deleteDialog.setOpen(true);
    return true;
  },
  deleteConfirmed() {
    const note = this.selected() as Note | null;
    if (!note) return true;
    this.mutate((prev: Note[]) => prev.filter((n) => n.id !== note.id));
    if (this.selectedId === note.id) {
      this.setSelectedId(null);
      this.$.stack.setActiveIndex(0);
    }
    this.sync();
    return true;
  },
  editNote(_sender, event) {
    const id = this.selectedId as string | null;
    if (id === null) return true;
    const patch = event['patch'] as Partial<Note>;
    this.mutate((prev: Note[]) => prev.map((n) => (n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n)));
    this.sync();
    return true;
  },
  searchEdited(_sender, event) {
    this.setSearch(String(event['value'] ?? ''));
    this.sync();
    return true;
  },
  categoryPicked(_sender, event) {
    this.setCategory(event['category']);
    this.sync();
    return true;
  },
  retrySave() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    const seq = ++(this._saveSeq as number);
    this._dirty = true;
    this.setSaveStatus('saving');
    void this.persist(seq);
    return true;
  },

  selected() {
    return (this.notes as Note[]).find((n) => n.id === this.selectedId) ?? null;
  },

  /** Selecting brings the editor panel forward. */
  select(id: string) {
    this.setSelectedId(id);
    this.$.stack.setActiveIndex(1);
    this.sync();
  },

  async persist(seq: number) {
    let ok = false;
    try {
      ok = await saveAppData(STORE, { notes: this.notes } satisfies NotesDoc);
    } catch {
      ok = false;
    }
    if (this.destroyed || seq !== this._saveSeq) return;
    this._dirty = !ok;
    this.setSaveStatus(ok ? 'saved' : 'error');
  },

  /** Replaces the notes (never edits in place: rows compare items by identity) and schedules the save. */
  mutate(change: (prev: Note[]) => Note[]) {
    const next = change(this.notes as Note[]);
    this.setNotes(next);
    const seq = ++(this._saveSeq as number);
    this._dirty = true;
    this.setSaveStatus('saving');
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      void this.persist(seq);
    }, AUTOSAVE_MS);
  },

  /** Pushes what the panels show. Setting a value a panel already has changes nothing. */
  sync() {
    const { list, editor } = this.$;
    const notes = this.notes as Note[];
    const items = filterNotes(notes, this.search, this.category);

    // Counts are rebuilt from every note on each call; only push them when one moved.
    const counts = categoryCounts(notes);
    const countsKey = JSON.stringify(counts);
    if (countsKey !== this._countsKey) {
      this._countsKey = countsKey;
      list.setCounts(counts);
    }
    list.setCategory(this.category);
    list.setSearch(this.search);
    list.setSelectedId(this.selectedId);
    list.setSearching(this.search.trim() !== '');
    list.setLoaded(this.loaded);
    list.setItems(items);

    editor.setLoaded(this.loaded);
    editor.setNote(this.selected());
  },

  saveStatusChanged() {
    const isError = this.saveStatus === 'error';
    this.$.saveErrorBanner.setAttributes(isError ? { role: 'alert' } : {});
    this.$.saveErrorBanner.setShowing(isError);
    this.$.editor.setSaveStatus(this.saveStatus);
  },
} satisfies CodeBehind);

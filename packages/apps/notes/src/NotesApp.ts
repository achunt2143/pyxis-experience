import { view } from '@duyojs/duyo';
import { loadAppData, saveAppData } from '@pyxis/app-sdk';
import { onDestroy, registerIcons } from '@pyxis/app-sdk/duyo';
import { Check, CircleCheck, Copy, FileText, Pin, Plus, Search, Share2, Trash2 } from 'lucide-react';
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
registerIcons({ Check, CircleCheck, Copy, FileText, Pin, Plus, Search, Share2, Trash2 });

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
    this._countsKey = '';

    // Save what is pending when the page goes (a closing window) or the app is destroyed.
    const flush = () => {
      if (this._saveTimer) {
        clearTimeout(this._saveTimer);
        this._saveTimer = null;
        void saveAppData(STORE, { notes: this.notes } satisfies NotesDoc);
      }
    };
    window.addEventListener('beforeunload', flush);
    onDestroy(this, () => {
      window.removeEventListener('beforeunload', flush);
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

  // Handlers for the panels' events.
  addNote() {
    const note = newNote(this.category);
    this.mutate((prev: Note[]) => [note, ...prev]);
    this.select(note.id);
    return true;
  },
  selectNote(_sender, event) {
    this.select(event['id']);
    return true;
  },
  deleteNote(_sender, event) {
    const id = event['id'] as string;
    this.mutate((prev: Note[]) => prev.filter((n) => n.id !== id));
    if (this.selectedId === id) this.setSelectedId(null);
    this.$.editor.cancelDelete();
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

  /** Selecting brings the editor panel forward and drops a half-made delete. */
  select(id: string) {
    this.setSelectedId(id);
    this.$.stack.setActiveIndex(1);
    this.$.editor.cancelDelete();
    this.sync();
  },

  /** Replaces the notes (never edits in place: rows compare items by identity) and schedules the save. */
  mutate(change: (prev: Note[]) => Note[]) {
    const next = change(this.notes as Note[]);
    this.setNotes(next);
    this.setSaveStatus('saving');
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(async () => {
      this._saveTimer = null;
      await saveAppData(STORE, { notes: next } satisfies NotesDoc);
      // Another edit may have started a newer save while this one was in flight.
      if (!this.destroyed && this._saveTimer === null) this.setSaveStatus('saved');
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
    list.setSelectedId(this.selectedId);
    list.setSearching(this.search.trim() !== '');
    list.setLoaded(this.loaded);
    list.setItems(items);

    editor.setLoaded(this.loaded);
    editor.setNote(notes.find((n) => n.id === this.selectedId) ?? null);
  },

  saveStatusChanged() {
    this.$.editor.setSaveStatus(this.saveStatus);
  },
} satisfies CodeBehind);

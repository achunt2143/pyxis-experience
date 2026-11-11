import { view } from '@duyojs/duyo';
import { onDestroy } from '@pyxis/app-sdk/duyo';
import spec from './NoteEditor.view.json';
import { bodyStats, exportNote, formatRelativeDate, type Note } from './model';
import type { CodeBehind } from './NoteEditor.view.gen';

const COPIED_MS = 2000;

/**
 * The editor panel. The app pushes the selected `note` (or null), `loaded` and `saveStatus`
 * in; the panel raises onEdit {patch} and onDeleteNote {id} out. Copy, export and the inline
 * delete confirmation are the panel's own business.
 */
export default view(spec, {
  create() {
    this.inherited();
    this._confirmId = null as string | null;
    this._copiedTimer = null as ReturnType<typeof setTimeout> | null;
    onDestroy(this, () => {
      if (this._copiedTimer) clearTimeout(this._copiedTimer);
    });
    this.loadedChanged();
    this.saveStatusChanged();
    this.noteChanged();
  },

  /** remochi.Input takes no aria attributes (it is not a pyxis.Control): set the label on the field once drawn. */
  rendered() {
    this.inherited();
    const host = document.querySelector(`[data-duyo-id="${this.$.title.id}"]`);
    host?.querySelector('input')?.setAttribute('aria-label', 'note title');
  },

  // Events from the controls, re-raised as edits.
  titleInput(_sender, event) {
    this.doEdit({ patch: { title: String(event['value'] ?? '') } });
    return true;
  },
  bodyInput(_sender, event) {
    this.doEdit({ patch: { body: String(event['value'] ?? '') } });
    return true;
  },
  categoryPicked(_sender, event) {
    this.doEdit({ patch: { category: String(event['value']) } });
    return true;
  },
  togglePin() {
    const note = this.note as Note | null;
    if (note) this.doEdit({ patch: { pinned: !note.pinned } });
    return true;
  },

  copy() {
    const note = this.note as Note | null;
    if (!note) return true;
    void navigator.clipboard?.writeText(`${note.title}\n\n${note.body}`)?.catch(() => {});
    this.setCopied(true);
    if (this._copiedTimer) clearTimeout(this._copiedTimer);
    this._copiedTimer = setTimeout(() => {
      this._copiedTimer = null;
      if (!this.destroyed) this.setCopied(false);
    }, COPIED_MS);
    return true;
  },
  exportIt() {
    const note = this.note as Note | null;
    if (note) exportNote(note);
    return true;
  },

  // Inline delete confirmation: no modal.
  askDelete() {
    const note = this.note as Note | null;
    this._confirmId = note ? note.id : null;
    this.showConfirm();
    return true;
  },
  cancelDelete() {
    this._confirmId = null;
    this.showConfirm();
    return true;
  },
  confirmDelete() {
    const note = this.note as Note | null;
    this._confirmId = null;
    if (note) this.doDeleteNote({ id: note.id });
    this.showConfirm();
    return true;
  },
  showConfirm() {
    const note = this.note as Note | null;
    const confirming = !!note && this._confirmId === note.id;
    this.$.confirmGroup.setShowing(confirming);
    this.$.trashWrap.setShowing(!confirming);
  },

  // Published properties pushed in by the app.
  noteChanged() {
    const note = this.note as Note | null;
    const { pane, empty, title, category, body, pinWrap, pinButton, pinIcon, edited, stats } = this.$;
    pane.setShowing(!!note);
    empty.setShowing(!note);
    if (note) {
      title.setValue(note.title);
      category.setValue(note.category || 'General');
      body.setValue(note.body);
      pinWrap.setAttributes({ title: note.pinned ? 'Unpin Note' : 'Pin Note to Top' });
      pinButton.setVariant(note.pinned ? 'warning' : 'normal');
      pinIcon.setStyle(note.pinned ? 'vertical-align:middle;fill:currentColor' : 'vertical-align:middle');
      edited.setContent(`Last edited ${formatRelativeDate(note.updatedAt)}`);
      stats.setContent(bodyStats(note.body));
    }
    if (this._confirmId !== (note ? note.id : null)) this._confirmId = null;
    this.showConfirm();
  },
  loadedChanged() {
    this.$.emptyText.setContent(this.loaded ? 'Select a note from the left, or create a new one.' : '');
  },
  saveStatusChanged() {
    this.$.saving.setShowing(this.saveStatus === 'saving');
    this.$.saved.setShowing(this.saveStatus !== 'saving');
  },
  copiedChanged() {
    this.$.copyIcon.setIcon(this.copied ? 'Check' : 'Copy');
    this.$.copyIcon.setColor(this.copied ? '#10b981' : undefined);
  },
} satisfies CodeBehind);

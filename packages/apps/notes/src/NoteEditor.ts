import { view } from '@duyojs/duyo';
import { onDestroy } from '@pyxis/app-sdk/duyo';
import spec from './NoteEditor.view.json';
import { bodyStats, exportNote, formatRelativeDate, type Note } from './model';
import type { CodeBehind } from './NoteEditor.view.gen';

const COPIED_MS = 2000;

/**
 * The editor panel. The app pushes the selected `note` (or null), `loaded` and `saveStatus`
 * in; the panel raises onEdit {patch}, onAskDelete, and onBack out. Copy and export are the
 * panel's own business; the app owns the delete dialog.
 */
export default view(spec, {
  create() {
    this.inherited();
    this._copiedTimer = null as ReturnType<typeof setTimeout> | null;
    this._copyToken = 0;
    this._lastNoteId = null as string | null;
    onDestroy(this, () => {
      if (this._copiedTimer) clearTimeout(this._copiedTimer);
    });
    this.loadedChanged();
    this.saveStatusChanged();
    this.copyErrorChanged();
    this.noteChanged();
  },

  back() {
    this.doBack();
    return true;
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
    const token = ++(this._copyToken as number);
    this.setCopyError('');
    const write = navigator.clipboard?.writeText;
    if (typeof write !== 'function') {
      this.setCopied(false);
      this.setCopyError('Clipboard is unavailable.');
      return true;
    }
    void Promise.resolve(write.call(navigator.clipboard, `${note.title}\n\n${note.body}`)).then(
      () => {
        if (this.destroyed || token !== this._copyToken) return;
        this.setCopyError('');
        this.setCopied(true);
        if (this._copiedTimer) clearTimeout(this._copiedTimer);
        this._copiedTimer = setTimeout(() => {
          this._copiedTimer = null;
          if (!this.destroyed) this.setCopied(false);
        }, COPIED_MS);
      },
      () => {
        if (this.destroyed || token !== this._copyToken) return;
        this.setCopied(false);
        this.setCopyError('Could not copy note to clipboard.');
        if (this._copiedTimer) clearTimeout(this._copiedTimer);
        this._copiedTimer = setTimeout(() => {
          this._copiedTimer = null;
          if (!this.destroyed) this.setCopyError('');
        }, COPIED_MS);
      }
    );
    return true;
  },
  exportIt() {
    const note = this.note as Note | null;
    if (note) exportNote(note);
    return true;
  },
  askDelete() {
    this.doAskDelete();
    return true;
  },

  // Published properties pushed in by the app.
  noteChanged() {
    const note = this.note as Note | null;
    const nextId = note?.id ?? null;
    if (nextId !== this._lastNoteId) {
      this._lastNoteId = nextId;
      (this._copyToken as number)++;
      if (this._copiedTimer) {
        clearTimeout(this._copiedTimer);
        this._copiedTimer = null;
      }
      this.setCopied(false);
      this.setCopyError('');
    }
    const { headerActions, pane, empty, title, category, body, pinWrap, pinButton, pinIcon, edited, stats } = this.$;
    headerActions.setShowing(!!note);
    pane.setShowing(!!note);
    empty.setShowing(!note);
    if (note) {
      title.setValue(note.title);
      category.setValue(note.category || 'General');
      body.setValue(note.body);
      const pinLabel = note.pinned ? 'Unpin Note' : 'Pin Note to Top';
      pinWrap.setAttributes({ title: pinLabel });
      pinButton.setAttributes({ 'aria-label': pinLabel });
      pinButton.setVariant(note.pinned ? 'warning' : 'normal');
      pinIcon.setStyle(note.pinned ? 'vertical-align:middle;fill:currentColor' : 'vertical-align:middle');
      edited.setContent(`Last edited ${formatRelativeDate(note.updatedAt)}`);
      stats.setContent(bodyStats(note.body));
    }
  },
  loadedChanged() {
    this.$.emptyText.setContent(this.loaded ? 'Select a note from the left, or create a new one.' : '');
  },
  saveStatusChanged() {
    this.$.saving.setShowing(this.saveStatus === 'saving');
    this.$.saved.setShowing(this.saveStatus === 'saved');
    this.$.saveErrorFooter.setShowing(this.saveStatus === 'error');
  },
  copiedChanged() {
    this.$.copyIcon.setIcon(this.copied ? 'Check' : 'Copy');
    this.$.copyIcon.setColor(this.copied ? 'var(--mochi-success)' : undefined);
  },
  copyErrorChanged() {
    const msg = String(this.copyError ?? '');
    this.$.copyErrorBar.setAttributes(msg !== '' ? { role: 'alert' } : {});
    this.$.copyErrorBar.setContent(msg);
    this.$.copyErrorBar.setShowing(msg !== '');
  },
} satisfies CodeBehind);

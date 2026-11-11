import { view } from '@duyojs/duyo';
import { onDestroy } from '@pyxis/app-sdk/duyo';
import spec from './FilesInspector.view.json';
import type { CodeBehind } from './FilesInspector.view.gen';
import { fmtDate, formatBytes, isReadOnly, kindOf, type Preview } from './model';

const COPIED_MS = 2000;

/**
 * The detail panel: a preview of the file (picture, text, audio card or plain card) over its
 * path, size, permissions and date. The app pushes `preview`; this raises `onClosePreview`,
 * `onRenameEntry` and `onDeleteEntry` (the last two only for a file inside the home).
 */
export default view(spec, {
  create() {
    this.inherited();
    this._timers = new Set<ReturnType<typeof setTimeout>>();
    onDestroy(this, () => {
      for (const t of this._timers as Set<ReturnType<typeof setTimeout>>) clearTimeout(t);
    });
    this.previewChanged();
    this.copiedPathChanged();
    this.copiedTextChanged();
  },

  /** remochi's Button takes aria attributes as props, which a Duyo kind cannot pass: set it on the element. */
  rendered() {
    this.inherited();
    document
      .querySelector(`[data-duyo-id="${this.$.closeButton.id}"] button`)
      ?.setAttribute('aria-label', 'Close Inspector');
  },

  close() {
    this.doClosePreview();
    return true;
  },
  rename() {
    this.doRenameEntry();
    return true;
  },
  remove() {
    this.doDeleteEntry();
    return true;
  },

  copyText() {
    const preview = this.preview as Preview | null;
    if (!preview?.text) return true;
    void navigator.clipboard?.writeText(preview.text)?.catch(() => {});
    this.flash('copiedText');
    return true;
  },
  copyPath() {
    const preview = this.preview as Preview | null;
    if (!preview) return true;
    void navigator.clipboard?.writeText(preview.entry.path)?.catch(() => {});
    this.flash('copiedPath');
    return true;
  },
  /** Sets a "copied" flag for two seconds. */
  flash(property: string) {
    this.set(property, true);
    const timers = this._timers as Set<ReturnType<typeof setTimeout>>;
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!this.destroyed) this.set(property, false);
    }, COPIED_MS);
    timers.add(timer);
  },

  previewChanged() {
    const preview = this.preview as Preview | null;
    if (!preview) return;
    const { entry, stat } = preview;
    const d = this.$;
    d.header.setContent(entry.name);
    d.badge.setContent(kindOf(entry).toUpperCase());

    // The first branch that fits, as the React panel's chain of ternaries chose.
    const image = !preview.loading && preview.kind === 'image' && !!preview.dataUri;
    const text = !preview.loading && !image && preview.kind === 'text' && preview.text !== undefined;
    const audio = !preview.loading && !image && !text && preview.kind === 'audio';
    const meta = !preview.loading && !image && !text && !audio;
    d.loading.setShowing(preview.loading);
    d.imageBox.setShowing(image);
    d.textBox.setShowing(text);
    d.audioBox.setShowing(audio);
    d.metaBox.setShowing(meta);
    if (image) {
      d.image.setSrc(preview.dataUri ?? '');
      d.image.setAlt(entry.name);
    }
    if (text) d.text.setContent(preview.text ?? '');
    d.audioSize.setContent(formatBytes(entry.size));
    d.metaText.setContent(preview.error || 'Binary or unpreviewable file type');

    d.path.setContent(entry.path);
    d.size.setContent(formatBytes(stat?.size ?? entry.size));
    d.permissions.setContent(stat?.permissions || '—');
    d.modified.setContent(fmtDate(stat?.modified));
    d.actions.setShowing(!isReadOnly(entry.path));
  },
  copiedTextChanged() {
    this.$.textIcon.setIcon(this.copiedText ? 'Check' : 'Copy');
    this.$.textLabel.setContent(this.copiedText ? 'Copied' : 'Copy');
  },
  copiedPathChanged() {
    this.$.pathIcon.setIcon(this.copiedPath ? 'Check' : 'Copy');
  },
} satisfies CodeBehind);

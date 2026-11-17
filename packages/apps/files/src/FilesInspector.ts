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
    this._timers = new Map<string, ReturnType<typeof setTimeout>>();
    this._imageError = false;
    this._boundImage = null as HTMLImageElement | null;
    this._imageErrorHandler = null as (() => void) | null;
    onDestroy(this, () => {
      for (const t of (this._timers as Map<string, ReturnType<typeof setTimeout>>).values()) clearTimeout(t);
      if (this._boundImage && this._imageErrorHandler) {
        (this._boundImage as HTMLImageElement).removeEventListener('error', this._imageErrorHandler);
      }
      this._boundImage = null;
      this._imageErrorHandler = null;
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
    document
      .querySelector(`[data-duyo-id="${this.$.copyPathButton.id}"]`)
      ?.setAttribute('aria-label', 'Copy Path');

    const img = document.querySelector(`[data-duyo-id="${this.$.image.id}"]`) as HTMLImageElement | null;
    if (img && this._boundImage !== img) {
      if (this._boundImage && this._imageErrorHandler) {
        (this._boundImage as HTMLImageElement).removeEventListener('error', this._imageErrorHandler);
      }
      const onImgError = () => {
        if (this.destroyed) return;
        const preview = this.preview as Preview | null;
        if (!preview || preview.kind !== 'image' || !preview.dataUri) return;
        this._imageError = true;
        this.applyPreviewBoxes(preview);
      };
      img.addEventListener('error', onImgError);
      this._boundImage = img;
      this._imageErrorHandler = onImgError;
    }
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
    void this.writeClipboard(preview.text, 'copiedText');
    return true;
  },
  copyPath() {
    const preview = this.preview as Preview | null;
    if (!preview) return true;
    void this.writeClipboard(preview.entry.path, 'copiedPath');
    return true;
  },
  async writeClipboard(value: string, property: 'copiedText' | 'copiedPath') {
    const clipboard = navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== 'function') {
      if (!this.destroyed) this.doCopyError({ message: 'Clipboard access is unavailable' });
      return;
    }
    try {
      await clipboard.writeText(value);
      if (!this.destroyed) this.flash(property);
    } catch (err) {
      if (!this.destroyed) {
        this.doCopyError({
          message: err instanceof Error ? err.message : 'Failed to copy to clipboard',
        });
      }
    }
  },
  /** Sets a "copied" flag for two seconds. */
  flash(property: string) {
    const timers = this._timers as Map<string, ReturnType<typeof setTimeout>>;
    const prev = timers.get(property);
    if (prev !== undefined) clearTimeout(prev);
    this.set(property, true);
    const timer = setTimeout(() => {
      timers.delete(property);
      if (!this.destroyed) this.set(property, false);
    }, COPIED_MS);
    timers.set(property, timer);
  },

  applyPreviewBoxes(preview: Preview) {
    const { entry } = preview;
    const d = this.$;
    const image = !preview.loading && preview.kind === 'image' && !!preview.dataUri && !this._imageError;
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
    } else {
      d.image.setSrc('');
    }
    if (text) d.text.setContent(preview.text ?? '');
    d.audioSize.setContent(formatBytes(entry.size));
    d.metaText.setContent(
      this._imageError
        ? 'Failed to load image preview (corrupt or unsupported image)'
        : preview.error || 'Binary or unpreviewable file type'
    );
  },

  previewChanged() {
    const preview = this.preview as Preview | null;
    if (!preview) return;
    this._imageError = false;
    const { entry, stat } = preview;
    const d = this.$;
    d.header.setContent(entry.name);
    d.badge.setContent(kindOf(entry).toUpperCase());

    this.applyPreviewBoxes(preview);

    d.path.setContent(entry.path);
    d.size.setContent(formatBytes(stat?.size ?? entry.size));
    d.permissions.setContent(stat?.permissions || '—');
    d.modified.setContent(fmtDate(stat?.modified));
    this.updateActions();
  },
  privilegedChanged() {
    this.updateActions();
  },
  updateActions() {
    const preview = this.preview as Preview | null;
    this.$.actions.setShowing(!!preview && (!isReadOnly(preview.entry.path) || !!this.privileged));
  },
  copiedTextChanged() {
    this.$.textIcon.setIcon(this.copiedText ? 'Check' : 'Copy');
    this.$.textLabel.setContent(this.copiedText ? 'Copied' : 'Copy');
  },
  copiedPathChanged() {
    this.$.pathIcon.setIcon(this.copiedPath ? 'Check' : 'Copy');
  },
} satisfies CodeBehind);

import { view } from '@duyojs/duyo';
import spec from './FilesDialogs.view.json';
import type { CodeBehind } from './FilesDialogs.view.gen';

/** What the dialogs ask the app to show: `mode` is one of these, '' for none. */
export type DialogMode = '' | 'newFolder' | 'rename' | 'delete';

/**
 * The four dialogs: New Folder, Rename (each with a name field), Delete confirmation and the
 * error alert. The app pushes `mode`, `busy`, `entryName`, `isDirectory` and `error`; this
 * raises `onSubmit {mode, value}` (Create/Rename button or Enter), `onConfirmDelete`,
 * `onDismiss` (Cancel, scrim, Escape) and `onDismissError`.
 *
 * remochi's Dialog closes itself on any way out, so after each of those the app pushes the
 * state again (`sync`), which is what keeps a dialog open while an action is running.
 *
 * The name being typed lives in the field; the app learns it on submit.
 */
export default view(spec, {
  create() {
    this.inherited();
    this.modeChanged();
    this.isDirectoryChanged();
    this.errorChanged();
  },

  /** The field that is on screen for the current mode. */
  field() {
    return this.mode === 'rename' ? this.$.renameName : this.$.folderName;
  },
  nameInput() {
    this.updateButtons();
    return true;
  },
  /** Enter submits. (Not the Input's own `onchange`: that also fires on blur, which a click on Cancel causes.) */
  nameKey(_sender, event) {
    if (event['key'] === 'Enter') this.submit();
    return true;
  },
  submit() {
    const value = String(this.field().value ?? '');
    if (this.busy || !value.trim()) return true;
    this.doSubmit({ mode: this.mode, value });
    return true;
  },
  confirmDelete() {
    this.doConfirmDelete();
    return true;
  },
  dismiss() {
    this.doDismiss();
    return true;
  },
  dismissError() {
    this.doDismissError();
    return true;
  },

  modeChanged() {
    this.applyOpen();
    this.entryNameChanged();
    this.updateButtons();
  },
  /** Opens what the state says is open. The app calls this after every event too (see above). */
  applyOpen() {
    const mode = this.mode as string;
    const d = this.$;
    d.newFolder.setOpen(mode === 'newFolder');
    d.rename.setOpen(mode === 'rename');
    d.remove.setOpen(mode === 'delete');
    d.alert.setOpen(this.error !== null);
  },
  entryNameChanged() {
    // A rename starts from the file's current name; a new folder from nothing.
    if (this.mode === 'rename') this.$.renameName.setValue(this.entryName as string);
    if (this.mode === 'newFolder') this.$.folderName.setValue('');
    this.$.removeName.setContent(this.entryName as string);
    this.updateButtons();
  },
  isDirectoryChanged() {
    this.$.removeTail.setContent(
      this.isDirectory ? ' and everything inside it? This cannot be undone.' : '? This cannot be undone.'
    );
  },
  busyChanged() {
    this.updateButtons();
  },
  errorChanged() {
    const error = this.error as string | null;
    if (error !== null) this.$.errorText.setContent(error);
    this.applyOpen();
  },

  updateButtons() {
    const d = this.$;
    const busy = !!this.busy;
    d.folderCancel.setDisabled(busy);
    d.renameCancel.setDisabled(busy);
    d.folderCreate.setDisabled(busy || this.mode !== 'newFolder' || !String(d.folderName.value ?? '').trim());
    d.renameDo.setDisabled(busy || this.mode !== 'rename' || !String(d.renameName.value ?? '').trim());
  },
} satisfies CodeBehind);

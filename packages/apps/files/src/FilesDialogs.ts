import { view } from '@duyojs/duyo';
import spec from './FilesDialogs.view.json';
import type { CodeBehind } from './FilesDialogs.view.gen';
import { validateEntryName } from './model';

/** What the dialogs ask the app to show: `mode` is one of these, '' for none. */
export type DialogMode = '' | 'newFolder' | 'rename' | 'delete';

/**
 * The four dialogs: New Folder, Rename (each with a name field), Delete confirmation and the
 * error alert. The app pushes `mode`, `busy`, `entryName`, `isDirectory`, `existingNames` and
 * `error`; this raises `onSubmit {mode, value}` (Create/Rename button or Enter), `onConfirmDelete`,
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
  validate(rawValue: string): string | null {
    const existingNames = (this.existingNames as string[] | undefined) ?? [];
    const currentName = this.mode === 'rename' ? (this.entryName as string) : undefined;
    return validateEntryName(rawValue, { existingNames, currentName });
  },
  nameInput() {
    this.updateButtons();
    return true;
  },
  submit() {
    const value = String(this.field().value ?? '');
    if (this.busy) return true;
    const error = this.validate(value);
    if (error) {
      this.updateButtons();
      return true;
    }
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
  /** Opens what the state says is open, keeping error alerts mutually exclusive with other dialogs. */
  applyOpen() {
    const hasError = this.error !== null;
    const mode = hasError ? '' : (this.mode as string);
    const d = this.$;
    d.newFolder.setOpen(mode === 'newFolder');
    d.rename.setOpen(mode === 'rename');
    d.remove.setOpen(mode === 'delete');
    d.alert.setOpen(hasError);
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
  existingNamesChanged() {
    this.updateButtons();
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
    const existingNames = (this.existingNames as string[] | undefined) ?? [];

    d.folderCancel.setDisabled(busy);
    d.renameCancel.setDisabled(busy);

    const folderVal = String(d.folderName.value ?? '');
    const folderBlank = !folderVal.trim() && !folderVal.includes('\0') && !folderVal.includes('/');
    const folderErr =
      this.mode === 'newFolder' && !folderBlank ? validateEntryName(folderVal, { existingNames }) : null;
    d.folderError.setContent(folderErr ?? '');
    d.folderError.setShowing(!!folderErr);
    d.folderCreate.setDisabled(busy || this.mode !== 'newFolder' || folderBlank || !!folderErr);

    const renameVal = String(d.renameName.value ?? '');
    const renameBlank = !renameVal.trim() && !renameVal.includes('\0') && !renameVal.includes('/');
    const renameErr =
      this.mode === 'rename'
        ? renameBlank
          ? 'Name cannot be empty'
          : validateEntryName(renameVal, { existingNames, currentName: this.entryName as string })
        : null;
    d.renameError.setContent(renameErr ?? '');
    d.renameError.setShowing(!!renameErr);
    d.renameDo.setDisabled(busy || this.mode !== 'rename' || renameBlank || !!renameErr);
  },
} satisfies CodeBehind);

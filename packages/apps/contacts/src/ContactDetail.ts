import { view, type Component, type ComponentEvent } from '@duyojs/duyo';
import { formatLocalDate, parseLocalDate } from '@pyxis/app-sdk';
import { onDestroy } from '@pyxis/app-sdk/duyo';
import spec from './ContactDetail.view.json';
import { exportVCard, getAvatarGradient, getInitials, type Contact } from './model';
import type { CodeBehind } from './ContactDetail.view.gen';

const COPIED_MS = 2000;

/** The patch key for each text field's component name (`emailField` -> `email`). */
const fieldKey = (name: string) => name.replace(/Field$/, '');

/**
 * The contact card and editor. The app pushes `contact` (or null), `loaded` and
 * `saveStatus`; edits go out as onEdit {patch}, plus onAddContact (the empty state's
 * button), onAskDelete (the app owns the dialog) and onBack (the narrow layout's way back). Copy feedback and vCard export are
 * the panel's own business.
 */
export default view(spec, {
  create() {
    this.inherited();
    this._copiedTimer = null as ReturnType<typeof setTimeout> | null;
    onDestroy(this, () => {
      if (this._copiedTimer) clearTimeout(this._copiedTimer);
    });
    this.saveStatusChanged();
    this.loadedChanged();
    this.contactChanged();
    this.copiedChanged();
  },

  add() {
    this.doAddContact();
    return true;
  },
  askDelete() {
    this.doAskDelete();
    return true;
  },
  back() {
    this.doBack();
    return true;
  },
  /** Any of the text fields: the component's name says which one. */
  fieldInput(sender: Component, event: ComponentEvent) {
    this.doEdit({ patch: { [fieldKey(sender.name ?? '')]: String(event['value'] ?? '') } });
    return true;
  },
  notesInput(_sender, event) {
    this.doEdit({ patch: { notes: String(event['value'] ?? '') } });
    return true;
  },
  categoryInput(_sender, event) {
    this.doEdit({ patch: { category: String(event['value']) } });
    return true;
  },
  // The picker hands back local midnight; toISOString() would be the day before west of UTC.
  birthdayInput(_sender, event) {
    const day = formatLocalDate(event['value'] as Date);
    if (day) this.doEdit({ patch: { birthday: day } });
    return true;
  },
  clearBirthday() {
    this.doEdit({ patch: { birthday: '' } });
    return true;
  },
  toggleStar() {
    const c = this.contact as Contact | null;
    if (c) this.doEdit({ patch: { starred: !c.starred } });
    return true;
  },
  exportOne() {
    const c = this.contact as Contact | null;
    if (c) exportVCard(c);
    return true;
  },
  copyEmail() {
    return this.copy('email');
  },
  copyPhone() {
    return this.copy('phone');
  },
  copy(field: 'email' | 'phone') {
    const c = this.contact as Contact | null;
    if (!c) return true;
    void navigator.clipboard?.writeText(c[field])?.catch(() => {});
    this.setCopied(field);
    if (this._copiedTimer) clearTimeout(this._copiedTimer);
    this._copiedTimer = setTimeout(() => {
      this._copiedTimer = null;
      if (!this.destroyed) this.setCopied('');
    }, COPIED_MS);
    return true;
  },

  contactChanged() {
    const c = this.contact as Contact | null;
    const d = this.$;
    d.headerActions.setShowing(!!c);
    d.pane.setShowing(!!c);
    d.empty.setShowing(!c);
    if (!c) return;
    d.avatar.setStyle(`background:${getAvatarGradient(c.name)}`);
    d.avatar.setContent(getInitials(c.name));
    d.nameField.setValue(c.name);
    d.badge.setContent(c.category || 'Personal');
    d.subtitle.setContent((c.jobTitle ? `${c.jobTitle} ` : '') + (c.company ? `@ ${c.company}` : ''));
    d.starWrap.setAttributes({ title: c.starred ? 'Unstar Contact' : 'Star Contact' });
    d.starButton.setVariant(c.starred ? 'warning' : 'normal');
    d.starIcon.setColor(c.starred ? 'var(--mochi-selected)' : 'currentColor');
    d.starIcon.setStyle(c.starred ? 'vertical-align:middle;fill:var(--mochi-selected)' : 'vertical-align:middle');

    d.quick.setShowing(!!(c.email || c.phone));
    d.mail.setShowing(!!c.email);
    d.mail.set('href', c.email ? `mailto:${c.email}` : '');
    d.call.setShowing(!!c.phone);
    d.call.set('href', c.phone ? `tel:${c.phone}` : '');
    d.copyEmail.setShowing(!!c.email);
    d.copyPhone.setShowing(!!c.phone);

    d.emailField.setValue(c.email);
    d.phoneField.setValue(c.phone);
    d.companyField.setValue(c.company || '');
    d.jobTitleField.setValue(c.jobTitle || '');
    d.addressField.setValue(c.address || '');
    d.category.setValue(c.category || 'Personal');
    // A Date, not the string: the picker reads a 'YYYY-MM-DD' string as UTC midnight.
    d.birthday.setValue(parseLocalDate(c.birthday || '') ?? '');
    d.clearBirthday.setShowing(!!c.birthday);
    d.notes.setValue(c.notes);
  },
  loadedChanged() {
    this.$.emptyText.setContent(this.loaded ? 'Select a contact, or create a new one.' : 'Loading address book…');
  },
  saveStatusChanged() {
    this.$.saving.setShowing(this.saveStatus === 'saving');
    // Never "Saved" after a failed save: the app shows the error and a Retry.
    this.$.saved.setShowing(this.saveStatus === 'saved');
  },
  copiedChanged() {
    const d = this.$;
    for (const [field, icon, label, text] of [
      ['email', d.copyEmailIcon, d.copyEmailLabel, 'Email'],
      ['phone', d.copyPhoneIcon, d.copyPhoneLabel, 'Phone'],
    ] as const) {
      const copied = this.copied === field;
      icon.setIcon(copied ? 'Check' : 'Copy');
      icon.setColor(copied ? 'var(--mochi-success)' : undefined);
      label.setContent(copied ? `Copied ${text}` : `Copy ${text}`);
    }
  },
} satisfies CodeBehind);

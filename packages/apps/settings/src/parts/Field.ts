import { view } from '@duyojs/duyo';
import spec from './Field.view.json';
import type { CodeBehind } from './Field.view.gen';

/**
 * A labelled text field with its own error line (the Location form's three, the password form's).
 * `field` is the value of the `attr` data attribute suites look for (`data-location-field` unless
 * the use site names another; with no `field` the attribute is just present); `inputType` is the
 * input's `type` (`password`); `text` follows what is typed (and, set from outside, fills the
 * input); Enter raises `onEnter`, typing `onText {value}`.
 */
export default view(spec, {
  create() {
    this.inherited();
    this.paint();
    this.$.input.setValue(this.text);
  },
  typed(_sender, event) {
    this.setText(String(event['value'] ?? ''));
    this.doText({ value: this.text });
    return true;
  },
  entered() {
    this.doEnter();
    return true;
  },
  textChanged() {
    this.$.input.setValue(this.text);
  },
  labelChanged() {
    this.paint();
  },
  placeholderChanged() {
    this.paint();
  },
  fieldChanged() {
    this.paint();
  },
  attrChanged() {
    this.paint();
  },
  inputTypeChanged() {
    this.paint();
  },
  errorChanged() {
    this.paint();
  },
  paint() {
    const { caption, input, message } = this.$;
    const error = String(this.error);
    caption.setContent(this.label);
    input.setPlaceholder(this.placeholder);
    // `type` is the Control's own property (an attribute of that name is dropped).
    input.setType(String(this.inputType));
    input.addRemoveClass('invalid', error !== '');
    // `data-location-field` -> `location-lat-error`; `data-password-new` -> `password-new-error`.
    const base = String(this.attr).replace(/^data-/, '').replace(/-field$/, '');
    const id = `${base}${this.field ? `-${this.field}` : ''}-error`;
    input.setAttributes({
      [String(this.attr)]: this.field || true,
      ...(error ? { 'aria-invalid': true, 'aria-describedby': id } : {}),
    });
    message.setContent(error);
    message.setShowing(error !== '');
    message.setAttributes({ id });
  },
} satisfies CodeBehind);

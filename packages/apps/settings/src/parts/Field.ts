import { view } from '@duyojs/duyo';
import spec from './Field.view.json';
import type { CodeBehind } from './Field.view.gen';

/**
 * A labelled text field with its own error line (the Location form's three). `field` is the
 * `data-location-field` suites use; `text` follows what is typed (and, set from outside,
 * fills the input); Enter raises `onEnter`, typing `onText {value}`.
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
  keyed(_sender, event) {
    if (event['key'] === 'Enter') this.doEnter();
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
  errorChanged() {
    this.paint();
  },
  paint() {
    const { caption, input, message } = this.$;
    const error = String(this.error);
    caption.setContent(this.label);
    input.setPlaceholder(this.placeholder);
    input.addRemoveClass('invalid', error !== '');
    input.setAttributes({
      'data-location-field': this.field,
      ...(error ? { 'aria-invalid': true, 'aria-describedby': `location-${this.field}-error` } : {}),
    });
    message.setContent(error);
    message.setShowing(error !== '');
    message.setAttributes({ id: `location-${this.field}-error` });
  },
} satisfies CodeBehind);

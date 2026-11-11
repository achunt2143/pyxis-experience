import { view } from '@duyojs/duyo';
import spec from './Choice.view.json';
import type { CodeBehind } from './Choice.view.gen';

/**
 * One option of a radio group drawn as a card: a label, a hint, an optional icon and an
 * "Active" badge on the chosen one. The use site says what it is for with `attributes`
 * (`data-theme-choice`, ...), which this kind keeps and adds role/aria to, and handles
 * `ontap` (the sender is the card; `option` is its value).
 */
export default view(spec, {
  create() {
    this.inherited();
    this._base = this.attributes;
    this.paint();
  },
  labelChanged() {
    this.paint();
  },
  hintChanged() {
    this.paint();
  },
  checkedChanged() {
    this.paint();
  },
  glyphChanged() {
    this.paint();
  },
  glyphColorChanged() {
    this.paint();
  },
  paint() {
    const { icon, title, hintText, active } = this.$;
    title.setContent(this.label);
    hintText.setContent(this.hint);
    hintText.setShowing(this.hint !== '');
    icon.setIcon(this.glyph);
    icon.setColor(this.glyphColor || undefined);
    icon.setShowing(this.glyph !== '');
    active.setShowing(this.checked);
    this.addRemoveClass('checked', this.checked);
    this.setAttributes({
      ...(this._base as object),
      role: 'radio',
      'aria-checked': this.checked,
      'aria-label': this.label,
    });
  },
} satisfies CodeBehind);

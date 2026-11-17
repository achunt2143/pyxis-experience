import { view } from '@duyojs/duyo';
import { createElement } from 'react';
import { Badge } from 'remochi';
import { SettingGlyph } from '../glyph';
import spec from './Choice.view.json';
import type { CodeBehind } from './Choice.view.gen';

/**
 * One option of a radio group drawn as a Remochi Item card: a label, a hint, an optional icon
 * and an "Active" badge on the chosen one. The use site says what it is for with `attributes`
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
    const { item } = this.$;
    item.setTitle(this.label);
    item.setSubtitle(this.hint !== '' ? this.hint : undefined);
    item.setSelected(this.checked);
    item.setIcon(
      this.glyph !== ''
        ? createElement(SettingGlyph, { name: this.glyph, selected: this.checked })
        : undefined
    );
    item.setRightContent(
      this.checked
        ? createElement(Badge, {
            content: 'Active',
            background: 'var(--mochi-primary-soft)',
            color: 'var(--mochi-primary)',
          })
        : undefined
    );
    this.addRemoveClass('checked', this.checked);
    this.setAttributes({
      ...(this._base as object),
      type: 'button',
      role: 'radio',
      'aria-checked': this.checked,
      'aria-label': this.label,
    });
  },
} satisfies CodeBehind);

import { view } from '@duyojs/duyo';
import spec from './Fact.view.json';
import type { CodeBehind } from './Fact.view.gen';

/** What a Repeater gives a Fact row: the same fields as the published properties, plus its key. */
export interface FactItem {
  key: string;
  label: string;
  text: string;
  mono?: boolean;
  attributes?: Record<string, string>;
}

/**
 * A label / value row, as About and Date & Time list facts. Used directly (published
 * `label`, `text`, `mono`, `glyph`; the use site's `attributes` are kept) or as a Repeater
 * row, where `item` (a FactItem) fills those in.
 */
export default view(spec, {
  create() {
    this.inherited();
    this._base = this.attributes;
    this.itemChanged();
    this.paint();
  },
  itemChanged() {
    const item = this.item as FactItem | null;
    if (!item) return;
    this.setLabel(item.label);
    this.setText(item.text);
    this.setMono(!!item.mono);
    if (item.attributes) this.setAttributes(item.attributes);
  },
  labelChanged() {
    this.paint();
  },
  textChanged() {
    this.paint();
  },
  monoChanged() {
    this.paint();
  },
  glyphChanged() {
    this.paint();
  },
  paint() {
    const { icon, labelText, valueText } = this.$;
    labelText.setContent(this.label);
    icon.setIcon(this.glyph);
    icon.setShowing(this.glyph !== '');
    valueText.setContent(this.text);
    valueText.addRemoveClass('mono', this.mono);
  },
} satisfies CodeBehind);

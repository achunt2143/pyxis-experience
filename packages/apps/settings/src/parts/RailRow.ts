import { view } from '@duyojs/duyo';
import spec from './RailRow.view.json';
import { createElement } from 'react';
import { RailGlyph } from '../glyph';
import type { SectionDef } from '../model';
import type { CodeBehind } from './RailRow.view.gen';

/** What the rail gives a row: the section and whether it is the open one. */
export interface RailItem {
  section: SectionDef;
  selected: boolean;
}

/** One entry of the section rail. `data-settings-section` (the suites' selector) is on the row, around the Item, as it was. */
export default view(spec, {
  create() {
    this.inherited();
    this.itemChanged();
  },
  itemChanged() {
    const item = this.item as RailItem | null;
    if (!item) return;
    const { section, selected } = item;
    // role/tabIndex: remochi's Item gave a clickable row these itself; the Duyo Item kind
    // passes it no onClick, so the row carries them and the rail handles Enter/Space.
    this.setAttributes({
      'data-settings-section': section.id,
      role: 'button',
      tabIndex: 0,
      ...(selected ? { 'aria-current': 'page' } : {}),
    });
    const row = this.$.item;
    row.setTitle(section.label);
    row.setSelected(selected);
    row.setIcon(createElement(RailGlyph, { icon: section.icon, color: section.color, bg: section.bg, selected }));
  },
} satisfies CodeBehind);

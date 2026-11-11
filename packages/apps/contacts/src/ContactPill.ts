import { view } from '@duyojs/duyo';
import spec from './ContactPill.view.json';
import { pillStyle } from './model';
import type { CodeBehind } from './ContactPill.view.gen';

/** What the list gives a pill: `{ id: 'Work', count: 3, active: false }`. */
export interface PillItem {
  id: string;
  count: number;
  active: boolean;
}

/** A category filter pill: label and count; the colours are one style string. */
export default view(spec, {
  create() {
    this.inherited();
    this.itemChanged();
  },
  itemChanged() {
    const item = this.item as PillItem | null;
    if (!item) return;
    this.setStyle(pillStyle(item.active));
    this.$.label.setContent(item.id === 'Starred' ? '★ Starred' : item.id);
    this.$.count.setContent(String(item.count));
    this.$.count.setStyle(
      item.active ? 'opacity:0.9;background:rgba(255,255,255,0.25)' : 'opacity:0.65;background:rgba(0,0,0,0.05)'
    );
  },
} satisfies CodeBehind);

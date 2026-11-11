import { view } from '@duyojs/duyo';
import spec from './NotePill.view.json';
import { CATEGORY_COLORS, pillStyle } from './model';
import type { CodeBehind } from './NotePill.view.gen';

/** What the list gives a pill: `{ id: 'Work', count: 3, active: false }`. */
export interface PillItem {
  id: string;
  count: number;
  active: boolean;
}

/** A category filter pill: a button with an optional pin or colour dot, a label and a count. */
export default view(spec, {
  create() {
    this.inherited();
    this.itemChanged();
  },

  itemChanged() {
    const item = this.item as PillItem | null;
    if (!item) return;
    const { pin, dot, label, count } = this.$;
    const pinned = item.id === 'Pinned';
    this.setStyle(pillStyle(item.id, item.active));

    pin.setShowing(pinned);
    // lucide's `fill` is not a pyxis.Icon property; the svg takes it from its style.
    pin.setStyle(pinned && item.active ? 'fill:#b45309' : '');
    pin.setColor(item.active ? '#b45309' : undefined);

    dot.setShowing(!pinned && item.id !== 'All');
    dot.setStyle(`background:${CATEGORY_COLORS[item.id] || '#3b82f6'}`);

    label.setContent(item.id);
    count.setContent(String(item.count));
    count.setStyle(
      item.active
        ? 'opacity:1;background:rgba(0,0,0,0.08)'
        : 'opacity:0.6;background:var(--color-surface-hover, #f3f4f6)'
    );
  },
} satisfies CodeBehind);

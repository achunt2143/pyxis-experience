import { view } from '@duyojs/duyo';
import spec from './TaskPill.view.json';
import type { PillItem } from './model';
import type { CodeBehind } from './TaskPill.view.gen';

/** A quick-add chip or a priority button: icon and label, the whole look one style string. */
export default view(spec, {
  create() {
    this.inherited();
    this.itemChanged();
  },
  itemChanged() {
    const item = this.item as PillItem | null;
    if (!item) return;
    const { icon, label } = this.$;
    this.setStyle(item.style);
    icon.setIcon(item.icon);
    icon.setSize(item.iconSize);
    icon.setStyle(item.iconStyle);
    label.setContent(item.label);
  },
} satisfies CodeBehind);

import { view } from '@duyojs/duyo';
import spec from './PermBadge.view.json';
import { ENFORCED_PERMISSIONS } from './model';
import type { CodeBehind } from './PermBadge.view.gen';

/** One requested permission; `item` is its name. Green if the bridge enforces it, grey if not. */
export default view(spec, {
  create() {
    this.inherited();
    this.itemChanged();
  },

  itemChanged() {
    const name = String(this.item ?? '');
    const enforced = ENFORCED_PERMISSIONS.has(name);
    const { badge } = this.$;
    badge.setContent(name);
    badge.setBackground(enforced ? 'rgba(16, 185, 129, 0.15)' : 'rgba(107, 114, 128, 0.12)');
    badge.setColor(enforced ? '#065f46' : '#374151');
  },
} satisfies CodeBehind);

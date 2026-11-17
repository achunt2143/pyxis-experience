import { view } from '@duyojs/duyo';
import type { SwatchItem } from '../usersModel';
import spec from './Swatch.view.json';
import type { CodeBehind } from './Swatch.view.gen';

/**
 * One accent colour of the profile's choice: a round swatch, ringed when it is the user's.
 * A Repeater row (`item` is a SwatchItem); the profile handles `ontap` (the sender's `item`
 * says which). `data-profile-accent` is the hex, for suites.
 */
export default view(spec, {
  create() {
    this.inherited();
    this.itemChanged();
  },
  itemChanged() {
    const item = this.item as SwatchItem | null;
    if (!item) return;
    this.$.dot.setStyle(`background:${item.hex}`);
    this.addRemoveClass('checked', item.checked);
    this.setAttributes({
      role: 'radio',
      'aria-checked': item.checked,
      'aria-label': item.name,
      title: item.name,
      'data-profile-accent': item.hex,
    });
  },
} satisfies CodeBehind);

import { view } from '@duyojs/duyo';
import { createElement } from 'react';
import { Badge } from 'remochi';
import type { AudioOutput } from '@pyxis/app-sdk';
import spec from './OutputRow.view.json';
import type { CodeBehind } from './OutputRow.view.gen';

/** One audio device rendered as a Remochi Item with a "Default" badge when active. */
export default view(spec, {
  create() {
    this.inherited();
    this.itemChanged();
  },
  itemChanged() {
    const output = this.item as AudioOutput | null;
    if (!output) return;
    const { item } = this.$;
    this.setAttributes({ role: 'button', tabIndex: 0 });
    item.setTitle(output.description);
    item.setSubtitle(output.name);
    item.setSelected(output.isDefault);
    item.setRightContent(
      output.isDefault
        ? createElement(Badge, {
            content: 'Default',
            background: 'var(--mochi-primary)',
            color: 'var(--mochi-primary-text, #ffffff)',
          })
        : undefined
    );
    this.addRemoveClass('current', output.isDefault);
  },
} satisfies CodeBehind);

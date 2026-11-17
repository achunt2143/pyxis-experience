import { view, type Component, type ComponentEvent } from '@duyojs/duyo';
import spec from './BrowserPill.view.json';
import type { CodeBehind } from './BrowserPill.view.gen';

/** What the app gives a view-selector pill. */
export interface PillItem {
  id: 'speedDial' | 'bookmarks' | 'history';
  label: string;
  count: number;
}

/** One of the three view pills ("Top Sites", "Bookmarks", "History") with its count. */
export default view(spec, {
  create() {
    this.inherited();
    this.itemChanged();
    this.activeChanged();
  },
  itemChanged() {
    const item = this.item as PillItem | null;
    if (!item) return;
    this.$.label.setContent(item.label);
    this.$.count.setContent(String(item.count));
  },
  activeChanged() {
    this.addRemoveClass('active', this.active);
    this.setAttributes({ tabIndex: 0, 'aria-pressed': String(!!this.active) });
  },
  pillKeyDown(_sender: Component, event: ComponentEvent) {
    if (event['key'] === 'Enter' || event['key'] === ' ') {
      event['preventDefault']?.();
      this.bubble('ontap', { type: 'tap', originator: this });
      return true;
    }
    return false;
  },
} satisfies CodeBehind);

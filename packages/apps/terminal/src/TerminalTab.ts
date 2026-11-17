import { view, type Component, type ComponentEvent } from '@duyojs/duyo';
import spec from './TerminalTab.view.json';
import type { TabInfo } from './model';
import type { CodeBehind } from './TerminalTab.view.gen';

/** One tab in the strip. `item` is the TabInfo; `active` and `closable` are set by the app. */
export default view(spec, {
  create() {
    this.inherited();
    this.itemChanged();
    this.activeChanged();
    this.closableChanged();
  },

  itemChanged() {
    const tab = this.item as TabInfo | null;
    if (tab) {
      this.$.title.setContent(tab.title);
      this.$.close.setAttributes({
        role: 'button',
        tabIndex: 0,
        title: 'Close tab',
        'aria-label': `Close ${tab.title}`,
      });
    }
  },
  activeChanged() {
    this.addRemoveClass('active', this.active);
    this.setAttributes({ role: 'tab', tabIndex: 0, 'aria-selected': String(!!this.active) });
  },
  closableChanged() {
    this.$.close.setShowing(this.closable);
  },

  tabKeyDown(_sender: Component, event: ComponentEvent) {
    if (event['key'] === 'Enter' || event['key'] === ' ') {
      event['preventDefault']?.();
      this.bubble('ontap', { type: 'tap', originator: this });
      return true;
    }
    return false;
  },

  closeKeyDown(_sender: Component, event: ComponentEvent) {
    if (event['key'] === 'Enter' || event['key'] === ' ') {
      event['preventDefault']?.();
      event['stopPropagation']?.();
      this.closeClicked();
      return true;
    }
    return false;
  },

  /** The X: closes this tab and, by returning true, does not also select it. */
  closeClicked() {
    const tab = this.item as TabInfo | null;
    if (tab) this.doCloseTab({ id: tab.id });
    return true;
  },
} satisfies CodeBehind);

import { view } from '@duyojs/duyo';
import spec from './TerminalTab.view.json';
import type { TabInfo } from './model';
import type { CodeBehind } from './TerminalTab.view.gen';

/** One tab in the strip. `item` is the TabInfo; `active` and `closable` are set by the app. */
export default view(spec, {
  create() {
    this.inherited();
    this.itemChanged();
    this.closableChanged();
  },

  itemChanged() {
    const tab = this.item as TabInfo | null;
    if (tab) this.$.title.setContent(tab.title);
  },
  activeChanged() {
    this.addRemoveClass('active', this.active);
  },
  closableChanged() {
    this.$.close.setShowing(this.closable);
  },

  /** The X: closes this tab and, by returning true, does not also select it. */
  closeClicked() {
    const tab = this.item as TabInfo | null;
    if (tab) this.doCloseTab({ id: tab.id });
    return true;
  },
} satisfies CodeBehind);

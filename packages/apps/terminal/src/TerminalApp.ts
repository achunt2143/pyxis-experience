import { view, type Component, type ComponentEvent } from '@duyojs/duyo';
import { registerIcons } from '@pyxis/app-sdk/duyo';
import { Keyboard, Plus, Terminal as TerminalIcon, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import spec from './TerminalApp.view.json';
import { FONT_MAX, FONT_MIN, QUICK_KEYS, type TabInfo } from './model';
import { TerminalHub } from './terminalHub';
import type { CodeBehind } from './TerminalApp.view.gen';
import './TerminalTab';
import './terminal.css';

registerIcons({ Keyboard, Plus, Terminal: TerminalIcon, Trash2, X, ZoomIn, ZoomOut });

/**
 * Terminal: Enhanced Multi-Tab Terminal Emulator for Pyxis OS with tactile Mochi tabs,
 * the Palm webOS touch helper ribbon (quick keys), font scaling, and native/mock shell
 * support.
 *
 * This kind owns the chrome's state (the tabs, which is active, the font size, the
 * ribbon) and none of the terminals: those live in the `Terminal.Screens` island, which
 * the app reaches only through `hub` (focus, clear, type a key) and which tells it two
 * things (a shell exited, a mock shell was given a title).
 */
export default view(spec, {
  create() {
    this.inherited();
    this.setAttributes({ 'data-window-id': this.windowId });
    this._hub = new TerminalHub();
    this._nextTab = 2;
    this.$.screens.setHub(this._hub);
    this.$.keys.setItems(QUICK_KEYS);
    this.sync();
  },

  // Tabs.
  newTab() {
    const id = `tab-${Date.now()}`;
    const title = `bash ${this._nextTab++}`;
    this.setTabs([...(this.tabs as TabInfo[]), { id, title }]);
    this.setActiveId(id);
    this.sync();
    return true;
  },
  pickTab(sender: Component) {
    const id = (sender['item'] as TabInfo).id;
    this.setActiveId(id);
    this.sync();
    this._hub.focus(id);
    return true;
  },
  /** The X of a tab. */
  closeTab(_sender: Component, event: ComponentEvent) {
    this.closeById(event['id']);
    return true;
  },
  /** A tab's shell ended (`[process exited]`, or the mock shell's `exit`). */
  tabExited(_sender, event) {
    this.closeById(event['id']);
    return true;
  },
  titled(_sender, event) {
    const { id, title } = event as { id: string; title: string };
    this.setTabs((this.tabs as TabInfo[]).map((t) => (t.id === id ? { ...t, title } : t)));
    this.sync();
    return true;
  },
  /** Last tab gone closes the app (the tab stays, as it did); else the neighbour takes over. */
  closeById(id: string) {
    const tabs = this.tabs as TabInfo[];
    const remaining = tabs.filter((t) => t.id !== id);
    if (remaining.length === 0) {
      this.doClose();
      return;
    }
    if (this.activeId === id) this.setActiveId(remaining[remaining.length - 1].id);
    this.setTabs(remaining);
    this.sync();
  },

  // Toolbar.
  toggleRibbon() {
    this.setShowRibbon(!this.showRibbon);
    this.sync();
    return true;
  },
  clearActive() {
    this._hub.clear(this.activeId);
    return true;
  },
  zoomIn() {
    this.setFontSize(Math.min(FONT_MAX, this.fontSize + 1));
    this.sync();
    return true;
  },
  zoomOut() {
    this.setFontSize(Math.max(FONT_MIN, this.fontSize - 1));
    this.sync();
    return true;
  },

  // Ribbon.
  sendQuick(_sender, event) {
    this._hub.sendKey(this.activeId, event['value']);
    return true;
  },

  /** Per-row state that is not the item: which tab is active, whether one can be closed. */
  setupTab(_sender, event) {
    const tabs = this.tabs as TabInfo[];
    event['component'].setActive(event['item'].id === this.activeId);
    event['component'].setClosable(tabs.length > 1);
    return true;
  },

  /** Pushes what the chrome shows. Setting a value a child already has changes nothing. */
  sync() {
    const { tabStrip, screens, ribbon, sizeLabel, keysButton, keysIcon, keysLabel } = this.$;
    const tabs = this.tabs as TabInfo[];
    tabStrip.setItems(tabs);
    tabStrip.refresh();
    screens.setTabs(tabs);
    screens.setActiveId(this.activeId);
    screens.setFontSize(this.fontSize);
    sizeLabel.setContent(`${this.fontSize}px`);
    ribbon.setShowing(this.showRibbon);
    keysButton.setVariant(this.showRibbon ? 'affirmative' : 'normal');
    keysIcon.setStyle(`vertical-align:middle;margin-right:${this.showRibbon ? '4px' : '0'}`);
    keysLabel.setShowing(this.showRibbon);
  },
} satisfies CodeBehind);

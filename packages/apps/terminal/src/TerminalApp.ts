import { view, type Component, type ComponentEvent } from '@duyojs/duyo';
import { onDestroy, registerIcons } from '@pyxis/app-sdk/duyo';
import {
  ClipboardPaste,
  Copy,
  Keyboard,
  Plus,
  Terminal as TerminalIcon,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import spec from './TerminalApp.view.json';
import {
  FONT_DEFAULT,
  FONT_MAX,
  FONT_MIN,
  QUICK_KEYS,
  matchTerminalShortcut,
  type TabInfo,
  type TerminalMode,
} from './model';
import { TerminalHub } from './terminalHub';
import type { CodeBehind } from './TerminalApp.view.gen';
import './TerminalTab';
import './terminal.css';

registerIcons({ ClipboardPaste, Copy, Keyboard, Plus, Terminal: TerminalIcon, Trash2, X, ZoomIn, ZoomOut });

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
    this._modes = new Map<string, TerminalMode>();
    this.$.tabStrip.setAttributes({ role: 'tablist', 'aria-label': 'Terminal tabs' });
    this.$.screens.setHub(this._hub);
    this.$.keys.setItems(QUICK_KEYS);

    const onKeyDown = (e: KeyboardEvent) => {
      if (this.destroyed) return;
      const action = matchTerminalShortcut(e);
      if (!action) return;
      e.preventDefault();
      if (e.repeat && (action === 'newTab' || action === 'closeTab' || action === 'copy' || action === 'paste')) {
        return;
      }
      switch (action) {
        case 'newTab':
          this.newTab();
          break;
        case 'closeTab':
          this.closeById(this.activeId);
          break;
        case 'copy':
          void this.copyActive();
          break;
        case 'paste':
          void this.pasteActive();
          break;
        case 'zoomIn':
          this.zoomIn();
          break;
        case 'zoomOut':
          this.zoomOut();
          break;
        case 'zoomReset':
          this.zoomReset();
          break;
        case 'nextTab':
          this.cycleTab(1);
          break;
        case 'prevTab':
          this.cycleTab(-1);
          break;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    onDestroy(this, () => {
      document.removeEventListener('keydown', onKeyDown);
    });

    this.sync();
  },

  /** remochi.Button takes no aria attributes: label the inner <button> elements once drawn. */
  rendered() {
    this.inherited();
    const labelButton = (comp: Component, label: string) => {
      const host = document.querySelector(`[data-duyo-id="${comp.id}"]`);
      host?.querySelector('button')?.setAttribute('aria-label', label);
    };
    labelButton(this.$.keysButton, 'Toggle Palm Touch Quick Keys Ribbon');
    labelButton(this.$.copyButton, 'Copy selection');
    labelButton(this.$.pasteButton, 'Paste from clipboard');
    labelButton(this.$.clearButton, 'Clear terminal screen');
    labelButton(this.$.zoomOutBtn, 'Zoom Out');
    labelButton(this.$.zoomInBtn, 'Zoom In');
  },

  // Tabs.
  newTab() {
    const seq = this._nextTab++;
    const id = `tab-${Date.now()}-${seq}`;
    const title = `bash ${seq}`;
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
  cycleTab(delta: 1 | -1) {
    const tabs = this.tabs as TabInfo[];
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex((t) => t.id === this.activeId);
    const cur = idx >= 0 ? idx : 0;
    const next = tabs[(cur + delta + tabs.length) % tabs.length]!;
    this.setActiveId(next.id);
    this.sync();
    this._hub.focus(next.id);
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
  modeChanged(_sender, event) {
    const { id, mode } = event as { id: string; mode: TerminalMode };
    (this._modes as Map<string, TerminalMode>).set(id, mode);
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
    (this._modes as Map<string, TerminalMode>).delete(id);
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
  copyActive() {
    void this._hub.copySelection(this.activeId);
    return true;
  },
  pasteActive() {
    void this._hub.pasteClipboard(this.activeId);
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
  zoomReset() {
    this.setFontSize(FONT_DEFAULT);
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
    const {
      tabStrip,
      screens,
      ribbon,
      modeBadge,
      sizeLabel,
      keysButton,
      keysIcon,
      keysLabel,
      zoomOutBtn,
      zoomInBtn,
    } = this.$;
    const tabs = this.tabs as TabInfo[];
    const mode = (this._modes as Map<string, TerminalMode>).get(this.activeId);
    tabStrip.setItems(tabs);
    tabStrip.refresh();
    screens.setTabs(tabs);
    screens.setActiveId(this.activeId);
    screens.setFontSize(this.fontSize);
    if (mode && mode !== 'connecting') {
      modeBadge.setShowing(true);
      modeBadge.setContent(mode === 'pty' ? 'PTY' : 'Mock Shell');
      modeBadge.setAttributes({
        'data-mode': mode,
        title: mode === 'pty' ? 'Connected to native PTY shell' : 'Interactive mock shell',
      });
    } else {
      modeBadge.setShowing(false);
    }
    sizeLabel.setContent(`${this.fontSize}px`);
    zoomOutBtn.setDisabled(this.fontSize <= FONT_MIN);
    zoomInBtn.setDisabled(this.fontSize >= FONT_MAX);
    ribbon.setShowing(this.showRibbon);
    keysButton.setVariant(this.showRibbon ? 'affirmative' : 'normal');
    keysIcon.setStyle(`vertical-align:middle;margin-right:${this.showRibbon ? '4px' : '0'}`);
    keysLabel.setShowing(this.showRibbon);
  },
} satisfies CodeBehind);

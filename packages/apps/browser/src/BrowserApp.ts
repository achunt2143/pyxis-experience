import { view, type Component, type ComponentEvent } from '@duyojs/duyo';
import { echoClient, NOVA_IFACE, type NetworkStatus } from '@pyxis/app-sdk';
import { onDestroy, registerIcons } from '@pyxis/app-sdk/duyo';
import {
  Compass,
  ExternalLink,
  Plus,
  RotateCw,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import spec from './BrowserApp.view.json';
import {
  HOME,
  buildSuggestions,
  clearStoredHistory,
  extractDomain,
  loadBookmarks,
  loadHistory,
  normalizeUrl,
  recordVisit,
  saveBookmarks,
  saveHistory,
  type Bookmark,
  type HistoryItem,
} from './model';
import type { PillItem } from './BrowserPill';
import type { CodeBehind } from './BrowserApp.view.gen';
import './BrowserPill';
import './browser.css';

// Every icon the specs name (the React rows import their own from lucide).
registerIcons({ Compass, ExternalLink, Plus, RotateCw, Search, ShieldCheck, Star, Trash2, X });

/** How often the network status is re-read, as the React app did. */
const NETWORK_POLL_MS = 60_000;
const NETWORK_IFACE = 'org.geckoOS.network';

/**
 * Browser: the Palm webOS Mochi-styled web dashboard and bookmarks manager.
 *
 * It displays no pages. Opening a URL asks Nova (`nova.OpenExternalBrowser`) for a real,
 * independent vela window, which Evo composites like any app; this app is the launcher,
 * the address bar with its "Just Type" suggestions, the speed dial, the bookmarks and the
 * history. Bookmarks and history live in localStorage, under the same keys as before.
 *
 * The root kind owns all the state. Rows (speed dial tiles, bookmark and history rows,
 * suggestions) are adapted React components (pack.ts) because those lists can grow.
 */
export default view(spec, {
  create() {
    this.inherited();
    this.setAttributes({ 'data-window-id': this.windowId });
    this.setBookmarks(loadBookmarks());
    this.setHistory(loadHistory());
    // The React app wrote both on mount (its effects), so a fresh profile gets its defaults stored.
    saveBookmarks(this.bookmarks as Bookmark[]);
    saveHistory(this.history as HistoryItem[]);

    // Click outside the address bar dismisses the suggestions.
    const onMouseDown = (e: MouseEvent) => {
      const box = document.querySelector(`[data-duyo-id="${this.$.addressBox.id}"]`);
      if (box && !box.contains(e.target as Node)) {
        this.setInputFocused(false);
        this.sync();
      }
    };
    document.addEventListener('mousedown', onMouseDown);

    // Network status: read now and every minute. Unknown (no answer) counts as online.
    const poll = async () => {
      const res = (await echoClient.callMethod('network', NETWORK_IFACE, 'getStatus', {})) as NetworkStatus | undefined;
      if (this.destroyed) return;
      this.setOnline(!(res && !res.connected));
      this.sync();
    };
    void poll();
    const timer = setInterval(() => void poll(), NETWORK_POLL_MS);

    onDestroy(this, () => {
      document.removeEventListener('mousedown', onMouseDown);
      clearInterval(timer);
    });
    this.sync();
  },

  /** remochi.Input takes no aria attributes (it is not a pyxis.Control): label the field once drawn. */
  rendered() {
    this.inherited();
    const host = document.querySelector(`[data-duyo-id="${this.$.address.id}"]`);
    host?.querySelector('input')?.setAttribute('aria-label', 'address bar');
  },

  // ---- Address bar ----
  addressInput(_sender: Component, event: ComponentEvent) {
    this.setInput(String(event['value'] ?? ''));
    this.sync();
    return true;
  },
  addressFocus() {
    this.setInputFocused(true);
    this.sync();
    return true;
  },
  /** Enter in the field (the form's submit). */
  submitAddress(_sender: Component, event: ComponentEvent) {
    event['preventDefault']?.();
    void this.openUrl(this.input);
    return true;
  },
  clearInput() {
    this.setInput('');
    this.setInputFocused(false);
    this.$.address.setValue('');
    this.sync();
    return true;
  },
  toggleStar() {
    if (this.lastOpened) this.toggleBookmark(this.lastOpened);
    return true;
  },
  goHome() {
    this.setLastOpened(null);
    this.setInput('');
    this.setInputFocused(false);
    this.$.address.setValue('');
    this.sync();
    return true;
  },
  reopen() {
    if (this.lastOpened) void this.openUrl(this.lastOpened);
    return true;
  },
  closeBanner() {
    this.setLastOpened(null);
    this.sync();
    return true;
  },

  /** Opens `raw` (a URL, a domain or a search) in an independent vela window through Nova. */
  async openUrl(raw: string) {
    const url = normalizeUrl(raw);
    if (url === HOME) {
      this.goHome();
      return;
    }

    this.setOpening(true);
    this.setError(null);
    this.sync();
    const res = (await echoClient.callMethod('nova', NOVA_IFACE, 'OpenExternalBrowser', { url })) as
      | { sessionId?: string }
      | undefined;
    if (this.destroyed) return;
    this.setOpening(false);
    this.setInputFocused(false);

    if (!res || !res.sessionId) {
      this.setError(`Couldn't open ${url}`);
      this.sync();
      return;
    }

    this.setLastOpened(url);
    this.setInput(url);
    this.$.address.setValue(url);
    this.setHistory(recordVisit(this.history as HistoryItem[], url));
    saveHistory(this.history as HistoryItem[]);
    this.sync();
  },

  /** A row (tile, bookmark, history entry or suggestion) was opened. */
  openItem(_sender: Component, event: ComponentEvent) {
    void this.openUrl(String(event['url'] ?? ''));
    return true;
  },

  // ---- Bookmarks ----
  toggleBookmark(url: string) {
    if (!url || url === HOME) return;
    const bookmarks = this.bookmarks as Bookmark[];
    if (bookmarks.some((b) => b.url === url)) {
      this.setBookmarks(bookmarks.filter((b) => b.url !== url));
    } else {
      this.setBookmarks([{ id: `bm-${Date.now()}`, title: extractDomain(url), url, addedAt: Date.now() }, ...bookmarks]);
    }
    saveBookmarks(this.bookmarks as Bookmark[]);
    this.sync();
  },
  removeBookmark(_sender: Component, event: ComponentEvent) {
    this.setBookmarks((this.bookmarks as Bookmark[]).filter((b) => b.id !== event['id']));
    saveBookmarks(this.bookmarks as Bookmark[]);
    this.sync();
    return true;
  },
  toggleAdd() {
    this.setShowAdd(!this.showAdd);
    this.sync();
    return true;
  },
  /** The speed dial's "Add Shortcut" tile: opens the form, which the Bookmarks view shows. */
  addShortcut() {
    this.setShowAdd(true);
    this.sync();
    return true;
  },
  cancelAdd() {
    this.setShowAdd(false);
    this.sync();
    return true;
  },
  saveBookmark() {
    const { newTitle, newUrl } = this.$;
    if (!String(newUrl.value).trim()) return true;
    const url = normalizeUrl(String(newUrl.value));
    const title = String(newTitle.value).trim() || extractDomain(url);
    this.setBookmarks([{ id: `bm-${Date.now()}`, title, url, addedAt: Date.now() }, ...(this.bookmarks as Bookmark[])]);
    saveBookmarks(this.bookmarks as Bookmark[]);
    newTitle.setValue('');
    newUrl.setValue('');
    this.setShowAdd(false);
    this.sync();
    return true;
  },
  // ---- History ----
  clearHistory() {
    this.setHistory([]);
    saveHistory([]);
    clearStoredHistory();
    this.sync();
    return true;
  },
  removeHistoryItem(_sender: Component, event: ComponentEvent) {
    this.setHistory((this.history as HistoryItem[]).filter((h) => h.id !== event['id']));
    saveHistory(this.history as HistoryItem[]);
    this.sync();
    return true;
  },

  // ---- View selector ----
  pickTab(sender: Component) {
    this.setActiveTab((sender['item'] as PillItem).id);
    this.sync();
    return true;
  },
  setupPill(_sender: Component, event: ComponentEvent) {
    event['component'].setActive(event['item'].id === this.activeTab);
    return true;
  },

  /**
   * Pushes what the screen shows. Only the visible view's list is filled, so the tree holds
   * one list at a time; setting a value a child already has changes nothing.
   */
  sync() {
    const $ = this.$;
    const bookmarks = this.bookmarks as Bookmark[];
    const history = this.history as HistoryItem[];
    const tab = this.activeTab as PillItem['id'];
    const lastOpened = this.lastOpened as string | null;
    const input = this.input as string;
    const starred = !!lastOpened && bookmarks.some((b) => b.url === lastOpened);

    // Header
    $.reloadWrap.setShowing(!!lastOpened);
    $.reload.setDisabled(this.opening);
    $.clear.setShowing(input.length > 0);
    $.star.setShowing(!!lastOpened);
    $.star.setAttributes({ title: starred ? 'Remove Bookmark' : 'Add to Bookmarks' });
    $.star.setStyle(`color:${starred ? '#f59e0b' : 'var(--color-text-muted, #9ca3af)'}`);
    $.starIcon.setStyle(`fill:${starred ? 'currentColor' : 'none'}`);
    $.offline.setShowing(!this.online);
    $.shield.setShowing(!!this.online);

    // Suggestions dropdown
    const suggestions = this.inputFocused ? buildSuggestions(input, lastOpened, bookmarks, history) : [];
    $.dropdown.setShowing(suggestions.length > 0);
    $.suggestions.setItems(suggestions);

    // Session banner and error
    $.banner.setShowing(!!lastOpened);
    if (lastOpened) {
      $.bannerLetter.setContent(extractDomain(lastOpened).charAt(0).toUpperCase());
      $.bannerUrl.setContent(`Active Session: ${lastOpened}`);
    }
    $.errorBar.setShowing(!!this.error);
    $.errorBar.setContent(this.error ?? '');

    // View selector
    const pills: PillItem[] = [
      { id: 'speedDial', label: '⚡ Top Sites', count: bookmarks.length },
      { id: 'bookmarks', label: '⭐ Bookmarks', count: bookmarks.length },
      { id: 'history', label: '🕒 History', count: history.length },
    ];
    $.pills.setItems(pills);
    $.pills.refresh();
    $.addBookmark.setShowing(tab === 'bookmarks');
    $.clearHistory.setShowing(tab === 'history' && history.length > 0);

    // Views: one list filled at a time.
    $.speedPane.setShowing(tab === 'speedDial');
    $.tiles.setItems(tab === 'speedDial' ? bookmarks : []);
    $.bookmarksPane.setShowing(tab === 'bookmarks');
    $.addForm.setShowing(this.showAdd);
    $.bookmarksEmpty.setShowing(bookmarks.length === 0);
    $.bookmarkRows.setItems(tab === 'bookmarks' ? bookmarks : []);
    $.historyPane.setShowing(tab === 'history');
    $.historyEmpty.setShowing(history.length === 0);
    $.historyRows.setItems(tab === 'history' ? history : []);
  },
} satisfies CodeBehind);

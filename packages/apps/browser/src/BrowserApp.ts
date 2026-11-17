import { createElement, forwardRef } from 'react';
import { view, type Component, type ComponentEvent } from '@duyojs/duyo';
import { getNetworkStatus, openExternalBrowser } from '@pyxis/app-sdk';
import { onDestroy, registerIcons } from '@pyxis/app-sdk/duyo';
import {
  ExternalLink,
  Plus,
  RotateCw,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  X,
  type LucideProps,
} from 'lucide-react';
import spec from './BrowserApp.view.json';
import {
  HOME,
  buildSuggestions,
  clearStoredHistory,
  createUniqueId,
  extractDomain,
  loadBookmarks,
  loadHistory,
  normalizeUrl,
  recordVisit,
  resolveDirectUrl,
  saveBookmarks,
  saveHistory,
  type Bookmark,
  type HistoryItem,
} from './model';
import type { PillItem } from './BrowserPill';
import type { CodeBehind } from './BrowserApp.view.gen';
import './BrowserPill';
import './browser.css';

const Vela = forwardRef<SVGSVGElement, LucideProps>(
  (
    {
      size = 24,
      color = 'currentColor',
      strokeWidth = 2,
      absoluteStrokeWidth,
      className,
      style,
      ...props
    },
    ref
  ) => {
    const resolvedStrokeWidth = absoluteStrokeWidth
      ? (Number(strokeWidth) * 24) / Number(size)
      : strokeWidth;

    return createElement(
      'svg',
      {
        ref,
        xmlns: 'http://www.w3.org/2000/svg',
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'none',
        stroke: color,
        strokeWidth: resolvedStrokeWidth,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        className: className ? `lucide lucide-vela ${className}` : 'lucide lucide-vela',
        style,
        ...props,
      },
      createElement('path', {
        d: 'M11 3.5 C16.5 5.5 19.5 10.5 19 15.5 L11 15.5 Z',
        fill: 'currentColor',
        fillOpacity: 0.22,
      }),
      createElement('path', { d: 'M9 6.5 C6 9 4.8 12 4.5 15.5 L9 15.5 Z' }),
      createElement('path', { d: 'M10 3.5 L10 17.5' }),
      createElement('path', { d: 'M3.5 17.5 L20.5 17.5 L18 20.5 C15.5 21.3 8.5 21.3 6 20.5 Z' }),
      createElement('path', {
        d: 'M18.5 2 L19.2 3.8 L21 4.5 L19.2 5.2 L18.5 7 L17.8 5.2 L16 4.5 L17.8 3.8 Z',
        fill: 'currentColor',
        stroke: 'none',
      })
    );
  }
);
Vela.displayName = 'Vela';

// Every icon the specs name (the React rows import their own from lucide).
registerIcons({ ExternalLink, Plus, RotateCw, Search, ShieldCheck, Star, Trash2, Vela, X });

/** How often the network status is re-read, as the React app did. */
const NETWORK_POLL_MS = 60_000;

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
    this._focusTimer = null as ReturnType<typeof setTimeout> | null;
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

    // Keyboard shortcuts: Ctrl+L / F6 focuses+selects the address bar; Escape dismisses active popovers/banners.
    const onKeyDown = (e: KeyboardEvent) => {
      if (this.destroyed) return;
      if (((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'l') || e.key === 'F6') {
        e.preventDefault();
        const addrEl = document.querySelector<HTMLInputElement>(`[data-duyo-id="${this.$.address.id}"]`);
        if (addrEl) {
          addrEl.focus();
          addrEl.select();
        }
        this.setInputFocused(true);
        this.sync();
        return;
      }
      if (e.key === 'Escape') {
        if (this.$.clearHistoryDialog.getOpen()) return;
        let changed = false;
        if (this.inputFocused) {
          this.setInputFocused(false);
          changed = true;
        }
        if (this.showAdd) {
          this.cancelAdd();
          changed = false;
        }
        if (this.error) {
          this.setError(null);
          changed = true;
        }
        if (changed) this.sync();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    // Network status: read now and every minute. Unknown (no answer) counts as online.
    const poll = async () => {
      try {
        const res = await getNetworkStatus();
        if (this.destroyed) return;
        this.setOnline(!(res && !res.connected));
        this.sync();
      } catch {
        // Keep current status if IPC fails transiently.
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), NETWORK_POLL_MS);

    onDestroy(this, () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      clearInterval(timer);
      if (this._focusTimer) {
        clearTimeout(this._focusTimer);
        this._focusTimer = null;
      }
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
    labelButton(this.$.home, 'Home Dashboard');
    labelButton(this.$.reload, 'Reload in Pyxis Web Engine');
    labelButton(this.$.closeBanner, 'Dismiss active session');
  },

  focusInputControl(comp: Component) {
    const applyFocus = () => {
      if (this.destroyed) return;
      const el = document.querySelector<HTMLInputElement>(`[data-duyo-id="${comp.id}"]`);
      el?.focus();
    };
    if (this._focusTimer) clearTimeout(this._focusTimer as ReturnType<typeof setTimeout>);
    this._focusTimer = setTimeout(() => {
      this._focusTimer = null;
      applyFocus();
    }, 0);
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
    this.setLastSession(null);
    this.setInput('');
    this.setInputFocused(false);
    this.$.address.setValue('');
    this.sync();
    return true;
  },
  reopen() {
    // Nova's OpenExternalBrowser raises/focuses the single-instance "browser" vela window;
    // nova.Focus is restricted to shell-tier peers, so reopen routes through openUrl without re-recording history.
    if (this.lastOpened) void this.openUrl(this.lastOpened, false);
    return true;
  },
  closeBanner() {
    this.setLastOpened(null);
    this.setLastSession(null);
    this.sync();
    return true;
  },
  dismissError() {
    this.setError(null);
    this.sync();
    return true;
  },

  /** Opens `raw` (a URL, a domain or a search) in an independent vela window through Nova. */
  async openUrl(raw: string, recordHistory = true) {
    const url = normalizeUrl(raw);
    if (url === HOME) {
      this.goHome();
      return;
    }

    this.setOpening(true);
    this.setError(null);
    this.sync();
    try {
      const res = await openExternalBrowser(url);
      if (this.destroyed) return;
      this.setInputFocused(false);

      if (!res || !res.sessionId) {
        this.setError(`Couldn't open ${url}`);
        return;
      }

      this.setLastSession({ sessionId: res.sessionId, appId: res.appId ?? 'browser', url });
      this.setLastOpened(url);
      this.setInput(url);
      this.$.address.setValue(url);
      if (recordHistory) {
        this.setHistory(recordVisit(this.history as HistoryItem[], url));
        saveHistory(this.history as HistoryItem[]);
      }
    } catch (err) {
      if (this.destroyed) return;
      const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
      this.setError(`Couldn't open ${url}${detail}`);
    } finally {
      if (!this.destroyed) {
        this.setOpening(false);
        this.sync();
      }
    }
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
      this.setBookmarks([
        { id: createUniqueId('bm'), title: extractDomain(url), url, addedAt: Date.now() },
        ...bookmarks,
      ]);
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
    const next = !this.showAdd;
    this.setShowAdd(next);
    this.setAddError(null);
    this.sync();
    if (next) this.focusInputControl(this.$.newTitle);
    return true;
  },
  /** The speed dial's "Add Shortcut" tile: switches to Bookmarks, shows the form, and focuses it. */
  addShortcut() {
    this.setActiveTab('bookmarks');
    this.setShowAdd(true);
    this.setAddError(null);
    this.sync();
    this.focusInputControl(this.$.newTitle);
    return true;
  },
  addShortcutKeyDown(_sender: Component, event: ComponentEvent) {
    if (event['key'] === 'Enter' || event['key'] === ' ') {
      event['preventDefault']?.();
      this.addShortcut();
      return true;
    }
    return false;
  },
  cancelAdd() {
    this.$.newTitle.setValue('');
    this.$.newUrl.setValue('');
    this.setAddError(null);
    this.setShowAdd(false);
    this.sync();
    return true;
  },
  newUrlInput() {
    if (this.addError) {
      this.setAddError(null);
      this.sync();
    }
    return true;
  },
  saveBookmark(_sender?: Component, event?: ComponentEvent) {
    event?.['preventDefault']?.();
    if (!this.showAdd) return true;
    const { newTitle, newUrl } = this.$;
    const rawUrl = String(newUrl.value ?? '').trim();
    if (!rawUrl) {
      this.setAddError('Please enter a URL.');
      this.sync();
      return true;
    }
    const url = resolveDirectUrl(rawUrl);
    if (!url) {
      this.setAddError('Please enter a valid URL (e.g. https://example.com or localhost:3000).');
      this.sync();
      return true;
    }
    const title = String(newTitle.value ?? '').trim() || extractDomain(url);
    this.setBookmarks([
      { id: createUniqueId('bm'), title, url, addedAt: Date.now() },
      ...(this.bookmarks as Bookmark[]),
    ]);
    saveBookmarks(this.bookmarks as Bookmark[]);
    newTitle.setValue('');
    newUrl.setValue('');
    this.setAddError(null);
    this.setShowAdd(false);
    this.sync();
    return true;
  },
  // ---- History ----
  askClearHistory() {
    this.$.clearHistoryCount.setContent(String((this.history as HistoryItem[]).length));
    this.$.clearHistoryDialog.setOpen(true);
    return true;
  },
  clearHistoryConfirmed() {
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
    const lastSession = this.lastSession as { sessionId: string; appId: string; url: string } | null;
    const input = this.input as string;
    const starred = !!lastOpened && bookmarks.some((b) => b.url === lastOpened);
    const starLabel = starred ? 'Remove Bookmark' : 'Add to Bookmarks';

    // Header
    $.reloadWrap.setShowing(!!lastOpened);
    $.reload.setDisabled(this.opening);
    $.clear.setShowing(input.length > 0);
    $.star.setShowing(!!lastOpened);
    $.star.setAttributes({ title: starLabel, 'aria-label': starLabel });
    $.star.setStyle(`color:${starred ? 'var(--mochi-selected)' : 'var(--mochi-text-muted)'}`);
    $.starIcon.setStyle(`fill:${starred ? 'currentColor' : 'none'}`);
    $.offline.setShowing(!this.online);
    $.shield.setShowing(!!this.online);

    // Suggestions dropdown
    const suggestions = this.inputFocused ? buildSuggestions(input, lastOpened, bookmarks, history) : [];
    $.dropdown.setShowing(suggestions.length > 0);
    $.suggestions.setItems(suggestions);

    // Session banner and error
    $.banner.setShowing(!!lastOpened);
    $.banner.setAttributes({ 'data-session-id': lastSession?.sessionId ?? '' });
    if (lastOpened) {
      $.bannerLetter.setContent(extractDomain(lastOpened).charAt(0).toUpperCase());
      $.bannerUrl.setContent(`Active Session: ${lastOpened}`);
    }
    $.errorBar.setShowing(!!this.error);
    $.errorText.setContent(this.error ?? '');

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
    $.addError.setShowing(!!this.addError);
    $.addError.setContent(this.addError ?? '');
    $.bookmarksEmpty.setShowing(bookmarks.length === 0);
    $.bookmarkRows.setItems(tab === 'bookmarks' ? bookmarks : []);
    $.historyPane.setShowing(tab === 'history');
    $.historyEmpty.setShowing(history.length === 0);
    $.historyRows.setItems(tab === 'history' ? history : []);
  },
} satisfies CodeBehind);

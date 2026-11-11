// @vitest-environment jsdom
import { act, fireEvent } from '@testing-library/react';
import { echoClient } from '@pyxis/app-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BOOKMARKS_STORAGE_KEY,
  DEFAULT_BOOKMARKS,
  RECENT_STORAGE_KEY,
  type Bookmark,
  type HistoryItem,
} from '../model';
import {
  $,
  $$,
  addressBar,
  buttonText,
  click,
  echo,
  fakeEcho,
  focus,
  mountBrowser,
  opened,
  pill,
  rows,
  settle,
  shownText,
  stubCanvas,
  submit,
  suggestions,
  tiles,
  titled,
  titledButton,
  type,
  type Mounted,
} from './testUtils';

// The theme hook would start Echo's clock.
vi.mock('../../../../app-sdk/src/usePyxisTheme', () => ({ usePyxisTheme: () => 'light' }));

stubCanvas();

let m: Mounted | undefined;
beforeEach(() => {
  localStorage.clear();
  fakeEcho();
});
afterEach(() => {
  m?.unmount();
  m = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const stored = <T,>(key: string) => JSON.parse(localStorage.getItem(key) ?? 'null') as T;
const bm = (i: number): Bookmark => ({ id: `b${i}`, title: `Site ${i}`, url: `https://site${i}.example`, addedAt: 1 });
const hist = (i: number): HistoryItem => ({ id: `h${i}`, url: `https://visited${i}.example/page`, title: `visited${i}.example`, visitedAt: Date.now() - i * 60_000 });

describe('Browser: loading', () => {
  it('starts on Top Sites with the default bookmarks, stores them, and labels the field', async () => {
    m = await mountBrowser();
    expect(tiles(m.host).map((t) => t.textContent)).toEqual(
      DEFAULT_BOOKMARKS.map((b) => expect.stringContaining(b.title))
    );
    expect(stored<Bookmark[]>(BOOKMARKS_STORAGE_KEY).map((b) => b.id)).toEqual(['bm-1', 'bm-2', 'bm-3', 'bm-4', 'bm-5']);
    expect(addressBar(m.host)).not.toBeNull();
    expect($(m.host, '[data-window-id]')?.getAttribute('data-window-id')).toBe('standalone');
    expect(pill(m.host, 'Top Sites').textContent).toContain('5');
    expect(pill(m.host, 'Top Sites').classList.contains('active')).toBe(true);
  });

  it('reads bookmarks and history from the v2 keys', async () => {
    localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify([bm(1), bm(2)]));
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify([hist(1)]));
    m = await mountBrowser();
    expect(tiles(m.host)).toHaveLength(2);
    expect(pill(m.host, 'History').textContent).toContain('1');
  });

  it('migrates the legacy keys when there are no v2 ones', async () => {
    localStorage.setItem('pyxis_browser_bookmarks', JSON.stringify([{ title: 'Old', url: 'https://old.example' }]));
    localStorage.setItem('pyxis_browser_recent', JSON.stringify(['https://a.example', 'https://b.example']));
    m = await mountBrowser();
    expect(stored<Bookmark[]>(BOOKMARKS_STORAGE_KEY).map((b) => [b.id, b.title])).toEqual([['bm-legacy-0', 'Old']]);
    expect(stored<HistoryItem[]>(RECENT_STORAGE_KEY).map((h) => [h.id, h.url])).toEqual([
      ['hist-legacy-0', 'https://a.example'],
      ['hist-legacy-1', 'https://b.example'],
    ]);
  });

  it('falls back to the defaults on a corrupt store', async () => {
    localStorage.setItem(BOOKMARKS_STORAGE_KEY, '{nope');
    localStorage.setItem(RECENT_STORAGE_KEY, '{nope');
    m = await mountBrowser();
    expect(tiles(m.host)).toHaveLength(5);
    expect(pill(m.host, 'History').textContent).toContain('0');
  });
});

describe('Browser: opening a page', () => {
  it('Enter opens a domain through Nova, shows the session, and records the visit', async () => {
    m = await mountBrowser();
    type(addressBar(m.host), 'example.com/path');
    submit(addressBar(m.host));
    await settle();
    expect(opened()).toEqual(['https://example.com/path']);
    expect(addressBar(m.host).value).toBe('https://example.com/path');
    expect(shownText(m.host)).toContain('Active Session: https://example.com/path');
    expect(shownText(m.host)).toContain('Running in independent Pyxis Web Engine (vela)');
    expect(stored<HistoryItem[]>(RECENT_STORAGE_KEY).map((h) => [h.url, h.title])).toEqual([
      ['https://example.com/path', 'example.com'],
    ]);
    expect(titled(m.host, 'Reload in Pyxis Web Engine').style.display).not.toBe('none');
    expect(titled(m.host, 'Add to Bookmarks')).not.toBeNull();
  });

  it('turns anything else into a DuckDuckGo search', async () => {
    m = await mountBrowser();
    type(addressBar(m.host), 'pyxis os');
    submit(addressBar(m.host));
    await settle();
    expect(opened()).toEqual(['https://duckduckgo.com/?q=pyxis%20os']);
  });

  it('does nothing for an empty or about:home address', async () => {
    m = await mountBrowser();
    submit(addressBar(m.host));
    type(addressBar(m.host), 'about:home');
    submit(addressBar(m.host));
    await settle();
    expect(opened()).toEqual([]);
  });

  it('says so when Nova will not open it, and records nothing', async () => {
    echo.opens = false;
    m = await mountBrowser();
    type(addressBar(m.host), 'https://example.com');
    submit(addressBar(m.host));
    await settle();
    expect(shownText(m.host)).toContain("Couldn't open https://example.com");
    expect(shownText(m.host)).not.toContain('Active Session');
    expect(stored<HistoryItem[]>(RECENT_STORAGE_KEY)).toEqual([]);
    // The next attempt clears the message.
    echo.opens = true;
    submit(addressBar(m.host));
    await settle();
    expect(shownText(m.host)).not.toContain("Couldn't open");
  });

  it('disables the reload button while the open is in flight', async () => {
    m = await mountBrowser();
    type(addressBar(m.host), 'example.com');
    submit(addressBar(m.host));
    await settle();
    let release!: (v: unknown) => void;
    vi.mocked(echoClient.callMethod).mockImplementation(() => new Promise((r) => (release = r)));
    click(titledButton(m.host, 'Reload in Pyxis Web Engine'));
    await settle();
    expect(titledButton(m.host, 'Reload in Pyxis Web Engine').hasAttribute('disabled')).toBe(true);
    await act(async () => release({ sessionId: 's2' }));
    expect(titledButton(m.host, 'Reload in Pyxis Web Engine').hasAttribute('disabled')).toBe(false);
  });

  it('keeps one history entry per url, newest first, at most fifty', async () => {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(Array.from({ length: 50 }, (_, i) => hist(i))));
    m = await mountBrowser();
    type(addressBar(m.host), 'https://visited3.example/page');
    submit(addressBar(m.host));
    await settle();
    let h = stored<HistoryItem[]>(RECENT_STORAGE_KEY);
    expect(h).toHaveLength(50);
    expect(h[0].url).toBe('https://visited3.example/page');
    expect(h.filter((x) => x.url === 'https://visited3.example/page')).toHaveLength(1);
    type(addressBar(m.host), 'https://brand-new.example');
    submit(addressBar(m.host));
    await settle();
    h = stored<HistoryItem[]>(RECENT_STORAGE_KEY);
    expect(h).toHaveLength(50);
    expect(h[0].url).toBe('https://brand-new.example');
  });

  it('Focus Window opens the session url again; its X ends the session but keeps the address', async () => {
    m = await mountBrowser();
    type(addressBar(m.host), 'https://example.com');
    submit(addressBar(m.host));
    await settle();
    click(buttonText(m.host, 'Focus Window')!);
    await settle();
    expect(opened()).toEqual(['https://example.com', 'https://example.com']);
    expect(shownText(m.host)).toContain('Active Session');
    click($$(m.host, 'button').find((b) => b.querySelector('.lucide-x') && !b.classList.contains('br-icon-btn'))!);
    await settle();
    expect(shownText(m.host)).not.toContain('Active Session');
    expect(addressBar(m.host).value).toBe('https://example.com');
  });

  it('Home clears the session and the address', async () => {
    m = await mountBrowser();
    type(addressBar(m.host), 'https://example.com');
    submit(addressBar(m.host));
    await settle();
    click(titledButton(m.host, 'Home Dashboard'));
    await settle();
    expect(addressBar(m.host).value).toBe('');
    expect(shownText(m.host)).not.toContain('Active Session');
    expect(titled(m.host, 'Reload in Pyxis Web Engine').style.display).toBe('none');
  });
});

describe('Browser: the address bar', () => {
  it('suggests a search, a url, matching bookmarks and history once focused', async () => {
    localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify([bm(1), bm(2)]));
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify([hist(1)]));
    m = await mountBrowser();
    focus(addressBar(m.host));
    expect(suggestions(m.host)).toHaveLength(0);
    type(addressBar(m.host), 'site1');
    expect(suggestions(m.host).map((s) => s.textContent)).toEqual([
      'Search DuckDuckGo for "site1"',
      'Site 1https://site1.example',
    ]);
    type(addressBar(m.host), 'visited1.example');
    expect(suggestions(m.host).map((s) => s.textContent)).toEqual([
      'Search DuckDuckGo for "visited1.example"',
      'Go to https://visited1.examplehttps://visited1.example',
      'visited1.examplehttps://visited1.example/page',
    ]);
  });

  it('opens a clicked suggestion, and offers none for the page already open', async () => {
    m = await mountBrowser();
    focus(addressBar(m.host));
    type(addressBar(m.host), 'github');
    click(suggestions(m.host).find((s) => s.textContent?.includes('GitHub'))!);
    await settle();
    expect(opened()).toEqual(['https://github.com']);
    expect(suggestions(m.host)).toHaveLength(0);
  });

  it('shows no suggestions for a bare about:home or when unfocused, and dismisses them on an outside press', async () => {
    m = await mountBrowser();
    type(addressBar(m.host), 'wiki'); // typed without focus
    expect(suggestions(m.host)).toHaveLength(0);
    focus(addressBar(m.host));
    expect(suggestions(m.host).length).toBeGreaterThan(0);
    act(() => {
      fireEvent.mouseDown(addressBar(m!.host));
    });
    expect(suggestions(m.host).length).toBeGreaterThan(0); // inside: stays
    act(() => {
      fireEvent.mouseDown(document.body);
    });
    expect(suggestions(m.host)).toHaveLength(0);
  });

  it('clears the field from its X', async () => {
    m = await mountBrowser();
    expect(titled(m.host, 'Clear').style.display).toBe('none');
    type(addressBar(m.host), 'abc');
    expect(titled(m.host, 'Clear').style.display).not.toBe('none');
    click(titled(m.host, 'Clear'));
    expect(addressBar(m.host).value).toBe('');
  });

  it('stars and unstars the open page, persisting the bookmark', async () => {
    m = await mountBrowser();
    type(addressBar(m.host), 'https://www.example.org/x');
    submit(addressBar(m.host));
    await settle();
    click(titled(m.host, 'Add to Bookmarks'));
    let b = stored<Bookmark[]>(BOOKMARKS_STORAGE_KEY);
    expect(b[0]).toMatchObject({ title: 'example.org', url: 'https://www.example.org/x' });
    expect(b).toHaveLength(6);
    click(titled(m.host, 'Remove Bookmark'));
    b = stored<Bookmark[]>(BOOKMARKS_STORAGE_KEY);
    expect(b).toHaveLength(5);
  });
});

describe('Browser: views', () => {
  it('highlights the pill of the view that is showing', async () => {
    m = await mountBrowser();
    const active = () => $$(m!.host, '.br-pill.active').map((p) => p.textContent);
    expect(active()).toEqual(['⚡ Top Sites5']);
    click(pill(m.host, 'Bookmarks'));
    expect(active()).toEqual(['⭐ Bookmarks5']);
    click(pill(m.host, 'History'));
    expect(active()).toEqual(['🕒 History0']);
  });

  it('Top Sites tiles open their site; the add tile opens the form the Bookmarks view shows', async () => {
    m = await mountBrowser();
    click(tiles(m.host)[3]);
    await settle();
    expect(opened()).toEqual(['https://github.com']);
    click($(m.host, '.br-add-tile')!);
    click(pill(m.host, 'Bookmarks'));
    expect(shownText(m.host)).toContain('Add New Bookmark');
    expect(rows(m.host)).toHaveLength(5);
    expect(tiles(m.host)).toHaveLength(0);
  });

  it('Bookmarks: opens, deletes, and adds with a title or without', async () => {
    m = await mountBrowser();
    click(pill(m.host, 'Bookmarks'));
    click(buttonText(rows(m.host)[1], 'Open')!);
    await settle();
    expect(opened()).toEqual(['https://en.wikipedia.org']);
    // delete the first row's trash button (the last button in the row)
    const first = rows(m.host)[0];
    click($$(first, 'button').pop()!);
    expect(stored<Bookmark[]>(BOOKMARKS_STORAGE_KEY).map((b) => b.id)).not.toContain('bm-1');
    expect(rows(m.host)).toHaveLength(4);

    click(buttonText(m.host, 'Add Bookmark')!);
    const [title, url] = $$(m.host, 'input[placeholder^="Site Title"], input[placeholder^="URL"]');
    type(url as HTMLInputElement, 'pyxis.dev');
    click(buttonText(m.host, 'Save Bookmark')!);
    let b = stored<Bookmark[]>(BOOKMARKS_STORAGE_KEY);
    expect(b[0]).toMatchObject({ title: 'pyxis.dev', url: 'https://pyxis.dev' });
    expect(shownText(m.host)).not.toContain('Add New Bookmark');

    click(buttonText(m.host, 'Add Bookmark')!);
    type(title as HTMLInputElement, 'My Site');
    type(url as HTMLInputElement, 'https://mine.example');
    click(buttonText(m.host, 'Save Bookmark')!);
    b = stored<Bookmark[]>(BOOKMARKS_STORAGE_KEY);
    expect(b[0]).toMatchObject({ title: 'My Site', url: 'https://mine.example' });
    expect((title as HTMLInputElement).value).toBe('');
  });

  it('Bookmarks: saving with no url does nothing, cancel keeps what was typed', async () => {
    m = await mountBrowser();
    click(pill(m.host, 'Bookmarks'));
    click(buttonText(m.host, 'Add Bookmark')!);
    const [title] = $$(m.host, 'input[placeholder^="Site Title"]');
    type(title as HTMLInputElement, 'Half');
    click(buttonText(m.host, 'Save Bookmark')!);
    expect(stored<Bookmark[]>(BOOKMARKS_STORAGE_KEY)).toHaveLength(5);
    expect(shownText(m.host)).toContain('Add New Bookmark');
    click(buttonText(m.host, 'Cancel')!);
    expect(shownText(m.host)).not.toContain('Add New Bookmark');
    expect((title as HTMLInputElement).value).toBe('Half');
  });

  it('Bookmarks: says so when there are none', async () => {
    localStorage.setItem(BOOKMARKS_STORAGE_KEY, '[]');
    m = await mountBrowser();
    click(pill(m.host, 'Bookmarks'));
    expect(shownText(m.host)).toContain('No bookmarks saved yet. Add your favorite sites!');
  });

  it('History: lists visits, opens and removes one, and clears all with the legacy key', async () => {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify([hist(0), hist(1), hist(2)]));
    localStorage.setItem('pyxis_browser_recent', JSON.stringify(['https://x.example']));
    m = await mountBrowser();
    expect(buttonText(m.host, 'Clear History')).toBeUndefined();
    click(pill(m.host, 'History'));
    expect(rows(m.host)).toHaveLength(3);
    expect(rows(m.host)[0].textContent).toContain('Just now');
    expect(rows(m.host)[1].textContent).toContain('1m ago');
    click($$(rows(m.host)[0], 'button')[0]);
    await settle();
    expect(opened()).toEqual(['https://visited0.example/page']);
    click($$(rows(m.host)[1], 'button')[1]);
    // Opening h0 moved it to the top as a fresh visit; removing the second row drops h1.
    expect(stored<HistoryItem[]>(RECENT_STORAGE_KEY).map((h) => h.id)).toEqual([expect.stringMatching(/^hist-/), 'h2']);
    click(buttonText(m.host, 'Clear History')!);
    expect(localStorage.getItem('pyxis_browser_recent')).toBeNull();
    expect(shownText(m.host)).toContain('No browsing history recorded yet.');
    expect(buttonText(m.host, 'Clear History')).toBeUndefined();
  });

  it('shows Add Bookmark only in Bookmarks and Clear History only in History', async () => {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify([hist(0)]));
    m = await mountBrowser();
    const visible = (text: string) => buttonText(m!.host, text) !== undefined;
    expect(visible('Add Bookmark')).toBe(false);
    expect(visible('Clear History')).toBe(false);
    click(pill(m.host, 'Bookmarks'));
    expect(visible('Add Bookmark')).toBe(true);
    click(pill(m.host, 'History'));
    expect(visible('Clear History')).toBe(true);
  });
});

describe('Browser: network', () => {
  it('shows an offline badge instead of the shield while disconnected, polling each minute', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    m = await mountBrowser();
    const shieldShown = () => {
      const el = titled(m!.host, 'Pyxis Web Protection Active');
      return el.style.display !== 'none';
    };
    const offlineShown = () =>
      $$(m!.host, '[data-duyo-kind]').some((e) => e.textContent === 'offline' && e.style.display !== 'none');
    expect(shieldShown()).toBe(true);
    expect(offlineShown()).toBe(false);
    echo.network = { connected: false, ssid: '', type: 'none' };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(shieldShown()).toBe(false);
    expect(offlineShown()).toBe(true);
    echo.network = { connected: true, ssid: 'x', type: 'wifi' };
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(shieldShown()).toBe(true);
  });

  it('stops polling when the app goes', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    m = await mountBrowser();
    const before = echo.calls.filter((c) => c.method === 'getStatus').length;
    m.unmount();
    m = undefined;
    await vi.advanceTimersByTimeAsync(180_000);
    expect(echo.calls.filter((c) => c.method === 'getStatus').length).toBe(before);
  });
});

// Browser: the data (what is stored, and under which keys), and the pure functions the
// views are built from. No Duyo and no React here, so it is unit-tested directly.
// Moved verbatim from the React app; the storage keys and shapes must not change, since
// they are where an existing user's bookmarks and history live.

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  addedAt: number;
}

export interface HistoryItem {
  id: string;
  url: string;
  title?: string;
  visitedAt: number;
}

export const DEFAULT_BOOKMARKS: Bookmark[] = [
  { id: 'bm-1', title: 'DuckDuckGo', url: 'https://duckduckgo.com', addedAt: Date.now() - 86400000 },
  { id: 'bm-2', title: 'Wikipedia', url: 'https://en.wikipedia.org', addedAt: Date.now() - 86400000 },
  { id: 'bm-3', title: 'webOS Archive', url: 'https://webosarchive.org', addedAt: Date.now() - 86400000 },
  { id: 'bm-4', title: 'GitHub', url: 'https://github.com', addedAt: Date.now() - 86400000 },
  { id: 'bm-5', title: 'Pyxis Project', url: 'https://github.com/geckos', addedAt: Date.now() - 86400000 },
];

export const RECENT_STORAGE_KEY = 'pyxis_browser_recent_v2';
export const BOOKMARKS_STORAGE_KEY = 'pyxis_browser_bookmarks_v2';
export const HOME = 'about:home';

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return HOME;
  if (trimmed === 'about:home') return HOME;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(trimmed)) return `https://${trimmed}`;
  // treat as search query
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}

export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  }
}

export function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export const SITE_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4'];

export function getSiteColor(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SITE_COLORS[Math.abs(hash) % SITE_COLORS.length];
}

/** One line of the address bar's dropdown. */
export interface Suggestion {
  type: 'search' | 'url' | 'bookmark' | 'history';
  title: string;
  url: string;
}

/** How many history entries are kept. */
export const HISTORY_LIMIT = 50;

const LEGACY_BOOKMARKS_KEY = 'pyxis_browser_bookmarks';
const LEGACY_RECENT_KEY = 'pyxis_browser_recent';

export function loadBookmarks(): Bookmark[] {
  try {
    const saved = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
    // Fallback: check legacy key
    const legacy = localStorage.getItem(LEGACY_BOOKMARKS_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      return parsed.map((b: { title: string; url: string }, idx: number) => ({
        id: `bm-legacy-${idx}`,
        title: b.title,
        url: b.url,
        addedAt: Date.now(),
      }));
    }
    return DEFAULT_BOOKMARKS;
  } catch {
    return DEFAULT_BOOKMARKS;
  }
}

export function loadHistory(): HistoryItem[] {
  try {
    const saved = localStorage.getItem(RECENT_STORAGE_KEY);
    if (saved) return JSON.parse(saved);
    // Fallback: check legacy key
    const legacy = localStorage.getItem(LEGACY_RECENT_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      return parsed.map((url: string, idx: number) => ({
        id: `hist-legacy-${idx}`,
        url,
        visitedAt: Date.now() - idx * 3600000,
      }));
    }
    return [];
  } catch {
    return [];
  }
}

export function saveBookmarks(bookmarks: Bookmark[]): void {
  try {
    localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
  } catch {
    // ignore
  }
}

export function saveHistory(history: HistoryItem[]): void {
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // ignore
  }
}

/** Clearing history also drops the legacy key, so it can't come back through the fallback. */
export function clearStoredHistory(): void {
  try {
    localStorage.removeItem(RECENT_STORAGE_KEY);
    localStorage.removeItem(LEGACY_RECENT_KEY);
  } catch {
    // ignore
  }
}

/** A visit recorded at the top of the history: one entry per url, newest first, capped. */
export function recordVisit(prev: HistoryItem[], url: string): HistoryItem[] {
  const next: HistoryItem = {
    id: `hist-${Date.now()}`,
    url,
    title: extractDomain(url),
    visitedAt: Date.now(),
  };
  return [next, ...prev.filter((h) => h.url !== url)].slice(0, HISTORY_LIMIT);
}

/** "Just Type" Search / URL Suggestions */
export function buildSuggestions(
  input: string,
  lastOpened: string | null,
  bookmarks: Bookmark[],
  history: HistoryItem[]
): Suggestion[] {
  const q = input.trim();
  if (!q || q === HOME || q === lastOpened) return [];

  const list: Suggestion[] = [];

  // Search query suggestion
  list.push({
    type: 'search',
    title: `Search DuckDuckGo for "${q}"`,
    url: `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
  });

  // Direct URL suggestion if it resembles a domain or URL
  if (q.includes('.') || q.startsWith('http')) {
    const norm = normalizeUrl(q);
    list.push({
      type: 'url',
      title: `Go to ${norm}`,
      url: norm,
    });
  }

  // Matching bookmarks
  const matchingBm = bookmarks.filter(
    (b) => b.title.toLowerCase().includes(q.toLowerCase()) || b.url.toLowerCase().includes(q.toLowerCase())
  );
  for (const bm of matchingBm.slice(0, 3)) {
    list.push({
      type: 'bookmark',
      title: bm.title,
      url: bm.url,
    });
  }

  // Matching history
  const matchingHist = history.filter(
    (h) => h.url.toLowerCase().includes(q.toLowerCase()) || (h.title && h.title.toLowerCase().includes(q.toLowerCase()))
  );
  for (const h of matchingHist.slice(0, 3)) {
    if (!list.some((item) => item.url === h.url)) {
      list.push({
        type: 'history',
        title: h.title || extractDomain(h.url),
        url: h.url,
      });
    }
  }

  return list;
}

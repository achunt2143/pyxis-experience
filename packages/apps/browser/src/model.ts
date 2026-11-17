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

let idSequence = 0;

/** Generates a collision-free identifier even when multiple entries are created in the same ms. */
export function createUniqueId(prefix: string): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return `${prefix}-${randomUuid}`;
  idSequence += 1;
  return `${prefix}-${Date.now()}-${idSequence}`;
}

function isValidPort(portStr: string): boolean {
  if (!/^\d{1,5}$/.test(portStr)) return false;
  const port = Number(portStr);
  return port >= 1 && port <= 65535;
}

function parseIpv4(host: string): [number, number, number, number] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return null;
  const octets = match.slice(1).map((part) => {
    if (part.length > 1 && part.startsWith('0')) return -1;
    const n = Number(part);
    return n >= 0 && n <= 255 ? n : -1;
  });
  if (octets.some((n) => n < 0)) return null;
  return octets as [number, number, number, number];
}

function isLanIpv4([o1, o2]: [number, number, number, number]): boolean {
  return (
    o1 === 127 ||
    o1 === 10 ||
    o1 === 0 ||
    (o1 === 192 && o2 === 168) ||
    (o1 === 172 && o2 >= 16 && o2 <= 31) ||
    (o1 === 169 && o2 === 254) ||
    (o1 === 100 && o2 >= 64 && o2 <= 127)
  );
}

function isLocalHostname(host: string): boolean {
  const lower = host.toLowerCase();
  return lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.local');
}

function isLocalIpv6(bracketedHost: string): boolean {
  const inner = bracketedHost.slice(1, -1).toLowerCase();
  return (
    inner === '::1' ||
    inner === '::' ||
    inner.startsWith('fe80:') ||
    inner.startsWith('fc') ||
    inner.startsWith('fd')
  );
}

function isDomainHost(host: string): boolean {
  const labels = host.split('.');
  if (labels.length < 2) return false;
  const labelRe = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
  if (!labels.every((label) => labelRe.test(label))) return false;
  const tld = labels[labels.length - 1]!;
  return /^(?:[a-zA-Z]{2,63}|xn--[a-zA-Z0-9-]{2,59})$/.test(tld);
}

/**
 * Resolves `input` to a direct `http://` or `https://` URL if it looks like an explicit URL,
 * localhost, IPv4/IPv6 host (with optional port/path/query/hash), or domain name; otherwise `null`.
 */
export function resolveDirectUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  if (trimmed.toLowerCase() === HOME) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    const normalized = trimmed.replace(/^https?:\/\//i, (scheme) => scheme.toLowerCase());
    try {
      const parsed = new URL(normalized);
      return parsed.hostname ? normalized : null;
    } catch {
      return null;
    }
  }

  const delimIdx = trimmed.search(/[/?#]/);
  const authority = delimIdx === -1 ? trimmed : trimmed.slice(0, delimIdx);
  const rest = delimIdx === -1 ? '' : trimmed.slice(delimIdx);
  if (!authority || authority.includes('@')) return null;

  let host = authority;
  let port: string | undefined;

  if (authority.startsWith('[')) {
    const match = /^(\[[0-9a-fA-F:]+\])(?::(\d+))?$/.exec(authority);
    if (!match) return null;
    host = match[1]!;
    port = match[2];
  } else {
    const colonIdx = authority.lastIndexOf(':');
    if (colonIdx !== -1) {
      host = authority.slice(0, colonIdx);
      port = authority.slice(colonIdx + 1);
      if (!port) return null;
    }
  }

  if (port !== undefined && !isValidPort(port)) return null;

  let scheme: 'http' | 'https' | null = null;
  if (host.startsWith('[')) {
    scheme = isLocalIpv6(host) ? 'http' : 'https';
  } else if (isLocalHostname(host)) {
    scheme = 'http';
  } else {
    const ipv4 = parseIpv4(host);
    if (ipv4) {
      scheme = isLanIpv4(ipv4) ? 'http' : 'https';
    } else if (isDomainHost(host)) {
      scheme = 'https';
    }
  }

  if (!scheme) return null;

  const candidate = `${scheme}://${authority}${rest}`;
  try {
    const parsed = new URL(candidate);
    return parsed.hostname ? candidate : null;
  } catch {
    return null;
  }
}

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed || trimmed.toLowerCase() === HOME) return HOME;
  return resolveDirectUrl(trimmed) ?? `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
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
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
    // Fallback: check legacy key
    const legacy = localStorage.getItem(LEGACY_BOOKMARKS_KEY);
    if (legacy) {
      const parsed: unknown = JSON.parse(legacy);
      if (Array.isArray(parsed)) {
        return parsed.map((b: { title: string; url: string }, idx: number) => ({
          id: `bm-legacy-${idx}`,
          title: b.title,
          url: b.url,
          addedAt: Date.now(),
        }));
      }
    }
    return DEFAULT_BOOKMARKS;
  } catch {
    return DEFAULT_BOOKMARKS;
  }
}

export function loadHistory(): HistoryItem[] {
  try {
    const saved = localStorage.getItem(RECENT_STORAGE_KEY);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed;
    }
    // Fallback: check legacy key
    const legacy = localStorage.getItem(LEGACY_RECENT_KEY);
    if (legacy) {
      const parsed: unknown = JSON.parse(legacy);
      if (Array.isArray(parsed)) {
        return parsed.map((url: string, idx: number) => ({
          id: `hist-legacy-${idx}`,
          url,
          visitedAt: Date.now() - idx * 3600000,
        }));
      }
    }
    return [];
  } catch {
    return [];
  }
}

export function saveBookmarks(bookmarks: Bookmark[]): boolean {
  try {
    localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
    return true;
  } catch {
    return false;
  }
}

export function saveHistory(history: HistoryItem[]): boolean {
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(history));
    return true;
  } catch {
    return false;
  }
}

/** Clearing history also drops the legacy key, so it can't come back through the fallback. */
export function clearStoredHistory(): boolean {
  try {
    localStorage.removeItem(RECENT_STORAGE_KEY);
    localStorage.removeItem(LEGACY_RECENT_KEY);
    return true;
  } catch {
    return false;
  }
}

/** A visit recorded at the top of the history: one entry per url, newest first, capped. */
export function recordVisit(prev: HistoryItem[], url: string): HistoryItem[] {
  const next: HistoryItem = {
    id: createUniqueId('hist'),
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
  if (!q || q.toLowerCase() === HOME || q === lastOpened) return [];

  const list: Suggestion[] = [];

  // Search query suggestion
  list.push({
    type: 'search',
    title: `Search DuckDuckGo for "${q}"`,
    url: `https://duckduckgo.com/?q=${encodeURIComponent(q)}`,
  });

  // Direct URL suggestion if it resolves to a valid direct URL
  const directUrl = resolveDirectUrl(q);
  if (directUrl) {
    list.push({
      type: 'url',
      title: `Go to ${directUrl}`,
      url: directUrl,
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

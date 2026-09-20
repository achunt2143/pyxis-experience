import React, { useEffect, useState } from 'react';
import { Button, Divider, Input, Badge, List, ListHeader, Item } from 'remochi';
import {
  ExternalLink,
  Globe,
  Home as HomeIcon,
  RotateCw,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { useEcho, useNetworkStatus } from '@pyxis/app-sdk';

export interface BrowserAppProps {
  windowId: string;
  onClose?: () => void;
}

interface Bookmark {
  title: string;
  url: string;
}

const DEFAULT_BOOKMARKS: Bookmark[] = [
  { title: 'DuckDuckGo', url: 'https://duckduckgo.com' },
  { title: 'Wikipedia', url: 'https://en.wikipedia.org' },
  { title: 'webOS Archive', url: 'https://webosarchive.org' },
  { title: 'GitHub', url: 'https://github.com' },
  { title: 'Pyxis Project', url: 'https://github.com/geckos' },
];

const RECENT_STORAGE_KEY = 'pyxis_browser_recent';
const BOOKMARKS_STORAGE_KEY = 'pyxis_browser_bookmarks';
const HOME = 'about:home';

function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return HOME;
  if (trimmed === 'about:home') return HOME;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(trimmed)) return `https://${trimmed}`;
  // treat as search query
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}

/**
 * BrowserApp — Mochi-styled web browser.
 *
 * Opens pages in a real, independent vela (Gecko) window rather than
 * embedding them in an `<iframe>` — most real sites send X-Frame-Options/
 * CSP `frame-ancestors` headers that block framing outright.
 */
export const BrowserApp: React.FC<BrowserAppProps> = ({ windowId }) => {
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(RECENT_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [bookmarks, setBookmarks] = useState<Bookmark[]>(() => {
    try {
      const saved = localStorage.getItem(BOOKMARKS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_BOOKMARKS;
    } catch {
      return DEFAULT_BOOKMARKS;
    }
  });

  const [lastOpened, setLastOpened] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const echo = useEcho();
  const network = useNetworkStatus(60_000);

  useEffect(() => {
    try {
      localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recent));
    } catch {
      // ignore
    }
  }, [recent]);

  useEffect(() => {
    try {
      localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify(bookmarks));
    } catch {
      // ignore
    }
  }, [bookmarks]);

  const open = async (raw: string) => {
    const url = normalizeUrl(raw);
    if (url === HOME) {
      setLastOpened(null);
      setInput('');
      return;
    }
    setOpening(true);
    setError(null);
    const res = await echo.openExternalBrowser(url);
    setOpening(false);
    if (!res) {
      setError(`Couldn't open ${url}`);
      return;
    }
    setLastOpened(url);
    setInput(url);
    setRecent((prev) => [url, ...prev.filter((u) => u !== url)].slice(0, 10));
  };

  const clearRecent = () => {
    setRecent([]);
    try {
      localStorage.removeItem(RECENT_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const isBookmarked = (url: string) => bookmarks.some((b) => b.url === url);

  const toggleBookmark = (url: string) => {
    if (!url || url === HOME) return;
    if (isBookmarked(url)) {
      setBookmarks((prev) => prev.filter((b) => b.url !== url));
    } else {
      const title = url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
      setBookmarks((prev) => [...prev, { title, url }]);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void open(input);
  };

  return (
    <div
      data-window-id={windowId}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-background)',
      }}
    >
      {/* Primary Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          flex: '0 0 auto',
        }}
      >
        <span title="Reload">
          <Button
            onClick={() => lastOpened && void open(lastOpened)}
            disabled={!lastOpened || opening}
          >
            <RotateCw size={15} style={{ verticalAlign: 'middle' }} />
          </Button>
        </span>
        <span title="Home">
          <Button onClick={() => open(HOME)}>
            <HomeIcon size={15} style={{ verticalAlign: 'middle' }} />
          </Button>
        </span>

        <form onSubmit={onSubmit} style={{ flex: 1, display: 'flex', minWidth: 0 }}>
          <Input
            placeholder="Search or enter address"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="address bar"
            style={{ width: '100%' }}
          />
        </form>

        {lastOpened && (
          <span title={isBookmarked(lastOpened) ? 'Remove Bookmark' : 'Add to Bookmarks'}>
            <Button
              variant={isBookmarked(lastOpened) ? 'affirmative' : 'normal'}
              onClick={() => toggleBookmark(lastOpened)}
            >
              <Star
                size={15}
                fill={isBookmarked(lastOpened) ? 'currentColor' : 'none'}
                style={{ verticalAlign: 'middle' }}
              />
            </Button>
          </span>
        )}

        {network && !network.connected ? (
          <Badge content="offline" background="var(--color-error)" color="#fff" />
        ) : null}
      </div>

      {/* Bookmarks bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border-light)',
          flex: '0 0 auto',
          overflowX: 'auto',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginRight: 4, whiteSpace: 'nowrap' }}>
          Bookmarks:
        </span>
        {bookmarks.map((b) => (
          <button
            key={b.url}
            type="button"
            onClick={() => void open(b.url)}
            style={{
              background: 'var(--color-background)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              padding: '2px 8px',
              fontSize: 12,
              color: 'var(--color-text)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              whiteSpace: 'nowrap',
            }}
          >
            <Globe size={11} style={{ opacity: 0.7 }} />
            <span>{b.title}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--color-surface)' }}>
        {!lastOpened ? (
          <HomePage
            recent={recent}
            bookmarks={bookmarks}
            opening={opening}
            error={error}
            onSearch={(q) => void open(q)}
            onClearRecent={clearRecent}
          />
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: 20,
              textAlign: 'center',
            }}
          >
            <ExternalLink size={28} style={{ opacity: 0.6 }} />
            <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>
              Opened in Pyxis Web Engine
            </span>
            <span
              style={{
                color: 'var(--color-text-secondary)',
                fontSize: 13,
                wordBreak: 'break-all',
                maxWidth: 480,
              }}
            >
              {lastOpened}
            </span>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Button onClick={() => void open(lastOpened)} disabled={opening}>
                Open again
              </Button>
              <Button onClick={() => open(HOME)}>Return Home</Button>
            </div>
            {error ? (
              <Badge content={error} background="var(--color-error)" color="#fff" />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

const HomePage: React.FC<{
  recent: string[];
  bookmarks: Bookmark[];
  opening: boolean;
  error: string | null;
  onSearch: (q: string) => void;
  onClearRecent: () => void;
}> = ({ recent, bookmarks, opening, error, onSearch, onClearRecent }) => {
  const [q, setQ] = useState('');

  return (
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '36px 20px',
        background:
          'radial-gradient(circle at 50% 25%, var(--mochi-primary-soft) 0%, transparent 65%), var(--color-background)',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1
          style={{
            margin: 0,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: 'var(--color-primary)',
            fontSize: 32,
          }}
        >
          Pyxis Web
        </h1>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
          Fast, private web experience built for Pyxis OS
        </span>
      </div>

      <Divider />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) onSearch(q);
        }}
        style={{
          width: 'min(560px, 86%)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Search size={16} style={{ opacity: 0.6, flex: '0 0 auto' }} />
        <Input
          placeholder="Search the web or type a URL…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: '100%' }}
        />
        <Button variant="blue" disabled={opening}>
          Go
        </Button>
      </form>

      {error ? <Badge content={error} background="var(--color-error)" color="#fff" /> : null}

      {/* Quick Sites */}
      <div style={{ width: 'min(560px, 86%)', marginTop: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
          Top Sites
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
            gap: 8,
          }}
        >
          {bookmarks.map((bm) => (
            <button
              key={bm.url}
              type="button"
              onClick={() => onSearch(bm.url)}
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                padding: '12px 8px',
                textAlign: 'center',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                transition: 'transform 0.15s ease, border-color 0.15s ease',
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 14,
                  background: 'var(--mochi-primary-soft, rgba(0, 122, 255, 0.1))',
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {bm.title.charAt(0).toUpperCase()}
              </div>
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--color-text)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                }}
              >
                {bm.title}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Recently visited */}
      {recent.length > 0 ? (
        <div style={{ width: 'min(560px, 86%)', marginTop: 12 }}>
          <List>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingRight: 8,
              }}
            >
              <ListHeader content="Recently opened" />
              <button
                type="button"
                onClick={onClearRecent}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '2px 6px',
                }}
              >
                <Trash2 size={13} />
                Clear
              </button>
            </div>
            {recent.map((url) => (
              <Item
                key={url}
                title={url}
                hoverable
                variant="compact"
                onClick={() => onSearch(url)}
              />
            ))}
          </List>
        </div>
      ) : null}
    </div>
  );
};

export default BrowserApp;

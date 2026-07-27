import React, { useState } from 'react';
import { Button, Divider, Input, Badge, List, ListHeader, Item } from 'remochi';
import { ExternalLink, Home as HomeIcon, RotateCw, Search } from 'lucide-react';
import { useEcho, useNetworkStatus } from '@pyxis/app-sdk';

export interface BrowserAppProps {
  windowId: string;
  onClose?: () => void;
}

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
 * CSP `frame-ancestors` headers that block framing outright, and no
 * client-side code here can lift a browser-enforced security boundary. A
 * top-level browsing context isn't framing anything, so it's never subject
 * to those headers. See @pyxis/app-sdk's `openExternalBrowser` /
 * echo/src/services/nova.rs's `open_external_browser` for the launch side.
 * That real window currently uses vela's own native chrome (titlebar,
 * address bar) rather than this toolbar's styling — a later pass can look
 * at bringing it closer to Mochi's look.
 */
export const BrowserApp: React.FC<BrowserAppProps> = ({ windowId }) => {
  const [recent, setRecent] = useState<string[]>([]);
  const [lastOpened, setLastOpened] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const echo = useEcho();
  const network = useNetworkStatus(60_000);

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
    setRecent((prev) => [url, ...prev.filter((u) => u !== url)].slice(0, 8));
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
      {/* Toolbar */}
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
        <Button
          onClick={() => lastOpened && void open(lastOpened)}
          disabled={!lastOpened || opening}
        >
          <RotateCw size={15} style={{ verticalAlign: 'middle' }} />
        </Button>
        <Button onClick={() => open(HOME)}>
          <HomeIcon size={15} style={{ verticalAlign: 'middle' }} />
        </Button>
        <form onSubmit={onSubmit} style={{ flex: 1, display: 'flex', minWidth: 0 }}>
          <Input
            placeholder="Search or enter address"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label="address bar"
            style={{ width: '100%' }}
          />
        </form>
        {network && !network.connected ? (
          <Badge content="offline" background="var(--color-error)" color="#fff" />
        ) : null}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--color-surface)' }}>
        {!lastOpened ? (
          <HomePage recent={recent} opening={opening} error={error} onSearch={(q) => void open(q)} />
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
            <span style={{ color: 'var(--color-text)' }}>Opened in its own window</span>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13, wordBreak: 'break-all' }}>
              {lastOpened}
            </span>
            <Button onClick={() => void open(lastOpened)} disabled={opening}>
              Open again
            </Button>
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
  opening: boolean;
  error: string | null;
  onSearch: (q: string) => void;
}> = ({ recent, opening, error, onSearch }) => {
  const [q, setQ] = useState('');
  return (
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '32px 20px',
        background:
          'radial-gradient(circle at 30% 30%, var(--mochi-primary-soft) 0%, transparent 60%), var(--color-background)',
      }}
    >
      <h1
        style={{
          margin: 0,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          color: 'var(--color-primary)',
        }}
      >
        GeckoOS
      </h1>
      <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
        The Pyxis Browser
      </span>
      <Divider />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) onSearch(q);
        }}
        style={{
          width: 'min(560px, 80%)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Search size={16} style={{ opacity: 0.6, flex: '0 0 auto' }} />
        <Input
          placeholder="Search the web…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ width: '100%' }}
        />
        {/* No onClick: submits the surrounding form; a handler here would
            double-navigate (remochi buttons are type="submit"). */}
        <Button variant="blue" disabled={opening}>
          Go
        </Button>
      </form>
      {error ? <Badge content={error} background="var(--color-error)" color="#fff" /> : null}
      {recent.length > 0 ? (
        <div style={{ width: 'min(560px, 80%)', marginTop: 8 }}>
          <List>
            <ListHeader content="Recently opened" />
            {recent.map((url) => (
              <Item key={url} title={url} hoverable variant="compact" onClick={() => onSearch(url)} />
            ))}
          </List>
        </div>
      ) : null}
    </div>
  );
};

export default BrowserApp;

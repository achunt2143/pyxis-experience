import React from 'react';
import { Button, Item } from 'remochi';
import { ArrowUpRight, Clock, ExternalLink, Globe, Search, Star, Trash2 } from 'lucide-react';
import {
  extractDomain,
  formatRelativeTime,
  getSiteColor,
  type Bookmark,
  type HistoryItem,
  type Suggestion,
} from './model';

/**
 * The rows of the Browser's lists, as React components.
 *
 * Bookmarks, history and the address bar's suggestions can grow, and a Duyo row is a tree
 * of nodes that the whole runtime re-renders on every change (about 10 nodes a row, so a
 * 50-entry history is ~500 nodes redrawn per keystroke in the address bar). Each of these
 * is therefore one adapted kind: one node, drawn by the JSX the React app had (hover
 * states moved to the css file). Each takes its `item` and raises `onOpenItem {url}` and,
 * where it has a delete, `onRemoveItem {id}`; `pack.ts` makes them kinds.
 */
interface RowProps<T> {
  item: T | null;
  onOpen: () => void;
  onRemove?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

const ellipsis: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

/** The root element's identity (`data-duyo-*`), which `host: 'props'` hands the component. */
type Rest = Record<string, unknown>;

function onActivateKey(action: () => void) {
  return (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  };
}

export function SpeedDialTile({ item: bm, onOpen, className, style, ...rest }: RowProps<Bookmark> & Rest) {
  if (!bm) return null;
  const color = getSiteColor(bm.title);
  const domain = extractDomain(bm.url);
  return (
    <div
      {...rest}
      role="button"
      tabIndex={0}
      aria-label={`Open ${bm.title} (${domain})`}
      className={['br-tile', className].filter(Boolean).join(' ')}
      style={{ ...style, ['--site' as string]: color }}
      onClick={onOpen}
      onKeyDown={onActivateKey(onOpen)}
    >
      {/* Waterdrop / Squircle Favicon */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: '20px 6px 20px 20px',
          background: color,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
          fontWeight: 800,
          boxShadow: `0 4px 10px ${color}40`,
        }}
      >
        {bm.title.charAt(0).toUpperCase()}
      </div>

      <div style={{ width: '100%' }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--mochi-text)', ...ellipsis }}>{bm.title}</div>
        <div style={{ fontSize: 11, color: 'var(--mochi-text-muted)', ...ellipsis }}>{domain}</div>
      </div>
    </div>
  );
}

export function BookmarkRow({ item: bm, onOpen, onRemove, className, style, ...rest }: RowProps<Bookmark> & Rest) {
  if (!bm) return null;
  return (
    <Item {...rest} className={['br-row', className].filter(Boolean).join(' ')} style={style} hoverable>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px 12px', width: '100%', minWidth: 0, flexWrap: 'wrap' }}>
        <div
          role="button"
          tabIndex={0}
          aria-label={`Open bookmark ${bm.title}`}
          onClick={onOpen}
          onKeyDown={onActivateKey(onOpen)}
          style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, cursor: 'pointer' }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '10px',
              background: getSiteColor(bm.title),
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {bm.title.charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mochi-text)', ...ellipsis }}>{bm.title}</div>
            <div style={{ fontSize: 11, color: 'var(--mochi-text-muted)', ...ellipsis }}>{bm.url}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <Button type="normal" onClick={onOpen} aria-label={`Open ${bm.title}`}>
            <ExternalLink size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            <span style={{ fontSize: 11 }}>Open</span>
          </Button>
          <Button type="normal" onClick={onRemove} aria-label={`Remove bookmark ${bm.title}`}>
            <Trash2 size={13} style={{ verticalAlign: 'middle' }} />
          </Button>
        </div>
      </div>
    </Item>
  );
}

export function HistoryRow({ item: h, onOpen, onRemove, className, style, ...rest }: RowProps<HistoryItem> & Rest) {
  if (!h) return null;
  const label = h.title || extractDomain(h.url);
  return (
    <Item {...rest} className={['br-row', className].filter(Boolean).join(' ')} style={style} hoverable>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px 12px', width: '100%', minWidth: 0, flexWrap: 'wrap' }}>
        <div
          role="button"
          tabIndex={0}
          aria-label={`Open history entry ${label}`}
          onClick={onOpen}
          onKeyDown={onActivateKey(onOpen)}
          style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, cursor: 'pointer' }}
        >
          <Globe size={18} color="var(--mochi-text-muted)" style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--mochi-text)', ...ellipsis }}>
              {label}
            </div>
            <div style={{ fontSize: 11, color: 'var(--mochi-text-muted)', ...ellipsis }}>{h.url}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--mochi-text-muted)' }}>{formatRelativeTime(h.visitedAt)}</span>
          <Button type="normal" onClick={onOpen} aria-label={`Open ${label}`}>
            <ExternalLink size={13} style={{ verticalAlign: 'middle' }} />
          </Button>
          <Button type="normal" onClick={onRemove} aria-label={`Remove ${label} from history`}>
            <Trash2 size={13} style={{ verticalAlign: 'middle' }} />
          </Button>
        </div>
      </div>
    </Item>
  );
}

/** A line of the "Just Type" dropdown. */
export function SuggestionRow({ item: s, onOpen, className, style, ...rest }: RowProps<Suggestion> & Rest) {
  if (!s) return null;
  return (
    <div
      {...rest}
      role="option"
      tabIndex={0}
      aria-label={s.title}
      className={['br-suggestion', className].filter(Boolean).join(' ')}
      style={style}
      onClick={onOpen}
      onKeyDown={onActivateKey(onOpen)}
    >
      {s.type === 'search' && <Search size={14} color="var(--mochi-primary)" />}
      {s.type === 'url' && <Globe size={14} color="var(--mochi-success)" />}
      {s.type === 'bookmark' && <Star size={14} fill="var(--mochi-selected)" color="var(--mochi-selected)" />}
      {s.type === 'history' && <Clock size={14} color="var(--mochi-text-muted)" />}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--mochi-text)', ...ellipsis }}>{s.title}</div>
        {s.type !== 'search' && (
          <div style={{ fontSize: 11, color: 'var(--mochi-text-muted)', ...ellipsis }}>{s.url}</div>
        )}
      </div>
      <ArrowUpRight size={13} color="var(--mochi-text-muted)" />
    </div>
  );
}

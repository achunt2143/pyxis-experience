import React from 'react';
import { Button } from 'remochi';
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

export function SpeedDialTile({ item: bm, onOpen, className, style, ...rest }: RowProps<Bookmark> & Rest) {
  if (!bm) return null;
  const color = getSiteColor(bm.title);
  return (
    <div
      {...rest}
      className={['br-tile', className].filter(Boolean).join(' ')}
      style={{ ...style, ['--site' as string]: color }}
      onClick={onOpen}
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
        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text, #1f2937)', ...ellipsis }}>{bm.title}</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-muted, #9ca3af)', ...ellipsis }}>{extractDomain(bm.url)}</div>
      </div>
    </div>
  );
}

export function BookmarkRow({ item: bm, onOpen, onRemove, className, style, ...rest }: RowProps<Bookmark> & Rest) {
  if (!bm) return null;
  return (
    <div {...rest} className={['br-row', className].filter(Boolean).join(' ')} style={style}>
      <div
        onClick={onOpen}
        style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, cursor: 'pointer' }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '12px 4px 12px 12px',
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
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text, #1f2937)', ...ellipsis }}>{bm.title}</div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted, #9ca3af)', ...ellipsis }}>{bm.url}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <Button type="normal" onClick={onOpen}>
          <ExternalLink size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
          <span style={{ fontSize: 11 }}>Open</span>
        </Button>
        <Button type="normal" onClick={onRemove}>
          <Trash2 size={13} style={{ verticalAlign: 'middle' }} />
        </Button>
      </div>
    </div>
  );
}

export function HistoryRow({ item: h, onOpen, onRemove, className, style, ...rest }: RowProps<HistoryItem> & Rest) {
  if (!h) return null;
  return (
    <div {...rest} className={['br-row', className].filter(Boolean).join(' ')} style={style}>
      <div
        onClick={onOpen}
        style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, cursor: 'pointer' }}
      >
        <Globe size={18} color="var(--color-text-muted, #9ca3af)" style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text, #1f2937)', ...ellipsis }}>
            {h.title || extractDomain(h.url)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted, #9ca3af)', ...ellipsis }}>{h.url}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-muted, #9ca3af)' }}>{formatRelativeTime(h.visitedAt)}</span>
        <Button type="normal" onClick={onOpen}>
          <ExternalLink size={13} style={{ verticalAlign: 'middle' }} />
        </Button>
        <Button type="normal" onClick={onRemove}>
          <Trash2 size={13} style={{ verticalAlign: 'middle' }} />
        </Button>
      </div>
    </div>
  );
}

/** A line of the "Just Type" dropdown. */
export function SuggestionRow({ item: s, onOpen, className, style, ...rest }: RowProps<Suggestion> & Rest) {
  if (!s) return null;
  return (
    <div {...rest} className={['br-suggestion', className].filter(Boolean).join(' ')} style={style} onClick={onOpen}>
      {s.type === 'search' && <Search size={14} color="#3b82f6" />}
      {s.type === 'url' && <Globe size={14} color="#10b981" />}
      {s.type === 'bookmark' && <Star size={14} fill="#f59e0b" color="#f59e0b" />}
      {s.type === 'history' && <Clock size={14} color="#6b7280" />}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text, #1f2937)', ...ellipsis }}>{s.title}</div>
        {s.type !== 'search' && (
          <div style={{ fontSize: 11, color: 'var(--color-text-muted, #9ca3af)', ...ellipsis }}>{s.url}</div>
        )}
      </div>
      <ArrowUpRight size={13} color="var(--color-text-muted, #9ca3af)" />
    </div>
  );
}

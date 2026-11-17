// The directory listing: an adapted React island, because a folder can hold hundreds of
// entries (a Duyo row is several nodes, and every change re-renders every node). One `div`
// per entry here, memoised, so typing in the search box or a dialog redraws none of them.
import { memo, type ComponentType, type CSSProperties, type KeyboardEvent } from 'react';
import {
  Archive,
  ChevronRight,
  File,
  FileCode,
  FileText,
  Film,
  Folder,
  Image as ImageIcon,
  Music,
} from 'lucide-react';
import { KIND_COLOR, formatBytes, kindOf, type EntryKind, type FsEntry, type ViewMode } from './model';

type IconType = ComponentType<{ size?: number; style?: CSSProperties }>;

const KIND_ICON: Record<EntryKind, IconType> = {
  folder: Folder,
  image: ImageIcon,
  audio: Music,
  video: Film,
  code: FileCode,
  archive: Archive,
  text: FileText,
  file: File,
};

interface RowProps {
  entry: FsEntry;
  selected: boolean;
  onOpen: (entry: FsEntry) => void;
  onMenu: (entry: FsEntry, rect: DOMRect) => void;
  onRename?: (entry: FsEntry) => void;
  onDelete?: (entry: FsEntry) => void;
}

const contextMenu = (props: RowProps) => (e: React.MouseEvent<HTMLDivElement>) => {
  e.preventDefault();
  props.onMenu(props.entry, e.currentTarget.getBoundingClientRect());
};

const rowKeyDown = (props: RowProps, isGrid: boolean) => (e: KeyboardEvent<HTMLDivElement>) => {
  const mod = e.ctrlKey || e.metaKey || e.altKey;
  if (e.key === 'Enter' && !mod && !e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    props.onOpen(props.entry);
    return;
  }
  if (e.key === 'Delete' && !mod && !e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    props.onDelete?.(props.entry);
    return;
  }
  if (e.key === 'F2' && !mod && !e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    props.onRename?.(props.entry);
    return;
  }
  if ((e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) && !mod) {
    e.preventDefault();
    e.stopPropagation();
    props.onMenu(props.entry, e.currentTarget.getBoundingClientRect());
    return;
  }
  if (mod || e.shiftKey) return;
  const moveNext = e.key === 'ArrowDown' || (isGrid && e.key === 'ArrowRight');
  const movePrev = e.key === 'ArrowUp' || (isGrid && e.key === 'ArrowLeft');
  if (!moveNext && !movePrev && e.key !== 'Home' && e.key !== 'End') return;

  const parent = e.currentTarget.parentElement;
  if (!parent) return;
  const rows = Array.from(parent.querySelectorAll<HTMLElement>('.files-entry'));
  const idx = rows.indexOf(e.currentTarget);
  if (idx === -1) return;

  let nextIdx = idx;
  if (moveNext) nextIdx = Math.min(rows.length - 1, idx + 1);
  else if (movePrev) nextIdx = Math.max(0, idx - 1);
  else if (e.key === 'Home') nextIdx = 0;
  else if (e.key === 'End') nextIdx = rows.length - 1;

  e.preventDefault();
  e.stopPropagation();
  const target = rows[nextIdx];
  if (target && target !== e.currentTarget) {
    target.focus();
    target.scrollIntoView?.({ block: 'nearest' });
  }
};

const ListRow = memo(function ListRow(props: RowProps) {
  const { entry, selected } = props;
  const kind = kindOf(entry);
  const Icon = KIND_ICON[kind];
  const colors = KIND_COLOR[kind];
  return (
    <div
      className="files-entry"
      role="option"
      aria-selected={selected}
      tabIndex={0}
      data-path={entry.path}
      onClick={() => props.onOpen(entry)}
      onContextMenu={contextMenu(props)}
      onKeyDown={rowKeyDown(props, false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '9px 12px',
        borderBottom: '1px solid var(--mochi-border)',
        cursor: 'pointer',
        background: selected ? 'var(--mochi-primary-soft)' : 'transparent',
        transition: 'background 0.12s ease',
        minWidth: 0,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: colors.bg,
          color: colors.text,
          border: `1px solid ${colors.border}`,
          flexShrink: 0,
          marginRight: '12px',
        }}
      >
        <Icon size={18} />
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span
          className="files-entry-name"
          style={{
            fontSize: '0.85rem',
            fontWeight: entry.isDirectory ? 600 : 500,
            color: selected ? 'var(--mochi-primary)' : 'var(--mochi-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entry.name}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          fontSize: '0.78rem',
          color: 'var(--mochi-text-muted)',
          flexShrink: 0,
          marginLeft: '12px',
        }}
      >
        <span>{entry.isDirectory ? 'Folder' : formatBytes(entry.size)}</span>
        {entry.isDirectory ? <ChevronRight size={14} style={{ opacity: 0.5 }} /> : <span style={{ width: '14px' }} />}
      </div>
    </div>
  );
});

const GridCell = memo(function GridCell(props: RowProps) {
  const { entry, selected } = props;
  const kind = kindOf(entry);
  const Icon = KIND_ICON[kind];
  const colors = KIND_COLOR[kind];
  return (
    <div
      className="files-entry"
      role="option"
      aria-selected={selected}
      tabIndex={0}
      data-path={entry.path}
      onClick={() => props.onOpen(entry)}
      onContextMenu={contextMenu(props)}
      onKeyDown={rowKeyDown(props, true)}
      title={entry.name}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '14px 10px',
        borderRadius: '14px',
        cursor: 'pointer',
        userSelect: 'none',
        background: selected ? 'var(--mochi-primary-soft)' : 'var(--mochi-panel-bg)',
        border: `1.5px solid ${selected ? 'var(--mochi-primary)' : 'var(--mochi-border)'}`,
        transition: 'all 0.15s ease',
        boxShadow: selected ? '0 2px 8px var(--mochi-primary-soft)' : 'none',
        minWidth: 0,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '54px',
          height: '54px',
          borderRadius: '24px 4px 24px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          color: colors.text,
        }}
      >
        <Icon size={28} />
      </div>

      <span
        className="files-entry-name"
        style={{
          fontSize: '0.8rem',
          textAlign: 'center',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          color: selected ? 'var(--mochi-primary)' : 'var(--mochi-text)',
          fontWeight: 500,
        }}
      >
        {entry.name}
      </span>

      <span style={{ fontSize: '0.72rem', color: 'var(--mochi-text-muted)' }}>
        {entry.isDirectory ? 'Folder' : formatBytes(entry.size)}
      </span>
    </div>
  );
});

const LIST_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--mochi-surface)',
  borderRadius: '12px',
  border: '1px solid var(--mochi-border)',
  overflow: 'hidden',
  minWidth: 0,
  boxSizing: 'border-box',
};

const GRID_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
  gap: '12px',
  minWidth: 0,
  boxSizing: 'border-box',
};

export interface ListingProps extends Omit<RowProps, 'entry' | 'selected'> {
  entries: FsEntry[];
  viewMode: ViewMode;
  selectedPath: string | null;
}

/** Memoised on its props: the app passes the same `entries` array until the listing changes. */
export const Listing = memo(function Listing({ entries, viewMode, selectedPath, onOpen, onMenu, onRename, onDelete }: ListingProps) {
  const Cell = viewMode === 'list' ? ListRow : GridCell;
  return (
    <div
      className="files-listing"
      role="listbox"
      aria-label="Folder contents"
      data-view={viewMode}
      style={viewMode === 'list' ? LIST_STYLE : GRID_STYLE}
    >
      {entries.map((entry) => (
        <Cell
          key={entry.path}
          entry={entry}
          selected={selectedPath === entry.path}
          onOpen={onOpen}
          onMenu={onMenu}
          onRename={onRename}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
});

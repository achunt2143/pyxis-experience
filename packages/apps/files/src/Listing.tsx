// The directory listing: an adapted React island, because a folder can hold hundreds of
// entries (a Duyo row is several nodes, and every change re-renders every node). One `div`
// per entry here, memoised, so typing in the search box or a dialog redraws none of them.
import { memo, type ComponentType, type CSSProperties } from 'react';
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
}

const contextMenu = (props: RowProps) => (e: React.MouseEvent<HTMLDivElement>) => {
  e.preventDefault();
  props.onMenu(props.entry, e.currentTarget.getBoundingClientRect());
};

const ListRow = memo(function ListRow(props: RowProps) {
  const { entry, selected } = props;
  const kind = kindOf(entry);
  const Icon = KIND_ICON[kind];
  const colors = KIND_COLOR[kind];
  return (
    <div
      className="files-entry"
      data-path={entry.path}
      onClick={() => props.onOpen(entry)}
      onContextMenu={contextMenu(props)}
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '9px 12px',
        borderBottom: '1px solid var(--color-border-light, #f1f5f9)',
        cursor: 'pointer',
        background: selected ? 'var(--mochi-primary-soft, rgba(47, 111, 237, 0.12))' : 'transparent',
        transition: 'background 0.12s ease',
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
            color: selected ? 'var(--mochi-primary, #2f6fed)' : 'var(--color-text, var(--mochi-text, #111827))',
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
          color: 'var(--color-text-secondary, #64748b)',
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
      data-path={entry.path}
      onClick={() => props.onOpen(entry)}
      onContextMenu={contextMenu(props)}
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
        background: selected
          ? 'var(--mochi-primary-soft, rgba(47, 111, 237, 0.14))'
          : 'var(--color-surface, var(--mochi-surface, #ffffff))',
        border: `1.5px solid ${
          selected ? 'var(--mochi-primary, #2f6fed)' : 'var(--color-border, var(--mochi-border, #e5e7eb))'
        }`,
        transition: 'all 0.15s ease',
        boxShadow: selected ? '0 2px 8px rgba(47, 111, 237, 0.2)' : '0 1px 3px rgba(0,0,0,0.03)',
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
          color: selected ? 'var(--mochi-primary, #2f6fed)' : 'var(--color-text, var(--mochi-text, #111827))',
          fontWeight: 500,
        }}
      >
        {entry.name}
      </span>

      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary, #64748b)' }}>
        {entry.isDirectory ? 'Folder' : formatBytes(entry.size)}
      </span>
    </div>
  );
});

const LIST_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--color-surface, var(--mochi-surface, #ffffff))',
  borderRadius: '12px',
  border: '1px solid var(--color-border, var(--mochi-border, #e5e7eb))',
  overflow: 'hidden',
};

const GRID_STYLE: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
  gap: '12px',
};

export interface ListingProps extends Omit<RowProps, 'entry' | 'selected'> {
  entries: FsEntry[];
  viewMode: ViewMode;
  selectedPath: string | null;
}

/** Memoised on its props: the app passes the same `entries` array until the listing changes. */
export const Listing = memo(function Listing({ entries, viewMode, selectedPath, onOpen, onMenu }: ListingProps) {
  const Cell = viewMode === 'list' ? ListRow : GridCell;
  return (
    <div className="files-listing" data-view={viewMode} style={viewMode === 'list' ? LIST_STYLE : GRID_STYLE}>
      {entries.map((entry) => (
        <Cell key={entry.path} entry={entry} selected={selectedPath === entry.path} onOpen={onOpen} onMenu={onMenu} />
      ))}
    </div>
  );
});

// Files: types and pure functions. No Duyo and no React in here, so the views, the island and
// the tests share them.

export interface FsEntry {
  name: string;
  path: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
}

export interface FsStat {
  size?: number;
  permissions?: string;
  modified?: number;
  owner?: number;
  group?: number;
}

export interface DirState {
  entries?: FsEntry[];
  error?: string;
  loading?: boolean;
}

export type EntryKind = 'folder' | 'file' | 'image' | 'audio' | 'video' | 'code' | 'archive' | 'text';

export type SortBy = 'name' | 'size';
export type SortOrder = 'asc' | 'desc';
export type ViewMode = 'list' | 'grid';

export interface Preview {
  entry: FsEntry;
  loading: boolean;
  kind: 'text' | 'image' | 'audio' | 'meta';
  text?: string;
  dataUri?: string;
  stat?: FsStat;
  error?: string;
}

export const IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg|bmp|ico)$/i;
export const AUDIO_EXT = /\.(mp3|wav|flac|ogg|m4a|aac)$/i;
export const VIDEO_EXT = /\.(mp4|webm|mkv|mov|avi)$/i;
export const CODE_EXT =
  /\.(js|jsx|ts|tsx|html|css|scss|json|rs|py|c|cpp|h|hpp|go|sh|bash|zsh|ya?ml|toml|xml|sql|env)$/i;
export const ARCHIVE_EXT = /\.(zip|tar|gz|bz2|xz|7z|ipk)$/i;
export const TEXT_EXT =
  /\.(txt|md|markdown|json|jsonc|js|jsx|ts|tsx|css|scss|less|html?|xml|svg|ya?ml|toml|ini|conf|cfg|log|sh|bash|zsh|rs|py|c|h|cpp|hpp|go|rb|java|kt|sql|csv|tsv|env|lock|gitignore|dockerfile)$/i;
export const MAX_PREVIEW_BYTES = 512 * 1024;

export const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
};

export function kindOf(entry: FsEntry): EntryKind {
  if (entry.isDirectory) return 'folder';
  if (IMAGE_EXT.test(entry.name)) return 'image';
  if (AUDIO_EXT.test(entry.name)) return 'audio';
  if (VIDEO_EXT.test(entry.name)) return 'video';
  if (CODE_EXT.test(entry.name)) return 'code';
  if (ARCHIVE_EXT.test(entry.name)) return 'archive';
  if (TEXT_EXT.test(entry.name)) return 'text';
  return 'file';
}

export const KIND_COLOR: Record<EntryKind, { text: string; bg: string; border: string }> = {
  folder: { text: '#d97706', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.35)' },
  image: { text: '#059669', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.35)' },
  audio: { text: '#9333ea', bg: 'rgba(168, 85, 247, 0.15)', border: 'rgba(168, 85, 247, 0.35)' },
  video: { text: '#dc2626', bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.35)' },
  code: { text: '#0284c7', bg: 'rgba(14, 165, 233, 0.15)', border: 'rgba(14, 165, 233, 0.35)' },
  archive: { text: '#ea580c', bg: 'rgba(234, 88, 12, 0.15)', border: 'rgba(234, 88, 12, 0.35)' },
  text: { text: '#2563eb', bg: 'rgba(37, 99, 235, 0.15)', border: 'rgba(37, 99, 235, 0.35)' },
  file: { text: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', border: 'rgba(100, 116, 139, 0.35)' },
};

export const HOME = '~';

/**
 * Whether `path` is outside the home, where Files may look but not change
 * anything. On a device Files reaches the user's home (`~`) read-write and
 * the rest of the root filesystem, by absolute path, read-only: the bridge
 * refuses any write there (FILESYSTEM_SCOPES in PyxisBridgeParent.sys.mjs).
 * Changing system files is to come with a "privileged access" unlock.
 */
export function isReadOnly(path: string): boolean {
  return path.startsWith('/');
}

export function formatBytes(n?: number): string {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function fmtDate(ts?: number): string {
  if (!ts) return '—';
  const ms = ts > 1e11 ? ts : ts * 1000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '—';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return `Today at ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  }
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function normalizePath(p: string): string {
  const clean = p.replace(/\/+$/, '');
  return clean === '' ? '/' : clean;
}

export function getParentPath(path: string): string {
  if (path === '/' || path === '~') return path;
  if (path.startsWith('~/') && path.indexOf('/', 2) === -1) {
    return '~';
  }
  const parts = path.replace(/\/+$/, '').split('/');
  parts.pop();
  const parent = parts.join('/');
  return parent === '' ? '/' : parent;
}

export interface Crumb {
  label: string;
  path: string;
}

export function getCrumbsForPath(path: string): Crumb[] {
  if (path === '~') {
    return [{ label: 'Home', path: '~' }];
  }
  if (path === '/') {
    return [{ label: 'Root', path: '/' }];
  }
  if (path.startsWith('~/')) {
    const parts = path.slice(2).split('/').filter(Boolean);
    const crumbs = [{ label: 'Home', path: '~' }];
    let current = '~';
    for (const part of parts) {
      current += `/${part}`;
      crumbs.push({ label: part, path: current });
    }
    return crumbs;
  }
  const parts = path.split('/').filter(Boolean);
  const crumbs = [{ label: 'Root', path: '/' }];
  let current = '';
  for (const part of parts) {
    current += `/${part}`;
    crumbs.push({ label: part, path: current });
  }
  return crumbs;
}

export interface Place {
  id: string;
  name: string;
  path: string;
}

export const PLACES: Place[] = [
  { id: 'home', name: 'Home', path: '~' },
  { id: 'documents', name: 'Documents', path: '~/Documents' },
  { id: 'downloads', name: 'Downloads', path: '~/Downloads' },
  { id: 'pictures', name: 'Pictures', path: '~/Pictures' },
  { id: 'music', name: 'Music', path: '~/Music' },
  { id: 'videos', name: 'Videos', path: '~/Videos' },
  { id: 'desktop', name: 'Desktop', path: '~/Desktop' },
];

export const SYSTEM_PLACES: Place[] = [{ id: 'root', name: 'File System', path: '/' }];

/** The sidebar's highlight rule for a favourite (`system` places match exactly). */
export function placeSelected(place: Place, currentPath: string, system: boolean): boolean {
  if (system) return currentPath === place.path;
  return (
    currentPath === place.path ||
    (place.path === '~' && currentPath === '~') ||
    (place.path !== '~' && currentPath.startsWith(place.path))
  );
}

/** Folders first, then by name (numeric, case-insensitive) or size; filtered by a name query. */
export function visibleEntries(
  entries: FsEntry[] | undefined,
  query: string,
  sortBy: SortBy,
  sortOrder: SortOrder
): FsEntry[] {
  if (!entries) return [];
  let list = entries;
  if (query.trim()) {
    const q = query.trim().toLowerCase();
    list = list.filter((e) => e.name.toLowerCase().includes(q));
  }
  return [...list].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    let res = 0;
    if (sortBy === 'name') {
      res = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    } else if (sortBy === 'size') {
      res = (a.size || 0) - (b.size || 0);
    }
    return sortOrder === 'asc' ? res : -res;
  });
}

/** The sort button's cycle: name asc -> name desc -> size desc -> size asc -> name asc. */
export function nextSort(sortBy: SortBy, sortOrder: SortOrder): { sortBy: SortBy; sortOrder: SortOrder } {
  if (sortBy === 'name') {
    return sortOrder === 'asc' ? { sortBy, sortOrder: 'desc' } : { sortBy: 'size', sortOrder: 'desc' };
  }
  return sortOrder === 'desc' ? { sortBy, sortOrder: 'asc' } : { sortBy: 'name', sortOrder: 'asc' };
}

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  Menu,
  MenuItem,
  Snackbar,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { Repanel, RepanelStack } from 'remochi';
import {
  ChevronRight,
  File as FileIcon,
  FileText,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  MoreVertical,
  Music,
  Pencil,
  Trash2,
} from 'lucide-react';
import { echoClient } from '@pyxis/app-sdk';

export interface FilesAppProps {
  windowId: string;
  onClose?: () => void;
}

interface FsEntry {
  name: string;
  path: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
}

interface FsStat {
  size?: number;
  permissions?: string;
  modified?: number;
  owner?: number;
  group?: number;
}

interface Crumb {
  label: string;
  path: string;
}

interface DirState {
  entries?: FsEntry[];
  error?: string;
}

type EntryKind = 'folder' | 'file' | 'image' | 'audio';

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg|bmp)$/i;
const AUDIO_EXT = /\.(mp3|wav|flac|ogg|m4a)$/i;
// Extensions the daemon can hand back as UTF-8 for inline preview. The real
// readFile is UTF-8-only (fs::read_to_string), so anything not matched here
// (or over the size cap) shows a metadata card instead of a garbled read.
const TEXT_EXT =
  /\.(txt|md|markdown|json|jsonc|js|jsx|ts|tsx|css|scss|less|html?|xml|svg|ya?ml|toml|ini|conf|cfg|log|sh|bash|zsh|rs|py|c|h|cpp|hpp|go|rb|java|kt|sql|csv|tsv|env|lock|gitignore|dockerfile)$/i;
const MAX_PREVIEW_BYTES = 512 * 1024;

function kindOf(entry: FsEntry): EntryKind {
  if (entry.isDirectory) return 'folder';
  if (IMAGE_EXT.test(entry.name)) return 'image';
  if (AUDIO_EXT.test(entry.name)) return 'audio';
  return 'file';
}

const KIND_ICON: Record<EntryKind, React.FC<{ size?: number }>> = {
  folder: Folder,
  file: FileText,
  image: ImageIcon,
  audio: Music,
};

const KIND_COLOR: Record<EntryKind, string> = {
  folder: '#FFB74D',
  file: '#90CAF9',
  image: '#A5D6A7',
  audio: '#CE93D8',
};

const FS_SERVICE = 'filesystem';
const FS_IFACE = 'org.geckoOS.filesystem';
const HOME = '~';

function formatBytes(n: number): string {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Call the filesystem service, throwing on the daemon's `{ error }` shape so
 *  callers can `try/catch` uniformly instead of hand-checking every result. */
async function fsCall(
  method: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown> | undefined> {
  const res = (await echoClient.callMethod(FS_SERVICE, FS_IFACE, method, args)) as
    | (Record<string, unknown> & { error?: string })
    | undefined;
  if (res && typeof res === 'object' && res.error) {
    throw new Error(String(res.error));
  }
  return res;
}

interface Preview {
  entry: FsEntry;
  loading: boolean;
  kind: 'text' | 'meta';
  text?: string;
  stat?: FsStat;
  error?: string;
}

type DialogState =
  | { type: 'newFolder'; dir: string; value: string }
  | { type: 'rename'; dir: string; entry: FsEntry; value: string }
  | { type: 'delete'; dir: string; entry: FsEntry }
  | null;

/**
 * FilesApp — browses AND operates on the real filesystem through the
 * `org.geckoOS.filesystem` Echo service (mock-backed in dev via @pyxis/app-sdk's
 * EchoClient.ts). Beyond Miller-column browsing it now supports opening files
 * (text preview inline, metadata card for binary/large files), creating
 * folders, renaming, and deleting — each mapped to a real service method
 * (createDirectory / move / deleteFile / deleteDirectory), with the affected
 * column reloaded on success.
 */
export const FilesApp: React.FC<FilesAppProps> = ({ windowId }) => {
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ label: 'Home', path: HOME }]);
  const [dirs, setDirs] = useState<Record<string, DirState>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    anchorEl: HTMLElement;
    dir: string;
    entry: FsEntry;
  } | null>(null);

  const deepestPath = crumbs[crumbs.length - 1].path;

  const fetchDir = useCallback(async (path: string): Promise<DirState> => {
    try {
      const res = (await echoClient.callMethod(FS_SERVICE, FS_IFACE, 'readDirectory', {
        path,
      })) as { entries?: FsEntry[]; error?: string } | undefined;
      if (res?.error || !res?.entries) {
        return { error: res?.error ?? 'Could not read directory' };
      }
      return { entries: res.entries };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }, []);

  useEffect(() => {
    if (dirs[deepestPath]) return;
    let mounted = true;
    fetchDir(deepestPath).then((state) => {
      if (mounted) setDirs((prev) => ({ ...prev, [deepestPath]: state }));
    });
    return () => {
      mounted = false;
    };
  }, [deepestPath, dirs, fetchDir]);

  // Force-refetch a folder after an operation mutates it.
  const reloadDir = useCallback(
    async (path: string) => {
      const state = await fetchDir(path);
      setDirs((prev) => ({ ...prev, [path]: state }));
    },
    [fetchDir]
  );

  const open = (entry: FsEntry, panelIndex: number) => {
    if (!entry.isDirectory) return;
    setCrumbs((prev) => [...prev.slice(0, panelIndex + 1), { label: entry.name, path: entry.path }]);
  };

  const navigate = (idx: number) => {
    setCrumbs((prev) => prev.slice(0, idx + 1));
  };

  // Drop any open columns that sit at or below a folder that was removed or
  // renamed, so navigation can't be left pointing at a path that's gone.
  const pruneCrumbsBelow = (removedPath: string) => {
    setCrumbs((prev) => {
      const cut = prev.findIndex(
        (c) => c.path === removedPath || c.path.startsWith(`${removedPath}/`)
      );
      return cut === -1 ? prev : prev.slice(0, cut);
    });
  };

  const openPreview = async (entry: FsEntry) => {
    setPreview({ entry, loading: true, kind: 'meta' });
    let stat: FsStat | undefined;
    try {
      stat = (await fsCall('stat', { path: entry.path })) as FsStat | undefined;
    } catch {
      /* stat is best-effort; keep going */
    }
    const previewable = TEXT_EXT.test(entry.name) && entry.size <= MAX_PREVIEW_BYTES;
    if (!previewable) {
      setPreview({ entry, loading: false, kind: 'meta', stat });
      return;
    }
    try {
      const res = (await fsCall('readFile', { path: entry.path, encoding: 'utf-8' })) as
        | { content?: string }
        | undefined;
      setPreview({
        entry,
        loading: false,
        kind: 'text',
        text: res?.content ?? '',
        stat,
      });
    } catch (err) {
      setPreview({
        entry,
        loading: false,
        kind: 'meta',
        stat,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const runAction = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const submitDialog = async () => {
    if (!dialog) return;
    if (dialog.type === 'newFolder') {
      const name = dialog.value.trim();
      if (!name) return;
      await runAction(async () => {
        await fsCall('createDirectory', { path: `${dialog.dir}/${name}` });
        await reloadDir(dialog.dir);
        setDialog(null);
      });
    } else if (dialog.type === 'rename') {
      const name = dialog.value.trim();
      if (!name || name === dialog.entry.name) {
        setDialog(null);
        return;
      }
      await runAction(async () => {
        await fsCall('move', {
          source: dialog.entry.path,
          destination: `${dialog.dir}/${name}`,
        });
        if (dialog.entry.isDirectory) pruneCrumbsBelow(dialog.entry.path);
        await reloadDir(dialog.dir);
        setDialog(null);
      });
    } else if (dialog.type === 'delete') {
      await runAction(async () => {
        if (dialog.entry.isDirectory) {
          await fsCall('deleteDirectory', { path: dialog.entry.path, recursive: true });
          pruneCrumbsBelow(dialog.entry.path);
        } else {
          await fsCall('deleteFile', { path: dialog.entry.path });
        }
        if (preview?.entry.path === dialog.entry.path) setPreview(null);
        await reloadDir(dialog.dir);
        setDialog(null);
      });
    }
  };

  const renderColumn = (path: string, panelIndex: number) => {
    const dir = dirs[path];
    if (!dir) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress size={22} />
        </Box>
      );
    }
    if (dir.error) {
      return (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
          {dir.error}
        </Typography>
      );
    }
    const sorted = [...(dir.entries ?? [])].sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    if (sorted.length === 0) {
      return (
        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
          This folder is empty.
        </Typography>
      );
    }
    return (
      <Box
        sx={{
          height: '100%',
          overflow: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
          gap: 1.5,
          alignContent: 'start',
          p: 1.5,
        }}
      >
        {sorted.map((entry) => {
          const kind = kindOf(entry);
          const Icon = KIND_ICON[kind];
          const isSelected = preview?.entry.path === entry.path;
          return (
            <Box
              key={entry.path}
              onClick={() => (entry.isDirectory ? open(entry, panelIndex) : openPreview(entry))}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.75,
                p: 1.25,
                borderRadius: 2,
                cursor: 'pointer',
                userSelect: 'none',
                position: 'relative',
                transition: 'background 0.15s ease, transform 0.15s ease',
                background: isSelected ? 'rgba(144,202,249,0.14)' : 'transparent',
                '&:hover': {
                  background: 'rgba(255,255,255,0.08)',
                  transform: 'scale(1.02)',
                },
                '&:hover .file-actions': { opacity: 1 },
              }}
              title={entry.name}
            >
              <IconButton
                className="file-actions"
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenu({ anchorEl: e.currentTarget, dir: path, entry });
                }}
                sx={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  opacity: 0,
                  transition: 'opacity 0.15s ease',
                  color: 'var(--color-text-secondary, #aaa)',
                }}
                aria-label={`actions for ${entry.name}`}
              >
                <MoreVertical size={15} />
              </IconButton>
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: `${KIND_COLOR[kind]}22`,
                  border: `1px solid ${KIND_COLOR[kind]}55`,
                  color: KIND_COLOR[kind],
                }}
              >
                <Icon size={28} />
              </Box>
              <Typography
                variant="caption"
                sx={{
                  fontSize: '0.78rem',
                  textAlign: 'center',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {entry.name}
              </Typography>
            </Box>
          );
        })}
      </Box>
    );
  };

  return (
    <Box
      data-window-id={windowId}
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}
    >
      {/* Breadcrumb + actions bar */}
      <Box
        sx={{
          p: 1,
          borderRadius: 2,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Breadcrumbs
          separator={<ChevronRight size={14} />}
          aria-label="path breadcrumb"
          sx={{ flex: 1, minWidth: 0 }}
        >
          {crumbs.map((c, idx) => (
            <Link
              key={c.path + idx}
              component="button"
              underline="hover"
              color={idx === crumbs.length - 1 ? 'primary' : 'inherit'}
              onClick={() => navigate(idx)}
              sx={{ fontSize: '0.875rem' }}
            >
              {c.label}
            </Link>
          ))}
        </Breadcrumbs>
        <Tooltip title="New folder">
          <span>
            <IconButton
              size="small"
              disabled={busy || !!dirs[deepestPath]?.error}
              onClick={() => setDialog({ type: 'newFolder', dir: deepestPath, value: '' })}
              aria-label="new folder"
            >
              <FolderPlus size={18} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Folder columns */}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <RepanelStack
          activeIndex={crumbs.length - 1}
          onActiveIndexChange={(index) => setCrumbs((prev) => prev.slice(0, index + 1))}
        >
          {crumbs.map((c, idx) => (
            <Repanel key={c.path}>{renderColumn(c.path, idx)}</Repanel>
          ))}
        </RepanelStack>
      </Box>

      {/* Per-entry actions menu */}
      <Menu
        open={!!menu}
        anchorEl={menu?.anchorEl ?? null}
        onClose={() => setMenu(null)}
      >
        {menu && !menu.entry.isDirectory && (
          <MenuItem
            onClick={() => {
              openPreview(menu.entry);
              setMenu(null);
            }}
          >
            <FileText size={16} style={{ marginRight: 8 }} /> Open
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            if (menu) {
              setDialog({
                type: 'rename',
                dir: menu.dir,
                entry: menu.entry,
                value: menu.entry.name,
              });
            }
            setMenu(null);
          }}
        >
          <Pencil size={16} style={{ marginRight: 8 }} /> Rename
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menu) setDialog({ type: 'delete', dir: menu.dir, entry: menu.entry });
            setMenu(null);
          }}
          sx={{ color: 'var(--color-error, #e57373)' }}
        >
          <Trash2 size={16} style={{ marginRight: 8 }} /> Delete
        </MenuItem>
      </Menu>

      {/* New folder / rename dialog */}
      <Dialog
        open={dialog?.type === 'newFolder' || dialog?.type === 'rename'}
        onClose={() => (busy ? undefined : setDialog(null))}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {dialog?.type === 'newFolder' ? (
            <>
              <FolderPlus size={18} /> New folder
            </>
          ) : (
            <>
              <Pencil size={18} /> Rename
            </>
          )}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            variant="standard"
            label="Name"
            value={dialog && dialog.type !== 'delete' ? dialog.value : ''}
            onChange={(e) =>
              setDialog((d) =>
                d && d.type !== 'delete' ? { ...d, value: e.target.value } : d
              )
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitDialog();
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void submitDialog()} disabled={busy} variant="contained">
            {dialog?.type === 'newFolder' ? 'Create' : 'Rename'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog
        open={dialog?.type === 'delete'}
        onClose={() => (busy ? undefined : setDialog(null))}
        maxWidth="xs"
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Trash2 size={18} /> Delete {dialog?.type === 'delete' && dialog.entry.isDirectory ? 'folder' : 'file'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Delete{' '}
            <strong>{dialog?.type === 'delete' ? dialog.entry.name : ''}</strong>
            {dialog?.type === 'delete' && dialog.entry.isDirectory
              ? ' and everything inside it? This cannot be undone.'
              : '? This cannot be undone.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(null)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => void submitDialog()}
            disabled={busy}
            color="error"
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* File preview */}
      <Dialog
        open={!!preview}
        onClose={() => setPreview(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {preview?.kind === 'text' ? <FileText size={18} /> : <FileIcon size={18} />}
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {preview?.entry.name}
          </span>
        </DialogTitle>
        <DialogContent dividers>
          {preview?.loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : preview?.kind === 'text' ? (
            <Box
              component="pre"
              sx={{
                m: 0,
                fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                fontSize: '0.82rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '60vh',
                overflow: 'auto',
              }}
            >
              {preview.text}
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {preview?.error && (
                <Alert severity="warning" sx={{ mb: 1 }}>
                  {preview.error}
                </Alert>
              )}
              <Typography variant="body2" color="text.secondary">
                No inline preview for this file type. Details:
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', mt: 1 }}>
                <Typography variant="caption" color="text.secondary">Path</Typography>
                <Typography variant="caption" sx={{ wordBreak: 'break-all' }}>
                  {preview?.entry.path}
                </Typography>
                <Typography variant="caption" color="text.secondary">Size</Typography>
                <Typography variant="caption">
                  {formatBytes(preview?.stat?.size ?? preview?.entry.size ?? 0)}
                </Typography>
                {preview?.stat?.permissions && (
                  <>
                    <Typography variant="caption" color="text.secondary">Permissions</Typography>
                    <Typography variant="caption">{preview.stat.permissions}</Typography>
                  </>
                )}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreview(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={actionError !== null}
        autoHideDuration={5000}
        onClose={() => setActionError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default FilesApp;

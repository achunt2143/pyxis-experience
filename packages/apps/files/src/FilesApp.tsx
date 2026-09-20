import React, { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Dialog,
  Input,
  PopupPanel,
  Repanel,
  RepanelStack,
  Spinner,
} from 'remochi';
import {
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  MoreVertical,
  Music,
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

/** `data:` MIME type per image extension, for the base64 preview path. */
const IMAGE_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
};

// Extensions the daemon can hand back as UTF-8 for inline preview. Anything
// not matched here (or over the size cap) shows a metadata card instead of a
// garbled read. Images take the separate base64 path below.
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
  kind: 'text' | 'image' | 'meta';
  text?: string;
  /** `data:` URI built from a base64 readFile. Only set when kind === 'image'. */
  dataUri?: string;
  stat?: FsStat;
  error?: string;
}

type DialogState =
  | { type: 'newFolder'; dir: string; value: string }
  | { type: 'rename'; dir: string; entry: FsEntry; value: string }
  | { type: 'delete'; dir: string; entry: FsEntry }
  | null;

/**
 * FilesApp — Mochi-styled Miller-column file browser and manager.
 * Built 100% on Remochi components (RepanelStack, Dialog, PopupPanel, Button, Input, Spinner).
 */
export const FilesApp: React.FC<FilesAppProps> = ({ windowId }) => {
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ label: 'Home', path: HOME }]);
  const [dirs, setDirs] = useState<Record<string, DirState>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    anchorRect: DOMRect | null;
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
    const withinCap = entry.size <= MAX_PREVIEW_BYTES;
    const isImage = IMAGE_EXT.test(entry.name) && withinCap;
    const isText = TEXT_EXT.test(entry.name) && withinCap;

    if (!isImage && !isText) {
      setPreview({ entry, loading: false, kind: 'meta', stat });
      return;
    }

    try {
      if (isImage) {
        const ext = entry.name.split('.').pop()?.toLowerCase() ?? '';
        const res = (await fsCall('readFile', {
          path: entry.path,
          encoding: 'base64',
          maxBytes: MAX_PREVIEW_BYTES,
        })) as { content?: string } | undefined;

        if (!res?.content) {
          setPreview({ entry, loading: false, kind: 'meta', stat });
          return;
        }
        setPreview({
          entry,
          loading: false,
          kind: 'image',
          dataUri: `data:${IMAGE_MIME[ext] ?? 'application/octet-stream'};base64,${res.content}`,
          stat,
        });
        return;
      }

      const res = (await fsCall('readFile', {
        path: entry.path,
        encoding: 'utf-8',
        maxBytes: MAX_PREVIEW_BYTES,
      })) as { content?: string } | undefined;
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
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
          <Spinner active size="normal" />
        </div>
      );
    }
    if (dir.error) {
      return (
        <div style={{ padding: '16px', color: 'var(--color-text-secondary)' }}>
          {dir.error}
        </div>
      );
    }
    const sorted = [...(dir.entries ?? [])].sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    if (sorted.length === 0) {
      return (
        <div style={{ padding: '16px', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
          This folder is empty.
        </div>
      );
    }
    return (
      <div
        style={{
          height: '100%',
          overflow: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
          gap: '12px',
          alignContent: 'start',
          padding: '12px',
        }}
      >
        {sorted.map((entry) => {
          const kind = kindOf(entry);
          const Icon = KIND_ICON[kind];
          const isSelected = preview?.entry.path === entry.path;
          return (
            <div
              key={entry.path}
              onClick={() => (entry.isDirectory ? open(entry, panelIndex) : openPreview(entry))}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px',
                borderRadius: '12px',
                cursor: 'pointer',
                userSelect: 'none',
                position: 'relative',
                transition: 'background 0.15s ease, transform 0.15s ease',
                background: isSelected ? 'var(--mochi-primary-soft, rgba(74, 139, 194, 0.15))' : 'transparent',
                border: isSelected ? '1px solid var(--color-primary)' : '1px solid transparent',
              }}
              title={entry.name}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const target = e.currentTarget;
                  const rect = target.getBoundingClientRect();
                  setMenu({ anchorRect: rect, dir: path, entry });
                }}
                style={{
                  position: 'absolute',
                  top: '4px',
                  right: '4px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '4px',
                  cursor: 'pointer',
                  color: 'var(--color-text-secondary, #888)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label={`actions for ${entry.name}`}
              >
                <MoreVertical size={14} />
              </button>
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: `${KIND_COLOR[kind]}22`,
                  border: `1px solid ${KIND_COLOR[kind]}55`,
                  color: KIND_COLOR[kind],
                }}
              >
                <Icon size={26} />
              </div>
              <span
                style={{
                  fontSize: '0.78rem',
                  textAlign: 'center',
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: 'var(--color-text)',
                  fontWeight: 500,
                }}
              >
                {entry.name}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      data-window-id={windowId}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '8px',
        boxSizing: 'border-box',
        background: 'var(--color-background)',
        color: 'var(--color-text)',
      }}
    >
      {/* Breadcrumb + actions toolbar */}
      <div
        style={{
          padding: '8px 12px',
          borderRadius: '12px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: 0, overflow: 'hidden' }}>
          {crumbs.map((c, idx) => (
            <React.Fragment key={c.path + idx}>
              {idx > 0 && <ChevronRight size={14} style={{ opacity: 0.5, flexShrink: 0 }} />}
              <Button
                variant={idx === crumbs.length - 1 ? 'blue' : 'normal'}
                onClick={() => navigate(idx)}
              >
                {c.label}
              </Button>
            </React.Fragment>
          ))}
        </div>

        <Button
          disabled={busy || !!dirs[deepestPath]?.error}
          onClick={() => setDialog({ type: 'newFolder', dir: deepestPath, value: '' })}
        >
          <FolderPlus size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
          New Folder
        </Button>
      </div>

      {/* Folder columns (RepanelStack) */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <RepanelStack
          activeIndex={crumbs.length - 1}
          onActiveIndexChange={(index) => setCrumbs((prev) => prev.slice(0, index + 1))}
        >
          {crumbs.map((c, idx) => (
            <Repanel key={c.path}>{renderColumn(c.path, idx)}</Repanel>
          ))}
        </RepanelStack>
      </div>

      {/* Contextual actions menu (Remochi PopupPanel) */}
      <PopupPanel
        isOpen={!!menu}
        onClose={() => setMenu(null)}
        anchorRect={menu?.anchorRect ?? null}
        title={menu?.entry.name}
        actions={[
          ...(menu && !menu.entry.isDirectory
            ? [
                {
                  label: 'Open',
                  onClick: () => {
                    openPreview(menu.entry);
                    setMenu(null);
                  },
                },
              ]
            : []),
          {
            label: 'Rename',
            onClick: () => {
              if (menu) {
                setDialog({
                  type: 'rename',
                  dir: menu.dir,
                  entry: menu.entry,
                  value: menu.entry.name,
                });
              }
              setMenu(null);
            },
          },
          {
            label: 'Delete',
            type: 'warning',
            onClick: () => {
              if (menu) {
                setDialog({ type: 'delete', dir: menu.dir, entry: menu.entry });
              }
              setMenu(null);
            },
          },
        ]}
      >
        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', padding: '4px 0' }}>
          {menu?.entry.path}
        </div>
      </PopupPanel>

      {/* New folder dialog */}
      <Dialog
        isOpen={dialog?.type === 'newFolder'}
        onClose={() => (busy ? undefined : setDialog(null))}
        title="New Folder"
        type="default"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '280px', padding: '8px 0' }}>
          <Input
            autoFocus
            placeholder="Folder name"
            value={dialog?.type === 'newFolder' ? dialog.value : ''}
            onChange={(e) =>
              setDialog((d) =>
                d && d.type === 'newFolder' ? { ...d, value: e.target.value } : d
              )
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitDialog();
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="affirmative"
              onClick={() => void submitDialog()}
              disabled={busy || !dialog || dialog.type !== 'newFolder' || !dialog.value.trim()}
            >
              Create
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Rename dialog */}
      <Dialog
        isOpen={dialog?.type === 'rename'}
        onClose={() => (busy ? undefined : setDialog(null))}
        title="Rename"
        type="default"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: '280px', padding: '8px 0' }}>
          <Input
            autoFocus
            placeholder="New name"
            value={dialog?.type === 'rename' ? dialog.value : ''}
            onChange={(e) =>
              setDialog((d) =>
                d && d.type === 'rename' ? { ...d, value: e.target.value } : d
              )
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitDialog();
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <Button onClick={() => setDialog(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="affirmative"
              onClick={() => void submitDialog()}
              disabled={busy || !dialog || dialog.type !== 'rename' || !dialog.value.trim()}
            >
              Rename
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        isOpen={dialog?.type === 'delete'}
        onClose={() => (busy ? undefined : setDialog(null))}
        title="Confirm Delete"
        type="confirm"
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={() => void submitDialog()}
        onCancel={() => setDialog(null)}
      >
        <p style={{ margin: 0, color: 'var(--color-text)', fontSize: '0.9rem', lineHeight: 1.5 }}>
          Delete{' '}
          <strong>{dialog?.type === 'delete' ? dialog.entry.name : ''}</strong>
          {dialog?.type === 'delete' && dialog.entry.isDirectory
            ? ' and everything inside it? This cannot be undone.'
            : '? This cannot be undone.'}
        </p>
      </Dialog>

      {/* File preview modal */}
      <Dialog
        isOpen={!!preview}
        onClose={() => setPreview(null)}
        title={preview?.entry.name}
        size="large"
      >
        <div style={{ minWidth: '360px', maxHeight: '70vh', overflow: 'auto', padding: '8px 0' }}>
          {preview?.loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
              <Spinner active size="normal" />
            </div>
          ) : preview?.kind === 'image' ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <img
                src={preview.dataUri}
                alt={preview.entry.name}
                style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: '8px' }}
              />
            </div>
          ) : preview?.kind === 'text' ? (
            <pre
              style={{
                margin: 0,
                fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                fontSize: '0.82rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: '60vh',
                overflow: 'auto',
                background: 'var(--color-surface)',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
              }}
            >
              {preview.text}
            </pre>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {preview?.error && (
                <div style={{ color: 'var(--color-error)', marginBottom: '8px' }}>
                  {preview.error}
                </div>
              )}
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                No inline preview for this file type. Details:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', marginTop: '8px', fontSize: '0.82rem' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Path</span>
                <span style={{ wordBreak: 'break-all' }}>{preview?.entry.path}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>Size</span>
                <span>{formatBytes(preview?.stat?.size ?? preview?.entry.size ?? 0)}</span>
                {preview?.stat?.permissions && (
                  <>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Permissions</span>
                    <span>{preview.stat.permissions}</span>
                  </>
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <Button onClick={() => setPreview(null)}>Close</Button>
          </div>
        </div>
      </Dialog>

      {/* Action error alert dialog */}
      <Dialog
        isOpen={actionError !== null}
        title="Files Error"
        type="alert"
        confirmText="OK"
        onConfirm={() => setActionError(null)}
        onCancel={() => setActionError(null)}
        onClose={() => setActionError(null)}
      >
        <p style={{ margin: 0, color: 'var(--color-error)' }}>{actionError}</p>
      </Dialog>
    </div>
  );
};

export default FilesApp;

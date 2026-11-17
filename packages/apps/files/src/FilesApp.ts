import { view, type Component, type ComponentEvent } from '@duyojs/duyo';
import { onDestroy, registerIcons } from '@pyxis/app-sdk/duyo';
import {
  getPrivilegeState,
  getStorageInfo,
  onPrivilegeChanged,
  requestPrivilege,
  revokePrivilege,
  type StoragePartition,
} from '@pyxis/app-sdk';
import {
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  File,
  Folder,
  FolderPlus,
  Lock,
  Music,
  PanelLeft,
  RefreshCw,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import spec from './FilesApp.view.json';
import type { CodeBehind } from './FilesApp.view.gen';
import { fetchDir, fsCall } from './fs';
import {
  AUDIO_EXT,
  HOME,
  IMAGE_EXT,
  IMAGE_MIME,
  MAX_PREVIEW_BYTES,
  TEXT_EXT,
  TOO_LARGE_PREVIEW_MSG,
  getParentPath,
  isPathOrDescendant,
  isReadOnly,
  joinPath,
  nextSort,
  normalizePath,
  summarizeStorage,
  validateEntryName,
  visibleEntries,
  type DirState,
  type FsEntry,
  type FsStat,
  type Preview,
  type SortBy,
  type SortOrder,
  type StorageSummary,
  type ViewMode,
} from './model';
import type { DialogMode } from './FilesDialogs';
import './FilesSidebar';
import './FilesBrowser';
import './FilesInspector';
import './FilesDialogs';
import './files.css';

// Every icon the Files specs name.
registerIcons({
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  File,
  Folder,
  FolderPlus,
  Lock,
  Music,
  PanelLeft,
  RefreshCw,
  Trash2,
  Unlock,
  X,
});

function isEditableElement(el: HTMLElement | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** What the open dialog is about. The typed name lives in the dialog's field. */
interface DialogState {
  type: Exclude<DialogMode, ''>;
  dir: string;
  entry?: FsEntry;
}

interface MenuState {
  dir: string;
  entry: FsEntry;
}

/**
 * Files: the three-panel file browser (places, folder, inspector). This kind owns the state
 * (path and history, folder cache, preview, dialog, menu) and every call to Echo's filesystem
 * service; the panels are views of it. A handler changes state, then `sync` pushes what the
 * panels show. The inspector panel exists only while a file is being previewed (the React app
 * mounted it the same way), so it is created and destroyed here.
 *
 * Not published (plain instance fields): nothing outside this kind reads them, and the panels
 * are fed by `sync`.
 */
export default view(spec, {
  create() {
    this.inherited();
    this.setAttributes({ 'data-window-id': this.windowId });
    this._path = HOME;
    this._history = [HOME] as string[];
    this._historyIndex = 0;
    this._viewMode = 'list' as ViewMode;
    this._query = '';
    this._sortBy = 'name' as SortBy;
    this._sortOrder = 'asc' as SortOrder;
    this._showHidden = false;
    this._dirs = {} as Record<string, DirState>;
    // Which folders were asked for: a folder is fetched the first time it is shown, once.
    this._requested = new Set<string>();
    this._preview = null as Preview | null;
    this._previewToken = 0;
    this._panel = null as Component | null;
    this._dialog = null as DialogState | null;
    this._busy = false;
    this._actionError = null as string | null;
    this._menu = null as MenuState | null;
    this._visible = null as {
      entries: FsEntry[] | undefined;
      query: string;
      by: SortBy;
      order: SortOrder;
      showHidden: boolean;
      result: FsEntry[];
    } | null;
    this._privileged = false;
    this._storagePartitions = [] as StoragePartition[];
    this._storage = null as StorageSummary | null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (this.destroyed) return;
      this.handleKeyDown(e);
    };
    document.addEventListener('keydown', onKeyDown);
    onDestroy(this, () => document.removeEventListener('keydown', onKeyDown));

    const offPrivilege = onPrivilegeChanged((state) => {
      if (this.destroyed) return;
      const next =
        state.grants.some((g) => g.appId === 'files' && g.remainingSecs > 0) ||
        (state.active && state.grant?.appId === 'files');
      if (next !== this._privileged) {
        this._privileged = next;
        this.sync();
      }
    });
    onDestroy(this, offPrivilege);
    void getPrivilegeState('files').then((state) => {
      if (this.destroyed) return;
      const next = !!state.active;
      if (next !== this._privileged) {
        this._privileged = next;
        this.sync();
      }
    });

    void this.loadStorageInfo();
    this.ensureLoaded();
    this.sync();
  },

  async loadStorageInfo() {
    const partitions = await getStorageInfo();
    if (this.destroyed) return;
    this._storagePartitions = partitions;
    const next = summarizeStorage(partitions, this._path as string);
    this._storage = next;
    this.sync();
  },

  handleKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (
      this._dialog ||
      this._actionError !== null ||
      this._menu ||
      target?.closest?.('[role="dialog"], .mochi-dialog-overlay, .mochi-contextual-popup')
    ) {
      return;
    }

    const key = e.key;
    const mod = e.ctrlKey || e.metaKey;
    const editable = isEditableElement(target);

    if (mod && !e.altKey && key.toLowerCase() === 'f') {
      e.preventDefault();
      this.$.browser.focusSearch();
      return;
    }
    if (mod && !e.altKey && key.toLowerCase() === 'n') {
      e.preventDefault();
      const dir = this._dirs[this._path] as DirState | undefined;
      if (!this._busy && !dir?.error && (!isReadOnly(this._path) || this._privileged)) {
        this.newFolder();
      }
      return;
    }
    if (mod && !e.altKey && !e.shiftKey && key.toLowerCase() === 'h') {
      e.preventDefault();
      this.toggleHidden();
      return;
    }
    if (!mod && !e.altKey && !e.shiftKey && key === 'F5') {
      e.preventDefault();
      this.reload();
      return;
    }
    if (e.altKey && !mod && !e.shiftKey && key === 'ArrowLeft') {
      e.preventDefault();
      this.back();
      return;
    }
    if (e.altKey && !mod && !e.shiftKey && key === 'ArrowRight') {
      e.preventDefault();
      this.forward();
      return;
    }
    if (e.altKey && !mod && !e.shiftKey && key === 'ArrowUp') {
      e.preventDefault();
      this.goUp();
      return;
    }
    if (!mod && !e.altKey && !e.shiftKey && key === 'Backspace' && !editable) {
      e.preventDefault();
      if (this._historyIndex > 0) this.back();
      else this.goUp();
      return;
    }
    if (!mod && !e.altKey && !e.shiftKey && key === 'Escape') {
      const inSearch = !!target?.closest?.('.files-search');
      if (inSearch && this._query) {
        e.preventDefault();
        this._query = '';
        this.sync();
        return;
      }
      if (this._preview) {
        e.preventDefault();
        this.endPreview(true);
        return;
      }
      if (this._query) {
        e.preventDefault();
        this._query = '';
        this.sync();
        return;
      }
      if (this.$.stack.getActiveIndex() === 0) {
        e.preventDefault();
        this.$.stack.setActiveIndex(1);
      }
    }
  },

  // ---- Events from the panels ------------------------------------------------------------

  pickPlace(_sender, event) {
    this.navigateTo(event['path']);
    this.$.stack.setActiveIndex(1);
    return true;
  },
  openPlaces() {
    this.$.stack.setActiveIndex(0);
    return true;
  },
  closePlaces() {
    this.$.stack.setActiveIndex(1);
    return true;
  },
  navigate(_sender, event) {
    this.navigateTo(event['path']);
    return true;
  },
  goBack() {
    this.back();
    return true;
  },
  goForward() {
    this.forward();
    return true;
  },
  back() {
    if (this._historyIndex > 0) {
      this._historyIndex -= 1;
      this._path = this._history[this._historyIndex];
      this._query = '';
      this._storage = summarizeStorage(this._storagePartitions as StoragePartition[], this._path);
      this.dropPreview();
      this.$.stack.setActiveIndex(1);
      this.ensureLoaded();
      this.sync();
    }
  },
  forward() {
    const history = this._history as string[];
    if (this._historyIndex < history.length - 1) {
      this._historyIndex += 1;
      this._path = history[this._historyIndex];
      this._query = '';
      this._storage = summarizeStorage(this._storagePartitions as StoragePartition[], this._path);
      this.dropPreview();
      this.$.stack.setActiveIndex(1);
      this.ensureLoaded();
      this.sync();
    }
  },
  goUp() {
    const parent = getParentPath(this._path);
    if (parent !== this._path) this.navigateTo(parent);
    return true;
  },
  search(_sender, event) {
    this._query = String(event['value'] ?? '');
    this.sync();
    return true;
  },
  pickViewMode(_sender, event) {
    this._viewMode = event['mode'];
    this.sync();
    return true;
  },
  cycleSort() {
    const next = nextSort(this._sortBy, this._sortOrder);
    this._sortBy = next.sortBy;
    this._sortOrder = next.sortOrder;
    this.sync();
    return true;
  },
  toggleHidden() {
    this._showHidden = !this._showHidden;
    this.sync();
    return true;
  },
  newFolder() {
    this.openDialog({ type: 'newFolder', dir: this._path });
    return true;
  },
  reload() {
    void this.reloadDir(this._path);
    void this.loadStorageInfo();
    return true;
  },
  requestUnlock() {
    void requestPrivilege('Change system files', 'files');
    return true;
  },
  revokeUnlock() {
    void revokePrivilege('files');
    return true;
  },
  openEntry(_sender, event) {
    const entry = event['entry'] as FsEntry;
    if (entry.isDirectory) this.navigateTo(entry.path);
    else void this.openPreview(entry);
    return true;
  },
  entryMenu(_sender, event) {
    this.openMenu(event['entry'], event['rect']);
    return true;
  },
  renameEntry(_sender, event) {
    const entry = event['entry'] as FsEntry | undefined;
    if (!entry || (isReadOnly(entry.path) && !this._privileged)) return true;
    this.openDialog({ type: 'rename', dir: this._path, entry });
    return true;
  },
  deleteEntry(_sender, event) {
    const entry = event['entry'] as FsEntry | undefined;
    if (!entry || (isReadOnly(entry.path) && !this._privileged)) return true;
    this.openDialog({ type: 'delete', dir: this._path, entry });
    return true;
  },

  /** The stack moved (a drag, or our own `setActiveIndex`). Leaving the inspector closes the preview. */
  panelMoved(_sender, event) {
    if (event['index'] < 2 && this._preview) this.endPreview(false);
    return true;
  },

  // From the inspector.
  closePreview() {
    this.endPreview(true);
    return true;
  },
  renameFromInspector() {
    const preview = this._preview as Preview | null;
    if (preview) this.openDialog({ type: 'rename', dir: this._path, entry: preview.entry });
    return true;
  },
  deleteFromInspector() {
    const preview = this._preview as Preview | null;
    if (preview) this.openDialog({ type: 'delete', dir: this._path, entry: preview.entry });
    return true;
  },
  inspectorCopyError(_sender: Component, event: ComponentEvent) {
    this._actionError = String(event['message'] ?? 'Failed to copy to clipboard');
    this.sync();
    return true;
  },

  // From the popup menu.
  menuAction(_sender, event) {
    const menu = this._menu as MenuState | null;
    this._menu = null;
    this.$.menu.setOpen(false);
    if (menu) {
      const action = event['action'];
      if (action === 'preview') void this.openPreview(menu.entry);
      else if (action === 'open') this.navigateTo(menu.entry.path);
      else if (action === 'rename') this.openDialog({ type: 'rename', dir: menu.dir, entry: menu.entry });
      else if (action === 'delete') this.openDialog({ type: 'delete', dir: menu.dir, entry: menu.entry });
    }
    return true;
  },
  menuClosed() {
    this._menu = null;
    return true;
  },

  // From the dialogs.
  dialogSubmit(_sender, event) {
    void this.submitDialog(String(event['value'] ?? ''));
    return true;
  },
  dialogConfirmDelete() {
    void this.submitDialog('');
    return true;
  },
  /** Cancel, scrim and Escape; ignored while an action runs. */
  dialogDismiss() {
    if (!this._busy) this._dialog = null;
    this.sync();
    return true;
  },
  dismissError() {
    this._actionError = null;
    this.sync();
    return true;
  },

  // ---- State changes ---------------------------------------------------------------------

  navigateTo(target: string, pushHistory = true) {
    const next = normalizePath(target);
    if (next === this._path) return;
    if (pushHistory) {
      const history = (this._history as string[]).slice(0, this._historyIndex + 1);
      history.push(next);
      this._history = history;
      this._historyIndex = history.length - 1;
    }
    this._path = next;
    this._query = '';
    this._storage = summarizeStorage(this._storagePartitions as StoragePartition[], next);
    this.dropPreview();
    this.$.stack.setActiveIndex(1);
    this.ensureLoaded();
    this.sync();
  },

  /** Fetches the current folder the first time it is shown (retrying if the last fetch failed). */
  ensureLoaded() {
    const path = this._path as string;
    const requested = this._requested as Set<string>;
    if (requested.has(path)) return;
    requested.add(path);
    this._dirs[path] = { loading: true };
    void fetchDir(path).then((state) => {
      if (this.destroyed || !requested.has(path)) return;
      if (state.error) requested.delete(path);
      this._dirs[path] = state;
      this.sync();
    });
  },
  async reloadDir(path: string) {
    const requested = this._requested as Set<string>;
    requested.add(path);
    const state = await fetchDir(path);
    if (this.destroyed) return;
    if (state.error) requested.delete(path);
    this._dirs[path] = state;
    this.sync();
  },
  invalidatePathTree(target: string) {
    const dirs = this._dirs as Record<string, DirState>;
    const requested = this._requested as Set<string>;
    for (const key of Object.keys(dirs)) {
      if (isPathOrDescendant(key, target)) delete dirs[key];
    }
    for (const key of Array.from(requested)) {
      if (isPathOrDescendant(key, target)) requested.delete(key);
    }
  },

  // ---- Preview ---------------------------------------------------------------------------

  /** Shows `preview` in the inspector panel, creating the panel if there is none yet. */
  showPreview(preview: Preview) {
    this._preview = preview;
    if (!this._panel) {
      this._panel = this.$.stack.createComponent(
        {
          kind: 'remochi.Repanel',
          look: 'shadow',
          components: [
            {
              kind: 'Files.Inspector',
              onClosePreview: 'closePreview',
              onRenameEntry: 'renameFromInspector',
              onDeleteEntry: 'deleteFromInspector',
              onCopyError: 'inspectorCopyError',
            },
          ],
        },
        { owner: this }
      );
    }
    this.$.stack.setActiveIndex(2);
    this.sync();
  },
  /** Takes the preview down (the inspector panel goes with it) and forgets any load in flight. */
  dropPreview() {
    this._previewToken += 1;
    this._preview = null;
    const panel = this._panel as Component | null;
    this._panel = null;
    panel?.destroy();
  },
  endPreview(moveStack: boolean) {
    this.dropPreview();
    if (moveStack) this.$.stack.setActiveIndex(1);
    this.sync();
  },

  async openPreview(entry: FsEntry) {
    const token = ++this._previewToken;
    const current = () => !this.destroyed && token === this._previewToken;
    this.showPreview({ entry, loading: true, kind: 'meta' });

    let stat: FsStat | undefined;
    try {
      stat = (await fsCall('stat', { path: entry.path })) as FsStat | undefined;
    } catch {
      /* stat is best-effort */
    }
    if (!current()) return;

    const effectiveSize = Math.max(entry.size, stat?.size ?? 0);
    const withinCap = effectiveSize <= MAX_PREVIEW_BYTES;
    const isImage = IMAGE_EXT.test(entry.name);
    const isText = TEXT_EXT.test(entry.name);
    const isAudio = AUDIO_EXT.test(entry.name);

    if (isAudio) {
      this.showPreview({ entry, loading: false, kind: 'audio', stat });
      return;
    }
    if (!withinCap) {
      this.showPreview({ entry, loading: false, kind: 'meta', stat, error: TOO_LARGE_PREVIEW_MSG });
      return;
    }
    if (!isImage && !isText) {
      this.showPreview({ entry, loading: false, kind: 'meta', stat });
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
        if (!current()) return;
        if (!res?.content) {
          this.showPreview({ entry, loading: false, kind: 'meta', stat });
          return;
        }
        this.showPreview({
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
      if (!current()) return;
      this.showPreview({ entry, loading: false, kind: 'text', text: res?.content ?? '', stat });
    } catch (err) {
      if (!current()) return;
      this.showPreview({
        entry,
        loading: false,
        kind: 'meta',
        stat,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  // ---- Menu and dialogs ------------------------------------------------------------------

  openMenu(entry: FsEntry, rect: DOMRect) {
    this._menu = { dir: this._path, entry } satisfies MenuState;
    const actions: Array<{ label: string; action: string; type?: string }> = [];
    if (!entry.isDirectory) actions.push({ label: 'Preview', action: 'preview' });
    if (entry.isDirectory) actions.push({ label: 'Open Folder', action: 'open' });
    if (!isReadOnly(entry.path) || this._privileged) {
      actions.push({ label: 'Rename', action: 'rename' }, { label: 'Delete', action: 'delete', type: 'warning' });
    }
    const menu = this.$.menu;
    menu.setTitle(entry.name);
    menu.setActions(actions);
    menu.setAnchorRect(rect);
    this.$.menuPath.setContent(entry.path);
    menu.setOpen(true);
  },

  openDialog(dialog: DialogState) {
    this._dialog = dialog;
    this.sync();
  },

  async runAction(fn: () => Promise<void>) {
    this._busy = true;
    this._actionError = null;
    this.sync();
    try {
      await fn();
    } catch (err) {
      if (!this.destroyed) {
        this._dialog = null;
        this._actionError = err instanceof Error ? err.message : String(err);
      }
    } finally {
      if (!this.destroyed) {
        this._busy = false;
        this.sync();
      }
    }
  },

  /** Create, Rename or Delete, whichever dialog is open. `value` is the name typed (unused by Delete). */
  async submitDialog(value: string) {
    const dialog = this._dialog as DialogState | null;
    if (!dialog) return;
    const existingNames = ((this._dirs[dialog.dir] as DirState | undefined)?.entries ?? []).map((e) => e.name);

    if (dialog.type === 'newFolder') {
      const validationError = validateEntryName(value, { existingNames });
      if (validationError) {
        this._dialog = null;
        this._actionError = validationError;
        this.sync();
        return;
      }
      const name = value.trim();
      const targetPath = joinPath(dialog.dir, name);
      await this.runAction(async () => {
        await fsCall('createDirectory', { path: targetPath });
        await this.reloadDir(dialog.dir);
        this._dialog = null;
      });
    } else if (dialog.type === 'rename' && dialog.entry) {
      const entry = dialog.entry;
      const validationError = validateEntryName(value, { existingNames, currentName: entry.name });
      if (validationError) {
        this._dialog = null;
        this._actionError = validationError;
        this.sync();
        return;
      }
      const name = value.trim();
      if (name === entry.name) {
        this._dialog = null;
        this.sync();
        return;
      }
      const destination = joinPath(dialog.dir, name);
      await this.runAction(async () => {
        await fsCall('move', { source: entry.path, destination });
        if (entry.isDirectory) {
          this.invalidatePathTree(entry.path);
          this.invalidatePathTree(destination);
        }
        const preview = this._preview as Preview | null;
        if (preview && isPathOrDescendant(preview.entry.path, entry.path)) this.endPreview(true);
        await this.reloadDir(dialog.dir);
        this._dialog = null;
      });
    } else if (dialog.type === 'delete' && dialog.entry) {
      const entry = dialog.entry;
      await this.runAction(async () => {
        if (entry.isDirectory) {
          await fsCall('deleteDirectory', { path: entry.path, recursive: true });
          this.invalidatePathTree(entry.path);
        } else {
          await fsCall('deleteFile', { path: entry.path });
        }
        const preview = this._preview as Preview | null;
        if (preview && isPathOrDescendant(preview.entry.path, entry.path)) this.endPreview(true);
        await this.reloadDir(dialog.dir);
        this._dialog = null;
      });
    }
  },

  // ---- Pushing state to the panels --------------------------------------------------------

  /** The current folder's entries, filtered and sorted. The same array until an input changes. */
  visible(dir: DirState | undefined): FsEntry[] {
    const last = this._visible;
    const entries = dir?.entries;
    if (
      last &&
      last.entries === entries &&
      last.query === this._query &&
      last.by === this._sortBy &&
      last.order === this._sortOrder &&
      last.showHidden === this._showHidden
    ) {
      return last.result;
    }
    const result = visibleEntries(entries, this._query, this._sortBy, this._sortOrder, this._showHidden);
    this._visible = {
      entries,
      query: this._query,
      by: this._sortBy,
      order: this._sortOrder,
      showHidden: this._showHidden,
      result,
    };
    return result;
  },

  /** Pushes what the panels show. Setting a value a panel already has changes nothing. */
  sync() {
    if (this.destroyed) return;
    const { browser, sidebar, dialogs } = this.$;
    const path = this._path as string;
    const dir = this._dirs[path] as DirState | undefined;
    const preview = this._preview as Preview | null;
    const history = this._history as string[];

    sidebar.setFolder(path);
    sidebar.setStorageInfo(this._storage as StorageSummary | null);

    browser.setFolder(path);
    browser.setCanBack(this._historyIndex > 0);
    browser.setCanForward(this._historyIndex < history.length - 1);
    browser.setViewMode(this._viewMode);
    browser.setSortBy(this._sortBy);
    browser.setSortOrder(this._sortOrder);
    browser.setShowHidden(this._showHidden);
    browser.setQuery(this._query);
    browser.setBusy(this._busy);
    browser.setDir(dir ?? null);
    browser.setEntries(this.visible(dir));
    browser.setSelectedPath(preview?.entry.path ?? null);
    browser.setPrivileged(this._privileged);

    const inspector = (this._panel as Component | null)?.children[0];
    if (inspector) {
      inspector.set('privileged', this._privileged);
      if (preview) inspector.set('preview', preview);
    }

    // Dialog fields first, then the mode that opens it (it reads them).
    const dialog = this._dialog as DialogState | null;
    const existingNames = dialog
      ? ((this._dirs[dialog.dir] as DirState | undefined)?.entries ?? []).map((e) => e.name)
      : [];
    dialogs.setEntryName(dialog?.entry?.name ?? '');
    dialogs.setIsDirectory(!!dialog?.entry?.isDirectory);
    dialogs.setExistingNames(existingNames);
    dialogs.setBusy(this._busy);
    dialogs.setError(this._actionError);
    dialogs.setMode(dialog?.type ?? '');
    dialogs.applyOpen();
  },
} satisfies CodeBehind);

import { view, type Component } from '@duyojs/duyo';
import { registerIcons } from '@pyxis/app-sdk/duyo';
import {
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Edit3,
  File,
  Folder,
  FolderPlus,
  Music,
  RefreshCw,
  Trash2,
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
  getParentPath,
  isReadOnly,
  nextSort,
  normalizePath,
  visibleEntries,
  type DirState,
  type FsEntry,
  type FsStat,
  type Preview,
  type SortBy,
  type SortOrder,
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
  File,
  Folder,
  FolderPlus,
  Music,
  RefreshCw,
  Trash2,
  X,
});

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
    this._visible = null as { entries: FsEntry[] | undefined; query: string; by: SortBy; order: SortOrder; result: FsEntry[] } | null;

    this.ensureLoaded();
    this.sync();
  },

  // ---- Events from the panels ------------------------------------------------------------

  pickPlace(_sender, event) {
    this.navigateTo(event['path']);
    return true;
  },
  navigate(_sender, event) {
    this.navigateTo(event['path']);
    return true;
  },
  goBack() {
    if (this._historyIndex > 0) {
      this._historyIndex -= 1;
      this._path = this._history[this._historyIndex];
      this._query = '';
      this.dropPreview();
      this.$.stack.setActiveIndex(1);
      this.ensureLoaded();
      this.sync();
    }
    return true;
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
  newFolder() {
    this.openDialog({ type: 'newFolder', dir: this._path });
    return true;
  },
  reload() {
    void this.reloadDir(this._path);
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
    this.dropPreview();
    this.$.stack.setActiveIndex(1);
    this.ensureLoaded();
    this.sync();
  },

  /** Fetches the current folder the first time it is shown (later visits use the cache until Refresh). */
  ensureLoaded() {
    const path = this._path as string;
    if ((this._requested as Set<string>).has(path)) return;
    (this._requested as Set<string>).add(path);
    this._dirs[path] = { loading: true };
    void fetchDir(path).then((state) => {
      if (this.destroyed) return;
      this._dirs[path] = state;
      this.sync();
    });
  },
  async reloadDir(path: string) {
    const state = await fetchDir(path);
    if (this.destroyed) return;
    this._dirs[path] = state;
    this.sync();
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

    const withinCap = entry.size <= MAX_PREVIEW_BYTES;
    const isImage = IMAGE_EXT.test(entry.name) && withinCap;
    const isText = TEXT_EXT.test(entry.name) && withinCap;
    const isAudio = AUDIO_EXT.test(entry.name);

    if (isAudio) {
      this.showPreview({ entry, loading: false, kind: 'audio', stat });
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
    if (!isReadOnly(entry.path)) {
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
      if (!this.destroyed) this._actionError = err instanceof Error ? err.message : String(err);
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
    if (dialog.type === 'newFolder') {
      const name = value.trim();
      if (!name) return;
      await this.runAction(async () => {
        await fsCall('createDirectory', { path: `${dialog.dir}/${name}` });
        await this.reloadDir(dialog.dir);
        this._dialog = null;
      });
    } else if (dialog.type === 'rename' && dialog.entry) {
      const entry = dialog.entry;
      const name = value.trim();
      if (!name || name === entry.name) {
        this._dialog = null;
        this.sync();
        return;
      }
      await this.runAction(async () => {
        await fsCall('move', { source: entry.path, destination: `${dialog.dir}/${name}` });
        if ((this._preview as Preview | null)?.entry.path === entry.path) this.endPreview(true);
        await this.reloadDir(dialog.dir);
        this._dialog = null;
      });
    } else if (dialog.type === 'delete' && dialog.entry) {
      const entry = dialog.entry;
      await this.runAction(async () => {
        if (entry.isDirectory) {
          await fsCall('deleteDirectory', { path: entry.path, recursive: true });
        } else {
          await fsCall('deleteFile', { path: entry.path });
        }
        if ((this._preview as Preview | null)?.entry.path === entry.path) this.endPreview(true);
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
    if (last && last.entries === entries && last.query === this._query && last.by === this._sortBy && last.order === this._sortOrder) {
      return last.result;
    }
    const result = visibleEntries(entries, this._query, this._sortBy, this._sortOrder);
    this._visible = { entries, query: this._query, by: this._sortBy, order: this._sortOrder, result };
    return result;
  },

  /** Pushes what the panels show. Setting a value a panel already has changes nothing. */
  sync() {
    if (this.destroyed) return;
    const { browser, sidebar, dialogs } = this.$;
    const path = this._path as string;
    const dir = this._dirs[path] as DirState | undefined;
    const preview = this._preview as Preview | null;

    sidebar.setFolder(path);

    browser.setFolder(path);
    browser.setCanBack(this._historyIndex > 0);
    browser.setViewMode(this._viewMode);
    browser.setSortBy(this._sortBy);
    browser.setSortOrder(this._sortOrder);
    browser.setQuery(this._query);
    browser.setBusy(this._busy);
    browser.setDir(dir ?? null);
    browser.setEntries(this.visible(dir));
    browser.setSelectedPath(preview?.entry.path ?? null);

    const inspector = (this._panel as Component | null)?.children[0];
    if (inspector && preview) inspector.set('preview', preview);

    // Dialog fields first, then the mode that opens it (it reads them).
    const dialog = this._dialog as DialogState | null;
    dialogs.setEntryName(dialog?.entry?.name ?? '');
    dialogs.setIsDirectory(!!dialog?.entry?.isDirectory);
    dialogs.setBusy(this._busy);
    dialogs.setError(this._actionError);
    dialogs.setMode(dialog?.type ?? '');
    dialogs.applyOpen();
  },
} satisfies CodeBehind);

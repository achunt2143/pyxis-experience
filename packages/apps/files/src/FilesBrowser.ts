import { view, type Component } from '@duyojs/duyo';
import spec from './FilesBrowser.view.json';
import type { CodeBehind } from './FilesBrowser.view.gen';
import { getCrumbsForPath, isReadOnly, type DirState, type FsEntry, type SortBy, type SortOrder } from './model';
import type { CrumbItem } from './FilesCrumb';
import './FilesCrumb';
import './ListingKind';

/**
 * The folder panel: toolbar (back, up, breadcrumbs, search, view, sort, New Folder), status bar
 * and the listing. It keeps no state of its own besides what the controls show: the app pushes
 * `folder`, `canBack`, `viewMode`, `sortBy`/`sortOrder`, `query`, `busy`, `dir` (loading, error
 * or entries), `entries` (already filtered and sorted) and `selectedPath`; every control raises
 * an event the app handles.
 */
export default view(spec, {
  create() {
    this.inherited();
    this.folderChanged();
    this.canBackChanged();
    this.sortByChanged();
    this.updateStatus();
    this.updateBody();
  },

  /** remochi's Button takes aria attributes as props, which a Duyo kind cannot pass: set them on the element. */
  rendered() {
    this.inherited();
    const label = (component: Component, text: string) =>
      document.querySelector(`[data-duyo-id="${component.id}"] button`)?.setAttribute('aria-label', text);
    label(this.$.back, 'Go Back');
    label(this.$.up, 'Parent Directory');
  },

  // Events from the controls, re-raised for the app.
  goBack() {
    this.doGoBack();
    return true;
  },
  goUp() {
    this.doGoUp();
    return true;
  },
  pickCrumb(sender: Component) {
    this.doNavigate({ path: (sender['item'] as CrumbItem).path });
    return true;
  },
  searchInput(_sender, event) {
    this.doSearch({ value: String(event['value'] ?? '') });
    return true;
  },
  pickView(_sender, event) {
    this.doViewMode({ mode: event['index'] === 0 ? 'list' : 'grid' });
    return true;
  },
  cycleSort() {
    this.doCycleSort();
    return true;
  },
  newFolder() {
    this.doNewFolder();
    return true;
  },
  reload() {
    this.doReload();
    return true;
  },
  openEntry(_sender, event) {
    this.doOpenEntry({ entry: event['entry'] });
    return true;
  },
  entryMenu(_sender, event) {
    this.doEntryMenu({ entry: event['entry'], rect: event['rect'] });
    return true;
  },

  // Published properties pushed in by the app.
  folderChanged() {
    const path = this.folder as string;
    const crumbs = getCrumbsForPath(path);
    this.$.crumbs.setItems(
      crumbs.map((c, i): CrumbItem => ({ ...c, first: i === 0, last: i === crumbs.length - 1 }))
    );
    this.$.up.setDisabled(path === '/' || path === '~');
    this.updateStatus();
    this.updateNewFolder();
  },
  canBackChanged() {
    this.$.back.setDisabled(!this.canBack);
  },
  viewModeChanged() {
    this.$.views.setSelected(this.viewMode === 'list' ? 0 : 1);
    this.$.listing.setViewMode(this.viewMode);
  },
  sortByChanged() {
    this.sortChanged();
  },
  sortOrderChanged() {
    this.sortChanged();
  },
  sortChanged() {
    const by = this.sortBy as SortBy;
    const order = this.sortOrder as SortOrder;
    this.$.sortWrap.setAttributes({ title: `Sort by ${by} (${order})` });
    this.$.sortLabel.setContent(by.toUpperCase());
  },
  queryChanged() {
    this.$.search.setValue(this.query as string);
    this.updateStatus();
    this.updateBody();
  },
  busyChanged() {
    this.updateNewFolder();
  },
  dirChanged() {
    this.updateNewFolder();
    this.updateBody();
  },
  entriesChanged() {
    this.$.listing.setEntries(this.entries as FsEntry[]);
    this.updateStatus();
    this.updateBody();
  },
  selectedPathChanged() {
    this.$.listing.setSelectedPath(this.selectedPath as string | null);
  },

  updateNewFolder() {
    const dir = this.dir as DirState | null;
    this.$.newFolder.setDisabled(!!this.busy || isReadOnly(this.folder as string) || !!dir?.error);
  },
  updateStatus() {
    const count = (this.entries as FsEntry[]).length;
    const query = this.query as string;
    this.$.status.setContent(
      `${count} ${count === 1 ? 'item' : 'items'}` +
        (query ? ` matching "${query}"` : '') +
        (isReadOnly(this.folder as string) ? ' · Read-only: outside your home, files can be opened but not changed' : '')
    );
  },
  /** One of loading / error / empty / listing, in the order the React panel tested them. */
  updateBody() {
    const dir = this.dir as DirState | null;
    const count = (this.entries as FsEntry[]).length;
    const loading = !!dir?.loading;
    const error = !loading && !!dir?.error;
    const empty = !loading && !error && count === 0;
    const { loading: l, error: e, empty: m, listing } = this.$;
    l.setShowing(loading);
    e.setShowing(error);
    m.setShowing(empty);
    listing.setShowing(!loading && !error && !empty);
    if (error) this.$.errorText.setContent(dir?.error ?? '');
    const searching = this.query !== '';
    this.$.emptyTitle.setContent(searching ? 'No matching files found' : 'This folder is empty');
    this.$.emptyHint.setContent(searching ? 'Try clearing your search query' : 'Create a new folder or add files here');
  },
} satisfies CodeBehind);

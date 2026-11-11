import { view, type Component } from '@duyojs/duyo';
import spec from './ContactList.view.json';
import { CATEGORIES, type Contact } from './model';
import type { CodeBehind } from './ContactList.view.gen';
import type { PillItem } from './ContactPill';
import './ContactPill';
import './Directory';

/**
 * The directory panel: header, search, category pills, the A-Z list. State comes in
 * (`items`, `counts`, `category`, `selectedId`, `loaded`, `total`); onAddContact,
 * onExportAll, onSearchChange, onCategoryChange and onSelectContact go out.
 */
export default view(spec, {
  create() {
    this.inherited();
    this.draw();
  },

  add() {
    this.doAddContact();
    return true;
  },
  exportAll() {
    this.doExportAll();
    return true;
  },
  searchInput(_sender, event) {
    this.doSearchChange({ value: String(event['value'] ?? '') });
    return true;
  },
  pickCategory(sender: Component) {
    this.doCategoryChange({ category: (sender['item'] as PillItem).id });
    return true;
  },
  /** The island's own event, re-raised as the panel's. */
  directoryPicked(_sender, event) {
    this.doSelectContact({ id: event['id'] });
    return true;
  },

  /** Takes any of `items`, `counts`, `category`, `search`, `selectedId`, `loaded`, `total`. */
  update(state: Record<string, unknown>) {
    for (const [key, value] of Object.entries(state)) this.set(key, value);
    this.draw();
  },

  draw() {
    const { exportWrap, pills, loading, empty, emptyText, directory } = this.$;
    const items = this.items as Contact[];
    const counts = this.counts as Record<string, number>;
    exportWrap.setShowing((this.total as number) > 0);
    pills.setItems(CATEGORIES.map((id): PillItem => ({ id, count: counts[id] ?? 0, active: id === this.category })));
    loading.setShowing(!this.loaded);
    empty.setShowing(this.loaded && items.length === 0);
    emptyText.setContent(this.search ? 'No contacts match your search' : 'No contacts in this category');
    directory.setShowing(this.loaded && items.length > 0);
    directory.setItems(items);
    directory.setSelectedId(this.selectedId);
  },
} satisfies CodeBehind);

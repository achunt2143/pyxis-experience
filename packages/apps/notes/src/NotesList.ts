import { view, type Component } from '@duyojs/duyo';
import spec from './NotesList.view.json';
import { CATEGORIES, type Note } from './model';
import type { CodeBehind } from './NotesList.view.gen';
import type { PillItem } from './NotePill';
import './NotePill';
import './NoteRow';

/**
 * The list panel: header, search, category pills, the notes. It holds no state of its own:
 * the app pushes `items`, `counts`, `category`, `selectedId`, `loaded` and `searching` in,
 * and the panel raises onAddNote / onSelectNote / onSearchChange / onCategoryChange out.
 */
export default view(spec, {
  create() {
    this.inherited();
    this.refreshPills();
    this.itemsChanged();
    this.loadedChanged();
  },

  // Events from inside the panel, re-raised as the panel's own (the app handles those).
  add() {
    this.doAddNote();
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
  pickNote(sender: Component) {
    this.doSelectNote({ id: (sender['item'] as Note).id });
    return true;
  },
  /** Raised for every row on every refresh: where per-row state that is not the item is applied. */
  setupRow(_sender, event) {
    event['component'].setSelected(event['item'].id === this.selectedId);
    return true;
  },

  // Published properties pushed in by the app.
  itemsChanged() {
    const { rows, badge, heading, empty } = this.$;
    rows.setItems(this.items as Note[]);
    badge.setContent(String((this.items as Note[]).length));
    heading.setContent(`${this.category} Notes`);
    empty.setShowing(this.loaded && (this.items as Note[]).length === 0);
    empty.setContent(this.searching ? 'No notes match your search.' : 'No notes in this category.');
  },
  selectedIdChanged() {
    this.$.rows.refresh();
  },
  categoryChanged() {
    this.refreshPills();
    this.itemsChanged();
  },
  countsChanged() {
    this.refreshPills();
  },
  searchingChanged() {
    this.itemsChanged();
  },
  loadedChanged() {
    this.$.loading.setShowing(!this.loaded);
    this.$.results.setShowing(this.loaded);
    this.itemsChanged();
  },

  refreshPills() {
    const counts = this.counts as Record<string, number>;
    this.$.pills.setItems(
      CATEGORIES.map((id): PillItem => ({ id, count: counts[id] ?? 0, active: id === this.category }))
    );
  },
} satisfies CodeBehind);

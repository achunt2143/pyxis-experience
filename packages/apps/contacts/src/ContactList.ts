import { view, type Component } from '@duyojs/duyo';
import { onDestroy } from '@pyxis/app-sdk/duyo';
import spec from './ContactList.view.json';
import { CATEGORIES, type Contact } from './model';
import type { CodeBehind } from './ContactList.view.gen';
import type { PillItem } from './ContactPill';
import './ContactPill';
import './Directory';

/**
 * The directory panel: header, search, category pills, the A-Z list. State comes in
 * (`items`, `counts`, `category`, `selectedId`, `loaded`, `total`, `notice`); onAddContact,
 * onExportAll, onImportFile {text}, onSearchChange, onCategoryChange and onSelectContact go out.
 */

const NOTICE_MS = 4000;
export default view(spec, {
  create() {
    this.inherited();
    this._noticeTimer = null as ReturnType<typeof setTimeout> | null;
    onDestroy(this, () => {
      if (this._noticeTimer) clearTimeout(this._noticeTimer);
    });
    this.draw();
  },

  focusSearch() {
    const input = document.querySelector<HTMLInputElement>(
      `input[data-duyo-id="${this.$.search.id}"], [data-duyo-id="${this.$.search.id}"] input`
    );
    input?.focus();
    input?.select();
  },

  add() {
    this.doAddContact();
    return true;
  },
  exportAll() {
    this.doExportAll();
    return true;
  },
  /** A one-off file picker: the file's text goes up as onImportFile. */
  importPick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vcf,text/vcard,text/x-vcard';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void file.text().then(
        (text) => {
          if (!this.destroyed) this.doImportFile({ text });
        },
        () => {
          if (!this.destroyed) this.setNotice('Could not read that file.');
        }
      );
    };
    input.click();
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

  noticeChanged() {
    const text = String(this.notice ?? '');
    this.$.notice.setContent(text);
    this.$.notice.setShowing(text !== '');
    if (this._noticeTimer) clearTimeout(this._noticeTimer);
    this._noticeTimer = null;
    if (text) {
      this._noticeTimer = setTimeout(() => {
        this._noticeTimer = null;
        if (!this.destroyed) this.setNotice('');
      }, NOTICE_MS);
    }
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
    if (this.$.search.getValue() !== this.search) this.$.search.setValue(this.search as string);
    directory.setSelectedId(this.selectedId);
  },
} satisfies CodeBehind);

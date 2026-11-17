import { view, type Component, type ComponentEvent } from '@duyojs/duyo';
import { loadAppData, saveAppData } from '@pyxis/app-sdk';
import { onDestroy, registerIcons } from '@pyxis/app-sdk/duyo';
import {
  AlertCircle,
  Building2,
  Check,
  Copy,
  Download,
  Mail,
  MapPin,
  Phone,
  Plus,
  Share2,
  Star,
  Trash2,
  Upload,
  User,
  Users,
} from 'lucide-react';
import spec from './ContactsApp.view.json';
import {
  AUTOSAVE_MS,
  STORE,
  categoryCounts,
  exportAllVCards,
  filterContacts,
  newContact,
  parseVCards,
  type Contact,
  type ContactsDoc,
} from './model';
import type { CodeBehind } from './ContactsApp.view.gen';
import './ContactList';
import './ContactDetail';
import './contacts.css';

// Every icon the Contacts specs and code name (the directory island imports its own).
registerIcons({
  AlertCircle,
  Building2,
  Check,
  Copy,
  Download,
  Mail,
  MapPin,
  Phone,
  Plus,
  Share2,
  Star,
  Trash2,
  Upload,
  User,
  Users,
});

/** A dialog or open menu has the keyboard: the app's shortcuts stand aside. */
function hasOpenModalOrPopup(): boolean {
  return Boolean(
    document.querySelector(
      '.mochi-dialog-overlay.open, [role="dialog"][aria-modal="true"]:not(.mochi-dialog):not([aria-hidden="true"]), .mochi-dropdown-trigger[aria-expanded="true"]'
    )
  );
}

/**
 * Contacts: an address book (directory panel, card/editor panel). This kind owns the data,
 * the selection, the filters and the persistence; the panels are views of it. A change goes:
 * handler -> `mutate` (new array, autosave scheduled) -> `sync` (push what the panels show).
 */
export default view(spec, {
  create() {
    this.inherited();
    this.setAttributes({ 'data-window-id': this.windowId });
    this._saveTimer = null as ReturnType<typeof setTimeout> | null;
    this._saveSeq = 0;
    this._dirty = false;
    this._countsKey = '';

    // Save what is pending when the page goes (a closing window) or the app is destroyed.
    const flush = () => {
      if (this._saveTimer) {
        clearTimeout(this._saveTimer);
        this._saveTimer = null;
      }
      if (!this._dirty) return;
      this._dirty = false;
      void this.persist(++(this._saveSeq as number));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!this.destroyed) this.handleKeyDown(e);
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('keydown', onKeyDown);
    onDestroy(this, () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('keydown', onKeyDown);
      flush();
    });

    void loadAppData<ContactsDoc>(STORE, { contacts: [] }).then((doc) => {
      if (this.destroyed) return;
      const first = doc.contacts[0];
      this.setContacts(doc.contacts);
      this.setSelectedId(first?.id ?? null);
      this.setLoaded(true);
      this.$.stack.setActiveIndex(first ? 1 : 0);
      this.sync();
    });
    this.sync();
  },

  handleKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (
      this.$.deleteDialog.getOpen() ||
      hasOpenModalOrPopup() ||
      target?.closest?.('.mochi-dialog-overlay, .mochi-contextual-popup')
    ) {
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && !e.altKey && key === 'n') {
      e.preventDefault();
      this.addContact();
    } else if (mod && !e.altKey && key === 'f') {
      e.preventDefault();
      if (this.$.stack.getActiveIndex() !== 0 && this.isNarrow()) this.$.stack.setActiveIndex(0);
      this.$.list.focusSearch();
    } else if (!mod && !e.altKey && e.key === 'Escape' && this.search !== '') {
      e.preventDefault();
      this.setSearch('');
      this.sync();
    }
  },

  /** One panel at a time (the stack's narrow layout): the list is behind the card. */
  isNarrow() {
    const host = document.querySelector(`[data-duyo-id="${this.$.stack.id}"]`);
    return Boolean(host?.querySelector('.repanel[data-narrow="true"]')) || window.innerWidth <= 768;
  },

  addContact() {
    const c = newContact(this.category as string);
    // A search the new card doesn't match would hide it the moment it is made.
    if ((this.search as string).trim() !== '' && filterContacts([c], this.search, 'All').length === 0) {
      this.setSearch('');
    }
    this.mutate((prev: Contact[]) => [...prev, c]);
    this.select(c.id);
    return true;
  },
  selectContact(_sender, event) {
    this.select(event['id']);
    return true;
  },
  backToList() {
    this.$.stack.setActiveIndex(0);
    return true;
  },
  editContact(_sender: Component, event: ComponentEvent) {
    const id = this.selectedId as string | null;
    if (id === null) return true;
    const patch = event['patch'] as Partial<Contact>;
    this.mutate((prev: Contact[]) => prev.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: Date.now() } : c)));
    this.sync();
    return true;
  },
  importFile(_sender, event) {
    const imported = parseVCards(String(event['text'] ?? ''));
    if (imported.length === 0) {
      this.$.list.setNotice('No contacts found in that file.');
      return true;
    }
    this.mutate((prev: Contact[]) => [...prev, ...imported]);
    this.$.list.setNotice(`Imported ${imported.length} contact${imported.length === 1 ? '' : 's'}.`);
    this.select(imported[0]!.id);
    return true;
  },
  exportAll() {
    exportAllVCards(this.contacts);
    return true;
  },
  searchEdited(_sender, event) {
    this.setSearch(String(event['value'] ?? ''));
    this.sync();
    return true;
  },
  categoryPicked(_sender, event) {
    this.setCategory(event['category']);
    this.sync();
    return true;
  },
  askDelete() {
    const c = this.selected() as Contact | null;
    this.$.deleteName.setContent(c?.name || 'this contact');
    this.$.deleteDialog.setOpen(true);
    return true;
  },
  deleteConfirmed() {
    const c = this.selected() as Contact | null;
    if (!c) return true;
    // The card moves to the contact that was next in the list (else the one before), as a
    // list does; with nothing left to show, the narrow layout goes back to the list.
    const shown = filterContacts(this.contacts, this.search, this.category);
    const at = shown.findIndex((x) => x.id === c.id);
    const next = shown[at + 1] ?? shown[at - 1] ?? null;
    this.mutate((prev: Contact[]) => prev.filter((x) => x.id !== c.id));
    this.setSelectedId(next?.id ?? null);
    if (!next) this.$.stack.setActiveIndex(0);
    this.sync();
    return true;
  },
  retrySave() {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    this._dirty = true;
    this.setSaveStatus('saving');
    void this.persist(++(this._saveSeq as number));
    return true;
  },

  select(id: string) {
    this.setSelectedId(id);
    this.$.stack.setActiveIndex(1);
    this.sync();
  },
  selected() {
    return (this.contacts as Contact[]).find((c) => c.id === this.selectedId) ?? null;
  },

  /** Writes the address book; only the newest save says how it went. */
  async persist(seq: number) {
    let ok = false;
    try {
      ok = await saveAppData(STORE, { contacts: this.contacts } satisfies ContactsDoc);
    } catch {
      ok = false;
    }
    if (this.destroyed || seq !== this._saveSeq) return;
    this._dirty = !ok;
    this.setSaveStatus(ok ? 'saved' : 'error');
  },

  mutate(change: (prev: Contact[]) => Contact[]) {
    const next = change(this.contacts as Contact[]);
    this.setContacts(next);
    const seq = ++(this._saveSeq as number);
    this._dirty = true;
    this.setSaveStatus('saving');
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      void this.persist(seq);
    }, AUTOSAVE_MS);
  },

  sync() {
    const { list, detail } = this.$;
    const contacts = this.contacts as Contact[];
    const counts = categoryCounts(contacts);
    const countsKey = JSON.stringify(counts);
    list.update({
      ...(countsKey !== this._countsKey ? { counts } : {}),
      items: filterContacts(contacts, this.search, this.category),
      category: this.category,
      search: this.search,
      selectedId: this.selectedId,
      loaded: this.loaded,
      total: contacts.length,
    });
    this._countsKey = countsKey;
    detail.set('loaded', this.loaded);
    detail.set('contact', this.selected());
  },

  saveStatusChanged() {
    const isError = this.saveStatus === 'error';
    this.$.saveErrorBanner.setAttributes(isError ? { role: 'alert' } : {});
    this.$.saveErrorBanner.setShowing(isError);
    this.$.detail.setSaveStatus(this.saveStatus);
  },
} satisfies CodeBehind);

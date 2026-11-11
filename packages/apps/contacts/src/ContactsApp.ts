import { view, type Component, type ComponentEvent } from '@duyojs/duyo';
import { loadAppData, saveAppData } from '@pyxis/app-sdk';
import { onDestroy, registerIcons } from '@pyxis/app-sdk/duyo';
import { Building2, Check, Copy, Download, Mail, MapPin, Phone, Plus, Share2, Star, Trash2, User, Users } from 'lucide-react';
import spec from './ContactsApp.view.json';
import {
  AUTOSAVE_MS,
  STORE,
  categoryCounts,
  exportAllVCards,
  filterContacts,
  newContact,
  type Contact,
  type ContactsDoc,
} from './model';
import type { CodeBehind } from './ContactsApp.view.gen';
import './ContactList';
import './ContactDetail';
import './contacts.css';

// Every icon the Contacts specs and code name (the directory island imports its own).
registerIcons({ Building2, Check, Copy, Download, Mail, MapPin, Phone, Plus, Share2, Star, Trash2, User, Users });

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
    this._countsKey = '';

    const flush = () => {
      if (this._saveTimer) {
        clearTimeout(this._saveTimer);
        this._saveTimer = null;
        void saveAppData(STORE, { contacts: this.contacts } satisfies ContactsDoc);
      }
    };
    window.addEventListener('beforeunload', flush);
    onDestroy(this, () => {
      window.removeEventListener('beforeunload', flush);
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

  addContact() {
    const c = newContact();
    this.mutate((prev: Contact[]) => [...prev, c]);
    this.select(c.id);
    return true;
  },
  selectContact(_sender, event) {
    this.select(event['id']);
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
    this.mutate((prev: Contact[]) => prev.filter((x) => x.id !== c.id));
    this.setSelectedId(null);
    this.sync();
    return true;
  },
  /** A dialog's close would bubble to the root's onClose and close the whole app: stop it here. */
  dialogDismissed() {
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

  mutate(change: (prev: Contact[]) => Contact[]) {
    const next = change(this.contacts as Contact[]);
    this.setContacts(next);
    this.setSaveStatus('saving');
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(async () => {
      this._saveTimer = null;
      await saveAppData(STORE, { contacts: next } satisfies ContactsDoc);
      if (!this.destroyed && this._saveTimer === null) this.setSaveStatus('saved');
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
    this.$.detail.setSaveStatus(this.saveStatus);
  },
} satisfies CodeBehind);

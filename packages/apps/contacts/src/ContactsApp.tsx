import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  Divider,
  Header,
  Input,
  Item,
  List,
  ListHeader,
  Repanel,
  RepanelStack,
  Spinner,
  TextArea,
} from 'remochi';
import { Plus, Trash2, Mail, Phone } from 'lucide-react';
import { loadAppData, saveAppData } from '@pyxis/app-sdk';

export interface ContactsAppProps {
  windowId: string;
  onClose?: () => void;
}

interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  updatedAt: number;
}

interface ContactsDoc {
  contacts: Contact[];
}

const STORE = 'contacts';
const AUTOSAVE_MS = 800;

function newContact(): Contact {
  return {
    id: Math.random().toString(36).slice(2, 11),
    name: 'New contact',
    email: '',
    phone: '',
    notes: '',
    updatedAt: Date.now(),
  };
}

/**
 * ContactsApp — Mochi-styled address book, persisted through the
 * `org.geckoOS.filesystem` Echo service (see @pyxis/app-sdk's appStorage.ts).
 */
export const ContactsApp: React.FC<ContactsAppProps> = ({ windowId }) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Which Repanel is in front: 0 = contact list alone (detail swiped away),
  // 1 = detail panel (list stays revealed behind it as its own column).
  const [activeIndex, setActiveIndex] = useState(0);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    loadAppData<ContactsDoc>(STORE, { contacts: [] }).then((doc) => {
      if (!mounted) return;
      setContacts(doc.contacts);
      setSelectedId(doc.contacts[0]?.id ?? null);
      setActiveIndex(doc.contacts[0] ? 1 : 0);
      setLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const scheduleSave = useCallback((next: Contact[]) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveAppData(STORE, { contacts: next } satisfies ContactsDoc);
    }, AUTOSAVE_MS);
  }, []);

  const mutate = useCallback(
    (fn: (prev: Contact[]) => Contact[]) => {
      setContacts((prev) => {
        const next = fn(prev);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const selected = contacts.find((c) => c.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? contacts.filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.email.toLowerCase().includes(q) ||
            c.phone.includes(q)
        )
      : contacts;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts, search]);

  const addContact = () => {
    const c = newContact();
    mutate((prev) => [...prev, c]);
    setSelectedId(c.id);
    setActiveIndex(1);
  };

  const selectContact = (id: string) => {
    setSelectedId(id);
    setActiveIndex(1);
  };

  const deleteSelected = () => {
    if (!selected) return;
    mutate((prev) => prev.filter((c) => c.id !== selected.id));
    setSelectedId(null);
    setConfirmDelete(false);
  };

  const updateSelected = (patch: Partial<Contact>) => {
    if (!selected) return;
    mutate((prev) =>
      prev.map((c) =>
        c.id === selected.id ? { ...c, ...patch, updatedAt: Date.now() } : c
      )
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
        background: 'var(--color-background)',
        minHeight: 0,
      }}
    >
      <div style={{ flex: 1, minHeight: 0 }}>
        <RepanelStack
          activeIndex={activeIndex}
          onActiveIndexChange={(index) => setActiveIndex(index)}
        >
          {/* Contact list */}
          <Repanel>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
              <div style={{ display: 'flex', gap: 6, padding: 10, alignItems: 'center' }}>
                <Input
                  placeholder="Search contacts…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ width: '100%' }}
                />
                <Button variant="blue" onClick={addContact}>
                  <Plus size={15} style={{ verticalAlign: 'middle' }} />
                </Button>
              </div>
              <Divider />
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {!loaded ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                    <Spinner active size="normal" styleType="light" alt="Loading contacts" />
                  </div>
                ) : (
                  <List>
                    <ListHeader>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        Contacts <Badge content={filtered.length} />
                      </span>
                    </ListHeader>
                    {filtered.length === 0 ? (
                      <div style={{ padding: 16, color: 'var(--color-text-muted)', fontSize: 13 }}>
                        {search ? 'No contacts match your search.' : 'No contacts yet.'}
                      </div>
                    ) : (
                      filtered.map((c) => (
                        <Item
                          key={c.id}
                          title={c.name || 'Unnamed'}
                          subtitle={c.email || c.phone || '—'}
                          selected={c.id === selectedId}
                          hoverable
                          variant="compact"
                          onClick={() => selectContact(c.id)}
                        />
                      ))
                    )}
                  </List>
                )}
              </div>
            </div>
          </Repanel>

          {/* Detail form */}
          <Repanel>
            <div style={{ height: '100%', overflowY: 'auto', padding: 20, minWidth: 0 }}>
              {selected ? (
                <>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Header content={selected.name || 'Unnamed'} />
                    <Button variant="warning" onClick={() => setConfirmDelete(true)}>
                      <Trash2 size={15} style={{ verticalAlign: 'middle' }} />
                    </Button>
                  </div>
                  <Divider />
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                      maxWidth: 460,
                      marginTop: 12,
                    }}
                  >
                    <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      Name
                      <Input
                        value={selected.name}
                        onChange={(e) => updateSelected({ name: e.target.value })}
                        placeholder="Full name"
                        style={{ width: '100%', marginTop: 4 }}
                      />
                    </label>
                    <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Mail size={12} /> Email
                      </span>
                      <Input
                        type="email"
                        value={selected.email}
                        onChange={(e) => updateSelected({ email: e.target.value })}
                        placeholder="name@example.com"
                        style={{ width: '100%', marginTop: 4 }}
                      />
                    </label>
                    <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Phone size={12} /> Phone
                      </span>
                      <Input
                        type="tel"
                        value={selected.phone}
                        onChange={(e) => updateSelected({ phone: e.target.value })}
                        placeholder="+1 555 000 0000"
                        style={{ width: '100%', marginTop: 4 }}
                      />
                    </label>
                    <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      Notes
                      <div style={{ marginTop: 4 }}>
                        <TextArea
                          value={selected.notes}
                          onChange={(e) => updateSelected({ notes: e.target.value })}
                          placeholder="Anything worth remembering…"
                          rows={4}
                        />
                      </div>
                    </label>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      Saved automatically
                    </span>
                  </div>
                </>
              ) : (
                <div
                  style={{
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  {loaded ? 'Select a contact, or add a new one.' : ''}
                </div>
              )}
            </div>
          </Repanel>
        </RepanelStack>
      </div>

      <Dialog
        isOpen={confirmDelete}
        title="Delete contact"
        type="confirm"
        confirmText="Delete"
        cancelText="Keep"
        onConfirm={deleteSelected}
        onCancel={() => setConfirmDelete(false)}
        onClose={() => setConfirmDelete(false)}
      >
        <p>Delete “{selected?.name || 'Unnamed'}” from your contacts?</p>
      </Dialog>
    </div>
  );
};

export default ContactsApp;

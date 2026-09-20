import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  DateInput,
  Dialog,
  Divider,
  Dropdown,
  Header,
  Input,
  Item,
  List,
  ListHeader,
  Repanel,
  RepanelStack,
  Spinner,
  TextArea,
  ViewSelectButton,
} from 'remochi';
import {
  Plus,
  Trash2,
  Mail,
  Phone,
  Star,
  Building2,
  MapPin,
  Download,
  Copy,
  Check,
  Share2,
} from 'lucide-react';
import { loadAppData, saveAppData } from '@pyxis/app-sdk';

export interface ContactsAppProps {
  windowId: string;
  onClose?: () => void;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  phone: string;
  starred?: boolean;
  category?: 'Personal' | 'Work' | 'Family' | 'Other' | string;
  company?: string;
  jobTitle?: string;
  address?: string;
  birthday?: string;
  notes: string;
  updatedAt: number;
}

interface ContactsDoc {
  contacts: Contact[];
}

const STORE = 'contacts';
const AUTOSAVE_MS = 600;

const CATEGORIES = ['All', 'Starred', 'Personal', 'Work', 'Family', 'Other'] as const;
type CategoryFilter = (typeof CATEGORIES)[number];

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #6aaedb 0%, #4a8bc2 100%)',
  'linear-gradient(135deg, #81c784 0%, #43a047 100%)',
  'linear-gradient(135deg, #ba68c8 0%, #8e24aa 100%)',
  'linear-gradient(135deg, #ffb74d 0%, #f57c00 100%)',
  'linear-gradient(135deg, #4dd0e1 0%, #0097a7 100%)',
  'linear-gradient(135deg, #e57373 0%, #d32f2f 100%)',
  'linear-gradient(135deg, #aed581 0%, #689f38 100%)',
  'linear-gradient(135deg, #ffd54f 0%, #ffa000 100%)',
];

function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
}

function getInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function newContact(): Contact {
  return {
    id: Math.random().toString(36).slice(2, 11),
    name: 'New contact',
    email: '',
    phone: '',
    starred: false,
    category: 'Personal',
    company: '',
    jobTitle: '',
    address: '',
    birthday: '',
    notes: '',
    updatedAt: Date.now(),
  };
}

function exportVCard(contact: Contact) {
  const vcf = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${contact.name}`,
    contact.email ? `EMAIL:${contact.email}` : '',
    contact.phone ? `TEL:${contact.phone}` : '',
    contact.company ? `ORG:${contact.company}` : '',
    contact.jobTitle ? `TITLE:${contact.jobTitle}` : '',
    contact.address ? `ADR:;;${contact.address};;;;` : '',
    contact.birthday ? `BDAY:${contact.birthday}` : '',
    contact.notes ? `NOTE:${contact.notes.replace(/\n/g, '\\n')}` : '',
    'END:VCARD',
  ]
    .filter(Boolean)
    .join('\r\n');

  const blob = new Blob([vcf], { type: 'text/vcard' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${contact.name || 'contact'}.vcf`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportAllVCards(contacts: Contact[]) {
  const allVcf = contacts
    .map((c) =>
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `FN:${c.name}`,
        c.email ? `EMAIL:${c.email}` : '',
        c.phone ? `TEL:${c.phone}` : '',
        c.company ? `ORG:${c.company}` : '',
        c.jobTitle ? `TITLE:${c.jobTitle}` : '',
        c.address ? `ADR:;;${c.address};;;;` : '',
        c.birthday ? `BDAY:${c.birthday}` : '',
        c.notes ? `NOTE:${c.notes.replace(/\n/g, '\\n')}` : '',
        'END:VCARD',
      ]
        .filter(Boolean)
        .join('\r\n')
    )
    .join('\r\n\r\n');

  const blob = new Blob([allVcf], { type: 'text/vcard' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pyxis_contacts_all.vcf`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * ContactsApp — Full Palm webOS Mochi-styled address book with waterdrop avatar,
 * favorites, categories, detailed fields, and vCard export.
 */
export const ContactsApp: React.FC<ContactsAppProps> = ({ windowId }) => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('All');
  const [loaded, setLoaded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
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
    let list = contacts;

    // Filter by Category or Starred
    if (activeCategory === 'Starred') {
      list = list.filter((c) => c.starred);
    } else if (activeCategory !== 'All') {
      list = list.filter((c) => (c.category || 'Personal') === activeCategory);
    }

    // Filter by Search Query
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          (c.company && c.company.toLowerCase().includes(q)) ||
          (c.address && c.address.toLowerCase().includes(q))
      );
    }

    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [contacts, search, activeCategory]);

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

  const toggleStarred = (c: Contact) => {
    updateSelected({ starred: !c.starred });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
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
          {/* Contact list panel */}
          <Repanel>
            <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', inset: 0, minHeight: 0 }}>
              {/* Search and Add Header */}
              <div style={{ display: 'flex', gap: 6, padding: 10, alignItems: 'center' }}>
                <Input
                  placeholder="Search contacts…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ width: '100%' }}
                />
                <span title="Add Contact">
                  <Button variant="blue" onClick={addContact}>
                    <Plus size={15} style={{ verticalAlign: 'middle' }} />
                  </Button>
                </span>
                {contacts.length > 0 && (
                  <span title="Export all to vCard (.vcf)">
                    <Button variant="normal" onClick={() => exportAllVCards(contacts)}>
                      <Download size={14} style={{ verticalAlign: 'middle' }} />
                    </Button>
                  </span>
                )}
              </div>

              {/* Category Switcher (Remochi ViewSelectButton) */}
              <div
                style={{
                  padding: '6px 10px',
                  borderBottom: '1px solid var(--color-border-light)',
                  overflowX: 'auto',
                }}
              >
                <ViewSelectButton
                  items={CATEGORIES.map((cat) => ({
                    content: cat === 'Starred' ? '★ Starred' : cat,
                    active: activeCategory === cat,
                  }))}
                  onSelect={(_item, index) => setActiveCategory(CATEGORIES[index])}
                  variant="normal"
                />
              </div>

              {/* Contact List */}
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                {!loaded ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                    <Spinner active size="normal" styleType="light" alt="Loading contacts" />
                  </div>
                ) : (
                  <List>
                    <ListHeader>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        {activeCategory} <Badge content={filtered.length} />
                      </span>
                    </ListHeader>
                    {filtered.length === 0 ? (
                      <div style={{ padding: 16, color: 'var(--color-text-muted)', fontSize: 13 }}>
                        {search ? 'No contacts match your search.' : 'No contacts in this list.'}
                      </div>
                    ) : (
                      filtered.map((c) => {
                        const isSelected = c.id === selectedId;
                        return (
                          <Item
                            key={c.id}
                            title={c.name || 'Unnamed'}
                            subtitle={c.company || c.email || c.phone || 'No details'}
                            selected={isSelected}
                            hoverable
                            variant="compact"
                            onClick={() => selectContact(c.id)}
                            icon={
                              <div
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: '14px 2px 14px 14px',
                                  marginRight: 6,
                                  background: getAvatarGradient(c.name),
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#fff',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  flexShrink: 0,
                                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                                }}
                              >
                                {getInitials(c.name)}
                              </div>
                            }
                            rightContent={
                              c.starred ? (
                                <Star size={14} fill="#ffb300" color="#ffb300" style={{ flexShrink: 0 }} />
                              ) : null
                            }
                          />
                        );
                      })
                    )}
                  </List>
                )}
              </div>
            </div>
          </Repanel>

          {/* Detail View & Form Panel */}
          <Repanel>
            <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', padding: 20, minWidth: 0 }}>
              {selected ? (
                <>
                  {/* Top Header with Distinctive Mochi Waterdrop Avatar */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {/* Waterdrop Avatar as defined by user design:
                          .wumblr-account-avatar { width: 72px; height: 72px; border-radius: 32px 4px 32px 32px; margin-right: 14px; } */}
                      <div
                        className="wumblr-account-avatar"
                        style={{
                          width: 72,
                          height: 72,
                          borderRadius: '32px 4px 32px 32px',
                          marginRight: 14,
                          background: getAvatarGradient(selected.name),
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontSize: 26,
                          fontWeight: 700,
                          boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
                          flexShrink: 0,
                        }}
                      >
                        {getInitials(selected.name)}
                      </div>

                      <div>
                        <Header content={selected.name || 'Unnamed'} />
                        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                          {selected.jobTitle ? `${selected.jobTitle} ` : ''}
                          {selected.company ? `at ${selected.company}` : ''}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span title={selected.starred ? 'Unstar Contact' : 'Star Contact'}>
                        <Button
                          variant={selected.starred ? 'warning' : 'normal'}
                          onClick={() => toggleStarred(selected)}
                        >
                          <Star
                            size={15}
                            fill={selected.starred ? 'currentColor' : 'none'}
                            style={{ verticalAlign: 'middle' }}
                          />
                        </Button>
                      </span>
                      <span title="Export Contact vCard (.vcf)">
                        <Button
                          variant="normal"
                          onClick={() => exportVCard(selected)}
                        >
                          <Share2 size={15} style={{ verticalAlign: 'middle' }} />
                        </Button>
                      </span>
                      <span title="Delete Contact">
                        <Button
                          variant="warning"
                          onClick={() => setConfirmDelete(true)}
                        >
                          <Trash2 size={15} style={{ verticalAlign: 'middle' }} />
                        </Button>
                      </span>
                    </div>
                  </div>

                  {/* Quick Contact Action Bar */}
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      marginBottom: 16,
                      background: 'var(--mochi-hover, rgba(0,0,0,0.03))',
                      padding: '8px 12px',
                      borderRadius: '10px',
                      flexWrap: 'wrap',
                    }}
                  >
                    {selected.email && (
                      <a
                        href={`mailto:${selected.email}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: '0.8rem',
                          color: 'var(--color-primary, #4a8bc2)',
                          textDecoration: 'none',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border-light)',
                        }}
                      >
                        <Mail size={13} /> Email
                      </a>
                    )}
                    {selected.phone && (
                      <a
                        href={`tel:${selected.phone}`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: '0.8rem',
                          color: 'var(--color-primary, #4a8bc2)',
                          textDecoration: 'none',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border-light)',
                        }}
                      >
                        <Phone size={13} /> Call
                      </a>
                    )}
                    {selected.email && (
                      <button
                        onClick={() => copyToClipboard(selected.email, 'email')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: '0.8rem',
                          color: 'var(--color-text)',
                          border: '1px solid var(--color-border-light)',
                          background: 'var(--color-surface)',
                          borderRadius: '6px',
                          padding: '4px 8px',
                          cursor: 'pointer',
                        }}
                      >
                        {copiedField === 'email' ? <Check size={13} color="#4caf50" /> : <Copy size={13} />}
                        {copiedField === 'email' ? 'Copied' : 'Copy Email'}
                      </button>
                    )}
                    {selected.phone && (
                      <button
                        onClick={() => copyToClipboard(selected.phone, 'phone')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: '0.8rem',
                          color: 'var(--color-text)',
                          border: '1px solid var(--color-border-light)',
                          background: 'var(--color-surface)',
                          borderRadius: '6px',
                          padding: '4px 8px',
                          cursor: 'pointer',
                        }}
                      >
                        {copiedField === 'phone' ? <Check size={13} color="#4caf50" /> : <Copy size={13} />}
                        {copiedField === 'phone' ? 'Copied' : 'Copy Phone'}
                      </button>
                    )}
                  </div>

                  <Divider />

                  {/* Editable Fields Form */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                      maxWidth: 480,
                      marginTop: 14,
                    }}
                  >
                    <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      Full Name
                      <Input
                        value={selected.name}
                        onChange={(e) => updateSelected({ name: e.target.value })}
                        placeholder="Full name"
                        style={{ width: '100%', marginTop: 4 }}
                      />
                    </label>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Building2 size={12} /> Company
                        </span>
                        <Input
                          value={selected.company || ''}
                          onChange={(e) => updateSelected({ company: e.target.value })}
                          placeholder="Company name"
                          style={{ width: '100%', marginTop: 4 }}
                        />
                      </label>

                      <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        Job Title
                        <Input
                          value={selected.jobTitle || ''}
                          onChange={(e) => updateSelected({ jobTitle: e.target.value })}
                          placeholder="Software Engineer"
                          style={{ width: '100%', marginTop: 4 }}
                        />
                      </label>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
                      <div>
                        <Dropdown
                          label="Category"
                          value={selected.category || 'Personal'}
                          options={[
                            { value: 'Personal', label: 'Personal' },
                            { value: 'Work', label: 'Work' },
                            { value: 'Family', label: 'Family' },
                            { value: 'Other', label: 'Other' },
                          ]}
                          onChange={(val) => updateSelected({ category: String(val) })}
                        />
                      </div>

                      <div>
                        <DateInput
                          label="Birthday"
                          value={selected.birthday || ''}
                          placeholder="Select birthday…"
                          onChange={(d: Date) => {
                            const iso = d.toISOString().split('T')[0];
                            updateSelected({ birthday: iso });
                          }}
                        />
                      </div>
                    </div>

                    <label style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <MapPin size={12} /> Address / Location
                      </span>
                      <Input
                        value={selected.address || ''}
                        onChange={(e) => updateSelected({ address: e.target.value })}
                        placeholder="Street, City, Country"
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
                      Saved automatically to Pyxis PIM storage
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
        <p>Delete “{selected?.name || 'Unnamed'}” from your contacts? This cannot be undone.</p>
      </Dialog>
    </div>
  );
};

export default ContactsApp;

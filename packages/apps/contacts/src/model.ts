// The Contacts data model and the pure functions over it: no Duyo, DOM only in the vCard downloads.
// The document shape and STORE name are what users already have on disk (and what Bloom's
// desktop search reads through `filesystem:apps`): do not change them.

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

export interface ContactsDoc {
  contacts: Contact[];
}

export const STORE = 'contacts';
export const AUTOSAVE_MS = 600;

export const CATEGORIES = ['All', 'Starred', 'Personal', 'Work', 'Family', 'Other'] as const;
export type CategoryFilter = (typeof CATEGORIES)[number];

export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');

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

export function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
}

export function getInitials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function newContact(): Contact {
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

/** The contacts a category and a search show, sorted by name. */
export function filterContacts(contacts: Contact[], search: string, category: CategoryFilter): Contact[] {
  const q = search.trim().toLowerCase();
  let list = contacts;
  if (category === 'Starred') {
    list = list.filter((c) => c.starred);
  } else if (category !== 'All') {
    list = list.filter((c) => (c.category || 'Personal') === category);
  }
  if (q) {
    list = list.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.company && c.company.toLowerCase().includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q))
    );
  }
  return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export function categoryCounts(contacts: Contact[]): Record<string, number> {
  const counts: Record<string, number> = { All: contacts.length, Starred: contacts.filter((c) => c.starred).length };
  for (const cat of CATEGORIES.slice(2)) {
    counts[cat] = contacts.filter((c) => (c.category || 'Personal') === cat).length;
  }
  return counts;
}

/** Contacts grouped under their initial for the A-Z sections; anything else under '#', which sorts last. */
export function groupByLetter(contacts: Contact[]): Array<{ letter: string; contacts: Contact[] }> {
  const groups: Record<string, Contact[]> = {};
  for (const c of contacts) {
    const firstChar = (c.name || '').trim().charAt(0).toUpperCase();
    const letter = /[A-Z]/.test(firstChar) ? firstChar : '#';
    (groups[letter] ??= []).push(c);
  }
  return Object.keys(groups)
    .sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
    .map((letter) => ({ letter, contacts: groups[letter] }));
}

/** A category pill's colours (active: filled primary). */
export function pillStyle(active: boolean): string {
  return (
    `background:${active ? 'var(--mochi-primary, #2f6fed)' : 'var(--color-surface, var(--mochi-surface, #ffffff))'};` +
    `color:${active ? '#ffffff' : 'var(--color-text, #334155)'};` +
    `border-color:${active ? 'var(--mochi-primary, #2f6fed)' : 'var(--color-border, var(--mochi-border, #e5e7eb))'};` +
    `font-weight:${active ? 600 : 500}`
  );
}

export function vcardOf(c: Contact): string {
  return [
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
    .join('\r\n');
}

function download(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/vcard' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportVCard(contact: Contact) {
  download(vcardOf(contact), `${(contact.name || 'contact').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.vcf`);
}

export function exportAllVCards(contacts: Contact[]) {
  download(contacts.map(vcardOf).join('\r\n\r\n'), 'pyxis_contacts_all.vcf');
}

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

/** A new contact belongs where the user is looking: the picked category, starred under Starred. */
export function newContact(filter: string = 'All'): Contact {
  const real = filter !== 'All' && filter !== 'Starred';
  return {
    id: Math.random().toString(36).slice(2, 11),
    name: 'New contact',
    email: '',
    phone: '',
    starred: filter === 'Starred',
    category: real ? filter : 'Personal',
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
    `background:${active ? 'var(--mochi-primary)' : 'var(--mochi-surface)'};` +
    `color:${active ? 'var(--mochi-primary-text)' : 'var(--mochi-text)'};` +
    `border-color:${active ? 'var(--mochi-primary)' : 'var(--mochi-border)'};` +
    `font-weight:${active ? 600 : 500}`
  );
}

/** A vCard text value, escaped as RFC 6350 §3.4 asks (backslash, comma, semicolon, newline). */
function vcardText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

export function vcardOf(c: Contact): string {
  return [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${vcardText(c.name)}`,
    c.email ? `EMAIL:${vcardText(c.email)}` : '',
    c.phone ? `TEL:${vcardText(c.phone)}` : '',
    c.company ? `ORG:${vcardText(c.company)}` : '',
    c.jobTitle ? `TITLE:${vcardText(c.jobTitle)}` : '',
    c.address ? `ADR:;;${vcardText(c.address)};;;;` : '',
    c.birthday ? `BDAY:${c.birthday}` : '',
    c.category ? `CATEGORIES:${vcardText(c.category)}` : '',
    c.notes ? `NOTE:${vcardText(c.notes)}` : '',
    'END:VCARD',
  ]
    .filter(Boolean)
    .join('\r\n');
}

function unescapeVcard(value: string): string {
  return value.replace(/\\([\\,;nN])/g, (_m, ch: string) => (ch === 'n' || ch === 'N' ? '\n' : ch));
}

/** Splits on separators not escaped with a backslash. */
function splitUnescaped(value: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    if (ch === '\\' && i + 1 < value.length) {
      cur += ch + value[i + 1];
      i++;
    } else if (ch === sep) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** `YYYYMMDD` or `YYYY-MM-DD` (time and zone dropped); anything else is not a birthday. */
function vcardDate(value: string): string {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(value.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/**
 * The contacts in a .vcf file (vCard 2.1, 3.0 and 4.0, as phones and other address books
 * write them): folded lines unfolded, parameters and groups ignored, the first of each
 * field kept. A card with no name and no way to reach them is skipped.
 */
export function parseVCards(text: string): Contact[] {
  const lines = text.replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const out: Contact[] = [];
  let card: Contact | null = null;
  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const prop = head.split(';')[0]!.split('.').pop()!.toUpperCase();
    if (prop === 'BEGIN' && value.trim().toUpperCase() === 'VCARD') {
      card = { ...newContact(), name: '', category: 'Personal' };
      continue;
    }
    if (!card) continue;
    if (prop === 'END') {
      if (card.name || card.email || card.phone) {
        if (!card.name) card.name = card.email || card.phone;
        out.push(card);
      }
      card = null;
      continue;
    }
    const text = unescapeVcard(value).trim();
    switch (prop) {
      case 'FN':
        // The formatted name wins over one assembled from N, whichever comes first.
        if (text) card.name = text;
        break;
      case 'N':
        if (!card.name) {
          const [family = '', given = ''] = splitUnescaped(value, ';').map((p) => unescapeVcard(p).trim());
          card.name = [given, family].filter(Boolean).join(' ');
        }
        break;
      case 'EMAIL':
        card.email ||= text;
        break;
      case 'TEL':
        card.phone ||= text.replace(/^tel:/i, '');
        break;
      case 'ORG':
        card.company ||= unescapeVcard(splitUnescaped(value, ';')[0] ?? '').trim();
        break;
      case 'TITLE':
        card.jobTitle ||= text;
        break;
      case 'ADR':
        card.address ||= splitUnescaped(value, ';')
          .map((p) => unescapeVcard(p).trim())
          .filter(Boolean)
          .join(', ');
        break;
      case 'BDAY':
        card.birthday ||= vcardDate(value);
        break;
      case 'CATEGORIES': {
        const first = unescapeVcard(splitUnescaped(value, ',')[0] ?? '').trim();
        const known = CATEGORIES.slice(2).find((c) => c.toLowerCase() === first.toLowerCase());
        if (known) card.category = known;
        break;
      }
      case 'NOTE':
        card.notes ||= unescapeVcard(value);
        break;
    }
  }
  return out;
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

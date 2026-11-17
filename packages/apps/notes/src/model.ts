// The Notes data model and the pure functions over it: no Duyo, no DOM except exportNote.
// The document shape and STORE name are what users already have on disk: do not change them.

export interface Note {
  id: string;
  title: string;
  body: string;
  pinned?: boolean;
  category?: 'Personal' | 'Work' | 'Ideas' | 'General' | string;
  updatedAt: number;
}

export interface NotesDoc {
  notes: Note[];
}

export const STORE = 'notes';
export const AUTOSAVE_MS = 500;

export const CATEGORIES = ['All', 'Pinned', 'Personal', 'Work', 'Ideas', 'General'] as const;
export type CategoryFilter = (typeof CATEGORIES)[number];

/** What a note can be filed under (the editor's dropdown). */
export const NOTE_CATEGORIES = ['General', 'Personal', 'Work', 'Ideas'] as const;

export const CATEGORY_COLORS: Record<string, string> = {
  Personal: '#4a8bc2',
  Work: '#e57373',
  Ideas: '#ffb74d',
  General: '#81c784',
};

export function newNote(category: string = 'General'): Note {
  return {
    id: Math.random().toString(36).slice(2, 11),
    title: 'Untitled note',
    body: '',
    pinned: category === 'Pinned',
    category: category === 'All' || category === 'Pinned' ? 'General' : category,
    updatedAt: Date.now(),
  };
}

export function formatRelativeDate(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function exportNote(note: Note) {
  const content = `# ${note.title || 'Untitled note'}\n\n${note.body}`;
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(note.title || 'note').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Note counts per filter pill. */
export function categoryCounts(notes: readonly Note[]): Record<string, number> {
  const counts: Record<string, number> = {
    All: notes.length,
    Pinned: notes.filter((n) => n.pinned).length,
  };
  for (const cat of CATEGORIES) {
    if (cat !== 'All' && cat !== 'Pinned') {
      counts[cat] = notes.filter((n) => (n.category || 'General') === cat).length;
    }
  }
  return counts;
}

/** The notes the list shows: category, then search, then pinned first and newest first. */
export function filterNotes(notes: readonly Note[], search: string, category: CategoryFilter | string): Note[] {
  const q = search.trim().toLowerCase();
  let list = notes;

  if (category === 'Pinned') {
    list = list.filter((n) => n.pinned);
  } else if (category !== 'All') {
    list = list.filter((n) => (n.category || 'General') === category);
  }

  if (q) {
    list = list.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q));
  }

  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

/** A row's one-line preview of the body. */
export function snippetOf(body: string): string {
  return body.replace(/^[#\s*_-]+/gm, '').trim().slice(0, 90);
}

export function bodyStats(body: string): string {
  const words = body ? body.trim().split(/\s+/).filter(Boolean).length : 0;
  return `${words} ${words === 1 ? 'word' : 'words'} · ${body ? body.length : 0} chars`;
}

export function categoryColor(cat: string): string {
  return CATEGORY_COLORS[cat] || '#81c784';
}

/** The filter pill's dynamic look. Its fixed look is `.notes-pill` in notes.css. */
export function pillStyle(cat: string, active: boolean): string {
  const pinned = cat === 'Pinned';
  const color = pinned ? '#f59e0b' : CATEGORY_COLORS[cat] || 'var(--mochi-primary)';
  const background = active
    ? pinned
      ? 'rgba(245, 158, 11, 0.16)'
      : 'var(--mochi-primary-soft)'
    : 'var(--mochi-surface)';
  const text = active ? (pinned ? '#f59e0b' : 'var(--mochi-primary)') : 'var(--mochi-text)';
  return [
    `border-color:${active ? color : 'var(--mochi-border)'}`,
    `background:${background}`,
    `color:${text}`,
    `font-weight:${active ? 600 : 500}`,
  ].join(';');
}

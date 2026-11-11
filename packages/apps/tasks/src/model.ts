// The Tasks data model and the pure functions over it: no Duyo, no DOM.
// The document shape and STORE name are what users already have on disk (and what Bloom's
// desktop search reads through `filesystem:apps`): do not change them.

export type Priority = 'high' | 'medium' | 'low' | 'none';

export interface Task {
  id: string;
  text: string;
  done: boolean;
  priority?: Priority;
  dueDate?: string; // YYYY-MM-DD
  category?: string;
  notes?: string;
  createdAt: number;
}

export interface TasksDoc {
  tasks: Task[];
}

export const STORE = 'tasks';
export const AUTOSAVE_MS = 600;

/** `icon` is a lucide name; the sidebar row (a React island) maps it to the glyph. */
export const SMART_LISTS = [
  { id: 'all', label: 'All Tasks', icon: 'ListTodo' },
  { id: 'today', label: 'Today', icon: 'Calendar' },
  { id: 'upcoming', label: 'Upcoming', icon: 'AlertCircle' },
  { id: 'completed', label: 'Completed', icon: 'CheckCircle2' },
] as const;

export const CUSTOM_LISTS = [
  { id: 'inbox', label: 'Inbox', icon: 'Inbox' },
  { id: 'work', label: 'Work', icon: 'Briefcase' },
  { id: 'personal', label: 'Personal', icon: 'User' },
  { id: 'shopping', label: 'Shopping', icon: 'ShoppingBag' },
] as const;

export const ALL_LISTS = [...SMART_LISTS, ...CUSTOM_LISTS] as const;
export type ListId = (typeof ALL_LISTS)[number]['id'];

export type SortOption = 'createdAt' | 'dueDate' | 'priority';

export const SORT_OPTIONS = [
  { value: 'createdAt', label: 'Date Added' },
  { value: 'dueDate', label: 'Due Date' },
  { value: 'priority', label: 'Priority' },
];

export const CATEGORY_OPTIONS = [
  { value: 'Inbox', label: 'Inbox' },
  { value: 'Work', label: 'Work' },
  { value: 'Personal', label: 'Personal' },
  { value: 'Shopping', label: 'Shopping' },
];

export const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string }> = {
  high: { label: 'High', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
  medium: { label: 'Medium', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
  low: { label: 'Low', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  none: { label: 'None', color: 'var(--color-text-secondary, #64748b)', bg: 'transparent' },
};

export function newTaskId(): string {
  return Math.random().toString(36).slice(2, 11);
}

export function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getTomorrowString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function fmtDisplayDate(dateStr?: string, todayStr = getTodayString()): string {
  if (!dateStr) return '';
  if (dateStr === todayStr) return 'Today';
  const tomorrowStr = getTomorrowString();
  if (dateStr === tomorrowStr) return 'Tomorrow';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return dateStr;
}

export type Counts = Record<'all' | 'today' | 'upcoming' | 'completed' | 'inbox' | 'work' | 'personal' | 'shopping' | 'done', number>;

export function countTasks(tasks: Task[], todayStr: string): Counts {
  const inCategory = (t: Task, name: string, fallback = '') =>
    (t.category || fallback).toLowerCase() === name && !t.done;
  return {
    all: tasks.length,
    today: tasks.filter((t) => !t.done && t.dueDate === todayStr).length,
    upcoming: tasks.filter((t) => !t.done && t.dueDate && t.dueDate > todayStr).length,
    completed: tasks.filter((t) => t.done).length,
    inbox: tasks.filter((t) => inCategory(t, 'inbox', 'Inbox')).length,
    work: tasks.filter((t) => inCategory(t, 'work')).length,
    personal: tasks.filter((t) => inCategory(t, 'personal')).length,
    shopping: tasks.filter((t) => inCategory(t, 'shopping')).length,
    done: tasks.filter((t) => t.done).length,
  };
}

/** The tasks a list shows, completed ones last, then by the chosen sort, newest first. */
export function visibleTasks(tasks: Task[], selectedList: ListId, sortBy: SortOption, todayStr: string): Task[] {
  let list = tasks;
  switch (selectedList) {
    case 'all':
      break;
    case 'today':
      list = list.filter((t) => !t.done && t.dueDate === todayStr);
      break;
    case 'upcoming':
      list = list.filter((t) => !t.done && t.dueDate && t.dueDate > todayStr);
      break;
    case 'completed':
      list = list.filter((t) => t.done);
      break;
    case 'inbox':
    case 'work':
    case 'personal':
    case 'shopping':
      list = list.filter((t) => (t.category || 'Inbox').toLowerCase() === selectedList);
      break;
  }

  const priorityWeight: Record<Priority, number> = { high: 3, medium: 2, low: 1, none: 0 };
  return [...list].sort((a, b) => {
    // Completed always sink to bottom
    if (a.done !== b.done) return a.done ? 1 : -1;

    if (sortBy === 'priority') {
      const pDiff = (priorityWeight[b.priority || 'none'] || 0) - (priorityWeight[a.priority || 'none'] || 0);
      if (pDiff !== 0) return pDiff;
    } else if (sortBy === 'dueDate') {
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
    }
    return b.createdAt - a.createdAt;
  });
}

/** What a new task is filed under: the open list when it is one of the three custom ones. */
export function categoryForList(selectedList: ListId): string {
  return ['work', 'personal', 'shopping'].includes(selectedList)
    ? selectedList.charAt(0).toUpperCase() + selectedList.slice(1)
    : 'Inbox';
}

// ---- Pills: the quick-add chips and the inspector's priority buttons -------------------------

/** One pill, ready to draw: a button with an icon and a label, its whole look a style string. */
export interface PillItem {
  id: string;
  label: string;
  icon: string;
  iconSize: number;
  /** `fill:<colour>` for a lit flag, else empty. */
  iconStyle: string;
  style: string;
}

const CHIP_BASE =
  'border-radius:12px;padding:2px 8px;font-size:0.74rem;cursor:pointer;display:inline-flex;align-items:center;gap:4px';

function chipStyle(active: boolean, color: string, bg: string): string {
  return (
    `background:${active ? bg : 'transparent'};` +
    `color:${active ? color : 'var(--color-text-secondary, #64748b)'};` +
    `border:1px solid ${active ? color : 'var(--color-border, #e5e7eb)'};` +
    CHIP_BASE
  );
}

const PRIMARY = 'var(--mochi-primary, #2f6fed)';
const PRIMARY_SOFT = 'rgba(59, 130, 246, 0.12)';

/** The quick-add chips: Today, Tomorrow, then High / Medium / Low. */
export function chipPills(draftDueDate: string, draftPriority: Priority, todayStr: string, tomorrowStr: string): PillItem[] {
  const pills: PillItem[] = [
    {
      id: 'today',
      label: 'Today',
      icon: 'Calendar',
      iconSize: 12,
      iconStyle: '',
      style: chipStyle(draftDueDate === todayStr, PRIMARY, PRIMARY_SOFT),
    },
    {
      id: 'tomorrow',
      label: 'Tomorrow',
      icon: 'Clock',
      iconSize: 12,
      iconStyle: '',
      style: chipStyle(draftDueDate === tomorrowStr, PRIMARY, PRIMARY_SOFT),
    },
  ];
  for (const p of ['high', 'medium', 'low'] as const) {
    const cfg = PRIORITY_CONFIG[p];
    const active = draftPriority === p;
    pills.push({
      id: p,
      label: cfg.label,
      icon: 'Flag',
      iconSize: 11,
      iconStyle: active ? `fill:${cfg.color}` : '',
      style: chipStyle(active, cfg.color, cfg.bg),
    });
  }
  return pills;
}

/** The inspector's four priority buttons (a 4-column grid). */
export function priorityPills(current: Priority): PillItem[] {
  return (['none', 'low', 'medium', 'high'] as const).map((p) => {
    const cfg = PRIORITY_CONFIG[p];
    const active = current === p;
    return {
      id: p,
      label: cfg.label,
      icon: 'Flag',
      iconSize: 11,
      iconStyle: active ? `fill:${cfg.color}` : '',
      style:
        `background:${active ? cfg.bg : 'var(--color-surface, var(--mochi-surface, #ffffff))'};` +
        `color:${active ? cfg.color : 'var(--color-text, #334155)'};` +
        `border:1px solid ${active ? cfg.color : 'var(--color-border, #e5e7eb)'};` +
        `border-radius:8px;padding:5px 4px;font-size:0.72rem;font-weight:${active ? 700 : 500};` +
        'cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px',
    };
  });
}

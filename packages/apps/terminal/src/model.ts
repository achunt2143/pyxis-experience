/** What the screens island needs of a session: its id and where its first shell starts. */
export interface TabInfo {
  id: string;
  title: string;
  cwd?: string;
}

export const FONT_MIN = 10;
export const FONT_MAX = 22;
export const FONT_DEFAULT = 13;

export type TerminalMode = 'connecting' | 'pty' | 'mock';

export type TerminalShortcutAction =
  | 'newTab'
  | 'closeTab'
  | 'clear'
  | 'copy'
  | 'paste'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'nextTab'
  | 'prevTab';

export function matchTerminalShortcut(e: {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): TerminalShortcutAction | null {
  const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
  if (!mod) return null;

  const lower = e.key.toLowerCase();
  if (e.shiftKey) {
    if (lower === 't' || e.code === 'KeyT') return 'newTab';
    if (lower === 'w' || e.code === 'KeyW') return 'closeTab';
    if (lower === 'c' || e.code === 'KeyC') return 'copy';
    if (lower === 'v' || e.code === 'KeyV') return 'paste';
    if (lower === 'k' || e.code === 'KeyK') return 'clear';
    if (e.key === 'Tab') return 'prevTab';
  } else {
    if (e.key === 'Tab') return 'nextTab';
    if (e.key === '-' || e.key === '_' || e.code === 'Minus' || e.code === 'NumpadSubtract') return 'zoomOut';
    if (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0') return 'zoomReset';
  }

  if (e.key === '=' || e.key === '+' || e.code === 'Equal' || e.code === 'NumpadAdd') {
    return 'zoomIn';
  }
  return null;
}

/** The helper ribbon's keys: what each sends to the shell. */
export interface QuickKeyDef {
  label: string;
  value: string;
  hint?: string;
}

/** The keys row: what touch has no key for. Labels are actions, so title case; glyphs for arrows. */
export const QUICK_KEYS: QuickKeyDef[] = [
  { label: 'Esc', value: '\x1b', hint: 'Escape' },
  { label: 'Tab', value: '\t', hint: 'Tab: complete' },
  { label: 'Ctrl C', value: '\x03', hint: 'Ctrl C: interrupt' },
  { label: '▲', value: '\x1b[A', hint: 'Up: previous command' },
  { label: '▼', value: '\x1b[B', hint: 'Down: next command' },
  { label: '◀', value: '\x1b[D', hint: 'Left' },
  { label: '▶', value: '\x1b[C', hint: 'Right' },
  { label: 'Ctrl D', value: '\x04', hint: 'Ctrl D: end of input' },
];

export type CursorShape = 'block' | 'bar' | 'underline';
export type BellStyle = 'light' | 'sound' | 'none';
/** The keys row: on touch or narrow windows, always, or never. */
export type KeysMode = 'auto' | 'on' | 'off';

/** The Profile pane: one for every session, saved in the app's store. */
export interface TerminalProfile {
  fontSize: number;
  cursor: CursorShape;
  bell: BellStyle;
  keys: KeysMode;
  startInLastFolder: boolean;
  askBeforeClose: boolean;
}

export const DEFAULT_PROFILE: TerminalProfile = {
  fontSize: FONT_DEFAULT,
  cursor: 'block',
  bell: 'light',
  keys: 'auto',
  startInLastFolder: false,
  askBeforeClose: true,
};

/** The app's store: the profile and the recent folders for "Start In". */
export const STORE = 'terminal';
export interface TerminalDoc {
  profile: TerminalProfile;
  recent: string[];
}

/** A stored profile with any missing or wrong field put back to its default. */
export function normalizeProfile(raw: Partial<TerminalProfile> | null | undefined): TerminalProfile {
  const p = raw ?? {};
  const size = Number(p.fontSize);
  return {
    fontSize: Number.isFinite(size) ? Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(size))) : DEFAULT_PROFILE.fontSize,
    cursor: p.cursor === 'bar' || p.cursor === 'underline' ? p.cursor : 'block',
    bell: p.bell === 'sound' || p.bell === 'none' ? p.bell : 'light',
    keys: p.keys === 'on' || p.keys === 'off' ? p.keys : 'auto',
    startInLastFolder: p.startInLastFolder === true,
    askBeforeClose: p.askBeforeClose !== false,
  };
}

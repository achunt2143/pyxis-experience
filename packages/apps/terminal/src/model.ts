/** One terminal tab. */
export interface TabInfo {
  id: string;
  title: string;
}

export const FONT_MIN = 10;
export const FONT_MAX = 22;
export const FONT_DEFAULT = 13;

export type TerminalMode = 'connecting' | 'pty' | 'mock';

export type TerminalShortcutAction =
  | 'newTab'
  | 'closeTab'
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

export const QUICK_KEYS: QuickKeyDef[] = [
  { label: 'ESC', value: '\x1b', hint: 'Escape' },
  { label: 'TAB', value: '\t', hint: 'Tab Auto-complete' },
  { label: '^C', value: '\x03', hint: 'Ctrl+C (Interrupt)' },
  { label: '^D', value: '\x04', hint: 'Ctrl+D (EOF / Exit)' },
  { label: '^L', value: '\x0c', hint: 'Ctrl+L (Clear screen)' },
  { label: '|', value: '|', hint: 'Pipe' },
  { label: '/', value: '/', hint: 'Slash' },
  { label: '~', value: '~', hint: 'Home directory' },
  { label: '-', value: '-', hint: 'Dash' },
  { label: '_', value: '_', hint: 'Underscore' },
  { label: '$', value: '$', hint: 'Dollar' },
  { label: '◀', value: '\x1b[D', hint: 'Left Arrow' },
  { label: '▲', value: '\x1b[A', hint: 'Up Arrow (History Prev)' },
  { label: '▼', value: '\x1b[B', hint: 'Down Arrow (History Next)' },
  { label: '▶', value: '\x1b[C', hint: 'Right Arrow' },
];

/** One terminal tab. */
export interface TabInfo {
  id: string;
  title: string;
}

export const FONT_MIN = 10;
export const FONT_MAX = 22;
export const FONT_DEFAULT = 13;

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

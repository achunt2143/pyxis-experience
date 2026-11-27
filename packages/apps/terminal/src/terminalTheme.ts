import type { ITheme } from '@xterm/xterm';

/**
 * The screen's colours and face, read from the `--term-*` tokens in `terminal.css`
 * (Mochi ANSI: every colour 4.5:1 or more on `--mochi-panel-bg`, in both themes). Nothing is
 * written in TypeScript, so a theme change, high contrast or a host override is just CSS.
 */

/** xterm theme key → token. */
const TOKENS: ReadonlyArray<readonly [keyof ITheme, string]> = [
  ['background', '--term-ground'],
  ['foreground', '--term-ink'],
  ['cursor', '--term-cursor'],
  ['cursorAccent', '--term-cursor-ink'],
  ['selectionBackground', '--term-selection'],
  ['black', '--term-black'],
  ['red', '--term-red'],
  ['green', '--term-green'],
  ['yellow', '--term-yellow'],
  ['blue', '--term-blue'],
  ['magenta', '--term-magenta'],
  ['cyan', '--term-cyan'],
  ['white', '--term-white'],
  ['brightBlack', '--term-bright-black'],
  ['brightRed', '--term-bright-red'],
  ['brightGreen', '--term-bright-green'],
  ['brightYellow', '--term-bright-yellow'],
  ['brightBlue', '--term-bright-blue'],
  ['brightMagenta', '--term-bright-magenta'],
  ['brightCyan', '--term-bright-cyan'],
  ['brightWhite', '--term-bright-white'],
];

/** The concept's face: the platform's monospace. */
export const TERM_FONT_FALLBACK = 'ui-monospace, "SFMono-Regular", "DejaVu Sans Mono", Menlo, Consolas, monospace';

/** The xterm theme for the tokens as they resolve on `el` (so the nearest theme wrapper wins). */
export function readTerminalTheme(el: Element): ITheme {
  const css = getComputedStyle(el);
  const theme: ITheme = {};
  for (const [key, token] of TOKENS) {
    const value = css.getPropertyValue(token).trim();
    if (value) (theme as Record<string, string>)[key] = value;
  }
  return theme;
}

export function readTerminalFont(el: Element): string {
  return getComputedStyle(el).getPropertyValue('--term-font').trim() || TERM_FONT_FALLBACK;
}

/**
 * Calls `onChange` when the theme under `el` may have changed: a `data-mochi-theme`,
 * `data-high-contrast` or `class` change on any ancestor. Returns the unsubscribe.
 */
export function watchTheme(el: Element, onChange: () => void): () => void {
  if (typeof MutationObserver === 'undefined') return () => {};
  const observer = new MutationObserver(onChange);
  for (let node: Element | null = el; node; node = node.parentElement) {
    observer.observe(node, { attributes: true, attributeFilter: ['data-mochi-theme', 'data-high-contrast', 'class'] });
  }
  return () => observer.disconnect();
}

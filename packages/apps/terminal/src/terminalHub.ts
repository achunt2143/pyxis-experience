import type { Terminal } from '@xterm/xterm';

/**
 * The handle the chrome (a kind) has on the terminal views (the React island).
 *
 * The views own the xterm instances and their shells; the toolbar and the quick-keys
 * ribbon only ever need to say "focus this tab", "clear it" or "type this into it".
 * Those are imperative calls on live widgets, so they go through this object, which each
 * view registers itself with, and never through published properties. (The streaming
 * output does not pass through here either: it goes from Echo's signal straight into
 * `term.write`, inside the island.)
 */
export class TerminalHub {
  private readonly terms = new Map<string, Terminal>();
  private readonly senders = new Map<string, (data: string) => void>();
  private readonly sizes = new Map<string, { cols: number; rows: number }>();
  /** Set by the chrome: a session's grid changed size (its Subheader says it). */
  onResize: ((id: string, cols: number, rows: number) => void) | null = null;

  registerTerm(id: string, term: Terminal | null): void {
    if (term) this.terms.set(id, term);
    else {
      this.terms.delete(id);
      this.sizes.delete(id);
    }
  }

  registerSendInput(id: string, send: ((data: string) => void) | null): void {
    if (send) this.senders.set(id, send);
    else this.senders.delete(id);
  }

  /** A view's grid is now `cols` × `rows`. */
  reportSize(id: string, cols: number, rows: number): void {
    const prev = this.sizes.get(id);
    if (prev && prev.cols === cols && prev.rows === rows) return;
    this.sizes.set(id, { cols, rows });
    this.onResize?.(id, cols, rows);
  }

  size(id: string): { cols: number; rows: number } | undefined {
    return this.sizes.get(id);
  }

  focus(id: string): void {
    this.terms.get(id)?.focus();
  }

  clear(id: string): void {
    this.terms.get(id)?.clear();
    this.terms.get(id)?.focus();
  }

  /** Types `data` into the tab's shell (a quick key), then gives the terminal the keyboard. */
  sendKey(id: string, data: string): void {
    this.senders.get(id)?.(data);
    this.terms.get(id)?.focus();
  }

  /** Copies the active selection (if any) to the system clipboard safely. */
  async copySelection(id: string): Promise<boolean> {
    const term = this.terms.get(id);
    if (!term) return false;
    const text = typeof term.getSelection === 'function' ? term.getSelection() : '';
    if (!text) {
      term.focus();
      return false;
    }
    try {
      await navigator.clipboard?.writeText?.(text);
    } catch {
      /* clipboard denied or unavailable */
    }
    term.focus();
    return true;
  }

  /** Reads from the system clipboard safely and pastes into the terminal's shell. */
  async pasteClipboard(id: string): Promise<boolean> {
    const term = this.terms.get(id);
    if (!term) return false;
    let text = '';
    try {
      text = (await navigator.clipboard?.readText?.()) ?? '';
    } catch {
      /* clipboard denied or unavailable */
    }
    if (text) {
      if (typeof term.paste === 'function') {
        term.paste(text);
      } else {
        this.senders.get(id)?.(text);
      }
    }
    term.focus();
    return !!text;
  }
}

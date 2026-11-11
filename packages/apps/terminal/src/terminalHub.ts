import type { Terminal } from 'xterm';

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

  registerTerm(id: string, term: Terminal | null): void {
    if (term) this.terms.set(id, term);
    else this.terms.delete(id);
  }

  registerSendInput(id: string, send: ((data: string) => void) | null): void {
    if (send) this.senders.set(id, send);
    else this.senders.delete(id);
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
}

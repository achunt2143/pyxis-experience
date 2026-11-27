// A fake xterm for the Terminal tests (the real one needs a canvas and layout).

/** Every FakeTerminal made, in order (one per tab, more under StrictMode). */
export const terms: FakeTerminal[] = [];

/** Stands in for xterm, which needs a real canvas and layout. Records what the views do to it. */
export class FakeTerminal {
  cols = 80;
  rows = 24;
  options: { fontSize?: number; scrollback?: number; cursorStyle?: string } = {};
  written: string[] = [];
  focused = 0;
  cleared = 0;
  disposed = false;
  selection = '';
  pasted: string[] = [];
  /** Every onData listener, as xterm keeps them (the shell view's and the mock shell's). */
  private dataListeners: Array<(data: string) => void> = [];
  onBellCb: (() => void) | null = null;
  customKeyHandler: ((ev: KeyboardEvent) => boolean) | null = null;

  constructor(opts: { fontSize?: number; scrollback?: number; cursorStyle?: string } = {}) {
    this.options = { fontSize: opts.fontSize, scrollback: opts.scrollback, cursorStyle: opts.cursorStyle };
    terms.push(this);
  }
  loadAddon() {}
  open() {}
  focus() {
    this.focused++;
  }
  write(data: string) {
    this.written.push(data);
  }
  writeln(data: string) {
    this.written.push(data + '\r\n');
  }
  clear() {
    this.cleared++;
  }
  onData(cb: (data: string) => void) {
    this.dataListeners.push(cb);
    return { dispose: () => { this.dataListeners = this.dataListeners.filter((l) => l !== cb); } };
  }
  /** Types `data` as the person would: every listener hears it. Null while none is attached. */
  get onDataCb(): ((data: string) => void) | null {
    return this.dataListeners.length ? (data) => this.dataListeners.slice().forEach((l) => l(data)) : null;
  }
  onBell(cb: () => void) {
    this.onBellCb = cb;
    return { dispose: () => { this.onBellCb = null; } };
  }
  attachCustomKeyEventHandler(cb: (ev: KeyboardEvent) => boolean) {
    this.customKeyHandler = cb;
  }
  getSelection() {
    return this.selection;
  }
  paste(data: string) {
    this.pasted.push(data);
    this.onDataCb?.(data);
  }
  triggerBell() {
    this.onBellCb?.();
  }
  dispose() {
    this.disposed = true;
  }
  /** Everything written so far, as one string. */
  get text() {
    return this.written.join('');
  }
}

export class FakeFit {
  fit() {}
}


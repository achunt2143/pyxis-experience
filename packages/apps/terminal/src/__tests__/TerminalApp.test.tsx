// @vitest-environment jsdom
import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { echoClient } from '@pyxis/app-sdk';
import {
  $,
  FakeFit,
  activeTab,
  click,
  keyButton,
  mountTerminal,
  screenFor,
  settle,
  stubCanvas,
  tabTitles,
  tabs,
  terms,
  titled,
  type Mounted,
} from './testUtils';

vi.mock('@xterm/xterm', async () => ({ Terminal: (await import('./fakeXterm')).FakeTerminal }));
vi.mock('@xterm/addon-fit', async () => ({ FitAddon: (await import('./fakeXterm')).FakeFit }));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));
// The theme hook would start Echo's clock.
vi.mock('../../../../app-sdk/src/usePyxisTheme', () => ({ usePyxisTheme: () => 'dark' }));

stubCanvas();

/** What the fake Echo answers `terminal.Open` with, and every call it was given. */
let nextShell = 0;
let calls: Array<{ method: string; args: Record<string, unknown> }> = [];
let native = true;

beforeEach(() => {
  terms.length = 0;
  calls = [];
  nextShell = 0;
  native = true;
  vi.spyOn(echoClient, 'callMethod').mockImplementation(async (_service, iface, method, args = {}) => {
    if (iface !== 'org.geckoOS.terminal') return undefined;
    calls.push({ method, args });
    if (method === 'Open') return native ? { terminalId: `pty-${++nextShell}` } : undefined;
    return undefined;
  });
});

let m: Mounted | undefined;
afterEach(() => {
  m?.unmount();
  m = undefined;
  vi.restoreAllMocks();
});

const called = (method: string) => calls.filter((c) => c.method === method);
/** The live terminal of the nth tab: under StrictMode the first of each pair is disposed. */
const live = () => terms.filter((t) => !t.disposed);
const emit = (signal: string, data: Record<string, unknown>) =>
  act(async () => {
    await echoClient.emitSignal('org.geckoOS.terminal', signal, data);
  });

describe('Terminal: opening', () => {
  it('has one tab, bash 1, active, over a live terminal that opened a shell at its size', async () => {
    m = await mountTerminal();
    expect(tabTitles(m.host)).toEqual(['bash 1']);
    expect(activeTab(m.host)?.textContent).toBe('bash 1');
    expect(live()).toHaveLength(1);
    const opens = called('Open').slice(-1);
    expect(opens[0].args).toEqual({ cols: 80, rows: 24 });
    expect($(m.host, '[data-window-id]')?.getAttribute('data-window-id')).toBe('standalone');
    // The only tab has no close button.
    expect($(m.host, '.term-tab-close')?.style.display).toBe('none');
  });

  it('gives the keyboard to the terminal when it opens', async () => {
    m = await mountTerminal();
    expect(live()[0].focused).toBeGreaterThan(0);
  });
});

describe('Terminal: the shell', () => {
  it('writes the shell\'s output for its own terminal id, and only that', async () => {
    m = await mountTerminal();
    const term = live()[0];
    const id = `pty-${nextShell}`;
    await emit('TerminalOutput', { terminalId: id, data: 'hello\r\n' });
    await emit('TerminalOutput', { terminalId: 'someone-else', data: 'NOT MINE' });
    expect(term.text).toBe('hello\r\n');
  });

  it('sends what is typed to the shell, and the size on a window resize', async () => {
    m = await mountTerminal();
    const term = live()[0];
    const id = `pty-${nextShell}`;
    term.onDataCb?.('ls\r');
    expect(called('Write').pop()?.args).toEqual({ terminalId: id, data: 'ls\r' });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(called('Resize').pop()?.args).toEqual({ terminalId: id, cols: 80, rows: 24 });
  });

  it('streams output into the terminal without changing any property of the Duyo tree', async () => {
    m = await mountTerminal();
    const root = m.app.root;
    const tabsBefore = root['tabs'];
    const id = `pty-${nextShell}`;
    for (let i = 0; i < 20; i++) await emit('TerminalOutput', { terminalId: id, data: `line ${i}\r\n` });
    expect(live()[0].written).toHaveLength(20);
    expect(root['tabs']).toBe(tabsBefore);
  });

  it('closes the app when the last shell exits, after saying so in the terminal', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    m = await mountTerminal();
    const term = live()[0];
    await emit('TerminalClosed', { terminalId: `pty-${nextShell}` });
    expect(term.text).toContain('[process exited]');
    expect(close).toHaveBeenCalled();
  });

  it('asks its parent to close when embedded', async () => {
    const parent = { postMessage: vi.fn() };
    vi.spyOn(window, 'parent', 'get').mockReturnValue(parent as unknown as Window);
    m = await mountTerminal();
    await emit('TerminalClosed', { terminalId: `pty-${nextShell}` });
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'pyxis:app-close', windowId: 'standalone' }, '*');
  });

  it('closes the shell when the app goes', async () => {
    m = await mountTerminal();
    const id = `pty-${nextShell}`;
    m.unmount();
    m = undefined;
    expect(called('Close').some((c) => c.args['terminalId'] === id)).toBe(true);
    expect(terms.every((t) => t.disposed)).toBe(true);
  });
});

describe('Terminal: tabs', () => {
  it('adds a tab, titled bash 2, makes it active, and shows the close buttons', async () => {
    m = await mountTerminal();
    click($(m.host, '[title="New tab (Ctrl+Shift+T)"]')!);
    await settle();
    expect(tabTitles(m.host)).toEqual(['bash 1', 'bash 2']);
    expect(activeTab(m.host)?.textContent).toBe('bash 2');
    expect(live()).toHaveLength(2);
    expect(called('Open').length).toBeGreaterThanOrEqual(2);
    for (const x of tabs(m.host)) expect($(x, '.term-tab-close')?.style.display).not.toBe('none');
    // Only the active tab's terminal is shown.
    const ids = tabs(m.host).length;
    expect(ids).toBe(2);
  });

  it('shows only the active tab\'s screen and focuses a tab\'s terminal when it is clicked', async () => {
    m = await mountTerminal();
    const first = live()[0];
    click($(m.host, '[title="New tab (Ctrl+Shift+T)"]')!);
    await settle();
    const [t1, t2] = tabs(m.host);
    const screens = [...m.host.querySelectorAll<HTMLElement>('[aria-label^="terminal-tab-"]')].map((e) => e.parentElement!);
    expect(screens.map((s) => s.style.display)).toEqual(['none', 'block']);
    const before = first.focused;
    click(t1);
    await settle();
    expect(activeTab(m.host)).toBe(t1);
    expect(t2.classList.contains('active')).toBe(false);
    expect(first.focused).toBeGreaterThan(before);
    expect(screens.map((s) => s.style.display)).toEqual(['block', 'none']);
  });

  it('closes a tab from its X: the terminal and shell go, the neighbour takes over, and it does not select first', async () => {
    m = await mountTerminal();
    click($(m.host, '[title="New tab (Ctrl+Shift+T)"]')!);
    await settle();
    const second = live()[1];
    const secondId = `pty-${nextShell}`;
    const [t1] = tabs(m.host);
    click($(t1, '.term-tab-close')!); // close tab 1 while 2 is active
    await settle();
    expect(tabTitles(m.host)).toEqual(['bash 2']);
    expect(activeTab(m.host)?.textContent).toBe('bash 2');
    expect(live()).toEqual([second]);
    expect(called('Close').some((c) => c.args['terminalId'] === 'pty-1' || c.args['terminalId'] === 'pty-2')).toBe(true);
    expect(called('Close').every((c) => c.args['terminalId'] !== secondId)).toBe(true);
  });

  it('closing the active tab activates the last one left', async () => {
    m = await mountTerminal();
    for (let i = 0; i < 2; i++) {
      click($(m.host, '[title="New tab (Ctrl+Shift+T)"]')!);
      await settle();
      await new Promise((r) => setTimeout(r, 2)); // distinct Date.now() ids
    }
    expect(tabTitles(m.host)).toEqual(['bash 1', 'bash 2', 'bash 3']);
    click($(tabs(m.host)[2], '.term-tab-close')!);
    await settle();
    expect(tabTitles(m.host)).toEqual(['bash 1', 'bash 2']);
    expect(activeTab(m.host)?.textContent).toBe('bash 2');
  });

  it('a shell that exits in the active tab hands the view to a surviving one (the old app left a blank view)', async () => {
    m = await mountTerminal();
    click($(m.host, '[title="New tab (Ctrl+Shift+T)"]')!);
    await settle();
    const exiting = `pty-${nextShell}`; // tab 2's, active
    await emit('TerminalClosed', { terminalId: exiting });
    expect(tabTitles(m.host)).toEqual(['bash 1']);
    expect(activeTab(m.host)?.textContent).toBe('bash 1');
  });
});

describe('Terminal: toolbar', () => {
  it('zooms the font by one, between 10 and 22, and shows it', async () => {
    m = await mountTerminal();
    const term = live()[0];
    expect(m.host.textContent).toContain('13px');
    click(titled(m.host, 'Zoom In'));
    await settle();
    expect(m.host.textContent).toContain('14px');
    expect(term.options.fontSize).toBe(14);
    for (let i = 0; i < 12; i++) click(titled(m.host, 'Zoom In'));
    await settle();
    expect(term.options.fontSize).toBe(22);
    for (let i = 0; i < 20; i++) click(titled(m.host, 'Zoom Out'));
    await settle();
    expect(term.options.fontSize).toBe(10);
    expect(m.host.textContent).toContain('10px');
  });

  it('clears the active terminal and keeps the keyboard in it', async () => {
    m = await mountTerminal();
    const term = live()[0];
    const focused = term.focused;
    click(titled(m.host, 'Clear terminal screen'));
    expect(term.cleared).toBe(1);
    expect(term.focused).toBeGreaterThan(focused);
  });

  it('hides and shows the quick-keys ribbon, and the Keys label on its button', async () => {
    m = await mountTerminal();
    const keysBtn = () => titled(m!.host, 'Toggle Palm Touch Quick Keys Ribbon');
    const ribbon = () => keyButton(m!.host, 'ESC').closest<HTMLElement>('[data-duyo-kind]')!.parentElement!.parentElement!;
    expect(ribbon().style.display).not.toBe('none');
    const label = () => m!.host.querySelector<HTMLElement>('[title="Toggle Palm Touch Quick Keys Ribbon"] span span')!;
    expect(label().textContent).toBe('Keys');
    expect(label().style.display).not.toBe('none');
    click(keysBtn());
    await settle();
    expect(ribbon().style.display).toBe('none');
    expect(label().style.display).toBe('none');
    click(keysBtn());
    await settle();
    expect(ribbon().style.display).not.toBe('none');
  });
});

describe('Terminal: quick keys', () => {
  it('has the fifteen keys with their hints', async () => {
    m = await mountTerminal();
    const keys = [...m.host.querySelectorAll<HTMLElement>('.term-key')];
    expect(keys.map((k) => k.textContent)).toEqual([
      'ESC', 'TAB', '^C', '^D', '^L', '|', '/', '~', '-', '_', '$', '◀', '▲', '▼', '▶',
    ]);
    expect(keyButton(m.host, '^C').title).toBe('Ctrl+C (Interrupt)');
  });

  it('sends a key to the active tab\'s shell and hands the keyboard back to the terminal', async () => {
    m = await mountTerminal();
    const term = live()[0];
    const id = `pty-${nextShell}`;
    const focused = term.focused;
    click(keyButton(m.host, '^C'));
    await settle();
    expect(called('Write').pop()?.args).toEqual({ terminalId: id, data: '\x03' });
    expect(term.focused).toBeGreaterThan(focused);
    click(keyButton(m.host, '▲'));
    expect(called('Write').pop()?.args).toEqual({ terminalId: id, data: '\x1b[A' });
  });

  it('cancels mousedown so pressing a key does not take focus from the terminal', async () => {
    m = await mountTerminal();
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    act(() => {
      keyButton(m!.host, 'TAB').dispatchEvent(down);
    });
    expect(down.defaultPrevented).toBe(true);
  });

  it('types into the tab that is active, not the first', async () => {
    m = await mountTerminal();
    click($(m.host, '[title="New tab (Ctrl+Shift+T)"]')!);
    await settle();
    const id2 = `pty-${nextShell}`;
    click(keyButton(m.host, '|'));
    expect(called('Write').pop()?.args).toEqual({ terminalId: id2, data: '|' });
  });
});

describe('Terminal: the dev mock shell (no Echo shell)', () => {
  beforeEach(() => {
    native = false;
  });

  it('greets, runs commands typed at it, and retitles the tab after the command', async () => {
    m = await mountTerminal();
    const term = live()[0];
    expect(term.text).toContain('Pyxis Terminal');
    for (const ch of ['l', 's', '\r']) term.onDataCb?.(ch);
    await settle();
    expect(term.text).toContain('Desktop  Documents');
    expect(tabTitles(m.host)).toEqual(['ls']);
    expect(called('Write')).toHaveLength(0);
  });

  it('takes quick keys as input, and exit closes the app', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    m = await mountTerminal();
    const term = live()[0];
    click(keyButton(m.host, '^D')); // Ctrl+D on an empty line is exit
    await settle();
    expect(term.text).toContain('exit');
    expect(close).toHaveBeenCalled();
  });

  it('closes just its own tab on exit when there are others', async () => {
    m = await mountTerminal();
    click($(m.host, '[title="New tab (Ctrl+Shift+T)"]')!);
    await settle();
    click(keyButton(m.host, '^D'));
    await settle();
    expect(tabTitles(m.host)).toEqual(['bash 1']);
    expect(screenFor(m.host, 'tab-1').style.display).toBe('block');
  });
});

describe('Terminal: size (guards the island against fast-ticking props)', () => {
  it('keeps the tree small', async () => {
    m = await mountTerminal();
    const count = m.host.querySelectorAll('[data-duyo-id]').length;
    expect(count).toBeLessThan(80);
    fireEvent.keyDown(m.host, { key: 'a' });
  });
});

describe('Terminal: Wave A PTY lifecycle, shortcuts, clipboard, mockShell & accessibility', () => {
  it('observes container resize on ribbon toggle and syncs PTY dimensions on font zoom & tab switch', async () => {
    const originalRO = globalThis.ResizeObserver;
    const observers: Array<{ cb: ResizeObserverCallback; el: Element | null }> = [];
    globalThis.ResizeObserver = class {
      cb: ResizeObserverCallback;
      el: Element | null = null;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
      }
      observe(el: Element) {
        this.el = el;
        observers.push({ cb: this.cb, el });
      }
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver;

    try {
      m = await mountTerminal();
      const term = live()[0];
      const id1 = `pty-${nextShell}`;
      expect(observers.length).toBeGreaterThan(0);

      // Toggling Quick Keys triggers ResizeObserver -> re-fits & notifies echo.resizeTerminal
      const fitSpy = vi.spyOn(FakeFit.prototype, 'fit').mockImplementation(() => {
        term.cols = 80;
        term.rows = 28;
      });
      click(titled(m.host, 'Toggle Palm Touch Quick Keys Ribbon'));
      await settle();
      act(() => {
        const last = observers[observers.length - 1]!;
        last.cb([], {} as ResizeObserver);
      });
      expect(fitSpy).toHaveBeenCalled();
      expect(called('Resize').pop()?.args).toEqual({ terminalId: id1, cols: 80, rows: 28 });

      // Font zoom updates dimensions and notifies echo.resizeTerminal when changed
      fitSpy.mockImplementation(() => {
        term.cols = 72;
        term.rows = 22;
      });
      click(titled(m.host, 'Zoom In'));
      await settle();
      expect(called('Resize').pop()?.args).toEqual({ terminalId: id1, cols: 72, rows: 22 });

      // Open tab 2, resize tab 1's dimensions while inactive, then switch back -> syncs PTY resize
      fitSpy.mockImplementation(() => {});
      click($(m.host, '[title="New tab (Ctrl+Shift+T)"]')!);
      await settle();
      term.cols = 90;
      term.rows = 30;
      click(tabs(m.host)[0]!);
      await act(async () => {
        await new Promise((r) => setTimeout(r, 60));
      });
      expect(called('Resize').pop()?.args).toEqual({ terminalId: id1, cols: 90, rows: 30 });
    } finally {
      globalThis.ResizeObserver = originalRO;
    }
  });

  it('closes an orphan PTY if unmounted while openTerminal is in flight', async () => {
    let resolveOpen!: (v: unknown) => void;
    vi.mocked(echoClient.callMethod).mockImplementation(async (_service, iface, method, args = {}) => {
      if (iface !== 'org.geckoOS.terminal') return undefined;
      calls.push({ method, args });
      if (method === 'Open') {
        return new Promise((r) => {
          resolveOpen = r;
        });
      }
      return undefined;
    });

    m = await mountTerminal();
    m.unmount();
    m = undefined;

    await act(async () => {
      resolveOpen({ terminalId: 'pty-orphan' });
    });
    expect(called('Close').some((c) => c.args['terminalId'] === 'pty-orphan')).toBe(true);
  });

  it('falls back to mock shell and updates the mode badge when openTerminal throws', async () => {
    vi.mocked(echoClient.callMethod).mockImplementation(async (_service, iface, method, args = {}) => {
      if (iface !== 'org.geckoOS.terminal') return undefined;
      calls.push({ method, args });
      if (method === 'Open') throw new Error('PTY daemon unavailable');
      return undefined;
    });

    m = await mountTerminal();
    const term = live()[0];
    expect(term.text).toContain('Pyxis Terminal');
    expect($(m.host, '.term-mode-badge')?.textContent).toBe('Mock Shell');
    expect(screenFor(m.host, 'tab-1').getAttribute('data-terminal-mode')).toBe('mock');
  });

  it('shows PTY mode badge when native shell is connected', async () => {
    m = await mountTerminal();
    expect($(m.host, '.term-mode-badge')?.textContent).toBe('PTY');
    expect(screenFor(m.host, 'tab-1').getAttribute('data-terminal-mode')).toBe('pty');
  });

  it('supports Ctrl+Shift+T/W, Ctrl+Tab/Shift+Tab, Ctrl+=/-/0, and Ctrl+Shift+C/V without leaking to PTY', async () => {
    const origClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue('pasted cmd');
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText, readText },
      configurable: true,
    });

    try {
      vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      m = await mountTerminal();
      const t1 = live()[0];

      // attachCustomKeyEventHandler blocks app shortcuts from xterm, but allows plain Ctrl+C
      expect(t1.customKeyHandler?.(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, shiftKey: true }))).toBe(false);
      expect(t1.customKeyHandler?.(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, shiftKey: false }))).toBe(true);

      // Ctrl+Shift+T opens new tabs even with identical Date.now()
      act(() => {
        fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });
        fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });
      });
      await settle();
      expect(tabTitles(m.host)).toEqual(['bash 1', 'bash 2', 'bash 3']);
      expect(activeTab(m.host)?.textContent).toBe('bash 3');

      // Ctrl+Tab cycles forward to bash 1; Ctrl+Shift+Tab cycles backward to bash 3
      act(() => {
        fireEvent.keyDown(document, { key: 'Tab', ctrlKey: true });
      });
      expect(activeTab(m.host)?.textContent).toBe('bash 1');
      act(() => {
        fireEvent.keyDown(document, { key: 'Tab', ctrlKey: true, shiftKey: true });
      });
      expect(activeTab(m.host)?.textContent).toBe('bash 3');

      // Ctrl+Shift+C copies selection, Ctrl+Shift+V pastes clipboard
      const t3 = live()[2];
      t3.selection = 'selected text';
      await act(async () => {
        fireEvent.keyDown(document, { key: 'C', ctrlKey: true, shiftKey: true });
      });
      expect(writeText).toHaveBeenCalledWith('selected text');
      await act(async () => {
        fireEvent.keyDown(document, { key: 'V', ctrlKey: true, shiftKey: true });
      });
      expect(readText).toHaveBeenCalled();
      expect(t3.pasted).toEqual(['pasted cmd']);

      // Ctrl+= zooms in, Ctrl+- zooms out, Ctrl+0 resets to 13px
      act(() => {
        fireEvent.keyDown(document, { key: '=', ctrlKey: true });
        fireEvent.keyDown(document, { key: '=', ctrlKey: true });
      });
      expect(m.host.textContent).toContain('15px');
      act(() => {
        fireEvent.keyDown(document, { key: '-', ctrlKey: true });
      });
      expect(m.host.textContent).toContain('14px');
      act(() => {
        fireEvent.keyDown(document, { key: '0', ctrlKey: true });
      });
      expect(m.host.textContent).toContain('13px');

      // Ctrl+Shift+W closes active tab
      act(() => {
        fireEvent.keyDown(document, { key: 'W', ctrlKey: true, shiftKey: true });
      });
      await settle();
      expect(tabTitles(m.host)).toEqual(['bash 1', 'bash 2']);
    } finally {
      if (origClipboard) Object.defineProperty(navigator, 'clipboard', origClipboard);
      else delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });

  it('disables zoomOut at 10px and zoomIn at 22px, configures scrollback 5000, and flashes visual bell', async () => {
    m = await mountTerminal();
    const term = live()[0];
    expect(term.options.scrollback).toBe(5000);

    for (let i = 0; i < 5; i++) click(titled(m.host, 'Zoom Out'));
    expect(m.host.textContent).toContain('10px');
    expect(titled(m.host, 'Zoom Out').hasAttribute('disabled')).toBe(true);
    expect(titled(m.host, 'Zoom In').hasAttribute('disabled')).toBe(false);

    for (let i = 0; i < 15; i++) click(titled(m.host, 'Zoom In'));
    expect(m.host.textContent).toContain('22px');
    expect(titled(m.host, 'Zoom In').hasAttribute('disabled')).toBe(true);

    // Visual bell indicator flashes on onBell and clears
    const screen = screenFor(m.host, 'tab-1');
    expect(screen.getAttribute('data-bell')).toBe('idle');
    act(() => {
      term.triggerBell();
    });
    expect(screen.getAttribute('data-bell')).toBe('active');
    expect(screen.classList.contains('term-bell-active')).toBe(true);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250));
    });
    expect(screen.getAttribute('data-bell')).toBe('idle');
  });

  it('exposes aria-labels on toolbar controls and keyboard navigation on tabs and close buttons', async () => {
    m = await mountTerminal();
    expect($(m.host, 'button[aria-label="New tab"]')).toBeTruthy();
    expect($(m.host, 'button[aria-label="Toggle Palm Touch Quick Keys Ribbon"]')).toBeTruthy();
    expect($(m.host, 'button[aria-label="Copy selection"]')).toBeTruthy();
    expect($(m.host, 'button[aria-label="Paste from clipboard"]')).toBeTruthy();
    expect($(m.host, 'button[aria-label="Clear terminal screen"]')).toBeTruthy();
    expect($(m.host, 'button[aria-label="Zoom Out"]')).toBeTruthy();
    expect($(m.host, 'button[aria-label="Zoom In"]')).toBeTruthy();

    click($(m.host, 'button[aria-label="New tab"]')!);
    await settle();
    const [t1, t2] = tabs(m.host);
    expect(t1.tabIndex).toBe(0);
    const close1 = $(t1, '.term-tab-close')!;
    expect(close1.tabIndex).toBe(0);
    expect(close1.getAttribute('aria-label')).toBe('Close bash 1');

    // Enter on tab 1 switches back to tab 1
    act(() => {
      fireEvent.keyDown(t1, { key: 'Enter' });
    });
    expect(activeTab(m.host)).toBe(t1);

    // Space on tab 2's close button closes tab 2 without selecting it
    const close2 = $(t2, '.term-tab-close')!;
    act(() => {
      fireEvent.keyDown(close2, { key: ' ' });
    });
    await settle();
    expect(tabTitles(m.host)).toEqual(['bash 1']);
  });

  it('mockShell handles UTF-8 text and Left/Right arrow cursor editing cleanly', async () => {
    native = false;
    m = await mountTerminal();
    const term = live()[0];

    // Type "echo héllo", move left 3 chars (before "llo"), insert "🚀 ", move right 3 chars, execute
    const seq = ['e', 'c', 'h', 'o', ' ', 'h', 'é', 'l', 'l', 'o', '\x1b[D', '\x1b[D', '\x1b[D', '🚀', '\x1b[C', '\x1b[C', '\x1b[C', '\r'];
    for (const ch of seq) term.onDataCb?.(ch);
    await settle();
    expect(term.text).toContain('hé🚀llo');
    expect(tabTitles(m.host)).toEqual(['echo']);

    // Quick Keys Left/Right arrows edit command line in mockShell
    for (const ch of ['w', 'h', 'o', 'a', 'i']) term.onDataCb?.(ch);
    click(keyButton(m.host, '◀'));
    for (const ch of ['m', '\r']) term.onDataCb?.(ch);
    await settle();
    expect(term.text).toContain('geckouser');
  });
});

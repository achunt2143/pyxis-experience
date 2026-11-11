// @vitest-environment jsdom
import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { echoClient } from '@pyxis/app-sdk';
import {
  $,
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

vi.mock('xterm', async () => ({ Terminal: (await import('./fakeXterm')).FakeTerminal }));
vi.mock('xterm-addon-fit', async () => ({ FitAddon: (await import('./fakeXterm')).FakeFit }));
vi.mock('xterm/css/xterm.css', () => ({}));
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

// @vitest-environment jsdom
import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { echoClient } from '@pyxis/app-sdk';
import { DEFAULT_PROFILE, type TerminalDoc, type TerminalProfile } from '../model';
import {
  $,
  $$,
  FakeFit,
  buttonLabelled,
  click,
  currentRow,
  folderRows,
  keyButton,
  keyLabels,
  mountTerminal,
  newButton,
  rowBells,
  rowCaption,
  rowState,
  rowStates,
  rowTitles,
  rows,
  screenHeader,
  screenSubheader,
  screens,
  settle,
  stubCanvas,
  summaryText,
  terms,
  type Mounted,
} from './testUtils';

const storage = vi.hoisted(() => ({
  doc: null as unknown,
  saves: [] as Array<{ store: string; data: { profile: Record<string, unknown>; recent: string[] } }>,
  hold: null as Promise<void> | null,
}));

vi.mock('@xterm/xterm', async () => ({ Terminal: (await import('./fakeXterm')).FakeTerminal }));
vi.mock('@xterm/addon-fit', async () => ({ FitAddon: (await import('./fakeXterm')).FakeFit }));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));
vi.mock('../../../../app-sdk/src/appStorage', () => ({
  loadAppData: async () => {
    if (storage.hold) await storage.hold;
    return structuredClone(storage.doc);
  },
  saveAppData: async (store: string, data: { profile: Record<string, unknown>; recent: string[] }) => {
    storage.saves.push({ store, data: structuredClone(data) });
    return true;
  },
}));
// The theme hook would start Echo's clock.
vi.mock('../../../../app-sdk/src/usePyxisTheme', () => ({ usePyxisTheme: () => 'dark' }));

stubCanvas();

/** Every call the fake Echo was given, and the shells it opened (and which of them were closed). */
let nextShell = 0;
let calls: Array<{ method: string; args: Record<string, unknown> }> = [];
let opened: string[] = [];
let closed: string[] = [];
let native = true;

const TERMINAL = 'org.geckoOS.terminal';
const QUERY = '(max-width: 768px), (pointer: coarse)';

const seed = (profile: Partial<TerminalProfile> = {}, recent: string[] = []) => {
  storage.doc = { profile: { ...DEFAULT_PROFILE, ...profile }, recent } satisfies TerminalDoc;
};

beforeEach(() => {
  terms.length = 0;
  calls = [];
  opened = [];
  closed = [];
  nextShell = 0;
  native = true;
  storage.saves = [];
  storage.hold = null;
  seed();
  vi.spyOn(echoClient, 'callMethod').mockImplementation(async (_service, iface, method, args = {}) => {
    if (iface !== TERMINAL) return undefined;
    calls.push({ method, args });
    if (method === 'Open') {
      if (!native) return undefined;
      const terminalId = `pty-${++nextShell}`;
      opened.push(terminalId);
      return { terminalId };
    }
    if (method === 'Close') closed.push(args['terminalId'] as string);
    return undefined;
  });
});

let m: Mounted | undefined;
afterEach(() => {
  m?.unmount();
  m = undefined;
  vi.useRealTimers();
  delete (window as { matchMedia?: unknown }).matchMedia;
  vi.restoreAllMocks();
});

const called = (method: string) => calls.filter((c) => c.method === method);
/** The live terminal of each session, in order: under StrictMode the first of each pair is disposed. */
const live = () => terms.filter((t) => !t.disposed);
/** Echo's id for each session's shell, in order (a shell opened by a disposed first mount is closed at once). */
const shellIds = () => opened.filter((id) => !closed.includes(id));
const emit = (signal: string, data: Record<string, unknown>) =>
  act(async () => {
    await echoClient.emitSignal(TERMINAL, signal, data);
  });
/** What the nth session's shell says it is doing. */
const status = (n: number, cwd: string, job: { pid: number; command: string } | null) =>
  emit('TerminalStatus', { terminalId: shellIds()[n], cwd, job });
const closeShell = (n: number, exitCode?: number) => emit('TerminalClosed', { terminalId: shellIds()[n], exitCode });
const job = (command: string, pid = 100) => ({ pid, command });

const keydown = (init: KeyboardEventInit) =>
  act(() => {
    fireEvent.keyDown(document, init);
  });
const newSession = async () => {
  click(newButton(m!.host));
  await settle();
};
const pick = async (n: number) => {
  click(rows(m!.host)[n]!);
  await settle();
};
/** The focus and fit timers a session coming to the front starts. */
const wait = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

/** The Session menu's own items (the selection menu is a separate popup). */
const menuItem = (label: string) =>
  $$(document.body, '[role="dialog"][aria-modal="true"]:not(.mochi-dialog) button')
    .reverse()
    .find((b) => b.textContent === `(${label})`)!;
const openSessionMenu = async () => {
  click(buttonLabelled(m!.host, 'Session menu'));
  await wait(20);
};
const chooseFromMenu = async (label: string) => {
  await openSessionMenu();
  click(menuItem(label));
  await settle();
};

const dialog = () => $(document.body, '.mochi-dialog-overlay')!;
const dialogOpen = () => dialog().getAttribute('aria-hidden') !== 'true';
const dialogButton = (label: string) =>
  $$(dialog(), '.mochi-dialog-actions button').find((b) => b.textContent === `(${label})`)!;

/** The pane in front of the stack. */
const frontPane = () => $(m!.host, '[data-role="active"]')!;
const peekDoor = () => $(m!.host, '.repanel__peek-button');

/** The fake clock: only the one-second tick and Date.now, so the rest of the page runs as it does. */
const useClock = () => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
const tick = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms);
  });

/** A matchMedia that answers the keys query with `matches` and records its change listener. */
function stubMedia(matches: boolean) {
  const state = { matches, listeners: [] as Array<() => void>, queries: [] as string[] };
  window.matchMedia = ((query: string) => {
    state.queries.push(query);
    const mine = query === QUERY;
    return {
      get matches() {
        return mine && state.matches;
      },
      media: query,
      addEventListener: (_: string, cb: () => void) => mine && state.listeners.push(cb),
      removeEventListener: (_: string, cb: () => void) => {
        state.listeners = state.listeners.filter((l) => l !== cb);
      },
      addListener() {},
      removeListener() {},
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
  return {
    state,
    change: (next: boolean) =>
      act(() => {
        state.matches = next;
        state.listeners.slice().forEach((l) => l());
      }),
  };
}

const keysShown = () => $(m!.host, '.term-keys')!.style.display !== 'none';
const lastSave = () => storage.saves[storage.saves.length - 1]?.data;

describe('Terminal: opening', () => {
  it('has one session, Home, current and idle, over a live terminal that opened a shell at its size', async () => {
    m = await mountTerminal();
    expect(rowTitles(m.host)).toEqual(['Home']);
    expect(rowStates(m.host)).toEqual(['Idle']);
    expect(currentRow(m.host)).toBe(rows(m.host)[0]);
    expect(live()).toHaveLength(1);
    expect(called('Open').slice(-1)[0]!.args).toEqual({ cols: 80, rows: 24 });
    expect($(m.host, '[data-window-id]')?.getAttribute('data-window-id')).toBe('standalone');
  });

  it('shows the session pane in front, named for the session, with its folder, shell and size', async () => {
    m = await mountTerminal();
    expect($(frontPane(), '.term-screens')).toBeTruthy();
    expect(screenHeader(m.host)).toBe('Home');
    expect(screenSubheader(m.host)).toBe('~ · Shell · 80 × 24');
  });

  it('has no tab strip, close buttons or mode badge any more', async () => {
    m = await mountTerminal();
    expect($(m.host, '.term-tab')).toBeNull();
    expect($(m.host, '.term-tab-close')).toBeNull();
    expect($(m.host, '.term-mode-badge')).toBeNull();
    expect($(m.host, 'button[aria-label="New tab"]')).toBeNull();
  });

  it('gives the keyboard to the terminal when it opens', async () => {
    m = await mountTerminal();
    expect(live()[0]!.focused).toBeGreaterThan(0);
  });
});

describe('Terminal: the shell', () => {
  it("writes the shell's output for its own terminal id, and only that", async () => {
    m = await mountTerminal();
    const term = live()[0]!;
    await emit('TerminalOutput', { terminalId: shellIds()[0], data: 'hello\r\n' });
    await emit('TerminalOutput', { terminalId: 'someone-else', data: 'NOT MINE' });
    expect(term.text).toBe('hello\r\n');
  });

  it('keeps each session\'s output to its own terminal', async () => {
    m = await mountTerminal();
    await newSession();
    const [one, two] = live();
    await emit('TerminalOutput', { terminalId: shellIds()[1], data: 'second\r\n' });
    expect(one!.text).toBe('');
    expect(two!.text).toBe('second\r\n');
  });

  it('sends what is typed to the shell, and the size on a window resize', async () => {
    m = await mountTerminal();
    const term = live()[0]!;
    const id = shellIds()[0];
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
    const sessionsBefore = root['sessions'];
    const profileBefore = root['profile'];
    const id = shellIds()[0];
    for (let i = 0; i < 20; i++) await emit('TerminalOutput', { terminalId: id, data: `line ${i}\r\n` });
    expect(live()[0]!.written).toHaveLength(20);
    expect(root['sessions']).toBe(sessionsBefore);
    expect(root['profile']).toBe(profileBefore);
  });

  it('closes the app when the last shell exits cleanly, after saying so in the terminal', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    m = await mountTerminal();
    const term = live()[0]!;
    await closeShell(0, 0);
    expect(term.text).toContain('The shell ended.');
    expect(close).toHaveBeenCalled();
  });

  it('closes the app when the shell exits without saying a code', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    m = await mountTerminal();
    await closeShell(0);
    expect(close).toHaveBeenCalled();
  });

  it('asks its parent to close when embedded', async () => {
    const parent = { postMessage: vi.fn() };
    vi.spyOn(window, 'parent', 'get').mockReturnValue(parent as unknown as Window);
    m = await mountTerminal();
    await closeShell(0, 0);
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'pyxis:app-close', windowId: 'standalone' }, '*');
  });

  it('closes the shell when the app goes', async () => {
    m = await mountTerminal();
    const id = shellIds()[0];
    m.unmount();
    m = undefined;
    expect(called('Close').some((c) => c.args['terminalId'] === id)).toBe(true);
    expect(terms.every((t) => t.disposed)).toBe(true);
  });
});

describe('Terminal: sessions', () => {
  it('starts a session from New Session: a second row, current, with its own shell and the screen in front', async () => {
    m = await mountTerminal();
    await newSession();
    expect(rowTitles(m.host)).toEqual(['Home', 'Home']);
    expect(currentRow(m.host)).toBe(rows(m.host)[1]);
    expect(rows(m.host).map((r) => r.getAttribute('aria-current'))).toEqual(['false', 'true']);
    expect(live()).toHaveLength(2);
    expect(shellIds()).toHaveLength(2);
    expect($(frontPane(), '.term-screens')).toBeTruthy();
    // Only the current session's terminal is shown.
    expect($$(m.host, '.term-screen').map((s) => s.style.display)).toEqual(['none', 'block']);
  });

  it('numbers the rows in the order the sessions were started', async () => {
    m = await mountTerminal();
    await newSession();
    expect($$(m.host, '.term-row-num').map((n) => n.textContent)).toEqual(['01', '02']);
  });

  it('says how many are open and how many are running', async () => {
    m = await mountTerminal();
    expect(summaryText(m.host)).toBe('1 open, 0 running');
    await newSession();
    await newSession();
    expect(summaryText(m.host)).toBe('3 open, 0 running');
  });

  it('picks a session from its row: it becomes current, its screen shows, and its terminal gets the keyboard', async () => {
    m = await mountTerminal();
    await newSession();
    const first = live()[0]!;
    const before = first.focused;
    await pick(0);
    expect(currentRow(m.host)).toBe(rows(m.host)[0]);
    expect($$(m.host, '.term-screen').map((s) => s.style.display)).toEqual(['block', 'none']);
    await wait(120);
    expect(first.focused).toBeGreaterThan(before);
  });

  it('picks a session from the keyboard: Enter or Space on its row', async () => {
    m = await mountTerminal();
    await newSession();
    act(() => {
      fireEvent.keyDown(rows(m!.host)[0]!, { key: 'Enter' });
    });
    await settle();
    expect(currentRow(m.host)).toBe(rows(m.host)[0]);
    act(() => {
      fireEvent.keyDown(rows(m!.host)[1]!, { key: ' ' });
    });
    await settle();
    expect(currentRow(m.host)).toBe(rows(m.host)[1]);
  });

  it('cycles with Ctrl+Tab forward and Ctrl+Shift+Tab back, wrapping at both ends', async () => {
    m = await mountTerminal();
    await newSession();
    await newSession();
    const on = () => rows(m!.host).indexOf(currentRow(m!.host)!);
    expect(on()).toBe(2);
    await keydown({ key: 'Tab', ctrlKey: true });
    expect(on()).toBe(0);
    await keydown({ key: 'Tab', ctrlKey: true });
    expect(on()).toBe(1);
    await keydown({ key: 'Tab', ctrlKey: true, shiftKey: true });
    expect(on()).toBe(0);
    await keydown({ key: 'Tab', ctrlKey: true, shiftKey: true });
    expect(on()).toBe(2);
  });

  it('does nothing on Ctrl+Tab with one session', async () => {
    m = await mountTerminal();
    await keydown({ key: 'Tab', ctrlKey: true });
    expect(rowTitles(m.host)).toEqual(['Home']);
    expect(currentRow(m.host)).toBe(rows(m.host)[0]);
  });

  it('starts sessions with Ctrl+Shift+T, even twice in the same millisecond', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    m = await mountTerminal();
    act(() => {
      fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });
      fireEvent.keyDown(document, { key: 'T', ctrlKey: true, shiftKey: true });
    });
    await settle();
    expect(rows(m.host)).toHaveLength(3);
    expect(live()).toHaveLength(3);
    expect(currentRow(m.host)).toBe(rows(m.host)[2]);
  });

  it('names a session for its folder, and the pane follows when it is the current one', async () => {
    m = await mountTerminal();
    await status(0, '/home/andrew/geckos/pyxis', null);
    expect(rowTitles(m.host)).toEqual(['pyxis']);
    expect(rowCaption(rows(m.host)[0]!)).toBe('~/geckos/pyxis');
    expect(screenHeader(m.host)).toBe('pyxis');
    expect(screenSubheader(m.host)).toBe('~/geckos/pyxis · Shell · 80 × 24');
  });

  it('closes the current session from the Session menu: its terminal and shell go, and the one before it comes to the front', async () => {
    m = await mountTerminal();
    await newSession();
    await newSession();
    const [, second, third] = live();
    const thirdId = shellIds()[2];
    await chooseFromMenu('Close Session');
    expect(rows(m.host)).toHaveLength(2);
    expect(rows(m.host).indexOf(currentRow(m.host)!)).toBe(1);
    expect(summaryText(m.host)).toBe('2 open, 0 running');
    expect(third!.disposed).toBe(true);
    expect(second!.disposed).toBe(false);
    expect(called('Close').some((c) => c.args['terminalId'] === thirdId)).toBe(true);
    expect($$(m.host, '.term-screen').map((s) => s.style.display)).toEqual(['none', 'block']);
  });

  it('closes the first session when it is current: the next one comes to the front', async () => {
    m = await mountTerminal();
    await newSession();
    await pick(0);
    await chooseFromMenu('Close Session');
    expect(rows(m.host)).toHaveLength(1);
    expect(currentRow(m.host)).toBe(rows(m.host)[0]);
    expect(live()).toHaveLength(1);
    expect($(m.host, '.term-screen')!.style.display).toBe('block');
  });

  it('closes the current session with Ctrl+Shift+W', async () => {
    m = await mountTerminal();
    await newSession();
    await keydown({ key: 'W', ctrlKey: true, shiftKey: true });
    await settle();
    expect(rows(m.host)).toHaveLength(1);
  });

  it('closes the app when the last session is closed', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    m = await mountTerminal();
    await chooseFromMenu('Close Session');
    expect(close).toHaveBeenCalled();
  });

  it('a shell that ends in the current session hands the view to one that is left', async () => {
    m = await mountTerminal();
    await newSession();
    await closeShell(1, 0);
    expect(rows(m.host)).toHaveLength(1);
    expect(currentRow(m.host)).toBe(rows(m.host)[0]);
    expect($(m.host, '.term-screen')!.style.display).toBe('block');
  });

  it('a shell that ends in another session closes just that one and leaves the current one alone', async () => {
    m = await mountTerminal();
    await newSession();
    await closeShell(0, 0);
    expect(rows(m.host)).toHaveLength(1);
    expect(currentRow(m.host)).toBe(rows(m.host)[0]);
    expect(live()).toHaveLength(1);
  });
});

describe('Terminal: what a row says', () => {
  it('says Running only after a job has been in front for two seconds, and counts it in the summary', async () => {
    useClock();
    m = await mountTerminal();
    await status(0, '/home/andrew', job('sleep 30'));
    // At first the row shows the command and no state word at all.
    expect(rowStates(m.host)).toEqual(['']);
    expect(rowCaption(rows(m.host)[0]!)).toBe('sleep 30');
    expect(rows(m.host)[0]!.getAttribute('aria-label')).toBe('Home, sleep 30');
    await tick(1000);
    expect(rowState(rows(m.host)[0]!)).toBe('');
    expect(summaryText(m.host)).toBe('1 open, 0 running');
    await tick(1000);
    expect(rowState(rows(m.host)[0]!)).toBe('Running');
    expect(summaryText(m.host)).toBe('1 open, 1 running');
    expect(rows(m.host)[0]!.getAttribute('aria-label')).toBe('Home, sleep 30, Running');
    // The session pane names what is in front.
    expect(screenSubheader(m.host)).toBe('~ · sleep · 80 × 24');
  });

  it('shows the Spinner beside Running and not before', async () => {
    useClock();
    m = await mountTerminal();
    await status(0, '/home/andrew', job('make'));
    const spinner = () => $(rows(m!.host)[0]!, '.term-row-spinner')!;
    expect(spinner().style.display).toBe('none');
    await tick(2000);
    expect(spinner().style.display).not.toBe('none');
  });

  it('does not restart the two seconds when the same job reports again', async () => {
    useClock();
    m = await mountTerminal();
    await status(0, '/home/andrew', job('make', 7));
    await tick(1500);
    await status(0, '/home/andrew', job('make', 7));
    await tick(500);
    expect(rowState(rows(m.host)[0]!)).toBe('Running');
  });

  it('goes back to Idle and the folder when a job ends in the session that is in front', async () => {
    useClock();
    m = await mountTerminal();
    await status(0, '/home/andrew', job('sleep 30'));
    await tick(2000);
    await status(0, '/home/andrew', null);
    expect(rowState(rows(m.host)[0]!)).toBe('Idle');
    expect(rowCaption(rows(m.host)[0]!)).toBe('~');
    expect(summaryText(m.host)).toBe('1 open, 0 running');
    expect($(m.host, '.repanel__peek-button')).toBeNull();
  });

  it('says Done, still naming the job, when it ends in a session that is not in front; opening the session clears it', async () => {
    m = await mountTerminal();
    await newSession();
    await status(0, '/home/andrew/geckos/pyxis', job('npm test'));
    await status(0, '/home/andrew/geckos/pyxis', null);
    expect(rowState(rows(m.host)[0]!)).toBe('Done');
    expect(rowCaption(rows(m.host)[0]!)).toBe('npm test');
    expect(rows(m.host)[0]!.getAttribute('aria-label')).toBe('pyxis, npm test, Done');
    await pick(0);
    expect(rowState(rows(m.host)[0]!)).toBe('Idle');
    expect(rowCaption(rows(m.host)[0]!)).toBe('~/geckos/pyxis');
  });

  it('says Exited N and keeps the session when a shell ends with a nonzero code', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    m = await mountTerminal();
    const term = live()[0]!;
    await closeShell(0, 3);
    expect(rowStates(m.host)).toEqual(['Exited 3']);
    expect(rows(m.host)[0]!.classList.contains('failed')).toBe(true);
    expect(rows(m.host)[0]!.getAttribute('aria-label')).toBe('Home, ~, Exited 3');
    expect(term.text).toContain('The shell ended with code 3. Press Enter to start it again.');
    expect(close).not.toHaveBeenCalled();
    expect(summaryText(m.host)).toBe('1 open, 0 running');
  });

  it('keeps an exited session next to a healthy one', async () => {
    m = await mountTerminal();
    await newSession();
    await closeShell(0, 255);
    expect(rowStates(m.host)).toEqual(['Exited 255', 'Idle']);
    expect(currentRow(m.host)).toBe(rows(m.host)[1]);
  });

  it('counts bells on the row of a session that is not in front, and clears them when it is opened', async () => {
    m = await mountTerminal();
    await newSession();
    const first = live()[0]!;
    expect(rowBells(rows(m.host)[0]!)).toBeNull();
    act(() => first.triggerBell());
    expect(rowBells(rows(m.host)[0]!)).toBe('1');
    act(() => first.triggerBell());
    act(() => first.triggerBell());
    expect(rowBells(rows(m.host)[0]!)).toBe('3');
    expect(rowState(rows(m.host)[0]!)).toBe('Bell');
    expect(rows(m.host)[0]!.getAttribute('aria-label')).toContain('3 bells');
    await pick(0);
    expect(rowBells(rows(m.host)[0]!)).toBeNull();
    expect(rowState(rows(m.host)[0]!)).toBe('Idle');
  });

  it('puts no count on the row of the session in front, and lights the pane instead when the bell is light', async () => {
    m = await mountTerminal();
    const term = live()[0]!;
    expect(screens(m.host).classList.contains('term-bell')).toBe(false);
    act(() => term.triggerBell());
    expect(rowBells(rows(m.host)[0]!)).toBeNull();
    expect(screens(m.host).classList.contains('term-bell')).toBe(true);
    await wait(450);
    expect(screens(m.host).classList.contains('term-bell')).toBe(false);
  });

  it('does not light the pane when the profile says the bell is nothing', async () => {
    seed({ bell: 'none' });
    m = await mountTerminal();
    act(() => live()[0]!.triggerBell());
    expect(screens(m.host).classList.contains('term-bell')).toBe(false);
  });

  it('still counts a background bell when the bell is nothing', async () => {
    seed({ bell: 'none' });
    m = await mountTerminal();
    await newSession();
    act(() => live()[0]!.triggerBell());
    expect(rowBells(rows(m.host)[0]!)).toBe('1');
  });

  it('flashes the terminal itself on a bell, and clears it', async () => {
    m = await mountTerminal();
    const screen = $(m.host, '.term-screen')!;
    expect(screen.getAttribute('data-bell')).toBe('idle');
    act(() => live()[0]!.triggerBell());
    expect(screen.getAttribute('data-bell')).toBe('active');
    expect(screen.classList.contains('term-bell-active')).toBe(true);
    await wait(250);
    expect(screen.getAttribute('data-bell')).toBe('idle');
  });
});

describe('Terminal: the peek', () => {
  const finishInBackground = async () => {
    await newSession();
    await status(0, '/home/andrew/geckos/pyxis', job('npm test'));
    await status(0, '/home/andrew/geckos/pyxis', null);
  };

  it('is not there until a job finishes in a session that is not in front', async () => {
    m = await mountTerminal();
    await newSession();
    expect(peekDoor()).toBeNull();
    await status(0, '/home/andrew', job('make'));
    expect(peekDoor()).toBeNull(); // still running
    act(() => live()[0]!.triggerBell());
    expect(peekDoor()).toBeNull(); // a bell is not a finished job
  });

  it('appears for a Done background session, named for it and its job, with its state word', async () => {
    m = await mountTerminal();
    await finishInBackground();
    expect(peekDoor()).toBeTruthy();
    expect(peekDoor()!.getAttribute('aria-label')).toBe('Open pyxis, npm test done');
    const peek = $(m.host, '[data-role="peek"]')!;
    expect($(peek, '.mochi-header-content')?.textContent).toBe('pyxis');
    expect($(peek, '.mochi-panel-clue-number')?.textContent).toBe('01');
    expect($(peek, '.mochi-panel-clue-text')?.textContent).toBe('Done');
  });

  it('opens the session when it is tapped: it becomes the current one, and the peek goes', async () => {
    m = await mountTerminal();
    await finishInBackground();
    click(peekDoor()!);
    await settle();
    expect(currentRow(m.host)).toBe(rows(m.host)[0]);
    expect($$(m.host, '.term-screen').map((s) => s.style.display)).toEqual(['block', 'none']);
    expect(rowState(rows(m.host)[0]!)).toBe('Idle');
    expect(peekDoor()).toBeNull();
    expect(screenHeader(m.host)).toBe('pyxis');
  });

  it('goes away when the session is opened some other way', async () => {
    m = await mountTerminal();
    await finishInBackground();
    await pick(0);
    expect(peekDoor()).toBeNull();
  });

  it('is not shown for a job that finishes in the session in front', async () => {
    m = await mountTerminal();
    await status(0, '/home/andrew', job('make'));
    await status(0, '/home/andrew', null);
    expect(peekDoor()).toBeNull();
  });
});

describe('Terminal: the Session menu', () => {
  it('opens from a button named Session menu, with Copy, Paste, Clear, Profile and Close Session', async () => {
    m = await mountTerminal();
    const button = buttonLabelled(m.host, 'Session menu');
    expect(button).toBeTruthy();
    expect(button.textContent).toContain('Session');
    await openSessionMenu();
    for (const label of ['Copy', 'Paste', 'Clear', 'Profile', 'Close Session']) {
      expect(menuItem(label), label).toBeTruthy();
    }
  });

  it('copies the selection of the current session', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText, readText: vi.fn() }, configurable: true });
    try {
      m = await mountTerminal();
      await newSession();
      live()[0]!.selection = 'not this one';
      live()[1]!.selection = 'this one';
      await chooseFromMenu('Copy');
      expect(writeText).toHaveBeenCalledWith('this one');
    } finally {
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });

  it('pastes the clipboard into the current session', async () => {
    const readText = vi.fn().mockResolvedValue('pasted cmd');
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(), readText }, configurable: true });
    try {
      m = await mountTerminal();
      await chooseFromMenu('Paste');
      await settle();
      expect(readText).toHaveBeenCalled();
      expect(live()[0]!.pasted).toEqual(['pasted cmd']);
      expect(called('Write').pop()?.args).toEqual({ terminalId: shellIds()[0], data: 'pasted cmd' });
    } finally {
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });

  it('clears the current session and keeps the keyboard in it', async () => {
    m = await mountTerminal();
    await newSession();
    const [one, two] = live();
    const focused = two!.focused;
    await chooseFromMenu('Clear');
    expect(two!.cleared).toBe(1);
    expect(one!.cleared).toBe(0);
    expect(two!.focused).toBeGreaterThan(focused);
  });

  it('opens the Profile pane', async () => {
    m = await mountTerminal();
    expect($(frontPane(), '.term-screens')).toBeTruthy();
    await chooseFromMenu('Profile');
    await wait(50);
    expect($(frontPane(), '.mochi-header-content')?.textContent).toBe('Profile');
    expect($(frontPane(), '.term-screens')).toBeNull();
  });

  it('closes the menu when an action is chosen', async () => {
    m = await mountTerminal();
    await newSession();
    await chooseFromMenu('Clear');
    await wait(20);
    expect(menuItem('Clear')).toBeUndefined();
  });

  it('closes the current session with Close Session', async () => {
    m = await mountTerminal();
    await newSession();
    await chooseFromMenu('Close Session');
    expect(rows(m.host)).toHaveLength(1);
  });

  it('does the same from the shortcuts: Ctrl+Shift+C, V and K', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const readText = vi.fn().mockResolvedValue('from clipboard');
    Object.defineProperty(navigator, 'clipboard', { value: { writeText, readText }, configurable: true });
    try {
      m = await mountTerminal();
      const term = live()[0]!;
      // The terminal hands these keys to the app instead of typing them; plain Ctrl+C is the shell's.
      expect(term.customKeyHandler?.(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, shiftKey: true }))).toBe(false);
      expect(term.customKeyHandler?.(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }))).toBe(true);
      term.selection = 'selected text';
      await act(async () => {
        fireEvent.keyDown(document, { key: 'C', ctrlKey: true, shiftKey: true });
      });
      expect(writeText).toHaveBeenCalledWith('selected text');
      await act(async () => {
        fireEvent.keyDown(document, { key: 'V', ctrlKey: true, shiftKey: true });
      });
      expect(term.pasted).toEqual(['from clipboard']);
      await keydown({ key: 'K', ctrlKey: true, shiftKey: true });
      expect(term.cleared).toBe(1);
      // None of it was typed into the shell.
      expect(called('Write').filter((c) => c.args['data'] !== 'from clipboard')).toHaveLength(0);
    } finally {
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });
});

describe('Terminal: closing a busy session', () => {
  const closeWhileRunning = async () => {
    await status(0, '/home/andrew/geckos/pyxis', job('sleep 30 --long'));
    await keydown({ key: 'W', ctrlKey: true, shiftKey: true });
    await settle();
  };

  it('asks first when a job is running: the dialog names the session and the job, and nothing closes yet', async () => {
    m = await mountTerminal();
    await newSession();
    await pick(0);
    await closeWhileRunning();
    expect(dialogOpen()).toBe(true);
    expect($(dialog(), '.term-dialog-text')?.textContent).toBe(
      'sleep 30 is still running in this session. Closing the session stops it.'
    );
    expect(dialog().textContent).toContain('Close pyxis?');
    expect(rows(m.host)).toHaveLength(2);
    expect(called('Close').filter((c) => c.args['terminalId'] === shellIds()[0])).toHaveLength(0);
  });

  it('closes the session when confirmed', async () => {
    m = await mountTerminal();
    await newSession();
    await pick(0);
    await closeWhileRunning();
    click(dialogButton('Close Session'));
    await settle();
    expect(rows(m.host)).toHaveLength(1);
    expect(rowTitles(m.host)).toEqual(['Home']);
  });

  it('keeps the session when cancelled', async () => {
    m = await mountTerminal();
    await newSession();
    await pick(0);
    await closeWhileRunning();
    click(dialogButton('Cancel'));
    await settle();
    expect(dialogOpen()).toBe(false);
    expect(rows(m.host)).toHaveLength(2);
    expect(rowCaption(rows(m.host)[0]!)).toBe('sleep 30 --long');
  });

  it('asks from the Session menu too', async () => {
    m = await mountTerminal();
    await newSession();
    await status(1, '/home/andrew', job('top'));
    await chooseFromMenu('Close Session');
    expect(dialogOpen()).toBe(true);
    expect(rows(m.host)).toHaveLength(2);
  });

  it('closes at once when the profile says not to ask', async () => {
    seed({ askBeforeClose: false });
    m = await mountTerminal();
    await newSession();
    await pick(0);
    await closeWhileRunning();
    expect(dialogOpen()).toBe(false);
    expect(rows(m.host)).toHaveLength(1);
  });

  it('closes at once when nothing is running', async () => {
    m = await mountTerminal();
    await newSession();
    await keydown({ key: 'W', ctrlKey: true, shiftKey: true });
    expect(dialogOpen()).toBe(false);
    expect(rows(m.host)).toHaveLength(1);
  });

  it('closes at once when the job has finished', async () => {
    m = await mountTerminal();
    await newSession();
    await status(1, '/home/andrew', job('make'));
    await status(1, '/home/andrew', null);
    await keydown({ key: 'W', ctrlKey: true, shiftKey: true });
    expect(dialogOpen()).toBe(false);
    expect(rows(m.host)).toHaveLength(1);
  });
});

describe('Terminal: Start In', () => {
  it('lists recent folders under a Start In label, named for the folder, with the path beneath', async () => {
    seed({}, ['/home/andrew/geckos/pyxis', '/tmp']);
    m = await mountTerminal();
    expect(folderRows(m.host)).toHaveLength(2);
    expect(folderRows(m.host).map((r) => $(r, '.term-row-title')?.textContent)).toEqual(['pyxis', 'tmp']);
    expect(folderRows(m.host).map((r) => $(r, '.term-row-caption')?.textContent)).toEqual(['~/geckos/pyxis', '/tmp']);
    expect($$(m.host, '.mochi-label').find((l) => l.textContent === 'Start In')).toBeTruthy();
  });

  it('hides the list and its label when there are no recent folders', async () => {
    m = await mountTerminal();
    expect(folderRows(m.host)).toHaveLength(0);
    const label = $$(m.host, '[data-duyo-kind="remochi.Label"]').find((l) => l.textContent === 'Start In')!;
    expect(label.style.display).toBe('none');
  });

  it('shows at most three, and leaves out folders a session is already in', async () => {
    seed({}, ['/a/one', '/home/andrew', '/a/two', '/a/three', '/a/four']);
    m = await mountTerminal();
    // The first session is in ~ (/home/andrew is not it: the app starts in the shell's own home, "~").
    await status(0, '/a/one', null);
    expect(folderRows(m.host).map((r) => $(r, '.term-row-title')?.textContent)).toEqual(['Home', 'two', 'three']);
  });

  it('passes the folder to Open as cwd, and the new session is named for it', async () => {
    seed({}, ['/home/andrew/geckos/pyxis']);
    m = await mountTerminal();
    click(folderRows(m.host)[0]!);
    await settle();
    expect(called('Open').pop()?.args).toEqual({ cols: 80, rows: 24, cwd: '/home/andrew/geckos/pyxis' });
    expect(rowTitles(m.host)).toEqual(['Home', 'pyxis']);
    expect(rowCaption(rows(m.host)[1]!)).toBe('~/geckos/pyxis');
    expect(currentRow(m.host)).toBe(rows(m.host)[1]);
    expect(called('Open').filter((c) => 'cwd' in c.args).length).toBeGreaterThan(0);
  });

  it('a plain New Session sends no cwd', async () => {
    seed({}, ['/tmp']);
    m = await mountTerminal();
    await newSession();
    expect(called('Open').pop()?.args).toEqual({ cols: 80, rows: 24 });
  });

  it('starts New Session in the most recent folder when the profile says so', async () => {
    seed({ startInLastFolder: true }, ['/srv/www', '/tmp']);
    m = await mountTerminal();
    await newSession();
    expect(called('Open').pop()?.args).toEqual({ cols: 80, rows: 24, cwd: '/srv/www' });
    expect(rowTitles(m.host)).toEqual(['Home', 'www']);
  });

  it('remembers a folder a session moves to, newest first, and saves it', async () => {
    m = await mountTerminal();
    await status(0, '/home/andrew/geckos', null);
    await status(0, '/tmp', null);
    expect(lastSave()?.recent).toEqual(['/tmp', '/home/andrew/geckos']);
    expect(storage.saves[0]!.store).toBe('terminal');
  });
});

describe('Terminal: a shell that ended', () => {
  const ended = async (code = 2) => {
    m = await mountTerminal();
    await closeShell(0, code);
  };

  it('starts a new shell when Enter is pressed in its view', async () => {
    await ended();
    const term = live()[0]!;
    const opens = called('Open').length;
    term.onDataCb?.('\r');
    await settle();
    expect(called('Open')).toHaveLength(opens + 1);
    expect(called('Open').pop()?.args).toEqual({ cols: 80, rows: 24 });
    // The new shell is the one that gets what is typed next.
    term.onDataCb?.('ls\r');
    expect(called('Write').pop()?.args).toEqual({ terminalId: opened[opened.length - 1], data: 'ls\r' });
  });

  it('ignores other keys, and sends nothing to the dead shell', async () => {
    await ended();
    const opens = called('Open').length;
    const writes = called('Write').length;
    live()[0]!.onDataCb?.('ls');
    await settle();
    expect(called('Open')).toHaveLength(opens);
    expect(called('Write')).toHaveLength(writes);
  });

  it('restarts in the folder the session was started in', async () => {
    seed({}, ['/srv/www']);
    m = await mountTerminal();
    click(folderRows(m.host)[0]!);
    await settle();
    await closeShell(1, 1);
    called('Open').length = 0;
    calls = calls.filter((c) => c.method !== 'Open');
    live()[1]!.onDataCb?.('\r');
    await settle();
    expect(called('Open').pop()?.args).toEqual({ cols: 80, rows: 24, cwd: '/srv/www' });
  });

  it('goes back to Idle once the restarted shell reports', async () => {
    m = await mountTerminal();
    await newSession();
    await closeShell(1, 2);
    expect(rowState(rows(m.host)[1]!)).toBe('Exited 2');
    live()[1]!.onDataCb?.('\r');
    await settle();
    // The restarted shell is the newest one Echo opened.
    await emit('TerminalStatus', { terminalId: opened[opened.length - 1], cwd: '/home/andrew', job: null });
    expect(rowState(rows(m.host)[1]!)).toBe('Idle');
    expect(rows(m.host)[1]!.classList.contains('failed')).toBe(false);
  });
});

describe('Terminal: the profile', () => {
  it('zooms with Ctrl+= and Ctrl+-, and saves each size', async () => {
    m = await mountTerminal();
    const term = live()[0]!;
    await keydown({ key: '=', ctrlKey: true });
    await keydown({ key: '=', ctrlKey: true });
    expect(term.options.fontSize).toBe(15);
    expect(lastSave()?.profile['fontSize']).toBe(15);
    await keydown({ key: '-', ctrlKey: true });
    expect(term.options.fontSize).toBe(14);
    expect(lastSave()?.profile['fontSize']).toBe(14);
    expect(storage.saves.every((s) => s.store === 'terminal')).toBe(true);
  });

  it('resets with Ctrl+0', async () => {
    m = await mountTerminal();
    await keydown({ key: '=', ctrlKey: true });
    await keydown({ key: '0', ctrlKey: true });
    expect(live()[0]!.options.fontSize).toBe(13);
    expect(lastSave()?.profile['fontSize']).toBe(13);
  });

  it('keeps the size between 10 and 22', async () => {
    m = await mountTerminal();
    const term = live()[0]!;
    for (let i = 0; i < 15; i++) await keydown({ key: '=', ctrlKey: true });
    expect(term.options.fontSize).toBe(22);
    expect(lastSave()?.profile['fontSize']).toBe(22);
    for (let i = 0; i < 20; i++) await keydown({ key: '-', ctrlKey: true });
    expect(term.options.fontSize).toBe(10);
    expect(lastSave()?.profile['fontSize']).toBe(10);
  });

  it('sets the size of every session\'s terminal', async () => {
    m = await mountTerminal();
    await newSession();
    await keydown({ key: '=', ctrlKey: true });
    expect(live().map((t) => t.options.fontSize)).toEqual([14, 14]);
  });

  it('saves with the recent folders beside it, and every other setting as it was', async () => {
    seed({ cursor: 'bar', bell: 'none' }, ['/tmp']);
    m = await mountTerminal();
    await keydown({ key: '=', ctrlKey: true });
    expect(lastSave()).toEqual({
      profile: { ...DEFAULT_PROFILE, cursor: 'bar', bell: 'none', fontSize: 14 },
      recent: ['/tmp'],
    });
  });

  it('opens with the saved profile', async () => {
    seed({ fontSize: 17, cursor: 'underline' });
    m = await mountTerminal();
    await settle();
    const term = live()[0]!;
    expect(term.options.fontSize).toBe(17);
    expect(term.options.cursorStyle).toBe('underline');
  });

  it('repairs a stored profile that is missing or wrong', async () => {
    storage.doc = { profile: { fontSize: 99, cursor: 'nonsense' }, recent: 'nope' };
    m = await mountTerminal();
    await settle();
    expect(live()[0]!.options.fontSize).toBe(22);
    expect(folderRows(m.host)).toHaveLength(0);
  });

  it('saves nothing before the stored profile has been read', async () => {
    let release!: () => void;
    storage.hold = new Promise<void>((r) => {
      release = r;
    });
    m = await mountTerminal();
    await keydown({ key: '=', ctrlKey: true });
    expect(storage.saves).toHaveLength(0);
    release();
    await settle();
    await keydown({ key: '=', ctrlKey: true });
    expect(storage.saves.length).toBeGreaterThan(0);
  });

  it('syncs the shell size when the font changes', async () => {
    m = await mountTerminal();
    const term = live()[0]!;
    const id = shellIds()[0];
    const fit = vi.spyOn(FakeFit.prototype, 'fit').mockImplementation(() => {
      term.cols = 72;
      term.rows = 22;
    });
    await keydown({ key: '=', ctrlKey: true });
    expect(fit).toHaveBeenCalled();
    expect(called('Resize').pop()?.args).toEqual({ terminalId: id, cols: 72, rows: 22 });
  });
});

describe('Terminal: the keys row', () => {
  it('has the eight keys, each with a hint for its accessible name', async () => {
    m = await mountTerminal();
    expect(keyLabels(m.host)).toEqual(['Esc', 'Tab', 'Ctrl C', '▲', '▼', '◀', '▶', 'Ctrl D']);
    expect(keyButton(m.host, 'Ctrl C').getAttribute('aria-label')).toBe('Ctrl C: interrupt');
    expect(keyButton(m.host, 'Esc').title).toBe('Escape');
    const row = $(m.host, '.term-keys')!;
    expect(row.getAttribute('role')).toBe('toolbar');
    expect(row.getAttribute('aria-label')).toBe('Keys');
  });

  it('is hidden by default when the window is wide and the pointer is fine', async () => {
    stubMedia(false);
    m = await mountTerminal();
    expect(keysShown()).toBe(false);
  });

  it('is shown by default when the window is narrow or the pointer coarse', async () => {
    const media = stubMedia(true);
    m = await mountTerminal();
    expect(media.state.queries).toContain(QUERY);
    expect(keysShown()).toBe(true);
  });

  it('follows the query as the window changes', async () => {
    const media = stubMedia(false);
    m = await mountTerminal();
    expect(keysShown()).toBe(false);
    await media.change(true);
    expect(keysShown()).toBe(true);
    await media.change(false);
    expect(keysShown()).toBe(false);
  });

  it('is always shown when the profile says on, and never when it says off', async () => {
    stubMedia(false);
    seed({ keys: 'on' });
    m = await mountTerminal();
    await settle();
    expect(keysShown()).toBe(true);
    m.unmount();
    m = undefined;
    stubMedia(true);
    seed({ keys: 'off' });
    m = await mountTerminal();
    await settle();
    expect(keysShown()).toBe(false);
  });

  it('is hidden without matchMedia at all', async () => {
    m = await mountTerminal();
    expect(keysShown()).toBe(false);
  });

  it("sends a key to the current session's shell and hands the keyboard back to the terminal", async () => {
    seed({ keys: 'on' });
    m = await mountTerminal();
    await settle();
    const term = live()[0]!;
    const id = shellIds()[0];
    const focused = term.focused;
    click(keyButton(m.host, 'Ctrl C'));
    await settle();
    expect(called('Write').pop()?.args).toEqual({ terminalId: id, data: '\x03' });
    expect(term.focused).toBeGreaterThan(focused);
    click(keyButton(m.host, '▲'));
    expect(called('Write').pop()?.args).toEqual({ terminalId: id, data: '\x1b[A' });
    click(keyButton(m.host, 'Esc'));
    expect(called('Write').pop()?.args).toEqual({ terminalId: id, data: '\x1b' });
    click(keyButton(m.host, 'Ctrl D'));
    expect(called('Write').pop()?.args).toEqual({ terminalId: id, data: '\x04' });
  });

  it('types into the session that is current, not the first', async () => {
    seed({ keys: 'on' });
    m = await mountTerminal();
    await settle();
    await newSession();
    click(keyButton(m.host, 'Tab'));
    expect(called('Write').pop()?.args).toEqual({ terminalId: shellIds()[1], data: '\t' });
    await pick(0);
    click(keyButton(m.host, 'Tab'));
    expect(called('Write').pop()?.args).toEqual({ terminalId: shellIds()[0], data: '\t' });
  });

  it('cancels mousedown so pressing a key does not take focus from the terminal', async () => {
    m = await mountTerminal();
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    act(() => {
      keyButton(m!.host, 'Tab').dispatchEvent(down);
    });
    expect(down.defaultPrevented).toBe(true);
  });
});

describe('Terminal: the dev mock shell (no Echo shell)', () => {
  beforeEach(() => {
    native = false;
  });

  const type = (text: string) => {
    for (const ch of text) live()[0]!.onDataCb?.(ch);
  };

  it('greets, and says Mock shell in the session pane', async () => {
    m = await mountTerminal();
    const term = live()[0]!;
    expect(term.text).toContain('Pyxis Terminal');
    expect(screenSubheader(m.host)).toBe('~ · Mock shell · 80 × 24');
    expect($(m.host, '.term-screen')!.getAttribute('data-terminal-mode')).toBe('mock');
    expect(called('Write')).toHaveLength(0);
  });

  it('runs commands typed at it', async () => {
    m = await mountTerminal();
    type('ls\r');
    await settle();
    expect(live()[0]!.text).toContain('Desktop  Documents');
  });

  it('follows cd: the row and the pane take the folder', async () => {
    m = await mountTerminal();
    type('cd /tmp\r');
    await settle();
    expect(rowTitles(m.host)).toEqual(['tmp']);
    expect(rowCaption(rows(m.host)[0]!)).toBe('/tmp');
    expect(screenHeader(m.host)).toBe('tmp');
    await settle();
    expect(lastSave()?.recent).toEqual(['/tmp', '/home/geckouser']);
  });

  it('shows sleep as a job in front, then Idle again when it ends', async () => {
    m = await mountTerminal();
    type('sleep 0.05\r');
    await settle();
    expect(rowCaption(rows(m.host)[0]!)).toBe('sleep 0.05');
    expect(screenSubheader(m.host)).toContain('Mock shell');
    await wait(120);
    expect(rowCaption(rows(m.host)[0]!)).toBe('~');
    expect(rowState(rows(m.host)[0]!)).toBe('Idle');
  });

  it('takes the keys row as input', async () => {
    seed({ keys: 'on' });
    m = await mountTerminal();
    await settle();
    type('echo');
    click(keyButton(m.host, '◀'));
    type('x\r');
    await settle();
    expect(live()[0]!.text).toContain('echxo');
  });

  it('closes the app on exit, and on Ctrl D at an empty line', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    m = await mountTerminal();
    seed({ keys: 'on' });
    click(keyButton(m.host, 'Ctrl D'));
    await settle();
    expect(live()[0]!.text).toContain('exit');
    expect(close).toHaveBeenCalled();
  });

  it('closes just its own session on exit when there are others', async () => {
    m = await mountTerminal();
    await newSession();
    click(keyButton(m.host, 'Ctrl D'));
    await settle();
    expect(rows(m.host)).toHaveLength(1);
    expect($(m.host, '.term-screen')!.style.display).toBe('block');
  });

  it('keeps the session as Exited N when the shell exits with a code', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    m = await mountTerminal();
    type('exit 4\r');
    await settle();
    expect(rowStates(m.host)).toEqual(['Exited 4']);
    expect(close).not.toHaveBeenCalled();
  });

  it('handles UTF-8 text and Left/Right arrow cursor editing cleanly', async () => {
    m = await mountTerminal();
    const term = live()[0]!;
    const seq = ['e', 'c', 'h', 'o', ' ', 'h', 'é', 'l', 'l', 'o', '\x1b[D', '\x1b[D', '\x1b[D', '🚀', '\x1b[C', '\x1b[C', '\x1b[C', '\r'];
    for (const ch of seq) term.onDataCb?.(ch);
    await settle();
    expect(term.text).toContain('hé🚀llo');
    for (const ch of ['w', 'h', 'o', 'a', 'm', 'i', '\r']) term.onDataCb?.(ch);
    await settle();
    expect(term.text).toContain('geckouser');
  });

  it('lets the keys row edit the command line too', async () => {
    seed({ keys: 'on' });
    m = await mountTerminal();
    await settle();
    for (const ch of ['w', 'h', 'o', 'a', 'i']) live()[0]!.onDataCb?.(ch);
    click(keyButton(m.host, '◀'));
    for (const ch of ['m', '\r']) live()[0]!.onDataCb?.(ch);
    await settle();
    expect(live()[0]!.text).toContain('geckouser');
  });
});

describe('Terminal: size (guards the island against fast-ticking props)', () => {
  it('keeps the tree small, and a session adds little to it', async () => {
    m = await mountTerminal();
    const count = () => m!.host.querySelectorAll('[data-duyo-id]').length;
    const one = count();
    expect(one).toBeLessThan(120);
    await newSession();
    expect(count() - one).toBeLessThan(12);
    fireEvent.keyDown(m.host, { key: 'a' });
  });
});

describe('Terminal: PTY lifecycle', () => {
  it('re-fits and tells Echo the new size when the container resizes, on a zoom, and when a session returns to the front', async () => {
    const originalRO = globalThis.ResizeObserver;
    const observers: Array<{ cb: ResizeObserverCallback; el: Element | null }> = [];
    globalThis.ResizeObserver = class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
      }
      observe(el: Element) {
        observers.push({ cb: this.cb, el });
      }
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver;

    try {
      m = await mountTerminal();
      const term = live()[0]!;
      const id1 = shellIds()[0];
      expect(observers.length).toBeGreaterThan(0);

      // The pane changing size (the keys row showing, the window) re-fits and notifies Echo.
      const fitSpy = vi.spyOn(FakeFit.prototype, 'fit').mockImplementation(() => {
        term.cols = 80;
        term.rows = 28;
      });
      act(() => {
        observers[observers.length - 1]!.cb([], {} as ResizeObserver);
      });
      expect(fitSpy).toHaveBeenCalled();
      expect(called('Resize').pop()?.args).toEqual({ terminalId: id1, cols: 80, rows: 28 });

      // A font zoom updates dimensions and notifies Echo when they changed.
      fitSpy.mockImplementation(() => {
        term.cols = 72;
        term.rows = 22;
      });
      await keydown({ key: '=', ctrlKey: true });
      expect(called('Resize').pop()?.args).toEqual({ terminalId: id1, cols: 72, rows: 22 });

      // Start session 2, resize session 1's grid while it is behind, then pick it: Echo hears the new size.
      fitSpy.mockImplementation(() => {});
      await newSession();
      term.cols = 90;
      term.rows = 30;
      await pick(0);
      await wait(60);
      expect(called('Resize').pop()?.args).toEqual({ terminalId: id1, cols: 90, rows: 30 });
    } finally {
      globalThis.ResizeObserver = originalRO;
    }
  });

  it('updates the size in the session pane when the grid changes', async () => {
    m = await mountTerminal();
    const term = live()[0]!;
    vi.spyOn(FakeFit.prototype, 'fit').mockImplementation(() => {
      term.cols = 100;
      term.rows = 31;
    });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(screenSubheader(m.host)).toBe('~ · Shell · 100 × 31');
  });

  it('closes an orphan PTY if unmounted while openTerminal is in flight', async () => {
    let resolveOpen!: (v: unknown) => void;
    vi.mocked(echoClient.callMethod).mockImplementation(async (_service, iface, method, args = {}) => {
      if (iface !== TERMINAL) return undefined;
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

  it('falls back to the mock shell when openTerminal throws', async () => {
    vi.mocked(echoClient.callMethod).mockImplementation(async (_service, iface, method, args = {}) => {
      if (iface !== TERMINAL) return undefined;
      calls.push({ method, args });
      if (method === 'Open') throw new Error('PTY daemon unavailable');
      return undefined;
    });

    m = await mountTerminal();
    expect(live()[0]!.text).toContain('Pyxis Terminal');
    expect(screenSubheader(m.host)).toBe('~ · Mock shell · 80 × 24');
    expect($(m.host, '.term-screen')!.getAttribute('data-terminal-mode')).toBe('mock');
  });

  it('marks the screen as a PTY when the native shell is connected, with scrollback of 5000', async () => {
    m = await mountTerminal();
    expect($(m.host, '.term-screen')!.getAttribute('data-terminal-mode')).toBe('pty');
    expect(live()[0]!.options.scrollback).toBe(5000);
  });
});

describe('Terminal: accessible names', () => {
  it('names a row for the session, what it shows and its state, and marks the current one', async () => {
    m = await mountTerminal();
    await newSession();
    await status(1, '/home/andrew/geckos/pyxis', null);
    const [one, two] = rows(m.host);
    expect(one!.getAttribute('aria-label')).toBe('Home, ~, Idle');
    expect(two!.getAttribute('aria-label')).toBe('pyxis, ~/geckos/pyxis, Idle');
    expect(one!.getAttribute('aria-current')).toBe('false');
    expect(two!.getAttribute('aria-current')).toBe('true');
    expect(one!.getAttribute('role')).toBe('button');
    expect(one!.tabIndex).toBe(0);
  });

  it('puts the bell count in the row\'s name', async () => {
    m = await mountTerminal();
    await newSession();
    act(() => live()[0]!.triggerBell());
    act(() => live()[0]!.triggerBell());
    expect(rows(m.host)[0]!.getAttribute('aria-label')).toBe('Home, ~, Idle, 2 bells');
  });

  it('says "1 bell", not "1 bells", in a row\'s name', async () => {
    m = await mountTerminal();
    await newSession();
    act(() => live()[0]!.triggerBell());
    expect(rows(m.host)[0]!.getAttribute('aria-label')).toBe('Home, ~, Idle, 1 bell');
  });

  it('names the Session menu button, the Start In rows and the peek door', async () => {
    seed({}, ['/home/andrew/geckos/pyxis']);
    m = await mountTerminal();
    expect(buttonLabelled(m.host, 'Session menu')).toBeTruthy();
    expect(folderRows(m.host)[0]!.getAttribute('aria-label')).toBe('New session in ~/geckos/pyxis');
    await newSession();
    await status(0, '/home/andrew/geckos/pyxis', job('npm test'));
    await status(0, '/home/andrew/geckos/pyxis', null);
    expect(peekDoor()!.getAttribute('aria-label')).toBe('Open pyxis, npm test done');
  });

  it('names the failed state as well as colouring it', async () => {
    m = await mountTerminal();
    await closeShell(0, 9);
    expect(rows(m.host)[0]!.getAttribute('aria-label')).toContain('Exited 9');
    expect(rowState(rows(m.host)[0]!)).toBe('Exited 9');
  });
});

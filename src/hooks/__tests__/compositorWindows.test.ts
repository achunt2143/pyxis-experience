import { describe, it, expect } from 'vitest';
import type { AppSession, EvoWindowInfo } from '@pyxis/app-sdk';
import {
  EMPTY_WINDOWS,
  deriveAppViews,
  windowsReducer,
  type WindowsAction,
  type WindowsState,
} from '../compositorWindows';

const info = (id: number, over: Partial<EvoWindowInfo> = {}): EvoWindowInfo => ({
  window_id: id,
  app_id: 'x',
  width: 100,
  height: 100,
  x: 1,
  y: 2,
  focused: false,
  visible: true,
  ...over,
});

const run = (actions: WindowsAction[], from: WindowsState = EMPTY_WINDOWS) =>
  actions.reduce(windowsReducer, from);

const session = (id: string, appId: string, over: Partial<AppSession> = {}): AppSession => ({
  sessionId: id,
  appId,
  pid: 1,
  startedAt: 1,
  state: 'running',
  surfaces: [],
  ...over,
});

describe('windowsReducer', () => {
  it('a list gives focus and reads minimized from visible when not sent', () => {
    const s = run([
      { type: 'list', windows: [info(1, { focused: true }), info(2, { visible: false })] },
    ]);
    expect(s.ready).toBe(true);
    expect(s.focusedId).toBe(1);
    expect(s.byId[1].minimized).toBe(false);
    expect(s.byId[2].minimized).toBe(true);
  });

  it('an explicit minimized field beats visible and list reads maximized, fullscreen, busy and title_label', () => {
    const s = run([
      {
        type: 'list',
        windows: [
          info(1, {
            visible: false,
            minimized: false,
            maximized: true,
            fullscreen: true,
            busy: true,
            title_label: 'Files · Documents',
          }),
        ],
      },
    ]);
    expect(s.byId[1]).toMatchObject({
      minimized: false,
      maximized: true,
      fullscreen: true,
      busy: true,
      titleLabel: 'Files · Documents',
    });
  });

  it('a racing list preserves focus on a window kept via keep', () => {
    const s = run([
      { type: 'list', windows: [info(1)] },
      { type: 'created', windowId: 2, appId: 'notes', width: 800, height: 600 },
      { type: 'focus', windowId: 2 },
      { type: 'list', windows: [info(1)], keep: [2] },
    ]);
    expect(s.focusedId).toBe(2);
    expect(s.byId[2]).toBeDefined();
  });

  it('minimizing the focused window drops focus; restoring does not return it', () => {
    let s = run([
      { type: 'list', windows: [info(1, { focused: true })] },
      { type: 'minimized', windowId: 1, minimized: true },
    ]);
    expect(s.focusedId).toBeNull();
    expect(s.byId[1].minimized).toBe(true);
    s = run([{ type: 'minimized', windowId: 1, minimized: false }], s);
    expect(s.byId[1].minimized).toBe(false);
    expect(s.focusedId).toBeNull();
  });

  it('closing the focused window clears focus', () => {
    const s = run([
      { type: 'list', windows: [info(1, { focused: true })] },
      { type: 'closed', windowId: 1 },
    ]);
    expect(s.byId[1]).toBeUndefined();
    expect(s.focusedId).toBeNull();
  });

  it('maximized, fullscreen and moved update a known window and ignore an unknown one', () => {
    let s = run([
      { type: 'list', windows: [info(1)] },
      { type: 'maximized', windowId: 1, maximized: true },
      { type: 'fullscreen', windowId: 1, fullscreen: true },
      { type: 'moved', windowId: 1, x: 40, y: 50 },
    ]);
    expect(s.byId[1]).toMatchObject({ maximized: true, fullscreen: true, x: 40, y: 50 });
    const before = s;
    s = run([{ type: 'maximized', windowId: 9, maximized: true }], s);
    expect(s).toBe(before);
  });

  it('created keeps what a racing list already said', () => {
    const s = run([
      { type: 'list', windows: [info(3, { visible: false })] },
      { type: 'created', windowId: 3, appId: 'files', width: 5, height: 6 },
    ]);
    expect(s.byId[3]).toMatchObject({ minimized: true, waylandAppId: 'files', width: 5 });
  });

  it('a list keeps a window a signal just created, and drops one a signal just closed', () => {
    const s = run([
      { type: 'list', windows: [info(1), info(2)] },
      { type: 'created', windowId: 3, appId: 'files', width: 5, height: 6 },
      { type: 'closed', windowId: 2 },
      // A sample from before both signals: it has 2 and not 3.
      { type: 'list', windows: [info(1), info(2)], keep: [3], drop: [2] },
    ]);
    expect(Object.keys(s.byId).map(Number).sort()).toEqual([1, 3]);
    expect(s.byId[3]).toMatchObject({ waylandAppId: 'files' });
  });

  it('without keep, a list is the whole truth (a window it lacks is gone)', () => {
    const s = run([
      { type: 'created', windowId: 3, appId: 'files', width: 5, height: 6 },
      { type: 'list', windows: [info(1)] },
    ]);
    expect(Object.keys(s.byId).map(Number)).toEqual([1]);
  });
});

describe('deriveAppViews', () => {
  const win = (over: Partial<WindowsState> = {}): WindowsState => ({
    ...run([{ type: 'list', windows: [info(10), info(11, { visible: false })] }]),
    ...over,
  });

  it('joins sessions to windows through session.surfaces', () => {
    const views = deriveAppViews(
      { a: session('a', 'files', { surfaces: [10] }), b: session('b', 'notes', { surfaces: [11] }) },
      win({ focusedId: 10 })
    );
    const files = views.find((v) => v.appId === 'files')!;
    const notes = views.find((v) => v.appId === 'notes')!;
    expect(files).toMatchObject({ focused: true, minimized: false, windowId: 10 });
    expect(notes).toMatchObject({ focused: false, minimized: true, windowId: 11 });
  });

  it('a minimized app stays in the list, and is not focused even if Evo says so', () => {
    const [v] = deriveAppViews({ a: session('a', 'notes', { surfaces: [11] }) }, win({ focusedId: 11 }));
    expect(v.minimized).toBe(true);
    expect(v.focused).toBe(false);
  });

  it('a starting app has no window and is flagged', () => {
    const [v] = deriveAppViews({ a: session('a', 'files', { state: 'starting' }) }, win());
    expect(v).toMatchObject({ starting: true, windowId: null, minimized: false, focused: false });
  });

  it('does not treat a suspended session as minimized', () => {
    const [v] = deriveAppViews({ a: session('a', 'files', { state: 'suspended', surfaces: [10] }) }, win());
    expect(v.minimized).toBe(false);
  });

  it('drops stopped sessions, keeps crashed, and prefers a live session', () => {
    const views = deriveAppViews(
      {
        a: session('a', 'files', { state: 'stopped' }),
        b: session('b', 'notes', { state: 'crashed' }),
        c: session('c', 'tasks', { state: 'crashed', startedAt: 9 }),
        d: session('d', 'tasks', { state: 'running', startedAt: 1 }),
      },
      win()
    );
    expect(views.map((v) => v.appId).sort()).toEqual(['notes', 'tasks']);
    expect(views.find((v) => v.appId === 'notes')!.crashed).toBe(true);
    expect(views.find((v) => v.appId === 'tasks')!.sessionId).toBe('d');
  });

  it('with several windows, the focused one is the target', () => {
    const state = run([{ type: 'list', windows: [info(1), info(2, { focused: true })] }]);
    const [v] = deriveAppViews({ a: session('a', 'files', { surfaces: [1, 2] }) }, state);
    expect(v.windowId).toBe(2);
    expect(v.minimized).toBe(false);
  });
});

// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSession } from '@pyxis/app-sdk';
import { EMPTY_WINDOWS, type WindowsState } from '../compositorWindows';
import { CompositorWindowsContext, useAppWindows } from '../useAppWindows';

const mocks = vi.hoisted(() => ({
  restoreWindow: vi.fn(async () => {}),
  focusWindow: vi.fn(async () => {}),
  minimizeWindow: vi.fn(async () => {}),
  closeWindow: vi.fn(async () => {}),
  closeApp: vi.fn(async () => {}),
  relaunch: vi.fn(async () => null),
  sessions: {} as Record<string, AppSession>,
}));

vi.mock('@pyxis/app-sdk', async (orig) => {
  const real = await orig<typeof import('@pyxis/app-sdk')>();
  return {
    ...real,
    useEcho: () => ({
      restoreWindow: mocks.restoreWindow,
      focusWindow: mocks.focusWindow,
      minimizeWindow: mocks.minimizeWindow,
      closeWindow: mocks.closeWindow,
      closeApp: mocks.closeApp,
    }),
    useAppHost: () => ({
      sessions: mocks.sessions,
      relaunch: mocks.relaunch,
    }),
  };
});

function renderUseAppWindows(state: WindowsState) {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <CompositorWindowsContext.Provider value={state}>{children}</CompositorWindowsContext.Provider>
  );
  return renderHook(() => useAppWindows(), { wrapper });
}

describe('useAppWindows', () => {
  beforeEach(() => {
    mocks.sessions = {};
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('restores a minimized sibling window when targeted by windowId even if another sibling is visible', async () => {
    mocks.sessions = {
      s1: {
        sessionId: 's1',
        appId: 'browser',
        pid: 10,
        startedAt: 1,
        state: 'running',
        surfaces: [101, 102],
      },
    };
    const state: WindowsState = {
      ...EMPTY_WINDOWS,
      ready: true,
      focusedId: 101,
      byId: {
        101: {
          windowId: 101,
          waylandAppId: 'browser',
          width: 900,
          height: 600,
          x: 0,
          y: 36,
          minimized: false,
          maximized: false,
          fullscreen: false,
          busy: false,
          titleLabel: 'Vela · Tab 1',
        },
        102: {
          windowId: 102,
          waylandAppId: 'browser',
          width: 900,
          height: 600,
          x: 0,
          y: 36,
          minimized: true,
          maximized: false,
          fullscreen: false,
          busy: false,
          titleLabel: 'Vela · Tab 2',
        },
      },
    };

    const { result } = renderUseAppWindows(state);
    expect(result.current.viewForApp('browser')?.minimized).toBe(false);

    await act(async () => {
      await result.current.activate('browser', 102);
    });
    expect(mocks.restoreWindow).toHaveBeenCalledWith(102);
    expect(mocks.focusWindow).toHaveBeenCalledWith(102);
    expect(mocks.restoreWindow.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.focusWindow.mock.invocationCallOrder[0]
    );

    vi.clearAllMocks();
    await act(async () => {
      await result.current.activate('browser', 101);
    });
    expect(mocks.restoreWindow).not.toHaveBeenCalled();
    expect(mocks.focusWindow).toHaveBeenCalledWith(101);
  });

  it('restores wins[0] when activate(appId) is called without windowId and all windows are minimized', async () => {
    mocks.sessions = {
      s1: {
        sessionId: 's1',
        appId: 'files',
        pid: 12,
        startedAt: 1,
        state: 'running',
        surfaces: [201, 202],
      },
    };
    const state: WindowsState = {
      ...EMPTY_WINDOWS,
      ready: true,
      focusedId: null,
      byId: {
        201: {
          windowId: 201,
          waylandAppId: 'files',
          width: 800,
          height: 500,
          x: 10,
          y: 40,
          minimized: true,
          maximized: false,
          fullscreen: false,
          busy: false,
          titleLabel: 'Files A',
        },
        202: {
          windowId: 202,
          waylandAppId: 'files',
          width: 800,
          height: 500,
          x: 20,
          y: 50,
          minimized: true,
          maximized: false,
          fullscreen: false,
          busy: false,
          titleLabel: 'Files B',
        },
      },
    };

    const { result } = renderUseAppWindows(state);
    await act(async () => {
      await result.current.activate('files');
    });
    expect(mocks.restoreWindow).toHaveBeenCalledWith(201);
    expect(mocks.focusWindow).toHaveBeenCalledWith(201);
  });

  it('toggle and close support optional windowId targeting per window', async () => {
    mocks.sessions = {
      s1: {
        sessionId: 's1',
        appId: 'notes',
        pid: 15,
        startedAt: 1,
        state: 'running',
        surfaces: [301, 302],
      },
    };
    const state: WindowsState = {
      ...EMPTY_WINDOWS,
      ready: true,
      focusedId: 301,
      byId: {
        301: {
          windowId: 301,
          waylandAppId: 'notes',
          width: 700,
          height: 500,
          x: 0,
          y: 36,
          minimized: false,
          maximized: false,
          fullscreen: false,
          busy: false,
          titleLabel: 'Notes 1',
        },
        302: {
          windowId: 302,
          waylandAppId: 'notes',
          width: 700,
          height: 500,
          x: 40,
          y: 70,
          minimized: true,
          maximized: false,
          fullscreen: false,
          busy: false,
          titleLabel: 'Notes 2',
        },
      },
    };

    const { result } = renderUseAppWindows(state);

    // Toggle focused window -> minimizes that window
    await act(async () => {
      await result.current.toggle('notes', 301);
    });
    expect(mocks.minimizeWindow).toHaveBeenCalledWith(301);

    // Toggle minimized sibling -> restores and focuses that sibling
    await act(async () => {
      await result.current.toggle('notes', 302);
    });
    expect(mocks.restoreWindow).toHaveBeenCalledWith(302);
    expect(mocks.focusWindow).toHaveBeenCalledWith(302);

    // Close targeted window -> closes only 302
    await act(async () => {
      await result.current.close('notes', 302);
    });
    expect(mocks.closeWindow).toHaveBeenCalledTimes(1);
    expect(mocks.closeWindow).toHaveBeenCalledWith(302);

    // Close app without windowId -> closes all mapped windows
    vi.clearAllMocks();
    await act(async () => {
      await result.current.close('notes');
    });
    expect(mocks.closeWindow).toHaveBeenCalledWith(301);
    expect(mocks.closeWindow).toHaveBeenCalledWith(302);
  });

  it('tracks hasFullscreen and hasFullscreenOrMaximized from real non-minimized app windows', () => {
    const base = {
      width: 1280,
      height: 800,
      x: 0,
      y: 0,
      busy: false,
      titleLabel: 'App',
    };
    const minimizedFullscreen: WindowsState = {
      ...EMPTY_WINDOWS,
      ready: true,
      byId: {
        1: { ...base, windowId: 1, waylandAppId: 'files', minimized: true, maximized: false, fullscreen: true },
        2: { ...base, windowId: 2, waylandAppId: 'bloom', minimized: false, maximized: false, fullscreen: true },
      },
    };
    const first = renderUseAppWindows(minimizedFullscreen);
    expect(first.result.current.hasFullscreen).toBe(false);
    expect(first.result.current.hasFullscreenOrMaximized).toBe(false);
    first.unmount();

    const maximizedApp: WindowsState = {
      ...EMPTY_WINDOWS,
      ready: true,
      byId: {
        3: { ...base, windowId: 3, waylandAppId: 'files', minimized: false, maximized: true, fullscreen: false },
      },
    };
    const second = renderUseAppWindows(maximizedApp);
    expect(second.result.current.hasFullscreen).toBe(false);
    expect(second.result.current.hasFullscreenOrMaximized).toBe(true);
    second.unmount();

    const fullscreenApp: WindowsState = {
      ...EMPTY_WINDOWS,
      ready: true,
      byId: {
        4: { ...base, windowId: 4, waylandAppId: 'browser', minimized: false, maximized: false, fullscreen: true },
      },
    };
    const third = renderUseAppWindows(fullscreenApp);
    expect(third.result.current.hasFullscreen).toBe(true);
    expect(third.result.current.hasFullscreenOrMaximized).toBe(true);
  });
});

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import * as sdk from '@pyxis/app-sdk';
import { SETTING_KEYS, lock, setSetting, unlock } from '@pyxis/app-sdk';
import { resetMockSession } from '../../../packages/app-sdk/src/sessionMock';
import { MotionContext, type MotionApi } from '../../useMotion';
import { resetOverlayRegion } from '../useOverlayRegion';
import { idleLockSeconds, useIdleLock } from '../useIdleLock';

/**
 * The shell's lock mode: when the session locks (from `getState` at start and
 * `LockChanged` after) ShellLayer draws the lock screen over everything,
 * takes the whole screen for clicks and the keyboard, closes any open panel
 * and hides the rest of the shell; when it unlocks, Clear plays and the lock
 * screen is removed. Evo and Echo hold the lock; this only checks that the
 * page follows them.
 */

// The shell's own pieces are other suites' business: stand-ins that say whether they are drawn.
vi.mock('../../components/TopSystemBar', () => ({
  STATUS_STRIP_HEIGHT: 36,
  TopSystemBar: ({ onToggleQuickSettings }: { onToggleQuickSettings: () => void }) => (
    <button data-stub="bar" onClick={onToggleQuickSettings} />
  ),
}));
vi.mock('../../components/QuickSettingsMenu', () => ({
  QuickSettingsMenu: ({ isOpen }: { isOpen: boolean }) => <div data-stub="quick-settings" data-open={String(isOpen)} />,
}));
vi.mock('../../components/NotificationCenter', () => ({ NotificationCenter: () => <div data-stub="centre" /> }));
vi.mock('../../components/NotificationToasts', () => ({ NotificationToasts: () => <div data-stub="toasts" /> }));
vi.mock('../../components/NotificationDashboard', () => ({ default: () => <div data-stub="dashboard" /> }));
vi.mock('../../components/AppDrawer', () => ({ default: () => <div data-stub="drawer" /> }));
vi.mock('../../components/CardOverview', () => ({ default: () => <div data-stub="overview" /> }));
vi.mock('../../components/LaunchBar', () => ({ default: () => <div data-stub="launch-bar" /> }));
vi.mock('../../hooks/useApps', () => ({
  useApps: () => ({ apps: [], loading: false, error: null, byId: (id: string) => ({ id, name: id }) }),
}));
vi.mock('../../hooks/useAppWindows', () => ({
  useCompositorWindows: () => ({ byId: {}, focusedId: null }),
  useAppWindows: () => ({
    views: [],
    hasFullscreen: false,
    viewForApp: () => undefined,
    toggle: async () => {},
    activate: async () => {},
    close: async () => {},
  }),
}));
vi.mock('../../hooks/useNotifications', () => ({
  useNotifications: () => ({ notifications: [], dismiss: async () => {}, clearAll: async () => {} }),
}));
vi.mock('@pyxis/app-sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@pyxis/app-sdk')>()),
  DynamicWallpaper: () => <div data-wallpaper-stub="" />,
}));
vi.mock('../../components/AppIcon', () => ({ AppIcon: () => null }));

// remochi's Button measures its label on a canvas; jsdom has no 2d context.
HTMLCanvasElement.prototype.getContext = (() => ({
  font: '',
  measureText: (text: string) => ({ width: text.length * 8 }),
})) as unknown as HTMLCanvasElement['getContext'];

const motion = (mode: MotionApi['mode']): MotionApi => ({ mode, tr: (t) => t, to: (t) => t });

async function drawShell(mode: MotionApi['mode'] = 'off') {
  const { default: ShellLayer } = await import('../../components/ShellLayer');
  const windowStore = {
    windows: [],
    createWindow: () => {},
    closeWindow: () => {},
    minimizeWindow: () => {},
    focusWindow: () => {},
    activeWindowId: null,
  } as unknown as React.ComponentProps<typeof ShellLayer>['windowStore'];
  return render(
    <MotionContext.Provider value={motion(mode)}>
      <ShellLayer windowStore={windowStore} reporting />
    </MotionContext.Provider>
  );
}

const q = (c: HTMLElement, sel: string) => c.querySelector<HTMLElement>(sel);

beforeEach(() => {
  localStorage.clear();
  resetMockSession();
  resetOverlayRegion();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ShellLayer in lock mode', () => {
  it('draws the lock screen over everything on LockChanged, and takes the screen and the keyboard', async () => {
    const regions: unknown[] = [];
    const asked: boolean[] = [];
    vi.spyOn(sdk, 'setOverlayRegion').mockImplementation(async (rects) => {
      regions.push(rects);
      return true;
    });
    vi.spyOn(sdk, 'setOverlayFocus').mockImplementation(async (focused) => {
      asked.push(focused);
      return true;
    });
    const { container } = await drawShell();
    await waitFor(() => expect(q(container, '[data-stub="launch-bar"]')).toBeTruthy());
    expect(q(container, '[data-lock-screen]')).toBeNull();

    await act(async () => {
      await lock();
    });
    await waitFor(() => expect(q(container, '[data-lock-screen]')).toBeTruthy());
    expect(q(container, '[data-lock-screen]')!.dataset.lockState).toBe('rest');
    // The rest of the shell is not drawn at all while the lock screen is opaque.
    for (const stub of ['bar', 'launch-bar', 'quick-settings', 'centre', 'toasts', 'drawer', 'overview']) {
      expect(q(container, `[data-stub="${stub}"]`)).toBeNull();
    }
    // The whole screen is the lock's, for clicks and for the keyboard.
    expect(regions.at(-1)).toEqual([{ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }]);
    expect(asked.at(-1)).toBe(true);
  });

  it('comes up locked when the session already is (an overlay restarted while locked)', async () => {
    await lock();
    const { container } = await drawShell();
    await waitFor(() => expect(q(container, '[data-lock-screen]')).toBeTruthy());
    await waitFor(() => expect(q(container, '[data-stub="launch-bar"]')).toBeNull());
  });

  it('removes the lock screen once Clear is done, and the shell is back', async () => {
    const regions: unknown[] = [];
    const asked: boolean[] = [];
    vi.spyOn(sdk, 'setOverlayRegion').mockImplementation(async (rects) => {
      regions.push(rects);
      return true;
    });
    vi.spyOn(sdk, 'setOverlayFocus').mockImplementation(async (focused) => {
      asked.push(focused);
      return true;
    });
    const { container } = await drawShell();
    await act(async () => {
      await lock();
    });
    await waitFor(() => expect(q(container, '[data-lock-screen]')).toBeTruthy());

    await act(async () => {
      expect(await unlock('pyxis')).toEqual({ ok: true });
    });
    await waitFor(() => expect(q(container, '[data-lock-screen]')).toBeNull());
    expect(q(container, '[data-stub="launch-bar"]')).toBeTruthy();
    expect(q(container, '[data-stub="bar"]')).toBeTruthy();
    // The screen and the keyboard go back.
    expect(regions.at(-1)).toEqual([]);
    expect(asked.at(-1)).toBe(false);
  });

  it('a wrong password leaves it locked', async () => {
    const { container } = await drawShell();
    await act(async () => {
      await lock();
    });
    await waitFor(() => expect(q(container, '[data-lock-screen]')).toBeTruthy());
    fireEvent.keyDown(window, { key: 'x' });
    fireEvent.keyDown(window, { key: 'Enter' });
    await waitFor(() => expect(q(container, '[data-lock-screen]')!.dataset.lockState).toBe('wrong'));
    expect(q(container, '[data-stub="launch-bar"]')).toBeNull();
  });

  it('closes an open panel when it locks, so it is not open on the way back', async () => {
    const { container } = await drawShell();
    await waitFor(() => expect(q(container, '[data-stub="bar"]')).toBeTruthy());
    fireEvent.click(q(container, '[data-stub="bar"]')!);
    expect(q(container, '[data-stub="quick-settings"]')!.dataset.open).toBe('true');

    await act(async () => {
      await lock();
    });
    await waitFor(() => expect(q(container, '[data-lock-screen]')).toBeTruthy());
    await act(async () => {
      await unlock('pyxis');
    });
    await waitFor(() => expect(q(container, '[data-lock-screen]')).toBeNull());
    expect(q(container, '[data-stub="quick-settings"]')!.dataset.open).toBe('false');
  });

  it('full motion: the shell dissolves under Veil, is gone once the lock is opaque, and is under the hole during Clear', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', 'Date'] });
    const { container } = await drawShell('full');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(q(container, '[data-stub="launch-bar"]')).toBeTruthy();

    await act(async () => {
      await lock();
      await vi.advanceTimersByTimeAsync(10);
    });
    // Veil: the lock fades in over the shell, which is still beneath it.
    expect(q(container, '[data-lock-layer]')!.dataset.lockLayer).toBe('veil');
    expect(q(container, '[data-stub="launch-bar"]')).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(q(container, '[data-lock-layer]')!.dataset.lockLayer).toBe('locked');
    expect(q(container, '[data-stub="launch-bar"]')).toBeNull();

    await act(async () => {
      const done = unlock('pyxis');
      await vi.advanceTimersByTimeAsync(500);
      await done;
      await vi.advanceTimersByTimeAsync(10);
    });
    // Clear: the shell is back under the opening hole, and the lock layer is still up.
    expect(q(container, '[data-lock-layer]')!.dataset.lockLayer).toBe('clear');
    expect(q(container, '[data-stub="launch-bar"]')).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(950);
    });
    expect(q(container, '[data-lock-layer]')).toBeNull();
    expect(q(container, '[data-lock-screen]')).toBeNull();
  });

  it('suppresses PrivilegePromptDialog during veil and locked transitions and restores it when unlocked', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', 'Date'] });
    const { requestPrivilege } = sdk;
    const { resetMockPrivilege } = await import('../../../packages/app-sdk/src/EchoClient');
    resetMockPrivilege();

    const { container } = await drawShell('full');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    await act(async () => {
      await requestPrivilege('Change system files', 'files');
    });
    expect(document.body.querySelector('[data-privilege-dialog]')).toBeTruthy();

    await act(async () => {
      await lock();
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(q(container, '[data-lock-layer]')!.dataset.lockLayer).toBe('veil');
    expect(document.body.querySelector('[data-privilege-dialog]')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(q(container, '[data-lock-layer]')!.dataset.lockLayer).toBe('locked');
    expect(document.body.querySelector('[data-privilege-dialog]')).toBeNull();

    await act(async () => {
      const done = unlock('pyxis');
      await vi.advanceTimersByTimeAsync(500);
      await done;
      await vi.advanceTimersByTimeAsync(10);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(950);
    });
    expect(q(container, '[data-lock-layer]')).toBeNull();
    expect(document.body.querySelector('[data-privilege-dialog]')).toBeTruthy();
    resetMockPrivilege();
  });
});

describe('the desktop document stops its wallpaper while locked', () => {
  it('Desktop pauses on `locked`, from the same session state', () => {
    const source = readFileSync(resolve(__dirname, '../../components/Desktop.tsx'), 'utf8');
    expect(source).toMatch(/const \{ locked \} = useSessionState\(\)/);
    expect(source).toMatch(/paused=\{exposure\.pause \|\| locked\}/);
  });
});

describe('quick settings has a Lock entry that calls session.lock', () => {
  it('is next to the power actions and calls the SDK’s lock', () => {
    const source = readFileSync(resolve(__dirname, '../../components/QuickSettingsMenu.tsx'), 'utf8');
    expect(source).toMatch(/lock as lockSession/);
    expect(source).toMatch(/await lockSession\(\)/);
    expect(source).toMatch(/data-qs-action="lock"[\s\S]{0,200}onClick=\{handleLock\}/);
    // Before Sleep, in the same row.
    expect(source.indexOf('data-qs-action="lock"')).toBeLessThan(source.indexOf('onClick={handleSleep}'));
  });

  it('is not in Evo’s or the bridge’s hands: Super+L is Evo’s shortcut, not Bloom’s', () => {
    const source = readFileSync(resolve(__dirname, '../../components/ShellLayer.tsx'), 'utf8');
    expect(source).not.toMatch(/'lock'\s*:/);
    const hook = readFileSync(resolve(__dirname, '../../hooks/useGlobalShortcuts.ts'), 'utf8');
    expect(hook).not.toMatch(/lock/i);
  });
});

describe('the idle lock follows pyxis.lock.after', () => {
  it('turns minutes into seconds, null into 0 (never), and ignores what is no lock time', () => {
    expect(idleLockSeconds(10)).toBe(600);
    expect(idleLockSeconds(1)).toBe(60);
    expect(idleLockSeconds(120)).toBe(7200);
    expect(idleLockSeconds(500)).toBe(7200);
    expect(idleLockSeconds(null)).toBe(0);
    for (const bad of [0, -3, NaN, 'ten', undefined, true]) expect(idleLockSeconds(bad)).toBeUndefined();
  });

  afterEach(() => cleanup());

  it('sends SetIdleLock from the stored setting (default 10 min), and again on every change', async () => {
    const sent: number[] = [];
    vi.spyOn(sdk, 'setIdleLock').mockImplementation(async (seconds) => {
      sent.push(seconds);
      return true;
    });
    renderHook(() => useIdleLock(true));
    await waitFor(() => expect(sent).toEqual([600]));

    await act(async () => {
      await setSetting(SETTING_KEYS.lockAfter, 5);
    });
    await waitFor(() => expect(sent.at(-1)).toBe(300));
    // null is "never": 0, not the default.
    await act(async () => {
      await setSetting(SETTING_KEYS.lockAfter, null);
    });
    await waitFor(() => expect(sent.at(-1)).toBe(0));
  });

  it('sends nothing before it knows the setting, and nothing when not the shell', async () => {
    const sent: number[] = [];
    vi.spyOn(sdk, 'setIdleLock').mockImplementation(async (seconds) => {
      sent.push(seconds);
      return true;
    });
    renderHook(() => useIdleLock(false));
    await new Promise((r) => setTimeout(r, 50));
    expect(sent).toEqual([]);
  });

  it('a stored null reads as never, not as the fallback', async () => {
    await setSetting(SETTING_KEYS.lockAfter, null);
    const sent: number[] = [];
    vi.spyOn(sdk, 'setIdleLock').mockImplementation(async (seconds) => {
      sent.push(seconds);
      return true;
    });
    renderHook(() => useIdleLock(true));
    await waitFor(() => expect(sent).toEqual([0]));
  });
});

describe.runIf(existsSync(resolve(__dirname, '../../../../geckos/evo/src/enhancements/echo_ipc.rs')))(
  'SetIdleLock takes seconds, as the hook sends it',
  () => {
    const rust = readFileSync(resolve(__dirname, '../../../../geckos/evo/src/enhancements/echo_ipc.rs'), 'utf8');
    it.runIf(rust.includes('"SetIdleLock" =>'))('Evo reads `seconds`', () => {
      expect(rust).toMatch(/"SetIdleLock" =>[\s\S]{0,800}"seconds"/);
    });
  }
);

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import React, { useEffect } from 'react';
import * as sdk from '@pyxis/app-sdk';
import { resetMockSession } from '../../../packages/app-sdk/src/sessionMock';
import { MotionContext, type MotionApi } from '../../useMotion';
import { resetOverlayRegion } from '../useOverlayRegion';
import { CLOSE_SEARCH_EVENT, FOCUS_SEARCH_EVENT } from '../../hooks/useGlobalShortcuts';

/**
 * ShellLayer's panels: one at a time, and none left holding the screen when a
 * fullscreen app hides the bar the search box lives in. The pieces are
 * stand-ins that say whether they are open and expose the calls ShellLayer
 * hands them.
 */

const fake = vi.hoisted(() => ({ fullscreen: false }));

// The search box stand-in opens on Super+Space and closes on the shell's
// close event, like DesktopSearch, but says nothing when it unmounts, so the
// shell's own guard is what is tested.
function SearchStub({ onActiveChange }: { onActiveChange?: (active: boolean) => void }) {
  useEffect(() => {
    const open = () => onActiveChange?.(true);
    const close = () => onActiveChange?.(false);
    window.addEventListener(FOCUS_SEARCH_EVENT, open);
    window.addEventListener(CLOSE_SEARCH_EVENT, close);
    return () => {
      window.removeEventListener(FOCUS_SEARCH_EVENT, open);
      window.removeEventListener(CLOSE_SEARCH_EVENT, close);
    };
  }, [onActiveChange]);
  return <div data-stub="search" />;
}

vi.mock('../../components/TopSystemBar', () => ({
  STATUS_STRIP_HEIGHT: 36,
  TopSystemBar: ({
    onToggleQuickSettings,
    onSearchActiveChange,
  }: {
    onToggleQuickSettings: () => void;
    onSearchActiveChange?: (active: boolean) => void;
  }) => (
    <div data-stub="bar">
      <button data-stub="qs-button" onClick={onToggleQuickSettings} />
      <SearchStub onActiveChange={onSearchActiveChange} />
    </div>
  ),
}));
vi.mock('../../components/QuickSettingsMenu', () => ({
  QuickSettingsMenu: ({ isOpen }: { isOpen: boolean }) => <div data-stub="quick-settings" data-open={String(isOpen)} />,
}));
vi.mock('../../components/NotificationCenter', () => ({
  NotificationCenter: ({ isOpen }: { isOpen: boolean }) => <div data-stub="centre" data-open={String(isOpen)} />,
}));
vi.mock('../../components/NotificationToasts', () => ({ NotificationToasts: () => null }));
vi.mock('../../components/NotificationDashboard', () => ({ default: () => null }));
vi.mock('../../components/AppDrawer', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => <div data-stub="drawer" data-open={String(isOpen)} />,
}));
vi.mock('../../components/CardOverview', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => <div data-stub="overview" data-open={String(isOpen)} />,
}));
vi.mock('../../components/LaunchBar', () => ({
  default: ({ onToggleAppDrawer, onToggleOverview }: { onToggleAppDrawer: () => void; onToggleOverview: () => void }) => (
    <div data-stub="launch-bar">
      <button data-stub="apps-button" onClick={onToggleAppDrawer} />
      <button data-stub="cards-button" onClick={onToggleOverview} />
    </div>
  ),
}));
vi.mock('../../hooks/useApps', () => ({
  useApps: () => ({ apps: [], loading: false, error: null, byId: (id: string) => ({ id, name: id }) }),
}));
vi.mock('../../hooks/useAppWindows', () => ({
  useCompositorWindows: () => ({ byId: {}, focusedId: null }),
  useAppWindows: () => ({
    views: [],
    hasFullscreen: fake.fullscreen,
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

const motion: MotionApi = { mode: 'off', tr: (t) => t, to: (t) => t };

async function drawShell() {
  const { default: ShellLayer } = await import('../../components/ShellLayer');
  const windowStore = {
    windows: [],
    createWindow: () => {},
    closeWindow: () => {},
    minimizeWindow: () => {},
    focusWindow: () => {},
    activeWindowId: null,
  } as unknown as React.ComponentProps<typeof ShellLayer>['windowStore'];
  const tree = () => (
    <MotionContext.Provider value={motion}>
      <ShellLayer windowStore={windowStore} reporting />
    </MotionContext.Provider>
  );
  const r = render(tree());
  return { ...r, redraw: () => r.rerender(tree()) };
}

const q = (c: HTMLElement, sel: string) => c.querySelector<HTMLElement>(sel);
const isOpen = (c: HTMLElement, stub: string) => q(c, `[data-stub="${stub}"]`)?.dataset.open === 'true';
const openPanels = (c: HTMLElement) =>
  ['quick-settings', 'centre', 'drawer', 'overview'].filter((stub) => isOpen(c, stub));

let regions: unknown[];
let keyboard: boolean[];
beforeEach(() => {
  fake.fullscreen = false;
  localStorage.clear();
  resetMockSession();
  resetOverlayRegion();
  regions = [];
  keyboard = [];
  vi.spyOn(sdk, 'setOverlayRegion').mockImplementation(async (rects) => {
    regions.push(rects);
    return true;
  });
  vi.spyOn(sdk, 'setOverlayFocus').mockImplementation(async (focused) => {
    keyboard.push(focused);
    return true;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const fullScreen = () => [{ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }];

describe('the shell keeps one panel open at a time', () => {
  it('opening the drawer, the overview or quick settings closes whichever was open', async () => {
    const { container } = await drawShell();
    await waitFor(() => expect(q(container, '[data-stub="launch-bar"]')).toBeTruthy());
    fireEvent.click(q(container, '[data-stub="qs-button"]')!);
    expect(openPanels(container)).toEqual(['quick-settings']);
    fireEvent.click(q(container, '[data-stub="apps-button"]')!);
    expect(openPanels(container)).toEqual(['drawer']);
    fireEvent.click(q(container, '[data-stub="cards-button"]')!);
    expect(openPanels(container)).toEqual(['overview']);
    fireEvent.click(q(container, '[data-stub="cards-button"]')!);
    expect(openPanels(container)).toEqual([]);
  });

  it('the search opening closes an open panel, and a panel opening closes the search', async () => {
    const closes = vi.fn();
    window.addEventListener(CLOSE_SEARCH_EVENT, closes);
    const { container } = await drawShell();
    await waitFor(() => expect(q(container, '[data-stub="launch-bar"]')).toBeTruthy());
    fireEvent.click(q(container, '[data-stub="apps-button"]')!);
    act(() => {
      window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT));
    });
    expect(openPanels(container)).toEqual([]);
    closes.mockClear();
    fireEvent.click(q(container, '[data-stub="qs-button"]')!);
    expect(closes).toHaveBeenCalled();
    window.removeEventListener(CLOSE_SEARCH_EVENT, closes);
  });
});

describe('a fullscreen app never ends up under a stuck search', () => {
  it('an app going fullscreen mid-search keeps the bar until the search closes, then lets go of everything', async () => {
    const { container, redraw } = await drawShell();
    await waitFor(() => expect(q(container, '[data-stub="search"]')).toBeTruthy());
    act(() => {
      window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT));
    });
    await waitFor(() => expect(regions.at(-1)).toEqual(fullScreen()));
    expect(keyboard.at(-1)).toBe(true);

    fake.fullscreen = true;
    redraw();
    // The box is still there to type in, and can still be closed.
    expect(q(container, '[data-stub="search"]')).toBeTruthy();
    act(() => {
      window.dispatchEvent(new Event(CLOSE_SEARCH_EVENT));
    });
    await waitFor(() => expect(q(container, '[data-stub="bar"]')).toBeNull());
    await waitFor(() => expect(keyboard.at(-1)).toBe(false));
    expect(regions.at(-1)).not.toEqual(fullScreen());
  });

  it('Super+Space over a fullscreen app brings the bar back for the search', async () => {
    fake.fullscreen = true;
    const { container } = await drawShell();
    await waitFor(() => expect(q(container, '[data-stub="bar"]')).toBeNull());
    act(() => {
      window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT));
    });
    await waitFor(() => expect(q(container, '[data-stub="bar"]')).toBeTruthy());
    await waitFor(() => expect(keyboard.at(-1)).toBe(true));
    // Closing the search hides the bar again.
    act(() => {
      window.dispatchEvent(new Event(CLOSE_SEARCH_EVENT));
    });
    await waitFor(() => expect(q(container, '[data-stub="bar"]')).toBeNull());
  });
});

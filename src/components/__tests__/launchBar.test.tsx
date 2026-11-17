import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { AppLifecycleState, AppSession, NotificationEntry } from '@pyxis/app-sdk';
import type { AppWindowView } from '../../hooks/compositorWindows';
import type { DesktopApp } from '../../hooks/useApps';
import { LaunchBar, LAUNCH_ICON_PITCH } from '../LaunchBar';
import { NotificationDashboard } from '../NotificationDashboard';
import {
  DASHBOARD_CHIPS,
  LAUNCH_BAR_HEIGHT,
  LAUNCH_RAIL_TOP,
  LAUNCH_RAIL_WIDTH,
  dashboardChips,
  runLineFor,
} from '../launchBarState';
import { measureDockIcons } from '../../overlay/useMinimizeTargets';

/**
 * The launch bar (identity plan, lane B): the floating dock's replacement,
 * flush to the bottom edge, and the notification dashboard at its right
 * end. The hooks it reads (Nova's list, AppHost's sessions, Evo's windows,
 * Do Not Disturb) are stood in for here, so each test sets the state it is
 * about and nothing else.
 */

const fake = vi.hoisted(() => ({
  apps: [] as DesktopApp[],
  sessions: {} as Record<string, AppSession>,
  views: {} as Record<string, Partial<AppWindowView>>,
  dnd: false,
  position: 'bottom' as 'bottom' | 'left',
}));

vi.mock('../../hooks/useApps', () => ({
  useApps: () => ({
    apps: fake.apps,
    byId: (id: string) => fake.apps.find((a) => a.id === id),
    pinned: fake.apps.filter((a) => a.pinned),
    loading: false,
    error: null,
    refresh: async () => {},
  }),
}));

vi.mock('../../hooks/useAppWindows', () => ({
  useAppWindows: () => ({
    viewForApp: (id: string) => fake.views[id],
  }),
}));

vi.mock('@pyxis/app-sdk', async (importOriginal) => {
  const sdk = await importOriginal<typeof import('@pyxis/app-sdk')>();
  return {
    ...sdk,
    useAppHost: () => ({
      sessions: fake.sessions,
      stateForApp: (id: string) => Object.values(fake.sessions).find((s) => s.appId === id)?.state ?? null,
      sessionForApp: (id: string) => Object.values(fake.sessions).find((s) => s.appId === id) ?? null,
    }),
    useSetting: <T,>(key: string, fallback: T) =>
      (key === sdk.SETTING_KEYS.dnd
        ? fake.dnd
        : key === sdk.SETTING_KEYS.launchBarPosition
          ? fake.position
          : fallback) as T,
  };
});

function app(id: string, pinned = true): DesktopApp {
  return {
    id,
    name: id[0].toUpperCase() + id.slice(1),
    pinned,
    entryUrl: null,
    defaultSize: { width: 800, height: 600 },
    category: 'system',
    info: {} as DesktopApp['info'],
  };
}

function session(appId: string, state: AppLifecycleState): AppSession {
  return { sessionId: `s-${appId}`, appId, pid: 100, startedAt: 0, state };
}

function notification(id: string, timestamp: number, extra: Partial<NotificationEntry> = {}): NotificationEntry {
  return { id, title: `Title ${id}`, body: `Body ${id}`, timestamp, appId: 'tasks', ...extra };
}

afterEach(() => {
  cleanup();
  fake.apps = [];
  fake.sessions = {};
  fake.views = {};
  fake.dnd = false;
  fake.position = 'bottom';
});

describe('the running line', () => {
  it('says what the app is doing, crashed and starting first', () => {
    expect(runLineFor({ running: false, state: null })).toBe('none');
    expect(runLineFor({ running: true, state: 'running' })).toBe('running');
    expect(runLineFor({ running: true, state: 'running', focused: true })).toBe('focused');
    expect(runLineFor({ running: true, state: 'running', minimized: true })).toBe('minimized');
    expect(runLineFor({ running: true, state: 'starting', focused: true })).toBe('starting');
    expect(runLineFor({ running: true, state: 'running', starting: true })).toBe('starting');
    expect(runLineFor({ running: true, state: 'crashed', focused: true })).toBe('crashed');
  });

  it('is drawn on the bar under each running icon: short, long when focused, none when stopped', () => {
    fake.apps = [app('terminal'), app('files'), app('notes'), app('tasks')];
    fake.sessions = {
      a: session('files', 'running'),
      b: session('notes', 'running'),
      c: session('tasks', 'starting'),
    };
    fake.views = { files: { focused: true }, notes: {}, tasks: { starting: true } };
    const { container } = render(<LaunchBar windows={[]} />);
    const lineOf = (id: string) =>
      container.querySelector(`[data-app="${id}"]`)?.parentElement?.querySelector<HTMLElement>('[data-run-line]');

    expect(lineOf('terminal')).toBeNull();
    expect(lineOf('files')?.dataset.runLine).toBe('focused');
    expect(lineOf('files')?.style.width).toBe('28px');
    expect(lineOf('notes')?.dataset.runLine).toBe('running');
    expect(lineOf('notes')?.style.width).toBe('16px');
    expect(lineOf('tasks')?.dataset.runLine).toBe('starting');
    // On the very bottom edge of the bar, not under the icon's own box.
    expect(lineOf('notes')?.style.bottom).toBe('0px');
  });

  it('marks a crashed app, and appends running apps that are not pinned', () => {
    fake.apps = [app('files'), app('weather', false)];
    fake.sessions = { a: session('weather', 'crashed') };
    const { container } = render(<LaunchBar windows={[]} />);
    const buttons = [...container.querySelectorAll<HTMLElement>('[data-app]')].map((b) => b.dataset.app);
    expect(buttons).toEqual(['files', 'weather']);
    const weather = container.querySelector('[data-app="weather"]')!;
    expect(weather.querySelector('[data-crashed]')).not.toBeNull();
    expect(weather.parentElement?.querySelector<HTMLElement>('[data-run-line]')?.dataset.runLine).toBe('crashed');
  });

  it('launches a stopped app and toggles a running one', () => {
    fake.apps = [app('files'), app('notes')];
    fake.sessions = { a: session('notes', 'running') };
    fake.views = { notes: {} };
    const onLaunchApp = vi.fn();
    const onToggleApp = vi.fn();
    const { container } = render(<LaunchBar windows={[]} onLaunchApp={onLaunchApp} onToggleApp={onToggleApp} />);
    fireEvent.click(container.querySelector('[data-app="files"]')!);
    expect(onLaunchApp).toHaveBeenCalledWith('files', 'Files');
    fireEvent.click(container.querySelector('[data-app="notes"]')!);
    expect(onToggleApp).toHaveBeenCalledWith('notes');
  });

  it('leaves an app that is still starting alone when clicked', () => {
    fake.apps = [app('files')];
    fake.sessions = { a: session('files', 'starting') };
    fake.views = { files: { starting: true } };
    const onToggleApp = vi.fn();
    const { container } = render(<LaunchBar windows={[]} onToggleApp={onToggleApp} />);
    fireEvent.click(container.querySelector('[data-app="files"]')!);
    expect(onToggleApp).not.toHaveBeenCalled();
  });
});

describe('the launch bar keeps the overlay contracts', () => {
  it('is the shell bottom edge: a region, flush, full width, 64 px', () => {
    const { container } = render(<LaunchBar windows={[]} />);
    const bar = container.querySelector<HTMLElement>('[data-shell-edge="bottom"]')!;
    expect(bar).not.toBeNull();
    expect(bar.hasAttribute('data-shell-region')).toBe(true);
    expect(bar.style.position).toBe('fixed');
    expect(bar.style.bottom).toBe('0px');
    expect(bar.style.left).toBe('0px');
    expect(bar.style.right).toBe('0px');
    expect(bar.style.height).toBe(`${LAUNCH_BAR_HEIGHT}px`);
    expect(bar.style.background).toContain('linear-gradient(to top');
    expect(bar.style.backdropFilter ?? '').toBe('');
  });

  it("minimize targets are still its data-app buttons, and only those", () => {
    fake.apps = [app('files'), app('notes')];
    const { container } = render(
      <LaunchBar
        windows={[]}
        dashboard={<NotificationDashboard notifications={[notification('n1', 1)]} centreOpen={false} onToggleCentre={() => {}} />}
      />
    );
    // jsdom does no layout: give each app button the size a browser would.
    container.querySelectorAll<HTMLElement>('[data-app]').forEach((el) => {
      Object.defineProperty(el, 'offsetWidth', { value: 40 });
      Object.defineProperty(el, 'offsetHeight', { value: 40 });
    });
    const targets = measureDockIcons(container, () => undefined);
    expect(targets.map((t) => t.appId)).toEqual(['files', 'notes']);
    expect(targets.every((t) => t.width === 40 && t.height === 40)).toBe(true);
  });

  it('centres its apps by layout, never by a transform offsetLeft cannot see', () => {
    const source = readFileSync(resolve(__dirname, '../LaunchBar.tsx'), 'utf8');
    // Equal flexible ends either side of the middle, which shrinks (and scrolls) when crowded.
    expect(source).toMatch(
      /gridTemplateColumns: 'minmax\(max-content, 1fr\) minmax\(0, auto\) minmax\(max-content, 1fr\)'/
    );
    expect(source).not.toMatch(/translateX\(-50%\)/);
  });

  it('opens the drawer and the overview from its left end', () => {
    const onToggleAppDrawer = vi.fn();
    const onToggleOverview = vi.fn();
    const { container } = render(
      <LaunchBar windows={[]} appDrawerOpen onToggleAppDrawer={onToggleAppDrawer} onToggleOverview={onToggleOverview} />
    );
    const apps = container.querySelector<HTMLElement>('[data-launch-bar-button="apps"]')!;
    expect(apps.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(apps);
    fireEvent.click(container.querySelector('[data-launch-bar-button="cards"]')!);
    expect(onToggleAppDrawer).toHaveBeenCalledTimes(1);
    expect(onToggleOverview).toHaveBeenCalledTimes(1);
  });
});

describe('the notification dashboard', () => {
  it('chips are the newest unread ones, at most two', () => {
    const list = [notification('a', 1), notification('b', 3), notification('c', 2)];
    expect(dashboardChips(list, new Set(), false).map((n) => n.id)).toEqual(['b', 'c']);
    expect(DASHBOARD_CHIPS).toBe(2);
    expect(dashboardChips(list, new Set(['b']), false).map((n) => n.id)).toEqual(['c', 'a']);
  });

  it('Do Not Disturb keeps only critical chips', () => {
    const list = [notification('a', 1), notification('b', 2, { urgency: 'critical' })];
    expect(dashboardChips(list, new Set(), true).map((n) => n.id)).toEqual(['b']);
  });

  it('draws chips and the count, and either opens the centre', () => {
    fake.apps = [app('tasks')];
    const onToggleCentre = vi.fn();
    const list = [notification('a', 1), notification('b', 2), notification('c', 3)];
    const { container } = render(
      <NotificationDashboard notifications={list} centreOpen={false} onToggleCentre={onToggleCentre} />
    );
    const chips = [...container.querySelectorAll<HTMLElement>('[data-dashboard-chip]')];
    // Newest last: next to the count, where toasts rise from.
    expect(chips.map((c) => c.dataset.dashboardChip)).toEqual(['b', 'c']);
    expect(chips[1].textContent).toContain('Title c');
    expect(chips[1].textContent).toContain('Body c');
    expect(chips[1].querySelector('[data-app-drop="tasks"]')).not.toBeNull();
    const count = container.querySelector<HTMLElement>('[data-dashboard-count]')!;
    expect(count.textContent).toBe('3');
    expect(count.style.background).toBe('var(--px-spinner-red)');
    fireEvent.click(chips[1]);
    fireEvent.click(count);
    expect(onToggleCentre).toHaveBeenCalledTimes(2);
  });

  it('caps the count at 9+, and shows nothing with no notifications', async () => {
    const many = Array.from({ length: 12 }, (_, i) => notification(`n${i}`, i));
    const view = render(<NotificationDashboard notifications={many} centreOpen={false} onToggleCentre={() => {}} />);
    expect(view.container.querySelector('[data-dashboard-count]')?.textContent).toBe('9+');
    view.rerender(<NotificationDashboard notifications={[]} centreOpen={false} onToggleCentre={() => {}} />);
    expect(view.container.querySelector('[data-dashboard-count]')).toBeNull();
    // Chips leave through their exit animation.
    await waitFor(() => expect(view.container.querySelector('[data-dashboard-chip]')).toBeNull());
  });

  it('under Do Not Disturb holds back chips but still counts', () => {
    fake.dnd = true;
    const list = [notification('a', 1), notification('b', 2, { urgency: 'critical' })];
    const { container } = render(<NotificationDashboard notifications={list} centreOpen={false} onToggleCentre={() => {}} />);
    expect([...container.querySelectorAll<HTMLElement>('[data-dashboard-chip]')].map((c) => c.dataset.dashboardChip)).toEqual(['b']);
    expect(container.querySelector('[data-dashboard-count]')?.textContent).toBe('2');
  });

  it('what the centre showed is read once it closes: the chips go, the count stays', async () => {
    const list = [notification('a', 1)];
    const props = { notifications: list, onToggleCentre: () => {} };
    const view = render(<NotificationDashboard {...props} centreOpen={false} />);
    expect(view.container.querySelectorAll('[data-dashboard-chip]')).toHaveLength(1);
    view.rerender(<NotificationDashboard {...props} centreOpen />);
    view.rerender(<NotificationDashboard {...props} centreOpen={false} />);
    await waitFor(() => expect(view.container.querySelectorAll('[data-dashboard-chip]')).toHaveLength(0));
    expect(view.container.querySelector('[data-dashboard-count]')?.textContent).toBe('1');
    // A new one after that is unread.
    view.rerender(<NotificationDashboard {...props} notifications={[notification('b', 2), ...list]} centreOpen={false} />);
    await waitFor(() =>
      expect([...view.container.querySelectorAll<HTMLElement>('[data-dashboard-chip]')].map((c) => c.dataset.dashboardChip)).toEqual(['b'])
    );
  });
});

describe('the launch bar as a rail down the left (pyxis.launchBar.position = left)', () => {
  const dashboard = (list: NotificationEntry[]) => (
    <NotificationDashboard notifications={list} centreOpen={false} onToggleCentre={() => {}} />
  );

  it('is the shell left edge: a region, 64 px wide, below the 36 px strip, flush left, fading to the right', () => {
    fake.position = 'left';
    expect(LAUNCH_RAIL_WIDTH).toBe(64);
    expect(LAUNCH_RAIL_TOP).toBe(36);
    const { container } = render(<LaunchBar windows={[]} />);
    const bar = container.querySelector<HTMLElement>('[data-shell-edge="left"]')!;
    expect(bar).not.toBeNull();
    expect(container.querySelector('[data-shell-edge="bottom"]')).toBeNull();
    expect(bar.dataset.launchBar).toBe('left');
    expect(bar.hasAttribute('data-shell-region')).toBe(true);
    expect(bar.style.position).toBe('fixed');
    expect(bar.style.left).toBe('0px');
    expect(bar.style.top).toBe('36px');
    expect(bar.style.bottom).toBe('0px');
    expect(bar.style.width).toBe('64px');
    expect(bar.style.right).toBe('');
    expect(bar.style.background).toContain('linear-gradient(to right');
    expect(bar.style.background).toContain('--px-edge-material');
    expect(bar.style.backdropFilter ?? '').toBe('');
  });

  it('the bar stays the bottom edge by default, marked data-launch-bar="bottom"', () => {
    const { container } = render(<LaunchBar windows={[]} />);
    expect(container.querySelector<HTMLElement>('[data-shell-edge="bottom"]')?.dataset.launchBar).toBe('bottom');
    expect(container.querySelector('[data-shell-edge="left"]')).toBeNull();
  });

  it('stacks Apps and Cards first, then the icons, then the dashboard at the foot', () => {
    fake.position = 'left';
    fake.apps = [app('files'), app('notes')];
    const { container } = render(<LaunchBar windows={[]} dashboard={dashboard([notification('a', 1)])} />);
    const bar = container.querySelector<HTMLElement>('[data-shell-edge="left"]')!;
    expect(bar.style.flexDirection).toBe('column');
    const order = [...bar.querySelectorAll<HTMLElement>('[data-launch-bar-button], [data-app], [data-dashboard-count]')].map(
      (el) => el.dataset.launchBarButton ?? el.dataset.app ?? 'count'
    );
    expect(order).toEqual(['apps', 'cards', 'files', 'notes', 'count']);
    // The dashboard sits in the end slot, which is pushed to the bottom.
    const end = bar.querySelector<HTMLElement>('[data-launch-bar-end]')!;
    expect(end.style.marginTop).toBe('auto');
    expect(end.querySelector('[data-dashboard-count]')).not.toBeNull();
  });

  it('icons are 40 px, stacked 52 px apart (a 12 px gap), centred in the 64 px width', () => {
    fake.position = 'left';
    fake.apps = [app('files'), app('notes')];
    const { container } = render(<LaunchBar windows={[]} />);
    const list = container.querySelector<HTMLElement>('[data-launch-bar-apps]')!;
    expect(list.style.flexDirection).toBe('column');
    expect(list.style.gap).toBe('12px');
    const files = container.querySelector<HTMLElement>('[data-app="files"]')!;
    expect(files.style.width).toBe('40px');
    expect(files.style.height).toBe('40px');
    // 40 + 12 = 52 icon to icon.
    expect(LAUNCH_ICON_PITCH).toBe(52);
    expect(files.parentElement!.style.width).toBe('64px');
    expect(files.parentElement!.style.justifyContent).toBe('center');
  });

  it('draws the running light as a 3 px vertical line on the screen edge, longer when focused', () => {
    fake.position = 'left';
    fake.apps = [app('files'), app('notes'), app('tasks')];
    fake.sessions = { a: session('files', 'running'), b: session('notes', 'running'), c: session('tasks', 'crashed') };
    fake.views = { files: { focused: true }, notes: {} };
    const { container } = render(<LaunchBar windows={[]} />);
    const lineOf = (id: string) =>
      container.querySelector(`[data-app="${id}"]`)?.parentElement?.querySelector<HTMLElement>('[data-run-line]');
    const focused = lineOf('files')!;
    expect(focused.dataset.runLine).toBe('focused');
    expect(focused.style.left).toBe('0px');
    expect(focused.style.width).toBe('3px');
    expect(focused.style.height).toBe('28px');
    expect(focused.style.bottom).toBe('');
    const running = lineOf('notes')!;
    expect(running.style.width).toBe('3px');
    expect(running.style.height).toBe('16px');
    expect(lineOf('tasks')?.dataset.runLine).toBe('crashed');
  });

  it('keeps the data-app buttons the minimize targets, and only those', () => {
    fake.position = 'left';
    fake.apps = [app('files'), app('notes')];
    const { container } = render(<LaunchBar windows={[]} dashboard={dashboard([notification('n1', 1)])} />);
    container.querySelectorAll<HTMLElement>('[data-app]').forEach((el) => {
      Object.defineProperty(el, 'offsetWidth', { value: 40 });
      Object.defineProperty(el, 'offsetHeight', { value: 40 });
    });
    expect(measureDockIcons(container, () => undefined).map((t) => t.appId)).toEqual(['files', 'notes']);
  });

  it('opens a multi-window popover to the right of the icon', () => {
    fake.position = 'left';
    fake.apps = [app('files')];
    const windows = [
      { id: 'w1', appId: 'files', title: 'One', state: 'normal' },
      { id: 'w2', appId: 'files', title: 'Two', state: 'normal' },
    ] as unknown as React.ComponentProps<typeof LaunchBar>['windows'];
    const { container } = render(<LaunchBar windows={windows} />);
    fireEvent.click(container.querySelector('[data-app="files"]')!);
    // Portalled out of the bar (a scrolling strip would clip it), a region of its own.
    const popup = document.body.querySelector<HTMLElement>('[data-shell-popup]')!;
    expect(container.contains(popup)).toBe(false);
    expect(popup.hasAttribute('data-shell-region')).toBe(true);
    expect(popup.dataset.popoverSide).toBe('right');
    expect(popup.style.position).toBe('fixed');
    expect(popup.style.bottom).toBe('');
  });

  it('opens the same popover above the icon on the bottom bar', () => {
    fake.apps = [app('files')];
    const windows = [
      { id: 'w1', appId: 'files', title: 'One', state: 'normal' },
      { id: 'w2', appId: 'files', title: 'Two', state: 'normal' },
    ] as unknown as React.ComponentProps<typeof LaunchBar>['windows'];
    const { container } = render(<LaunchBar windows={windows} />);
    fireEvent.click(container.querySelector('[data-app="files"]')!);
    expect(document.body.querySelector<HTMLElement>('[data-shell-popup]')?.dataset.popoverSide).toBe('top');
  });

  it("lists Evo's windows of one app: a count, then pick or close one by its window id", () => {
    fake.apps = [app('terminal')];
    fake.views = {
      terminal: {
        appId: 'terminal',
        windows: [
          { windowId: 7, titleLabel: 'Terminal · ~', focused: true, minimized: false },
          { windowId: 9, titleLabel: '', focused: false, minimized: true },
        ] as unknown as AppWindowView['windows'],
      },
    };
    const onToggleApp = vi.fn();
    const onCloseAppWindow = vi.fn();
    const { container } = render(
      <LaunchBar windows={[]} onToggleApp={onToggleApp} onCloseAppWindow={onCloseAppWindow} />
    );
    const icon = container.querySelector<HTMLElement>('[data-app="terminal"]')!;
    expect(icon.textContent).toContain('2');
    expect(icon.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(icon);
    expect(onToggleApp).not.toHaveBeenCalled();
    const rows = [...document.body.querySelectorAll<HTMLElement>('[data-window-row]')];
    expect(rows.map((r) => r.textContent)).toEqual(['Terminal · ~', 'Terminal 2 (Minimized)']);
    fireEvent.click(document.body.querySelector('[aria-label="Close Terminal 2"]')!);
    expect(onCloseAppWindow).toHaveBeenCalledWith('terminal', 9);
    fireEvent.click(rows[1]!);
    expect(onToggleApp).toHaveBeenCalledWith('terminal', 9);
    expect(document.body.querySelector('[data-shell-popup]')).toBeNull();
  });

  it('puts the popover away on Escape and on a press outside it', () => {
    fake.apps = [app('files')];
    const windows = [
      { id: 'w1', appId: 'files', title: 'One', state: 'normal' },
      { id: 'w2', appId: 'files', title: 'Two', state: 'normal' },
    ] as unknown as React.ComponentProps<typeof LaunchBar>['windows'];
    const { container } = render(<LaunchBar windows={windows} />);
    const icon = container.querySelector('[data-app="files"]')!;
    fireEvent.click(icon);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.body.querySelector('[data-shell-popup]')).toBeNull();
    fireEvent.click(icon);
    fireEvent.pointerDown(document.body);
    expect(document.body.querySelector('[data-shell-popup]')).toBeNull();
  });

  it('scrolls its app strip rather than overflowing, on the bar and the rail', () => {
    fake.apps = [app('files')];
    const { container, unmount } = render(<LaunchBar windows={[]} />);
    const strip = container.querySelector<HTMLElement>('[data-launch-bar-apps]')!;
    expect(strip.style.overflowX).toBe('auto');
    expect(strip.style.minWidth).toBe('0px');
    unmount();
    fake.position = 'left';
    const rail = render(<LaunchBar windows={[]} />).container.querySelector<HTMLElement>('[data-launch-bar-apps]')!;
    expect(rail.style.overflowY).toBe('auto');
    expect(rail.style.minHeight).toBe('0px');
  });

  it('the dashboard on the rail is the count alone, with no chips', () => {
    fake.position = 'left';
    const { container } = render(
      <LaunchBar windows={[]} dashboard={dashboard([notification('a', 1), notification('b', 2), notification('c', 3)])} />
    );
    expect(container.querySelector('[data-dashboard-chip]')).toBeNull();
    expect(container.querySelector<HTMLElement>('[data-dashboard]')?.dataset.dashboard).toBe('rail');
    expect(container.querySelector('[data-dashboard-count]')?.textContent).toBe('3');
  });

  it('the dashboard on the bottom bar still has its chips', () => {
    const { container } = render(dashboard([notification('a', 1)]));
    expect(container.querySelectorAll('[data-dashboard-chip]')).toHaveLength(1);
    expect(container.querySelector<HTMLElement>('[data-dashboard]')?.dataset.dashboard).toBe('bar');
  });
});

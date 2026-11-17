import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  echoClient,
  NOTIFICATION_IFACE,
  NOTIFICATION_SIGNALS,
  type NotificationEntry,
} from '@pyxis/app-sdk';
import type { DesktopApp } from '../../hooks/useApps';
import { TopSystemBar } from '../TopSystemBar';
import { NotificationToasts, DASHBOARD_ANCHOR, LAUNCH_BAR_HEIGHT } from '../NotificationToasts';
import { NotificationCenter } from '../NotificationCenter';

/**
 * Lane N of the identity plan: the status strip (ink straight on the
 * wallpaper, no slab), the search box in it, and notifications rising from
 * the launch bar's dashboard at the bottom right instead of a Bell top right.
 */

const fake = vi.hoisted(() => ({ apps: [] as DesktopApp[] }));

vi.mock('../../hooks/useApps', () => ({
  useApps: () => ({
    apps: fake.apps,
    byId: (id: string) => fake.apps.find((a) => a.id === id),
    pinned: [],
    loading: false,
    error: null,
    refresh: async () => {},
  }),
}));

function app(id: string, name: string): DesktopApp {
  return {
    id,
    name,
    info: {} as DesktopApp['info'],
    entryUrl: null,
    defaultSize: { width: 800, height: 600 },
    category: 'pim',
    pinned: false,
  };
}

function entry(id: string, extra: Partial<NotificationEntry> = {}): NotificationEntry {
  return { id, title: `Title ${id}`, body: `Body ${id}`, timestamp: Date.now(), timeout: 0, ...extra };
}

afterEach(() => {
  cleanup();
  fake.apps = [];
});

describe('the status strip', () => {
  function strip(props: Partial<React.ComponentProps<typeof TopSystemBar>> = {}) {
    return render(
      <TopSystemBar
        quickSettingsOpen={false}
        onToggleQuickSettings={() => {}}
        onLaunchApp={() => {}}
        {...props}
      />
    );
  }

  it('has no background: ink on the wallpaper, with a legibility shadow', () => {
    const { container } = strip();
    const header = container.querySelector<HTMLElement>('[data-status-strip]')!;
    // Nothing behind the ink: no slab, no blur, no border.
    expect(['', 'transparent', 'none']).toContain(header.style.background);
    expect(header.style.backgroundColor || 'transparent').toBe('transparent');
    expect(header.style.backdropFilter).toBe('');
    expect(header.style.borderBottom).toBe('');
    // The tint's ink (useShellTint writes it), shadowed in its opposite tone.
    expect(header.style.color).toBe('var(--px-ink)');
    expect(header.style.textShadow).toContain('var(--px-ink-shadow)');
  });

  it('is 36 px high and keeps the shell-region and top-edge markers', () => {
    const { container } = strip();
    const header = container.querySelector<HTMLElement>('[data-status-strip]')!;
    expect(header.style.height).toBe('36px');
    expect(header.hasAttribute('data-shell-region')).toBe(true);
    expect(header.getAttribute('data-shell-edge')).toBe('top');
  });

  it('draws the clock in display type: weekday, then the time in bold', () => {
    const { container } = strip();
    const clock = container.querySelector<HTMLElement>('[data-strip-clock]')!;
    expect(clock.style.fontFamily).toBe('var(--px-font-display)');
    expect(clock.style.textTransform).toBe('uppercase');
    expect(clock.textContent).toMatch(/^(Sun|Mon|Tues|Wednes|Thurs|Fri|Satur)day/);
    expect(clock.querySelector('b')?.textContent).toMatch(/^\d{1,2}:\d{2}$/);
  });

  it('has no Bell: notifications moved to the launch bar', () => {
    strip({ notificationCount: 3, notificationsOpen: false, onToggleNotifications: () => {} });
    expect(screen.queryByRole('button', { name: /notifications/i })).toBeNull();
  });

  it('opens quick settings from the status cluster', () => {
    const toggle = vi.fn();
    strip({ onToggleQuickSettings: toggle, quickSettingsOpen: true });
    const cluster = screen.getByRole('button', { name: 'Quick settings' });
    expect(cluster.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(cluster);
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('search is a quiet underline that says "Just type", and its panel is the material', async () => {
    fake.apps = [app('notes', 'Notes')];
    const launch = vi.fn();
    const { container } = strip({ onLaunchApp: launch });
    const box = container.querySelector<HTMLElement>('[data-search-box]')!;
    expect(box.className).toContain('px-strip-search');
    expect(box.style.background).toBe('');
    const input = screen.getByRole('textbox', { name: 'Search' });
    expect(input.getAttribute('placeholder')).toBe('Just type');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'no' } });
    const panel = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-search-panel]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(panel.style.background).toBe('var(--px-material-strong)');
    expect(panel.style.color).toBe('var(--px-material-ink)');
    expect(panel.style.borderRadius).toBe('var(--px-corner)');
    expect(panel.querySelector<HTMLElement>('[data-search-head]')!.style.fontFamily).toBe('var(--px-font-display)');

    // Enter launches the top hit, as before.
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(launch).toHaveBeenCalledWith('notes', 'Notes');
  });
});

describe('toasts rise from the dashboard', () => {
  it('anchors bottom right, 8 px above the 64 px launch bar, and stacks upward', async () => {
    expect(LAUNCH_BAR_HEIGHT).toBe(64);
    expect(DASHBOARD_ANCHOR).toEqual({ bottom: 72, right: 12 });

    const { container } = render(<NotificationToasts />);
    const stack = container.querySelector<HTMLElement>('[aria-live="polite"]')!;
    expect(stack.style.bottom).toBe('72px');
    expect(stack.style.right).toBe('12px');
    expect(stack.style.top).toBe('');
    // Newest first in the DOM, drawn lowest (nearest the dashboard).
    expect(stack.style.flexDirection).toBe('column-reverse');

    await act(() =>
      echoClient.emitSignal(NOTIFICATION_IFACE, NOTIFICATION_SIGNALS.shown, { notification: entry('a') })
    );
    await act(() =>
      echoClient.emitSignal(NOTIFICATION_IFACE, NOTIFICATION_SIGNALS.shown, { notification: entry('b') })
    );
    const toasts = [...stack.querySelectorAll<HTMLElement>('[role="status"]')];
    expect(toasts.map((t) => t.dataset.notificationId)).toEqual(['b', 'a']);
    expect(toasts[0].style.background).toBe('var(--px-material-strong)');
    expect(toasts[0].style.borderRadius).toBe('var(--px-corner)');
    expect(toasts[0].style.transformOrigin).toBe('bottom right');
  });

  it("shows the app's name and waterdrop icon", async () => {
    fake.apps = [app('tasks', 'Tasks')];
    const { container } = render(<NotificationToasts />);
    await act(() =>
      echoClient.emitSignal(NOTIFICATION_IFACE, NOTIFICATION_SIGNALS.shown, {
        notification: entry('t', { appId: 'tasks' }),
      })
    );
    const toast = container.querySelector<HTMLElement>('[data-notification-id="t"]')!;
    expect(toast.textContent).toContain('Tasks');
    const icon = toast.querySelector<HTMLElement>('[data-app-drop="tasks"]')!;
    expect(icon.style.borderRadius).toMatch(/^\d+px \d+px \d+px \d+px$/);
  });
});

describe('the notification centre opens upward from the dashboard', () => {
  function centre(props: Partial<React.ComponentProps<typeof NotificationCenter>> = {}) {
    return render(
      <NotificationCenter
        isOpen
        onOpenChange={() => {}}
        notifications={[entry('x', { appId: 'tasks' }), entry('y')]}
        onDismiss={() => {}}
        onClearAll={() => {}}
        {...props}
      />
    );
  }

  it('is anchored bottom right, waterdrop corner, strong material, display head', () => {
    fake.apps = [app('tasks', 'Tasks')];
    centre();
    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    expect(panel.style.bottom).toBe('72px');
    expect(panel.style.right).toBe('12px');
    expect(panel.style.top).toBe('');
    expect(panel.style.transformOrigin).toBe('bottom right');
    expect(panel.style.borderRadius).toBe('var(--px-corner)');
    expect(panel.style.background).toBe('var(--px-material-strong)');
    expect(panel.style.color).toBe('var(--px-material-ink)');
    const head = panel.querySelector<HTMLElement>('[data-notification-head]')!;
    expect(head.style.fontFamily).toBe('var(--px-font-display)');
    expect(head.style.textTransform).toBe('uppercase');
    // Rows carry the app's name (Nova's, not the id) and its icon.
    const row = panel.querySelector<HTMLElement>('[data-notification-id="x"]')!;
    expect(row.textContent).toContain('Tasks ·');
    expect(row.querySelector('[data-app-drop="tasks"]')).not.toBeNull();
    expect(panel.querySelector('[data-notification-id="y"]')!.textContent).toContain('System ·');
  });

  it('dismisses, clears and closes as before', () => {
    const dismiss = vi.fn();
    const clear = vi.fn();
    const openChange = vi.fn();
    centre({ onDismiss: dismiss, onClearAll: clear, onOpenChange: openChange });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss Title x' }));
    expect(dismiss).toHaveBeenCalledWith('x');
    fireEvent.click(screen.getByRole('button', { name: /clear all/i }));
    expect(clear).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(openChange).toHaveBeenCalledWith(false);
  });

  it('says all caught up when empty', () => {
    centre({ notifications: [] });
    expect(screen.getByText('All caught up')).toBeTruthy();
  });
});

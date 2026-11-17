import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { echoClient, NOTIFICATION_IFACE, NOTIFICATION_SIGNALS, type NotificationEntry } from '@pyxis/app-sdk';
import { NotificationToasts } from '../NotificationToasts';
import { DASHBOARD_ANCHOR, RAIL_ANCHOR, notificationAnchor } from '../launchBarState';
import { NotificationCenter } from '../NotificationCenter';
import { AppDrawer } from '../AppDrawer';

/**
 * Where toasts and the notification centre come out of follows the launch
 * bar's placement (`pyxis.launchBar.position`): the dashboard's corner at the
 * bottom right with the bar along the bottom, 12 px clear of the rail at the
 * bottom left with the bar down the left. The setting is stood in for, so
 * each test says which placement it is about.
 */

const fake = vi.hoisted(() => ({ position: 'bottom' as 'bottom' | 'left' }));

vi.mock('../../hooks/useApps', () => ({
  useApps: () => ({ apps: [], byId: () => undefined, pinned: [], loading: false, error: null, refresh: async () => {} }),
}));

vi.mock('@pyxis/app-sdk', async (importOriginal) => {
  const sdk = await importOriginal<typeof import('@pyxis/app-sdk')>();
  return {
    ...sdk,
    useAppHost: () => ({
      sessions: {},
      stateForApp: () => null,
      sessionForApp: () => null,
    }),
    useSetting: <T,>(key: string, fallback: T) =>
      (key === sdk.SETTING_KEYS.launchBarPosition ? fake.position : fallback) as T,
  };
});

function entry(id: string): NotificationEntry {
  return { id, title: `Title ${id}`, body: `Body ${id}`, timestamp: Date.now(), timeout: 0 };
}

afterEach(() => {
  cleanup();
  fake.position = 'bottom';
});

describe('the anchors', () => {
  it('are the dashboard corner on the bar and 12 px clear of the 64 px rail', () => {
    expect(DASHBOARD_ANCHOR).toEqual({ bottom: 72, right: 12 });
    expect(RAIL_ANCHOR).toEqual({ bottom: 12, left: 76 });
    expect(notificationAnchor(false).style).toEqual({ bottom: 72, right: 12 });
    expect(notificationAnchor(false).origin).toBe('bottom right');
    expect(notificationAnchor(true).style).toEqual({ bottom: 12, left: 76 });
    expect(notificationAnchor(true).origin).toBe('bottom left');
  });
});

describe('toasts', () => {
  it('rise from the bottom right on the bar', () => {
    const { container } = render(<NotificationToasts />);
    const stack = container.querySelector<HTMLElement>('[aria-live="polite"]')!;
    expect(stack.dataset.toasts).toBe('bar');
    expect(stack.style.bottom).toBe('72px');
    expect(stack.style.right).toBe('12px');
    expect(stack.style.left).toBe('');
  });

  it('rise from beside the rail at the bottom left, still stacking upward', async () => {
    fake.position = 'left';
    const { container } = render(<NotificationToasts />);
    const stack = container.querySelector<HTMLElement>('[aria-live="polite"]')!;
    expect(stack.dataset.toasts).toBe('rail');
    expect(stack.style.bottom).toBe('12px');
    expect(stack.style.left).toBe('76px');
    expect(stack.style.right).toBe('');
    expect(stack.style.flexDirection).toBe('column-reverse');

    await act(() => echoClient.emitSignal(NOTIFICATION_IFACE, NOTIFICATION_SIGNALS.shown, { notification: entry('a') }));
    const toast = stack.querySelector<HTMLElement>('[role="status"]')!;
    expect(toast.style.transformOrigin).toBe('bottom left');
  });
});

describe('the notification centre', () => {
  function centre() {
    return render(
      <NotificationCenter
        isOpen
        onOpenChange={() => {}}
        notifications={[entry('x')]}
        onDismiss={() => {}}
        onClearAll={() => {}}
      />
    );
  }

  it('opens upward from the bottom right on the bar', () => {
    centre();
    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    expect(panel.dataset.notificationCentre).toBe('bar');
    expect(panel.style.bottom).toBe('72px');
    expect(panel.style.right).toBe('12px');
    expect(panel.style.left).toBe('');
    expect(panel.style.transformOrigin).toBe('bottom right');
  });

  it('opens upward from beside the rail at the bottom left', () => {
    fake.position = 'left';
    centre();
    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    expect(panel.dataset.notificationCentre).toBe('rail');
    expect(panel.style.bottom).toBe('12px');
    expect(panel.style.left).toBe('76px');
    expect(panel.style.right).toBe('');
    expect(panel.style.transformOrigin).toBe('bottom left');
  });
});

describe('the app drawer', () => {
  it('opens above the Apps button at the bar\'s left end', () => {
    const { container } = render(<AppDrawer isOpen onClose={() => {}} />);
    const panel = container.querySelector<HTMLElement>('[data-app-drawer-panel]')!;
    expect(panel.dataset.appDrawerPanel).toBe('bar');
    expect(panel.style.bottom).toBe('72px');
    expect(panel.style.left).toBe('12px');
    expect(panel.style.transformOrigin).toBe('bottom left');
  });

  it('opens beside the left rail when the bar is on the left', () => {
    fake.position = 'left';
    const { container } = render(<AppDrawer isOpen onClose={() => {}} />);
    const panel = container.querySelector<HTMLElement>('[data-app-drawer-panel]')!;
    expect(panel.dataset.appDrawerPanel).toBe('rail');
    expect(panel.style.left).toBe('76px');
    expect(panel.style.top).toBe('44px');
    expect(panel.style.bottom).toBe('');
    expect(panel.style.transformOrigin).toBe('top left');
  });
});

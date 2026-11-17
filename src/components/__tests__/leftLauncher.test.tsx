import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { AppLifecycleState, AppManifest, AppSession } from '@pyxis/app-sdk';
import type { DesktopApp } from '../../hooks/useApps';
import { LeftLauncher } from '../LeftLauncher';

const fake = vi.hoisted(() => ({
  pinned: [] as DesktopApp[],
  sessions: {} as Record<string, AppSession>,
  manifests: [] as AppManifest[],
  theme: 'light' as 'light' | 'dark',
}));

vi.mock('../../hooks/useApps', () => ({
  useApps: () => ({
    apps: fake.pinned,
    byId: (id: string) => fake.pinned.find((a) => a.id === id),
    pinned: fake.pinned,
    loading: false,
    error: null,
    refresh: async () => {},
  }),
}));

vi.mock('@pyxis/app-sdk', async (importOriginal) => {
  const sdk = await importOriginal<typeof import('@pyxis/app-sdk')>();
  return {
    ...sdk,
    useAppHost: () => ({
      sessions: fake.sessions,
      manifests: fake.manifests,
      stateForApp: (id: string) => Object.values(fake.sessions).find((s) => s.appId === id)?.state ?? null,
      sessionForApp: (id: string) => Object.values(fake.sessions).find((s) => s.appId === id) ?? null,
    }),
    usePyxisTheme: () => fake.theme,
  };
});

function pinnedApp(id: string): DesktopApp {
  return {
    id,
    name: id[0].toUpperCase() + id.slice(1),
    pinned: true,
    entryUrl: null,
    defaultSize: { width: 800, height: 600 },
    category: 'system',
    info: {} as DesktopApp['info'],
  };
}

function session(appId: string, state: AppLifecycleState, pid = 100): AppSession {
  return { sessionId: `s-${appId}`, appId, pid, startedAt: 0, state };
}

afterEach(() => {
  cleanup();
  fake.pinned = [];
  fake.sessions = {};
  fake.manifests = [];
  fake.theme = 'light';
});

describe('LeftLauncher', () => {
  it('preserves the flipped Repanel shell, unflipped content wrapper, and theme variant', () => {
    fake.pinned = [pinnedApp('terminal'), pinnedApp('files')];
    const { container, rerender } = render(
      <LeftLauncher appDrawerOpen={false} onOpenAppDrawer={() => {}} />
    );

    const root = container.querySelector<HTMLElement>('[data-left-launcher]')!;
    expect(root.style.position).toBe('fixed');
    expect(root.style.left).toBe('0px');
    expect(root.style.bottom).toBe('0px');
    expect(root.style.transform).toBe('scaleX(-1)');

    expect(container.querySelector('.mochi-panel--default')).not.toBeNull();

    const content = container.querySelector<HTMLElement>('[data-launcher-content]')!;
    expect(content.style.transform).toBe('scaleX(-1)');
    expect(content.style.paddingLeft).toBe('16px');
    expect(content.style.boxSizing).toBe('border-box');

    fake.theme = 'dark';
    rerender(<LeftLauncher appDrawerOpen={false} onOpenAppDrawer={() => {}} />);
    expect(container.querySelector('.mochi-panel--shadow')).not.toBeNull();
  });

  it('keeps the active indicator bar inside .mochi-panel-body bounds in normal (64px) and compact (40px) modes', () => {
    fake.pinned = [pinnedApp('terminal'), pinnedApp('files')];

    // Normal mode: 64px panel - 2px top border = 62px inner height; 42px item -> 10px bottom space
    const { container, rerender } = render(
      <LeftLauncher activeApp="files" appDrawerOpen={false} onOpenAppDrawer={() => {}} />
    );
    const normalBar = container.querySelector<HTMLElement>('[data-launcher-app="files"] [data-active-indicator]')!;
    expect(normalBar).not.toBeNull();
    expect(normalBar.style.height).toBe('2px');
    const normalBottom = parseFloat(normalBar.style.bottom);
    // Item bottom is 52px inside 62px body; bar bottom edge = 52 - normalBottom.
    expect(normalBottom).toBe(-6);
    expect(52 - normalBottom).toBeLessThanOrEqual(62);

    // Compact mode: 40px panel - 2px top border = 38px inner height; 34px item -> 2px bottom space
    rerender(
      <LeftLauncher activeApp="files" isCompact appDrawerOpen={false} onOpenAppDrawer={() => {}} />
    );
    const compactBar = container.querySelector<HTMLElement>('[data-launcher-app="files"] [data-active-indicator]')!;
    expect(compactBar).not.toBeNull();
    expect(compactBar.style.height).toBe('2px');
    const compactBottom = parseFloat(compactBar.style.bottom);
    // Item bottom is 36px inside 38px body; bar sits flush within the 2px bottom space (<= 38px).
    expect(compactBottom).toBe(-2);
    expect(36 - compactBottom).toBeLessThanOrEqual(38);
  });

  it('positions the crashed warning badge and right padding clear of the flipped 45px scalloped corner', () => {
    fake.pinned = [pinnedApp('terminal'), pinnedApp('files')];
    fake.sessions = { a: session('files', 'crashed') };

    const SCALLOP_R = 45;
    const BADGE_R = 8; // 16x16 circular badge

    const checkClearance = (container: HTMLElement, itemTopY: number) => {
      const content = container.querySelector<HTMLElement>('[data-launcher-content]')!;
      const paddingRight = parseFloat(content.style.paddingRight);
      const badge = container.querySelector<HTMLElement>('[data-launcher-app="files"] [data-crashed-badge]')!;
      expect(badge).not.toBeNull();
      expect(badge.style.top).toBe('0px');
      expect(badge.style.right).toBe('0px');

      // Rightmost item's top-right corner (paddingRight, itemTopY) must lie inside the 45px corner arc.
      const cornerDist = Math.hypot(SCALLOP_R - paddingRight, SCALLOP_R - itemTopY);
      expect(cornerDist).toBeLessThanOrEqual(SCALLOP_R);

      // The circular crashed badge at top: 0, right: 0 must also lie strictly inside the 45px arc.
      const badgeCenterDist = Math.hypot(
        SCALLOP_R - (paddingRight + BADGE_R),
        SCALLOP_R - (itemTopY + BADGE_R)
      );
      expect(badgeCenterDist + BADGE_R).toBeLessThanOrEqual(SCALLOP_R);
    };

    // Normal mode: item top is (62 - 42) / 2 = 10px below .mochi-panel-body top.
    const { container, rerender } = render(
      <LeftLauncher appDrawerOpen={false} onOpenAppDrawer={() => {}} />
    );
    checkClearance(container, 10);

    // Compact mode: item top is (38 - 34) / 2 = 2px below .mochi-panel-body top.
    rerender(<LeftLauncher isCompact appDrawerOpen={false} onOpenAppDrawer={() => {}} />);
    checkClearance(container, 2);
  });

  it('preserves click, drawer, tooltip, and non-crashed lifecycle dot behavior', () => {
    fake.pinned = [pinnedApp('terminal'), pinnedApp('files')];
    fake.sessions = { a: session('terminal', 'running', 4242) };
    fake.manifests = [{ id: 'terminal', name: 'Terminal', version: '1.2.3' } as AppManifest];

    const onAppSelect = vi.fn();
    const onOpenAppDrawer = vi.fn();
    const { container } = render(
      <LeftLauncher
        appDrawerOpen
        onAppSelect={onAppSelect}
        onOpenAppDrawer={onOpenAppDrawer}
      />
    );

    const drawerWrapper = container.querySelector<HTMLElement>('[title="App Drawer"]')!;
    const drawerButton = drawerWrapper.querySelector<HTMLElement>('[role="button"]')!;
    expect(drawerButton.className).toContain('selected');
    fireEvent.click(drawerButton);
    expect(onOpenAppDrawer).toHaveBeenCalledTimes(1);

    const termWrapper = container.querySelector<HTMLElement>('[data-launcher-app="terminal"]')!;
    expect(termWrapper.getAttribute('title')).toBe('Terminal · terminal v1.2.3 · running (pid 4242)');
    fireEvent.mouseEnter(termWrapper);
    fireEvent.click(termWrapper.querySelector<HTMLElement>('[role="button"]')!);
    fireEvent.mouseLeave(termWrapper);
    expect(onAppSelect).toHaveBeenCalledWith('terminal');
  });
});

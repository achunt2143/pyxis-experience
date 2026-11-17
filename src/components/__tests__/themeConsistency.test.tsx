import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MotionProvider } from '../../MotionProvider';
import { getAppAccent } from '../../apps/registry';
import type { DesktopApp } from '../../hooks/useApps';
import type { DesktopWindowType } from '../../types';
import { QuickSettingsMenu } from '../QuickSettingsMenu';
import { DesktopWindow } from '../DesktopWindow';
import { AppDrawer } from '../AppDrawer';
import { CardOverview } from '../CardOverview';
import { PrivilegePromptDialog } from '../PrivilegePromptDialog';
import { LaunchBar } from '../LaunchBar';

const fake = vi.hoisted(() => ({
  motionMode: 'reduced' as 'full' | 'reduced' | 'none',
  crashedAppId: '' as string,
  apps: [
    {
      id: 'files',
      name: 'Files',
      info: {} as DesktopApp['info'],
      entryUrl: null,
      defaultSize: { width: 720, height: 500 },
      category: 'system',
      pinned: true,
    },
  ] as DesktopApp[],
  windowCounts: {} as Record<string, number>,
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
    views: [],
    viewForApp: (id: string) =>
      fake.windowCounts[id]
        ? {
            appId: id,
            appWindows: Array.from({ length: fake.windowCounts[id] }, (_, i) => ({
              id: i + 1,
              title: `${id} ${i + 1}`,
              appId: id,
              minimized: false,
            })),
          }
        : undefined,
  }),
}));

vi.mock('@pyxis/app-sdk', async (importOriginal) => {
  const sdk = await importOriginal<typeof import('@pyxis/app-sdk')>();
  return {
    ...sdk,
    useAnimationMode: () => fake.motionMode,
    authenticatePrivilege: vi.fn().mockResolvedValue({ ok: false, error: 'Incorrect password' }),
    useAppHost: () => ({
      sessions: {},
      stateForApp: (id: string) => (id === fake.crashedAppId ? 'crashed' : 'running'),
      sessionForApp: (id: string) =>
        id === fake.crashedAppId
          ? { appId: id, state: 'crashed', pid: 42 }
          : { appId: id, state: 'running', pid: 10 },
      surfacesForApp: () => [],
      relaunch: vi.fn().mockResolvedValue(undefined),
    }),
  };
});

function srcFile(rel: string): string {
  return readFileSync(resolve(__dirname, '../..', rel), 'utf8');
}

const originalResizeObserver = globalThis.ResizeObserver;

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

afterAll(() => {
  if (originalResizeObserver === undefined) {
    delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  } else {
    globalThis.ResizeObserver = originalResizeObserver;
  }
});

afterEach(() => {
  cleanup();
  fake.motionMode = 'reduced';
  fake.crashedAppId = '';
  fake.windowCounts = {};
  delete document.documentElement.dataset.motion;
});

describe('Theme and Remochi 0.5.1 consistency across Bloom shell', () => {
  it('guards index.css media dark overrides behind :not([data-mochi-theme]) and exposes dark/light extensions cleanly', () => {
    const css = srcFile('index.css');
    expect(css).toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-mochi-theme\]\)/);
    expect(css).toContain('[data-mochi-theme="dark"]');
    expect(css).toContain('[data-mochi-theme="light"]');
    expect(css).toContain('color: inherit;');
    expect(css).not.toMatch(/::-webkit-scrollbar-track\s*\{[^}]*--color-secondary/);
    expect(css).toMatch(/::-webkit-scrollbar-track\s*\{[^}]*background:\s*transparent;/);
  });

  it('wires usePyxisAccessibility into App and OverlayApp and syncs data-motion from MotionProvider', () => {
    expect(srcFile('App.tsx')).toContain('usePyxisAccessibility()');
    expect(srcFile('overlay/OverlayApp.tsx')).toContain('usePyxisAccessibility()');

    fake.motionMode = 'none';
    render(
      <MotionProvider>
        <span>ok</span>
      </MotionProvider>
    );
    expect(document.documentElement.dataset.motion).toBe('none');
  });

  it('uses opaque fallback surface tokens for unknown app accents', () => {
    const accent = getAppAccent('non-existent-app');
    expect(accent.bg).toContain('--mochi-panel-bg');
    expect(accent.bg).not.toContain('--mochi-hover');
    expect(accent.bg).not.toContain('--mochi-surface');
  });

  it('QuickSettingsMenu fixes TileSwitch dark contrast, wraps power actions cleanly, and styles mute in light/dark mode', () => {
    const qsCss = srcFile('components/QuickSettingsMenu.css');
    expect(qsCss).toContain('--mochi-toggle-knob: #ffffff;');
    expect(qsCss).toContain('--px-qs-switch-off:');
    expect(qsCss).toContain("[data-mochi-theme='dark'] .px-qs-tile[data-on='true']");
    expect(qsCss).toContain(".px-qs-mute[data-muted='true']");

    render(<QuickSettingsMenu isOpen={true} onOpenChange={() => {}} />);

    const toggleTrack = document.querySelector<HTMLElement>('.px-qs-tile .mochi-toggle-button');
    expect(toggleTrack).not.toBeNull();
    expect(toggleTrack!.style.getPropertyValue('--mochi-toggle-knob')).toBe('#ffffff');

    const powerButtons = document.querySelectorAll<HTMLElement>('.px-qs-power');
    expect(powerButtons.length).toBe(5);
    const powerRow = powerButtons[0].parentElement!;
    expect(powerRow.style.flexWrap).toBe('wrap');
    expect(powerButtons[0].style.flex).toContain('1 1 auto');

    const muteButton = document.querySelector<HTMLElement>('.px-qs-mute');
    expect(muteButton).not.toBeNull();
    expect(muteButton!.hasAttribute('data-muted')).toBe(true);
  });

  it('CardOverview delegates close hover contrast and status pill readability to CardOverview.css', () => {
    const overviewCss = srcFile('components/CardOverview.css');
    expect(overviewCss).toContain('.px-card-close:hover');
    expect(overviewCss).toContain("[data-px-tint='dark'] .px-card-close:hover");
    expect(overviewCss).toContain(".px-card-status[data-status='starting']");
    expect(overviewCss).toContain('var(--px-material-strong)');

    const win: DesktopWindowType = {
      id: 'w1',
      title: 'Files',
      appId: 'files',
      state: 'minimized',
      position: { x: 0, y: 0 },
      size: { width: 720, height: 500 },
      zIndex: 1,
      innerWidth: 720,
      innerHeight: 500,
    };
    render(
      <CardOverview
        isOpen={true}
        windows={[win]}
        onSelectWindow={() => {}}
        onCloseWindow={() => {}}
      />
    );
    expect(document.querySelector('.px-card-close')).not.toBeNull();
    const statusPill = document.querySelector<HTMLElement>('.px-card-status');
    expect(statusPill).not.toBeNull();
    expect(statusPill!.getAttribute('data-status')).toBe('minimized');
  });

  it('DesktopWindow fixes crashed button red contrast, empty stripes, and inactive muted contrast', () => {
    fake.crashedAppId = 'unknown-app';
    const win: DesktopWindowType = {
      id: 'w1',
      title: 'Missing App',
      appId: 'unknown-app',
      state: 'normal',
      position: { x: 20, y: 20 },
      size: { width: 640, height: 480 },
      zIndex: 1,
      innerWidth: 640,
      innerHeight: 480,
    };

    const { container } = render(
      <DesktopWindow window={win} isActive={false}>
        {undefined}
      </DesktopWindow>
    );

    const helperLine = screen.getByText(/Register one in/i);
    expect(helperLine.style.color).toBe('var(--color-text-secondary)');
    expect(container.innerHTML).not.toContain('var(--color-text-muted)');

    const relaunchBtn = screen.getByRole('button', { name: /Relaunch app/i });
    expect(relaunchBtn.style.getPropertyValue('--mochi-error')).toBe('#ff6b6b');
  });

  it('AppDrawer preserves keyboard focus visibility and accessible chip selection contrast', () => {
    const drawerCss = srcFile('components/AppDrawer.css');
    expect(drawerCss).toContain('.px-drawer-app:focus-visible');
    expect(drawerCss).toContain(".px-drawer-chip[aria-selected='true']");
    expect(drawerCss).toContain("[data-px-tint='dark'] .px-drawer-chip[aria-selected='true']");

    render(<AppDrawer isOpen={true} onClose={() => {}} />);
    const tile = document.querySelector<HTMLElement>('.px-drawer-app');
    expect(tile).not.toBeNull();
    expect(tile!.style.outline).not.toBe('none');
  });

  it('ShellDialog & PrivilegePromptDialog support dark mochi theme and accessible error/focus styles', async () => {
    const shellCss = srcFile('components/ShellDialog.css');
    // Buttons and the field are remochi's, which follow its theme themselves.
    expect(shellCss).not.toContain('.px-shell-pill');
    expect(shellCss).toContain('.px-privilege-error');

    render(
      <PrivilegePromptDialog
        request={{
          requestId: 'req-1',
          appId: 'files',
          action: 'mount',
          summary: 'Mount drive',
          reason: 'Administrator access required',
        }}
        onDismiss={() => {}}
      />
    );

    const passwordInput = screen.getByLabelText('Password');
    expect(passwordInput.className).toContain('px-privilege-input');
    expect((passwordInput as HTMLElement).style.outline).not.toBe('none');

    fireEvent.change(passwordInput, { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    const err = await screen.findByRole('alert');
    expect(err.className).toContain('px-privilege-error');
  });

  it('LaunchBar deepens multi-window Badge background for dark/light theme AA contrast', () => {
    const winFor = (id: string): DesktopWindowType => ({
      id,
      title: `Files ${id}`,
      appId: 'files',
      state: 'normal',
      position: { x: 0, y: 0 },
      size: { width: 720, height: 500 },
      zIndex: 1,
      innerWidth: 720,
      innerHeight: 500,
    });
    const { container } = render(
      <LaunchBar
        windows={[winFor('w1'), winFor('w2'), winFor('w3')]}
        onWindowSelect={() => {}}
        onLaunchApp={() => {}}
        onToggleAppDrawer={() => {}}
        onToggleOverview={() => {}}
      />
    );
    const badgeInner = container.querySelector<HTMLElement>('.mochi-badge-inner');
    expect(badgeInner).not.toBeNull();
    expect(badgeInner!.style.background).toContain('color-mix(in srgb, var(--color-primary');
  });
});

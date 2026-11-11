import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import {
  EVO_IFACE,
  EVO_SHORTCUT_SIGNAL,
  MINIMIZE_LANDED_SIGNAL,
  echoClient,
  minimizeTargetPayload,
  setMinimizeTargets,
} from '@pyxis/app-sdk';
import { LandingDip, LandingRipple } from '../../components/DockLanding';
import { landingReducer, useDockLandings } from '../../hooks/useDockLandings';
import { driftReducer, useWallpaperDrift } from '../../hooks/useWallpaperDrift';
import { measureDockIcons } from '../useMinimizeTargets';
import { APP_ACCENTS, appHue } from '../../apps/registry';
import { MotionContext, type MotionApi } from '../../useMotion';
import type { AnimationMode } from '@pyxis/app-sdk';

/**
 * Bloom's half of Lumen (docs/internal/evo-animation-plan.md): the dock
 * ripples when Evo says a window landed in (or rose out of) its icon, the
 * minimize targets carry each app's accent for Evo's Droplet, and the
 * wallpaper drifts in while show desktop has the windows away.
 */

const GECKOS = resolve(__dirname, '../../../../geckos');
const ECHO_IPC_RS = resolve(GECKOS, 'evo/src/enhancements/echo_ipc.rs');
const BRIDGE_MJS = resolve(GECKOS, 'gecko/patches/pyxis/toolkit/actors/PyxisBridgeParent.sys.mjs');
const rust = existsSync(ECHO_IPC_RS) ? readFileSync(ECHO_IPC_RS, 'utf8') : '';
const bridge = existsSync(BRIDGE_MJS) ? readFileSync(BRIDGE_MJS, 'utf8') : '';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function withMode(mode: AnimationMode, children: React.ReactNode) {
  const api: MotionApi = { mode, tr: (t) => t, to: (t) => t };
  return <MotionContext.Provider value={api}>{children}</MotionContext.Provider>;
}

const Dock: React.FC<{ mode?: AnimationMode }> = ({ mode = 'full' }) => {
  const landings = useDockLandings();
  return withMode(
    mode,
    <button data-app="notes" style={{ position: 'relative' }}>
      <LandingDip landing={landings.notes}>
        <span>icon</span>
      </LandingDip>
      <LandingRipple landing={landings.notes} color="#eab308" radius="16px" />
    </button>
  );
};

const land = (app_id: string, phase: string) =>
  act(async () => {
    await echoClient.emitSignal(EVO_IFACE, MINIMIZE_LANDED_SIGNAL, { app_id, window_id: 7, phase, timestamp: 1 });
  });

describe('the dock ripple', () => {
  it('counts landings per app, so each one replays', () => {
    let s = landingReducer({}, { app_id: 'notes', phase: 'land' });
    s = landingReducer(s, { app_id: 'notes', phase: 'rise' });
    s = landingReducer(s, { app_id: 'files', phase: 'land' });
    expect(s).toEqual({ notes: { seq: 2, phase: 'rise' }, files: { seq: 1, phase: 'land' } });
  });

  it('rings and dips the icon on MinimizeLanded, once per signal, for that app only', async () => {
    const { container } = render(<Dock />);
    expect(container.querySelector('[data-landing]')).toBeNull();
    await land('notes', 'land');
    expect(container.querySelector('[data-landing]')?.getAttribute('data-landing')).toBe('1');
    expect(container.querySelector('[data-landing-phase]')?.getAttribute('data-landing-phase')).toBe('land');
    expect(container.querySelector('[data-landing-dip]')).not.toBeNull();
    await land('files', 'land');
    expect(container.querySelector('[data-landing]')?.getAttribute('data-landing')).toBe('1');
    await land('notes', 'rise');
    expect(container.querySelector('[data-landing]')?.getAttribute('data-landing')).toBe('2');
    expect(container.querySelector('[data-landing-phase]')?.getAttribute('data-landing-phase')).toBe('rise');
  });

  it('ignores a malformed signal', async () => {
    const { container } = render(<Dock />);
    await land('notes', 'bounce');
    await land('', 'land');
    expect(container.querySelector('[data-landing]')).toBeNull();
  });

  it('reduced keeps the ring and drops the dip; off draws nothing', async () => {
    const reduced = render(<Dock mode="reduced" />);
    await land('notes', 'land');
    expect(reduced.container.querySelector('[data-landing]')).not.toBeNull();
    expect(reduced.container.querySelector('[data-landing-dip]')).toBeNull();
    reduced.unmount();

    const off = render(<Dock mode="off" />);
    await land('notes', 'land');
    expect(off.container.querySelector('[data-landing]')).toBeNull();
    expect(off.container.querySelector('[data-landing-dip]')).toBeNull();
  });

  it('the dev server mock lands a minimize ~430 ms later and rises a restore at once', async () => {
    const source = readFileSync(resolve(__dirname, '../../../packages/app-sdk/src/EchoClient.ts'), 'utf8');
    const minimize = source.slice(source.indexOf("case 'MinimizeWindow'"), source.indexOf("case 'MaximizeWindow'"));
    expect(minimize).toMatch(/'MinimizeLanded',\s*\{\s*app_id: win\.app_id, window_id: windowId, phase: 'land'/);
    const restore = source.slice(source.indexOf("case 'RestoreWindow'"), source.indexOf("case 'CloseWindow'"));
    expect(restore).toMatch(/'MinimizeLanded',\s*\{\s*app_id: win\.app_id, window_id: windowId, phase: 'rise'/);
  });
});

describe.runIf(rust.includes(`"${MINIMIZE_LANDED_SIGNAL}"`))('the signal Evo sends', () => {
  it('MinimizeLanded carries the fields the SDK reads', () => {
    const at = rust.indexOf(`"${MINIMIZE_LANDED_SIGNAL}"`);
    const near = rust.slice(Math.max(0, at - 600), at + 600);
    for (const key of ['app_id', 'window_id', 'phase']) expect(near).toContain(`"${key}"`);
  });

  it.runIf(bridge.length > 0)('the bridge lets the shell hear it (windows:manage)', () => {
    expect(bridge).toMatch(new RegExp(`${MINIMIZE_LANDED_SIGNAL}[^\\n]*windows:manage`));
  });
});

describe('the accent on each minimize target', () => {
  it('goes to Evo as #rrggbb, and only when valid', () => {
    expect(minimizeTargetPayload({ appId: 'notes', x: 1, y: 2, width: 46, height: 46, accent: '#EAB308' })).toEqual({
      app_id: 'notes',
      x: 1,
      y: 2,
      w: 46,
      h: 46,
      accent: '#eab308',
    });
    const bare = minimizeTargetPayload({ appId: 'weather', x: 0, y: 0, width: 46, height: 46 });
    expect(bare).not.toHaveProperty('accent');
    const bad = minimizeTargetPayload({ appId: 'x', x: 0, y: 0, width: 1, height: 1, accent: 'red' });
    expect(bad).not.toHaveProperty('accent');
  });

  it('is sent with SetMinimizeTargets', async () => {
    const spy = vi.spyOn(echoClient, 'callMethod').mockResolvedValue({ ok: true });
    await setMinimizeTargets([
      { appId: 'notes', x: 10, y: 700, width: 46, height: 46, accent: '#eab308' },
      { appId: 'weather', x: 60, y: 700, width: 46, height: 46 },
    ]);
    expect(spy).toHaveBeenCalledWith('evo', EVO_IFACE, 'SetMinimizeTargets', {
      targets: [
        { app_id: 'notes', x: 10, y: 700, w: 46, h: 46, accent: '#eab308' },
        { app_id: 'weather', x: 60, y: 700, w: 46, h: 46 },
      ],
    });
    spy.mockRestore();
  });

  it('comes from PYXIS_APPS for built-ins and is left out for an app Bloom has no accent for', () => {
    const dock = document.createElement('div');
    dock.setAttribute('data-shell-edge', 'bottom');
    for (const id of ['notes', 'weather']) {
      const b = document.createElement('button');
      b.setAttribute('data-app', id);
      Object.defineProperty(b, 'offsetWidth', { value: 46 });
      Object.defineProperty(b, 'offsetHeight', { value: 46 });
      dock.appendChild(b);
    }
    document.body.appendChild(dock);
    const targets = measureDockIcons(document);
    document.body.removeChild(dock);
    expect(targets.find((t) => t.appId === 'notes')?.accent).toBe(appHue('notes'));
    expect(targets.find((t) => t.appId === 'weather')).not.toHaveProperty('accent');
  });

  it('every built-in accent has a valid hue', () => {
    for (const [id, accent] of Object.entries(APP_ACCENTS)) expect(accent.hue, id).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('the wallpaper drift', () => {
  it('show desktop toggles it; a window coming back or opening ends it', () => {
    expect(driftReducer(false, 'show-desktop')).toBe(true);
    expect(driftReducer(true, 'show-desktop')).toBe(false);
    expect(driftReducer(true, 'window-back')).toBe(false);
    expect(driftReducer(true, 'window-opened')).toBe(false);
    expect(driftReducer(false, 'window-back')).toBe(false);
  });

  it('follows Evo’s signals', async () => {
    const { result } = renderHook(() => useWallpaperDrift());
    expect(result.current).toBe(false);
    await act(() => echoClient.emitSignal(EVO_IFACE, EVO_SHORTCUT_SIGNAL, { action: 'launcher', timestamp: 1 }));
    expect(result.current).toBe(false);
    await act(() => echoClient.emitSignal(EVO_IFACE, EVO_SHORTCUT_SIGNAL, { action: 'show-desktop', timestamp: 1 }));
    expect(result.current).toBe(true);
    await act(() => echoClient.emitSignal(EVO_IFACE, 'WindowMinimized', { window_id: 3, minimized: true }));
    expect(result.current).toBe(true);
    await act(() => echoClient.emitSignal(EVO_IFACE, 'WindowMinimized', { window_id: 3, minimized: false }));
    expect(result.current).toBe(false);
  });
});

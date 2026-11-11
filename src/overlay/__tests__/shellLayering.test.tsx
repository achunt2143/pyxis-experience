import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, renderHook } from '@testing-library/react';
import * as sdk from '@pyxis/app-sdk';
import { resetOverlayRegion, useFullScreenRegion, useOverlayRegionRects } from '../useOverlayRegion';
import { useOverlayKeyboard } from '../useOverlayKeyboard';
import { useWorkArea } from '../useWorkArea';
import { layoutBox, measureDockIcons, useMinimizeTargets } from '../useMinimizeTargets';

/**
 * The shell lives in the overlay, above apps. These check the contracts that
 * make that work: the Evo methods it calls and the bridge that lets it
 * (both read out of their sources, like the other contract suites), and the
 * three things it tells Evo: what it covers, what apps must leave alone, and
 * when it needs the keyboard.
 */

const GECKOS = resolve(__dirname, '../../../../geckos');
const ECHO_IPC_RS = resolve(GECKOS, 'evo/src/enhancements/echo_ipc.rs');
const WORK_AREA_RS = resolve(GECKOS, 'evo/src/shell/work_area.rs');
const MINIMIZE_RS = resolve(GECKOS, 'evo/src/shell/minimize.rs');
const BRIDGE_MJS = resolve(GECKOS, 'gecko/patches/pyxis/toolkit/actors/PyxisBridgeParent.sys.mjs');
const SHELL_LAYER_TSX = resolve(__dirname, '../../components/ShellLayer.tsx');
const SDK_OVERLAY_TS = resolve(__dirname, '../../../packages/app-sdk/src/overlay.ts');

describe.runIf(existsSync(ECHO_IPC_RS))('the Evo methods the shell calls exist', () => {
  const rust = readFileSync(ECHO_IPC_RS, 'utf8');

  it('SetWorkArea takes the four edges the SDK sends', () => {
    expect(rust).toContain('"SetWorkArea" =>');
    const parser = readFileSync(WORK_AREA_RS, 'utf8');
    const sdkSource = readFileSync(SDK_OVERLAY_TS, 'utf8');
    for (const edge of ['top', 'bottom', 'left', 'right']) {
      expect(parser).toContain(`edge("${edge}")`);
      expect(sdkSource).toContain(`${edge}:`);
    }
  });

  it('SetMinimizeTargets takes the fields the SDK sends', () => {
    expect(rust).toContain('"SetMinimizeTargets" =>');
    const parser = readFileSync(MINIMIZE_RS, 'utf8');
    const sdkSource = readFileSync(SDK_OVERLAY_TS, 'utf8');
    for (const [rustKey, sdkKey] of [
      ['app_id', 'app_id'],
      ['x', 'x'],
      ['y', 'y'],
      ['w', 'w'],
      ['h', 'h'],
    ]) {
      expect(parser).toMatch(new RegExp(`"${rustKey}"`));
      expect(sdkSource).toMatch(new RegExp(`\\b${sdkKey}: `));
    }
    expect(rust).toMatch(/"SetMinimizeTargets" =>[\s\S]{0,600}"ok": true/);
  });

  it('SetOverlayFocus takes a boolean `focused`, and its outcome is a signal', () => {
    expect(rust).toContain('"SetOverlayFocus" =>');
    expect(rust).toMatch(/msg\.body\.get\("focused"\)/);
    expect(rust).toMatch(new RegExp(`self\\.emit\\("${sdk.OVERLAY_FOCUS_SIGNAL}"\\s*,\\s*json!\\(\\{[^}]*"focused"`));
  });

  it('GetOverlayState answers what the SDK type promises', () => {
    const at = rust.indexOf('"GetOverlayState" =>');
    expect(at).toBeGreaterThan(-1);
    const handler = rust.slice(at, at + 1200);
    for (const key of ['keyboard', 'rects', 'workArea']) expect(handler).toContain(`"${key}"`);
  });
});

describe.runIf(existsSync(BRIDGE_MJS))('only the shell can call them', () => {
  const bridge = readFileSync(BRIDGE_MJS, 'utf8');

  it('every one is windows:manage, which only trusted ids hold', () => {
    for (const method of ['SetWorkArea', 'SetMinimizeTargets', 'SetOverlayFocus', 'GetOverlayState']) {
      expect(bridge).toMatch(new RegExp(`\\b${method}: "windows:manage"`));
    }
    expect(bridge).toMatch(new RegExp(`\\b${sdk.OVERLAY_FOCUS_SIGNAL}: "windows:manage"`));
  });
});

describe('panels no longer minimize apps to be seen', () => {
  it('launcher, overview and search just open their panel', () => {
    const source = readFileSync(SHELL_LAYER_TSX, 'utf8');
    const handlers = source.slice(source.indexOf('useGlobalShortcuts({'));
    expect(handlers).toMatch(/launcher: \(\) => setAppDrawerOpen/);
    expect(handlers).toMatch(/overview: \(\) => setOverviewOpen/);
    expect(handlers).toMatch(/search: \(\) => window\.dispatchEvent/);
    // Super+D, which is for hiding windows, is Evo's: it knows the stacking
    // order its staggered minimize runs in, so the shell moves nothing.
    expect(handlers).toMatch(/'show-desktop': showDesktop/);
    const body = source.slice(source.indexOf('const showDesktop'), source.indexOf('useGlobalShortcuts({'));
    expect(body).not.toMatch(/minimizeWindow/);
  });
});

describe('the input region is the union of what the shell draws', () => {
  afterEach(() => {
    cleanup();
    resetOverlayRegion();
    vi.restoreAllMocks();
  });

  it('merges the pieces, and drops one when it goes', () => {
    const sent: unknown[] = [];
    vi.spyOn(sdk, 'setOverlayRegion').mockImplementation(async (rects) => {
      sent.push(rects);
      return true;
    });
    const bar = { x: 0, y: 0, width: 1280, height: 44 };
    const dock = { x: 400, y: 700, width: 480, height: 70 };

    const barPiece = renderHook(() => useOverlayRegionRects(() => [bar], true));
    expect(sent.at(-1)).toEqual([bar]);
    renderHook(() => useOverlayRegionRects(() => [dock], true));
    expect(sent.at(-1)).toEqual([bar, dock]);

    barPiece.unmount();
    expect(sent.at(-1)).toEqual([dock]);
  });

  it('a panel takes the whole screen while open, and gives it back', () => {
    const sent: unknown[] = [];
    vi.spyOn(sdk, 'setOverlayRegion').mockImplementation(async (rects) => {
      sent.push(rects);
      return true;
    });
    const view = renderHook(({ open }) => useFullScreenRegion(open), { initialProps: { open: false } });
    expect(sent).toHaveLength(0);
    view.rerender({ open: true });
    expect(sent.at(-1)).toEqual([{ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }]);
    view.rerender({ open: false });
    expect(sent.at(-1)).toEqual([]);
  });
});

describe('the keyboard is asked for only while a panel needs it', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function setup() {
    const asked: boolean[] = [];
    vi.spyOn(sdk, 'setOverlayFocus').mockImplementation(async (focused) => {
      asked.push(focused);
      return true;
    });
    let report: (focused: boolean) => void = () => {};
    vi.spyOn(sdk, 'onOverlayFocusChanged').mockImplementation((callback) => {
      report = callback;
      return () => {};
    });
    const onTaken = vi.fn();
    const view = renderHook(({ wanted }) => useOverlayKeyboard(wanted, onTaken), {
      initialProps: { wanted: false },
    });
    return { asked, onTaken, view, report: (f: boolean) => act(() => report(f)) };
  }

  it('asks when a panel opens, gives it back when it closes, and never before', () => {
    const { asked, view } = setup();
    expect(asked).toEqual([]);
    view.rerender({ wanted: true });
    expect(asked).toEqual([true]);
    view.rerender({ wanted: false });
    expect(asked).toEqual([true, false]);
  });

  it('closes the panels when something else takes the keyboard', () => {
    const { onTaken, view, report } = setup();
    view.rerender({ wanted: true });
    report(true);
    report(false);
    expect(onTaken).toHaveBeenCalledTimes(1);
  });

  it('does not close them for a loss it caused itself, or before it was ever granted', () => {
    const { onTaken, view, report } = setup();
    report(false);
    view.rerender({ wanted: true });
    report(false);
    expect(onTaken).not.toHaveBeenCalled();
    report(true);
    view.rerender({ wanted: false });
    report(false);
    expect(onTaken).not.toHaveBeenCalled();
  });
});

describe('the work area is the bar and the dock', () => {
  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  /** jsdom does no layout: give the element the sizes a browser would. */
  function edge(name: 'top' | 'bottom', offsetHeight: number, bottom = ''): HTMLElement {
    const el = document.createElement('div');
    el.setAttribute('data-shell-edge', name);
    Object.defineProperty(el, 'offsetHeight', { value: offsetHeight });
    if (bottom) el.style.bottom = bottom;
    document.body.append(el);
    return el;
  }

  it('reports the bar height, and the dock with its margin and a gap', () => {
    const sent: unknown[] = [];
    vi.spyOn(sdk, 'setWorkArea').mockImplementation(async (insets) => {
      sent.push(insets);
      return true;
    });
    edge('top', 44);
    edge('bottom', 60, '10px');
    renderHook(() => useWorkArea(true));
    expect(sent.at(-1)).toEqual({ top: 44, bottom: 76 });
  });

  it('keeps the last edges while a fullscreen app hides the bar and dock', () => {
    const sent: unknown[] = [];
    vi.spyOn(sdk, 'setWorkArea').mockImplementation(async (insets) => {
      sent.push(insets);
      return true;
    });
    const bar = edge('top', 44);
    const dock = edge('bottom', 60, '10px');
    renderHook(() => useWorkArea(true));
    bar.remove();
    dock.remove();
    window.dispatchEvent(new Event('resize'));
    expect(sent).toEqual([{ top: 44, bottom: 76 }]);
  });

  it('reports nothing where the shell is not the real layer', () => {
    const spy = vi.spyOn(sdk, 'setWorkArea').mockResolvedValue(true);
    edge('top', 44);
    renderHook(() => useWorkArea(false));
    expect(spy).not.toHaveBeenCalled();
  });

  it('gives the screen back when the shell goes away', () => {
    const sent: unknown[] = [];
    vi.spyOn(sdk, 'setWorkArea').mockImplementation(async (insets) => {
      sent.push(insets);
      return true;
    });
    edge('top', 44);
    const view = renderHook(() => useWorkArea(true));
    view.unmount();
    expect(sent.at(-1)).toEqual({ top: 0, bottom: 0 });
  });
});

describe('the dock tells Evo where its icons are', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  /** jsdom does no layout: give the element the offsets a browser would. */
  function box(el: HTMLElement, left: number, top: number, width: number, height: number) {
    Object.defineProperty(el, 'offsetLeft', { value: left });
    Object.defineProperty(el, 'offsetTop', { value: top });
    Object.defineProperty(el, 'offsetWidth', { value: width });
    Object.defineProperty(el, 'offsetHeight', { value: height });
  }

  /** A fixed dock at (400, 730), with icons inside relative wrappers. */
  function dock(apps: string[]): HTMLElement {
    const root = document.createElement('div');
    root.setAttribute('data-shell-edge', 'bottom');
    box(root, 400, 730, 480, 60);
    apps.forEach((id, i) => {
      const wrap = document.createElement('div');
      box(wrap, 120 + i * 54, 7, 46, 46);
      const icon = document.createElement('button');
      icon.setAttribute('data-app', id);
      box(icon, 0, 0, 46, 46);
      wrap.append(icon);
      root.append(wrap);
      // The wrapper's offsetParent is the dock; the dock's is nothing.
      Object.defineProperty(wrap, 'offsetParent', { value: root });
      Object.defineProperty(icon, 'offsetParent', { value: wrap });
    });
    Object.defineProperty(root, 'offsetParent', { value: null });
    document.body.append(root);
    return root;
  }

  it('measures an icon by layout, up its offsetParent chain', () => {
    const root = dock(['com.pyxis.files']);
    const icon = root.querySelector<HTMLElement>('[data-app]')!;
    expect(layoutBox(icon)).toEqual({ x: 520, y: 737, width: 46, height: 46 });
  });

  it('reports every icon on the dock, once each, skipping ones with no size', () => {
    const root = dock(['a', 'b']);
    const ghost = document.createElement('button');
    ghost.setAttribute('data-app', 'hidden');
    root.append(ghost);
    expect(measureDockIcons().map((t) => t.appId)).toEqual(['a', 'b']);
  });

  it('sends the icons when the dock appears, and not again for the same layout', () => {
    const sent: unknown[] = [];
    vi.spyOn(sdk, 'setMinimizeTargets').mockImplementation(async (targets) => {
      sent.push(targets);
      return true;
    });
    dock(['a', 'b']);
    renderHook(() => useMinimizeTargets(true));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual([
      { appId: 'a', x: 520, y: 737, width: 46, height: 46 },
      { appId: 'b', x: 574, y: 737, width: 46, height: 46 },
    ]);
    window.dispatchEvent(new Event('resize'));
    expect(sent).toHaveLength(1);
  });

  it('sends again when an icon is added and the others shift', () => {
    const sent: sdk.MinimizeTarget[][] = [];
    vi.spyOn(sdk, 'setMinimizeTargets').mockImplementation(async (targets) => {
      sent.push(targets);
      return true;
    });
    const root = dock(['a']);
    renderHook(() => useMinimizeTargets(true));
    root.remove();
    dock(['a', 'b']);
    window.dispatchEvent(new Event('resize'));
    expect(sent.at(-1)?.map((t) => t.appId)).toEqual(['a', 'b']);
  });

  it('keeps the last table while a fullscreen app hides the dock', () => {
    const sent: unknown[] = [];
    vi.spyOn(sdk, 'setMinimizeTargets').mockImplementation(async (targets) => {
      sent.push(targets);
      return true;
    });
    const root = dock(['a']);
    renderHook(() => useMinimizeTargets(true));
    root.remove();
    window.dispatchEvent(new Event('resize'));
    expect(sent).toHaveLength(1);
  });

  it('reports nothing where the shell is not the real layer, and clears on the way out', () => {
    const sent: unknown[] = [];
    vi.spyOn(sdk, 'setMinimizeTargets').mockImplementation(async (targets) => {
      sent.push(targets);
      return true;
    });
    dock(['a']);
    renderHook(() => useMinimizeTargets(false));
    expect(sent).toEqual([]);
    const view = renderHook(() => useMinimizeTargets(true));
    view.unmount();
    expect(sent.at(-1)).toEqual([]);
  });

  it('the SDK sends the wire fields Evo parses, and false when Evo is not there', async () => {
    const calls: unknown[] = [];
    vi.spyOn(sdk.echoClient, 'callMethod').mockImplementation(async (_s, _i, method, args) => {
      calls.push([method, args]);
      return { ok: true };
    });
    expect(await sdk.setMinimizeTargets([{ appId: 'a', x: 1, y: 2, width: 3, height: 4 }])).toBe(true);
    expect(calls).toEqual([['SetMinimizeTargets', { targets: [{ app_id: 'a', x: 1, y: 2, w: 3, h: 4 }] }]]);
    vi.spyOn(sdk.echoClient, 'callMethod').mockRejectedValue(new Error('no echo'));
    expect(await sdk.setMinimizeTargets([])).toBe(false);
  });
});

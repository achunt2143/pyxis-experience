import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import * as sdk from '@pyxis/app-sdk';
import { EVO_IFACE, SWITCHER_SIGNAL, echoClient } from '@pyxis/app-sdk';
import { switcherReducer, useSwitcher, type SwitcherState } from '../../hooks/useSwitcher';

/**
 * Alt+Tab through the overview: Evo keeps the keys and the order and says
 * what it is doing in `SwitcherChanged`; Bloom draws it. These pin the signal
 * (read out of Evo's source and the bridge table), the state that follows it,
 * and the overview in switcher mode.
 */

const GECKOS = resolve(__dirname, '../../../../geckos');
const ECHO_IPC_RS = resolve(GECKOS, 'evo/src/enhancements/echo_ipc.rs');
const SWITCHER_RS = resolve(GECKOS, 'evo/src/shell/switcher.rs');
const BRIDGE_MJS = resolve(GECKOS, 'gecko/patches/pyxis/toolkit/actors/PyxisBridgeParent.sys.mjs');
const SHELL_LAYER_TSX = resolve(__dirname, '../../components/ShellLayer.tsx');

describe.runIf(existsSync(ECHO_IPC_RS))('the signal Evo sends', () => {
  const rust = readFileSync(ECHO_IPC_RS, 'utf8');

  it('SwitcherChanged is emitted with the fields the SDK reads', () => {
    expect(rust).toContain('"SwitcherChanged"');
    expect(rust).toMatch(
      new RegExp(`self\\.emit\\("${SWITCHER_SIGNAL}"\\s*,\\s*json!\\(\\{[^}]*"phase"[^}]*"selected"[^}]*"order"`)
    );
  });

  it('GetSwitcherState exists for the suites', () => {
    expect(rust).toContain('"GetSwitcherState" =>');
  });

  it.runIf(existsSync(SWITCHER_RS))('Evo has exactly the phases the SDK type names', () => {
    const phases = [...readFileSync(SWITCHER_RS, 'utf8').matchAll(/Phase::\w+ => "(\w+)"/g)].map((m) => m[1]).sort();
    expect(phases).toEqual(['cancel', 'commit', 'open', 'step']);
    const sdkType: sdk.SwitcherPhase[] = ['cancel', 'commit', 'open', 'step'];
    expect(sdkType).toEqual(phases);
  });
});

describe.runIf(existsSync(BRIDGE_MJS))('only the shell hears it', () => {
  it('SwitcherChanged is windows:manage at the bridge', () => {
    expect(readFileSync(BRIDGE_MJS, 'utf8')).toMatch(new RegExp(`\\b${SWITCHER_SIGNAL}: "windows:manage"`));
  });
});

describe('the state that follows the signal', () => {
  const order = [3, 1, 2];
  const open = { phase: 'open', selected: 1, order } as const;

  it('open shows it with the selection; steps move the highlight', () => {
    const shown = switcherReducer(null, open);
    expect(shown).toEqual({ order, selected: 1, committed: null });
    expect(switcherReducer(shown, { phase: 'step', selected: 2, order })).toEqual({
      order,
      selected: 2,
      committed: null,
    });
  });

  it('commit marks the chosen window; cancel and dismiss close plainly', () => {
    const shown = switcherReducer(null, open);
    expect(switcherReducer(shown, { phase: 'commit', selected: 2, order })?.committed).toBe(2);
    expect(switcherReducer(shown, { phase: 'cancel', selected: 1, order })).toBeNull();
    expect(switcherReducer(shown, { phase: 'dismiss' })).toBeNull();
  });

  it('a quick tap commits with nothing shown, and nothing appears', () => {
    expect(switcherReducer(null, { phase: 'commit', selected: 2, order })).toBeNull();
  });
});

describe('useSwitcher follows Evo, and never asks for the keyboard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const send = (phase: string, selected: number, order = [3, 1, 2]) =>
    act(() => {
      void echoClient.emitSignal(EVO_IFACE, SWITCHER_SIGNAL, { phase, selected, order });
    });

  it('open, step, commit (zoom, then gone after the close transition)', () => {
    const focus = vi.spyOn(sdk, 'setOverlayFocus').mockResolvedValue(true);
    const { result } = renderHook(() => useSwitcher(180));
    expect(result.current.switcher).toBeNull();
    send('open', 1);
    expect(result.current.switcher?.selected).toBe(1);
    send('step', 2);
    expect(result.current.switcher?.selected).toBe(2);
    send('commit', 2);
    expect(result.current.switcher?.committed).toBe(2);
    act(() => void vi.advanceTimersByTime(100));
    expect(result.current.switcher).not.toBeNull();
    act(() => void vi.advanceTimersByTime(130));
    expect(result.current.switcher).toBeNull();
    expect(focus).not.toHaveBeenCalled();
  });

  it('a cancel closes at once; a quick tap never shows anything', () => {
    const { result } = renderHook(() => useSwitcher(180));
    send('open', 1);
    send('cancel', 1);
    expect(result.current.switcher).toBeNull();
    send('commit', 2);
    expect(result.current.switcher).toBeNull();
  });

  it('a clicked card that Evo never answers does not leave the screen covered', () => {
    const { result } = renderHook(() => useSwitcher(180));
    send('open', 1);
    act(() => result.current.guard());
    act(() => void vi.advanceTimersByTime(1300));
    expect(result.current.switcher).toBeNull();
  });
});

describe('ShellLayer wires it without taking the keyboard', () => {
  const source = readFileSync(SHELL_LAYER_TSX, 'utf8');

  it('the screen is covered for clicks, the keyboard is asked for by panels only', () => {
    expect(source).toMatch(/useFullScreenRegion\(reporting && \(panelOpen \|\| switcher !== null\)\)/);
    expect(source).toMatch(/useOverlayKeyboard\(reporting && panelOpen, closePanels\)/);
    expect(source).not.toMatch(/setOverlayFocus/);
  });

  it('the overview opens for either, and gets the switcher state', () => {
    expect(source).toMatch(/isOpen=\{overviewOpen \|\| switcher !== null\}/);
    expect(source).toMatch(/switcher=\{switcher \?\? undefined\}/);
  });
});

// The overview itself, in switcher mode, with its data sources stubbed.
const { views } = vi.hoisted(() => ({
  views: [
    { appId: 'a', sessionId: 's-a', state: 'running', windows: [{ windowId: 1 }], windowId: 1, focused: true, minimized: false, starting: false, crashed: false },
    { appId: 'b', sessionId: 's-b', state: 'running', windows: [{ windowId: 2 }], windowId: 2, focused: false, minimized: false, starting: false, crashed: false },
    { appId: 'c', sessionId: 's-c', state: 'running', windows: [{ windowId: 3 }], windowId: 3, focused: false, minimized: true, starting: false, crashed: false },
  ],
}));
vi.mock('../../utils/environment', () => ({ IN_COMPOSITOR: true }));
vi.mock('../../hooks/useAppWindows', () => ({ useAppWindows: () => ({ views }) }));
vi.mock('../../hooks/useApps', () => ({
  useApps: () => ({ byId: (id: string) => ({ id, name: `App ${id}`, icon: undefined }) }),
}));
vi.mock('../../components/AppIcon', () => ({ AppIcon: () => null }));

describe('CardOverview in switcher mode', () => {
  afterEach(() => cleanup());

  async function draw(switcher: SwitcherState, onActivateApp = vi.fn(), onClose = vi.fn()) {
    const { default: CardOverview } = await import('../../components/CardOverview');
    const ui = (s: SwitcherState) => (
      <CardOverview
        isOpen
        switcher={s}
        onClose={onClose}
        windows={[]}
        onSelectWindow={() => {}}
        onCloseWindow={() => {}}
        onActivateApp={onActivateApp}
      />
    );
    const view = render(ui(switcher));
    return { ...view, redraw: (s: SwitcherState) => view.rerender(ui(s)), onActivateApp, onClose };
  }

  const cards = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('[data-app]')];

  it('lists the cards in Evo order and highlights the selected one', async () => {
    const { container, redraw } = await draw({ order: [3, 1, 2], selected: 1, committed: null });
    expect(cards(container).map((c) => c.dataset.app)).toEqual(['c', 'a', 'b']);
    expect(cards(container).map((c) => c.dataset.selected)).toEqual(['false', 'true', 'false']);
    redraw({ order: [3, 1, 2], selected: 2, committed: null });
    expect(cards(container).map((c) => c.dataset.selected)).toEqual(['false', 'false', 'true']);
  });

  it('marks the chosen card and the overview as committing when Alt is released', async () => {
    const { container, redraw } = await draw({ order: [3, 1, 2], selected: 2, committed: null });
    redraw({ order: [3, 1, 2], selected: 2, committed: 2 });
    expect(container.querySelector('[data-switcher="committing"]')).not.toBeNull();
    expect(cards(container).map((c) => c.dataset.committed)).toEqual([undefined, undefined, 'true']);
  });

  it('a card click focuses that app and leaves closing to Evo', async () => {
    const { container, onActivateApp, onClose } = await draw({ order: [3, 1, 2], selected: 1, committed: null });
    act(() => cards(container)[2].click());
    expect(onActivateApp).toHaveBeenCalledWith('b');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('never listens for keys: Evo has them', async () => {
    const { onClose } = await draw({ order: [3, 1, 2], selected: 1, committed: null });
    act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(onClose).not.toHaveBeenCalled();
  });
});

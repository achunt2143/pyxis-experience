import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { useRef } from 'react';
import * as sdk from '@pyxis/app-sdk';
import { setOverlayRegion } from '@pyxis/app-sdk';
import {
  HEARTBEAT_MS,
  STARTUP_GRACE_MS,
  useOverlayAnnouncer,
  useOverlayPresence,
  type OverlayMessage,
} from '../overlayChannel';
import { useOverlayRegion } from '../useOverlayRegion';

/**
 * The overlay is Bloom's second window, the one Evo keeps above apps. These
 * check its three contracts: the Evo method it calls (read out of Evo's
 * Rust source, like the nova and audio suites), the desktop/overlay
 * handshake that decides who draws the toasts, and the region it reports.
 */

const ECHO_IPC_RS = resolve(__dirname, '../../../../geckos/evo/src/enhancements/echo_ipc.rs');

describe('the overlay region reaches Evo', () => {
  it.runIf(existsSync(ECHO_IPC_RS))('calls a method Evo really handles', () => {
    const rust = readFileSync(ECHO_IPC_RS, 'utf8');
    expect(rust).toContain('"SetOverlayRegion" =>');
    expect(rust).toMatch(/msg\.body\.get\("rects"\)/);
  });

  it('is accepted by the mock, as by Evo', async () => {
    expect(await setOverlayRegion([{ x: 900, y: 62, width: 340, height: 80 }])).toBe(true);
    expect(await setOverlayRegion([])).toBe(true);
  });
});

/** Wait for BroadcastChannel deliveries, which are asynchronous. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 30)));

describe('who draws the shell', () => {
  afterEach(cleanup);

  it('the desktop waits for the overlay at startup, then leaves the shell to it', async () => {
    const desktop = renderHook(() => useOverlayPresence());
    expect(desktop.result.current.presence).toBe('unknown');

    renderHook(() => useOverlayAnnouncer());
    await settle();
    expect(desktop.result.current.presence).toBe('present');
  });

  it('just type on the desktop reaches the overlay, with the key', async () => {
    const desktop = renderHook(() => useOverlayPresence());
    const heard: (string | undefined)[] = [];
    renderHook(() => useOverlayAnnouncer((text) => heard.push(text)));
    await settle();

    act(() => desktop.result.current.postSearch('n'));
    act(() => desktop.result.current.postSearch());
    await settle();
    expect(heard).toEqual(['n', undefined]);
  });

  it('the desktop takes the shell back when the overlay never comes', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      const desktop = renderHook(() => useOverlayPresence());
      await act(async () => {
        vi.advanceTimersByTime(STARTUP_GRACE_MS + 2 * HEARTBEAT_MS);
      });
      expect(desktop.result.current.presence).toBe('absent');
    } finally {
      vi.useRealTimers();
    }
  });

  it('the desktop takes the shell back when the overlay goes quiet', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    try {
      const desktop = renderHook(() => useOverlayPresence());
      const listener = new BroadcastChannel('pyxis-overlay');
      listener.postMessage({ type: 'alive' } satisfies OverlayMessage);
      await act(() => new Promise((resolve) => setTimeout(resolve, 30)));
      expect(desktop.result.current.presence).toBe('present');
      // No more heartbeats: the overlay died.
      await act(async () => {
        vi.advanceTimersByTime(8000);
      });
      expect(desktop.result.current.presence).toBe('absent');
      listener.close();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the region follows the toast stack', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function Stack({ enabled, height }: { enabled: boolean; height: number }) {
    const ref = useRef<HTMLDivElement>(null);
    useOverlayRegion(ref, enabled);
    return <div ref={ref} data-height={height} />;
  }

  it('sends the box, an empty region when there is nothing, and clears it on unmount', async () => {
    const sent: unknown[] = [];
    vi.spyOn(sdk, 'setOverlayRegion').mockImplementation(async (rects) => {
      sent.push(rects);
      return true;
    });
    // jsdom does no layout, so give the element the box a browser would.
    let height = 96;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ left: 924, top: 62, width: 340, height, right: 1264, bottom: 62 + height, x: 924, y: 62, toJSON() {} }) as DOMRect
    );

    const view = render(<Stack enabled height={96} />);
    expect(sent).toEqual([[{ x: 924, y: 62, width: 340, height: 96 }]]);

    // Same box again: nothing new is sent.
    window.dispatchEvent(new Event('resize'));
    expect(sent).toHaveLength(1);

    height = 0;
    window.dispatchEvent(new Event('resize'));
    expect(sent.at(-1)).toEqual([]);

    view.unmount();
    expect(sent.at(-1)).toEqual([]);
  });

  it('sends nothing while disabled, as in the desktop', () => {
    const spy = vi.spyOn(sdk, 'setOverlayRegion').mockResolvedValue(true);
    render(<Stack enabled={false} height={96} />);
    expect(spy).not.toHaveBeenCalled();
  });
});

// @vitest-environment jsdom
import React, { useEffect } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvoWindowInfo } from '@pyxis/app-sdk';

// Evo, as the provider sees it: ListWindows answers whatever `sample` holds
// when the call resolves (a test resolves it by hand), and signals are
// delivered by `emit`.
const handlers = new Map<string, (data: unknown) => void>();
const pending: Array<(v: unknown) => void> = [];
let sample: EvoWindowInfo[] = [];
const listCalls = vi.fn();

vi.mock('@pyxis/app-sdk', async (orig) => {
  const real = await orig<typeof import('@pyxis/app-sdk')>();
  return {
    ...real,
    echoClient: {
      callMethod: (_s: string, _i: string, method: string) => {
        listCalls(method);
        return new Promise((resolve) => pending.push(resolve));
      },
      onSignal: (_iface: string, signal: string, cb: (data: unknown) => void) => {
        handlers.set(signal, cb);
        return () => handlers.delete(signal);
      },
    },
  };
});

import { CompositorWindowsProvider, LIST_SAMPLE_AGE_MS } from '../CompositorWindowsProvider';
import { useCompositorWindows } from '../useAppWindows';

const info = (id: number, app: string, over: Partial<EvoWindowInfo> = {}): EvoWindowInfo => ({
  window_id: id,
  app_id: app,
  width: 1280,
  height: 680,
  x: 0,
  y: 44,
  focused: false,
  visible: true,
  ...over,
});

let seen: number[] = [];
const Probe: React.FC = () => {
  const state = useCompositorWindows();
  useEffect(() => {
    seen = Object.keys(state.byId).map(Number).sort((a, b) => a - b);
  }, [state]);
  return null;
};

/** Answer the oldest outstanding ListWindows with what `answer` holds. */
async function answer(windows: EvoWindowInfo[]) {
  const resolve = pending.shift();
  expect(resolve).toBeDefined();
  await act(async () => {
    resolve!({ windows });
  });
}
const emit = (signal: string, data: unknown) => act(() => handlers.get(signal)?.(data));

describe('CompositorWindowsProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    handlers.clear();
    pending.length = 0;
    sample = [];
    listCalls.mockClear();
    seen = [];
  });
  afterEach(() => vi.useRealTimers());

  it('a stale list does not erase a window that just opened, and a follow-up list settles it', async () => {
    render(
      <CompositorWindowsProvider>
        <Probe />
      </CompositorWindowsProvider>
    );
    await answer([]); // the baseline: nothing open
    expect(seen).toEqual([]);

    // Files opens maximized: a focus signal for a window the store doesn't
    // know yet asks for a list, then WindowCreated lands before that list
    // returns, and the list is a sample from before the window existed.
    emit('WindowFocusChanged', { window_id: 3 });
    emit('WindowCreated', { window_id: 3, app_id: 'files', width: 1280, height: 680 });
    expect(seen).toEqual([3]);
    await answer([]);
    expect(seen).toEqual([3]); // kept: the old code erased it here, for good

    // The list may have missed a signal, so one more is asked for once Evo's
    // sample has caught up; it has the window, with its real frame.
    sample = [info(3, 'files', { maximized: true, focused: true })];
    await act(async () => {
      vi.advanceTimersByTime(LIST_SAMPLE_AGE_MS + 60);
    });
    await answer(sample);
    expect(seen).toEqual([3]);

    // Quiet now: no further lists.
    const calls = listCalls.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(listCalls.mock.calls.length).toBe(calls);
  });

  it('a stale list does not bring back a window that just closed', async () => {
    render(
      <CompositorWindowsProvider>
        <Probe />
      </CompositorWindowsProvider>
    );
    await answer([info(3, 'files'), info(4, 'notes')]);
    expect(seen).toEqual([3, 4]);

    emit('WindowFocusChanged', { window_id: 9 }); // unknown: asks for a list
    emit('WindowClosed', { window_id: 4 });
    expect(seen).toEqual([3]);
    await answer([info(3, 'files'), info(4, 'notes')]); // sampled before the close
    expect(seen).toEqual([3]);
  });
});

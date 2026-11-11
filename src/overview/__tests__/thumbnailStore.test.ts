import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as sdk from '@pyxis/app-sdk';
import { getThumbnails, refreshThumbnails, resetThumbnails } from '../thumbnailStore';

const row = (windowId: number) => ({ windowId, width: 4, height: 3, data: `data:image/jpeg;base64,${windowId}` });

describe('thumbnailStore', () => {
  beforeEach(() => {
    resetThumbnails();
    vi.restoreAllMocks();
  });

  it('keeps what Evo drew and forgets windows that are gone', async () => {
    const spy = vi.spyOn(sdk, 'getWindowThumbnails').mockResolvedValueOnce([row(1), row(2)]);
    await refreshThumbnails([1, 2]);
    expect([...getThumbnails().keys()].sort()).toEqual([1, 2]);
    // Window 2 closed; Evo has nothing new for 1 (it had not committed): 1 stays.
    spy.mockResolvedValueOnce([]);
    await refreshThumbnails([1]);
    expect([...getThumbnails().keys()]).toEqual([1]);
  });

  it('a burst of refreshes costs one follow-up call, with the latest ids', async () => {
    let release: (v: ReturnType<typeof row>[]) => void = () => {};
    const spy = vi
      .spyOn(sdk, 'getWindowThumbnails')
      .mockImplementationOnce(() => new Promise((r) => (release = r)))
      .mockResolvedValue([row(3)]);
    const first = refreshThumbnails([1]);
    void refreshThumbnails([2]);
    void refreshThumbnails([3]);
    release([row(1)]);
    await first;
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1][0]).toEqual({ windowIds: [3] });
    expect([...getThumbnails().keys()]).toEqual([3]);
  });

  it('an unanswered Evo (empty list) leaves the cards with their icons', async () => {
    vi.spyOn(sdk, 'getWindowThumbnails').mockResolvedValue([]);
    await refreshThumbnails([1, 2]);
    expect(getThumbnails().size).toBe(0);
  });
});

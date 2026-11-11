import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, waitFor } from '@testing-library/react';
import { DynamicWallpaper } from '../DynamicWallpaper';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function wallpaperEl(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('[data-wallpaper-state]');
  if (!el) throw new Error('no wallpaper element');
  return el;
}

describe('DynamicWallpaper', () => {
  it('falls back to css where there is no WebGL, and draws the five masses', async () => {
    // jsdom has no WebGL: getContext answers null.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const { container } = render(
      <div style={{ width: 320, height: 200 }}>
        <DynamicWallpaper wallpaper="sunset" preview time={12 * 60} location={null} />
      </div>
    );
    const el = wallpaperEl(container);
    await waitFor(() => expect(el.dataset.wallpaperBackend).toBe('css'));
    expect(el.dataset.wallpaperId).toBe('sunset');
    expect(el.dataset.wallpaperState).toBe('flowing');
    await waitFor(() => {
      const discs = el.querySelectorAll<HTMLElement>('div[style*="radial-gradient"]');
      expect(discs.length).toBe(5);
      expect(discs[0].style.transform).toMatch(/translate3d/);
    });
  });

  it('is still in reduced mode and with motion still', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const a = render(<DynamicWallpaper wallpaper="daylight" preview animationMode="reduced" location={null} />);
    expect(wallpaperEl(a.container).dataset.wallpaperState).toBe('still');
    a.unmount();
    const b = render(<DynamicWallpaper wallpaper="daylight" preview motion="still" location={null} />);
    expect(wallpaperEl(b.container).dataset.wallpaperState).toBe('still');
  });

  it('logs each state once on the desktop, and never in preview', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const lines = () => log.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('PYXIS-WALLPAPER'));

    const preview = render(<DynamicWallpaper wallpaper="daylight" preview paused location={null} />);
    await waitFor(() => expect(wallpaperEl(preview.container).dataset.wallpaperBackend).toBe('css'));
    // `paused` is ignored in preview.
    expect(wallpaperEl(preview.container).dataset.wallpaperState).toBe('flowing');
    preview.unmount();
    expect(lines()).toEqual([]);

    const desk = render(
      <DynamicWallpaper wallpaper="daylight" motion="flow" animationMode="full" paused={false} location={null} />
    );
    await waitFor(() => expect(lines()).toEqual(['PYXIS-WALLPAPER state=flowing backend=css']));
    desk.rerender(
      <DynamicWallpaper wallpaper="daylight" motion="flow" animationMode="full" paused location={null} />
    );
    desk.rerender(
      <DynamicWallpaper wallpaper="mochi" motion="flow" animationMode="full" paused location={null} />
    );
    await waitFor(() =>
      expect(lines()).toEqual([
        'PYXIS-WALLPAPER state=flowing backend=css',
        'PYXIS-WALLPAPER state=paused backend=css',
      ])
    );
  });
});

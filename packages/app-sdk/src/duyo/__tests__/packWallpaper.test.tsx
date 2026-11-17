import { act, render } from '@testing-library/react';
import { createRuntime, KindRegistry } from '@duyojs/duyo';
import { basePack, createPack, createRenderer, installPack, RuntimeView } from '@duyojs/duyo/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adaptIsland } from '../adaptIsland';
import { pyxisPack } from '../pack';
import { elementOf, mount } from './packHelpers';

vi.mock('../../wallpaper/DynamicWallpaper', () => ({
  DynamicWallpaper: (p: {
    wallpaper: string;
    backend?: string;
    time?: number | null;
    paused?: boolean;
    motion?: string;
    logDetail?: string;
    className?: string;
  }) => (
    <div
      data-mock-wallpaper={p.wallpaper}
      data-backend={p.backend}
      data-time={p.time ?? ''}
      data-paused={String(p.paused ?? false)}
      data-motion={p.motion ?? ''}
      data-log-detail={p.logDetail ?? ''}
      className={p.className}
    />
  ),
}));

afterEach(() => vi.restoreAllMocks());

describe('pyxis.Wallpaper', () => {
  it('mounts DynamicWallpaper inside a positioning pyxis.Control host and updates live', () => {
    const { container, root } = mount({
      kind: 'pyxis.Wallpaper',
      wallpaper: 'aurora',
      preview: true,
      backend: 'css',
      time: 360,
      paused: true,
      motion: 'still',
      logDetail: 'test',
      attributes: { 'data-slot': 'bg' },
    });

    const host = elementOf(container, root);
    expect(host.getAttribute('data-duyo-kind')).toBe('pyxis.Wallpaper');
    expect(host.getAttribute('data-slot')).toBe('bg');
    expect(host.style.position).toBe('relative');

    const wp = host.querySelector<HTMLElement>('[data-mock-wallpaper]')!;
    expect(wp.dataset.mockWallpaper).toBe('aurora');
    expect(wp.dataset.backend).toBe('css');
    expect(wp.dataset.time).toBe('360');
    expect(wp.dataset.paused).toBe('true');
    expect(wp.dataset.motion).toBe('still');
    expect(wp.dataset.logDetail).toBe('test');

    act(() => {
      root.set('wallpaper', 'sunset');
      root.set('paused', false);
      root.set('time', 720);
    });

    expect(wp.dataset.mockWallpaper).toBe('sunset');
    expect(wp.dataset.paused).toBe('false');
    expect(wp.dataset.time).toBe('720');
  });

  it('inherits pyxis.Control fit (inside FittableRows), style and showing', () => {
    const { container, root } = mount({
      kind: 'duyo.FittableRows',
      components: [
        { name: 'wp', kind: 'pyxis.Wallpaper', fit: true },
        { name: 'hidden', kind: 'pyxis.Wallpaper', showing: false },
        { name: 'pinned', kind: 'pyxis.Wallpaper', style: 'position:absolute;inset:0' },
      ],
    });
    const wp = elementOf(container, root.$['wp']!);
    expect(wp.style.position).toBe('relative');
    expect(wp.style.flexGrow).toBe('1');
    expect(elementOf(container, root.$['hidden']!).style.display).toBe('none');
    expect(elementOf(container, root.$['pinned']!).style.position).toBe('absolute');
  });
});

describe('adaptIsland', () => {
  it('skips re-rendering the inner component when data props match across sibling updates', () => {
    let renders = 0;
    const Leaf = ({ label, onPing }: { label: string; onPing: () => void }) => {
      renders++;
      return (
        <button type="button" onClick={onPing}>
          {label}
        </button>
      );
    };

    const leafEntry = adaptIsland({
      name: 'Test.IslandLeaf',
      component: Leaf,
      published: { label: 'init' },
      events: { onPing: '' },
      props: (node) => ({
        label: node.get('label') as string,
        // Intentionally fresh closure every render to prove adaptIsland ignores callback identity.
        onPing: () => node['doPing'](),
      }),
    });

    const testPack = createPack('test-island', [leafEntry]);
    const registry = new KindRegistry();
    installPack(registry, basePack);
    installPack(registry, pyxisPack);
    installPack(registry, testPack);
    const runtime = createRuntime({ registry });
    const root = runtime.create({
      kind: 'pyxis.Control',
      components: [
        { name: 'leaf', kind: 'Test.IslandLeaf', label: 'steady' },
        { name: 'sibling', kind: 'pyxis.Control', content: 'a' },
      ],
    });
    const renderer = createRenderer([basePack, pyxisPack, testPack]);
    const Wrapper = ({ children }: { children: React.ReactNode }) => {
      const [tick, setTick] = useState(0);
      return (
        <div data-tick={tick} onClick={() => setTick((t) => t + 1)}>
          {children}
        </div>
      );
    };
    const { container } = render(<RuntimeView root={root} renderer={renderer} wrapper={Wrapper} />);
    expect(renders).toBe(1);

    act(() => {
      root.$['sibling']!.set('content', 'b');
    });
    expect(container.querySelector('[data-duyo-id="' + root.$['sibling']!.id + '"]')?.textContent).toBe('b');
    expect(renders).toBe(1);

    act(() => {
      root.$['leaf']!.set('label', 'updated');
    });
    expect(renders).toBe(2);
    expect(container.querySelector('button')?.textContent).toBe('updated');
  });
});

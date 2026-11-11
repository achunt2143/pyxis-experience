// @vitest-environment jsdom
import { useState } from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KindRegistry } from '@duyojs/duyo';
import { basePack } from '@duyojs/duyo/react';

// The theme the wrapper reads, driven by the test (as appShellTheme.test.tsx does for AppShell).
let setTheme: (t: 'light' | 'dark') => void = () => {};
const seenDefaults: unknown[] = [];
vi.mock('../../usePyxisTheme', () => ({
  usePyxisTheme: (defaultTheme: unknown) => {
    seenDefaults.push(defaultTheme);
    const [theme, set] = useState<'light' | 'dark'>('light');
    setTheme = set;
    return theme;
  },
}));


import { createPyxisPacks, installPyxisPacks } from '../packs';
import { pyxisPack } from '../pack';

describe('createPyxisPacks', () => {
  it('lists theme, base, remochi, pyxis, outermost first', () => {
    const packs = createPyxisPacks();
    expect(packs.map((p) => p.name)).toEqual(['pyxis.theme', 'duyo.base', 'remochi', pyxisPack.name]);
    expect(packs[1]).toBe(basePack);
    expect(packs[3]).toBe(pyxisPack);
  });

  it('draws the theme through exactly one wrapper: the controlled one', () => {
    const wrapping = createPyxisPacks().filter((p) => p.wrapper);
    expect(wrapping[0]?.name).toBe('pyxis.theme');
    expect(createPyxisPacks().find((p) => p.name === 'remochi')?.wrapper).toBeUndefined();
  });

  it('passes defaultTheme to usePyxisTheme, light when absent', () => {
    seenDefaults.length = 0;
    const Dark = createPyxisPacks({ defaultTheme: 'dark' })[0]!.wrapper!;
    render(<Dark>x</Dark>).unmount();
    const Plain = createPyxisPacks()[0]!.wrapper!;
    render(<Plain>x</Plain>).unmount();
    expect(seenDefaults[0]).toBe('dark');
    expect(seenDefaults[seenDefaults.length - 1]).toBe('light');
  });

  it('follows a theme change in place, without rebuilding its children', () => {
    const Theme = createPyxisPacks()[0]!.wrapper!;
    let mounts = 0;
    const Probe = () => {
      const [n] = useState(() => ++mounts);
      return <span data-testid="probe">{n}</span>;
    };
    const { container } = render(
      <Theme>
        <Probe />
      </Theme>
    );
    expect(container.querySelector('.mochi-theme-light')).not.toBeNull();

    act(() => setTheme('dark'));
    expect(container.querySelector('.mochi-theme-dark')).not.toBeNull();
    expect(container.querySelector('.mochi-theme-light')).toBeNull();
    act(() => setTheme('light'));
    expect(container.querySelector('.mochi-theme-light')).not.toBeNull();
    expect(mounts).toBe(1);
  });
});

describe('installPyxisPacks', () => {
  it('registers every pack kind', () => {
    const registry = new KindRegistry();
    const packs = createPyxisPacks();
    installPyxisPacks(registry, packs);
    for (const pack of packs) for (const kind of pack.kinds) expect(registry.has(kind.name)).toBe(true);
    expect(registry.has('remochi.Button')).toBe(true);
  });

  it('is idempotent: a second install (HMR, two mounts) neither throws nor changes anything', () => {
    const registry = new KindRegistry();
    const packs = createPyxisPacks();
    installPyxisPacks(registry, packs);
    const before = registry.names();
    expect(() => installPyxisPacks(registry, packs)).not.toThrow();
    expect(() => installPyxisPacks(registry, createPyxisPacks())).not.toThrow();
    expect(registry.names()).toEqual(before);
  });

  it('still adds kinds that are missing when some are already there', () => {
    const registry = new KindRegistry();
    const packs = createPyxisPacks();
    const remochi = packs.find((p) => p.name === 'remochi')!;
    registry.register(remochi.kinds[0]!);
    expect(() => installPyxisPacks(registry, packs)).not.toThrow();
    expect(registry.has(remochi.kinds[remochi.kinds.length - 1]!.name)).toBe(true);
  });
});

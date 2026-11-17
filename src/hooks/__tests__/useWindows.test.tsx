// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopWindowType } from '../../types';

const mockState = vi.hoisted(() => ({
  launchBarPosition: 'bottom' as 'bottom' | 'left',
  inCompositor: false,
  motionPropsList: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../utils/environment', () => ({
  get IN_COMPOSITOR() {
    return mockState.inCompositor;
  },
}));

vi.mock('@pyxis/app-sdk', async (orig) => {
  const real = await orig<typeof import('@pyxis/app-sdk')>();
  return {
    ...real,
    useSetting: (key: string, fallback: unknown) =>
      key === real.SETTING_KEYS.launchBarPosition ? mockState.launchBarPosition : fallback,
    useAppHost: () => ({
      sessions: {},
      stateForApp: () => null,
      sessionForApp: () => null,
      surfacesForApp: () => [],
      relaunch: async () => null,
    }),
  };
});

vi.mock('framer-motion', async (orig) => {
  const real = await orig<typeof import('framer-motion')>();
  return {
    ...real,
    motion: new Proxy(real.motion, {
      get(target, prop) {
        if (prop === 'div') {
          return React.forwardRef<HTMLDivElement, Record<string, unknown>>((props, ref) => {
            mockState.motionPropsList.push(props);
            const {
              children,
              style,
              className,
              onClick,
              title,
              ...rest
            } = props;
            void rest;
            return (
              <div
                ref={ref}
                style={style as React.CSSProperties}
                className={className as string}
                onClick={onClick as React.MouseEventHandler<HTMLDivElement>}
                title={title as string}
              >
                {children as React.ReactNode}
              </div>
            );
          });
        }
        return Reflect.get(target, prop);
      },
    }),
  };
});

import { DesktopWindow } from '../../components/DesktopWindow';
import { useWindows } from '../useWindows';

function makeWindow(over: Partial<DesktopWindowType> = {}): DesktopWindowType {
  return {
    id: 'w1',
    title: 'Files',
    appId: 'files',
    state: 'maximized',
    position: { x: 100, y: 100 },
    size: { width: 720, height: 500 },
    zIndex: 1,
    innerWidth: 1280,
    innerHeight: 800,
    ...over,
  };
}

describe('DesktopWindow dev-mode work-area bounds', () => {
  beforeEach(() => {
    mockState.launchBarPosition = 'bottom';
    mockState.inCompositor = false;
    mockState.motionPropsList = [];
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('maximizes cleanly between the 36 px top strip and 64 px bottom launch bar', () => {
    render(<DesktopWindow window={makeWindow()} isActive />);
    const anim = mockState.motionPropsList[0].animate as Record<string, number>;
    expect(anim).toMatchObject({
      x: 0,
      y: 36,
      width: 1280,
      height: 800 - 36 - 64,
    });
  });

  it('maximizes cleanly beside the 64 px left rail and below the 36 px top strip', () => {
    mockState.launchBarPosition = 'left';
    render(<DesktopWindow window={makeWindow()} isActive />);
    const anim = mockState.motionPropsList[0].animate as Record<string, number>;
    expect(anim).toMatchObject({
      x: 64,
      y: 36,
      width: 1280 - 64,
      height: 800 - 36,
    });
    const constraints = mockState.motionPropsList[0].dragConstraints as Record<string, number>;
    expect(constraints.left).toBe(64 - 100);
    expect(constraints.top).toBe(36 - 100);
  });

  it('reads live [data-shell-edge] DOM sizes when present', () => {
    const topEl = document.createElement('div');
    topEl.setAttribute('data-shell-edge', 'top');
    Object.defineProperty(topEl, 'offsetHeight', { value: 40 });
    const leftEl = document.createElement('div');
    leftEl.setAttribute('data-shell-edge', 'left');
    Object.defineProperty(leftEl, 'offsetWidth', { value: 72 });
    document.body.append(topEl, leftEl);

    mockState.launchBarPosition = 'left';
    render(<DesktopWindow window={makeWindow()} isActive />);
    const anim = mockState.motionPropsList[0].animate as Record<string, number>;
    expect(anim).toMatchObject({
      x: 72,
      y: 40,
      width: 1280 - 72,
      height: 800 - 40,
    });
  });

  it('useWindows spawns clear of top strip and left rail and updates inner dimensions on resize', () => {
    const { result } = renderHook(() => useWindows());
    act(() => {
      result.current.createWindow('files', 'Files');
    });
    const w = result.current.windows[0];
    expect(w.position.x).toBeGreaterThanOrEqual(72);
    expect(w.position.y).toBeGreaterThanOrEqual(48);

    Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current.windows[0].innerWidth).toBe(1440);
    expect(result.current.windows[0].innerHeight).toBe(900);
  });
});

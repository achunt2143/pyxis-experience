import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import React, { useEffect } from 'react';
import { MotionContext, type MotionApi } from '../../useMotion';
import { clearRadius, clearReach, holeMask } from '../clearMath';
import { LockLayer, type LockLayerPhase } from '../LockLayer';

/**
 * Veil and Clear on the page: the layer fades in over 600 ms with the clock
 * coming forward, and when the session unlocks it opens a hole from the
 * field's centre over 900 ms, a ring riding the edge, then unmounts.
 */

vi.mock('../LockScreen', () => ({
  LockScreen: ({ unlocking, onOrigin }: { unlocking: boolean; onOrigin?: (p: { x: number; y: number }) => void }) => {
    useEffect(() => onOrigin?.({ x: 640, y: 461 }), [onOrigin]);
    return <div data-lock-screen="" data-unlocking={String(unlocking)} />;
  },
}));

const motion = (mode: MotionApi['mode']): MotionApi => ({ mode, tr: (t) => t, to: (t) => t });

function setup(mode: MotionApi['mode']) {
  const phases: LockLayerPhase[] = [];
  const onPhaseChange = (p: LockLayerPhase) => phases.push(p);
  const ui = (locked: boolean) => (
    <MotionContext.Provider value={motion(mode)}>
      <LockLayer locked={locked} session={null} notifications={[]} onPhaseChange={onPhaseChange} />
    </MotionContext.Provider>
  );
  const view = render(ui(false));
  return { phases, view, set: (locked: boolean) => act(() => view.rerender(ui(locked))) };
}

const layer = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-lock-layer]');
const veil = (c: HTMLElement) => c.querySelector<HTMLElement>('.lock-veil')!;
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', 'Date'] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('Veil (lock), full motion', () => {
  it('is nothing until the session locks, then fades in over 600 ms with the clock coming forward from 106%', () => {
    const { view, set, phases } = setup('full');
    expect(layer(view.container)).toBeNull();

    set(true);
    expect(layer(view.container)?.dataset.lockLayer).toBe('veil');
    expect(veil(view.container).style.opacity).toBe('0');
    expect(veil(view.container).style.getPropertyValue('--lock-veil-scale')).toBe('1.06');

    tick(300);
    const half = Number(veil(view.container).style.opacity);
    expect(half).toBeGreaterThan(0.3);
    expect(half).toBeLessThan(0.7);
    const scale = Number(veil(view.container).style.getPropertyValue('--lock-veil-scale'));
    expect(scale).toBeGreaterThan(1);
    expect(scale).toBeLessThan(1.06);
    expect(layer(view.container)?.dataset.lockLayer).toBe('veil');

    tick(400);
    expect(layer(view.container)?.dataset.lockLayer).toBe('locked');
    expect(veil(view.container).style.opacity).toBe('1');
    expect(veil(view.container).style.getPropertyValue('--lock-veil-scale')).toBe('');
    expect(phases).toEqual(['off', 'veil', 'locked']);
  });
});

describe('Clear (unlock), full motion', () => {
  it('opens a hole from the field’s centre, r(t) = D(0.5t + 0.5t²) over 900 ms, with a ring at r, then unmounts', () => {
    const { view, set, phases } = setup('full');
    set(true);
    tick(700);
    expect(layer(view.container)?.dataset.lockLayer).toBe('locked');

    set(false);
    expect(layer(view.container)?.dataset.lockLayer).toBe('clear');
    expect(view.container.querySelector('[data-lock-screen]')!.getAttribute('data-unlocking')).toBe('true');

    const origin = { x: 640, y: 461 };
    const D = clearReach(origin, { width: window.innerWidth, height: window.innerHeight });
    // Frame 0: a hole of nothing.
    // (jsdom writes #000 back as rgb(0, 0, 0).)
    expect(veil(view.container).style.maskImage).toBe(holeMask(origin, 0).replace('#000', 'rgb(0, 0, 0)'));

    tick(450);
    const mask = veil(view.container).style.maskImage;
    const radius = Number(/transparent ([0-9.]+)px/.exec(mask)![1]);
    // Half-way in time: 0.375 D (the rAF clock is stepped, so allow a frame of slack).
    expect(radius).toBeGreaterThan(clearRadius(0.42, D));
    expect(radius).toBeLessThan(clearRadius(0.58, D));
    expect(mask).toContain('circle at 640px 461px');
    expect(Number(/rgb\(0, 0, 0\) ([0-9.]+)px/.exec(mask)![1])).toBeCloseTo(radius + 50, 6);

    const ring = view.container.querySelector<HTMLElement>('.lock-ring')!;
    expect(ring).toBeTruthy();
    expect(parseFloat(ring.style.width)).toBeCloseTo(2 * radius, 0);
    expect(parseFloat(ring.style.left)).toBeCloseTo(640 - radius, 0);
    expect(parseFloat(ring.style.top)).toBeCloseTo(461 - radius, 0);
    expect(Number(ring.style.opacity)).toBeLessThan(0.6);
    expect(Number(ring.style.opacity)).toBeGreaterThan(0.2);

    tick(500);
    expect(layer(view.container)).toBeNull();
    expect(phases.at(-1)).toBe('off');
  });

  it('every frame is smooth: the hole only ever grows', () => {
    const { view, set } = setup('full');
    set(true);
    tick(700);
    set(false);
    let last = -1;
    for (let i = 0; i < 60 && layer(view.container); i++) {
      tick(16);
      const el = layer(view.container) && veil(view.container);
      if (!el) break;
      const m = /transparent ([0-9.]+)px/.exec(el.style.maskImage);
      if (!m) continue;
      expect(Number(m[1])).toBeGreaterThanOrEqual(last);
      last = Number(m[1]);
    }
    expect(last).toBeGreaterThan(300);
  });

  it('locking again mid-Clear starts over with a fresh screen', () => {
    const { view, set } = setup('full');
    set(true);
    tick(700);
    set(false);
    tick(200);
    set(true);
    expect(layer(view.container)?.dataset.lockLayer).toBe('veil');
    expect(view.container.querySelector('[data-lock-screen]')!.getAttribute('data-unlocking')).toBe('false');
    expect(view.container.querySelector('.lock-ring')).toBeNull();
  });
});

describe('reduced and off', () => {
  it('reduced: a fade of at most 150 ms each way, no hole and no ring', () => {
    const { view, set } = setup('reduced');
    set(true);
    tick(160);
    expect(layer(view.container)?.dataset.lockLayer).toBe('locked');
    expect(veil(view.container).style.getPropertyValue('--lock-veil-scale')).toBe('');

    set(false);
    expect(view.container.querySelector('.lock-ring')).toBeNull();
    tick(75);
    expect(veil(view.container).style.maskImage).toBeFalsy();
    expect(Number(veil(view.container).style.opacity)).toBeGreaterThan(0.2);
    expect(Number(veil(view.container).style.opacity)).toBeLessThan(0.8);
    tick(100);
    expect(layer(view.container)).toBeNull();
  });

  it('off: instant, both ways', () => {
    const { view, set } = setup('off');
    set(true);
    expect(layer(view.container)?.dataset.lockLayer).toBe('locked');
    expect(veil(view.container).style.opacity).toBe('1');
    set(false);
    expect(layer(view.container)).toBeNull();
  });
});

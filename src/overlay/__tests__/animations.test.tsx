import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as sdk from '@pyxis/app-sdk';
import { DURATION, EASE, resolveTarget, resolveTransition, SPRING, TRANSITION } from '../../motion';

/**
 * Bloom's half of the animation contract (docs/internal/evo-animation-plan.md):
 * the SDK wrapper's shapes, the mock the dev server answers with, the motion
 * tokens, and what each animation mode does to a transition.
 */

const GECKOS = resolve(__dirname, '../../../../geckos');
const ECHO_IPC_RS = resolve(GECKOS, 'evo/src/enhancements/echo_ipc.rs');
const rust = existsSync(ECHO_IPC_RS) ? readFileSync(ECHO_IPC_RS, 'utf8') : '';
const evoHasAnimations = rust.includes('"SetAnimationSettings"');

describe('the Evo animation methods the SDK calls', () => {
  // Evo's lane (F) writes the Rust half in parallel. Until its handlers are
  // in echo_ipc.rs there is nothing to check the names against.
  if (evoHasAnimations) {
    it('exist in echo_ipc.rs, with the fields the SDK sends and reads', () => {
      expect(rust).toContain('"SetAnimationSettings" =>');
      expect(rust).toContain('"GetAnimationState" =>');
      expect(rust).toContain('"mode"');
      expect(rust).toContain('"scale"');
      const at = rust.indexOf('"GetAnimationState" =>');
      const handler = rust.slice(at, at + 1500);
      for (const key of ['mode', 'scale', 'active', 'started', 'completed']) expect(handler).toContain(`"${key}"`);
    });
  } else {
    it.todo('SetAnimationSettings / GetAnimationState exist in evo/src/enhancements/echo_ipc.rs (Evo lane F has not landed them yet)');
  }
});

describe('the SDK wrapper and its mock', () => {
  it('SetAnimationSettings takes optional mode and scale, and answers {ok, mode, scale}', async () => {
    const reply = await sdk.setAnimationSettings({ mode: 'reduced', scale: 2 });
    expect(reply).toEqual({ ok: true, mode: 'reduced', scale: 2 });
    // Fields left out are left alone.
    expect(await sdk.setAnimationSettings({ scale: 1 })).toEqual({ ok: true, mode: 'reduced', scale: 1 });
    await sdk.setAnimationSettings({ mode: 'full' });
  });

  it('GetAnimationState has the contract shape', async () => {
    const state = await sdk.getAnimationState();
    expect(state).toMatchObject({ mode: 'full', scale: 1, active: 0 });
    for (const group of [state!.started, state!.completed]) {
      expect(Object.keys(group).sort()).toEqual(['close', 'geometry', 'minimize', 'open', 'restore']);
    }
  });

  it('the persisted mode has a settings key and three values', () => {
    expect(sdk.SETTING_KEYS.animations).toBe('pyxis.animations');
    expect([...sdk.ANIMATION_MODES]).toEqual(['full', 'reduced', 'off']);
    expect(sdk.isAnimationMode('reduced')).toBe(true);
    expect(sdk.isAnimationMode('slow')).toBe(false);
  });
});

describe('the motion tokens match the spec table', () => {
  it('durations (ms)', () => {
    const ms = Object.fromEntries(Object.entries(DURATION).map(([k, v]) => [k, Math.round(v * 1000)]));
    expect(ms).toMatchObject({ open: 260, close: 180, popupIn: 120, popupOut: 80, focus: 150, lift: 120, reduced: 150 });
  });

  it('curves', () => {
    expect(EASE.expoOut).toEqual([0.16, 1, 0.3, 1]);
    expect(EASE.accelerate).toEqual([0.3, 0, 0.8, 0.15]);
    expect(EASE.standard).toEqual([0.2, 0, 0, 1]);
  });

  it('spring damping ratios: minimize 0.9, geometry 1.0', () => {
    const zeta = (s: { stiffness: number; damping: number; mass: number }) =>
      s.damping / (2 * Math.sqrt(s.stiffness * s.mass));
    expect(zeta(SPRING.minimize)).toBeCloseTo(0.9, 2);
    expect(zeta(SPRING.restore)).toBeCloseTo(0.9, 2);
    expect(zeta(SPRING.geometry)).toBeCloseTo(1.0, 2);
  });
});

describe('animation modes', () => {
  it('full leaves a transition as written', () => {
    expect(resolveTransition(TRANSITION.open, 'full')).toBe(TRANSITION.open);
  });

  it('reduced is linear and at most 150 ms, springs included', () => {
    for (const t of Object.values(TRANSITION)) {
      const r = resolveTransition(t, 'reduced') as { duration: number; ease: string };
      expect(r.ease).toBe('linear');
      expect(r.duration).toBeLessThanOrEqual(0.15);
    }
  });

  it('off is instant', () => {
    expect(resolveTransition(TRANSITION.minimize, 'off')).toEqual({ duration: 0 });
  });

  it('reduced keeps opacity and drops every transform', () => {
    expect(resolveTarget({ opacity: 1, y: 8, scale: 0.97 }, 'reduced')).toEqual({ opacity: 1 });
    expect(resolveTarget({ y: 8 }, 'reduced')).toEqual({});
    expect(resolveTarget({ opacity: 1, y: 8 }, 'full')).toEqual({ opacity: 1, y: 8 });
  });
});

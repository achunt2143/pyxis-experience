import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { NotificationEntry, SessionState } from '@pyxis/app-sdk';
import { useMotion } from '../useMotion';
import {
  clearMs,
  clearRadius,
  clearReach,
  easeInOut,
  holeMask,
  ringOpacity,
  veilClockScale,
  veilMs,
  type Point,
} from './clearMath';
import { LockScreen } from './LockScreen';
import { accentOf, defaultOrigin, setActiveLockPhase } from './lockUi';
import { runTween } from './tween';

/**
 * Where the lock layer is in its life:
 * - `off`: not mounted.
 * - `veil`: just locked; the layer fades in over the shell (600 ms) with the
 *   clock coming forward from 106%.
 * - `locked`: the layer is opaque and the shell beneath is not needed.
 * - `clear`: `LockChanged {locked: false}` arrived; the layer opens a hole
 *   from the password field's centre (900 ms) and unmounts.
 */
export type LockLayerPhase = 'off' | 'veil' | 'locked' | 'clear';

export interface LockLayerProps {
  /** Whether the session is locked (`useSessionState`: `getState` at start, `LockChanged` after). */
  locked: boolean;
  session: SessionState | null;
  notifications: readonly NotificationEntry[];
  /** Told whenever the layer's phase changes, so the shell can hide itself behind it. */
  onPhaseChange?: (phase: LockLayerPhase) => void;
}

/**
 * The lock screen's life around the screen itself: it mounts when the session
 * locks (Veil), and when `LockChanged {locked: false}` arrives it plays Clear
 * and unmounts. The page never decides either: `locked` comes from Echo's
 * signal, and Evo has already drawn (or stopped drawing) everything else.
 *
 * Veil. Evo draws the windows' half (blur, desaturate, fade) from snapshots;
 * this layer is the page's half: it fades in over 600 ms while the clock
 * scales 1.06 to 1. Clear. Evo draws the desktop coming into focus beneath;
 * this layer is opaque and opens a hole of radius `r(t) = D(0.5t + 0.5t²)`
 * from the field's centre over 900 ms, with a 50 px soft edge (a CSS mask)
 * and a ring of light at `r`. Reduced: a fade of at most 150 ms. Off: instant.
 *
 * The maths is `clearMath.ts`; the mask and the ring are set straight on the
 * elements each frame (no React render per frame).
 */
export const LockLayer: React.FC<LockLayerProps> = ({ locked, session, notifications, onPhaseChange }) => {
  const { mode } = useMotion();
  const [phase, setPhase] = useState<LockLayerPhase>('off');
  // A fresh mount of the screen for every lock: nothing typed carries over.
  const [epoch, setEpoch] = useState(0);

  // Phase follows `locked` (adjusted while rendering, not in an effect).
  if (locked && (phase === 'off' || phase === 'clear')) {
    setPhase('veil');
    setEpoch((e) => e + 1);
  } else if (!locked && (phase === 'veil' || phase === 'locked')) {
    setPhase('clear');
  }

  useLayoutEffect(() => {
    setActiveLockPhase(phase);
  }, [phase]);

  useEffect(() => () => setActiveLockPhase('off'), []);

  useEffect(() => {
    onPhaseChange?.(phase);
  }, [phase, onPhaseChange]);

  const veilRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const originRef = useRef<Point | null>(null);

  // Veil: fade in, the clock coming forward.
  useEffect(() => {
    if (phase !== 'veil') return;
    const el = veilRef.current;
    if (!el) return;
    const full = mode === 'full';
    return runTween(
      veilMs(mode),
      (t) => {
        const e = easeInOut(t);
        el.style.opacity = String(e);
        el.style.setProperty('--lock-veil-scale', String(full ? veilClockScale(e) : 1));
      },
      () => {
        el.style.opacity = '1';
        el.style.removeProperty('--lock-veil-scale');
        setPhase('locked');
      }
    );
  }, [phase, mode, epoch]);

  // Clear: the hole opens from the field, the ring rides its edge.
  useEffect(() => {
    if (phase !== 'clear') return;
    const el = veilRef.current;
    const ring = ringRef.current;
    if (!el) return;
    const origin = originRef.current ?? defaultOrigin();
    const screen = { width: window.innerWidth, height: window.innerHeight };
    const reach = clearReach(origin, screen);
    const full = mode === 'full';
    return runTween(
      clearMs(mode),
      (t) => {
        if (!full) {
          // Reduced: the layer fades out in place. Off: this is already its last frame.
          el.style.opacity = String(1 - t);
          return;
        }
        const r = clearRadius(t, reach);
        const mask = holeMask(origin, r);
        el.style.webkitMaskImage = mask;
        el.style.maskImage = mask;
        if (ring) {
          const rr = Math.max(1, r);
          ring.style.left = `${origin.x - rr}px`;
          ring.style.top = `${origin.y - rr}px`;
          ring.style.width = `${2 * rr}px`;
          ring.style.height = `${2 * rr}px`;
          ring.style.opacity = String(ringOpacity(t));
        }
      },
      () => setPhase('off')
    );
  }, [phase, mode]);

  if (phase === 'off') return null;

  const accent = accentOf(session?.accent);
  return (
    <div
      className="lock-host"
      data-lock-layer={phase}
      style={{ '--lock-accent': accent } as React.CSSProperties}
    >
      <div ref={veilRef} className="lock-veil" style={{ opacity: phase === 'veil' ? 0 : 1 }}>
        <LockScreen
          key={epoch}
          session={session}
          notifications={notifications}
          unlocking={phase === 'clear'}
          onOrigin={(origin) => {
            originRef.current = origin;
          }}
        />
      </div>
      {phase === 'clear' && mode === 'full' && <div ref={ringRef} className="lock-ring" aria-hidden="true" />}
    </div>
  );
};

export default LockLayer;

import { useEffect, useState } from 'react';
import echoClient from './EchoClient';
import { EVO_IFACE } from './overlay';
import { getSetting, onSettingChange, setSetting, SETTING_KEYS } from './settingsBus';

/**
 * Animation mode, shared by Bloom's own motion (framer-motion, see
 * pyxis-experience/src/motion.ts) and Evo's window animations
 * (`evo.SetAnimationSettings`, evo/src/anim/). One persisted preference,
 * `pyxis.animations`, drives both. The names and shapes mirror the IPC
 * contract in docs/internal/evo-animation-plan.md; the contract test
 * (src/overlay/__tests__/animations.test.tsx) reads them back out of
 * evo/src/enhancements/echo_ipc.rs.
 */

export type AnimationMode = 'full' | 'reduced' | 'off';
export const ANIMATION_MODES: readonly AnimationMode[] = ['full', 'reduced', 'off'];

export function isAnimationMode(value: unknown): value is AnimationMode {
  return value === 'full' || value === 'reduced' || value === 'off';
}

/** `SetAnimationSettings`: either field may be left out. */
export interface AnimationSettingsRequest {
  mode?: AnimationMode;
  /** Duration multiplier: 0 is off, 1 normal, 10 slow motion (the harness's). */
  scale?: number;
}

export interface AnimationSettingsReply {
  ok: boolean;
  mode: AnimationMode;
  scale: number;
}

/** Per-kind counters in `GetAnimationState`; they exist for the harness. */
export interface AnimationCounters {
  open: number;
  close: number;
  minimize: number;
  restore: number;
  geometry: number;
}

export interface AnimationState {
  mode: AnimationMode;
  scale: number;
  /** Animations running now. */
  active: number;
  started: AnimationCounters;
  completed: AnimationCounters;
}

/** Tell Evo the mode and/or scale. Null when Evo isn't there or refuses. */
export async function setAnimationSettings(
  settings: AnimationSettingsRequest
): Promise<AnimationSettingsReply | null> {
  try {
    const body: Record<string, unknown> = {};
    if (settings.mode !== undefined) body.mode = settings.mode;
    if (settings.scale !== undefined) body.scale = settings.scale;
    const res = (await echoClient.callMethod('evo', EVO_IFACE, 'SetAnimationSettings', body)) as
      | AnimationSettingsReply
      | undefined;
    return res && typeof res.ok === 'boolean' ? res : null;
  } catch {
    return null;
  }
}

export async function getAnimationState(): Promise<AnimationState | null> {
  try {
    return ((await echoClient.callMethod('evo', EVO_IFACE, 'GetAnimationState', {})) as AnimationState | undefined) ?? null;
  } catch {
    return null;
  }
}

/**
 * Change the mode for everyone: persisted (so the shell's documents and the
 * next boot read it) and sent to Evo.
 */
export async function applyAnimationMode(mode: AnimationMode): Promise<void> {
  await setSetting(SETTING_KEYS.animations, mode);
  await setAnimationSettings({ mode });
}

/**
 * The user's animation mode, live across documents through the settings
 * bus (the desktop and the overlay are separate pages). `full` until the
 * saved value arrives.
 */
export function useAnimationMode(): AnimationMode {
  const [mode, setMode] = useState<AnimationMode>('full');

  useEffect(() => {
    let mounted = true;
    getSetting<unknown>(SETTING_KEYS.animations)
      .then((saved) => {
        if (mounted && isAnimationMode(saved)) setMode(saved);
      })
      .catch(() => {});
    const unsub = onSettingChange(({ key, value }) => {
      if (key === SETTING_KEYS.animations && isAnimationMode(value)) setMode(value);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  return mode;
}

/**
 * Sound: the output volume and device, and the named system sounds.
 *
 * Volume and outputs are echo's `org.geckoOS.audio`
 * (echo/src/services/audio.rs), a thin layer over PipeWire/WirePlumber. It
 * signals every change, so the quick-settings slider and Settings follow
 * each other. System sounds are `org.geckoOS.sound`
 * (echo/src/services/sound.rs): `playSystemSound('error')` plays the image's
 * error sound, whatever file that currently is.
 */
import { echoClient } from './EchoClient';

export const AUDIO_IFACE = 'org.geckoOS.audio';
export const SOUND_IFACE = 'org.geckoOS.sound';

export const AUDIO_SIGNALS = {
  /** `{ volume, muted }` */
  volumeChanged: 'VolumeChanged',
  /** `{ outputs }` */
  outputChanged: 'OutputChanged',
} as const;

/** The sounds the image ships, by the names `playSystemSound` takes. */
export type SystemSound = 'boot' | 'shutdown' | 'notification' | 'error';

export interface VolumeState {
  /** 0–100 */
  volume: number;
  muted: boolean;
}

export interface AudioOutput {
  /** PipeWire's object id, which is what `setDefaultOutput` takes. */
  id: number;
  name: string;
  description: string;
  isDefault: boolean;
}

/** One audio-service call. On a machine with no audio stack, or one where
 *  PipeWire is not up yet, every call fails. The UI shows that as "no
 *  audio" (null or []), not as an error. */
async function audioCall<T>(method: string, args: Record<string, unknown>): Promise<T | undefined> {
  try {
    return (await echoClient.callMethod('audio', AUDIO_IFACE, method, args)) as T | undefined;
  } catch {
    return undefined;
  }
}

function isVolume(value: unknown): value is VolumeState {
  return typeof (value as VolumeState | undefined)?.volume === 'number';
}

/** null if there is no audio service to ask. */
export async function getVolume(): Promise<VolumeState | null> {
  const res = await audioCall<VolumeState>('getVolume', {});
  return isVolume(res) ? res : null;
}

export async function setVolume(volume: number): Promise<VolumeState | null> {
  const clamped = Math.round(Math.min(100, Math.max(0, volume)));
  const res = await audioCall<VolumeState>('setVolume', { volume: clamped });
  return isVolume(res) ? res : null;
}

export async function setMuted(muted: boolean): Promise<VolumeState | null> {
  const res = await audioCall<VolumeState>('setMute', { muted });
  return isVolume(res) ? res : null;
}

export async function listOutputs(): Promise<AudioOutput[]> {
  return (await audioCall<{ outputs?: AudioOutput[] }>('listOutputs', {}))?.outputs ?? [];
}

export async function setDefaultOutput(id: number): Promise<AudioOutput[]> {
  return (await audioCall<{ outputs?: AudioOutput[] }>('setDefaultOutput', { id }))?.outputs ?? [];
}

export function onVolumeChanged(callback: (state: VolumeState) => void): () => void {
  return echoClient.onSignal(AUDIO_IFACE, AUDIO_SIGNALS.volumeChanged, (data) => {
    const state = data as VolumeState | undefined;
    if (state && typeof state.volume === 'number') callback(state);
  });
}

export function onOutputChanged(callback: (outputs: AudioOutput[]) => void): () => void {
  return echoClient.onSignal(AUDIO_IFACE, AUDIO_SIGNALS.outputChanged, (data) => {
    const outputs = (data as { outputs?: AudioOutput[] } | undefined)?.outputs;
    if (outputs) callback(outputs);
  });
}

/**
 * Play one of the image's system sounds. Fire-and-forget: resolves once
 * playback has started, or quietly to false when there is no such sound or no
 * audio stack. A missing sound is never an error worth surfacing.
 */
export async function playSystemSound(name: SystemSound): Promise<boolean> {
  try {
    const res = (await echoClient.callMethod('sound', SOUND_IFACE, 'play', { name })) as
      | { success?: boolean }
      | undefined;
    return res?.success ?? false;
  } catch {
    return false;
  }
}

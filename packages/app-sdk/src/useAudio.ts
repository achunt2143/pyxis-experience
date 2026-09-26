import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getVolume,
  listOutputs,
  onOutputChanged,
  onVolumeChanged,
  setDefaultOutput,
  setMuted,
  setVolume,
  type AudioOutput,
} from './audio';

/** How often a dragged volume slider may reach the audio service. */
const VOLUME_SEND_MS = 80;

/**
 * The output volume, live. `volume` is null until the audio service
 * answers, and stays null on a machine with no audio stack. It follows the
 * service's VolumeChanged signal, so two sliders (quick settings, Settings)
 * move together.
 *
 * `changeVolume` is for a slider's onChange. A drag fires that continuously,
 * and every call runs `wpctl` on the device, so it sends at most one level
 * every 80 ms: always the latest, and always the one the drag ends on.
 * `enabled` lets a panel subscribe only while it is open.
 */
export function useOutputVolume(enabled = true) {
  const [volume, setVolumeState] = useState<number | null>(null);
  const [muted, setMutedState] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    const apply = (state: { volume: number; muted: boolean }) => {
      setVolumeState(state.volume);
      setMutedState(state.muted);
    };
    void getVolume().then((state) => {
      if (mounted && state) apply(state);
    });
    const off = onVolumeChanged(apply);
    return () => {
      mounted = false;
      off();
    };
  }, [enabled]);

  const pending = useRef<number | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    []
  );

  const changeVolume = useCallback((next: number) => {
    setVolumeState(next);
    pending.current = next;
    if (timer.current !== null) return;
    timer.current = window.setTimeout(() => {
      timer.current = null;
      if (pending.current !== null) void setVolume(pending.current);
    }, VOLUME_SEND_MS);
  }, []);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMutedState(next);
    void setMuted(next);
  }, [muted]);

  return { volume, muted, changeVolume, toggleMute };
}

/** The audio outputs, live, and a way to choose the default one. */
export function useAudioOutputs(enabled = true) {
  const [outputs, setOutputs] = useState<AudioOutput[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    void listOutputs().then((list) => {
      if (mounted) setOutputs(list);
    });
    const off = onOutputChanged(setOutputs);
    return () => {
      mounted = false;
      off();
    };
  }, [enabled]);

  const choose = useCallback(async (id: number) => {
    const list = await setDefaultOutput(id);
    if (list.length) setOutputs(list);
  }, []);

  return { outputs, choose };
}

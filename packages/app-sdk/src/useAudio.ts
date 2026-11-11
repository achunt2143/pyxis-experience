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
 * How long after a change made here the service's VolumeChanged signals are
 * taken as echoes of it. Each change comes back as a signal a beat behind
 * the drag that sent it, carrying an older level than the slider now shows.
 */
const ECHO_GRACE_MS = 400;

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
 *
 * `revision` changes whenever the volume changes from outside: the first
 * read, or another panel moving it. It never changes for the caller's own
 * changeVolume. Use it as a slider's `key`: remochi's Slider reads `value`
 * only when it mounts, so without a remount its knob stays where it started
 * (at 0 in quick settings, which mounts before the volume is known) while
 * the label beside it shows the real level.
 */
export function useOutputVolume(enabled = true) {
  const [volume, setVolumeState] = useState<number | null>(null);
  const [muted, setMutedState] = useState(false);
  const [revision, setRevision] = useState(0);
  const lastLocalChange = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    const apply = (state: { volume: number; muted: boolean }) => {
      setVolumeState(state.volume);
      setMutedState(state.muted);
      setRevision((n) => n + 1);
    };
    void getVolume().then((state) => {
      if (mounted && state) apply(state);
    });
    const off = onVolumeChanged((state) => {
      // Mid-drag, a signal is the echo of a level this drag already passed.
      // Applying it would pull the slider back under the pointer.
      if (Date.now() - lastLocalChange.current < ECHO_GRACE_MS) return;
      apply(state);
    });
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
    lastLocalChange.current = Date.now();
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
    lastLocalChange.current = Date.now();
    setMutedState(next);
    void setMuted(next);
  }, [muted]);

  return { volume, muted, revision, changeVolume, toggleMute };
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

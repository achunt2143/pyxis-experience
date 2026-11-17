import { view, type Component } from '@duyojs/duyo';
import {
  getInputVolume,
  listInputs,
  listOutputs,
  onInputChanged,
  onInputVolumeChanged,
  onOutputChanged,
  playSystemSound,
  setDefaultInput,
  setDefaultOutput,
  setInputMuted as sendInputMuted,
  setInputVolume as sendInputVolume,
  setMuted as sendMuted,
  setVolume as sendVolume,
  type AudioInput,
  type AudioOutput,
  type SystemSound,
  type VolumeState,
} from '@pyxis/app-sdk';
import { bindVolume, onDestroy } from '@pyxis/app-sdk/duyo';
import '../parts/OutputRow';
import { forwardAriaLabel, present } from '../parts/present';
import spec from './Sound.view.json';
import type { CodeBehind } from './Sound.view.gen';

/** How often a dragged slider may reach the audio service (every call runs `wpctl` on the device). */
const VOLUME_SEND_MS = 80;
/**
 * How long after a change made here the service's VolumeChanged signals are taken as echoes
 * of it: each comes back a beat behind the drag, carrying an older level than the slider shows.
 */
const ECHO_GRACE_MS = 400;

/** Renders a shared volume/mute channel (master output or microphone input). */
function renderVolumeChannel(
  controls: {
    empty: Component;
    group: Component;
    slider: Component;
    muteIcon: Component;
    muteBtn: Component;
    level: Component;
  },
  volume: number | null,
  muted: boolean,
  labels: { activeIcon: string; mutedIcon: string; muteLabel: string; unmuteLabel: string; extraAttrs?: Record<string, unknown> }
) {
  controls.empty.setShowing(volume === null);
  controls.group.setShowing(volume !== null);
  if (volume === null) return;
  controls.slider.setValue(volume);
  controls.muteIcon.setIcon(muted || volume === 0 ? labels.mutedIcon : labels.activeIcon);
  controls.muteBtn.addRemoveClass('muted', muted);
  const title = muted ? labels.unmuteLabel : labels.muteLabel;
  controls.muteBtn.setAttributes({ ...(labels.extraAttrs ?? {}), title, 'aria-label': title });
  controls.level.setContent(muted ? 'Muted' : `${volume}%`);
  controls.level.setStyle(
    `min-width:48px;flex-shrink:0;text-align:right;font-size:0.82rem;font-weight:600;color:${
      muted ? 'var(--mochi-error)' : 'var(--mochi-text)'
    }`
  );
}

/**
 * Sound: master output volume/devices, microphone input volume/devices, and system sound
 * previews through `org.geckoOS.audio` and `org.geckoOS.sound`.
 */
export default view(spec, {
  create() {
    this.inherited();
    this._lastLocal = 0;
    this._pending = null as number | null;
    this._timer = null as ReturnType<typeof setTimeout> | null;
    this._confirmedVolume = null as number | null;
    this._lastInputLocal = 0;
    this._pendingInput = null as number | null;
    this._inputTimer = null as ReturnType<typeof setTimeout> | null;
    this._confirmedInputVolume = null as number | null;
    onDestroy(this, () => {
      if (this._timer) {
        clearTimeout(this._timer);
        this._timer = null;
      }
      if (this._pending !== null) {
        const pending = this._pending as number;
        this._pending = null;
        void sendVolume(pending).catch(() => {});
      }
      if (this._inputTimer) {
        clearTimeout(this._inputTimer);
        this._inputTimer = null;
      }
      if (this._pendingInput !== null) {
        const pendingInput = this._pendingInput as number;
        this._pendingInput = null;
        void sendInputVolume(pendingInput).catch(() => {});
      }
    });

    bindVolume(this, 'audioState');
    void listOutputs()
      .then((list) => {
        if (!this.destroyed) this.setOutputList(list);
      })
      .catch((err) => {
        if (!this.destroyed) this.setError(`Failed to load output devices: ${err instanceof Error ? err.message : String(err)}`);
      });
    const offOutputs = onOutputChanged((list) => {
      if (!this.destroyed) this.setOutputList(list);
    });
    onDestroy(this, offOutputs);

    void getInputVolume()
      .then((state) => {
        if (!this.destroyed && state) this.setInputState(state);
      })
      .catch((err) => {
        if (!this.destroyed) this.setError(`Failed to read microphone state: ${err instanceof Error ? err.message : String(err)}`);
      });
    const offInputVol = onInputVolumeChanged((state) => {
      if (!this.destroyed) this.setInputState(state);
    });
    onDestroy(this, offInputVol);

    void listInputs()
      .then((list) => {
        if (!this.destroyed) this.setInputList(list);
      })
      .catch((err) => {
        if (!this.destroyed) this.setError(`Failed to load input devices: ${err instanceof Error ? err.message : String(err)}`);
      });
    const offInputs = onInputChanged((list) => {
      if (!this.destroyed) this.setInputList(list);
    });
    onDestroy(this, offInputs);

    this.draw();
    this.drawInput();
    this.outputListChanged();
    this.inputListChanged();
    this.errorChanged();
  },

  rendered() {
    this.inherited();
    forwardAriaLabel(this.$.slider, '[role="slider"]', 'Master volume');
    forwardAriaLabel(this.$.inputSlider, '[role="slider"]', 'Microphone input volume');
  },

  /** The service's state, unless it is the echo of a change this slider just made. */
  audioStateChanged() {
    const state = this.audioState as VolumeState | null;
    if (!state) return;
    if (Date.now() - (this._lastLocal as number) < ECHO_GRACE_MS) return;
    this._confirmedVolume = state.volume;
    this.setVolume(state.volume);
    this.setMuted(state.muted);
  },
  inputStateChanged() {
    const state = this.inputState as VolumeState | null;
    if (!state) return;
    if (Date.now() - (this._lastInputLocal as number) < ECHO_GRACE_MS) return;
    this._confirmedInputVolume = state.volume;
    this.setInputVolume(state.volume);
    this.setInputMuted(state.muted);
  },
  volumeChanged() {
    this.draw();
  },
  mutedChanged() {
    this.draw();
  },
  inputVolumeChanged() {
    this.drawInput();
  },
  inputMutedChanged() {
    this.drawInput();
  },
  outputListChanged() {
    this.$.outputs.setItems(this.outputList as AudioOutput[]);
  },
  inputListChanged() {
    this.$.inputs.setItems(this.inputList as AudioInput[]);
  },
  errorChanged() {
    const { errorRow } = this.$;
    errorRow.setContent(this.error);
    present(errorRow, this.error !== '', { role: 'alert', 'data-sound-error': true });
  },

  async commitVolume(next: number) {
    try {
      const res = await sendVolume(next);
      if (this.destroyed) return;
      if (!res) {
        if (this._confirmedVolume !== null) this.setVolume(this._confirmedVolume);
        this.setError('Failed to update output volume.');
      } else {
        this._confirmedVolume = res.volume;
      }
    } catch (err) {
      if (!this.destroyed) {
        if (this._confirmedVolume !== null) this.setVolume(this._confirmedVolume);
        this.setError(`Failed to update output volume: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  },
  async commitInputVolume(next: number) {
    try {
      const res = await sendInputVolume(next);
      if (this.destroyed) return;
      if (!res) {
        if (this._confirmedInputVolume !== null) this.setInputVolume(this._confirmedInputVolume);
        this.setError('Failed to update microphone volume.');
      } else {
        this._confirmedInputVolume = res.volume;
      }
    } catch (err) {
      if (!this.destroyed) {
        if (this._confirmedInputVolume !== null) this.setInputVolume(this._confirmedInputVolume);
        this.setError(`Failed to update microphone volume: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  },

  volumeMoved(_sender, event) {
    const next = event['value'] as number;
    this._lastLocal = Date.now();
    this.setError('');
    this.setVolume(next);
    this._pending = next;
    if (this._timer) return true;
    this._timer = setTimeout(() => {
      this._timer = null;
      const pending = this._pending as number | null;
      this._pending = null;
      if (pending !== null) void this.commitVolume(pending);
    }, VOLUME_SEND_MS);
    return true;
  },
  inputVolumeMoved(_sender, event) {
    const next = event['value'] as number;
    this._lastInputLocal = Date.now();
    this.setError('');
    this.setInputVolume(next);
    this._pendingInput = next;
    if (this._inputTimer) return true;
    this._inputTimer = setTimeout(() => {
      this._inputTimer = null;
      const pending = this._pendingInput as number | null;
      this._pendingInput = null;
      if (pending !== null) void this.commitInputVolume(pending);
    }, VOLUME_SEND_MS);
    return true;
  },
  async toggleMute() {
    const prev = Boolean(this.muted);
    const next = !prev;
    this._lastLocal = Date.now();
    this.setError('');
    this.setMuted(next);
    try {
      const res = await sendMuted(next);
      if (this.destroyed) return true;
      if (!res) {
        this.setMuted(prev);
        this.setError('Failed to update mute state.');
      } else {
        this._confirmedVolume = res.volume;
        this.setMuted(res.muted);
        this.setVolume(res.volume);
      }
    } catch (err) {
      if (!this.destroyed) {
        this.setMuted(prev);
        this.setError(`Failed to update mute state: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return true;
  },
  async toggleInputMute() {
    const prev = Boolean(this.inputMuted);
    const next = !prev;
    this._lastInputLocal = Date.now();
    this.setError('');
    this.setInputMuted(next);
    try {
      const res = await sendInputMuted(next);
      if (this.destroyed) return true;
      if (!res) {
        this.setInputMuted(prev);
        this.setError('Failed to update microphone mute state.');
      } else {
        this._confirmedInputVolume = res.volume;
        this.setInputMuted(res.muted);
        this.setInputVolume(res.volume);
      }
    } catch (err) {
      if (!this.destroyed) {
        this.setInputMuted(prev);
        this.setError(`Failed to update microphone mute state: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return true;
  },
  async playTone() {
    this.setError('');
    try {
      const ok = await playSystemSound('notification');
      if (!this.destroyed && !ok) this.setError('Could not play test tone.');
    } catch (err) {
      if (!this.destroyed) {
        this.setError(`Could not play test tone: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return true;
  },
  async previewSound(sender: Component) {
    const name = sender['soundName'] as SystemSound | undefined;
    if (!name) return true;
    this.setError('');
    try {
      const ok = await playSystemSound(name);
      if (!this.destroyed && !ok) this.setError(`Could not play ${name} sound.`);
    } catch (err) {
      if (!this.destroyed) {
        this.setError(`Could not play ${name} sound: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return true;
  },
  async pickOutput(sender: Component) {
    const id = (sender['item'] as AudioOutput).id;
    this.setError('');
    try {
      const list = await setDefaultOutput(id);
      if (this.destroyed) return true;
      if (list.length) this.setOutputList(list);
      else this.setError('Failed to switch output device.');
    } catch (err) {
      if (!this.destroyed) {
        this.setError(`Failed to switch output device: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return true;
  },
  async pickInput(sender: Component) {
    const id = (sender['item'] as AudioInput).id;
    this.setError('');
    try {
      const list = await setDefaultInput(id);
      if (this.destroyed) return true;
      if (list.length) this.setInputList(list);
      else this.setError('Failed to switch input device.');
    } catch (err) {
      if (!this.destroyed) {
        this.setError(`Failed to switch input device: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return true;
  },

  draw() {
    const { noAudio, controls, slider, muteIcon, mute, level } = this.$;
    renderVolumeChannel(
      { empty: noAudio, group: controls, slider, muteIcon, muteBtn: mute, level },
      this.volume as number | null,
      this.muted as boolean,
      { activeIcon: 'Volume2', mutedIcon: 'VolumeX', muteLabel: 'Mute', unmuteLabel: 'Unmute' }
    );
  },

  drawInput() {
    const { noInputAudio, inputControls, inputSlider, inputMuteIcon, inputMute, inputLevel } = this.$;
    renderVolumeChannel(
      { empty: noInputAudio, group: inputControls, slider: inputSlider, muteIcon: inputMuteIcon, muteBtn: inputMute, level: inputLevel },
      this.inputVolume as number | null,
      this.inputMuted as boolean,
      {
        activeIcon: 'Mic',
        mutedIcon: 'MicOff',
        muteLabel: 'Mute microphone',
        unmuteLabel: 'Unmute microphone',
        extraAttrs: { 'data-input-mute': true },
      }
    );
  },
} satisfies CodeBehind);

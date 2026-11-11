import { view, type Component } from '@duyojs/duyo';
import {
  listOutputs,
  onOutputChanged,
  playSystemSound,
  setDefaultOutput,
  setMuted as sendMuted,
  setVolume as sendVolume,
  type AudioOutput,
  type VolumeState,
} from '@pyxis/app-sdk';
import { bindVolume, onDestroy } from '@pyxis/app-sdk/duyo';
import '../parts/OutputRow';
import spec from './Sound.view.json';
import type { CodeBehind } from './Sound.view.gen';

/** How often a dragged slider may reach the audio service (every call runs `wpctl` on the device). */
const VOLUME_SEND_MS = 80;
/**
 * How long after a change made here the service's VolumeChanged signals are taken as echoes
 * of it: each comes back a beat behind the drag, carrying an older level than the slider shows.
 */
const ECHO_GRACE_MS = 400;

/**
 * Sound: master volume (the same `org.geckoOS.audio` state quick settings shows, live) and the
 * output device. remochi 0.4's Slider is controlled, so the slider simply follows `volume`
 * (the old `revision` remount is gone).
 */
export default view(spec, {
  create() {
    this.inherited();
    this._lastLocal = 0;
    this._pending = null as number | null;
    this._timer = null as ReturnType<typeof setTimeout> | null;
    onDestroy(this, () => {
      if (this._timer) clearTimeout(this._timer);
    });

    bindVolume(this, 'audioState');
    void listOutputs().then((list) => {
      if (!this.destroyed) this.setOutputList(list);
    });
    const off = onOutputChanged((list) => {
      if (!this.destroyed) this.setOutputList(list);
    });
    onDestroy(this, off);
    this.draw();
    this.outputListChanged();
  },

  /** The service's state, unless it is the echo of a change this slider just made. */
  audioStateChanged() {
    const state = this.audioState as VolumeState | null;
    if (!state) return;
    if (Date.now() - (this._lastLocal as number) < ECHO_GRACE_MS) return;
    this.setVolume(state.volume);
    this.setMuted(state.muted);
  },
  volumeChanged() {
    this.draw();
  },
  mutedChanged() {
    this.draw();
  },
  outputListChanged() {
    this.$.outputs.setItems(this.outputList as AudioOutput[]);
  },

  volumeMoved(_sender, event) {
    const next = event['value'] as number;
    this._lastLocal = Date.now();
    this.setVolume(next);
    this._pending = next;
    if (this._timer) return true;
    this._timer = setTimeout(() => {
      this._timer = null;
      if (this._pending !== null) void sendVolume(this._pending as number);
    }, VOLUME_SEND_MS);
    return true;
  },
  toggleMute() {
    const next = !this.muted;
    this._lastLocal = Date.now();
    this.setMuted(next);
    void sendMuted(next);
    return true;
  },
  playTone() {
    void playSystemSound('notification');
    return true;
  },
  pickOutput(sender: Component) {
    const id = (sender['item'] as AudioOutput).id;
    void setDefaultOutput(id).then((list) => {
      if (!this.destroyed && list.length) this.setOutputList(list);
    });
    return true;
  },

  draw() {
    const { noAudio, controls, slider, muteIcon, mute, level } = this.$;
    const volume = this.volume as number | null;
    const muted = this.muted as boolean;
    noAudio.setShowing(volume === null);
    controls.setShowing(volume !== null);
    if (volume === null) return;
    slider.setValue(volume);
    muteIcon.setIcon(muted || volume === 0 ? 'VolumeX' : 'Volume2');
    mute.addRemoveClass('muted', muted);
    mute.setAttributes({ title: muted ? 'Unmute' : 'Mute', 'aria-label': muted ? 'Unmute' : 'Mute' });
    level.setContent(muted ? 'Muted' : `${volume}%`);
    level.setStyle(
      `min-width:48px;text-align:right;font-size:0.82rem;font-weight:600;color:${
        muted ? 'var(--color-error, #ef4444)' : 'var(--color-text, #334155)'
      }`
    );
  },
} satisfies CodeBehind);

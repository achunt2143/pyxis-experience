import { describe, it, expect } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AUDIO_SIGNALS,
  getVolume,
  listOutputs,
  onOutputChanged,
  onVolumeChanged,
  setDefaultOutput,
  setMuted,
  setVolume,
  useOutputVolume,
  type AudioOutput,
} from '@pyxis/app-sdk';

/**
 * Audio contract tests: the SDK and its mock against echo's audio service.
 * Same pattern as the nova and notification suites. Each shape is read out
 * of the Rust source, so a field added to audio.rs, or a method renamed in
 * daemon.rs, fails here instead of on a device.
 */

const AUDIO_RS = resolve(__dirname, '../../../../geckos/echo/src/services/audio.rs');
const DAEMON_RS = resolve(__dirname, '../../../../geckos/echo/src/bin/daemon.rs');
const haveRust = existsSync(AUDIO_RS) && existsSync(DAEMON_RS);

/** Field names of a Rust struct, camelCased as serde renames them. */
function rustStructFields(source: string, name: string): string[] {
  const at = source.indexOf(`pub struct ${name} {`);
  if (at < 0) throw new Error(`pub struct ${name} not found`);
  const body = source.slice(at, source.indexOf('\n}', at));
  return [...body.matchAll(/^\s+pub (\w+):/gm)].map((m) =>
    m[1].replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
  );
}

describe('audio mock matches the Rust service', () => {
  it.runIf(haveRust)('volume and outputs carry exactly the fields audio.rs serializes', async () => {
    const rust = readFileSync(AUDIO_RS, 'utf8');
    const volumeFields = rustStructFields(rust, 'Volume');
    const outputFields = rustStructFields(rust, 'Output');
    expect(volumeFields).toEqual(expect.arrayContaining(['volume', 'muted']));
    expect(outputFields).toEqual(expect.arrayContaining(['id', 'isDefault']));

    expect(Object.keys((await getVolume())!).sort()).toEqual([...volumeFields].sort());
    const [output] = await listOutputs();
    expect(Object.keys(output).sort()).toEqual([...outputFields].sort());
  });

  it.runIf(haveRust)('calls only methods echo-daemon registers, and uses its signal names', () => {
    const daemon = readFileSync(DAEMON_RS, 'utf8');
    const rust = readFileSync(AUDIO_RS, 'utf8');
    const registered = [...daemon.matchAll(/AUDIO_IFACE,\s*"(\w+)"/g)].map((m) => m[1]);
    expect(registered.sort()).toEqual(
      [
        'getVolume',
        'listOutputs',
        'setDefaultOutput',
        'setMute',
        'setVolume',
        'getInputVolume',
        'listInputs',
        'setDefaultInput',
        'setInputMute',
        'setInputVolume',
      ].sort()
    );
    const signal = (constant: string) => rust.match(new RegExp(`pub const ${constant}: &str = "([^"]+)";`))?.[1];
    expect(AUDIO_SIGNALS.volumeChanged).toBe(signal('SIGNAL_VOLUME_CHANGED'));
    expect(AUDIO_SIGNALS.outputChanged).toBe(signal('SIGNAL_OUTPUT_CHANGED'));
    expect(AUDIO_SIGNALS.inputVolumeChanged).toBe(signal('SIGNAL_INPUT_VOLUME_CHANGED'));
    expect(AUDIO_SIGNALS.inputChanged).toBe(signal('SIGNAL_INPUT_CHANGED'));
  });
});

describe('audio lifecycle', () => {
  it('clamps and signals volume changes, and switches outputs', async () => {
    const volumes: number[] = [];
    const defaults: number[] = [];
    const offVolume = onVolumeChanged((state) => volumes.push(state.volume));
    const offOutput = onOutputChanged((outputs: AudioOutput[]) =>
      defaults.push(outputs.find((o) => o.isDefault)!.id)
    );

    expect((await setVolume(140))!.volume).toBe(100);
    expect((await setVolume(-5))!.volume).toBe(0);
    expect((await setMuted(true))!.muted).toBe(true);
    expect(volumes).toEqual([100, 0, 0]);

    const outputs = await listOutputs();
    const other = outputs.find((o) => !o.isDefault)!;
    const after = await setDefaultOutput(other.id);
    expect(after.find((o) => o.isDefault)!.id).toBe(other.id);
    expect(defaults).toEqual([other.id]);

    // Put the shared mock back the way the other suites expect it.
    await setMuted(false);
    await setVolume(75);
    await setDefaultOutput(outputs.find((o) => o.isDefault)!.id);
    offVolume();
    offOutput();
  });
});

const pause = (ms: number) => act(() => new Promise<void>((resolve) => setTimeout(resolve, ms)));

describe('useOutputVolume', () => {
  // remochi's Slider reads `value` only on mount, so panels key it on
  // `revision`. That must change when the volume is moved from outside, and
  // must not change for the panel's own drag, or the knob would jump.
  it('bumps revision for outside changes only, and ignores echoes of its own drag', async () => {
    const { result } = renderHook(() => useOutputVolume());
    await waitFor(() => expect(result.current.volume).toBe(75));
    const first = result.current.revision;
    expect(first).toBeGreaterThan(0);

    act(() => result.current.changeVolume(30));
    expect(result.current.volume).toBe(30);
    // The throttled send goes out, and the service's signal echoes it back.
    await pause(150);
    expect(result.current.volume).toBe(30);
    expect(result.current.revision).toBe(first);

    // Later, another panel moves it: a new level, and a new revision.
    await pause(450);
    await act(async () => {
      await setVolume(55);
    });
    expect(result.current.volume).toBe(55);
    expect(result.current.revision).toBeGreaterThan(first);

    await act(async () => {
      await setVolume(75);
    });
  });
});

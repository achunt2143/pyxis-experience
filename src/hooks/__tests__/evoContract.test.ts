import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { echoClient, EVO_IFACE, EVO_SIGNALS, EVO_SHORTCUT_SIGNAL } from '@pyxis/app-sdk';

/**
 * Evo window contract tests.
 *
 * Bloom's window store is fed by Evo's `ListWindows` and window signals, and
 * Evo is Rust in another repo's reach. These read the signal names and
 * payload fields out of `echo_ipc.rs` itself, then check three things hold
 * them: the SDK's `EVO_SIGNALS`, the store that consumes them, and the
 * EchoClient mock that stands in for Evo in `npm run dev`. Renaming a field
 * in `emit_window_*` fails here, not on a device.
 */

const ECHO_IPC_RS = resolve(
  __dirname,
  '../../../../geckos/evo/src/enhancements/echo_ipc.rs'
);
const PROVIDER_TS = resolve(__dirname, '../CompositorWindowsProvider.tsx');
const REDUCER_TS = resolve(__dirname, '../compositorWindows.ts');
const USE_ECHO_TS = resolve(__dirname, '../../../packages/app-sdk/src/useEcho.ts');

/** JSON keys inside the balanced `{ ... }` that opens at `open` in `source`. */
function keysOfObjectAt(source: string, open: number): string[] {
  let depth = 0;
  let end = open;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  return [...source.slice(open, end).matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"\s*:/g)].map((m) => m[1]);
}

/** `self.emit("Name", json!({ ... }))` calls: signal name -> payload keys. */
function emittedSignals(source: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of source.matchAll(/self\.emit\(\s*"(Window[A-Za-z]*)"\s*,\s*json!\(\{/g)) {
    out[m[1]] = keysOfObjectAt(source, m.index + m[0].length - 1);
  }
  return out;
}

/** Keys of the object literal the `ListWindows` handler builds per window. */
function listWindowsKeys(source: string): string[] {
  const at = source.indexOf('"ListWindows" =>');
  if (at < 0) throw new Error('ListWindows handler not found');
  const handlerSlice = source.slice(at, at + 600);
  let searchFrom = at;
  if (handlerSlice.includes('format_list_windows_json')) {
    const fnAt = source.indexOf('fn format_list_windows_json');
    if (fnAt < 0) throw new Error('format_list_windows_json helper not found');
    searchFrom = fnAt;
  }
  const open = source.indexOf('json!({', searchFrom);
  if (open < 0) throw new Error('ListWindows row object literal not found');
  return keysOfObjectAt(source, open + 'json!('.length);
}

// Signals Bloom has no use for (workspaces are not a concept in the shell).
const UNUSED = ['WindowMovedToWorkspace'];
// Payload fields that are bookkeeping, not state.
const BOOKKEEPING = ['timestamp', 'workspace_id'];

describe.runIf(existsSync(ECHO_IPC_RS))('evo window signals', () => {
  const rust = readFileSync(ECHO_IPC_RS, 'utf8');
  const emitted = emittedSignals(rust);

  it('extracts something (the parser is not vacuous)', () => {
    expect(Object.keys(emitted)).toContain('WindowCreated');
    expect(emitted.WindowCreated).toContain('window_id');
    expect(listWindowsKeys(rust)).toEqual(
      expect.arrayContaining(['window_id', 'app_id', 'minimized', 'maximized', 'fullscreen'])
    );
  });

  it('ShortcutTriggered is emitted with an action the shell handles', () => {
    expect(rust).toMatch(new RegExp(`self\\.emit\\(\\s*"${EVO_SHORTCUT_SIGNAL}"\\s*,\\s*json!\\(\\{[^}]*"action"`));
    const handled = readFileSync(resolve(__dirname, '../../components/ShellLayer.tsx'), 'utf8');
    const sent = [...readFileSync(resolve(__dirname, '../../../../geckos/evo/src/input_handler.rs'), 'utf8')
      .matchAll(/KeyAction::Shell\("([a-z-]+)"\)|emit_shortcut_triggered\("([a-z-]+)"\)/g)].map((m) => m[1] ?? m[2]);
    expect(new Set(sent)).toEqual(new Set(['launcher', 'overview', 'search', 'show-desktop']));
    for (const action of sent) expect(handled).toContain(action);
  });

  it('EVO_SIGNALS names every window signal Evo emits, and only those', () => {
    const ours = Object.values(EVO_SIGNALS).sort();
    const theirs = Object.keys(emitted)
      .filter((n) => !UNUSED.includes(n))
      .sort();
    expect(ours).toEqual(theirs);
  });

  it('the window store reads every payload field Evo sends', () => {
    const provider = readFileSync(PROVIDER_TS, 'utf8');
    for (const [signal, keys] of Object.entries(emitted)) {
      if (UNUSED.includes(signal)) continue;
      for (const key of keys.filter((k) => !BOOKKEEPING.includes(k))) {
        expect(
          provider.includes(`p.${key}`),
          `${signal} carries '${key}' but CompositorWindowsProvider never reads p.${key}`
        ).toBe(true);
      }
    }
  });

  it('the store reads every field of a ListWindows row', () => {
    const reducer = readFileSync(REDUCER_TS, 'utf8');
    for (const key of listWindowsKeys(rust)) {
      expect(
        reducer.includes(`w.${key}`),
        `ListWindows sends '${key}' but compositorWindows.ts never reads w.${key}`
      ).toBe(true);
    }
  });

  it('window calls are keyed by window_id, as resolve_window_arg expects', () => {
    expect(rust).toMatch(/get\("window_id"\)/);
    const useEcho = readFileSync(USE_ECHO_TS, 'utf8');
    for (const method of ['CloseWindow', 'FocusWindow', 'MinimizeWindow', 'RestoreWindow']) {
      expect(rust).toContain(`"${method}" =>`);
      const call = useEcho.indexOf(`'${method}'`);
      expect(call, `useEcho has no ${method} call`).toBeGreaterThan(-1);
      expect(useEcho.slice(call, call + 80)).toContain('window_id');
    }
  });

  it('the mock emits Evo\'s payload shape for each signal it fakes', async () => {
    const seen: Record<string, Record<string, unknown>> = {};
    const unsubs = [
      EVO_SIGNALS.created,
      EVO_SIGNALS.closed,
      EVO_SIGNALS.focusChanged,
      EVO_SIGNALS.minimized,
      EVO_SIGNALS.maximized,
    ].map((sig) =>
      echoClient.onSignal(EVO_IFACE, sig, (d) => {
        seen[sig] = d as Record<string, unknown>;
      })
    );
    const nova = (m: string, a: Record<string, unknown>) =>
      echoClient.callMethod('nova', 'org.geckoOS.nova', m, a);
    const evo = (m: string, a: Record<string, unknown>) =>
      echoClient.callMethod('evo', EVO_IFACE, m, a);

    await nova('Launch', { appId: 'files' });
    await new Promise((r) => setTimeout(r, 700));
    const { windows } = (await evo('ListWindows', {})) as { windows: Record<string, unknown>[] };
    expect(windows.length).toBeGreaterThan(0);
    const id = windows[0].window_id as number;

    // ListWindows rows carry every field Evo's do.
    for (const key of listWindowsKeys(rust)) expect(windows[0]).toHaveProperty(key);

    await evo('MinimizeWindow', { window_id: id });
    await evo('MaximizeWindow', { window_id: id });
    await evo('CloseWindow', { window_id: id });
    unsubs.forEach((u) => u());

    for (const sig of Object.values(EVO_SIGNALS)) {
      if (!seen[sig]) continue; // moved/fullscreen are not faked
      // `timestamp` is on some Evo signals and not others (created/closed
      // have none yet); nothing reads it, so it is not part of the shape.
      const shape = (keys: string[]) => keys.filter((k) => k !== 'timestamp').sort();
      expect(shape(Object.keys(seen[sig])), `mock ${sig} payload`).toEqual(shape(emitted[sig]));
    }
    expect(Object.keys(seen)).toEqual(
      expect.arrayContaining([
        EVO_SIGNALS.created,
        EVO_SIGNALS.closed,
        EVO_SIGNALS.focusChanged,
        EVO_SIGNALS.minimized,
        EVO_SIGNALS.maximized,
      ])
    );
  });
});

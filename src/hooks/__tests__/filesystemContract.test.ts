import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { echoClient, loadAppData, saveAppData } from '@pyxis/app-sdk';

/**
 * Filesystem contract tests.
 *
 * On a device every filesystem call an app makes is confined. The bridge
 * (PyxisBridgeParent.sys.mjs) stamps it with a scope, and echo resolves its
 * paths beneath that scope's root (echo/src/services/filesystem/scope.rs):
 * `~` is the app's own storage, `/` is the rest of the system, read-only, for
 * Files alone, and another app's documents need the `app` option and the
 * shell's filesystem:apps. The mock has to keep the same shape, or an app
 * that works in `npm run dev` breaks on a device, so the bridge's tables are
 * read here rather than restated.
 */

const BRIDGE = resolve(
  __dirname,
  '../../../../geckos/gecko/patches/pyxis/toolkit/actors/PyxisBridgeParent.sys.mjs'
);
const haveBridge = existsSync(BRIDGE);

/** The source of `const <name> = { … };` in the bridge. */
function table(source: string, name: string): string {
  const at = source.indexOf(`const ${name} = {`);
  if (at < 0) throw new Error(`${name} not found in PyxisBridgeParent.sys.mjs`);
  return source.slice(at, source.indexOf('\n};', at));
}

/** BRIDGE_CAPABILITIES' rows for one service: method -> capability. */
function serviceRows(source: string, service: string): Record<string, string | null> {
  const caps = table(source, 'BRIDGE_CAPABILITIES');
  const at = caps.indexOf(`\n  ${service}: {`);
  if (at < 0) throw new Error(`${service} not found in BRIDGE_CAPABILITIES`);
  const block = caps.slice(at, caps.indexOf('\n  },', at));
  const rows: Record<string, string | null> = {};
  for (const m of block.matchAll(/^ {4}(\w+): (null|"[^"]+"),/gm)) {
    rows[m[1]] = m[2] === 'null' ? null : m[2].slice(1, -1);
  }
  return rows;
}

describe.skipIf(!haveBridge)('filesystem contract (bridge <-> mock)', () => {
  const source = haveBridge ? readFileSync(BRIDGE, 'utf8') : '';

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses on an absolute path exactly the methods the bridge gates on filesystem:write', async () => {
    const rows = serviceRows(source, 'filesystem');
    expect(Object.keys(rows).length).toBeGreaterThan(10);
    for (const [method, capability] of Object.entries(rows)) {
      const res = (await echoClient.callMethod('filesystem', 'org.geckoOS.filesystem', method, {
        path: '/etc/hostname',
        source: '/etc/hostname',
        destination: '/etc/copy',
        content: 'x',
      })) as { error?: string } | undefined;
      const refused = String(res?.error ?? '').includes('read-only');
      expect(refused, `${method} (${capability})`).toBe(capability === 'filesystem:write');
    }
  });

  it("keeps an app's documents under ~, and names another app's only when asked", async () => {
    const call = vi.spyOn(echoClient, 'callMethod');
    await saveAppData('notes', { notes: [] });
    await loadAppData('notes', { notes: [] }, { app: 'notes' });

    const [, , , own] = call.mock.calls[0];
    expect(own).toMatchObject({ path: '~/notes.json' });
    expect(own).not.toHaveProperty('app');
    const [, , , other] = call.mock.calls[1];
    expect(other).toMatchObject({ path: '~/notes.json', app: 'notes' });

    // The capability the bridge asks of a call that names another app.
    expect(table(source, 'FILESYSTEM_SCOPES')).toMatch(/^ {2}apps: "filesystem:apps",$/m);
  });
});

/**
 * The bridge itself, run: PyxisBridgeParent.sys.mjs is imported with the
 * two Gecko globals it touches while loading stubbed out, and each call goes
 * through its real _handleCallService. Only the edges are replaced: the
 * app's id, what Nova says it holds, and Echo, which records what it would
 * have been sent.
 */
describe.skipIf(!haveBridge)('the bridge stamps every filesystem call with its scope', () => {
  type Sent = { service: string; method: string; params: Record<string, unknown> };
  type Bridge = {
    _appIdForThisActor: () => string;
    _getDeclaredPermissions: (appId: string) => Promise<string[]>;
    _echoRequest: (service: string, method: string, params: Record<string, unknown>) => Promise<unknown>;
    _handleCallService: (data: { service: string; method: string; params?: unknown }) => Promise<unknown>;
  };

  // The module imports nothing: it only reads Gecko globals. So its source
  // runs as a function body, with those globals as parameters and its one
  // export returned. (Vitest won't import a file outside this project.)
  function loadBridge(): new () => Bridge {
    const source = readFileSync(BRIDGE, 'utf8').replace(
      'export class PyxisBridgeParent',
      'class PyxisBridgeParent'
    );
    const stubs = { ChromeUtils: { defineLazyGetter: () => {} }, JSWindowActorParent: class {} };
    const body = `${source}\nreturn PyxisBridgeParent;`;
    return new Function(...Object.keys(stubs), body)(...Object.values(stubs));
  }

  async function bridgeFor(appId: string, permissions: string[]) {
    const PyxisBridgeParent = loadBridge();
    const bridge = new PyxisBridgeParent();
    const sent: Sent[] = [];
    bridge._appIdForThisActor = () => appId;
    bridge._getDeclaredPermissions = async () => permissions;
    bridge._echoRequest = async (service, method, params) => {
      sent.push({ service, method, params });
      return {};
    };
    const call = (method: string, params?: unknown, service = 'filesystem') =>
      bridge._handleCallService({ service, method, params });
    return { call, sent };
  }

  const APP = ['filesystem:read', 'filesystem:write'];
  const FILES = [...APP, 'filesystem:user', 'filesystem:system'];

  it("puts an ordinary app's calls in its own storage, whatever scope the page names", async () => {
    const { call, sent } = await bridgeFor('com.example.app', APP);
    await call('readFile', { path: '~/notes.json' });
    await call('readDirectory', { path: '~', scope: 'user' });
    await call('writeFile', { path: 'a.txt', content: 'x', scope: 'system' });
    await call('readDirectory');
    await call('readDirectory', null);
    expect(sent.map((s) => s.params.scope)).toEqual(Array(5).fill('app:com.example.app'));
  });

  it('refuses an absolute path, a non-string path, or another app, before Echo sees it', async () => {
    const { call, sent } = await bridgeFor('com.example.app', APP);
    for (const params of [
      { path: '/etc/shadow' },
      { path: '/tmp/x', content: 'x' },
      { source: '~/a', destination: '/tmp/b' },
      { path: ['/etc/shadow'] },
      { path: { toString: () => '/etc/shadow' } },
      { path: 5 },
      { path: '~/notes.json', app: 'notes' },
      { path: '~/notes.json', app: { id: 'notes' } },
    ]) {
      await expect(call('readFile', params), JSON.stringify(params)).rejects.toThrow();
    }
    expect(sent).toEqual([]);
  });

  it('gives Files the home with ~ and the rest of the system, read-only, with /', async () => {
    const { call, sent } = await bridgeFor('files', FILES);
    await call('readDirectory', { path: '~' });
    await call('readFile', { path: '/etc/os-release' });
    await expect(call('writeFile', { path: '/etc/os-release', content: 'x' })).rejects.toThrow(/read-only/);
    await expect(call('copy', { source: '~/a', destination: '/tmp/a' })).rejects.toThrow(/read-only/);
    await expect(call('move', { source: '/etc/a', destination: '~/a' })).rejects.toThrow(/read-only/);
    expect(sent.map((s) => s.params.scope)).toEqual(['user', 'system']);
  });

  it("lets only an app holding filesystem:apps name another app's data, and strips the name", async () => {
    const shell = await bridgeFor('bloom', [...APP, 'filesystem:apps']);
    await shell.call('readFile', { path: '~/notes.json', app: 'notes' });
    await shell.call('writeFile', { path: '~/tasks.json', content: '{}', app: 'tasks' });
    expect(shell.sent.map((s) => s.params.scope)).toEqual(['app:notes', 'app:tasks']);
    expect(shell.sent.every((s) => !('app' in s.params))).toBe(true);
    await expect(shell.call('readFile', { path: '/etc/os-release', app: 'notes' })).rejects.toThrow();

    // Naming its own id gets an ordinary app nothing more.
    const app = await bridgeFor('com.example.app', APP);
    await app.call('readFile', { path: '~/x', app: 'com.example.app' });
    expect(app.sent[0].params.scope).toBe('app:com.example.app');
  });

  it('still gates each method on its own capability first', async () => {
    const reader = await bridgeFor('com.example.reader', ['filesystem:read']);
    await expect(reader.call('writeFile', { path: '~/x', content: 'x' })).rejects.toThrow(/filesystem:write/);
    const none = await bridgeFor('com.example.none', []);
    await expect(none.call('readFile', { path: '~/x' })).rejects.toThrow(/filesystem:read/);
    expect([...reader.sent, ...none.sent]).toEqual([]);
  });

  it('answers getStorageInfo for the root filesystem, whatever path the page names', async () => {
    const { call, sent } = await bridgeFor('com.example.none', []);
    await call('getStorageInfo', { mount: '/root/secret' }, 'deviceInfo');
    expect(sent).toEqual([{ service: 'deviceInfo', method: 'getStorageInfo', params: {} }]);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { echoClient, type NovaAppInfo } from '@pyxis/app-sdk';

/**
 * Nova registry contract tests.
 *
 * The bug these exist for: `EchoClient`'s mock implemented `nova.List` by
 * delegating to `appHost.ListApps`, which is a different projection of a
 * different thing. It returned `exec`/`icon`/`count` and omitted
 * `tier`/`removable`/`singleInstance`/`icons`. Anything written against the
 * mock therefore worked in `npm run dev` and broke on device — the exact
 * class of defect alpha 3 had to find by booting a VM.
 *
 * The first test reads the field list out of the Rust source rather than
 * restating it, so adding a field to `to_info_json` without teaching the
 * mock about it fails here instead of on a device three weeks later.
 */

const NOVA_RS = resolve(__dirname, '../../../../geckos/echo/src/services/nova.rs');

/** JSON keys of the `json!({ ... })` literal inside a named Rust fn. */
function jsonKeysOfRustFn(source: string, fnName: string): string[] {
  const at = source.indexOf(`fn ${fnName}(`);
  if (at < 0) throw new Error(`fn ${fnName} not found in nova.rs`);
  const open = source.indexOf('json!({', at);
  if (open < 0) throw new Error(`no json! literal in fn ${fnName}`);
  // Walk braces from the json!({ to its match, so a nested object can't
  // truncate the slice.
  let depth = 0;
  let end = open;
  for (let i = source.indexOf('{', open); i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  const body = source.slice(open, end);
  return [...body.matchAll(/"([A-Za-z][A-Za-z0-9]*)":/g)].map((m) => m[1]);
}

/**
 * Keys `info_json` bolts on after `to_info_json`, as `info["<key>"] = ...`.
 * `requiredPermissions` is conditional on the app declaring any, so it is
 * excluded from the always-present set.
 */
function infoJsonExtraKeys(source: string): string[] {
  const at = source.indexOf('fn info_json(');
  const end = source.indexOf('\n    }', at);
  const body = source.slice(at, end);
  return [...body.matchAll(/info\["([A-Za-z][A-Za-z0-9]*)"\]\s*=/g)]
    .map((m) => m[1])
    .filter((k) => k !== 'requiredPermissions' && k !== 'type');
}

async function novaList(): Promise<NovaAppInfo[]> {
  const res = (await echoClient.callMethod('nova', 'org.geckoOS.nova', 'List', {})) as {
    apps: NovaAppInfo[];
  };
  return res.apps;
}

describe('nova.List mock matches the Rust projection', () => {
  const haveRust = existsSync(NOVA_RS);

  it.runIf(haveRust)('carries every field nova.rs::info_json emits', async () => {
    const rust = readFileSync(NOVA_RS, 'utf8');
    const expected = [
      ...jsonKeysOfRustFn(rust, 'to_info_json'),
      ...infoJsonExtraKeys(rust),
    ];
    // Sanity-check the extraction itself, so a parser that silently matched
    // nothing can't make this test vacuously pass.
    expect(expected).toContain('id');
    expect(expected).toContain('tier');
    expect(expected.length).toBeGreaterThan(10);

    const apps = await novaList();
    expect(apps.length).toBeGreaterThan(0);
    for (const app of apps) {
      for (const field of expected) {
        expect(
          Object.prototype.hasOwnProperty.call(app, field),
          `nova.List mock entry '${app.id}' is missing '${field}', which ` +
            `nova.rs emits. Update mockNovaRegistry in EchoClient.ts.`
        ).toBe(true);
      }
    }
  });

  it('does not leak appHost.ListApps fields into nova.List', async () => {
    // The specific regression: List used to *be* appHost.ListApps.
    const apps = await novaList();
    for (const app of apps) {
      expect(app).not.toHaveProperty('exec');
      expect(app).not.toHaveProperty('sessions');
    }
    const res = (await echoClient.callMethod('nova', 'org.geckoOS.nova', 'List', {})) as Record<
      string,
      unknown
    >;
    // nova.rs's list() returns `{ apps }` only — no `count`, unlike AppHost.
    expect(Object.keys(res)).toEqual(['apps']);
  });

  it('carries no liveness — that is AppHost\'s question', async () => {
    for (const app of await novaList()) {
      expect(app.running).toBeUndefined();
      expect(app.sessionId).toBeUndefined();
    }
  });

  it('returns apps id-sorted, as nova.rs::list does', async () => {
    const ids = (await novaList()).map((a) => a.id);
    expect(ids).toEqual([...ids].sort());
  });

  it('entry is a webroot-relative path, not a component name', async () => {
    // AppHost's manifests use `entry` for the built-in-component hint
    // ('TerminalApp'); Nova's is a path. Same field name, different
    // meaning — conflating them is how the two projections got merged.
    const terminal = (await novaList()).find((a) => a.id === 'terminal');
    expect(terminal?.entry).toBe('index.html');
  });
});

describe('nova.GetInfo', () => {
  it('adds running, and sessionId only while running', async () => {
    const before = (await echoClient.callMethod('nova', 'org.geckoOS.nova', 'GetInfo', {
      appId: 'terminal',
    })) as NovaAppInfo;
    expect(before.running).toBe(false);
    expect(before.sessionId).toBeUndefined();

    const launched = (await echoClient.callMethod('nova', 'org.geckoOS.nova', 'Launch', {
      appId: 'terminal',
    })) as { sessionId: string };
    expect(launched.sessionId).toBeTruthy();

    const after = (await echoClient.callMethod('nova', 'org.geckoOS.nova', 'GetInfo', {
      appId: 'terminal',
    })) as NovaAppInfo;
    expect(after.running).toBe(true);
    expect(after.sessionId).toBe(launched.sessionId);

    await echoClient.callMethod('nova', 'org.geckoOS.nova', 'Close', { appId: 'terminal' });
  });

  it('errors for an app that is not installed', async () => {
    const res = (await echoClient.callMethod('nova', 'org.geckoOS.nova', 'GetInfo', {
      appId: 'nope',
    })) as { error?: string };
    expect(res.error).toMatch(/not installed/);
  });
});

describe('the registry is dynamic', () => {
  // The alpha 4 headline, asserted: an app that exists in no hardcoded list
  // still reaches the launcher, and disappears when removed.
  const WEATHER = '/tmp/weather_1.0.0_all.ipk';

  beforeEach(async () => {
    await echoClient.callMethod('installer', 'org.geckoOS.installer', 'Remove', {
      package: 'weather',
    });
  });

  it('surfaces an installed .ipk app that no built-in overlay knows', async () => {
    expect((await novaList()).map((a) => a.id)).not.toContain('weather');

    await echoClient.callMethod('installer', 'org.geckoOS.installer', 'Install', {
      packagePath: WEATHER,
    });

    const weather = (await novaList()).find((a) => a.id === 'weather');
    expect(weather).toBeDefined();
    expect(weather?.name).toBe('Weather');
    expect(weather?.tier).toBe('opkg');
    // opkg owns the files, so nova.Uninstall refuses — removal goes back
    // through the Installer. The UI reads this to hide its Remove button.
    expect(weather?.removable).toBe(false);
    expect(weather?.source).toBe('appinfo.json');
    expect(weather?.requiredPermissions).toEqual(['network', 'location']);
  });

  it('announces registry changes on Nova\'s interface, not the installer\'s', async () => {
    // useApps subscribes to org.geckoOS.nova. On device it is Nova, not the
    // installer, that emits RegistryChanged (installer.rs ends by calling
    // Nova reload) — if the mock emitted it on the installer iface instead,
    // the launcher would never refresh after an install.
    const seen: unknown[] = [];
    const off = echoClient.onSignal('org.geckoOS.nova', 'RegistryChanged', (d) => seen.push(d));
    await echoClient.callMethod('installer', 'org.geckoOS.installer', 'Install', {
      packagePath: WEATHER,
    });
    off();
    expect(seen.length).toBeGreaterThan(0);
  });

  it('drops the app again when the package is removed', async () => {
    await echoClient.callMethod('installer', 'org.geckoOS.installer', 'Install', {
      packagePath: WEATHER,
    });
    expect((await novaList()).map((a) => a.id)).toContain('weather');

    await echoClient.callMethod('installer', 'org.geckoOS.installer', 'Remove', {
      package: 'weather',
    });
    expect((await novaList()).map((a) => a.id)).not.toContain('weather');
  });
});

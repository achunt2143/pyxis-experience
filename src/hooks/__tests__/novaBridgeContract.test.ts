import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Every nova method the SDK calls must be in the bridge's table, or vela
 * refuses it on a device while the dev server's mock answers it: the app
 * looks fine and the call never happens. `nova.GetAppIcon` shipped that way
 * (found by alpha5-bridge-deny, 2026-11-16).
 */
const SDK_SRC = resolve(__dirname, '../../../packages/app-sdk/src');
const BRIDGE_MJS = resolve(
  __dirname,
  '../../../../geckos/gecko/patches/pyxis/toolkit/actors/PyxisBridgeParent.sys.mjs'
);

function sdkSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sdkSources(path);
    return /\.tsx?$/.test(e.name) ? [readFileSync(path, 'utf8')] : [];
  });
}

describe.runIf(existsSync(BRIDGE_MJS))('the SDK calls only nova methods the bridge forwards', () => {
  it('each callMethod(NOVA_SERVICE, NOVA_IFACE, …) method is in BRIDGE_CAPABILITIES.nova', () => {
    const called = new Set<string>();
    for (const src of sdkSources(SDK_SRC)) {
      for (const m of src.matchAll(/callMethod(?:Strict)?\(\s*NOVA_SERVICE,\s*NOVA_IFACE,\s*'(\w+)'/g)) {
        called.add(m[1]!);
      }
    }
    expect(called.size).toBeGreaterThan(0);
    const bridge = readFileSync(BRIDGE_MJS, 'utf8');
    const table = bridge.slice(bridge.indexOf('const BRIDGE_CAPABILITIES'));
    const nova = table.slice(table.indexOf('  nova: {'), table.indexOf('\n  },', table.indexOf('  nova: {')));
    for (const method of called) expect(nova, `nova.${method}`).toMatch(new RegExp(`\\n\\s+${method}: `));
  });
});

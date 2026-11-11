import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  echoClient,
  EVO_IFACE,
  THUMBNAIL_METHOD,
  THUMBNAIL_MAX_WIDTH,
  THUMBNAIL_MAX_HEIGHT,
  parseThumbnails,
  getWindowThumbnails,
} from '@pyxis/app-sdk';

/**
 * `evo.GetWindowThumbnails` contract: the method name, its arguments and the
 * reply's fields are read out of echo_ipc.rs and thumbnails.rs, so a rename
 * in Evo fails here and not on a device. Evo's size limits are checked
 * against the SDK's defaults, and the EchoClient mock (the dev server's
 * stand-in) must answer in the same shape.
 */
const EVO = resolve(__dirname, '../../../../geckos/evo/src');
const ECHO_IPC_RS = resolve(EVO, 'enhancements/echo_ipc.rs');
const THUMBS_RS = resolve(EVO, 'shell/thumbnails.rs');
const BRIDGE_MJS = resolve(
  __dirname,
  '../../../../geckos/gecko/patches/pyxis/toolkit/actors/PyxisBridgeParent.sys.mjs'
);

describe.runIf(existsSync(ECHO_IPC_RS))('GetWindowThumbnails contract', () => {
  const rust = readFileSync(ECHO_IPC_RS, 'utf8');
  const thumbs = readFileSync(THUMBS_RS, 'utf8');

  it('the method exists in Evo, under the name the SDK calls', () => {
    expect(rust).toContain(`"${THUMBNAIL_METHOD}" =>`);
    expect(rust).toContain(`name: "${THUMBNAIL_METHOD}".to_string()`);
  });

  it('Evo reads the arguments the SDK sends and replies with the fields it parses', () => {
    for (const arg of ['window_ids', 'max_width', 'max_height']) expect(thumbs).toContain(`"${arg}"`);
    const at = rust.indexOf(`"${THUMBNAIL_METHOD}" =>`);
    const reply = rust.slice(at, at + 3000);
    expect(reply).toContain('"thumbnails"');
    for (const key of ['window_id', 'width', 'height', 'data']) expect(reply).toContain(`"${key}"`);
  });

  it('the SDK defaults are Evo\'s (a larger ask is clamped, a smaller one honoured)', () => {
    const num = (name: string) => Number(thumbs.match(new RegExp(`pub const ${name}: u32 = (\\d+)`))?.[1]);
    expect(num('MAX_WIDTH')).toBe(THUMBNAIL_MAX_WIDTH);
    expect(num('DEFAULT_WIDTH')).toBe(THUMBNAIL_MAX_WIDTH);
    expect(num('DEFAULT_HEIGHT')).toBe(THUMBNAIL_MAX_HEIGHT);
  });

  it('Evo encodes what the SDK accepts: a data:image URL', () => {
    expect(thumbs).toContain('data:image/jpeg;base64,');
  });

  it('the bridge lets the shell call it, and gates it on windows:manage', () => {
    if (!existsSync(BRIDGE_MJS)) return;
    expect(readFileSync(BRIDGE_MJS, 'utf8')).toMatch(new RegExp(`${THUMBNAIL_METHOD}:\\s*"windows:manage"`));
  });
});

describe('parseThumbnails', () => {
  it('keeps pictures and drops everything else', () => {
    const rows = parseThumbnails({
      thumbnails: [
        { window_id: 4, width: 480, height: 300, data: 'data:image/jpeg;base64,AAAA' },
        { window_id: 5, width: 1, height: 1, data: 'http://example.com/x.png' },
        { window_id: '6', width: 1, height: 1, data: 'data:image/png;base64,AA' },
        null,
      ],
    });
    expect(rows).toEqual([{ windowId: 4, width: 480, height: 300, data: 'data:image/jpeg;base64,AAAA' }]);
    expect(parseThumbnails(undefined)).toEqual([]);
    expect(parseThumbnails({ thumbnails: 'nope' })).toEqual([]);
  });
});

describe('the mock stands in for Evo', () => {
  it('answers with one picture per window, at the window\'s aspect and inside the bounds', async () => {
    const nova = (m: string, a: Record<string, unknown>) => echoClient.callMethod('nova', 'org.geckoOS.nova', m, a);
    await nova('Launch', { appId: 'files' });
    await new Promise((r) => setTimeout(r, 700));
    const list = (await echoClient.callMethod('evo', EVO_IFACE, 'ListWindows', {})) as {
      windows: { window_id: number; width: number; height: number }[];
    };
    const rows = await getWindowThumbnails({ maxWidth: 200, maxHeight: 200 });
    expect(list.windows.length).toBeGreaterThan(0);
    expect(rows.length).toBe(list.windows.length);
    for (const row of rows) {
      const w = list.windows.find((x) => x.window_id === row.windowId)!;
      expect(row.width).toBeLessThanOrEqual(200);
      expect(row.height).toBeLessThanOrEqual(200);
      expect(Math.abs(row.width / row.height - w.width / w.height)).toBeLessThan(0.03);
      expect(row.data.startsWith('data:image/')).toBe(true);
    }
  });
});

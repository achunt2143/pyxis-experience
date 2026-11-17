import { describe, it, expect, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup } from '@testing-library/react';
import { Notebook } from 'lucide-react';
import { EVO_IFACE, appIdentityMaterial, appIdentityPayload, echoClient, setAppIdentity } from '@pyxis/app-sdk';
import {
  ICON_CORNERS,
  __resetIconCache,
  buildIdentities,
  glyphSvg,
  identityEntries,
  rasterizeAppIcon,
} from '../useAppIdentity';
import type { DesktopApp } from '../../hooks/useApps';

/**
 * Evo's title bars show each app's icon and name, looked up by the window's
 * trusted app id, on glass tinted with its accent. Bloom sends the table;
 * these check what it sends and that Evo and the bridge take it (read out of
 * their sources, like the other contract suites).
 */

const GECKOS = resolve(__dirname, '../../../../geckos');
const ECHO_IPC_RS = resolve(GECKOS, 'evo/src/enhancements/echo_ipc.rs');
const IDENTITY_RS = resolve(GECKOS, 'evo/src/shell/identity.rs');
const BRIDGE_MJS = resolve(GECKOS, 'gecko/patches/pyxis/toolkit/actors/PyxisBridgeParent.sys.mjs');

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  __resetIconCache();
});

function app(id: string, name: string, extra: Partial<DesktopApp> = {}): DesktopApp {
  return { id, name, entryUrl: null, defaultSize: { width: 1, height: 1 }, category: 'utility', pinned: false, info: {} as DesktopApp['info'], ...extra };
}

describe.runIf(existsSync(ECHO_IPC_RS))('Evo takes the table Bloom sends', () => {
  it('SetAppIdentity exists and reads every field the SDK sends', () => {
    const ipc = readFileSync(ECHO_IPC_RS, 'utf8');
    expect(ipc).toContain('"SetAppIdentity" =>');
    expect(ipc).toMatch(/"SetAppIdentity" =>[\s\S]{0,900}"ok": true/);
    const parser = readFileSync(IDENTITY_RS, 'utf8');
    for (const field of ['"apps"', '"app_id"', '"name"', '"accent"', '"icon"', '"dark"']) {
      expect(parser).toContain(field);
    }
    const payload = appIdentityPayload({ appId: 'notes', name: 'Notes', accent: '#EAB308', icon: 'data:image/png;base64,AA==' });
    expect(Object.keys(payload).sort()).toEqual(['accent', 'app_id', 'icon', 'name']);
  });

  it('the waterdrop corner matches Evo’s frame, at the icon’s scale', () => {
    const rust = readFileSync(IDENTITY_RS, 'utf8');
    expect(rust).toContain('pub const CORNER_RADII: [f64; 4] = [16.0, 4.0, 16.0, 16.0];');
    // One sharp corner, top right, as the frame.
    expect(ICON_CORNERS[1]).toBeLessThan(ICON_CORNERS[0]);
    expect(ICON_CORNERS[0]).toBe(ICON_CORNERS[2]);
    expect(ICON_CORNERS[0]).toBe(ICON_CORNERS[3]);
  });

  it('only the shell may send it (windows:manage at the bridge)', () => {
    const bridge = readFileSync(BRIDGE_MJS, 'utf8');
    expect(bridge).toMatch(/SetAppIdentity: "windows:manage"/);
  });
});

describe('the table', () => {
  it('names every app, with its accent when Bloom has one', () => {
    const entries = identityEntries([app('notes', 'Notes'), app('weather', 'Weather')], (id) =>
      id === 'notes' ? '#eab308' : undefined
    );
    expect(entries).toEqual([
      { appId: 'notes', name: 'Notes', accent: '#eab308' },
      { appId: 'weather', name: 'Weather' },
    ]);
  });

  it('drops an invalid accent or icon from the payload, never the name', () => {
    expect(appIdentityPayload({ appId: 'a', name: 'A', accent: 'orange', icon: 'https://x/y.png' })).toEqual({
      app_id: 'a',
      name: 'A',
    });
  });

  it('draws each icon once per app and fill', async () => {
    const rasterize = vi.fn(async () => 'data:image/png;base64,AA==');
    const apps = [app('notes', 'Notes'), app('weather', 'Weather')];
    const hue = (id: string) => (id === 'notes' ? '#eab308' : undefined);
    const first = await buildIdentities(apps, hue, rasterize);
    expect(first[0]).toEqual({ appId: 'notes', name: 'Notes', accent: '#eab308', icon: 'data:image/png;base64,AA==' });
    expect(rasterize).toHaveBeenCalledTimes(2);
    // The neutral fill for an app with no accent.
    expect(rasterize).toHaveBeenCalledWith(apps[1], '#64748b');
    await buildIdentities(apps, hue, rasterize);
    expect(rasterize).toHaveBeenCalledTimes(2);
  });

  it('an app whose icon can’t be drawn is still named', async () => {
    const table = await buildIdentities([app('x', 'X')], () => undefined, async () => undefined);
    expect(table).toEqual([{ appId: 'x', name: 'X' }]);
  });

  it('with no canvas (jsdom) there is simply no icon', async () => {
    expect(await rasterizeAppIcon({ icon: Notebook }, '#eab308')).toBeUndefined();
  });

  it('the glyph is standalone white SVG', () => {
    const svg = glyphSvg(Notebook);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('stroke="#ffffff"');
  });

  it('sends the shell’s material for each theme, and only the colours that are valid', async () => {
    const spy = vi.spyOn(echoClient, 'callMethod').mockResolvedValue({ ok: true });
    await setAppIdentity([], false, { light: '#F0E8D8', dark: '#1B1F3A' });
    expect(spy).toHaveBeenLastCalledWith('evo', EVO_IFACE, 'SetAppIdentity', {
      apps: [],
      dark: false,
      material: { light: '#f0e8d8', dark: '#1b1f3a' },
    });
    await setAppIdentity([], true, { light: 'beige', dark: '#1b1f3a' });
    expect(spy).toHaveBeenLastCalledWith('evo', EVO_IFACE, 'SetAppIdentity', {
      apps: [],
      dark: true,
      material: { dark: '#1b1f3a' },
    });
    // Neither valid: no material key at all, so Evo keeps its own.
    await setAppIdentity([], true, { light: 'x', dark: 'y' });
    expect(spy).toHaveBeenLastCalledWith('evo', EVO_IFACE, 'SetAppIdentity', { apps: [], dark: true });
    expect(appIdentityMaterial(undefined)).toBeUndefined();
  });

  it('is sent with SetAppIdentity, the theme beside it', async () => {
    const spy = vi.spyOn(echoClient, 'callMethod').mockResolvedValue({ ok: true });
    expect(await setAppIdentity([{ appId: 'notes', name: 'Notes', accent: '#eab308' }], true)).toBe(true);
    expect(spy).toHaveBeenCalledWith('evo', EVO_IFACE, 'SetAppIdentity', {
      apps: [{ app_id: 'notes', name: 'Notes', accent: '#eab308' }],
      dark: true,
    });
  });
});

// Shared by the Settings app tests: a scripted Echo (settings, time, audio, power, network, system),
// a mounted app, and DOM finders by what the suites and a user see.
import { act, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { echoClient } from '../../../../app-sdk/src/EchoClient';
import { resetClockForTests } from '../../../../app-sdk/src/clock';
import { mountDuyoApp, type DuyoApp } from '@pyxis/app-sdk/duyo';
import { islandPack } from '../registerIsland';
import '../SettingsApp';

/** remochi's Button measures its label on a canvas, which jsdom has no 2d context for. */
export function stubCanvas() {
  // remochi's Toggle observes its own size.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLCanvasElement.prototype.getContext = (() => ({
    font: '',
    measureText: (text: string) => ({ width: text.length * 8 }),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

export interface Call {
  service: string;
  method: string;
  args: Record<string, unknown>;
}

const DEFAULT_SETTINGS: Record<string, unknown> = {
  'pyxis.theme': 'light',
  'pyxis.wallpaper': 'daylight',
  'pyxis.wallpaper.motion': 'flow',
  'pyxis.wallpaper.pinnedTime': null,
  'pyxis.clock24h': false,
  'pyxis.animations': 'full',
  'pyxis.location': null,
};

const ZONES = [
  { id: 'America/New_York', countries: ['US'], lat: 40.7, lon: -74 },
  { id: 'Asia/Tokyo', countries: ['JP'], lat: 35.7, lon: 139.7 },
  { id: 'Europe/Paris', countries: ['FR'], lat: 48.9, lon: 2.3 },
];
const OFFSETS: Record<string, number> = { 'America/New_York': -300, 'Asia/Tokyo': 540, 'Europe/Paris': 60 };

/** What the scripted Echo holds and did. Reset by `installEcho`. */
export const echo = {
  settings: new Map<string, unknown>(),
  /** Setting keys `settings.set` refuses. */
  refuseSet: new Set<string>(),
  zone: 'America/New_York',
  /** `setTimezone` answers an error. */
  refuseZone: false,
  /** `setTimezone` answers success but the clock keeps the old zone. */
  ignoreZone: false,
  volume: { volume: 40, muted: false } as { volume: number; muted: boolean } | null,
  outputs: [] as Array<{ id: number; name: string; description: string; isDefault: boolean }>,
  info: null as Record<string, unknown> | null,
  network: null as { connected: boolean; ssid: string; type: string } | null,
  calls: [] as Call[],
  signals: new Map<string, Set<(data: unknown) => void>>(),
};

export const callsTo = (service: string, method: string) =>
  echo.calls.filter((c) => c.service === service && c.method === method);

/** Delivers an Echo signal to everything that subscribed to it. */
export function emit(iface: string, event: string, data: unknown) {
  act(() => {
    for (const cb of echo.signals.get(`${iface}::${event}`) ?? []) cb(data);
  });
}

export function installEcho() {
  echo.settings = new Map(Object.entries(DEFAULT_SETTINGS));
  echo.refuseSet = new Set();
  echo.zone = 'America/New_York';
  echo.refuseZone = false;
  echo.ignoreZone = false;
  echo.volume = { volume: 40, muted: false };
  echo.outputs = [
    { id: 1, name: 'alsa_output.analog', description: 'Built-in Audio', isDefault: true },
    { id: 2, name: 'alsa_output.hdmi', description: 'HDMI Audio', isDefault: false },
  ];
  echo.info = {
    hostname: 'pyxis-vm',
    os: { name: 'Pyxis OS', version: '0.5.0', build: '1234' },
    kernel: { name: 'Linux', release: '6.12.1' },
    cpu: { count: 4, model: 'QEMU Virtual CPU' },
    memory: { total: 4 * 1024 ** 3, available: 3 * 1024 ** 3 },
    uptime: { seconds: 3720 },
  };
  echo.network = { connected: true, ssid: 'GeckoNet', type: 'wifi' };
  echo.calls = [];
  echo.signals = new Map();
  resetClockForTests();

  const clock = () => ({
    epoch_ms: Date.now(),
    timezone: echo.zone,
    utc_offset_minutes: OFFSETS[echo.zone] ?? 0,
    abbreviation: '',
    dst: false,
    next_transition_ms: null,
  });

  vi.spyOn(echoClient, 'callMethod').mockImplementation(async (service, _iface, method, args = {}) => {
    const a = args as Record<string, unknown>;
    echo.calls.push({ service, method, args: a });
    switch (`${service}.${method}`) {
      case 'settings.get': {
        const key = a.key as string;
        const has = echo.settings.has(key);
        return { value: has ? echo.settings.get(key) : null, exists: has };
      }
      case 'settings.set': {
        const key = a.key as string;
        if (echo.refuseSet.has(key)) throw new Error(`${key} must be one of the allowed values`);
        echo.settings.set(key, a.value);
        return { success: true };
      }
      case 'time.getClock':
        return clock();
      case 'time.listTimezones':
        return { timezones: ZONES };
      case 'time.getLocation': {
        const stored = echo.settings.get('pyxis.location') as { lat: number; lon: number; label: string } | null;
        if (stored) return { ...stored, source: 'manual', timezone: echo.zone };
        const z = ZONES.find((e) => e.id === echo.zone);
        return z
          ? { lat: z.lat, lon: z.lon, label: z.id.split('/')[1].replace('_', ' '), source: 'zone', timezone: echo.zone }
          : { lat: null, lon: null, label: null, source: 'none', timezone: echo.zone };
      }
      case 'time.setTimezone': {
        if (echo.refuseZone) return { error: 'the time service refused it' };
        const timezone = a.timezone as string;
        if (!echo.ignoreZone) {
          echo.zone = timezone;
          // The time service tells everyone, as echo does.
          for (const cb of echo.signals.get('org.geckoOS.time::TimezoneChanged') ?? []) {
            cb({ timezone, utc_offset_minutes: OFFSETS[timezone] ?? 0 });
          }
        }
        return { timezone, utc_offset_minutes: OFFSETS[timezone] ?? 0 };
      }
      case 'audio.getVolume':
        if (!echo.volume) throw new Error('no audio');
        return echo.volume;
      case 'audio.setVolume':
        echo.volume = { ...(echo.volume ?? { muted: false }), volume: a.volume as number };
        return echo.volume;
      case 'audio.setMute':
        echo.volume = { ...(echo.volume ?? { volume: 0 }), muted: a.muted as boolean };
        return echo.volume;
      case 'audio.listOutputs':
        return { outputs: echo.outputs };
      case 'audio.setDefaultOutput':
        echo.outputs = echo.outputs.map((o) => ({ ...o, isDefault: o.id === a.id }));
        return { outputs: echo.outputs };
      case 'system.getInfo':
        if (!echo.info) throw new Error('no system service');
        return echo.info;
      case 'network.getStatus':
        return echo.network ?? undefined;
      case 'power.sleep':
      case 'power.reboot':
      case 'power.shutdown':
        return { success: true, action: method };
      case 'evo.SetAnimationSettings':
        return { ok: true, mode: a.mode, scale: 1 };
      default:
        return undefined;
    }
  });
  vi.spyOn(echoClient, 'onSignal').mockImplementation((iface, event, cb) => {
    const key = `${iface}::${event}`;
    if (!echo.signals.has(key)) echo.signals.set(key, new Set());
    echo.signals.get(key)!.add(cb as (data: unknown) => void);
    return () => echo.signals.get(key)?.delete(cb as (data: unknown) => void);
  });
}

export interface Mounted {
  app: DuyoApp;
  host: HTMLElement;
  unmount(): void;
}

/** Mounts Settings and lets the first round of Echo answers land. */
export async function mountSettings(): Promise<Mounted> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let app!: DuyoApp;
  await act(async () => {
    app = mountDuyoApp('Settings.App', { element: host, packs: [islandPack()] });
  });
  await settle();
  return {
    app,
    host,
    unmount: () => {
      act(() => app.unmount());
      host.remove();
    },
  };
}

/** Lets pending promises (Echo answers, setting writes) resolve, with the renders they cause. */
export const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });

export const $ = (host: ParentNode, selector: string) => host.querySelector<HTMLElement>(selector);
export const $$ = (host: ParentNode, selector: string) => [...host.querySelectorAll<HTMLElement>(selector)];

export const click = async (el: HTMLElement) => {
  act(() => {
    fireEvent.click(el);
  });
  await settle();
};

/** Opens a section by its rail row (`data-settings-section`). */
export const openSection = async (host: HTMLElement, id: string) => click($(host, `[data-settings-section="${id}"]`)!);

export const checked = (el: HTMLElement | null) => el?.getAttribute('aria-checked') === 'true';
export const text = (host: ParentNode, selector: string) => $(host, selector)?.textContent ?? null;

export const typeInto = async (el: HTMLInputElement, value: string) => {
  act(() => {
    fireEvent.change(el, { target: { value } });
  });
  await settle();
};

/** Is `el` drawn: no ancestor of it is `display:none` (what Duyo's `showing: false` renders). */
export function shown(el: HTMLElement | null): boolean {
  for (let n: HTMLElement | null = el; n; n = n.parentElement) if (n.style.display === 'none') return false;
  return el !== null;
}

/** The text a user can see under `root`: hidden subtrees (`showing: false`) left out. */
export function visibleText(root: ParentNode): string {
  const walk = (n: Node): string => {
    if (n.nodeType === Node.TEXT_NODE) return n.textContent ?? '';
    if (!(n instanceof HTMLElement) || n.style.display === 'none') return '';
    return [...n.childNodes].map(walk).join('');
  };
  return [...root.childNodes].map(walk).join('');
}

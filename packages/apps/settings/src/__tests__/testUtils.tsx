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
    fillStyle: '',
    measureText: (text: string) => ({ width: text.length * 8 }),
    clearRect: () => {},
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    arcTo: () => {},
    lineTo: () => {},
    fill: () => {},
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
  'pyxis.brightness': 80,
  'pyxis.dnd': false,
  'pyxis.accessibility.textScale': 100,
  'pyxis.accessibility.highContrast': false,
  'pyxis.accessibility.reduceTransparency': false,
  'pyxis.accessibility.cursorSize': 'default',
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
  inputVolume: { volume: 65, muted: false } as { volume: number; muted: boolean } | null,
  inputs: [] as Array<{ id: number; name: string; description: string; isDefault: boolean }>,
  battery: { present: true, level: 82, charging: true } as { present: boolean; level: number | null; charging: boolean } | null,
  brightness: { brightness: 80, supported: true },
  displayOutputs: [] as Array<{
    name: string;
    description: string;
    width: number;
    height: number;
    refresh_mhz: number;
    scale: number;
    x: number;
    y: number;
    modes: Array<{ width: number; height: number; refresh_mhz: number }>;
  }>,
  info: null as Record<string, unknown> | null,
  network: null as { connected: boolean; ssid: string; type: string } | null,
  networkInterfaces: [] as Array<{
    name: string;
    type: string;
    ipv4: string;
    ipv6: string;
    macAddress: string;
    isUp: boolean;
    isRunning: boolean;
    mtu: number;
  }>,
  wifiNetworks: [] as Array<{ ssid: string; signal: number; security: string; connected: boolean }>,
  networkDns: [] as string[],
  networkGateway: '',
  storage: null as { mount: string; total: number; used: number; available: number } | null,
  servicesList: [] as Array<{ name: string; destination: string; kind: string; reachable: boolean }>,
  calls: [] as Call[],
  signals: new Map<string, Set<(data: unknown) => void>>(),
  permissions: [] as Array<{ id: string; name: string; declared: string[]; revoked: string[]; effective: string[] }>,
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
  echo.inputVolume = { volume: 65, muted: false };
  echo.inputs = [
    { id: 10, name: 'alsa_input.mic', description: 'Built-in Microphone', isDefault: true },
    { id: 11, name: 'alsa_input.usb', description: 'USB Headset Mic', isDefault: false },
  ];
  echo.battery = { present: true, level: 82, charging: true };
  echo.brightness = { brightness: 80, supported: true };
  echo.displayOutputs = [
    {
      name: 'eDP-1',
      description: 'Built-in Display',
      width: 1920,
      height: 1080,
      refresh_mhz: 60000,
      scale: 1,
      x: 0,
      y: 0,
      modes: [
        { width: 1920, height: 1080, refresh_mhz: 60000 },
        { width: 2560, height: 1440, refresh_mhz: 60000 },
        { width: 3840, height: 2160, refresh_mhz: 60000 },
        { width: 1280, height: 720, refresh_mhz: 60000 },
      ],
    },
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
  echo.networkInterfaces = [
    {
      name: 'lo',
      type: 'loopback',
      ipv4: '127.0.0.1',
      ipv6: '::1',
      macAddress: '',
      isUp: true,
      isRunning: true,
      mtu: 65536,
    },
    {
      name: 'wlan0',
      type: 'wifi',
      ipv4: '192.168.1.42',
      ipv6: '',
      macAddress: 'aa:bb:cc:dd:ee:ff',
      isUp: true,
      isRunning: true,
      mtu: 1500,
    },
  ];
  echo.wifiNetworks = [
    { ssid: 'GeckoNet', signal: 92, security: 'WPA2/WPA3', connected: true },
    { ssid: 'StudioGuest', signal: 64, security: 'Open', connected: false },
  ];
  echo.networkDns = ['1.1.1.1', '8.8.8.8'];
  echo.networkGateway = '192.168.1.1';
  echo.storage = {
    mount: '/',
    total: 64 * 1024 ** 3,
    used: 18 * 1024 ** 3,
    available: 46 * 1024 ** 3,
  };
  echo.servicesList = [
    { name: 'settings', destination: 'org.geckoOS.settings', kind: 'builtin', reachable: true },
    { name: 'network', destination: 'org.geckoOS.network', kind: 'builtin', reachable: true },
  ];
  echo.calls = [];
  echo.signals = new Map();
  echo.permissions = [
    {
      id: 'files',
      name: 'Files',
      declared: ['filesystem:read', 'filesystem:write'],
      revoked: [],
      effective: ['filesystem:read', 'filesystem:write'],
    },
  ];
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
      case 'settings.reset':
        echo.settings = new Map(Object.entries(DEFAULT_SETTINGS));
        return { success: true };
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
      case 'audio.getInputVolume':
        if (!echo.inputVolume) throw new Error('no audio input');
        return echo.inputVolume;
      case 'audio.setInputVolume':
        echo.inputVolume = { ...(echo.inputVolume ?? { muted: false }), volume: a.volume as number };
        return echo.inputVolume;
      case 'audio.setInputMute':
        echo.inputVolume = { ...(echo.inputVolume ?? { volume: 0 }), muted: a.muted as boolean };
        return echo.inputVolume;
      case 'audio.listInputs':
        return { inputs: echo.inputs };
      case 'audio.setDefaultInput':
        echo.inputs = echo.inputs.map((i) => ({ ...i, isDefault: i.id === a.id }));
        return { inputs: echo.inputs };
      case 'sound.play':
        return { success: true };
      case 'system.getInfo':
        if (!echo.info) throw new Error('no system service');
        return echo.info;
      case 'system.listServices':
        return { count: echo.servicesList.length, services: echo.servicesList };
      case 'deviceInfo.getStorageInfo':
        if (!echo.storage) throw new Error('no storage info');
        return echo.storage;
      case 'network.getStatus':
        return echo.network ?? undefined;
      case 'network.getInterfaces':
        return { interfaces: echo.networkInterfaces };
      case 'network.getIPAddress':
        return { ipv4: echo.networkInterfaces.find((i) => i.name !== 'lo')?.ipv4 ?? '' };
      case 'network.getGateway':
        return { ipv4: echo.networkGateway };
      case 'network.getDNS':
        return { nameservers: echo.networkDns };
      case 'network.scanWifi':
        return { networks: echo.wifiNetworks, wirelessAvailable: true, interface: 'wlan0' };
      case 'network.connectWifi':
        return { success: true, ssid: a.ssid, connected: true, saved: true, message: `Joined ${String(a.ssid)}` };
      case 'network.disconnectWifi':
        return { success: true, connected: false };
      case 'network.setInterfaceEnabled':
        echo.networkInterfaces = echo.networkInterfaces.map((i) =>
          i.name === a.interface ? { ...i, isUp: Boolean(a.enabled) } : i
        );
        return { success: true, interface: a.interface, isUp: Boolean(a.enabled) };
      case 'network.setDNS':
        echo.networkDns = Array.isArray(a.nameservers) ? (a.nameservers as string[]) : [];
        return { success: true, nameservers: echo.networkDns };
      case 'network.setHostname':
        if (echo.info) echo.info = { ...echo.info, hostname: a.hostname };
        return { success: true, hostname: a.hostname };
      case 'power.getBatteryStatus':
        return echo.battery ?? { present: false, level: null, charging: false };
      case 'power.getScreenBrightness':
        return echo.brightness;
      case 'power.setScreenBrightness':
        echo.brightness = { ...echo.brightness, brightness: Number(a.brightness ?? 80) };
        return { success: true, ...echo.brightness };
      case 'session.logout':
        return { ok: true, locked: true };
      case 'power.sleep':
      case 'power.reboot':
      case 'power.shutdown':
        return { success: true, action: method };
      case 'evo.SetAnimationSettings':
        return { ok: true, mode: a.mode, scale: 1 };
      case 'evo.GetOutputs':
        return { outputs: echo.displayOutputs.map((o) => ({ ...o, modes: o.modes.map((m) => ({ ...m })) })) };
      case 'evo.SetOutputConfig': {
        const target =
          echo.displayOutputs.find((o) => o.name === a.name) ?? echo.displayOutputs[0];
        if (target) {
          if (typeof a.width === 'number') target.width = a.width;
          if (typeof a.height === 'number') target.height = a.height;
          if (typeof a.scale === 'number') target.scale = a.scale;
          if (typeof a.x === 'number') target.x = a.x;
          if (typeof a.y === 'number') target.y = a.y;
        }
        return { ok: true, output: target ? { ...target } : null, outputs: echo.displayOutputs };
      }
      case 'nova.GetPermissions':
        return {
          apps: echo.permissions.map((p) => ({
            ...p,
            declared: [...p.declared],
            revoked: [...p.revoked],
            effective: [...p.effective],
          })),
        };
      case 'nova.SetPermission': {
        const entry = echo.permissions.find((p) => p.id === a.appId);
        if (!entry) return { error: 'not found' };
        const perm = String(a.permission ?? '');
        const granted = Boolean(a.granted);
        entry.revoked = granted
          ? entry.revoked.filter((r) => r !== perm)
          : entry.revoked.includes(perm)
          ? entry.revoked
          : [...entry.revoked, perm];
        entry.effective = entry.declared.filter((d) => !entry.revoked.includes(d));
        return {
          ...entry,
          declared: [...entry.declared],
          revoked: [...entry.revoked],
          effective: [...entry.effective],
        };
      }
      default:
        return undefined;
    }
  });
  vi.spyOn(echoClient, 'callMethodStrict').mockImplementation((service, iface, method, args) =>
    echoClient.callMethod(service, iface, method, args)
  );
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

export const slideTo = async (slider: HTMLElement, value: number) => {
  const min = Number(slider.getAttribute('aria-valuemin') ?? 0);
  const max = Number(slider.getAttribute('aria-valuemax') ?? 100);
  const track = slider.firstElementChild as HTMLElement;
  const spy = vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: max - min,
    bottom: 10,
    width: max - min,
    height: 10,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  act(() => {
    fireEvent.click(track, { clientX: value - min });
  });
  spy.mockRestore();
  await settle();
};

export const toggleSwitch = async (el: HTMLElement, key = ' ') => {
  act(() => {
    fireEvent.keyDown(el, { key });
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

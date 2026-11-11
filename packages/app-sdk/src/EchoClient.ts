/**
 * EchoClient
 * -----------
 * Thin wrapper around the GeckoOS Echo IPC bus.
 *
 * In native (Synergy/gecko bridge) context, `window.geckoOS` is injected by
 * `gecko/bridge/extension/gaia-bridge.js` (via the content script) once the
 * extension's native-messaging handshake with `geckoOS-native-host.rs`
 * completes. Its real shape (see gaia-bridge.js) is:
 *
 *   window.geckoOS.initialized: boolean
 *   window.geckoOS.callService(service, method, params) => Promise<result>
 *   window.geckoOS.addEventListener(service, eventName, callback) => unsub
 *
 * `service` is the short, exactly-cased Echo destination suffix (e.g.
 * `'appHost'`, `'appManager'`, `'power'`) — the native host builds the full
 * Echo destination/interface as `org.geckoOS.<service>`, so the casing must
 * match what `echo/src/bin/daemon.rs` actually registers.
 *
 * `window.geckoOS` becomes non-undefined as soon as the bridge script runs,
 * but `callService` throws until the async init handshake finishes and
 * `initialized` flips to true (or the `geckoOSReady` window event fires) —
 * callers must wait for that before calling through.
 *
 * In dev/browser context (no extension), `window.geckoOS` is never defined,
 * and calls are answered by a local mock that returns plausible data so the
 * UI is fully exercised without a host.
 */

import { safeGetItem, safeSetItem } from './safeStorage';
import type { NovaAppInfo } from './types';
import { SETTING_DEFAULTS, settingDefault, validateSetting } from './settingsSchema';
import { mockTime } from './timeMock';

export interface EchoHeader {
  id: string;
  message_type: 'method_call' | 'signal' | 'response';
  destination: string;
  interface: string;
  method: string;
  timestamp: number;
}

export interface EchoMessage {
  header: EchoHeader;
  body: Record<string, unknown>;
}

type SignalCallback = (data: unknown) => void;

interface GeckoOSBridge {
  initialized: boolean;
  callService: (
    service: string,
    method: string,
    params?: Record<string, unknown>
  ) => Promise<unknown>;
  addEventListener: (
    service: string,
    eventName: string,
    callback: (data: unknown) => void
  ) => () => void;
}

declare global {
  interface Window {
    geckoOS?: GeckoOSBridge;
  }

  interface WindowEventMap {
    geckoOSReady: CustomEvent<GeckoOSBridge>;
  }
}

/**
 * Resolves once `window.geckoOS` has finished its init handshake, or after
 * `timeoutMs` if it never does (e.g. the extension is present but the native
 * host never connects) — callers treat a `false` result the same as "not
 * native" and fall back to the mock.
 */
function waitForGeckoOSReady(timeoutMs = 3000): Promise<boolean> {
  if (typeof window === 'undefined') {
    return Promise.resolve(false);
  }
  if (window.geckoOS?.initialized) {
    return Promise.resolve(true);
  }
  // Only worth polling/waiting under pyxis:// -- that's the only context
  // where the compiled-in JSWindowActor bridge (PyxisBridgeChild/Parent,
  // matched via ActorManagerParent's `matches: ["pyxis://*/*"]`) could ever
  // attach at all. In a plain http(s) dev-server context (no extension, no
  // pyxis:// actor), window.geckoOS will NEVER appear, so waiting out the
  // full timeout here would only slow down every single mock call during
  // local development for no benefit.
  if (typeof location === 'undefined' || location.protocol !== 'pyxis:') {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('geckoOSReady', onReady);
      clearInterval(pollId);
      clearTimeout(timer);
      resolve(result);
    };
    const onReady = () => finish(true);
    window.addEventListener('geckoOSReady', onReady);
    // Poll too, not just listen for the event (real bug found via a real
    // report, 2026-07-07): the ORIGINAL version of this function bailed
    // out instantly and permanently if `window.geckoOS` didn't exist yet
    // at the exact moment this ran — correct if the JSWindowActor always
    // finishes attaching before any page script executes, but that's not
    // guaranteed: under QEMU's default `-display gtk,gl=on` (what `make
    // run` actually uses), the actor's cross-process creation lagged
    // behind React's effects running, so `window.geckoOS` was still
    // undefined at check time and every native call silently fell back to
    // the mock forever — even though the bridge itself was fully working
    // and would have appeared a short moment later. This never reproduced
    // under `-display egl-headless` (used for all of this session's
    // automated VM testing), which is apparently fast enough to never
    // lose this race. Polling for `window.geckoOS` to even come into
    // existence (not just its `.initialized` flag) makes this resilient
    // to that timing difference instead of depending on it.
    const pollId = setInterval(() => {
      if (window.geckoOS?.initialized) {
        finish(true);
      }
    }, 50);
    const timer = setTimeout(() => {
      finish(!!window.geckoOS?.initialized);
    }, timeoutMs);
  });
}

/** Derives the Echo service-name suffix (e.g. `'appHost'`) from an
 * `org.geckoOS.<service>`-shaped interface string, for `addEventListener`. */
function ifaceToService(iface: string): string {
  const parts = iface.split('.');
  return parts.length > 0 ? parts[parts.length - 1] : iface;
}

function uuid(): string {
  // RFC4122 v4-ish, sufficient for message correlation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------- Mock backend ----------
//
// The mock holds enough state to drive the AppHost lifecycle UX (launching,
// running, crashed badges) without a real daemon. The mock is intentionally
// only used when `window.__gecko_ipc` is absent.

const MOCK_APPS = [
  { id: 'terminal', name: 'Terminal', icon: '💻', running: false },
  { id: 'files', name: 'Files', icon: '📁', running: false },
  { id: 'settings', name: 'Settings', icon: '⚙️', running: false },
  { id: 'browser', name: 'Browser', icon: '🌐', running: false },
  { id: 'notes', name: 'Notes', icon: '📝', running: false },
  { id: 'contacts', name: 'Contacts', icon: '👤', running: false },
  { id: 'tasks', name: 'Tasks', icon: '✅', running: false },
  { id: 'installer', name: 'App Installer', icon: '📦', running: false },
];

// Installable `.ipk` packages the installer mock "discovers". Shaped
// exactly like installer.rs's PackageInfo so the wizard renders identically
// in dev and on device. Paths use /tmp because that is a real allowed
// install root (see ALLOWED_INSTALL_ROOTS) and where `pyxis install` drops
// packages.
const MOCK_PACKAGES = [
  {
    path: '/tmp/notes_0.2.0_all.ipk',
    package: 'notes',
    version: '0.2.0',
    architecture: 'all',
    description: 'Note-taking app for Pyxis',
    maintainer: 'Pyxis Project <dev@pyxis.local>',
    installedSize: 233619,
    title: 'Notes',
    vendor: 'Pyxis Project',
    appType: 'web',
    requiredPermissions: ['filesystem.read', 'filesystem.write'],
  },
  {
    path: '/tmp/weather_1.0.0_all.ipk',
    package: 'weather',
    version: '1.0.0',
    architecture: 'all',
    description: 'Weather forecasts for Pyxis',
    maintainer: 'Example Corp <dev@example.com>',
    installedSize: 118240,
    title: 'Weather',
    vendor: 'Example Corp',
    appType: 'web',
    requiredPermissions: ['network', 'location'],
  },
  {
    path: '/tmp/sysmon_0.4.1_x86_64.ipk',
    package: 'sysmon',
    version: '0.4.1',
    architecture: 'x86_64',
    description: 'Native system monitor',
    maintainer: 'Example Corp <dev@example.com>',
    installedSize: 84992,
    title: 'System Monitor',
    vendor: 'Example Corp',
    appType: 'native',
    requiredPermissions: ['ipc'],
  },
];

// package -> installed version, for the installer mock's already-installed
// reporting. Seeded with the PIM apps that ship in the image.
const mockInstalled = new Map<string, string>([['notes', '0.1.0']]);

interface MockSession {
  sessionId: string;
  appId: string;
  pid: number;
  startedAt: number;
  state: 'starting' | 'running' | 'stopped' | 'crashed';
  /**
   * Mock compositor surface ids attached to this session. In the dev
   * browser there's no real Wayland — we synthesize an integer id per
   * session so the shell can exercise the embedded-surface UI.
   */
  surfaces: number[];
}

// Monotonic counter for fake Wayland window ids in mock mode.
let mockSurfaceSeq = 1;

const mockSessions = new Map<string, MockSession>();

// ---- Evo (compositor windows) ----
//
// A stand-in for Evo's toplevels so the dev server can exercise the dock and
// overview. A window exists for exactly as long as a session surface does
// (the real window_id is the number AppHost lists in `session.surfaces`),
// and every change is announced with the signal and payload Evo emits
// (evo/src/enhancements/echo_ipc.rs); src/hooks/__tests__/evoContract.test.ts
// holds the two together.
const EVO_MOCK_IFACE = 'org.geckoOS.evo';

interface MockWindow {
  window_id: number;
  app_id: string;
  width: number;
  height: number;
  x: number;
  y: number;
  focused: boolean;
  visible: boolean;
}
const mockWindows = new Map<number, MockWindow>();

const MOCK_EVO_METHODS = new Set([
  'ListWindows',
  'FocusWindow',
  'MinimizeWindow',
  'RestoreWindow',
  'CloseWindow',
  'MaximizeWindow',
  'UnmaximizeWindow',
]);

/**
 * Placeholder pictures for `GetWindowThumbnails` in the dev server: a drawn
 * stand-in window (title bar, a few lines) tinted by app, at the window's
 * aspect ratio and the size Evo would answer with. Not what the device sends:
 * Evo's are JPEGs of the real window.
 */
function mockThumbnails(args: Record<string, unknown>) {
  const maxW = Math.min(480, Math.max(16, Number(args.max_width) || 480));
  const maxH = Math.min(480, Math.max(16, Number(args.max_height) || 300));
  const wanted = Array.isArray(args.window_ids) ? new Set(args.window_ids.map(Number)) : null;
  const thumbnails = [];
  for (const w of mockWindows.values()) {
    if (wanted && !wanted.has(w.window_id)) continue;
    const s = Math.min(maxW / w.width, maxH / w.height, 1);
    const width = Math.max(1, Math.round(w.width * s));
    const height = Math.max(1, Math.round(w.height * s));
    let hue = 0;
    for (const ch of w.app_id) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<rect width="100%" height="100%" fill="hsl(${hue} 35% 94%)"/>` +
      `<rect width="100%" height="${Math.round(height * 0.1)}" fill="hsl(${hue} 40% 82%)"/>` +
      `<circle cx="${Math.round(height * 0.05)}" cy="${Math.round(height * 0.05)}" r="${Math.round(height * 0.02)}" fill="hsl(${hue} 60% 55%)"/>` +
      [0.22, 0.32, 0.42, 0.62]
        .map(
          (y, i) =>
            `<rect x="${Math.round(width * 0.08)}" y="${Math.round(height * y)}" width="${Math.round(width * (i === 3 ? 0.5 : 0.84 - i * 0.12))}" height="${Math.max(2, Math.round(height * 0.04))}" rx="3" fill="hsl(${hue} 30% 70%)"/>`
        )
        .join('') +
      `</svg>`;
    thumbnails.push({
      window_id: w.window_id,
      width,
      height,
      data: `data:image/svg+xml;base64,${btoa(svg)}`,
    });
  }
  return { thumbnails };
}

type MockFanOut = (signal: string, data: unknown, ifaceOverride?: string) => void;

function evoEmit(fanOut: MockFanOut | undefined, signal: string, data: Record<string, unknown>) {
  fanOut?.(signal, { ...data, timestamp: Date.now() }, EVO_MOCK_IFACE);
}

function setMockFocus(windowId: number | null, fanOut?: MockFanOut) {
  for (const w of mockWindows.values()) w.focused = w.window_id === windowId;
  evoEmit(fanOut, 'WindowFocusChanged', { window_id: windowId, workspace_id: 0 });
}

function mapMockWindow(windowId: number, appId: string, fanOut?: MockFanOut) {
  if (mockWindows.has(windowId)) return;
  const n = mockWindows.size;
  const win: MockWindow = {
    window_id: windowId,
    app_id: appId,
    width: 900,
    height: 600,
    x: 60 + n * 30,
    y: 60 + n * 30,
    focused: false,
    visible: true,
  };
  mockWindows.set(windowId, win);
  evoEmit(fanOut, 'WindowCreated', {
    window_id: windowId,
    app_id: appId,
    width: win.width,
    height: win.height,
  });
  // A newly mapped toplevel takes focus, as in the compositor.
  setMockFocus(windowId, fanOut);
}

function unmapMockWindow(windowId: number, fanOut?: MockFanOut) {
  const win = mockWindows.get(windowId);
  if (!win) return;
  mockWindows.delete(windowId);
  evoEmit(fanOut, 'WindowClosed', { window_id: windowId });
  if (win.focused) {
    const next = Array.from(mockWindows.values()).reverse().find((w) => w.visible);
    setMockFocus(next?.window_id ?? null, fanOut);
  }
}

function mockNowSecs() {
  return Math.floor(Date.now() / 1000);
}

// Seed tree for the filesystem mock's `readDirectory`, keyed by the exact
// path a caller would request: rooted at '~', which is where an app's calls
// start on a device too (its own storage, or the user's home for Files), or
// at '/' for the read-only rest of the system that Files can browse. Each
// child's own key is `${parentPath}/${name}`, matching what readDirectory
// hands back in each entry's `path` field — FilesApp navigates by following
// that field directly, so mock and native paths are constructed the same way.
const MOCK_FS_TREE: Record<string, { name: string; isDirectory: boolean; size?: number }[]> = {
  '/': [
    { name: 'etc', isDirectory: true },
    { name: 'home', isDirectory: true },
    { name: 'usr', isDirectory: true },
  ],
  '/etc': [
    { name: 'hostname', isDirectory: false, size: 6 },
    { name: 'os-release', isDirectory: false, size: 64 },
  ],
  '/home': [{ name: 'geckouser', isDirectory: true }],
  '/home/geckouser': [],
  '/usr': [],
  '~': [
    { name: 'Documents', isDirectory: true },
    { name: 'Downloads', isDirectory: true },
    { name: 'Pictures', isDirectory: true },
    { name: 'Music', isDirectory: true },
    { name: 'README.md', isDirectory: false, size: 1240 },
  ],
  '~/Documents': [
    { name: 'notes.txt', isDirectory: false, size: 512 },
    { name: 'project-spec.md', isDirectory: false, size: 4096 },
    { name: 'budget.xlsx', isDirectory: false, size: 20480 },
  ],
  '~/Downloads': [
    { name: 'geckos-alpha.iso', isDirectory: false, size: 734003200 },
    { name: 'pyxis-shell.tar.gz', isDirectory: false, size: 1048576 },
  ],
  '~/Pictures': [
    { name: 'wallpaper.jpg', isDirectory: false, size: 245760 },
    { name: 'screenshot-001.png', isDirectory: false, size: 102400 },
    { name: 'gecko-mascot.svg', isDirectory: false, size: 8192 },
  ],
  '~/Music': [
    { name: 'gecko-theme.flac', isDirectory: false, size: 31457280 },
    { name: 'shell-jingle.wav', isDirectory: false, size: 5242880 },
  ],
};

// Seed text content so FilesApp's text preview has something to show in dev
// (the real daemon reads the actual file). Keyed by the same '~'-rooted path
// readDirectory hands back. Image/audio fixtures have no entry, so those fall
// through to the metadata card in dev; on a real device readFile now serves
// them as base64 and FilesApp renders images inline.
const MOCK_FILE_CONTENT: Record<string, string> = {
  '~/README.md':
    '# GeckoOS\n\nWelcome to Pyxis. This is a seeded mock file shown in dev mode.\n',
  '~/Documents/notes.txt':
    'Shopping list\n- terminfo\n- bash-completion\n- coffee\n',
  '~/Documents/project-spec.md':
    '# Project Spec\n\n1. Compositor-first\n2. IPC-driven\n3. Web-tech shell\n',
  '/etc/hostname': 'pyxis\n',
  '/etc/os-release': 'NAME="Pyxis"\nID=pyxis\nPRETTY_NAME="Pyxis (mock)"\n',
};

// What the mock refuses on an absolute path, as the bridge does on a device:
// outside the home, files are read-only.
const MOCK_FS_WRITES = new Set([
  'writeFile',
  'appendFile',
  'deleteFile',
  'deleteDirectory',
  'createDirectory',
  'copy',
  'move',
  'chmod',
]);

// Parent of a '~'-rooted path ('~/Documents/x' -> '~/Documents'; '~' -> null).
function mockParentPath(p: string): string | null {
  const i = p.lastIndexOf('/');
  return i <= 0 ? null : p.slice(0, i);
}
function mockBaseName(p: string): string {
  const i = p.lastIndexOf('/');
  return i < 0 ? p : p.slice(i + 1);
}

const MOCK_ENTRIES: Record<string, string> = {
  terminal: 'TerminalApp',
  files: 'FilesApp',
  settings: 'SettingsApp',
  browser: 'BrowserApp',
  notes: 'NotesApp',
  contacts: 'ContactsApp',
  tasks: 'TasksApp',
  installer: 'InstallerApp',
};

function mockManifests() {
  return MOCK_APPS.map((a) => ({
    id: a.id,
    name: a.name,
    icon: a.icon,
    exec: './launch',
    version: '0.1.0',
    category: 'system',
    entry: MOCK_ENTRIES[a.id] ?? null,
  }));
}

/**
 * Nova's registry as the mock projects it — `{ apps: NovaAppInfo[] }`, the
 * exact shape of `nova.List` (nova.rs::RegistryEntry::info_json).
 *
 * This deliberately does NOT reuse mockManifests(): AppHost's ListApps and
 * Nova's List are different projections of different things, and the mock
 * used to conflate them by having nova.List delegate to appHost.ListApps.
 * That returned `exec`/`icon`/`count` and omitted `tier`/`removable`/
 * `singleInstance`/`icons`, so anything built against the mock's nova.List
 * worked in dev and broke on device. `useApps.contract.test.ts` pins this.
 *
 * Note `entry` here is a webroot-relative path ("index.html"), not the
 * built-in-component hint AppHost's manifests carry in a field of the same
 * name.
 *
 * Built-ins are the `system` tier; anything the installer mock has installed
 * is the `opkg` tier, so installing in dev makes a genuinely new app appear
 * in the launcher — the alpha 4 acceptance flow, exercisable in a browser.
 * opkg-over-system precedence on a shared id mirrors nova.rs::reload's scan
 * order + tier_may_claim_id.
 */
const MOCK_PIM_APPS = new Set(['notes', 'contacts', 'tasks']);

function mockNovaRegistry(): NovaAppInfo[] {
  const byId = new Map<string, NovaAppInfo>();

  for (const a of MOCK_APPS) {
    byId.set(a.id, {
      id: a.id,
      name: a.name,
      version: '0.1.0',
      type: 'web',
      entry: 'index.html',
      icons: { '128': 'icon.png' },
      category: MOCK_PIM_APPS.has(a.id) ? 'pim' : 'system',
      singleInstance: true,
      display: 'windowed',
      background: false,
      permissions: [],
      installed: true,
      source: 'manifest.webapp',
      tier: 'system',
      removable: false,
    });
  }

  for (const [pkg, version] of mockInstalled) {
    const meta = MOCK_PACKAGES.find((m) => m.package === pkg);
    if (!meta) continue;
    byId.set(pkg, {
      id: pkg,
      name: meta.title,
      version,
      type: meta.appType,
      entry: meta.appType === 'native' ? '' : 'index.html',
      icons: { '128': 'icon.png' },
      category: meta.appType === 'native' ? 'utility' : 'pim',
      singleInstance: true,
      display: 'windowed',
      background: false,
      // Nova maps appinfo's raw vocabulary onto bridge capabilities
      // deny-by-default, so `permissions` (granted) and
      // `requiredPermissions` (declared) are not the same list. The mock
      // keeps them distinct so a UI reading the wrong one is visibly wrong
      // in dev too.
      permissions: [],
      installed: true,
      source: 'appinfo.json',
      tier: 'opkg',
      // opkg owns the files, so nova.Uninstall refuses these — removal has
      // to go back through the Installer (`opkg remove`).
      removable: false,
      requiredPermissions: meta.requiredPermissions,
    });
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function sessionsForApp(appId: string): MockSession[] {
  return Array.from(mockSessions.values()).filter((s) => s.appId === appId);
}

function mockResponse(
  iface: string,
  method: string,
  args: Record<string, unknown>,
  // `ifaceOverride` lets a mock emit on an interface other than the one
  // being called — the installer emits Nova's RegistryChanged, because on
  // device installer.rs ends every install/remove by asking Nova to reload
  // and it is Nova, not the installer, that announces the new registry.
  fanOut?: (signal: string, data: unknown, ifaceOverride?: string) => void
): unknown {
  // ---- AppHost (new lifecycle interface) ----
  if (iface.endsWith('appHost') || iface.endsWith('AppHost')) {
    switch (method) {
      case 'LaunchApp': {
        const appId = String(args.appId ?? args.app_id ?? '');
        const sessionId = uuid();
        const startedAt = mockNowSecs();
        const pid = Math.floor(Math.random() * 32000) + 1000;

        // Starting -> Running with a small delay so the UI sees the
        // "launching" badge transition.
        const starting: MockSession = {
          sessionId,
          appId,
          pid: 0,
          startedAt,
          state: 'starting',
          surfaces: [],
        };
        mockSessions.set(sessionId, starting);
        fanOut?.('AppStarting', { ...starting, surfaces: [...starting.surfaces] });

        const running: MockSession = { ...starting, pid, state: 'running' };
        // Defer running emission to next tick so transitions are observable.
        setTimeout(() => {
          mockSessions.set(sessionId, running);
          fanOut?.('AppRunning', { ...running, surfaces: [...running.surfaces] });

          // Synthesize a compositor surface a beat later so the
          // embedded-surface slot in DesktopWindow can show its
          // "live surface" indicator. Real systems get this from evo.
          setTimeout(() => {
            const current = mockSessions.get(sessionId);
            if (!current || current.state === 'stopped' || current.state === 'crashed') {
              return;
            }
            const surfaceId = mockSurfaceSeq++;
            const withSurface: MockSession = {
              ...current,
              surfaces: [...current.surfaces, surfaceId],
            };
            mockSessions.set(sessionId, withSurface);
            fanOut?.('AppSurfaceMapped', {
              ...withSurface,
              surfaces: [...withSurface.surfaces],
            });
            mapMockWindow(surfaceId, appId, fanOut);
          }, 200);
        }, 250);

        return {
          sessionId,
          appId,
          pid,
          startedAt,
          state: 'running',
          surfaces: [],
        };
      }
      case 'CloseApp': {
        const sid = String(args.sessionId ?? '');
        const s = mockSessions.get(sid);
        if (!s) {
          return { sessionId: sid, state: 'stopped', surfaces: [] };
        }
        // Detach any mock surfaces first so subscribers see them disappear
        // before the session itself is reaped.
        if (s.surfaces.length > 0) {
          s.surfaces.forEach((id) => unmapMockWindow(id, fanOut));
          const drained: MockSession = { ...s, surfaces: [] };
          fanOut?.('AppSurfaceUnmapped', {
            ...drained,
            surfaces: [...drained.surfaces],
          });
        }
        const stopped: MockSession = { ...s, state: 'stopped', surfaces: [] };
        mockSessions.delete(sid);
        fanOut?.('AppStopped', { ...stopped, surfaces: [...stopped.surfaces] });
        return stopped;
      }
      case 'KillApp': {
        const sid = String(args.sessionId ?? '');
        const s = mockSessions.get(sid);
        if (!s) {
          return { sessionId: sid, state: 'crashed', surfaces: [] };
        }
        if (s.surfaces.length > 0) {
          fanOut?.('AppSurfaceUnmapped', { ...s, surfaces: [] });
        }
        const crashed: MockSession = { ...s, state: 'crashed', surfaces: [] };
        mockSessions.delete(sid);
        fanOut?.('AppCrashed', { ...crashed, surfaces: [...crashed.surfaces] });
        return crashed;
      }
      case 'RestartApp': {
        const sid = String(args.sessionId ?? '');
        const existing = mockSessions.get(sid);
        if (existing) {
          mockSessions.delete(sid);
          fanOut?.('AppStopped', { ...existing, state: 'stopped' });
          return mockResponse(
            iface,
            'LaunchApp',
            { appId: existing.appId },
            fanOut
          );
        }
        return { success: false, error: 'unknown sessionId' };
      }
      case 'ListApps': {
        const apps = mockManifests().map((m) => {
          const sessions = sessionsForApp(m.id);
          return {
            ...m,
            running: sessions.length > 0,
            sessions,
          };
        });
        return { apps, count: apps.length };
      }
      case 'ListRunningApps': {
        const sessions = Array.from(mockSessions.values());
        return { sessions, count: sessions.length };
      }
      case 'GetAppState': {
        const sid = String(args.sessionId ?? '');
        const s = mockSessions.get(sid);
        return s
          ? { sessionId: sid, state: s.state }
          : { sessionId: sid, state: 'stopped' };
      }
      case 'BindSurface': {
        const appId = String(args.appId ?? '');
        const surfaceId = Number(args.surfaceId ?? 0);
        const explicitSid = args.sessionId
          ? String(args.sessionId)
          : null;

        // Find or synthesize the target session.
        let target: MockSession | null = null;
        if (explicitSid) {
          target = mockSessions.get(explicitSid) ?? null;
        }
        if (!target) {
          const candidate = sessionsForApp(appId).find(
            (s) => s.state === 'running' || s.state === 'starting'
          );
          target = candidate ?? null;
        }
        if (!target) {
          // Synthesize a foreign-process session so the dock surfaces
          // unknown windows in the lifecycle stream.
          const sessionId = uuid();
          target = {
            sessionId,
            appId,
            pid: Number(args.pid ?? 0),
            startedAt: mockNowSecs(),
            state: 'running',
            surfaces: [],
          };
          mockSessions.set(sessionId, target);
          fanOut?.('AppRunning', { ...target, surfaces: [...target.surfaces] });
        }
        if (!target.surfaces.includes(surfaceId)) {
          target = { ...target, surfaces: [...target.surfaces, surfaceId] };
          mockSessions.set(target.sessionId, target);
        }
        fanOut?.('AppSurfaceMapped', {
          ...target,
          surfaces: [...target.surfaces],
        });
        mapMockWindow(surfaceId, appId, fanOut);
        return { ...target, surfaces: [...target.surfaces] };
      }
      case 'UnbindSurface': {
        const surfaceId = Number(args.surfaceId ?? 0);
        let owner: MockSession | null = null;
        for (const s of mockSessions.values()) {
          if (s.surfaces.includes(surfaceId)) {
            owner = s;
            break;
          }
        }
        if (!owner) {
          return { surfaceId, unbound: false };
        }
        const updated: MockSession = {
          ...owner,
          surfaces: owner.surfaces.filter((s) => s !== surfaceId),
        };
        mockSessions.set(updated.sessionId, updated);
        fanOut?.('AppSurfaceUnmapped', {
          ...updated,
          surfaces: [...updated.surfaces],
        });
        unmapMockWindow(surfaceId, fanOut);
        // Reap synthesized foreign sessions when their last surface goes.
        if (updated.surfaces.length === 0 && updated.pid === 0) {
          mockSessions.delete(updated.sessionId);
        }
        return { ...updated, surfaces: [...updated.surfaces] };
      }
      case 'ListSurfaceSessions': {
        const sessions = Array.from(mockSessions.values()).filter(
          (s) => s.surfaces.length > 0
        );
        return { sessions, count: sessions.length };
      }
      case 'SubscribeAppLifecycle':
        return {
          success: true,
          interface: 'org.geckoOS.appHost',
          signals: [
            'AppStarting',
            'AppRunning',
            'AppStopped',
            'AppCrashed',
            'AppSurfaceMapped',
            'AppSurfaceUnmapped',
          ],
        };
      default:
        return { success: false, error: `unknown method ${method}` };
    }
  }

  // ---- Evo window calls (org.geckoOS.evo) ----
  // Keyed by window_id, like the real handlers. Focus on a minimized window
  // does nothing here: restoring is a separate call, so a shell that forgets
  // it is visibly wrong in dev too.
  if (iface.endsWith('evo') && MOCK_EVO_METHODS.has(method)) {
    if (method === 'ListWindows') {
      return { windows: Array.from(mockWindows.values()).map((w) => ({ ...w })) };
    }
    const windowId = Number(args.window_id);
    const win = mockWindows.get(windowId);
    if (!win) return { error: `no window ${windowId}` };
    switch (method) {
      case 'FocusWindow':
        if (win.visible) setMockFocus(windowId, fanOut);
        return { success: true, window_id: windowId };
      case 'MinimizeWindow': {
        win.visible = false;
        evoEmit(fanOut, 'WindowMinimized', { window_id: windowId, minimized: true });
        // Lumen: the Droplet reaches the icon 90% of the way through its
        // ~480 ms, and Evo says so (the dock ripples).
        setTimeout(
          () => evoEmit(fanOut, 'MinimizeLanded', { app_id: win.app_id, window_id: windowId, phase: 'land' }),
          430
        );
        if (win.focused) {
          const next = Array.from(mockWindows.values()).reverse().find((w) => w.visible);
          setMockFocus(next?.window_id ?? null, fanOut);
        }
        return { success: true, window_id: windowId };
      }
      case 'MaximizeWindow':
      case 'UnmaximizeWindow':
        evoEmit(fanOut, 'WindowMaximized', {
          window_id: windowId,
          maximized: method === 'MaximizeWindow',
        });
        return { success: true, window_id: windowId };
      case 'RestoreWindow':
        win.visible = true;
        evoEmit(fanOut, 'MinimizeLanded', { app_id: win.app_id, window_id: windowId, phase: 'rise' });
        evoEmit(fanOut, 'WindowMinimized', { window_id: windowId, minimized: false });
        return { success: true, window_id: windowId };
      case 'CloseWindow': {
        // Closing an app's last window ends the app, as closing vela's does.
        const owner = Array.from(mockSessions.values()).find((x) =>
          x.surfaces.includes(windowId)
        );
        if (owner) {
          const left = { ...owner, surfaces: owner.surfaces.filter((id) => id !== windowId) };
          mockSessions.set(owner.sessionId, left);
          unmapMockWindow(windowId, fanOut);
          if (left.surfaces.length === 0) {
            mockSessions.delete(owner.sessionId);
            fanOut?.('AppStopped', { ...left, state: 'stopped', surfaces: [] }, 'org.geckoOS.appHost');
          } else {
            fanOut?.('AppSurfaceUnmapped', { ...left, surfaces: [...left.surfaces] }, 'org.geckoOS.appHost');
          }
        } else {
          unmapMockWindow(windowId, fanOut);
        }
        return { success: true, window_id: windowId };
      }
      default:
        return { success: false, error: `unknown evo method ${method}` };
    }
  }

  // ---- Installer (.ipk / opkg — org.geckoOS.installer) ----
  // Mirrors echo/src/services/installer.rs: package discovery + metadata,
  // then install/remove that end by refreshing Nova's registry. The mock
  // replays the same InstallProgress/InstallCompleted signal sequence the
  // real service emits (on a timer, so the wizard's progress UI is actually
  // exercised in dev) and marks packages installed in a local set so a
  // second run reports them as already present.
  if (iface.endsWith('installer') || iface.endsWith('Installer')) {
    switch (method) {
      case 'ListAvailable': {
        const packages = MOCK_PACKAGES.map((p) => ({
          ...p,
          installed: mockInstalled.has(p.package),
          installedVersion: mockInstalled.get(p.package) ?? null,
        }));
        return { packages, count: packages.length };
      }
      case 'Inspect': {
        const path = String(args.packagePath ?? '');
        const found = MOCK_PACKAGES.find((p) => p.path === path);
        if (!found) return { error: `no package at ${path}` };
        return {
          ...found,
          installed: mockInstalled.has(found.package),
          installedVersion: mockInstalled.get(found.package) ?? null,
        };
      }
      case 'Install': {
        const path = String(args.packagePath ?? '');
        const pkg = MOCK_PACKAGES.find((p) => p.path === path);
        if (!pkg) return { error: `no package at ${path}` };
        const phases: [string, string][] = [
          ['verifying', 'Reading package metadata'],
          ['installing', 'Running opkg install'],
          ['registering', 'Refreshing app registry'],
        ];
        const result = {
          package: pkg.package,
          version: pkg.version,
          title: pkg.title,
          appType: pkg.appType,
          registeredApps: MOCK_APPS.length + mockInstalled.size + 1,
          launchable: pkg.appType === 'web',
          log: `Installing ${pkg.package} (${pkg.version})\nConfiguring ${pkg.package}.`,
        };
        // Resolve only after the phases have played out. The real service
        // awaits opkg before returning, so resolving synchronously here
        // would make the mock the *only* place a caller sees the response
        // beat its own progress signals — precisely the ordering the UI
        // must not be written against.
        return (async () => {
          fanOut?.('InstallStarted', { package: pkg.package, version: pkg.version, path });
          for (const [phase, message] of phases) {
            await new Promise((r) => setTimeout(r, 350));
            fanOut?.('InstallProgress', { package: pkg.package, phase, message });
          }
          await new Promise((r) => setTimeout(r, 250));
          mockInstalled.set(pkg.package, pkg.version);
          // Order matters and mirrors the device: the registry is refreshed
          // (RegistryChanged) before the install is reported complete, so a
          // wizard that navigates to the new app on InstallCompleted finds
          // it already listed.
          fanOut?.(
            'RegistryChanged',
            { count: mockNovaRegistry().length },
            'org.geckoOS.nova'
          );
          fanOut?.('InstallCompleted', { ...result, registeredApps: mockNovaRegistry().length });
          return result;
        })();
      }
      case 'Remove': {
        const name = String(args.package ?? '');
        mockInstalled.delete(name);
        const result = { package: name, registeredApps: mockNovaRegistry().length };
        fanOut?.(
          'RegistryChanged',
          { count: result.registeredApps },
          'org.geckoOS.nova'
        );
        fanOut?.('RemoveCompleted', result);
        return result;
      }
      case 'ListInstalled': {
        const packages = [...mockInstalled.entries()].map(([pkg, version]) => ({
          package: pkg,
          version,
          registered: true,
        }));
        return { packages, count: packages.length };
      }
      default:
        return { error: `unknown installer method: ${method}` };
    }
  }

  // ---- Nova (app runtime host — org.geckoOS.nova) ----
  // Nova is the shell's app-management authority; it delegates lifecycle to
  // AppHost. The mock mirrors that: Launch/Close reuse the AppHost session
  // bookkeeping above (and its fan-out, which callMethod binds to the
  // appHost iface even for nova calls), so useAppHost's appHost subscription
  // updates identically to native mode. This is what keeps local dev working
  // after the shell switches its launch path from appHost to nova.
  if (iface.endsWith('nova') || iface.endsWith('Nova')) {
    switch (method) {
      case 'Launch': {
        const appId = String(args.appId ?? args.app_id ?? '');
        // Single-instance: raise an existing live session instead of spawning.
        const existing = sessionsForApp(appId).find(
          (s) => s.state === 'running' || s.state === 'starting'
        );
        if (existing) {
          return { sessionId: existing.sessionId, appId, raised: true };
        }
        const res = mockResponse('org.geckoOS.appHost', 'LaunchApp', { appId }, fanOut) as
          | { sessionId?: string }
          | undefined;
        return { sessionId: res?.sessionId ?? uuid(), appId, raised: false };
      }
      case 'Close': {
        const appId = String(args.appId ?? '');
        const s = sessionsForApp(appId)[0];
        if (!s) return { appId, sessionId: null };
        mockResponse('org.geckoOS.appHost', 'CloseApp', { sessionId: s.sessionId }, fanOut);
        return { appId, sessionId: s.sessionId };
      }
      case 'Focus': {
        // No real compositor stacking to affect in the dev/browser mock —
        // just report the already-running session's first surface, so
        // callers (Bloom's dock) get the same shape as the native response.
        const appId = String(args.appId ?? '');
        const s = sessionsForApp(appId).find(
          (x) => x.state === 'running' || x.state === 'starting'
        );
        if (!s) return { error: `app '${appId}' is not running` };
        const windowId = s.surfaces[0] ?? 0;
        if (mockWindows.get(windowId)?.visible) setMockFocus(windowId, fanOut);
        return { appId, sessionId: s.sessionId, windowId };
      }
      case 'OpenExternalBrowser': {
        // Dev/browser mock: there's no vela process to spawn here, but a
        // plain `window.open` gives the same "opens in a real, independent
        // browsing context" behavior this method exists for, so dev-mode
        // testing of BrowserApp's navigation still does something real
        // rather than silently no-op'ing.
        const url = String(args.url ?? '');
        if (typeof window !== 'undefined') {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
        return { sessionId: uuid(), appId: 'browser-window', url };
      }
      case 'List':
        // NOT appHost.ListApps — see mockNovaRegistry's comment. `List`
        // carries no `running`/`sessionId`; liveness comes from AppHost.
        return { apps: mockNovaRegistry() };
      case 'GetInfo': {
        const appId = String(args.appId ?? '');
        const info = mockNovaRegistry().find((x) => x.id === appId);
        if (!info) return { error: `app '${appId}' is not installed` };
        // GetInfo alone adds liveness, and sessionId only while running.
        const session = sessionsForApp(appId).find(
          (x) => x.state === 'running' || x.state === 'starting'
        );
        return session
          ? { ...info, running: true, sessionId: session.sessionId }
          : { ...info, running: false };
      }
      default:
        return { success: false, error: `unknown nova method ${method}` };
    }
  }

  // ---- AppManager (legacy shim) ----
  if (iface.endsWith('AppManager') || iface.endsWith('appManager')) {
    switch (method) {
      case 'launch':
      case 'Launch':
        return {
          success: true,
          pid: Math.floor(Math.random() * 32000) + 1000,
          appId: args.app_id ?? args.appId,
        };
      case 'close':
      case 'Close':
        return { success: true };
      case 'list':
      case 'List':
        return { apps: MOCK_APPS, count: MOCK_APPS.length };
      case 'get_active':
      case 'getActive':
        return { appId: null };
      case 'set_active':
      case 'setActive':
        return { success: true };
      case 'kill':
      case 'Kill':
      case 'restart':
      case 'Restart':
        return { success: true };
      case 'install':
      case 'uninstall':
        return { success: true, appId: args.app_id ?? args.appId ?? null };
      default:
        return { success: false, error: `unknown method ${method}` };
    }
  }
  // ---- Settings (org.geckoOS.settings) ----
  // Mirrors echo/src/services/settings.rs: get answers an absent key with its
  // default, set refuses a bad pyxis.* value (settingsSchema.ts mirrors the
  // Rust schema), and every write that changes a key signals SettingChanged.
  // Persisted to localStorage so dev-mode preferences survive reloads
  // (degrades to in-memory-nothing on pyxis:// where localStorage throws, see
  // safeStorage.ts).
  if (iface.endsWith('settings')) {
    const STORE_KEY = 'pyxis.mock.settings';
    const load = (): Record<string, unknown> => {
      try {
        return JSON.parse(safeGetItem(STORE_KEY) ?? '{}');
      } catch {
        return {};
      }
    };
    const store = (s: Record<string, unknown>) =>
      safeSetItem(STORE_KEY, JSON.stringify(s));
    const settings = load();
    const has = (key: string) => Object.hasOwn(settings, key);
    const effective = (key: string) => (has(key) ? settings[key] : settingDefault(key));
    const changed = (key: string, value: unknown, previous: unknown, exists: boolean) =>
      fanOut?.('SettingChanged', { key, value, previous, exists });
    switch (method) {
      case 'get': {
        const key = String(args.key ?? '');
        return { key, value: effective(key), exists: has(key) };
      }
      case 'set': {
        const key = String(args.key ?? '');
        const value = args.value ?? null;
        const refusal = validateSetting(key, value);
        if (refusal) throw new Error(refusal);
        const previous = effective(key);
        if (!has(key) || JSON.stringify(settings[key]) !== JSON.stringify(value)) {
          settings[key] = value;
          store(settings);
          changed(key, value, previous, true);
        }
        return { success: true, key, value };
      }
      case 'getAll':
        return { settings, count: Object.keys(settings).length, defaults: SETTING_DEFAULTS };
      case 'delete': {
        const key = String(args.key ?? '');
        const existed = has(key);
        if (existed) {
          const previous = settings[key];
          delete settings[key];
          store(settings);
          changed(key, settingDefault(key), previous, false);
        }
        return { success: existed, key };
      }
      case 'clear':
      case 'reset':
        store({});
        for (const [key, previous] of Object.entries(settings)) {
          changed(key, settingDefault(key), previous, false);
        }
        return { success: true };
      default:
        return { success: false, error: `unknown method ${method}` };
    }
  }

  // ---- Filesystem (org.geckoOS.filesystem) ----
  // The file-document subset the PIM apps use (readFile/writeFile/exists/
  // deleteFile), each path becoming one localStorage entry, PLUS a seeded
  // readDirectory tree so FilesApp has something to browse without a real
  // daemon. Mirrors echo/src/services/filesystem.rs's read_directory shape
  // (entries[]: name/path/isFile/isDirectory/isSymlink/size/modified/
  // created/permissions) closely enough that FilesApp doesn't need to know
  // which backend answered it.
  if (iface.endsWith('filesystem')) {
    const fsKey = (p: string) => `pyxis.mock.fs:${p}`;
    const path = String(args.path ?? '');
    // Reflect a written/seeded file's content, or null if none.
    const fileContent = (p: string): string | null =>
      safeGetItem(fsKey(p)) ?? MOCK_FILE_CONTENT[p] ?? null;
    const absolute = [args.path, args.source, args.destination].some(
      (p) => typeof p === 'string' && p.startsWith('/')
    );
    if (absolute && MOCK_FS_WRITES.has(method)) {
      return { error: `${method} refused: outside your home, files are read-only` };
    }
    switch (method) {
      case 'readDirectory': {
        const dir = MOCK_FS_TREE[path];
        if (!dir) {
          return { error: `Path does not exist: ${path}` };
        }
        const now = mockNowSecs();
        const entries = dir.map((e) => ({
          name: e.name,
          path: path === '/' ? `/${e.name}` : `${path}/${e.name}`,
          isFile: !e.isDirectory,
          isDirectory: e.isDirectory,
          isSymlink: false,
          size: e.size ?? 0,
          modified: now,
          created: now,
          permissions: e.isDirectory ? '755' : '644',
        }));
        return { entries, path, count: entries.length };
      }
      case 'readFile': {
        const encoding = String(args.encoding ?? 'utf-8').toLowerCase();
        const content = fileContent(path);
        if (content === null) {
          // Real daemon returns an error for missing files; the mock keeps
          // the promise resolved but contentless so callers fall back.
          return { error: `File does not exist: ${path}` };
        }
        // Mirror filesystem.rs: the encoding parameter is honoured, not just
        // echoed back, and an unknown one is refused rather than silently
        // treated as utf-8. The mock has no binary fixtures, so base64 here
        // just encodes the seeded text — enough to exercise the caller's
        // data-URI path in dev.
        if (encoding === 'base64') {
          return { content: btoa(unescape(encodeURIComponent(content))), size: content.length, encoding, path };
        }
        if (encoding !== 'utf-8' && encoding !== 'utf8') {
          return { error: `Unsupported encoding "${encoding}"; expected "utf-8" or "base64"` };
        }
        return { content, size: content.length, encoding: 'utf-8', path };
      }
      case 'writeFile': {
        const content = String(args.content ?? '');
        safeSetItem(fsKey(path), content);
        return { success: true, bytesWritten: content.length, path };
      }
      case 'exists':
        return {
          path,
          exists:
            fileContent(path) !== null ||
            MOCK_FS_TREE[path] !== undefined ||
            (mockParentPath(path)?.length
              ? (MOCK_FS_TREE[mockParentPath(path)!] ?? []).some(
                  (e) => e.name === mockBaseName(path)
                )
              : false),
        };
      case 'stat': {
        const parent = mockParentPath(path);
        const entry = parent
          ? (MOCK_FS_TREE[parent] ?? []).find((e) => e.name === mockBaseName(path))
          : undefined;
        const isDir = MOCK_FS_TREE[path] !== undefined || !!entry?.isDirectory;
        const content = fileContent(path);
        if (!entry && !isDir && content === null) {
          return { error: `Path does not exist: ${path}` };
        }
        const now = mockNowSecs();
        return {
          path,
          size: content?.length ?? entry?.size ?? 0,
          isFile: !isDir,
          isDirectory: isDir,
          isSymlink: false,
          permissions: isDir ? '755' : '644',
          owner: 1000,
          group: 1000,
          accessed: now,
          modified: now,
          changed: now,
        };
      }
      case 'createDirectory': {
        const parent = mockParentPath(path);
        const name = mockBaseName(path);
        if (parent && MOCK_FS_TREE[parent]) {
          if (MOCK_FS_TREE[parent].some((e) => e.name === name)) {
            return { error: `Path already exists: ${path}` };
          }
          MOCK_FS_TREE[parent].push({ name, isDirectory: true });
        }
        MOCK_FS_TREE[path] = MOCK_FS_TREE[path] ?? [];
        return { success: true, path };
      }
      case 'deleteFile': {
        const parent = mockParentPath(path);
        const name = mockBaseName(path);
        if (parent && MOCK_FS_TREE[parent]) {
          MOCK_FS_TREE[parent] = MOCK_FS_TREE[parent].filter(
            (e) => e.name !== name
          );
        }
        safeSetItem(fsKey(path), '');
        return { success: true, path };
      }
      case 'deleteDirectory': {
        const parent = mockParentPath(path);
        const name = mockBaseName(path);
        if (parent && MOCK_FS_TREE[parent]) {
          MOCK_FS_TREE[parent] = MOCK_FS_TREE[parent].filter(
            (e) => e.name !== name
          );
        }
        // Drop the folder and any seeded descendants.
        Object.keys(MOCK_FS_TREE).forEach((k) => {
          if (k === path || k.startsWith(`${path}/`)) delete MOCK_FS_TREE[k];
        });
        return { success: true, path };
      }
      case 'move': {
        const source = String(args.source ?? '');
        const destination = String(args.destination ?? '');
        const sParent = mockParentPath(source);
        const dParent = mockParentPath(destination);
        const sName = mockBaseName(source);
        const dName = mockBaseName(destination);
        const srcEntry = sParent
          ? (MOCK_FS_TREE[sParent] ?? []).find((e) => e.name === sName)
          : undefined;
        if (!srcEntry) return { error: `Source does not exist: ${source}` };
        if (sParent && MOCK_FS_TREE[sParent]) {
          MOCK_FS_TREE[sParent] = MOCK_FS_TREE[sParent].filter(
            (e) => e.name !== sName
          );
        }
        if (dParent) {
          MOCK_FS_TREE[dParent] = MOCK_FS_TREE[dParent] ?? [];
          MOCK_FS_TREE[dParent].push({ ...srcEntry, name: dName });
        }
        // Re-key a directory and its descendants; carry a file's content.
        if (srcEntry.isDirectory) {
          Object.keys(MOCK_FS_TREE).forEach((k) => {
            if (k === source || k.startsWith(`${source}/`)) {
              MOCK_FS_TREE[destination + k.slice(source.length)] = MOCK_FS_TREE[k];
              delete MOCK_FS_TREE[k];
            }
          });
        } else {
          const c = fileContent(source);
          if (c !== null) safeSetItem(fsKey(destination), c);
          safeSetItem(fsKey(source), '');
        }
        return { success: true, source, destination };
      }
      default:
        return { success: false, error: `unsupported mock method ${method}` };
    }
  }

  // Power / Battery — interface suffixes are matched case-insensitively:
  // the real interfaces are lowercase (`org.geckoOS.network` etc.), and the
  // old case-sensitive endsWith('Network') never matched, so these calls
  // fell through to the generic `{ success: true }` and the UI rendered
  // undefined fields (e.g. a spurious "offline" badge).
  // Shape must track `PowerService::get_battery_status` in
  // echo/src/services/power.rs — `present` included. A mock that omits a
  // field the real service returns is how the JS↔bridge seam drifts without
  // anything failing at the desk.
  if (iface.toLowerCase().endsWith('power') || method.toLowerCase().includes('battery')) {
    if (method === 'shutdown') {
      console.log('[Mock Power] shutdown action received');
      return { success: true, action: 'shutdown' };
    }
    if (method === 'reboot') {
      console.log('[Mock Power] reboot action received');
      return { success: true, action: 'reboot' };
    }
    if (method === 'sleep') {
      console.log('[Mock Power] sleep action received');
      return { success: true, supported: true, action: 'sleep' };
    }
    return { present: true, level: 87, charging: false };
  }
  // Network
  if (iface.toLowerCase().endsWith('network') || method.toLowerCase().includes('network')) {
    return { connected: true, ssid: 'GeckoNet', type: 'wifi' };
  }
  // Notifications
  if (iface.toLowerCase().endsWith('notification')) {
    return mockNotifications(method, args, fanOut);
  }
  if (iface === 'org.geckoOS.time') {
    return mockTime(method, args, fanOut);
  }
  if (iface === 'org.geckoOS.audio') {
    return mockAudio(method, args, fanOut);
  }
  if (iface === 'org.geckoOS.evo' && method === 'SetOverlayFocus') {
    return { success: true, focused: Boolean(args.focused) };
  }
  if (iface === 'org.geckoOS.evo' && method === 'GetOverlayState') {
    return { keyboard: false, rects: [], workArea: { top: 0, bottom: 0, left: 0, right: 0 } };
  }
  if (iface === 'org.geckoOS.evo' && method === 'SetWorkArea') {
    return { success: true, ...args };
  }
  if (iface === 'org.geckoOS.evo' && method === 'SetMinimizeTargets') {
    // No compositor to minimize into; accept the table, as Evo does.
    const targets = Array.isArray(args.targets) ? args.targets : [];
    return { ok: true, targets: targets.length };
  }
  if (iface === 'org.geckoOS.evo' && method === 'GetWindowThumbnails') {
    return mockThumbnails(args);
  }
  if (iface === 'org.geckoOS.evo' && method === 'SetAnimationSettings') {
    if (args.mode === 'full' || args.mode === 'reduced' || args.mode === 'off') mockAnimation.mode = args.mode;
    if (typeof args.scale === 'number' && Number.isFinite(args.scale)) {
      mockAnimation.scale = Math.min(10, Math.max(0, args.scale));
    }
    return { ok: true, mode: mockAnimation.mode, scale: mockAnimation.scale };
  }
  if (iface === 'org.geckoOS.evo' && method === 'GetAnimationState') {
    const zero = { open: 0, close: 0, minimize: 0, restore: 0, geometry: 0 };
    return { ...mockAnimation, active: 0, started: { ...zero }, completed: { ...zero } };
  }
  if (iface === 'org.geckoOS.evo' && method === 'SetOverlayRegion') {
    // No compositor in the browser. Accept the region, as Evo does, so the
    // overlay page runs the same way in a dev-server tab.
    const rects = Array.isArray(args.rects) ? args.rects : [];
    return { success: true, rects: rects.length };
  }
  if (iface === 'org.geckoOS.sound') {
    // No sound files in the browser; succeed, as the device does for any
    // sound it has.
    return method === 'play'
      ? { success: true, name: String(args.name ?? '') }
      : { sounds: ['boot', 'error', 'notification', 'shutdown'] };
  }
  return { success: true };
}

// What the mock compositor was last told about animations.
const mockAnimation = { mode: 'full', scale: 1 };

// A stand-in for echo's audio service: one volume, two outputs, and the
// same signals the device sends when either changes.
const mockAudioState = { volume: 75, muted: false };
const mockOutputs = [
  { id: 32, name: 'alsa_output.mock-analog', description: 'Built-in Audio (mock)', isDefault: true },
  { id: 40, name: 'alsa_output.mock-hdmi', description: 'HDMI Audio (mock)', isDefault: false },
];

function mockAudio(
  method: string,
  args: Record<string, unknown>,
  fanOut?: (signal: string, data: unknown) => void
): unknown {
  switch (method) {
    case 'getVolume':
      return { ...mockAudioState };
    case 'setVolume':
      mockAudioState.volume = Math.round(Math.min(100, Math.max(0, Number(args.volume ?? 0))));
      fanOut?.('VolumeChanged', { ...mockAudioState });
      return { ...mockAudioState };
    case 'setMute':
      mockAudioState.muted = Boolean(args.muted);
      fanOut?.('VolumeChanged', { ...mockAudioState });
      return { ...mockAudioState };
    case 'listOutputs':
      return { outputs: mockOutputs.map((o) => ({ ...o })) };
    case 'setDefaultOutput': {
      const id = Number(args.id);
      if (!mockOutputs.some((o) => o.id === id)) {
        return { success: false, error: `no audio output with id ${id}` };
      }
      mockOutputs.forEach((o) => (o.isDefault = o.id === id));
      const outputs = mockOutputs.map((o) => ({ ...o }));
      fanOut?.('OutputChanged', { outputs });
      return { outputs };
    }
    default:
      return { success: false, error: `mock audio service has no '${method}'` };
  }
}

// A stateful stand-in for echo's notification store, signals included, so
// that toasts and the centre behave in the browser the way they do on a
// device. It used to return a canned "System Ready" entry for every call, so
// dismissing it did nothing, and anything an app raised never appeared.
const mockNotificationStore: Array<Record<string, unknown>> = [];

function mockNotifications(
  method: string,
  args: Record<string, unknown>,
  fanOut?: (signal: string, data: unknown) => void
): unknown {
  switch (method) {
    case 'show': {
      const options = (args.options ?? {}) as Record<string, unknown>;
      const urgency = options.urgency === 'critical' || options.urgency === 'low' ? options.urgency : 'normal';
      const notification = {
        id: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: String(args.title ?? 'Notification'),
        body: String(options.body ?? ''),
        urgency,
        timeout: urgency === 'critical' ? 0 : Math.min(Number(options.timeout ?? 5000), 60000),
        // No bridge in the browser to stamp the caller, as on a device.
        appId: null,
        icon: options.icon ?? null,
        timestamp: Date.now(),
      };
      mockNotificationStore.unshift(notification);
      mockNotificationStore.length = Math.min(mockNotificationStore.length, 50);
      fanOut?.('NotificationShown', { notification });
      return { success: true, notificationId: notification.id, notification };
    }
    case 'list':
      return { notifications: [...mockNotificationStore] };
    case 'close': {
      const id = String(args.notificationId ?? args.id ?? '');
      const index = mockNotificationStore.findIndex((n) => n.id === id);
      if (index < 0) return { success: false, notificationId: id };
      mockNotificationStore.splice(index, 1);
      fanOut?.('NotificationClosed', { notificationId: id });
      return { success: true, notificationId: id };
    }
    case 'closeAll': {
      const ids = mockNotificationStore.splice(0).map((n) => String(n.id));
      ids.forEach((id) => fanOut?.('NotificationClosed', { notificationId: id }));
      return { success: true, closed: ids.length };
    }
    default:
      return { success: false, error: `mock notification service has no '${method}'` };
  }
}

// ---------- Client ----------
export class EchoClient {
  private signalSubs = new Map<string, Set<SignalCallback>>();

  isNative(): boolean {
    return typeof window !== 'undefined' && !!window.geckoOS;
  }

  async callMethod(
    service: string,
    iface: string,
    method: string,
    args: Record<string, unknown> = {}
  ): Promise<unknown> {
    // NOT gated on `this.isNative()` first (real bug, found via a real
    // report, 2026-07-07): that check is a synchronous, one-shot read of
    // `window.geckoOS` — if the JSWindowActor bridge hasn't finished
    // attaching yet at the exact moment a caller's effect fires (a real,
    // reproducible race under QEMU's default `-display gtk,gl=on`; never
    // seen under `-display egl-headless`), this would skip
    // waitForGeckoOSReady() entirely and fall to mock permanently, even
    // though the bridge would have appeared moments later.
    // waitForGeckoOSReady() itself now handles both "no bridge, ever" (a
    // plain http(s) dev context) and "bridge not attached YET" (pyxis://,
    // still initializing) correctly, so it's the only gate needed here.
    const ready = await waitForGeckoOSReady();
    if (ready && window.geckoOS) {
      try {
        return await window.geckoOS.callService(service, method, args);
      } catch (err) {
        console.warn('[EchoClient] native call failed, falling back to mock', err);
      }
    }
    // Mock path — resolve immediately, with a fanOut shim so callers see the
    // same lifecycle signals they would in native mode. Lifecycle signals
    // always live on appHost's iface; a nova call that spawns/kills a session
    // delegates to appHost, so bind the fan-out there for nova calls too or
    // the shell's appHost subscription wouldn't receive them.
    const fanOutIface = iface.endsWith('nova') ? 'org.geckoOS.appHost' : iface;
    return Promise.resolve(mockResponse(iface, method, args, this.mockFanOut(fanOutIface)));
  }

  /**
   * Returns a fan-out helper that emits a signal on this client's local
   * subscriber map. Used by the mock backend to replay AppStarting/etc.
   */
  private mockFanOut(iface: string) {
    return (signal: string, data: unknown, ifaceOverride?: string) => {
      const key = `${ifaceOverride ?? iface}::${signal}`;
      const subs = this.signalSubs.get(key);
      subs?.forEach((cb) => {
        try {
          cb(data);
        } catch (err) {
          console.error('[EchoClient] mock signal subscriber threw', err);
        }
      });
    };
  }

  /**
   * Fans a signal out to local subscribers. `window.geckoOS` has no
   * client-originated "emit" capability — its bridge only pushes
   * service-originated events *to* content via `addEventListener` — so this
   * stays local-only regardless of native/mock mode. It exists for same-tab
   * dev/test signal replay, not real cross-process IPC.
   */
  async emitSignal(
    iface: string,
    signal: string,
    data: Record<string, unknown> = {}
  ): Promise<void> {
    const key = `${iface}::${signal}`;
    const subs = this.signalSubs.get(key);
    subs?.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error('[EchoClient] signal subscriber threw', err);
      }
    });
  }

  onSignal(iface: string, signal: string, callback: SignalCallback): () => void {
    const key = `${iface}::${signal}`;
    if (!this.signalSubs.has(key)) {
      this.signalSubs.set(key, new Set());
    }
    this.signalSubs.get(key)!.add(callback);

    let nativeUnsub: (() => void) | undefined;
    if (this.isNative()) {
      const service = ifaceToService(iface);
      nativeUnsub = window.geckoOS!.addEventListener(service, signal, callback);
    }

    return () => {
      this.signalSubs.get(key)?.delete(callback);
      try {
        nativeUnsub?.();
      } catch {
        /* ignore */
      }
    };
  }
}

// Singleton — apps share the same client
export const echoClient = new EchoClient();

export default echoClient;

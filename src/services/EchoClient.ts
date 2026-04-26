/**
 * EchoClient
 * -----------
 * Thin wrapper around the GeckoOS Echo IPC bus.
 *
 * In native (rootfs/Gecko) context, `window.__gecko_ipc` is injected by the
 * shell host with the same JSON message schema used by echo's Unix socket:
 *
 *   {
 *     header: {
 *       id: string,
 *       message_type: 'method_call' | 'signal' | 'response',
 *       destination: string,   // service name (e.g. 'appmanager')
 *       interface: string,     // e.g. 'com.geckoOS.AppManager'
 *       method: string,        // e.g. 'launch'
 *       timestamp: number
 *     },
 *     body: object
 *   }
 *
 * In dev/browser context, calls are answered by a local mock that returns
 * plausible data so the UI is fully exercised without a host.
 */

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

type SignalCallback = (data: any) => void;

interface NativeIpc {
  send: (msg: EchoMessage) => Promise<EchoMessage>;
  subscribe?: (
    iface: string,
    signal: string,
    cb: (data: any) => void
  ) => () => void;
}

declare global {
  interface Window {
    __gecko_ipc?: NativeIpc;
  }
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
];

interface MockSession {
  sessionId: string;
  appId: string;
  pid: number;
  startedAt: number;
  state: 'starting' | 'running' | 'stopped' | 'crashed';
}

const mockSessions = new Map<string, MockSession>();

function mockNowSecs() {
  return Math.floor(Date.now() / 1000);
}

function mockManifests() {
  return MOCK_APPS.map((a) => ({
    id: a.id,
    name: a.name,
    icon: a.icon,
    exec: './launch',
    version: '0.1.0',
    category: 'system',
    entry:
      a.id === 'terminal'
        ? 'TerminalApp'
        : a.id === 'files'
        ? 'FilesApp'
        : a.id === 'settings'
        ? 'SettingsApp'
        : a.id === 'browser'
        ? 'BrowserApp'
        : null,
  }));
}

function sessionsForApp(appId: string): MockSession[] {
  return Array.from(mockSessions.values()).filter((s) => s.appId === appId);
}

function mockResponse(
  iface: string,
  method: string,
  args: Record<string, unknown>,
  fanOut?: (signal: string, data: any) => void
): any {
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
        };
        mockSessions.set(sessionId, starting);
        fanOut?.('AppStarting', { ...starting });

        const running: MockSession = { ...starting, pid, state: 'running' };
        // Defer running emission to next tick so transitions are observable.
        setTimeout(() => {
          mockSessions.set(sessionId, running);
          fanOut?.('AppRunning', { ...running });
        }, 250);

        return {
          sessionId,
          appId,
          pid,
          startedAt,
          state: 'running',
        };
      }
      case 'CloseApp': {
        const sid = String(args.sessionId ?? '');
        const s = mockSessions.get(sid);
        if (!s) {
          return { sessionId: sid, state: 'stopped' };
        }
        const stopped: MockSession = { ...s, state: 'stopped' };
        mockSessions.delete(sid);
        fanOut?.('AppStopped', { ...stopped });
        return stopped;
      }
      case 'KillApp': {
        const sid = String(args.sessionId ?? '');
        const s = mockSessions.get(sid);
        if (!s) {
          return { sessionId: sid, state: 'crashed' };
        }
        const crashed: MockSession = { ...s, state: 'crashed' };
        mockSessions.delete(sid);
        fanOut?.('AppCrashed', { ...crashed });
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
      case 'SubscribeAppLifecycle':
        return {
          success: true,
          interface: 'org.geckoOS.appHost',
          signals: ['AppStarting', 'AppRunning', 'AppStopped', 'AppCrashed'],
        };
      default:
        return { success: false, error: `unknown method ${method}` };
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
  // Power / Battery
  if (iface.endsWith('Power') || method.toLowerCase().includes('battery')) {
    return { level: 87, charging: false };
  }
  // Network
  if (iface.endsWith('Network') || method.toLowerCase().includes('network')) {
    return { connected: true, ssid: 'GeckoNet', type: 'wifi' };
  }
  // Notifications
  if (iface.endsWith('Notifications') || method.toLowerCase().includes('notification')) {
    return [];
  }
  return { success: true };
}

// ---------- Client ----------
export class EchoClient {
  private signalSubs = new Map<string, Set<SignalCallback>>();

  isNative(): boolean {
    return typeof window !== 'undefined' && !!window.__gecko_ipc;
  }

  async callMethod(
    service: string,
    iface: string,
    method: string,
    args: Record<string, unknown> = {}
  ): Promise<any> {
    const message: EchoMessage = {
      header: {
        id: uuid(),
        message_type: 'method_call',
        destination: service,
        interface: iface,
        method,
        timestamp: Date.now(),
      },
      body: args,
    };

    if (this.isNative()) {
      try {
        const res = await window.__gecko_ipc!.send(message);
        return res.body;
      } catch (err) {
        console.warn('[EchoClient] native call failed, falling back to mock', err);
        return mockResponse(iface, method, args, this.mockFanOut(iface));
      }
    }
    // Mock path — resolve immediately, with a fanOut shim so callers see the
    // same lifecycle signals they would in native mode.
    return Promise.resolve(mockResponse(iface, method, args, this.mockFanOut(iface)));
  }

  /**
   * Returns a fan-out helper that emits a signal on this client's local
   * subscriber map. Used by the mock backend to replay AppStarting/etc.
   */
  private mockFanOut(iface: string) {
    return (signal: string, data: any) => {
      const key = `${iface}::${signal}`;
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

  async emitSignal(
    iface: string,
    signal: string,
    data: Record<string, unknown> = {}
  ): Promise<void> {
    const message: EchoMessage = {
      header: {
        id: uuid(),
        message_type: 'signal',
        destination: '*',
        interface: iface,
        method: signal,
        timestamp: Date.now(),
      },
      body: data,
    };
    if (this.isNative()) {
      try {
        await window.__gecko_ipc!.send(message);
      } catch (err) {
        console.warn('[EchoClient] native signal emit failed', err);
      }
    }
    // Local fan-out so dev consumers see signals too
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
    if (this.isNative() && window.__gecko_ipc!.subscribe) {
      nativeUnsub = window.__gecko_ipc!.subscribe(iface, signal, callback);
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

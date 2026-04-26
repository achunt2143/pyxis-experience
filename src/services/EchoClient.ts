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
const MOCK_APPS = [
  { id: 'terminal', name: 'Terminal', icon: '💻', running: false },
  { id: 'files', name: 'Files', icon: '📁', running: false },
  { id: 'settings', name: 'Settings', icon: '⚙️', running: false },
  { id: 'browser', name: 'Browser', icon: '🌐', running: false },
];

function mockResponse(
  iface: string,
  method: string,
  args: Record<string, unknown>
): any {
  // AppManager
  if (iface.endsWith('AppManager')) {
    switch (method) {
      case 'launch':
        return { success: true, pid: Math.floor(Math.random() * 32000) + 1000, appId: args.app_id };
      case 'close':
        return { success: true };
      case 'list':
        return { apps: MOCK_APPS, count: MOCK_APPS.length };
      case 'get_active':
        return { appId: null };
      case 'set_active':
        return { success: true };
      case 'kill':
      case 'restart':
        return { success: true };
      case 'install':
      case 'uninstall':
        return { success: true, appId: args.app_id ?? null };
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
        return mockResponse(iface, method, args);
      }
    }
    // Mock path — resolve immediately
    return Promise.resolve(mockResponse(iface, method, args));
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

/**
 * Non-hook Echo service helpers and constants, shared by React hooks (`useEcho`),
 * Duyo stores (`bindAppHost`) and Duyo code-behinds that cannot call React hooks.
 */
import echoClient from './EchoClient';
import { EVO_SERVICE } from './evo';
import { EVO_IFACE } from './overlay';

export interface NetworkStatus {
  connected: boolean;
  ssid: string;
  type: string;
}

export interface NetworkInterfaceInfo {
  name: string;
  type: string;
  ipv4: string;
  ipv6: string;
  macAddress: string;
  isUp: boolean;
  isRunning: boolean;
  mtu: number;
}

export interface WifiNetworkInfo {
  ssid: string;
  signal: number;
  security: string;
  connected: boolean;
}

export interface WifiScanResult {
  networks: WifiNetworkInfo[];
  wirelessAvailable: boolean;
  interface: string | null;
}

export interface NetworkDetails {
  ipAddress: string;
  gateway: string;
  dns: string[];
}

export interface BatteryStatus {
  present: boolean;
  level: number | null;
  charging: boolean;
  available?: boolean;
  percentage?: number;
  status?: string;
}

export interface ScreenBrightnessState {
  brightness: number | null;
  supported: boolean;
}

export interface StoragePartition {
  device: string;
  mountPoint: string;
  fsType: string;
  total: number;
  used: number;
  available: number;
}

export interface SystemServiceStatus {
  name: string;
  destination: string;
  kind: string;
  reachable: boolean;
}

/** Result of `nova.Launch` — `raised` is true when single-instance policy raised an existing session. */
export interface LaunchResult {
  sessionId: string;
  appId: string;
  raised: boolean;
  windowId?: number;
}

/** Per-app declared/revoked/effective capabilities from `nova.GetPermissions` / `nova.SetPermission`. */
export interface AppPermissionInfo {
  id: string;
  name: string;
  declared: string[];
  revoked: string[];
  effective: string[];
}

export type PowerAction = 'sleep' | 'reboot' | 'shutdown';

// Service-name strings must match `echo/src/bin/daemon.rs` (`org.geckoOS.<service>`).
export const NOVA_SERVICE = 'nova';
export const NOVA_IFACE = 'org.geckoOS.nova';

/**
 * Registry-mutating signals Nova emits (`echo/src/services/nova.rs`).
 * Consumers of `nova.List` re-fetch on each of these.
 */
export const NOVA_SIGNALS = {
  installed: 'AppInstalled',
  uninstalled: 'AppUninstalled',
  registryChanged: 'RegistryChanged',
  permissionsChanged: 'PermissionsChanged',
} as const;

export const POWER_SERVICE = 'power';
export const POWER_IFACE = 'org.geckoOS.power';
export const NETWORK_SERVICE = 'network';
export const NETWORK_IFACE = 'org.geckoOS.network';

export const APPHOST_SERVICE = 'appHost';
export const APPHOST_IFACE = 'org.geckoOS.appHost';
export const APPHOST_SIGNALS = {
  starting: 'AppStarting',
  running: 'AppRunning',
  // Emitted when Nova SIGSTOPs a minimized app; resume goes back through `AppRunning`.
  suspended: 'AppSuspended',
  stopped: 'AppStopped',
  crashed: 'AppCrashed',
  surfaceMapped: 'AppSurfaceMapped',
  surfaceUnmapped: 'AppSurfaceUnmapped',
} as const;

function isNativeBridgeContext(): boolean {
  return (
    echoClient.isNative() ||
    (typeof location !== 'undefined' && location.protocol === 'pyxis:')
  );
}

function invokeEcho(
  native: boolean,
  service: string,
  iface: string,
  method: string,
  args: Record<string, unknown>
): Promise<unknown> {
  return native
    ? echoClient.callMethodStrict(service, iface, method, args)
    : echoClient.callMethod(service, iface, method, args);
}

/**
 * Launches `appId` via Nova, and when single-instance raised an existing
 * session, restores (before focusing) its mapped window via Evo or falls back
 * to `nova.Focus`. Fails loudly on native transport or capability denial.
 */
export async function launchApp(appId: string, params?: Record<string, unknown>): Promise<LaunchResult | null> {
  const native = isNativeBridgeContext();
  const res = (await invokeEcho(native, NOVA_SERVICE, NOVA_IFACE, 'Launch', {
    appId,
    params: params ?? null,
  })) as (LaunchResult & { error?: string }) | undefined;
  if (native && res?.error) {
    throw new Error(res.error);
  }
  if (!res || !res.sessionId) return null;
  if (res.raised) {
    let windowId =
      typeof res.windowId === 'number' && res.windowId > 0 ? res.windowId : undefined;
    if (windowId === undefined) {
      try {
        const running = (await invokeEcho(native, APPHOST_SERVICE, APPHOST_IFACE, 'ListRunningApps', {})) as
          | { sessions?: Array<{ sessionId?: string; surfaces?: number[] }> }
          | undefined;
        const match = running?.sessions?.find((s) => s.sessionId === res.sessionId);
        const surf = match?.surfaces?.[0];
        if (typeof surf === 'number' && surf > 0) {
          windowId = surf;
        }
      } catch {
        /* fall through to nova.Focus */
      }
    }
    if (windowId !== undefined) {
      let focused = false;
      try {
        await invokeEcho(native, EVO_SERVICE, EVO_IFACE, 'RestoreWindow', {
          window_id: windowId,
        });
      } catch {
        /* caller may lack windows:manage or window already unminimized */
      }
      try {
        await invokeEcho(native, EVO_SERVICE, EVO_IFACE, 'FocusWindow', {
          window_id: windowId,
        });
        focused = true;
      } catch {
        /* caller may lack windows:manage; fall back to nova.Focus */
      }
      if (!focused) {
        try {
          await invokeEcho(native, NOVA_SERVICE, NOVA_IFACE, 'Focus', { appId });
        } catch {
          /* no mapped window yet */
        }
      }
    } else {
      try {
        await invokeEcho(native, NOVA_SERVICE, NOVA_IFACE, 'Focus', { appId });
      } catch {
        /* no mapped window yet */
      }
    }
  }
  return res;
}

/** Closes every session of `appId` via Nova. */
export async function closeApp(appId: string): Promise<{ appId: string; sessionId: string | null }> {
  const res = (await echoClient.callMethod(NOVA_SERVICE, NOVA_IFACE, 'Close', {
    appId,
  })) as { appId: string; sessionId: string | null } | undefined;
  return res ?? { appId, sessionId: null };
}

/** Raises and focuses an already-running app's window via Nova. */
export async function focusApp(
  appId: string
): Promise<{ appId: string; sessionId: string; windowId: number } | null> {
  const res = (await echoClient.callMethod(NOVA_SERVICE, NOVA_IFACE, 'Focus', {
    appId,
  })) as { appId: string; sessionId: string; windowId: number } | undefined;
  return res && res.sessionId ? res : null;
}

/** Opens `url` in an independent vela browser window via Nova. */
export async function openExternalBrowser(
  url: string
): Promise<{ sessionId: string; appId: string; url: string } | null> {
  const native = isNativeBridgeContext();
  const res = (await invokeEcho(native, NOVA_SERVICE, NOVA_IFACE, 'OpenExternalBrowser', {
    url,
  })) as ({ sessionId: string; appId: string; url: string } & { error?: string }) | undefined;
  if (native && res?.error) {
    throw new Error(res.error);
  }
  return res && res.sessionId ? res : null;
}

/**
 * Fetches an app's icon via `nova.GetAppIcon` (data URI or URL) for cross-origin
 * third-party `.ipk` packages. Gracefully returns `null` in mock mode or when unavailable.
 */
export async function getAppIcon(appId: string): Promise<string | null> {
  if (!appId) return null;
  try {
    const res = (await echoClient.callMethod(NOVA_SERVICE, NOVA_IFACE, 'GetAppIcon', {
      appId,
    })) as
      | {
          icon?: string | null;
          dataUrl?: string | null;
          data?: string | null;
          mimeType?: string | null;
          error?: string;
        }
      | string
      | undefined;
    if (!res) return null;
    if (typeof res === 'string') return res.trim() || null;
    if (res.error) return null;
    if (typeof res.dataUrl === 'string' && res.dataUrl.trim()) return res.dataUrl;
    if (typeof res.icon === 'string' && res.icon.trim()) return res.icon;
    if (typeof res.data === 'string' && res.data.trim()) {
      const d = res.data.trim();
      if (
        d.startsWith('data:') ||
        d.startsWith('http://') ||
        d.startsWith('https://') ||
        d.startsWith('pyxis://')
      ) {
        return d;
      }
      const mime =
        typeof res.mimeType === 'string' && res.mimeType.trim() ? res.mimeType.trim() : 'image/png';
      return `data:${mime};base64,${d}`;
    }
    return null;
  } catch {
    return null;
  }
}

/** Null when the network service didn't answer (never a fabricated healthy connection). */
export async function getNetworkStatus(): Promise<NetworkStatus | null> {
  const res = (await echoClient.callMethod(NETWORK_SERVICE, NETWORK_IFACE, 'getStatus', {})) as
    | NetworkStatus
    | undefined;
  return res ?? null;
}

export async function getNetworkInterfaces(): Promise<NetworkInterfaceInfo[]> {
  try {
    const res = (await echoClient.callMethod(NETWORK_SERVICE, NETWORK_IFACE, 'getInterfaces', {})) as
      | { interfaces?: NetworkInterfaceInfo[] }
      | undefined;
    return Array.isArray(res?.interfaces) ? res.interfaces : [];
  } catch {
    return [];
  }
}

export async function getNetworkDetails(iface?: string): Promise<NetworkDetails> {
  const [ipRes, gwRes, dnsRes] = await Promise.all([
    echoClient
      .callMethod(NETWORK_SERVICE, NETWORK_IFACE, 'getIPAddress', iface ? { interface: iface } : {})
      .catch(() => undefined) as Promise<{ ipv4?: string } | undefined>,
    echoClient
      .callMethod(NETWORK_SERVICE, NETWORK_IFACE, 'getGateway', {})
      .catch(() => undefined) as Promise<{ ipv4?: string; gateway?: string } | undefined>,
    echoClient
      .callMethod(NETWORK_SERVICE, NETWORK_IFACE, 'getDNS', {})
      .catch(() => undefined) as Promise<{ nameservers?: string[] } | undefined>,
  ]);
  return {
    ipAddress: ipRes?.ipv4 ?? '',
    gateway: gwRes?.ipv4 ?? gwRes?.gateway ?? '',
    dns: Array.isArray(dnsRes?.nameservers) ? dnsRes.nameservers : [],
  };
}

export async function scanWifi(): Promise<WifiScanResult> {
  try {
    const res = (await echoClient.callMethod(NETWORK_SERVICE, NETWORK_IFACE, 'scanWifi', {})) as
      | Partial<WifiScanResult>
      | undefined;
    return {
      networks: Array.isArray(res?.networks) ? res.networks : [],
      wirelessAvailable: Boolean(res?.wirelessAvailable),
      interface: typeof res?.interface === 'string' ? res.interface : null,
    };
  } catch {
    return { networks: [], wirelessAvailable: false, interface: null };
  }
}

export async function connectWifi(
  ssid: string,
  password?: string,
  iface?: string
): Promise<{ success: boolean; ssid?: string; connected?: boolean; saved?: boolean; message?: string }> {
  const args: Record<string, unknown> = { ssid };
  if (password !== undefined && password !== '') args.password = password;
  if (iface) args.interface = iface;
  const res = (await echoClient.callMethod(NETWORK_SERVICE, NETWORK_IFACE, 'connectWifi', args)) as
    | { success: boolean; ssid?: string; connected?: boolean; saved?: boolean; message?: string }
    | undefined;
  return res ?? { success: false };
}

export async function disconnectWifi(iface?: string): Promise<{ success: boolean; connected?: boolean }> {
  const res = (await echoClient.callMethod(
    NETWORK_SERVICE,
    NETWORK_IFACE,
    'disconnectWifi',
    iface ? { interface: iface } : {}
  )) as { success: boolean; connected?: boolean } | undefined;
  return res ?? { success: false };
}

export async function setInterfaceEnabled(
  iface: string,
  enabled: boolean
): Promise<{ success: boolean; interface?: string; isUp?: boolean }> {
  const res = (await echoClient.callMethod(NETWORK_SERVICE, NETWORK_IFACE, 'setInterfaceEnabled', {
    interface: iface,
    enabled,
  })) as { success: boolean; interface?: string; isUp?: boolean } | undefined;
  return res ?? { success: false };
}

export async function setNetworkDns(nameservers: string[]): Promise<{ success: boolean; nameservers?: string[] }> {
  const res = (await echoClient.callMethod(NETWORK_SERVICE, NETWORK_IFACE, 'setDNS', {
    nameservers,
  })) as { success: boolean; nameservers?: string[] } | undefined;
  return res ?? { success: false };
}

export async function setSystemHostname(hostname: string): Promise<{ success: boolean; hostname?: string }> {
  const res = (await echoClient.callMethod(NETWORK_SERVICE, NETWORK_IFACE, 'setHostname', {
    hostname,
  })) as { success: boolean; hostname?: string } | undefined;
  return res ?? { success: false };
}

export async function getBatteryStatus(): Promise<BatteryStatus | null> {
  try {
    const res = (await echoClient.callMethod(POWER_SERVICE, POWER_IFACE, 'getBatteryStatus', {})) as
      | Partial<BatteryStatus>
      | undefined;
    if (!res || typeof res !== 'object') return null;
    const present = Boolean(res.present ?? res.available);
    const level =
      typeof res.level === 'number'
        ? res.level
        : typeof res.percentage === 'number'
        ? res.percentage
        : null;
    return {
      present,
      level,
      charging: Boolean(res.charging),
      available: res.available ?? present,
      percentage: res.percentage ?? (level ?? undefined),
      status: res.status,
    };
  } catch {
    return null;
  }
}

export async function getScreenBrightness(): Promise<ScreenBrightnessState | null> {
  try {
    const res = (await echoClient.callMethod(POWER_SERVICE, POWER_IFACE, 'getScreenBrightness', {})) as
      | Partial<ScreenBrightnessState>
      | undefined;
    if (!res || typeof res !== 'object') return null;
    return {
      brightness: typeof res.brightness === 'number' ? res.brightness : null,
      supported: Boolean(res.supported),
    };
  } catch {
    return null;
  }
}

export async function setScreenBrightness(
  brightness: number
): Promise<{ success: boolean; supported?: boolean; brightness?: number }> {
  const clamped = Math.round(Math.min(100, Math.max(0, brightness)));
  const res = (await echoClient.callMethod(POWER_SERVICE, POWER_IFACE, 'setScreenBrightness', {
    brightness: clamped,
  })) as { success: boolean; supported?: boolean; brightness?: number } | undefined;
  return res ?? { success: false };
}

export async function getStorageInfo(): Promise<StoragePartition[]> {
  try {
    const res = (await echoClient.callMethod('deviceInfo', 'org.geckoOS.deviceInfo', 'getStorageInfo', {})) as
      | {
          partitions?: Array<Partial<StoragePartition>>;
          total?: number;
          used?: number;
          available?: number;
          mount?: string;
        }
      | undefined;
    if (!res) return [];
    if (Array.isArray(res.partitions)) {
      return res.partitions.map((p) => ({
        device: p.device ?? 'system',
        mountPoint: p.mountPoint ?? '/',
        fsType: p.fsType ?? 'ext4',
        total: Number(p.total ?? 0),
        used: Number(p.used ?? 0),
        available: Number(p.available ?? 0),
      }));
    }
    if (typeof res.total === 'number') {
      return [
        {
          device: 'rootfs',
          mountPoint: res.mount ?? '/',
          fsType: 'system',
          total: res.total,
          used: Number(res.used ?? 0),
          available: Number(res.available ?? 0),
        },
      ];
    }
    return [];
  } catch {
    return [];
  }
}

export async function listSystemServices(): Promise<SystemServiceStatus[]> {
  try {
    const res = (await echoClient.callMethod('system', 'org.geckoOS.system', 'listServices', {})) as
      | { services?: Array<Partial<SystemServiceStatus>> }
      | undefined;
    if (!Array.isArray(res?.services)) return [];
    return res.services.map((s) => ({
      name: String(s.name ?? ''),
      destination: String(s.destination ?? ''),
      kind: String(s.kind ?? 'builtin'),
      reachable: Boolean(s.reachable),
    }));
  } catch {
    return [];
  }
}

/** Sends a power transition request (`sleep`, `reboot`, or `shutdown`). */
export async function powerCall(
  action: PowerAction,
  delay?: number
): Promise<{ success: boolean; supported?: boolean; action: string }> {
  const res = (await echoClient.callMethod(
    POWER_SERVICE,
    POWER_IFACE,
    action,
    delay !== undefined ? { delay } : {}
  )) as { success: boolean; supported?: boolean; action: string } | undefined;
  return res ?? { success: false, action };
}

/** Reads declared, revoked, and effective capabilities for one app or all apps via Nova. */
export async function getAppPermissions(appId?: string): Promise<AppPermissionInfo[]> {
  const res = (await echoClient.callMethod(
    NOVA_SERVICE,
    NOVA_IFACE,
    'GetPermissions',
    appId ? { appId } : {}
  )) as { apps?: AppPermissionInfo[] } | AppPermissionInfo | undefined;
  if (!res) return [];
  if (appId && 'id' in res) return [res];
  return 'apps' in res && Array.isArray(res.apps) ? res.apps : [];
}

/** Grants or revokes a declared capability for an app via Nova. */
export async function setAppPermission(
  appId: string,
  permission: string,
  granted: boolean
): Promise<AppPermissionInfo | null> {
  const res = (await echoClient.callMethod(NOVA_SERVICE, NOVA_IFACE, 'SetPermission', {
    appId,
    permission,
    granted,
  })) as (AppPermissionInfo & { error?: string }) | undefined;
  if (!res || res.error || !res.id) return null;
  return res;
}

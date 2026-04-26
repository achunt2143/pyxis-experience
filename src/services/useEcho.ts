import { useEffect, useMemo, useState } from 'react';
import echoClient from './EchoClient';

export interface BatteryStatus {
  level: number;
  charging: boolean;
}

export interface NetworkStatus {
  connected: boolean;
  ssid: string;
  type: string;
}

export interface AppListEntry {
  id: string;
  name: string;
  icon: string;
  running?: boolean;
  pid?: number;
}

export interface NotificationEntry {
  id: string;
  title: string;
  body: string;
  timestamp: number;
}

const APP_MGR_SERVICE = 'appmanager';
const APP_MGR_IFACE = 'com.geckoOS.AppManager';
const POWER_IFACE = 'com.geckoOS.Power';
const NETWORK_IFACE = 'com.geckoOS.Network';
const NOTIF_IFACE = 'com.geckoOS.Notifications';

/**
 * useEcho
 * --------
 * React hook wrapping EchoClient. Methods return Promises and never throw —
 * mock fallbacks are used when running in dev / browser context.
 */
export function useEcho() {
  return useMemo(
    () => ({
      isNative: () => echoClient.isNative(),

      async launchApp(appId: string): Promise<{ success: boolean; pid?: number }> {
        return echoClient.callMethod(APP_MGR_SERVICE, APP_MGR_IFACE, 'launch', {
          app_id: appId,
        });
      },

      async closeApp(appId: string) {
        return echoClient.callMethod(APP_MGR_SERVICE, APP_MGR_IFACE, 'close', {
          app_id: appId,
        });
      },

      async getAppList(): Promise<{ apps: AppListEntry[]; count: number }> {
        const res = await echoClient.callMethod(
          APP_MGR_SERVICE,
          APP_MGR_IFACE,
          'list',
          {}
        );
        return res ?? { apps: [], count: 0 };
      },

      async getBatteryLevel(): Promise<BatteryStatus> {
        const res = await echoClient.callMethod(
          'power',
          POWER_IFACE,
          'getBattery',
          {}
        );
        return res ?? { level: 87, charging: false };
      },

      async getNetworkStatus(): Promise<NetworkStatus> {
        const res = await echoClient.callMethod(
          'network',
          NETWORK_IFACE,
          'getStatus',
          {}
        );
        return res ?? { connected: true, ssid: 'GeckoNet', type: 'wifi' };
      },

      async getNotifications(): Promise<NotificationEntry[]> {
        const res = await echoClient.callMethod(
          'notifications',
          NOTIF_IFACE,
          'list',
          {}
        );
        return Array.isArray(res) ? res : (res?.notifications ?? []);
      },

      onSignal: echoClient.onSignal.bind(echoClient),
      emitSignal: echoClient.emitSignal.bind(echoClient),
    }),
    []
  );
}

/**
 * useBatteryStatus — convenience hook that polls battery level.
 */
export function useBatteryStatus(intervalMs = 30_000): BatteryStatus | null {
  const echo = useEcho();
  const [status, setStatus] = useState<BatteryStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      const s = await echo.getBatteryLevel();
      if (mounted) setStatus(s);
    };
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [echo, intervalMs]);

  return status;
}

/**
 * useNetworkStatus — convenience hook that polls network connectivity.
 */
export function useNetworkStatus(intervalMs = 30_000): NetworkStatus | null {
  const echo = useEcho();
  const [status, setStatus] = useState<NetworkStatus | null>(null);

  useEffect(() => {
    let mounted = true;
    const tick = async () => {
      const s = await echo.getNetworkStatus();
      if (mounted) setStatus(s);
    };
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [echo, intervalMs]);

  return status;
}

export default useEcho;

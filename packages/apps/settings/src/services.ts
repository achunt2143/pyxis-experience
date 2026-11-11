/**
 * The few Echo calls Settings makes that the SDK offers only inside `useEcho()` (a hook,
 * which a Duyo kind cannot call). Same service, interface, method and answer handling as
 * `useEcho`'s `sleep`/`reboot`/`shutdown`/`getNetworkStatus`. (SDK need: export them.)
 */
import { echoClient, type NetworkStatus } from '@pyxis/app-sdk';

const POWER_IFACE = 'org.geckoOS.power';
const NETWORK_IFACE = 'org.geckoOS.network';

export type PowerAction = 'sleep' | 'reboot' | 'shutdown';

export async function powerCall(action: PowerAction): Promise<{ success: boolean; action: string }> {
  const res = (await echoClient.callMethod('power', POWER_IFACE, action, {})) as
    | { success: boolean; action: string }
    | undefined;
  return res ?? { success: false, action };
}

/** Null when the network service didn't answer (never a made-up healthy connection). */
export async function getNetworkStatus(): Promise<NetworkStatus | null> {
  const res = (await echoClient.callMethod('network', NETWORK_IFACE, 'getStatus', {})) as NetworkStatus | undefined;
  return res ?? null;
}

import { NOVA_IFACE, echoClient } from '@pyxis/app-sdk';

/**
 * `useEcho().launchApp` without the hook (a kind's code-behind can't call hooks): the same
 * Nova `Launch`, and the same follow-up `Focus` when Nova only raised an existing session.
 * Answers whether Nova returned a session.
 */
export async function launchApp(appId: string): Promise<boolean> {
  const res = (await echoClient.callMethod('nova', NOVA_IFACE, 'Launch', { appId, params: null })) as
    | { sessionId?: string; raised?: boolean }
    | undefined;
  if (!res || !res.sessionId) return false;
  if (res.raised) {
    try {
      await echoClient.callMethod('nova', NOVA_IFACE, 'Focus', { appId });
    } catch {
      /* no mapped window yet */
    }
  }
  return true;
}

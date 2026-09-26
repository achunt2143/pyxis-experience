/**
 * Notifications: apps raise them, and the shell shows them.
 *
 * `showNotification` is the app side. The app must declare the
 * `notifications` permission. The vela bridge stamps the caller's app id onto
 * every notification, so the centre can always show who raised it, and an
 * app cannot post as another.
 *
 * Everything else here is the notification centre's side: `list`, dismiss,
 * clear, and the two signals. Listing returns every app's notifications,
 * text included, so these need `notifications:manage`. That is a privileged
 * capability, which only the shell holds.
 *
 * The backing store is echo's `org.geckoOS.notification`
 * (echo/src/services/notification.rs). It signals every change, so a view
 * never has to poll.
 */
import { echoClient } from './EchoClient';

export const NOTIFICATION_IFACE = 'org.geckoOS.notification';
const NOTIFICATION_SERVICE = 'notification';

export const NOTIFICATION_SIGNALS = {
  /** `{ notification: NotificationEntry }` */
  shown: 'NotificationShown',
  /** `{ notificationId: string }`, one per dismissed entry, `closeAll` included. */
  closed: 'NotificationClosed',
} as const;

export type NotificationUrgency = 'low' | 'normal' | 'critical';

export interface NotificationOptions {
  body?: string;
  urgency?: NotificationUrgency;
  /** How long the toast stays up, in ms. 0 keeps it until dismissed, and
   *  critical notifications always stay. The service caps it at 60 s. */
  timeout?: number;
  icon?: string;
}

export interface NotificationEntry {
  id: string;
  title: string;
  body: string;
  /** ms since the epoch, like `Date.now()`. */
  timestamp: number;
  urgency?: NotificationUrgency;
  timeout?: number;
  /** Stamped by the bridge. null when a non-app Echo client (a daemon,
   *  echo-cli) raised it. */
  appId?: string | null;
  icon?: string | null;
}

/** Raise a notification. Resolves to its id, or null if the call failed. */
export async function showNotification(
  title: string,
  options: NotificationOptions = {}
): Promise<string | null> {
  const res = (await echoClient.callMethod(NOTIFICATION_SERVICE, NOTIFICATION_IFACE, 'show', {
    title,
    options,
  })) as { notificationId?: string } | undefined;
  return res?.notificationId ?? null;
}

/** The centre's history, newest first. */
export async function listNotifications(): Promise<NotificationEntry[]> {
  const res = (await echoClient.callMethod(NOTIFICATION_SERVICE, NOTIFICATION_IFACE, 'list', {})) as
    | { notifications?: NotificationEntry[] }
    | undefined;
  return res?.notifications ?? [];
}

/** Dismiss one notification. False if it was already gone. */
export async function dismissNotification(id: string): Promise<boolean> {
  const res = (await echoClient.callMethod(NOTIFICATION_SERVICE, NOTIFICATION_IFACE, 'close', {
    notificationId: id,
  })) as { success?: boolean } | undefined;
  return res?.success ?? false;
}

/** Dismiss every notification, and resolve to how many there were. */
export async function clearNotifications(): Promise<number> {
  const res = (await echoClient.callMethod(NOTIFICATION_SERVICE, NOTIFICATION_IFACE, 'closeAll', {})) as
    | { closed?: number }
    | undefined;
  return res?.closed ?? 0;
}

export function onNotificationShown(callback: (notification: NotificationEntry) => void): () => void {
  return echoClient.onSignal(NOTIFICATION_IFACE, NOTIFICATION_SIGNALS.shown, (data) => {
    const notification = (data as { notification?: NotificationEntry } | undefined)?.notification;
    if (notification) callback(notification);
  });
}

export function onNotificationClosed(callback: (id: string) => void): () => void {
  return echoClient.onSignal(NOTIFICATION_IFACE, NOTIFICATION_SIGNALS.closed, (data) => {
    const id = (data as { notificationId?: string } | undefined)?.notificationId;
    if (id) callback(id);
  });
}

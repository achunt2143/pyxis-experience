import { useCallback, useEffect, useState } from 'react';
import {
  clearNotifications,
  dismissNotification,
  listNotifications,
  onNotificationClosed,
  onNotificationShown,
  type NotificationEntry,
} from '@pyxis/app-sdk';

/**
 * The notification centre's history: loaded once, then kept in step by the
 * store's own signals, so it never polls. It also catches a dismissal made
 * somewhere else, such as a toast's X or another view of the centre.
 *
 * Desktop owns the one instance and hands it to the Bell badge and the
 * centre, so the two cannot disagree about the count.
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);

  useEffect(() => {
    let mounted = true;
    void listNotifications().then((list) => {
      if (mounted) setNotifications(list);
    });
    const offShown = onNotificationShown((shown) =>
      setNotifications((prev) => [shown, ...prev.filter((n) => n.id !== shown.id)])
    );
    const offClosed = onNotificationClosed((id) =>
      setNotifications((prev) => prev.filter((n) => n.id !== id))
    );
    return () => {
      mounted = false;
      offShown();
      offClosed();
    };
  }, []);

  // The Closed signal removes the entry, but drop it here too once the store
  // agrees. A dismissal should not wait on a signal round trip to disappear.
  const dismiss = useCallback(async (id: string) => {
    if (await dismissNotification(id)) {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }
  }, []);

  // Re-read rather than assume the store is now empty. If the clear was
  // refused (a shell without notifications:manage), the centre should keep
  // showing what is really there.
  const clearAll = useCallback(async () => {
    await clearNotifications();
    setNotifications(await listNotifications());
  }, []);

  return { notifications, dismiss, clearAll };
}

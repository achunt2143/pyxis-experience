import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FloatingPanel } from 'remochi';
import { Bell, X } from 'lucide-react';
import {
  dismissNotification,
  onNotificationClosed,
  onNotificationShown,
  useBooleanSetting,
  usePyxisTheme,
  SETTING_KEYS,
  type NotificationEntry,
} from '@pyxis/app-sdk';

/** More than this and the oldest toast makes way; all of them stay in the centre. */
const MAX_TOASTS = 3;

/**
 * Toasts for notifications as they are raised, top-right under the top bar.
 *
 * A toast is a transient view of a notification, not the notification
 * itself. When one times out or is clicked away, it stays in the centre.
 * Only its X dismisses it, from the centre too. Do Not Disturb holds back
 * every toast except critical ones, which the user asked to be interrupted
 * for. The notifications still land in the centre.
 *
 * Desktop unmounts this while the notification centre is open. The centre
 * shows everything already, and a sticky toast would sit over its header.
 * Unmounting also drops the toasts, so the ones the user saw in the centre
 * do not pop back up when it closes.
 *
 * Known limit: this draws inside Bloom, and Evo stacks Bloom beneath every
 * app window. An app covering this corner hides the toast.
 */
export const NotificationToasts: React.FC = () => {
  const [toasts, setToasts] = useState<NotificationEntry[]>([]);
  const dnd = useBooleanSetting(SETTING_KEYS.dnd, false);
  // Read by the subscription below, which is set up once. A ref, so that
  // toggling Do Not Disturb doesn't tear down and redo the subscription.
  const dndRef = useRef(dnd);
  useEffect(() => {
    dndRef.current = dnd;
  }, [dnd]);

  useEffect(() => {
    const offShown = onNotificationShown((notification) => {
      if (dndRef.current && notification.urgency !== 'critical') return;
      setToasts((prev) => [notification, ...prev].slice(0, MAX_TOASTS));
    });
    const offClosed = onNotificationClosed((id) =>
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    );
    return () => {
      offShown();
      offClosed();
    };
  }, []);

  const hide = useCallback(
    (id: string) => setToasts((prev) => prev.filter((toast) => toast.id !== id)),
    []
  );

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 62,
        right: 16,
        width: 340,
        maxWidth: 'calc(100vw - 32px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        // Beneath the panels' click-away backdrop (1299) and the panels
        // themselves (1300). An open panel wins over a toast, and a sticky
        // toast can never sit on top of quick settings.
        zIndex: 1250,
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <Toast key={toast.id} notification={toast} onHide={hide} />
        ))}
      </AnimatePresence>
    </div>
  );
};

const Toast: React.FC<{ notification: NotificationEntry; onHide: (id: string) => void }> = ({
  notification,
  onHide,
}) => {
  const theme = usePyxisTheme('light');
  const critical = notification.urgency === 'critical';
  const { id, timeout } = notification;

  // A timeout of 0 (and every critical notification) means stay until
  // dismissed. The store already caps the rest at 60 s. `onHide` is stable
  // (useCallback above), so a new toast arriving does not restart this one's
  // clock.
  useEffect(() => {
    if (!timeout) return;
    const timer = window.setTimeout(() => onHide(id), timeout);
    return () => window.clearTimeout(timer);
  }, [id, timeout, onHide]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.18 } }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => onHide(id)}
      role="status"
      data-notification-id={notification.id}
      style={{
        pointerEvents: 'auto',
        cursor: 'default',
        borderRadius: 14,
        boxShadow: '0 12px 30px rgba(0,0,0,0.24)',
        outline: critical ? '2px solid var(--color-error, #e53935)' : undefined,
      }}
    >
      <FloatingPanel style={theme === 'dark' ? 'shadow' : 'default'}>
        <div style={{ display: 'flex', gap: 10, padding: '12px 12px 12px 14px', color: 'var(--color-text)' }}>
          <Bell size={16} style={{ flex: 'none', marginTop: 2, color: 'var(--color-primary)' }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {notification.appId && (
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', marginBottom: 2 }}>
                {notification.appId}
              </div>
            )}
            <div style={{ fontWeight: 600, fontSize: '0.85rem', overflowWrap: 'anywhere' }}>
              {notification.title}
            </div>
            {notification.body && (
              <div
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--color-text-secondary)',
                  marginTop: 2,
                  overflowWrap: 'anywhere',
                }}
              >
                {notification.body}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={(event) => {
              event.stopPropagation();
              void dismissNotification(id);
              onHide(id);
            }}
            style={{
              flex: 'none',
              alignSelf: 'flex-start',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
              padding: 2,
              display: 'flex',
            }}
          >
            <X size={14} />
          </button>
        </div>
      </FloatingPanel>
    </motion.div>
  );
};

export default NotificationToasts;

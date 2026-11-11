import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FloatingPanel } from 'remochi';
import { Bell, X } from 'lucide-react';
import {
  dismissNotification,
  onNotificationClosed,
  onNotificationShown,
  useSetting,
  asBoolean,
  usePyxisTheme,
  SETTING_KEYS,
  type NotificationEntry,
} from '@pyxis/app-sdk';
import { useOverlayRegion } from '../overlay/useOverlayRegion';
import { useMotion } from '../useMotion';
import { TRANSITION } from '../motion';

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
 * On a device this runs in the overlay window (src/overlay/OverlayApp.tsx),
 * which Evo keeps above app windows, so no app can hide a toast. There,
 * `reportRegion` tells Evo where the toasts are, which is the only part of
 * the overlay that takes clicks. The desktop draws the toasts itself only
 * when no overlay is running (the browser dev server, or an overlay that
 * failed to open), and then they sit beneath app windows like the rest of
 * the desktop.
 *
 * Toasts are hidden while the notification centre or quick settings is
 * open. The centre shows everything already, and a toast would sit over
 * either panel. Hiding them also drops them, so the ones the user saw in the
 * centre do not pop back up when it closes.
 */
export const NotificationToasts: React.FC<{ reportRegion?: boolean }> = ({ reportRegion = false }) => {
  const [toasts, setToasts] = useState<NotificationEntry[]>([]);
  const dnd = useSetting(SETTING_KEYS.dnd, false, asBoolean);
  const stackRef = useRef<HTMLDivElement>(null);
  useOverlayRegion(stackRef, reportRegion);
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
      ref={stackRef}
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
  const { tr, to } = useMotion();
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
      initial={to({ opacity: 0, x: 40, scale: 0.97 })}
      animate={{ ...to({ opacity: 1, x: 0, scale: 1 }), transition: tr(TRANSITION.open) }}
      exit={{ ...to({ opacity: 0, x: 40, scale: 0.97 }), transition: tr(TRANSITION.close) }}
      onClick={() => onHide(id)}
      role="status"
      data-notification-id={notification.id}
      style={{
        pointerEvents: 'auto',
        cursor: 'pointer',
        borderRadius: 14,
        boxShadow: '0 14px 34px rgba(0, 0, 0, 0.22)',
        outline: critical ? '2px solid var(--color-error, #ef4444)' : undefined,
      }}
    >
      <FloatingPanel style={theme === 'dark' ? 'shadow' : 'default'}>
        <div
          style={{
            display: 'flex',
            gap: 10,
            padding: '12px 14px',
            color: 'var(--color-text)',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: '12px 3px 12px 12px',
              background: critical ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.12)',
              color: critical ? 'var(--color-error, #ef4444)' : 'var(--color-primary, #3b82f6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Bell size={16} />
          </div>

          <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
            {notification.appId && (
              <div
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  color: 'var(--color-text-secondary, #6b7280)',
                  letterSpacing: '0.04em',
                  marginBottom: 2,
                }}
              >
                {notification.appId}
              </div>
            )}
            <div style={{ fontWeight: 600, fontSize: '0.85rem', overflowWrap: 'anywhere', lineHeight: 1.3 }}>
              {notification.title}
            </div>
            {notification.body && (
              <div
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--color-text-secondary)',
                  marginTop: 2,
                  overflowWrap: 'anywhere',
                  lineHeight: 1.35,
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
              position: 'absolute',
              top: 8,
              right: 8,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
              padding: 4,
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.6,
              transition: 'opacity 0.12s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = '1';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.opacity = '0.6';
            }}
          >
            <X size={13} />
          </button>
        </div>
      </FloatingPanel>
    </motion.div>
  );
};

export default NotificationToasts;

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, X } from 'lucide-react';
import {
  dismissNotification,
  onNotificationClosed,
  onNotificationShown,
  useSetting,
  asBoolean,
  SETTING_KEYS,
  type NotificationEntry,
} from '@pyxis/app-sdk';
import { useOverlayRegion } from '../overlay/useOverlayRegion';
import { useMotion } from '../useMotion';
import { TRANSITION } from '../motion';
import { AppDropIcon } from './AppDropIcon';
import { useAppName } from '../hooks/useAppName';
import { notificationAnchor, useLaunchBarPosition } from './launchBarState';

/** More than this and the oldest toast makes way; all of them stay in the centre. */
const MAX_TOASTS = 3;

/** The launch bar's height: it is flush to the bottom edge, full width. */
export { LAUNCH_BAR_HEIGHT } from './launchBarState';

/** Where notifications come out of (see launchBarState: `DASHBOARD_ANCHOR`, `RAIL_ANCHOR`). */
export { DASHBOARD_ANCHOR, RAIL_ANCHOR } from './launchBarState';

/**
 * Toasts for notifications as they are raised, rising out of the launch
 * bar's dashboard at the bottom right (webOS's dashboard, not a bell top
 * right), or at the bottom left, beside the rail, when the launch bar is one.
 * The newest sits lowest, nearest the dashboard; older ones are pushed up.
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
export const NotificationToasts: React.FC<{
  reportRegion?: boolean;
  /** Keep active alerts mounted (pausing timers & hiding visually) while an unrelated overlay like Quick Settings is open. */
  hidden?: boolean;
  /** Clear active toasts when Notification Center itself opens so seen alerts don't pop back up on close. */
  clearOnHidden?: boolean;
}> = ({ reportRegion = false, hidden = false, clearOnHidden = false }) => {
  const [toasts, setToasts] = useState<NotificationEntry[]>([]);
  const dnd = useSetting(SETTING_KEYS.dnd, false, asBoolean);
  const rail = useLaunchBarPosition() === 'left';
  const anchor = notificationAnchor(rail);
  const stackRef = useRef<HTMLDivElement>(null);
  useOverlayRegion(stackRef, reportRegion && !hidden);

  const [prevClearOnHidden, setPrevClearOnHidden] = useState(clearOnHidden);
  if (prevClearOnHidden !== clearOnHidden) {
    setPrevClearOnHidden(clearOnHidden);
    if (clearOnHidden && toasts.length > 0) {
      setToasts([]);
    }
  }

  // Read by the subscription below, which is set up once. A ref, so that
  // toggling Do Not Disturb doesn't tear down and redo the subscription.
  const dndRef = useRef(dnd);
  const clearOnHiddenRef = useRef(clearOnHidden);
  useEffect(() => {
    dndRef.current = dnd;
  }, [dnd]);
  useEffect(() => {
    clearOnHiddenRef.current = clearOnHidden;
  }, [clearOnHidden]);

  useEffect(() => {
    const offShown = onNotificationShown((notification) => {
      if (clearOnHiddenRef.current) return;
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
      aria-hidden={hidden || undefined}
      data-toasts={rail ? 'rail' : 'bar'}
      data-toasts-hidden={hidden ? 'true' : 'false'}
      style={{
        position: 'fixed',
        ...anchor.style,
        width: 340,
        maxWidth: `calc(100vw - ${anchor.side + 12}px)`,
        maxHeight: rail ? 'calc(100vh - 60px)' : 'calc(100vh - 120px)',
        overflow: 'hidden',
        display: 'flex',
        // Newest first in the list, drawn lowest: the stack grows upward.
        flexDirection: 'column-reverse',
        gap: 8,
        // Beneath the panels' click-away backdrop (1299) and the panels
        // themselves (1300). An open panel wins over a toast, and a sticky
        // toast can never sit on top of quick settings.
        zIndex: 1250,
        pointerEvents: 'none',
        visibility: hidden ? 'hidden' : 'visible',
        opacity: hidden ? 0 : 1,
      }}
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <Toast key={toast.id} notification={toast} onHide={hide} rail={rail} hidden={hidden} />
        ))}
      </AnimatePresence>
    </div>
  );
};

const Toast: React.FC<{
  notification: NotificationEntry;
  onHide: (id: string) => void;
  rail: boolean;
  hidden: boolean;
}> = ({ notification, onHide, rail, hidden }) => {
  const { tr, to } = useMotion();
  const appName = useAppName(notification.appId);
  const critical = notification.urgency === 'critical';
  const { id, timeout } = notification;

  // A timeout of 0 (and every critical notification) means stay until
  // dismissed. The store already caps the rest at 60 s. `onHide` is stable
  // (useCallback above), so a new toast arriving does not restart this one's
  // clock. Pause timers while hidden behind Quick Settings.
  useEffect(() => {
    if (!timeout || hidden) return;
    const timer = window.setTimeout(() => onHide(id), timeout);
    return () => window.clearTimeout(timer);
  }, [id, timeout, hidden, onHide]);

  return (
    <motion.div
      layout
      // Rises out of the dashboard, and sinks back into it (slides out of
      // the rail, and back, when the bar is one).
      initial={to({ opacity: 0, ...(rail ? { x: -28 } : { y: 28 }), scale: 0.96 })}
      animate={{ ...to({ opacity: 1, x: 0, y: 0, scale: 1 }), transition: tr(TRANSITION.open) }}
      exit={{ ...to({ opacity: 0, ...(rail ? { x: -18 } : { y: 18 }), scale: 0.97 }), transition: tr(TRANSITION.close) }}
      onClick={() => onHide(id)}
      role="status"
      data-notification-id={notification.id}
      style={{
        pointerEvents: hidden ? 'none' : 'auto',
        cursor: 'pointer',
        transformOrigin: rail ? 'bottom left' : 'bottom right',
        position: 'relative',
        display: 'flex',
        gap: 10,
        padding: '12px 14px',
        maxHeight: 160,
        overflow: 'hidden',
        borderRadius: 'var(--px-corner)',
        background: 'var(--px-material-strong)',
        color: 'var(--px-material-ink)',
        fontFamily: 'var(--px-font-ui)',
        boxShadow: critical
          ? '0 14px 34px rgba(0, 0, 0, 0.24), inset 0 0 0 2px var(--px-spinner-red)'
          : '0 14px 34px rgba(0, 0, 0, 0.22), inset 0 0 0 1px color-mix(in srgb, var(--px-material-ink) 10%, transparent)',
      }}
    >
      <AppDropIcon appId={notification.appId} critical={critical} fallback={Bell} />

      <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
        <div
          style={{
            fontSize: 11,
            color: 'var(--px-material-ink-quiet)',
            marginBottom: 1,
          }}
        >
          {appName}
        </div>
        <div
          style={{
            fontFamily: "'Mochi Bold', var(--px-font-ui)",
            fontWeight: 700,
            fontSize: 13.5,
            overflowWrap: 'anywhere',
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {notification.title}
        </div>
        {notification.body && (
          <div
            style={{
              fontSize: 12.5,
              color: 'var(--px-material-ink-quiet)',
              marginTop: 2,
              overflowWrap: 'anywhere',
              lineHeight: 1.35,
              display: '-webkit-box',
              WebkitLineClamp: 4,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
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
          color: 'var(--px-material-ink-quiet)',
          padding: 4,
          borderRadius: 'var(--px-corner-20)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 0.7,
          transition: 'opacity 0.12s ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.opacity = '1';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.opacity = '0.7';
        }}
      >
        <X size={13} />
      </button>
    </motion.div>
  );
};

export default NotificationToasts;

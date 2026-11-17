import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CheckCircle2, Trash2, X } from 'lucide-react';
import { type NotificationEntry } from '@pyxis/app-sdk';
import { useMotion } from '../useMotion';
import { PANEL_ENTER, PANEL_REST, SCRIM_IN, SCRIM_OUT, TRANSITION } from '../motion';
import { AppDropIcon } from './AppDropIcon';
import { useAppName } from '../hooks/useAppName';
import { notificationAnchor, useLaunchBarPosition } from './launchBarState';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface NotificationCenterProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  notifications: NotificationEntry[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
}

function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** The panel rises from below: it starts lower and settles up. */
const RISE_FROM = { ...PANEL_ENTER, y: 10 };

/**
 * The notification centre, opening upward out of the launch bar's dashboard
 * at the bottom right (webOS's dashboard), where the toasts rise from too
 * (`DASHBOARD_ANCHOR`); beside the rail at the bottom left when the launch
 * bar is one (`RAIL_ANCHOR`). The shell decides when it opens; the dashboard's
 * button toggles it.
 *
 * Drawn in the strong material with the waterdrop corner; each notification
 * is a waterdrop row with its app's waterdrop icon and name. Its X dismisses
 * it from the store; "Clear all" dismisses every one.
 *
 * In the overlay, an open panel makes the shell take the whole screen's
 * clicks (ShellLayer's full-screen region), so the scrim can catch the click
 * that closes it.
 */
export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onOpenChange,
  notifications,
  onDismiss,
  onClearAll,
}) => {
  const { tr, to } = useMotion();
  const rail = useLaunchBarPosition() === 'left';
  const anchor = notificationAnchor(rail);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? panel).focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      const prev = previousFocusRef.current;
      previousFocusRef.current = null;
      if (prev && prev.isConnected) {
        prev.focus();
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onOpenChange(false);
        return;
      }
      if (e.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const focusables = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
          (el) => el.offsetParent !== null || el === document.activeElement
        );
        if (focusables.length === 0) {
          e.preventDefault();
          e.stopPropagation();
          panel.focus();
          return;
        }
        const at = focusables.indexOf(document.activeElement as HTMLElement);
        const next = e.shiftKey
          ? at <= 0
            ? focusables.length - 1
            : at - 1
          : at === focusables.length - 1
            ? 0
            : at + 1;
        e.preventDefault();
        e.stopPropagation();
        focusables[next]?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onOpenChange]);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            data-notification-scrim=""
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: tr(SCRIM_IN) }}
            exit={{ opacity: 0, transition: tr(SCRIM_OUT) }}
            onClick={isOpen ? () => onOpenChange(false) : undefined}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1299,
              background: 'rgba(0, 0, 0, 0.16)',
              pointerEvents: isOpen ? 'auto' : 'none',
            }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            tabIndex={-1}
            data-notification-centre={rail ? 'rail' : 'bar'}
            initial={to(RISE_FROM)}
            animate={{ ...to(PANEL_REST), transition: tr(TRANSITION.open) }}
            exit={{ ...to(RISE_FROM), transition: tr(TRANSITION.close) }}
            style={{
              position: 'fixed',
              ...anchor.style,
              width: 360,
              maxWidth: `calc(100vw - ${anchor.side + 12}px)`,
              // Clear of the status strip (36) with a little air.
              maxHeight: `calc(100vh - ${anchor.style.bottom + 52}px)`,
              overflowY: 'auto',
              boxSizing: 'border-box',
              zIndex: 1300,
              pointerEvents: isOpen ? 'auto' : 'none',
              transformOrigin: anchor.origin,
              padding: 16,
              borderRadius: 'var(--px-corner)',
              background: 'var(--px-material-strong)',
              color: 'var(--px-material-ink)',
              fontFamily: 'var(--px-font-ui)',
              boxShadow:
                '0 -10px 50px rgba(0, 0, 0, 0.28), inset 0 0 0 1px color-mix(in srgb, var(--px-material-ink) 10%, transparent)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <h2
                  data-notification-head=""
                  style={{
                    margin: 0,
                    fontFamily: 'var(--px-font-display)',
                    fontWeight: 300,
                    fontSize: 14,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                  }}
                >
                  Notifications
                </h2>
                {notifications.length > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--px-material-ink-quiet)' }}>
                    {notifications.length}
                  </span>
                )}
              </div>

              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={onClearAll}
                  style={{
                    background: 'color-mix(in srgb, var(--px-material-ink) 7%, transparent)',
                    border: 'none',
                    borderRadius: 'var(--px-corner-20)',
                    color: 'var(--px-material-ink-quiet)',
                    cursor: 'pointer',
                    font: 'inherit',
                    fontSize: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 9px',
                  }}
                >
                  <Trash2 size={12} />
                  <span>Clear all</span>
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div
                style={{
                  padding: '28px 16px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 'var(--px-corner-40)',
                    background: 'color-mix(in srgb, var(--px-material-ink) 7%, transparent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CheckCircle2 size={22} />
                </div>
                <div
                  style={{
                    fontFamily: 'var(--px-font-accent)',
                    fontWeight: 700,
                    fontStyle: 'italic',
                    fontSize: 15,
                  }}
                >
                  All caught up
                </div>
                <div style={{ fontSize: 12, color: 'var(--px-material-ink-quiet)' }}>
                  No new notifications right now.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {notifications.map((notification) => (
                  <NotificationRow key={notification.id} notification={notification} onDismiss={onDismiss} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const NotificationRow: React.FC<{ notification: NotificationEntry; onDismiss: (id: string) => void }> = ({
  notification,
  onDismiss,
}) => {
  const critical = notification.urgency === 'critical';
  const appName = useAppName(notification.appId);

  return (
    <div
      data-notification-id={notification.id}
      style={{
        position: 'relative',
        display: 'flex',
        gap: 10,
        padding: 10,
        borderRadius: 'var(--px-corner-40)',
        background: 'color-mix(in srgb, var(--px-material-ink) 6%, transparent)',
        boxShadow: critical ? 'inset 0 0 0 1.5px var(--px-spinner-red)' : undefined,
      }}
    >
      <AppDropIcon appId={notification.appId} critical={critical} fallback={Bell} />

      <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
        <div style={{ fontFamily: "'Mochi Bold', var(--px-font-ui)", fontWeight: 700, fontSize: 13, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
          {notification.title}
        </div>
        {notification.body && (
          <div style={{ fontSize: 12.5, lineHeight: 1.35, overflowWrap: 'anywhere', marginTop: 1 }}>
            {notification.body}
          </div>
        )}
        <div style={{ fontSize: 11.5, color: 'var(--px-material-ink-quiet)', marginTop: 2 }}>
          {appName} · {formatRelativeTime(notification.timestamp)}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onDismiss(notification.id)}
        title="Dismiss notification"
        aria-label={`Dismiss ${notification.title}`}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--px-material-ink-quiet)',
          padding: 3,
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
    </div>
  );
};

export default NotificationCenter;

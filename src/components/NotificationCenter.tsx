import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Badge, FloatingPanel } from 'remochi';
import { Bell, CheckCircle2, Trash2, X } from 'lucide-react';
import { usePyxisTheme, type NotificationEntry } from '@pyxis/app-sdk';
import { useMotion } from '../useMotion';
import { PANEL_ENTER, PANEL_REST, SCRIM_IN, SCRIM_OUT, TRANSITION } from '../motion';

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

/**
 * NotificationCenter — Palm webOS Notification Dashboard.
 *
 * Implements Palm's non-intrusive notification architecture:
 * - Clear grouped list with relative timestamps
 * - App-badged squircle notification cards
 * - One-tap swipe/click dismissal and batch clear
 * - Peaceful "All caught up" empty state
 */
export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onOpenChange,
  notifications,
  onDismiss,
  onClearAll,
}) => {
  const { tr, to } = useMotion();
  const theme = usePyxisTheme('light');

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onOpenChange]);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: tr(SCRIM_IN) }}
            exit={{ opacity: 0, transition: tr(SCRIM_OUT) }}
            onClick={() => onOpenChange(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1299,
              background: 'rgba(0, 0, 0, 0.22)',
              backdropFilter: 'blur(2px)',
            }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="dialog"
            aria-label="Notifications"
            initial={to({ ...PANEL_ENTER, y: -8 })}
            animate={{ ...to(PANEL_REST), transition: tr(TRANSITION.open) }}
            exit={{ ...to({ ...PANEL_ENTER, y: -8 }), transition: tr(TRANSITION.close) }}
            style={{
              position: 'fixed',
              top: 52,
              right: 14,
              width: 360,
              maxWidth: 'calc(100vw - 28px)',
              maxHeight: 'calc(100vh - 72px)',
              overflowY: 'auto',
              zIndex: 1300,
              transformOrigin: 'top right',
              boxShadow: '0 18px 42px rgba(0, 0, 0, 0.28)',
              borderRadius: 18,
            }}
          >
            <FloatingPanel style={theme === 'dark' ? 'shadow' : 'default'}>
              <div style={{ padding: '16px', color: 'var(--color-text)' }}>
                {/* Header with Notification count and Clear All */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingBottom: '12px',
                    borderBottom: '1px solid var(--color-border-light, rgba(0, 0, 0, 0.08))',
                    marginBottom: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, letterSpacing: '-0.01em' }}>
                      Notifications
                    </span>
                    {notifications.length > 0 && (
                      <Badge
                        content={notifications.length}
                        background="var(--color-primary, #3b82f6)"
                        color="#fff"
                      />
                    )}
                  </div>

                  {notifications.length > 0 && (
                    <button
                      type="button"
                      onClick={onClearAll}
                      style={{
                        background: 'var(--mochi-hover, rgba(0, 0, 0, 0.05))',
                        border: '1px solid var(--color-border-light, rgba(0, 0, 0, 0.06))',
                        borderRadius: 8,
                        color: 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '4px 8px',
                        transition: 'all 0.12s ease',
                      }}
                    >
                      <Trash2 size={12} />
                      <span>Clear all</span>
                    </button>
                  )}
                </div>

                {/* Notifications List or Empty State */}
                {notifications.length === 0 ? (
                  <div
                    style={{
                      padding: '36px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '20px 4px 20px 20px',
                        background: 'rgba(76, 175, 80, 0.12)',
                        color: 'var(--color-success, #4caf50)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <CheckCircle2 size={24} />
                    </div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text)' }}>
                      All caught up
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                      No new notifications right now.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {notifications.map((notification) => {
                      const isCritical = notification.urgency === 'critical';
                      return (
                        <div
                          key={notification.id}
                          style={{
                            background: 'var(--color-surface, rgba(255, 255, 255, 0.65))',
                            border: `1px solid ${
                              isCritical
                                ? 'rgba(239, 68, 68, 0.4)'
                                : 'var(--color-border-light, rgba(0, 0, 0, 0.08))'
                            }`,
                            borderRadius: 12,
                            padding: '10px 12px',
                            display: 'flex',
                            gap: 10,
                            position: 'relative',
                            transition: 'background 0.12s ease',
                          }}
                        >
                          <div
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: '12px 3px 12px 12px',
                              background: isCritical
                                ? 'rgba(239, 68, 68, 0.15)'
                                : 'rgba(59, 130, 246, 0.12)',
                              color: isCritical
                                ? 'var(--color-error, #ef4444)'
                                : 'var(--color-primary, #3b82f6)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <Bell size={15} />
                          </div>

                          <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 6,
                                marginBottom: 2,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  textTransform: 'uppercase',
                                  color: 'var(--color-text-secondary, #6b7280)',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                {notification.appId || 'System'}
                              </span>
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  color: 'var(--color-text-secondary)',
                                  opacity: 0.8,
                                }}
                              >
                                {formatRelativeTime(notification.timestamp)}
                              </span>
                            </div>

                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: '0.84rem',
                                color: 'var(--color-text)',
                                lineHeight: 1.3,
                                marginBottom: 2,
                              }}
                            >
                              {notification.title}
                            </div>

                            {notification.body && (
                              <div
                                style={{
                                  fontSize: '0.78rem',
                                  color: 'var(--color-text-secondary)',
                                  lineHeight: 1.35,
                                  overflowWrap: 'anywhere',
                                }}
                              >
                                {notification.body}
                              </div>
                            )}
                          </div>

                          {/* Dismiss Button */}
                          <button
                            type="button"
                            onClick={() => onDismiss(notification.id)}
                            title="Dismiss notification"
                            aria-label={`Dismiss ${notification.title}`}
                            style={{
                              position: 'absolute',
                              top: 8,
                              right: 8,
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--color-text-secondary)',
                              padding: 3,
                              borderRadius: 6,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: 0.6,
                              transition: 'opacity 0.12s ease, background 0.12s ease',
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLElement).style.opacity = '1';
                              (e.currentTarget as HTMLElement).style.background =
                                'var(--mochi-hover, rgba(0, 0, 0, 0.06))';
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.opacity = '0.6';
                              (e.currentTarget as HTMLElement).style.background = 'transparent';
                            }}
                          >
                            <X size={13} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </FloatingPanel>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default NotificationCenter;

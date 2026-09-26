import React, { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Badge, FloatingPanel, Item } from 'remochi';
import { Trash2, X } from 'lucide-react';
import { usePyxisTheme, type NotificationEntry } from '@pyxis/app-sdk';

interface NotificationCenterProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  notifications: NotificationEntry[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
}

const formatWhen = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

/**
 * The notification centre, opened from the top bar's Bell: every
 * notification still in the store, newest first, each dismissable.
 *
 * The history belongs to `useNotifications` (in Desktop), so the Bell's
 * badge and this list are always the same list. This panel only draws it.
 */
export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onOpenChange,
  notifications,
  onDismiss,
  onClearAll,
}) => {
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
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
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
            initial={{ opacity: 0, y: '-100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              y: '-100%',
              transition: { duration: 0.22, ease: [0.32, 0, 0.24, 1] },
            }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'fixed',
              top: 54,
              right: 16,
              width: 350,
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: 'calc(100vh - 72px)',
              overflowY: 'auto',
              zIndex: 1300,
              boxShadow: '0 16px 38px rgba(0,0,0,0.26)',
              borderRadius: 16,
            }}
          >
            <FloatingPanel style={theme === 'dark' ? 'shadow' : 'default'}>
              <div style={{ padding: '16px 18px', color: 'var(--color-text)' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem', fontWeight: 700 }}>
                    <span>Notifications</span>
                    <Badge content={notifications.length} />
                  </div>
                  {notifications.length > 0 && (
                    <button
                      type="button"
                      onClick={onClearAll}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-text-secondary)',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '2px 4px',
                      }}
                    >
                      <Trash2 size={12} /> Clear all
                    </button>
                  )}
                </div>

                {notifications.length === 0 ? (
                  <div
                    style={{
                      padding: '14px 12px',
                      borderRadius: 8,
                      background: 'var(--mochi-hover, rgba(0,0,0,0.03))',
                      textAlign: 'center',
                      color: 'var(--color-text-secondary)',
                      fontSize: '0.8rem',
                    }}
                  >
                    No notifications
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {notifications.map((notification) => (
                      <Item
                        key={notification.id}
                        title={notification.title}
                        subtitle={[
                          notification.appId,
                          formatWhen(notification.timestamp),
                          notification.body,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        variant="compact"
                        rightContent={
                          <button
                            type="button"
                            onClick={() => onDismiss(notification.id)}
                            title="Dismiss"
                            aria-label={`Dismiss ${notification.title}`}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              color: 'var(--color-text-secondary)',
                              padding: 4,
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            <X size={13} />
                          </button>
                        }
                      />
                    ))}
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

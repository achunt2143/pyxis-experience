import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell } from 'lucide-react';
import { asBoolean, SETTING_KEYS, useSetting, waterdrop, type NotificationEntry } from '@pyxis/app-sdk';
import { useMotion } from '../useMotion';
import { TRANSITION } from '../motion';
import { AppDropIcon } from './AppDropIcon';
import { dashboardChips, useLaunchBarPosition } from './launchBarState';

const CHIP_HEIGHT = 40;
const CHIP_TILE = 28;
const COUNT = 22;
const IDLE_BUTTON = 28;

export interface NotificationDashboardProps {
  /** The notification store, as `useNotifications` keeps it. */
  notifications: readonly NotificationEntry[];
  /** Whether the notification centre is open. Closing it marks all read. */
  centreOpen: boolean;
  /** A chip or the count was clicked: open (or close) the centre. */
  onToggleCentre: () => void;
}

/**
 * The webOS dashboard, at the launch bar's right end: the newest one or two
 * unread notifications as waterdrop chips (app icon, title, one line), then
 * the count of everything in the centre, in the spinner's red. A click on any
 * of it opens the notification centre, which rises from here. This is where
 * the top bar's Bell went.
 *
 * What was in the centre when it closed counts as read, so its chips go; the
 * count stays until notifications are dismissed. On the rail
 * (`pyxis.launchBar.position` = `left`) there is no room for chips, so it is
 * the count alone, at the rail's foot; toasts still appear (beside it). Self-contained, so the Duyo
 * port can wrap it with `adapt()`.
 */
export const NotificationDashboard: React.FC<NotificationDashboardProps> = ({
  notifications,
  centreOpen,
  onToggleCentre,
}) => {
  const { tr, to } = useMotion();
  const dnd = useSetting(SETTING_KEYS.dnd, false, asBoolean);
  const rail = useLaunchBarPosition() === 'left';
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());

  // Closing the centre marks what it showed as read (React's "adjust state
  // when a prop changes" pattern: during render, not in an effect), and
  // stale IDs no longer in `notifications` are pruned so `seen` stays bounded.
  const [wasOpen, setWasOpen] = useState(centreOpen);
  const liveIds = new Set(notifications.map((n) => n.id));
  const hasStale = [...seen].some((id) => !liveIds.has(id));
  if (wasOpen !== centreOpen) {
    setWasOpen(centreOpen);
    if (!centreOpen) {
      setSeen(liveIds);
    } else if (hasStale) {
      setSeen(new Set([...seen].filter((id) => liveIds.has(id))));
    }
  } else if (hasStale) {
    setSeen(new Set([...seen].filter((id) => liveIds.has(id))));
  }

  // While the centre is open it shows everything: no chips beside it. The
  // newest sits next to the count, where toasts rise from.
  const chips = centreOpen || rail ? [] : dashboardChips(notifications, seen, dnd).reverse();
  const count = notifications.length;
  const label = count > 0 ? `Notifications (${count})` : 'Notifications';

  return (
    <div
      data-dashboard={rail ? 'rail' : 'bar'}
      style={
        rail
          ? { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }
          : { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minWidth: 0 }
      }
    >
      <AnimatePresence initial={false}>
        {chips.map((n) => (
          <motion.button
            key={n.id}
            type="button"
            layout="position"
            data-dashboard-chip={n.id}
            title={n.body ? `${n.title}: ${n.body}` : n.title}
            onClick={onToggleCentre}
            initial={to({ opacity: 0, y: 12 })}
            animate={{ ...to({ opacity: 1, y: 0 }), transition: tr(TRANSITION.popupIn) }}
            exit={{ ...to({ opacity: 0, y: 12 }), transition: tr(TRANSITION.popupOut) }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              height: CHIP_HEIGHT,
              minWidth: 0,
              maxWidth: 200,
              flexShrink: 1,
              padding: '0 12px 0 6px',
              border: 'none',
              borderRadius: 'var(--px-corner)',
              background: 'var(--px-edge-material-strong)',
              color: 'var(--px-edge-ink)',
              boxShadow:
                '0 4px 14px rgba(0, 0, 0, 0.14), inset 0 0 0 1px color-mix(in srgb, var(--px-edge-ink) 10%, transparent)',
              fontFamily: 'var(--px-font-ui)',
              fontSize: 12.5,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <AppDropIcon appId={n.appId} size={CHIP_TILE} critical={n.urgency === 'critical'} />
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <b style={{ fontWeight: 700 }}>{n.title}</b>
              {n.body && <span style={{ color: 'var(--px-edge-ink-quiet)' }}> {n.body}</span>}
            </span>
          </motion.button>
        ))}
      </AnimatePresence>

      {count > 0 ? (
        <motion.button
          type="button"
          layout="position"
          data-dashboard-count={count}
          aria-label={label}
          aria-pressed={centreOpen}
          title={label}
          onClick={onToggleCentre}
          whileTap={{ scale: 0.92 }}
          style={{
            minWidth: COUNT,
            height: COUNT,
            flexShrink: 0,
            padding: '0 6px',
            border: 'none',
            borderRadius: `${COUNT / 2}px 3px ${COUNT / 2}px ${COUNT / 2}px`,
            background: 'var(--px-spinner-red)',
            color: '#fff',
            boxShadow: centreOpen
              ? 'inset 0 0 0 1px var(--px-spinner-red-outline), 0 0 0 2px color-mix(in srgb, var(--px-spinner-red) 35%, transparent)'
              : 'inset 0 0 0 1px var(--px-spinner-red-outline)',
            fontFamily: 'var(--px-font-ui)',
            fontWeight: 700,
            fontSize: 12,
            lineHeight: `${COUNT}px`,
            textAlign: 'center',
            cursor: 'pointer',
          }}
        >
          {count > 9 ? '9+' : count}
        </motion.button>
      ) : (
        <motion.button
          type="button"
          layout="position"
          data-dashboard-idle=""
          aria-label={label}
          aria-pressed={centreOpen}
          title={label}
          onClick={onToggleCentre}
          whileTap={{ scale: 0.92 }}
          style={{
            width: IDLE_BUTTON,
            height: IDLE_BUTTON,
            flexShrink: 0,
            padding: 0,
            border: 'none',
            borderRadius: waterdrop(IDLE_BUTTON),
            background: centreOpen
              ? 'color-mix(in srgb, var(--px-edge-material-strong) 92%, transparent)'
              : 'color-mix(in srgb, var(--px-edge-ink) 8%, transparent)',
            boxShadow: centreOpen
              ? 'inset 0 0 0 1.5px var(--px-glow)'
              : 'inset 0 0 0 1px color-mix(in srgb, var(--px-edge-ink) 12%, transparent)',
            color: centreOpen ? 'var(--px-edge-ink)' : 'var(--px-edge-ink-quiet)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <Bell size={14} aria-hidden="true" />
        </motion.button>
      )}
    </div>
  );
};

export default NotificationDashboard;

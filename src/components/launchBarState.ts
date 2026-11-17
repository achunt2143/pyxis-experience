import {
  LAUNCH_BAR_POSITIONS,
  SETTING_KEYS,
  oneOf,
  useSetting,
  type LaunchBarPosition,
  type NotificationEntry,
} from '@pyxis/app-sdk';
import type { AppLifecycleState } from '../types';

/** The launch bar's height, and so the work area's bottom inset (overlay/useWorkArea). */
export const LAUNCH_BAR_HEIGHT = 64;

/**
 * The rail's width (the launch bar turned down the left edge), and so the
 * work area's left inset. Same depth as the bar, so the screen loses 64 px of
 * width instead of height.
 */
export const LAUNCH_RAIL_WIDTH = 64;

/** The status strip's height: the rail starts below it (TopSystemBar's `STATUS_STRIP_HEIGHT`). */
export const LAUNCH_RAIL_TOP = 36;

const parsePosition = oneOf(...LAUNCH_BAR_POSITIONS);

/**
 * Where the launch bar sits, `pyxis.launchBar.position`: along the bottom
 * edge (the default) or as a rail down the left. Everything that depends on
 * it (the bar, the dashboard, the toasts and the centre) reads it itself, so
 * the shell that draws them doesn't have to pass it down, and a change in
 * Settings moves all of them at once.
 */
export function useLaunchBarPosition(): LaunchBarPosition {
  return useSetting<LaunchBarPosition>(SETTING_KEYS.launchBarPosition, 'bottom', parsePosition);
}

/**
 * What the light under an app's icon on the launch bar says, on the screen's
 * edge the bar is flush with (the bottom, or the left for the rail).
 *
 * - `none`: not running.
 * - `running`: a short line of the app's accent.
 * - `focused`: longer and brighter: the app holds the keyboard.
 * - `starting`: launched, no window yet: the short line, pulsing.
 * - `minimized`: running out of sight: the short line, faint, unlit.
 * - `crashed`: the short line in the spinner's red.
 */
export type RunLine = 'none' | 'running' | 'focused' | 'starting' | 'minimized' | 'crashed';

export function runLineFor({
  running,
  state,
  starting = false,
  focused = false,
  minimized = false,
}: {
  running: boolean;
  state: AppLifecycleState | null;
  starting?: boolean;
  focused?: boolean;
  minimized?: boolean;
}): RunLine {
  if (!running) return 'none';
  if (state === 'crashed') return 'crashed';
  if (starting || state === 'starting') return 'starting';
  if (focused) return 'focused';
  if (minimized) return 'minimized';
  return 'running';
}

/** At most this many unread notifications stay on the dashboard as chips. */
export const DASHBOARD_CHIPS = 2;

/**
 * The chips the notification dashboard shows: the newest unread
 * notifications, at most `DASHBOARD_CHIPS`. Unread means not yet seen in the
 * centre. Do Not Disturb holds back all but critical ones, as it does toasts:
 * a chip is an interruption too. They are all still counted, and all in the
 * centre.
 */
export function dashboardChips(
  notifications: readonly NotificationEntry[],
  seen: ReadonlySet<string>,
  dnd: boolean
): NotificationEntry[] {
  return notifications
    .filter((n) => !seen.has(n.id))
    .filter((n) => !dnd || n.urgency === 'critical')
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, DASHBOARD_CHIPS);
}

/**
 * Where notifications come out of: the launch bar's right end, where its
 * dashboard sits. Toasts stack upward from here and the centre opens upward
 * from here (NotificationCenter), 8 px clear of the bar.
 */
export const DASHBOARD_ANCHOR = { bottom: LAUNCH_BAR_HEIGHT + 8, right: 12 } as const;

/**
 * Where they come out of with the launch bar as a rail
 * (`pyxis.launchBar.position` = `left`): the bottom left, 12 px clear of the
 * rail, beside the dashboard's count at its foot. Toasts stack upward from
 * here and the centre opens upward from here.
 */
export const RAIL_ANCHOR = { bottom: 12, left: LAUNCH_RAIL_WIDTH + 12 } as const;

/** The anchor for a placement, as fixed-position style, and the corner panels grow from. */
export function notificationAnchor(rail: boolean): {
  style: { bottom: number; right?: number; left?: number };
  origin: string;
  side: number;
} {
  return rail
    ? { style: { bottom: RAIL_ANCHOR.bottom, left: RAIL_ANCHOR.left }, origin: 'bottom left', side: RAIL_ANCHOR.left }
    : { style: { bottom: DASHBOARD_ANCHOR.bottom, right: DASHBOARD_ANCHOR.right }, origin: 'bottom right', side: DASHBOARD_ANCHOR.right };
}

import React from 'react';
import {
  Wifi,
  WifiOff,
  Battery,
  BatteryCharging,
  BatteryLow,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
  Unlock,
} from 'lucide-react';
import {
  useBatteryStatus,
  useNetworkStatus,
  useOutputVolume,
  useSetting,
  asBoolean,
  useClock,
  formatClockTime,
  waterdrop,
  SETTING_KEYS,
  type PrivilegeState,
} from '@pyxis/app-sdk';
import { appById } from '../apps/registry';
import { useApps } from '../hooks/useApps';
import { DesktopSearch } from './DesktopSearch';
import './StatusStrip.css';

/** The strip's height. useWorkArea measures it, so it is also Evo's top inset. */
export const STATUS_STRIP_HEIGHT = 36;

interface TopSystemBarProps {
  quickSettingsOpen: boolean;
  onToggleQuickSettings: () => void;
  /**
   * Ignored. Notifications left the top edge for the launch bar's dashboard
   * (lane B); kept optional so ShellLayer compiles until it drops them.
   */
  notificationsOpen?: boolean;
  /** Ignored, as `notificationsOpen`. */
  onToggleNotifications?: () => void;
  /** Ignored, as `notificationsOpen`. */
  notificationCount?: number;
  onLaunchApp: (appId: string, name: string) => void;
  /** The search box opened or closed: it takes typing, so the shell needs the keyboard. */
  onSearchActiveChange?: (active: boolean) => void;
  /** Active privilege elevation state, if any. */
  privilegeState?: PrivilegeState;
  /** Revoke active privilege elevation immediately. */
  onRevokePrivilege?: () => void;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Mochi's own bold face: bold in the Light face would be synthesized. */
const BOLD_FONT = "'Mochi Bold', var(--px-font-ui)";

/** Ink on the wallpaper, legible over any part of it. */
const GLYPH_SHADOW = 'drop-shadow(0 1px 3px var(--px-ink-shadow))';

/**
 * The status strip: Pyxis's top edge, drawn straight on the wallpaper.
 *
 * No slab and no blur: the work area keeps apps out of these 36 px, so what
 * is behind the strip is always the wallpaper, and the ink (`--px-ink`,
 * from useShellTint) follows it, dark by day and light at night, with a soft
 * shadow in the opposite tone for where the wallpaper is busy.
 *
 * - Left: "Just type", the search box as a quiet underline (DesktopSearch).
 * - Centre: the clock in display type, from Echo's clock in the device's
 *   zone (useClock) and `pyxis.clock24h`.
 * - Right: Wi-Fi, volume and battery, one button that opens quick settings.
 *
 * Notifications are not here: they rise from the launch bar's right end.
 * The header keeps `data-shell-region` (it takes clicks over apps) and
 * `data-shell-edge="top"` (useWorkArea measures it for Evo's work area).
 */
export const TopSystemBar: React.FC<TopSystemBarProps> = ({
  quickSettingsOpen,
  onToggleQuickSettings,
  onLaunchApp,
  onSearchActiveChange,
  privilegeState,
  onRevokePrivilege,
}) => {
  const { byId: appsById } = useApps();
  const battery = useBatteryStatus();
  const network = useNetworkStatus();
  const { volume, muted } = useOutputVolume();

  const hasBattery = battery?.present === true && battery.level !== null;
  const showBatteryPercent = useSetting(SETTING_KEYS.showBatteryPercent, true, asBoolean);

  const BatteryGlyph = battery?.charging
    ? BatteryCharging
    : hasBattery && battery.level! <= 20
      ? BatteryLow
      : Battery;
  const WifiGlyph = network?.connected ? Wifi : WifiOff;
  const VolumeGlyph =
    muted || volume === 0 ? VolumeX : volume === null ? Volume2 : volume < 34 ? Volume : volume < 67 ? Volume1 : Volume2;

  // Echo's clock in the device's zone, not this page's Date: vela keeps the
  // zone it started with, so after a time-zone change only Echo is right.
  const clock = useClock();
  const clock24h = useSetting(SETTING_KEYS.clock24h, false, asBoolean);
  const { time, meridiem } = splitClock(formatClockTime(clock, clock24h), clock24h);

  const statusLabel = [
    network?.connected ? `Wi-Fi ${network.ssid ?? 'connected'}` : 'Offline',
    muted ? 'muted' : volume !== null ? `volume ${volume}%` : null,
    hasBattery ? `battery ${battery!.level}%${battery!.charging ? ' charging' : ''}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const activeGrant = privilegeState?.active
    ? privilegeState.grant ?? privilegeState.grants[0] ?? null
    : null;
  const grantedAppName = activeGrant
    ? appsById(activeGrant.appId)?.name ?? appById(activeGrant.appId)?.name ?? activeGrant.appId
    : '';

  return (
    <header
      // The shell's top edge: it takes clicks (data-shell-region) and apps
      // are kept out from under it (data-shell-edge, see overlay/useWorkArea).
      data-shell-region=""
      data-shell-edge="top"
      data-status-strip=""
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: STATUS_STRIP_HEIGHT,
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        padding: '0 18px',
        zIndex: 1200,
        background: 'transparent',
        color: 'var(--px-ink)',
        textShadow: '0 1px 6px var(--px-ink-shadow)',
        fontFamily: 'var(--px-font-ui)',
        userSelect: 'none',
      }}
    >
      <div style={{ width: 240, maxWidth: '30vw', justifySelf: 'start' }}>
        <DesktopSearch onLaunch={onLaunchApp} onActiveChange={onSearchActiveChange} />
      </div>

      <div
        data-strip-clock=""
        style={{
          justifySelf: 'center',
          whiteSpace: 'nowrap',
          fontFamily: 'var(--px-font-display)',
          fontWeight: 300,
          fontSize: 15,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
        }}
      >
        {WEEKDAYS[clock.weekday]}
        <span aria-hidden="true" style={{ margin: '0 0.5em', opacity: 0.7 }}>
          ·
        </span>
        <b style={{ fontFamily: BOLD_FONT, fontWeight: 700, letterSpacing: '0.04em' }}>{time}</b>
        {meridiem && <span style={{ marginLeft: '0.4em' }}>{meridiem}</span>}
      </div>

      <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 8 }}>
        {privilegeState?.active && activeGrant && (
          <div
            data-privilege-badge=""
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              height: 24,
              padding: '0 8px',
              borderRadius: waterdrop(24),
              background: 'color-mix(in srgb, var(--px-ink) 12%, transparent)',
              boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--px-ink) 18%, transparent)',
              fontSize: 12,
              whiteSpace: 'nowrap',
            }}
          >
            <Unlock size={13} style={{ filter: GLYPH_SHADOW }} aria-hidden="true" />
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {grantedAppName} {formatCountdown(activeGrant.remainingSecs)}
            </span>
            <button
              type="button"
              onClick={() => onRevokePrivilege?.()}
              style={{
                border: 'none',
                background: 'color-mix(in srgb, var(--px-ink) 16%, transparent)',
                color: 'inherit',
                borderRadius: waterdrop(18),
                height: 18,
                padding: '0 7px',
                font: 'inherit',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                textShadow: 'none',
              }}
            >
              Lock
            </button>
          </div>
        )}

        <button
          type="button"
          className="px-strip-status"
          data-strip-status=""
          onClick={onToggleQuickSettings}
          aria-label="Quick settings"
          aria-expanded={quickSettingsOpen}
          title={statusLabel}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            height: 28,
            padding: '0 10px',
            // The cluster is the only thing to aim at on the right, so it
            // reaches the strip's edge (quick settings drops beneath it).
            marginRight: -10,
            border: 'none',
            borderRadius: 'var(--px-corner-20)',
            background: 'transparent',
            color: 'inherit',
            font: 'inherit',
            fontSize: 13,
            textShadow: 'inherit',
            cursor: 'pointer',
          }}
        >
          <WifiGlyph size={16} style={{ filter: GLYPH_SHADOW }} aria-hidden="true" />
          <VolumeGlyph size={16} style={{ filter: GLYPH_SHADOW }} aria-hidden="true" />
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <BatteryGlyph size={16} style={{ filter: GLYPH_SHADOW }} aria-hidden="true" />
            {hasBattery && showBatteryPercent && <span>{battery!.level}%</span>}
          </span>
        </button>
      </div>
    </header>
  );
};

function formatCountdown(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

/**
 * "06:42 PM" → time "6:42", meridiem "PM" (the meridiem sits outside the
 * bold time). The 24-hour clock keeps its leading zero, as clocks do.
 */
function splitClock(formatted: string, hour24: boolean): { time: string; meridiem: string | null } {
  if (hour24) return { time: formatted, meridiem: null };
  const [time, meridiem = null] = formatted.split(' ');
  return { time: time.replace(/^0(?=\d:)/, ''), meridiem };
}

export { TopSystemBar as StatusStrip };
export default TopSystemBar;

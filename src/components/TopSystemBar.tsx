import React from 'react';
import { motion } from 'framer-motion';
import {
  Bell,
  Settings,
  Wifi,
  WifiOff,
  Battery,
  BatteryCharging,
  BatteryLow,
} from 'lucide-react';
import {
  useBatteryStatus,
  useNetworkStatus,
  useSetting,
  asBoolean,
  useClock,
  formatClockTime,
  SETTING_KEYS,
} from '@pyxis/app-sdk';
import { DesktopSearch } from './DesktopSearch';

interface TopSystemBarProps {
  quickSettingsOpen: boolean;
  onToggleQuickSettings: () => void;
  notificationsOpen: boolean;
  onToggleNotifications: () => void;
  /** Entries in the notification centre, for the Bell's badge. */
  notificationCount: number;
  onLaunchApp: (appId: string, name: string) => void;
  /** The search box opened or closed: it takes typing, so the shell needs the keyboard. */
  onSearchActiveChange?: (active: boolean) => void;
}

/**
 * TopSystemBar — Continuous, translucent Mochi top status bar.
 *
 * Provides a clean horizontal bar with:
 * - Left: Palm "Just Type" Search input
 * - Center: Subtle Pyxis status mark
 * - Right: Consolidated System Status Cluster (Notifications, Quick Settings, Wifi, Battery, Clock)
 */
export const TopSystemBar: React.FC<TopSystemBarProps> = ({
  quickSettingsOpen,
  onToggleQuickSettings,
  notificationsOpen,
  onToggleNotifications,
  notificationCount,
  onLaunchApp,
  onSearchActiveChange,
}) => {
  const battery = useBatteryStatus();
  const network = useNetworkStatus();

  const hasBattery = battery?.present === true && battery.level !== null;
  const showBatteryPercent = useSetting(SETTING_KEYS.showBatteryPercent, true, asBoolean);

  // Battery icon selection
  const BatteryGlyph = battery?.charging
    ? BatteryCharging
    : (hasBattery && battery.level! <= 20)
    ? BatteryLow
    : Battery;
  const WifiGlyph = network?.connected ? Wifi : WifiOff;

  // Echo's clock in the device's zone, not this page's Date: vela keeps the
  // zone it started with, so after a time-zone change only Echo is right.
  const clock = useClock();
  const clock24h = useSetting(SETTING_KEYS.clock24h, false, asBoolean);

  return (
    <header
      // The shell's top edge: it takes clicks (data-shell-region) and apps
      // are kept out from under it (data-shell-edge, see overlay/useWorkArea).
      data-shell-region=""
      data-shell-edge="top"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '44px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 14px',
        zIndex: 1200,
        background: 'var(--color-surface, rgba(255, 255, 255, 0.85))',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--color-border-light, rgba(0, 0, 0, 0.08))',
        color: 'var(--color-text)',
        userSelect: 'none',
      }}
    >
      {/* Left Region: Palm "Just Type" Search Box */}
      <div style={{ flex: '0 0 340px', maxWidth: '35vw' }}>
        <DesktopSearch onLaunch={onLaunchApp} onActiveChange={onSearchActiveChange} />
      </div>



      {/* Right Region: Consolidated Status Cluster */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        {/* Notification Bell */}
        <motion.button
          type="button"
          onClick={onToggleNotifications}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          style={{
            position: 'relative',
            background: notificationsOpen ? 'var(--mochi-primary-soft, rgba(59, 130, 246, 0.15))' : 'transparent',
            border: notificationsOpen ? '1px solid var(--color-primary, #3b82f6)' : '1px solid transparent',
            padding: '6px',
            borderRadius: '10px',
            cursor: 'pointer',
            color: notificationsOpen ? 'var(--color-primary, #3b82f6)' : 'var(--color-text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
          aria-label={
            notificationCount > 0 ? `Notifications (${notificationCount})` : 'Notifications'
          }
        >
          <Bell size={17} />
          {notificationCount > 0 && (
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 2,
                right: 2,
                minWidth: 14,
                height: 14,
                padding: '0 3px',
                borderRadius: 7,
                background: 'var(--color-primary, #3b82f6)',
                color: '#fff',
                fontSize: '0.6rem',
                fontWeight: 700,
                lineHeight: '14px',
                textAlign: 'center',
              }}
            >
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          )}
        </motion.button>

        {/* Quick Settings Gear */}
        <motion.button
          type="button"
          onClick={onToggleQuickSettings}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          style={{
            background: quickSettingsOpen ? 'var(--mochi-primary-soft, rgba(59, 130, 246, 0.15))' : 'transparent',
            border: quickSettingsOpen ? '1px solid var(--color-primary, #3b82f6)' : '1px solid transparent',
            padding: '6px',
            borderRadius: '10px',
            cursor: 'pointer',
            color: quickSettingsOpen ? 'var(--color-primary, #3b82f6)' : 'var(--color-text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
          aria-label="Settings"
        >
          <Settings size={17} />
        </motion.button>

        {/* Wifi Glyph */}
        <motion.button
          type="button"
          onClick={onToggleQuickSettings}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          style={{
            background: quickSettingsOpen ? 'var(--mochi-primary-soft, rgba(59, 130, 246, 0.15))' : 'transparent',
            border: quickSettingsOpen ? '1px solid var(--color-primary, #3b82f6)' : '1px solid transparent',
            padding: '6px',
            borderRadius: '10px',
            cursor: 'pointer',
            color: quickSettingsOpen ? 'var(--color-primary, #3b82f6)' : 'var(--color-text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
          title={network?.connected ? `Connected: ${network.ssid}` : 'Offline'}
          aria-label="Network status"
        >
          <WifiGlyph size={17} />
        </motion.button>

        {/* Battery & Quick Settings Trigger Pill */}
        <motion.div
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            borderRadius: '10px',
            cursor: 'pointer',
            background: quickSettingsOpen ? 'var(--mochi-primary-soft, rgba(59, 130, 246, 0.15))' : 'var(--mochi-hover, rgba(0,0,0,0.03))',
            border: quickSettingsOpen ? '1px solid var(--color-primary, #3b82f6)' : '1px solid var(--color-border-light, transparent)',
            color: quickSettingsOpen ? 'var(--color-primary, #3b82f6)' : 'var(--color-text)',
            transition: 'all 0.15s ease',
          }}
          onClick={onToggleQuickSettings}
          title={
            hasBattery
              ? `${battery!.level}%${battery!.charging ? ' (charging)' : ''}`
              : 'No battery detected'
          }
        >
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <BatteryGlyph size={17} />
          </span>
          {hasBattery && showBatteryPercent && (
            <span style={{ fontSize: '0.78rem', fontWeight: 600, marginLeft: '2px' }}>
              {battery!.level}%
            </span>
          )}
        </motion.div>

        {/* System Clock Pill */}
        <div
          onClick={onToggleQuickSettings}
          style={{
            marginLeft: '4px',
            padding: '4px 10px',
            borderRadius: '8px',
            fontSize: '0.84rem',
            fontWeight: 600,
            cursor: 'pointer',
            background: 'var(--mochi-hover, rgba(0,0,0,0.04))',
            border: '1px solid var(--color-border-light, rgba(0,0,0,0.08))',
            letterSpacing: '0.02em',
          }}
        >
          {formatClockTime(clock, clock24h)}
        </div>
      </div>
    </header>
  );
};

export default TopSystemBar;

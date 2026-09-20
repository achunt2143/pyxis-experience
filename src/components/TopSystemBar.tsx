import React, { useEffect, useState } from 'react';
import { Repanel } from 'remochi';
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
  useBooleanSetting,
  usePyxisTheme,
  SETTING_KEYS,
} from '@pyxis/app-sdk';
import { DesktopSearch } from './DesktopSearch';

const formatClock = () =>
  new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

interface TopSystemBarProps {
  quickSettingsOpen: boolean;
  onToggleQuickSettings: () => void;
  onLaunchApp: (appId: string, name: string) => void;
}

/**
 * The top bar chrome only — the quick-settings sliding menu itself lives at
 * the Desktop level (see QuickSettingsMenu.tsx), pushing the whole shell
 * via MochiSlidingMenu.ContentShifter rather than living inside this bar.
 */
export const TopSystemBar: React.FC<TopSystemBarProps> = ({
  quickSettingsOpen,
  onToggleQuickSettings,
  onLaunchApp,
}) => {
  const battery = useBatteryStatus();
  const network = useNetworkStatus();

  // remochi Panel style follows the shell theme: dark mode uses the
  // "shadow" variant, light mode uses "default".
  const theme = usePyxisTheme('light');
  const panelStyle = theme === 'dark' ? 'shadow' : 'default';

  // A machine with no battery (desktop, or the QEMU target) reports
  // `present: false` and a null level — render nothing rather than a
  // half-full glyph over a number that was never measured.
  const hasBattery = battery?.present === true && battery.level !== null;
  const showBatteryPercent = useBooleanSetting(SETTING_KEYS.showBatteryPercent, true);

  // Pick a battery icon based on level/charging state.
  const BatteryGlyph = battery?.charging
    ? BatteryCharging
    : (hasBattery && battery.level! <= 20)
    ? BatteryLow
    : Battery;
  const WifiGlyph = network?.connected ? Wifi : WifiOff;

  const [currentTime, setCurrentTime] = useState(formatClock);

  useEffect(() => {
    let intervalId: number | undefined;

    const timeoutId = window.setTimeout(() => {
      setCurrentTime(formatClock());
      intervalId = window.setInterval(() => setCurrentTime(formatClock()), 60_000);
    }, 60_000 - (Date.now() % 60_000));

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, []);

  return (
    <>
      {/* Top System Bar — two remochi Panels spanning the screen width,
          flush against each other with no gap. Each Panel is flipped about
          its own origin to mirror its default rounded-corner shape; each
          content wrapper carries the same flip again to cancel it back out
          so the bar's contents render upright:
            left panel  — flip vertically only (scaleY(-1))
            right panel — flip both horizontally and vertically (scale(-1,-1)) */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '48px',
          display: 'flex',
          zIndex: 1200,
          color: 'var(--color-text)',
        }}
      >
        {/* Left Panel: Search */}
        <div style={{ flex: '0 0 340px', transform: 'scaleY(-1)' }}>
          <Repanel style={panelStyle}>
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
                transform: 'scaleY(-1)',
              }}
            >
              <DesktopSearch onLaunch={onLaunchApp} />
            </div>
          </Repanel>
        </div>

        {/* Right Panel: Quick Settings + Clock */}
        <div style={{ flex: '1 1 auto', transform: 'scale(-1, -1)' }}>
          <Repanel style={panelStyle}>
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '8px',
                padding: '0 16px',
                transform: 'scale(-1, -1)',
              }}
            >
              <motion.button
                type="button"
                onClick={onToggleQuickSettings}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                style={{
                  background: quickSettingsOpen ? 'var(--mochi-primary-soft)' : 'transparent',
                  border: quickSettingsOpen ? '1px solid var(--color-primary)' : '1px solid transparent',
                  padding: '6px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  color: quickSettingsOpen ? 'var(--color-primary)' : 'var(--color-text)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease',
                }}
                aria-label="Notifications"
              >
                <Bell size={18} />
              </motion.button>

              <motion.button
                type="button"
                onClick={onToggleQuickSettings}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                style={{
                  background: quickSettingsOpen ? 'var(--mochi-primary-soft)' : 'transparent',
                  border: quickSettingsOpen ? '1px solid var(--color-primary)' : '1px solid transparent',
                  padding: '6px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  color: quickSettingsOpen ? 'var(--color-primary)' : 'var(--color-text)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease',
                }}
                aria-label="Settings"
              >
                <Settings size={18} />
              </motion.button>

              <motion.button
                type="button"
                onClick={onToggleQuickSettings}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                style={{
                  background: quickSettingsOpen ? 'var(--mochi-primary-soft)' : 'transparent',
                  border: quickSettingsOpen ? '1px solid var(--color-primary)' : '1px solid transparent',
                  padding: '6px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  color: quickSettingsOpen ? 'var(--color-primary)' : 'var(--color-text)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease',
                }}
                title={network?.connected ? `Connected: ${network.ssid}` : 'Offline'}
                aria-label="Network status"
              >
                <WifiGlyph size={18} />
              </motion.button>

              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.94 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  background: quickSettingsOpen ? 'var(--mochi-primary-soft)' : 'transparent',
                  border: quickSettingsOpen ? '1px solid var(--color-primary)' : '1px solid transparent',
                  color: quickSettingsOpen ? 'var(--color-primary)' : 'var(--color-text)',
                  transition: 'color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease',
                }}
                onClick={onToggleQuickSettings}
                title={
                  hasBattery
                    ? `${battery!.level}%${battery!.charging ? ' (charging)' : ''}`
                    : 'No battery detected'
                }
              >
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  <BatteryGlyph size={18} />
                </span>
                {hasBattery && showBatteryPercent && (
                  <span
                    style={{ fontSize: '0.78rem', fontWeight: 600, marginLeft: '2px' }}
                  >
                    {battery!.level}%
                  </span>
                )}
              </motion.div>

              <div
                style={{
                  marginLeft: '6px',
                  padding: '4px 10px',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'default',
                  background: 'var(--mochi-hover)',
                  border: '1px solid var(--color-border-light)',
                  letterSpacing: '0.02em',
                }}
              >
                {currentTime}
              </div>
            </div>
          </Repanel>
        </div>
      </div>
    </>
  );
};

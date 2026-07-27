import React from 'react';
import { Box, IconButton } from '@mui/material';
import { Input, Repanel } from 'remochi';
import {
  Search,
  Bell,
  Settings,
  Wifi,
  WifiOff,
  Battery,
  BatteryCharging,
  BatteryLow,
} from 'lucide-react';
import { useBatteryStatus, useNetworkStatus, usePyxisTheme } from '@pyxis/app-sdk';

interface TopSystemBarProps {
  quickSettingsOpen: boolean;
  onToggleQuickSettings: () => void;
}

/**
 * The top bar chrome only — the quick-settings sliding menu itself lives at
 * the Desktop level (see QuickSettingsMenu.tsx), pushing the whole shell
 * via MochiSlidingMenu.ContentShifter rather than living inside this bar.
 */
export const TopSystemBar: React.FC<TopSystemBarProps> = ({
  quickSettingsOpen,
  onToggleQuickSettings,
}) => {
  const battery = useBatteryStatus();
  const network = useNetworkStatus();

  // remochi Panel style follows the shell theme: dark mode uses the
  // "shadow" variant, light mode uses "default".
  const theme = usePyxisTheme('light');
  const panelStyle = theme === 'dark' ? 'shadow' : 'default';

  // Pick a battery icon based on level/charging state.
  const BatteryGlyph = battery?.charging
    ? BatteryCharging
    : (battery && battery.level <= 20)
    ? BatteryLow
    : Battery;
  const WifiGlyph = network?.connected ? Wifi : WifiOff;

  const currentTime = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <>
      {/* Top System Bar — two remochi Panels spanning the screen width,
          flush against each other with no gap. Each Panel is flipped about
          its own origin to mirror its default rounded-corner shape; each
          content wrapper carries the same flip again to cancel it back out
          so the bar's contents render upright:
            left panel  — flip vertically only (scaleY(-1))
            right panel — flip both horizontally and vertically (scale(-1,-1)) */}
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 48,
          display: 'flex',
          zIndex: 1200,
          color: 'var(--color-text)',
        }}
      >
        {/* Left Panel: Search */}
        <Box sx={{ flex: '0 0 340px', transform: 'scaleY(-1)' }}>
          <Repanel style={panelStyle}>
            <Box
              sx={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 2,
                transform: 'scaleY(-1)',
              }}
            >
              <Search size={18} style={{ opacity: 0.6, flexShrink: 0 }} />
              <Input placeholder="Search..." style={{ width: '100%' }} />
            </Box>
          </Repanel>
        </Box>

        {/* Right Panel: Quick Settings + Clock */}
        <Box sx={{ flex: '1 1 auto', transform: 'scale(-1, -1)' }}>
          <Repanel style={panelStyle}>
            <Box
              sx={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 1,
                px: 2,
                transform: 'scale(-1, -1)',
              }}
            >
              <IconButton
                size="small"
                onClick={onToggleQuickSettings}
                sx={{
                  color: quickSettingsOpen ? 'primary.main' : 'text.primary',
                }}
              >
                <Bell size={20} />
              </IconButton>

              <IconButton
                size="small"
                onClick={onToggleQuickSettings}
                sx={{
                  color: quickSettingsOpen ? 'primary.main' : 'text.primary',
                }}
              >
                <Settings size={20} />
              </IconButton>

              <IconButton
                size="small"
                onClick={onToggleQuickSettings}
                sx={{
                  color: quickSettingsOpen ? 'primary.main' : 'text.primary',
                }}
                title={network?.connected ? `Connected: ${network.ssid}` : 'Offline'}
              >
                <WifiGlyph size={20} />
              </IconButton>

              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  cursor: 'pointer',
                  color: quickSettingsOpen ? 'primary.main' : 'text.primary',
                }}
                onClick={onToggleQuickSettings}
                title={battery ? `${battery.level}% ${battery.charging ? '(charging)' : ''}` : 'Battery'}
              >
                <IconButton size="small" sx={{ color: 'inherit' }}>
                  <BatteryGlyph size={20} />
                </IconButton>
                {battery && (
                  <Box
                    component="span"
                    sx={{ fontSize: '0.78rem', fontWeight: 600, mr: 0.5 }}
                  >
                    {battery.level}%
                  </Box>
                )}
              </Box>

              <Box
                sx={{
                  ml: 1,
                  px: 1.5,
                  py: 0.5,
                  borderRadius: 1,
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'default',
                }}
              >
                {currentTime}
              </Box>
            </Box>
          </Repanel>
        </Box>
      </Box>
    </>
  );
};

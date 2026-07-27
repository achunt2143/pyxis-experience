import React from 'react';
import { Box } from '@mui/material';
import { Toggle, MochiSlidingMenu, MochiSlidingMenuItemGroup } from 'remochi';
import {
  useBatteryStatus,
  useNetworkStatus,
  setSetting,
  SETTING_KEYS,
  usePyxisTheme,
} from '@pyxis/app-sdk';

// Small labeled toggle row used inside the quick-settings sliding menu.
const ToggleRow: React.FC<{
  label: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
}> = ({ label, checked, onChange }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      py: 0.5,
    }}
  >
    <Box component="span" sx={{ fontSize: '0.875rem' }}>
      {label}
    </Box>
    <Toggle checked={checked} onChange={() => onChange?.(!checked)} />
  </Box>
);

interface QuickSettingsMenuProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  contentRef: React.Ref<HTMLDivElement>;
}

/**
 * The quick-settings sliding menu itself (rendered as an overlay, per
 * remochi's SlidingMenu + ContentShifter pattern — see Desktop.tsx, which
 * renders this as a sibling of the ContentShifter wrapping the rest of the
 * shell, not nested inside TopSystemBar).
 */
export const QuickSettingsMenu: React.FC<QuickSettingsMenuProps> = ({
  isOpen,
  onOpenChange,
  contentRef,
}) => {
  const theme = usePyxisTheme('light');
  const darkMode = theme === 'dark';
  const battery = useBatteryStatus();
  const network = useNetworkStatus();

  return (
    <MochiSlidingMenu position="top" isOpen={isOpen} onOpenChange={onOpenChange}>
      <Box ref={contentRef}>
        <MochiSlidingMenuItemGroup label="Notifications" divider>
          <Box sx={{ px: 2, color: 'text.secondary', fontSize: '0.875rem' }}>
            No new notifications
          </Box>
        </MochiSlidingMenuItemGroup>

        <MochiSlidingMenuItemGroup label="Display" divider>
          <Box sx={{ px: 2 }}>
            <ToggleRow
              label="Dark Mode"
              checked={darkMode}
              onChange={(next) =>
                void setSetting(SETTING_KEYS.theme, next ? 'dark' : 'light')
              }
            />
            <ToggleRow label="Notifications" checked onChange={() => {}} />
            <ToggleRow label="Auto-brightness" checked onChange={() => {}} />
          </Box>
        </MochiSlidingMenuItemGroup>

        <MochiSlidingMenuItemGroup label="WiFi" divider>
          <Box sx={{ px: 2 }}>
            <ToggleRow
              label="WiFi Enabled"
              checked={network?.connected ?? false}
            />
            <Box sx={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', mt: 1 }}>
              {network?.connected
                ? `Connected to: ${network.ssid} (${network.type})`
                : 'Not connected'}
            </Box>
          </Box>
        </MochiSlidingMenuItemGroup>

        <MochiSlidingMenuItemGroup label="Battery">
          <Box sx={{ px: 2 }}>
            <Box sx={{ mb: 1 }}>
              <Box sx={{ fontSize: '1.5rem', fontWeight: 600, mb: 0.5 }}>
                {battery ? `${battery.level}%` : '—'}
              </Box>
              <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                {battery?.charging ? 'Charging' : 'On battery power'}
              </Box>
            </Box>
            <ToggleRow label="Low Power Mode" checked={false} onChange={() => {}} />
            <ToggleRow label="Battery Percentage" checked onChange={() => {}} />
          </Box>
        </MochiSlidingMenuItemGroup>
      </Box>
    </MochiSlidingMenu>
  );
};

export default QuickSettingsMenu;

import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Tabs,
  Tab,
  Typography,
  Stack,
  TextField,
  MenuItem,
  Divider,
} from '@mui/material';
import { useEcho } from '../services/useEcho';

export interface SettingsAppProps {
  windowId: string;
  onClose?: () => void;
}

interface SystemInfo {
  hostname: string;
  locale: string;
  timezone: string;
}

const DEFAULT_SYSTEM: SystemInfo = {
  hostname: 'pyxis',
  locale: 'en_US.UTF-8',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
};

const WALLPAPERS = [
  {
    id: 'aurora',
    name: 'Aurora',
    css: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  {
    id: 'sunset',
    name: 'Sunset',
    css: 'linear-gradient(135deg, #ff7e5f 0%, #feb47b 100%)',
  },
  {
    id: 'forest',
    name: 'Forest',
    css: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)',
  },
];

const WALLPAPER_KEY = 'pyxis.wallpaper';

export const SettingsApp: React.FC<SettingsAppProps> = ({ windowId }) => {
  const [tab, setTab] = useState(0);
  const [system] = useState<SystemInfo>(DEFAULT_SYSTEM);
  const [wallpaper, setWallpaper] = useState<string>(() => {
    return localStorage.getItem(WALLPAPER_KEY) || WALLPAPERS[0].id;
  });
  const echo = useEcho();
  const [network, setNetwork] = useState<{
    connected: boolean;
    ssid: string;
    type: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    echo.getNetworkStatus().then((res) => {
      if (mounted) setNetwork(res);
    });
    return () => {
      mounted = false;
    };
  }, [echo]);

  const applyWallpaper = (id: string) => {
    setWallpaper(id);
    localStorage.setItem(WALLPAPER_KEY, id);
    const wp = WALLPAPERS.find((w) => w.id === id);
    if (wp) {
      // Broadcast to Desktop component via custom event
      window.dispatchEvent(
        new CustomEvent('pyxis:wallpaper-change', { detail: { css: wp.css, id } })
      );
    }
  };

  const aboutInfo = useMemo(
    () => ({
      os: 'GeckoOS 0.1.0',
      shell: 'Pyxis 0.1.0',
      kernel: 'Linux 6.6.0-gecko',
      arch: 'x86_64',
      compositor: 'Smithay (Wayland)',
    }),
    []
  );

  return (
    <Box
      data-window-id={windowId}
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}
      >
        <Tab label="Display" />
        <Tab label="System" />
        <Tab label="About" />
      </Tabs>

      <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
        {tab === 0 && (
          <Stack spacing={2}>
            <Typography variant="subtitle1" fontWeight={600}>
              Wallpaper
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 2,
              }}
            >
              {WALLPAPERS.map((wp) => (
                <Box
                  key={wp.id}
                  onClick={() => applyWallpaper(wp.id)}
                  sx={{
                    borderRadius: 2,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    border:
                      wallpaper === wp.id
                        ? '2px solid #2196F3'
                        : '2px solid transparent',
                    transition: 'border 0.15s ease, transform 0.15s ease',
                    '&:hover': { transform: 'scale(1.02)' },
                  }}
                >
                  <Box
                    sx={{
                      height: 80,
                      background: wp.css,
                    }}
                  />
                  <Box sx={{ p: 1, textAlign: 'center' }}>
                    <Typography variant="caption">{wp.name}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Stack>
        )}

        {tab === 1 && (
          <Stack spacing={2} sx={{ maxWidth: 480 }}>
            <Typography variant="subtitle1" fontWeight={600}>
              System
            </Typography>
            <TextField
              label="Hostname"
              value={system.hostname}
              size="small"
              InputProps={{ readOnly: true }}
            />
            <TextField
              select
              label="Locale"
              value={system.locale}
              size="small"
              InputProps={{ readOnly: true }}
            >
              <MenuItem value={system.locale}>{system.locale}</MenuItem>
            </TextField>
            <TextField
              label="Timezone"
              value={system.timezone}
              size="small"
              InputProps={{ readOnly: true }}
            />

            <Divider sx={{ my: 1 }} />

            <Typography variant="subtitle2" fontWeight={600}>
              Network
            </Typography>
            {network ? (
              <Stack spacing={0.5}>
                <Typography variant="body2">
                  Status:{' '}
                  <strong style={{ color: network.connected ? '#4CAF50' : '#F44336' }}>
                    {network.connected ? 'Connected' : 'Disconnected'}
                  </strong>
                </Typography>
                <Typography variant="body2">SSID: {network.ssid}</Typography>
                <Typography variant="body2">Type: {network.type}</Typography>
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Loading network status…
              </Typography>
            )}
          </Stack>
        )}

        {tab === 2 && (
          <Stack spacing={1.5}>
            <Typography variant="h6" fontWeight={700}>
              About
            </Typography>
            <Divider />
            <InfoRow k="Operating System" v={aboutInfo.os} />
            <InfoRow k="Desktop Shell" v={aboutInfo.shell} />
            <InfoRow k="Kernel" v={aboutInfo.kernel} />
            <InfoRow k="Architecture" v={aboutInfo.arch} />
            <InfoRow k="Compositor" v={aboutInfo.compositor} />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 2 }}>
              GeckoOS is a custom Linux-based operating system focused on
              Wayland compositing and webOS-inspired UI patterns.
            </Typography>
          </Stack>
        )}
      </Box>
    </Box>
  );
};

const InfoRow: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <Stack direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
    <Typography variant="body2" color="text.secondary">
      {k}
    </Typography>
    <Typography variant="body2" fontWeight={500}>
      {v}
    </Typography>
  </Stack>
);

export default SettingsApp;

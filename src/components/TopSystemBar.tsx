import React, { useState, useRef } from 'react';
import {
  Box,
  IconButton,
  TextField,
  Modal,
  Paper,
  Grid,
  Switch,
  FormControlLabel,
  Typography,
  Slider,
} from '@mui/material';
import {
  Search,
  Bell,
  Settings,
  Wifi,
  Battery as BatteryIcon,
  Menu,
  Battery,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface QuickSettingsPanel {
  type: 'notifications' | 'settings' | 'wifi' | 'battery' | null;
  anchorEl: HTMLElement | null;
}

export const TopSystemBar: React.FC = () => {
  const [activePanel, setActivePanel] = useState<{
    type: 'notification' | 'settings' | 'wifi' | 'battery' | null;
    anchorEl: HTMLElement | null;
  }>({ type: null, anchorEl: null });
  const [darkMode, setDarkMode] = useState(false);

  const currentTime = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleQuickSettingsClick = (
    type: 'notification' | 'settings' | 'wifi' | 'battery',
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    setActivePanel({
      type: activePanel.type === type ? null : type,
      anchorEl: event.currentTarget,
    });
  };

  const handleClose = () => {
    setActivePanel({ type: null, anchorEl: null });
  };

  const getPanelPosition = () => {
    if (!activePanel.anchorEl) return {};
    const rect = activePanel.anchorEl.getBoundingClientRect();
    return {
      position: 'absolute' as const,
      top: rect.bottom + 8,
      right: window.innerWidth - rect.right,
    };
  };

  return (
    <>
      {/* Top System Bar */}
      <Box
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          gap: 2,
          background: 'rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(15px)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          boxShadow: '0px 2px 4px -1px rgba(0,0,0,0.2), 0px 4px 5px 0px rgba(0,0,0,0.14), 0px 1px 10px 0px rgba(0,0,0,0.12)',
          borderRadius: 0, // 0px rounding for top bar as per requirements
          zIndex: 1200,
        }}
      >
        {/* Left: Search Bar */}
        <TextField
          placeholder="Search..."
          size="small"
          sx={{
            flex: '0 1 300px',
            '& .MuiOutlinedInput-root': {
              height: 36,
            },
          }}
          InputProps={{
            startAdornment: <Search size={18} style={{ marginRight: 8, opacity: 0.6 }} />,
          }}
        />

        {/* Right: Quick Settings Icons */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <IconButton
            size="small"
            onClick={(e) => handleQuickSettingsClick('notification', e)}
            sx={{
              color: activePanel.type === 'notification' ? 'primary.main' : 'text.primary',
            }}
          >
            <Bell size={20} />
          </IconButton>

          <IconButton
            size="small"
            onClick={(e) => handleQuickSettingsClick('settings', e)}
            sx={{
              color: activePanel.type === 'settings' ? 'primary.main' : 'text.primary',
            }}
          >
            <Settings size={20} />
          </IconButton>

          <IconButton
            size="small"
            onClick={(e) => handleQuickSettingsClick('wifi', e)}
            sx={{
              color: activePanel.type === 'wifi' ? 'primary.main' : 'text.primary',
            }}
          >
            <Wifi size={20} />
          </IconButton>

          <IconButton
            size="small"
            onClick={(e) => handleQuickSettingsClick('battery', e)}
            sx={{
              color: activePanel.type === 'battery' ? 'primary.main' : 'text.primary',
            }}
          >
            <Battery size={20} />
          </IconButton>

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
      </Box>

      {/* Quick Settings Panels */}
      {activePanel.type && (
        <>
          {/* Backdrop */}
          <Box
            onClick={handleClose}
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1299,
            }}
          />

          {/* Panel */}
          <Box
            component={motion.div}
            initial={{ opacity: 0, scale: 0.8, transformOrigin: 'top right' }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            sx={{
              ...getPanelPosition(),
              zIndex: 1300,
              minWidth: 320,
              maxWidth: 400,
            }}
          >
            <Paper
              elevation={4}
              sx={{
                p: 2,
                background: 'rgba(255, 255, 255, 0.2)',
                backdropFilter: 'blur(15px)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
              }}
            >
              {/* Notification Panel */}
              {activePanel.type === 'notification' && (
                <Box>
                  <Box sx={{ mb: 2, fontSize: '1rem', fontWeight: 600 }}>
                    Notifications
                  </Box>
                  <Box sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                    No new notifications
                  </Box>
                </Box>
              )}

              {/* Settings Panel */}
              {activePanel.type === 'settings' && (
                <Box>
                  <Box sx={{ mb: 2, fontSize: '1rem', fontWeight: 600 }}>
                    Quick Settings
                  </Box>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={darkMode}
                            onChange={(e) => setDarkMode(e.target.checked)}
                          />
                        }
                        label="Dark Mode"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <FormControlLabel
                        control={<Switch defaultChecked />}
                        label="Notifications"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <FormControlLabel
                        control={<Switch defaultChecked />}
                        label="Auto-brightness"
                      />
                    </Grid>
                  </Grid>
                </Box>
              )}

              {/* WiFi Panel */}
              {activePanel.type === 'wifi' && (
                <Box>
                  <Box sx={{ mb: 2, fontSize: '1rem', fontWeight: 600 }}>
                    WiFi
                  </Box>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <FormControlLabel
                        control={<Switch defaultChecked />}
                        label="WiFi Enabled"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                        Connected to: Home Network
                      </Box>
                    </Grid>
                  </Grid>
                </Box>
              )}

              {/* Battery Panel */}
              {activePanel.type === 'battery' && (
                <Box>
                  <Box sx={{ mb: 2, fontSize: '1rem', fontWeight: 600 }}>
                    Battery
                  </Box>
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ fontSize: '2rem', fontWeight: 600, mb: 0.5 }}>
                      87%
                    </Box>
                    <Box sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                      About 5 hours remaining
                    </Box>
                  </Box>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <FormControlLabel
                        control={<Switch />}
                        label="Low Power Mode"
                      />
                    </Grid>
                    <Grid item xs={12}>
                      <FormControlLabel
                        control={<Switch defaultChecked />}
                        label="Battery Percentage"
                      />
                    </Grid>
                  </Grid>
                </Box>
              )}
            </Paper>
          </Box>
        </>
      )}
    </>
  );
};
import React, { useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import { Repanel, Item } from 'remochi';
import { Grid3x3, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppHost, usePyxisTheme } from '@pyxis/app-sdk';
import { PYXIS_APPS } from '../apps/registry';
import type { AppLifecycleState } from '../types';
import '../styles/pinned-item-overrides.css';

// Pinned strip mirrors the registry (src/apps/registry.ts) — one source of
// truth for which apps exist and how they open.
const PINNED_APPS = PYXIS_APPS.filter((a) => a.pinned).map((a) => ({
  id: a.id,
  label: a.name,
  Icon: a.icon,
}));

// Visual styling per AppHost lifecycle state. Centralised here so the dock
// and other consumers can reuse the same vocabulary.
function badgeColor(state: AppLifecycleState | null): string | null {
  switch (state) {
    case 'starting':
      return '#FFB74D'; // amber
    case 'running':
      return '#4CAF50'; // green
    case 'crashed':
      return '#F44336'; // red
    default:
      return null;
  }
}

interface LeftLauncherProps {
  onAppSelect?: (appId: string) => void;
  activeApp?: string;
  isCompact?: boolean; // New prop
  appDrawerOpen: boolean;
  onOpenAppDrawer: () => void;
}

export const LeftLauncher: React.FC<LeftLauncherProps> = ({
  onAppSelect,
  activeApp,
  isCompact = false,
  appDrawerOpen,
  onOpenAppDrawer,
}) => {
  const [hoveredApp, setHoveredApp] = useState<string | null>(null);
  const { stateForApp, sessionForApp, manifests } = useAppHost();

  // remochi Panel style follows the shell theme: dark mode uses the
  // "shadow" variant, light mode uses "default".
  const theme = usePyxisTheme('light');
  const panelStyle = theme === 'dark' ? 'shadow' : 'default';

  // Calculate dimensions based on compact mode
  const height = isCompact ? 40 : 64;
  const iconSize = isCompact ? 20 : 24;
  const buttonSize = isCompact ? 36 : 48;

  // Pinned apps render as remochi `Item`s with padding/gap stripped via
  // .pinned-item (src/styles/pinned-item-overrides.css), so each Item is
  // exactly icon-sized — no dead trailing content slot to work around.
  const itemVariant = isCompact ? 'compact' : 'default';

  return (
    <>
      {/* Left Launcher Dock — app drawer + pinned apps, bottom-left corner.
          The Panel is flipped horizontally about its own origin (transform:
          scaleX(-1)) to mirror its default rounded-corner shape; the
          content wrapper carries the same flip again to cancel it back
          out so icons/tooltips render upright. */}
      <Box
        component={motion.div}
        animate={{ height }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        sx={{
          position: 'fixed',
          left: 0,
          bottom: 0,
          zIndex: 1100,
          display: 'inline-flex',
          transform: 'scaleX(-1)',
        }}
      >
        <Repanel style={panelStyle}>
          <Box
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: isCompact ? 0.5 : 1,
              transform: 'scaleX(-1)',
            }}
          >
        {/* App Drawer Button */}
        <Tooltip title="App Drawer" placement="top">
          <IconButton
            onClick={onOpenAppDrawer}
            component={motion.button}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            sx={{
              width: buttonSize,
              height: buttonSize,
              borderRadius: '12px',
              color: 'var(--color-text)',
              backgroundColor: appDrawerOpen ? 'var(--mochi-primary-soft)' : 'transparent',
              border: appDrawerOpen ? '2px solid var(--color-primary)' : '2px solid transparent',
              transition: 'all 0.2s ease',
              '&:hover': {
                backgroundColor: 'var(--mochi-hover)',
              },
            }}
          >
            <Grid3x3 size={iconSize} />
          </IconButton>
        </Tooltip>

        {/* Divider */}
        <Box
          sx={{
            height: '70%',
            width: '1px',
            backgroundColor: 'var(--color-border)',
            mx: 0.5,
          }}
        />

        {/* Pinned Apps */}
        {PINNED_APPS.map(({ id, label, Icon }) => {
          const isActive = activeApp === id;
          const lifecycleState = stateForApp(id);
          const session = sessionForApp(id);
          const manifest = manifests.find((m) => m.id === id);
          const dot = badgeColor(lifecycleState);
          // hovered state still tracked via hoveredApp for descendant styles
          void hoveredApp;

          // Tooltip surfaces id/version/state per spec when running.
          const tooltipTitle = lifecycleState
            ? `${label} · ${manifest?.id ?? id}${
                manifest?.version ? ` v${manifest.version}` : ''
              } · ${lifecycleState}${
                session?.pid ? ` (pid ${session.pid})` : ''
              }`
            : label;

          return (
            <Box
              key={id}
              sx={{ position: 'relative' }}
              onMouseEnter={() => setHoveredApp(id)}
              onMouseLeave={() => setHoveredApp(null)}
            >
              <Tooltip title={tooltipTitle} placement="top" arrow>
                {/* span wrapper: Item doesn't forward a ref, so MUI's
                    Tooltip needs a DOM-forwarding child to anchor to. */}
                <span>
                  <Item
                    className="pinned-item"
                    icon={<Icon size={iconSize} />}
                    selected={isActive}
                    variant={itemVariant}
                    onClick={() => onAppSelect?.(id)}
                  />
                </span>
              </Tooltip>

              {/* Lifecycle dot — amber=starting, green=running */}
              {dot && lifecycleState !== 'crashed' && (
                <Box
                  component={motion.div}
                  key={lifecycleState}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  sx={{
                    position: 'absolute',
                    bottom: 4,
                    right: 4,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: dot,
                    boxShadow: `0 0 6px ${dot}`,
                    pointerEvents: 'none',
                    ...(lifecycleState === 'starting'
                      ? {
                          animation: 'pyxisPulse 1s ease-in-out infinite',
                          '@keyframes pyxisPulse': {
                            '0%, 100%': { opacity: 1 },
                            '50%': { opacity: 0.4 },
                          },
                        }
                      : {}),
                  }}
                />
              )}

              {/* Crashed warning badge */}
              {lifecycleState === 'crashed' && (
                <Box
                  component={motion.div}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  sx={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    backgroundColor: '#F44336',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid rgba(255,255,255,0.6)',
                    pointerEvents: 'none',
                  }}
                >
                  <AlertTriangle size={10} color="#fff" />
                </Box>
              )}

              {/* Active Indicator Bar — mirrors remochi's ViewSelectButton
                  .mochi-button-bar underline (flush, 2px, primary, square
                  corners) instead of a floating pill, offset -8px below
                  the icon so it doesn't sit flush against it. */}
              <AnimatePresence>
                {isActive && (
                  <Box
                    component={motion.div}
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    exit={{ scaleX: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    sx={{
                      position: 'absolute',
                      bottom: -8,
                      left: 0,
                      width: '100%',
                      height: '2px',
                      backgroundColor: 'var(--mochi-primary)',
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </AnimatePresence>
            </Box>
          );
        })}
          </Box>
        </Repanel>
      </Box>
    </>
  );
};

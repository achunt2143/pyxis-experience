import React, { useState, useMemo } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { Repanel } from 'remochi';
import { motion, AnimatePresence } from 'framer-motion';
import type { DesktopWindowType } from '../types';
import { Globe, X, AlertTriangle } from 'lucide-react';
import { useAppHost, usePyxisTheme } from '@pyxis/app-sdk';
import { PYXIS_APPS } from '../apps/registry';

// Icon mapping derived from the app registry; unknown app ids fall back to
// a generic globe below.
const APP_ICONS: { [key: string]: React.FC<{ size?: number }> } =
  Object.fromEntries(PYXIS_APPS.map((a) => [a.id, a.icon]));

interface BottomDockProps {
  windows: DesktopWindowType[];
  activeWindowId?: string;
  onWindowSelect?: (windowId: string) => void;
  onWindowClose?: (windowId: string) => void;
  /** Click on an app with a real running session but no local window record
   * (the orphan-icon branch below) — the normal case in compositor mode,
   * since real launches never create a local window (see Desktop.tsx). */
  onOrphanSelect?: (appId: string, crashed: boolean) => void;
  isCompact?: boolean; // New prop
}

// Toggle this to switch between expansion styles
const EXPAND_TO_SUBDOCK = false; // Set to true for horizontal "dock-within-a-dock" layout

export const BottomDock: React.FC<BottomDockProps> = ({
  windows,
  activeWindowId,
  onWindowSelect,
  onWindowClose,
  onOrphanSelect,
  isCompact = false,
}) => {
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [hoveredWindow, setHoveredWindow] = useState<string | null>(null);
  const { stateForApp, sessionForApp, sessions } = useAppHost();
  const iconSize = isCompact ? 28 : 56;
  const badgeSize = isCompact ? 16 : 20;
  const padding = isCompact ? 1 : 1.5;

  // remochi Panel style follows the shell theme: dark mode uses the
  // "shadow" variant, light mode uses "default".
  const theme = usePyxisTheme('light');
  const panelStyle = theme === 'dark' ? 'shadow' : 'default';

  // Apps with running sessions but no open windows still belong on the dock
  // — the dock now reflects "running sessions" not just "open windows". We
  // synthesize phantom-window groups for any orphan running session.
  const orphanAppIds = useMemo(() => {
    const openAppIds = new Set(windows.map((w) => w.appId));
    const seen = new Set<string>();
    Object.values(sessions).forEach((s) => {
      if (
        (s.state === 'running' ||
          s.state === 'starting' ||
          // A suspended app is minimized, not gone — it MUST keep its dock
          // icon, since clicking it is the only way to restore it (focusApp
          // -> Nova.Focus -> Evo unminimize + SIGCONT resume). Omitting it
          // here is exactly why "restore from the dock" did nothing.
          s.state === 'suspended' ||
          s.state === 'crashed') &&
        !openAppIds.has(s.appId)
      ) {
        seen.add(s.appId);
      }
    });
    return Array.from(seen);
  }, [windows, sessions]);

  // Group windows by app, then add phantom entries for orphan running sessions.
  const groupedWindows = useMemo(() => {
    const groups: { [key: string]: DesktopWindowType[] } = {};
    windows.forEach((w) => {
      if (!groups[w.appId]) {
        groups[w.appId] = [];
      }
      groups[w.appId].push(w);
    });
    orphanAppIds.forEach((appId) => {
      if (!groups[appId]) groups[appId] = [];
    });
    return groups;
  }, [windows, orphanAppIds]);

  const visibleWindows = windows.filter((w) => w.state !== 'minimized');
  const hasAnythingToShow =
    visibleWindows.length > 0 || orphanAppIds.length > 0;

  // Calculate dynamic dock width for subdock expansion
  const dockWidth = useMemo(() => {
    if (EXPAND_TO_SUBDOCK && expandedGroup) {
      const expandedWindows = groupedWindows[expandedGroup]?.length || 0;
      return Math.max(300, expandedWindows * 70 + 100);
    }
    return 'auto';
  }, [expandedGroup, groupedWindows]);

  if (!hasAnythingToShow) {
    return null;
  }

  return (
    // Active Dock — running/open windows, bottom-right corner. Wrapped in a
    // remochi Panel using its default shape (rounds the left corners, flush
    // right), which already fits a right-docked panel with no override.
    <Box
      component={motion.div}
      initial={{ y: 100, opacity: 0 }}
      animate={{
        y: 0,
        opacity: 1,
        width: dockWidth,
        height: isCompact ? 48 : 'auto'
      }}
      exit={{ y: 100, opacity: 0 }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
        width: { duration: 0.3 },
        height: { duration: 0.3 }
      }}
      sx={{
        position: 'fixed',
        right: 0,
        bottom: 0,
        zIndex: 1100,
      }}
    >
      <Repanel style={panelStyle}>
        <Box
          sx={{
            height: '100%',
            display: 'flex',
            alignItems: 'flex-end',
            gap: isCompact ? 1 : 2,
            px: isCompact ? 1 : 2,
            py: padding,
            color: 'var(--color-text)',
          }}
        >
      <AnimatePresence mode="popLayout">
        {Object.entries(groupedWindows).map(([appId, appWindows]) => {
          const Icon = APP_ICONS[appId] || Globe;
          const isHovered = hoveredGroup === appId;
          const isExpanded = expandedGroup === appId;
          const hasMultiple = appWindows.length > 1;
          const lifecycleState = stateForApp(appId);
          const session = sessionForApp(appId);
          const isActiveGroup = appWindows.some((w) => w.id === activeWindowId);

          return (
            <Box
              key={appId}
              component={motion.div}
              layout
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              onMouseEnter={() => setHoveredGroup(appId)}
              onMouseLeave={() => setHoveredGroup(null)}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                position: 'relative',
              }}
            >
              {/* Expanded Grid View (Above Dock) */}
              {isExpanded && hasMultiple && !EXPAND_TO_SUBDOCK && (
                <Box
                  component={motion.div}
                  initial={{ opacity: 0, y: 20, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  sx={{
                    position: 'absolute',
                    bottom: '100%',
                    mb: 2,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: 1.5,
                    p: 2,
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '16px',
                    boxShadow: '0px 2px 4px -1px rgba(0,0,0,0.2), 0px 4px 5px 0px rgba(0,0,0,0.14)',
                    minWidth: 280,
                    maxWidth: 400,
                    zIndex: 1200,
                  }}
                >
                  <AnimatePresence mode="popLayout">
                    {appWindows.map((win, idx) => (
                      <Box
                        key={win.id}
                        component={motion.div}
                        layout
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ delay: idx * 0.05 }}
                        onMouseEnter={() => setHoveredWindow(win.id)}
                        onMouseLeave={() => setHoveredWindow(null)}
                        onClick={() => {
                          onWindowSelect?.(win.id);
                          setExpandedGroup(null);
                        }}
                        sx={{
                          p: 1.5,
                          borderRadius: '12px',
                          cursor: 'pointer',
                          background: hoveredWindow === win.id
                            ? 'var(--mochi-primary-soft)'
                            : 'var(--mochi-hover)',
                          border: `1px solid ${hoveredWindow === win.id
                            ? 'var(--color-primary)'
                            : 'var(--color-border-light)'}`,
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 1,
                          position: 'relative',
                          '&:hover': {
                            transform: 'scale(1.05)',
                          },
                        }}
                      >
                        <Icon size={isCompact ? 20 : 28} />
                        <Typography variant="caption" noWrap sx={{ maxWidth: '100%', fontSize: '0.75rem' }}>
                          {win.title}
                        </Typography>
                        <IconButton
                          component={motion.button}
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            onWindowClose?.(win.id);
                          }}
                          sx={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            width: iconSize,
                            height: iconSize,
                            '&:hover': { color: 'error.main' },
                          }}
                        >
                          <X size={14} />
                        </IconButton>
                      </Box>
                    ))}
                  </AnimatePresence>
                </Box>
              )}

              {/* Subdock Expansion (Horizontal) */}
              {isExpanded && hasMultiple && EXPAND_TO_SUBDOCK && (
                <Box
                  component={motion.div}
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 'auto', opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  sx={{
                    display: 'flex',
                    gap: 1,
                    position: 'absolute',
                    left: '100%',
                    ml: 1,
                    alignItems: 'center',
                  }}
                >
                  <AnimatePresence mode="popLayout">
                    {appWindows.map((win, idx) => (
                      <Tooltip key={win.id} title={win.title} placement="top">
                        <IconButton
                          component={motion.button}
                          layout
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0, opacity: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          onClick={() => {
                            onWindowSelect?.(win.id);
                            setExpandedGroup(null);
                          }}
                          sx={{
                            width: iconSize,
                            height: iconSize,
                            borderRadius: '12px',
                            background: 'var(--mochi-hover)',
                            border: '1px solid var(--color-border-light)',
                            '&:hover': {
                              background: 'var(--mochi-primary-soft)',
                              border: '1px solid var(--color-primary)',
                            },
                          }}
                        >
                          <Icon size={isCompact ? 20 : 28} />
                        </IconButton>
                      </Tooltip>
                    ))}
                  </AnimatePresence>
                </Box>
              )}

              {/* Main Icon/Thumbnail Stack with 3D Isometric Effect */}
              <Box
                sx={{
                  position: 'relative',
                  perspective: '1000px',
                  transformStyle: 'preserve-3d',
                }}
              >
                {appWindows.length === 0 ? (
                  // Orphan running session — a real Nova-launched process
                  // that Evo composites/decorates in its own window
                  // elsewhere on screen, not a local DOM window Bloom
                  // controls. This is the normal, expected shape for every
                  // running app in compositor mode (see Desktop.tsx —
                  // real launches never create a local window record).
                  <Tooltip
                    key={`orphan-${appId}`}
                    title={`${appId}${
                      session?.pid ? ` · pid ${session.pid}` : ''
                    } · ${lifecycleState ?? 'running'}${
                      lifecycleState === 'crashed' ? ' · click to relaunch' : ''
                    }${
                      lifecycleState === 'suspended' ? ' · click to restore' : ''
                    }`}
                    placement="top"
                  >
                    <IconButton
                      component={motion.button}
                      animate={{
                        scale: isHovered ? 1.1 : 1,
                        y: isHovered ? -8 : 0,
                      }}
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                      onClick={() =>
                        onOrphanSelect?.(appId, lifecycleState === 'crashed')
                      }
                      sx={{
                        width: iconSize,
                        height: iconSize,
                        borderRadius: '12px',
                        background: 'var(--mochi-hover)',
                        border: '1px dashed var(--color-border)',
                        color: 'var(--color-text)',
                        position: 'relative',
                        '&:hover': {
                          background: 'var(--mochi-active)',
                        },
                      }}
                    >
                      <Icon size={isCompact ? 20 : 28} />
                    </IconButton>
                  </Tooltip>
                ) : (
                  appWindows.map((win, idx) => {
                    const isLast = idx === appWindows.length - 1;
                    const shouldShowStacked = hasMultiple && !isExpanded;

                    return (
                      <Tooltip
                        key={win.id}
                        title={`${win.title}${
                          session?.pid ? ` · pid ${session.pid}` : ''
                        }${lifecycleState ? ` · ${lifecycleState}` : ''}`}
                        placement="top"
                      >
                        <IconButton
                          component={motion.button}
                          animate={{
                            scale: isHovered ? 1.1 : 1,
                            y: isHovered ? -8 : 0,
                            x: shouldShowStacked ? idx * 8 : 0,
                            z: shouldShowStacked ? idx * -5 : 0,
                            rotateY: shouldShowStacked ? -25 : 0, // 3D stacking rotation
                          }}
                          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                          onClick={() => {
                            if (hasMultiple && !isExpanded) {
                              setExpandedGroup(appId);
                            } else {
                              onWindowSelect?.(win.id);
                              setExpandedGroup(null);
                            }
                          }}
                          sx={{
                            width: iconSize,
                            height: iconSize,
                            borderRadius: '12px',
                            background: 'var(--mochi-hover)',
                            border: '1px solid var(--color-border-light)',
                            color: 'var(--color-text)',
                            position: shouldShowStacked && !isLast ? 'absolute' : 'relative',
                            top: 0,
                            left: 0,
                            boxShadow: shouldShowStacked
                              ? '2px 2px 8px rgba(0,0,0,0.2)'
                              : '0px 2px 4px rgba(0,0,0,0.1)',
                            zIndex: idx,
                            transformStyle: 'preserve-3d',
                            '&:hover': {
                              background: 'var(--mochi-active)',
                            },
                          }}
                        >
                          <Icon size={isCompact ? 20 : 28} />
                        </IconButton>
                      </Tooltip>
                    );
                  })
                )}

                {/* Active app bar — mirrors remochi's ViewSelectButton
                    .mochi-button-bar underline (flush, 2px, primary,
                    square corners) instead of a floating pill, offset
                    -8px below the icon so it doesn't sit flush against
                    it. */}
                <AnimatePresence>
                  {isActiveGroup && (
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
                        width: iconSize,
                        height: '2px',
                        backgroundColor: 'var(--mochi-primary)',
                        pointerEvents: 'none',
                      }}
                    />
                  )}
                </AnimatePresence>
              </Box>

              {/* Badge for multiple windows */}
              {hasMultiple && !isExpanded && (
                <Box
                  component={motion.div}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  sx={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    minWidth: badgeSize,
                    height: badgeSize,
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, var(--color-secondary, #6aaedb) 0%, var(--color-primary, #4a8bc2) 100%)',
                    color: 'white',
                    fontSize: isCompact ? '0.6rem' : '0.7rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    px: 0.5,
                    border: '2px solid rgba(255, 255, 255, 0.5)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    zIndex: 10,
                  }}
                >
                  {appWindows.length}
                </Box>
              )}

              {/* Lifecycle indicator under the icon (running / starting). */}
              {lifecycleState === 'running' && (
                <Box
                  sx={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    backgroundColor: '#4CAF50',
                    boxShadow: '0 0 4px #4CAF50',
                  }}
                />
              )}
              {lifecycleState === 'starting' && (
                <Box
                  sx={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    backgroundColor: '#FFB74D',
                    boxShadow: '0 0 4px #FFB74D',
                    animation: 'pyxisDockPulse 1s ease-in-out infinite',
                    '@keyframes pyxisDockPulse': {
                      '0%, 100%': { opacity: 1 },
                      '50%': { opacity: 0.3 },
                    },
                  }}
                />
              )}

              {/* Suspended (minimized): a static amber dot — distinct from the
                  running green dot — so a paused app reads as present but
                  parked, and the user knows there's something to click back. */}
              {lifecycleState === 'suspended' && (
                <Box
                  sx={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    backgroundColor: '#FFA726',
                    boxShadow: '0 0 4px #FFA726',
                    opacity: 0.85,
                  }}
                />
              )}

              {/* Crashed warning overlay. */}
              {lifecycleState === 'crashed' && (
                <Box
                  component={motion.div}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  sx={{
                    position: 'absolute',
                    top: -4,
                    left: -4,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    backgroundColor: '#F44336',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid rgba(255,255,255,0.6)',
                    zIndex: 11,
                  }}
                >
                  <AlertTriangle size={10} color="#fff" />
                </Box>
              )}
            </Box>
          );
        })}
      </AnimatePresence>
        </Box>
      </Repanel>
    </Box>
  );
};

export default BottomDock;

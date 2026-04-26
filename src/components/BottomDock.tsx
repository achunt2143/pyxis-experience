import React, { useState, useMemo } from 'react';
import { Box, IconButton, Tooltip, Typography } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import type { DesktopWindowType } from '../types';
import { Terminal, Folder, FileText, Globe, Settings, X } from 'lucide-react';
import { useEcho } from '../services/useEcho';

// Icon mapping
const APP_ICONS: { [key: string]: React.FC<{ size?: number }> } = {
  terminal: Terminal,
  files: Folder,
  editor: FileText,
  browser: Globe,
  settings: Settings,
};

interface BottomDockProps {
  windows: DesktopWindowType[];
  onWindowSelect?: (windowId: string) => void;
  onWindowClose?: (windowId: string) => void;
  isCompact?: boolean; // New prop
}

// Toggle this to switch between expansion styles
const EXPAND_TO_SUBDOCK = false; // Set to true for horizontal "dock-within-a-dock" layout

export const BottomDock: React.FC<BottomDockProps> = ({
  windows,
  onWindowSelect,
  onWindowClose,
  isCompact = false,
}) => {
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [hoveredWindow, setHoveredWindow] = useState<string | null>(null);
  const echo = useEcho();
  const iconSize = isCompact ? 28 : 56;
  const badgeSize = isCompact ? 16 : 20;
  const padding = isCompact ? 1 : 1.5;

  // Group windows by app
  const groupedWindows = useMemo(() => {
    const groups: { [key: string]: DesktopWindowType[] } = {};
    windows.forEach((w) => {
      if (!groups[w.appId]) {
        groups[w.appId] = [];
      }
      groups[w.appId].push(w);
    });
    return groups;
  }, [windows]);

  const visibleWindows = windows.filter((w) => w.state !== 'minimized');

  // Calculate dynamic dock width for subdock expansion
  const dockWidth = useMemo(() => {
    if (EXPAND_TO_SUBDOCK && expandedGroup) {
      const expandedWindows = groupedWindows[expandedGroup]?.length || 0;
      return Math.max(300, expandedWindows * 70 + 100);
    }
    return 'auto';
  }, [EXPAND_TO_SUBDOCK, expandedGroup, groupedWindows]);

  if (visibleWindows.length === 0) {
    return null;
  }

  return (
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
        bottom: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'flex-end',
        gap: isCompact ? 1 : 2,
        px: isCompact ? 1 : 2,
        py: padding,
        background: 'rgba(255, 255, 255, 0.2)',
        backdropFilter: 'blur(15px)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        borderRadius: '16px', // 16px border radius per requirements
        boxShadow: '0px 2px 4px -1px rgba(0,0,0,0.2), 0px 4px 5px 0px rgba(0,0,0,0.14), 0px 1px 10px 0px rgba(0,0,0,0.12)', // Elevation 4
        zIndex: 1100,
      }}
    >
      <AnimatePresence mode="popLayout">
        {Object.entries(groupedWindows).map(([appId, appWindows]) => {
          const Icon = APP_ICONS[appId] || Globe;
          const isHovered = hoveredGroup === appId;
          const isExpanded = expandedGroup === appId;
          const hasMultiple = appWindows.length > 1;

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
                    background: 'rgba(255, 255, 255, 0.2)',
                    backdropFilter: 'blur(15px)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '16px',
                    boxShadow: '0px 2px 4px -1px rgba(0,0,0,0.2), 0px 4px 5px 0px rgba(0,0,0,0.14), 0px 1px 10px 0px rgba(0,0,0,0.12)',
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
                            ? 'rgba(33, 150, 243, 0.2)' 
                            : 'rgba(255, 255, 255, 0.1)',
                          border: `1px solid ${hoveredWindow === win.id 
                            ? 'rgba(33, 150, 243, 0.5)' 
                            : 'rgba(255, 255, 255, 0.2)'}`,
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
                            background: 'rgba(255, 255, 255, 0.1)',
                            border: '1px solid rgba(255, 255, 255, 0.2)',
                            '&:hover': {
                              background: 'rgba(33, 150, 243, 0.2)',
                              border: '1px solid rgba(33, 150, 243, 0.5)',
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
                {appWindows.map((win, idx) => {
                  const isLast = idx === appWindows.length - 1;
                  const shouldShowStacked = hasMultiple && !isExpanded;

                  return (
                    <Tooltip key={win.id} title={win.title} placement="top">
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
                            // Notify the AppManager via Echo that this app
                            // was activated. In native context this triggers
                            // SIGUSR1 raise-to-front; in dev it's a no-op mock.
                            echo.launchApp(appId).catch(() => {});
                            setExpandedGroup(null);
                          }
                        }}
                        sx={{
                          width: iconSize,
                          height: iconSize,
                          borderRadius: '12px',
                          background: 'rgba(255, 255, 255, 0.15)',
                          border: '1px solid rgba(255, 255, 255, 0.3)',
                          position: shouldShowStacked && !isLast ? 'absolute' : 'relative',
                          top: 0,
                          left: 0,
                          boxShadow: shouldShowStacked 
                            ? '2px 2px 8px rgba(0,0,0,0.2)' 
                            : '0px 2px 4px rgba(0,0,0,0.1)',
                          zIndex: idx,
                          transformStyle: 'preserve-3d',
                          '&:hover': {
                            background: 'rgba(255, 255, 255, 0.25)',
                          },
                        }}
                      >
                        <Icon size={isCompact ? 20 : 28} />
                      </IconButton>
                    </Tooltip>
                  );
                })}
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
                    background: 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)',
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
            </Box>
          );
        })}
      </AnimatePresence>
    </Box>
  );
};

export default BottomDock;

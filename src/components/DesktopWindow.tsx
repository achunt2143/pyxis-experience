import React from 'react';
import { Box, Typography } from '@mui/material';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { X } from 'lucide-react';
import { type DesktopWindowType } from '../types';

interface DesktopWindowProps {
  window: DesktopWindowType;
  isActive: boolean;
  onClose?: (id: string) => void;
  onMinimize?: (id: string) => void;
  onMaximize?: (id: string) => void;
  onFocus?: (id: string) => void;
  onPositionChange?: (id: string, x: number, y: number) => void;
  children?: React.ReactNode;
}

// Render the app component bound to this window, or a styled placeholder.
const WindowContent: React.FC<{
  win: DesktopWindowType;
  onClose?: (id: string) => void;
}> = ({ win, onClose }) => {
  if (win.component) {
    const AppComponent = win.component;
    return (
      <AppComponent windowId={win.id} onClose={() => onClose?.(win.id)} />
    );
  }
  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        textAlign: 'center',
        color: 'text.secondary',
        background:
          'repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0 12px, rgba(255,255,255,0.05) 12px 24px)',
        borderRadius: 2,
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 600 }} color="text.primary">
        {win.title}
      </Typography>
      <Typography variant="body2">
        No app component is registered for <code>{win.appId}</code>.
      </Typography>
      <Typography variant="caption">
        Register one in <code>src/hooks/useWindows.ts</code>.
      </Typography>
    </Box>
  );
};

// UI boundaries
const TOP_BAR_HEIGHT = 48;
const LEFT_LAUNCHER_WIDTH = 72; // Normal: 64px + 8px margin
const LEFT_LAUNCHER_WIDTH_COMPACT = 48; // Compact: 40px + 8px margin  
const BOTTOM_DOCK_HEIGHT = 80; // Normal
const BOTTOM_DOCK_HEIGHT_COMPACT = 56; // Compact: 48px + 8px margin
const TITLE_BAR_HEIGHT = 40;

export const DesktopWindow: React.FC<DesktopWindowProps> = ({
  window,
  isActive,
  onClose,
  onMinimize,
  onMaximize,
  onFocus,
  onPositionChange,
  children,
}) => {
  // Calculate maximized dimensions
  const isMaximized = window.state === 'maximized';
  const leftOffset = isMaximized ? LEFT_LAUNCHER_WIDTH_COMPACT : LEFT_LAUNCHER_WIDTH;
  const bottomOffset = isMaximized ? BOTTOM_DOCK_HEIGHT_COMPACT : BOTTOM_DOCK_HEIGHT;

  const maxWidth = isMaximized
    ? window.innerWidth - leftOffset
    : window.size.width;

  const maxHeight = isMaximized
    ? window.innerHeight - TOP_BAR_HEIGHT - bottomOffset
    : window.size.height;

  const maxX = isMaximized
    ? leftOffset
    : window.position.x;

  const maxY = window.state === 'maximized'
    ? TOP_BAR_HEIGHT
    : window.position.y;

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    let newX = window.position.x + info.offset.x;
    let newY = window.position.y + info.offset.y;

    // Constrain to boundaries
    const minY = TOP_BAR_HEIGHT;
    const maxXConstraint = window.innerWidth - window.size.width;
    const maxYConstraint = window.innerHeight - BOTTOM_DOCK_HEIGHT - TITLE_BAR_HEIGHT;

    newX = Math.max(LEFT_LAUNCHER_WIDTH, Math.min(newX, maxXConstraint));
    newY = Math.max(minY, Math.min(newY, maxYConstraint));

    onPositionChange?.(window.id, newX, newY);
  };

  return (
    <AnimatePresence>
      {window.state !== 'minimized' && (
        <Box
          component={motion.div}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{
            scale: 1,
            opacity: 1,
            x: maxX,
            y: maxY,
            width: maxWidth,
            height: maxHeight,
          }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 30,
            opacity: { duration: 0.2 }
          }}
          drag={window.state !== 'maximized'}
          dragMomentum={false}
          dragElastic={0}
          dragConstraints={{
            left: LEFT_LAUNCHER_WIDTH,
            top: TOP_BAR_HEIGHT,
            right: window.innerWidth - window.size.width,
            bottom: window.innerHeight - BOTTOM_DOCK_HEIGHT - TITLE_BAR_HEIGHT,
          }}
          onDragEnd={handleDragEnd}
          onClick={() => onFocus?.(window.id)}
          sx={{
            position: 'fixed',
            zIndex: window.zIndex,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: isActive
              ? '0px 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 2px rgba(33, 150, 243, 0.4)'
              : '0px 2px 4px -1px rgba(0,0,0,0.2), 0px 4px 5px 0px rgba(0,0,0,0.14), 0px 1px 10px 0px rgba(0,0,0,0.12)',
            transition: 'box-shadow 0.2s ease',
            cursor: window.state === 'maximized' ? 'default' : 'move',
          }}
        >
          {/* Glassy Title Bar */}
          <Box
            sx={{
              height: TITLE_BAR_HEIGHT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2,
              background: 'rgba(255, 255, 255, 0.2)',
              backdropFilter: 'blur(15px)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
              cursor: window.state === 'maximized' ? 'default' : 'move',
            }}
          >
            {/* Window Title */}
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                fontSize: '0.875rem',
                userSelect: 'none',
                color: isActive ? 'text.primary' : 'text.secondary',
              }}
            >
              {window.title}
            </Typography>

            {/* Custom Window Controls */}
            <Box
              data-no-drag
              sx={{
                display: 'flex',
                gap: 1,
                cursor: 'default',
              }}
            >
              {/* Yellow Upside-Down Triangle - Minimize */}
              <Box
                component={motion.div}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onMinimize?.(window.id);
                }}
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #FFC107 0%, #FFB300 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s ease',
                  '&:hover': {
                    boxShadow: '0 4px 12px rgba(255, 193, 7, 0.4)',
                  },
                }}
                title="Minimize"
              >
                <Box
                  sx={{
                    width: 0,
                    height: 0,
                    borderLeft: '6px solid transparent',
                    borderRight: '6px solid transparent',
                    borderTop: '8px solid rgba(0, 0, 0, 0.6)',
                  }}
                />
              </Box>

              {/* Blue Square - Maximize */}
              <Box
                component={motion.div}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onMaximize?.(window.id);
                }}
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s ease',
                  '&:hover': {
                    boxShadow: '0 4px 12px rgba(33, 150, 243, 0.4)',
                  },
                }}
                title="Maximize"
              >
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    border: '2px solid rgba(255, 255, 255, 0.8)',
                    borderRadius: '2px',
                  }}
                />
              </Box>

              {/* Red Circle - Close */}
              <Box
                component={motion.div}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose?.(window.id);
                }}
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #FF5252 0%, #D32F2F 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s ease',
                  '&:hover': {
                    boxShadow: '0 4px 12px rgba(255, 82, 82, 0.4)',
                  },
                }}
                title="Close"
              >
                <X size={14} color="rgba(255, 255, 255, 0.9)" strokeWidth={3} />
              </Box>
            </Box>
          </Box>

          {/* Content Area - Solid Background */}
          <Box
            sx={{
              flex: 1,
              overflow: 'auto',
              backgroundColor: 'background.default',
              p: 2,
            }}
          >
            {children || <WindowContent win={window} onClose={onClose} />}
          </Box>
        </Box>
      )}
    </AnimatePresence>
  );
};

export default DesktopWindow;

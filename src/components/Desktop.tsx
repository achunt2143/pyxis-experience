import React, { useMemo } from 'react';
import { Box } from '@mui/material';
import { AnimatePresence } from 'framer-motion';
import { useWindows } from '../hooks/useWindows';
import { TopSystemBar } from './TopSystemBar';
import { LeftLauncher } from './LeftLauncher';
import BottomDock from './BottomDock';
import DesktopWindow from './DesktopWindow';
import background from '../assets/background.png';

export const Desktop: React.FC = () => {
  const {
    windows,
    createWindow,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    focusWindow,
    updateWindowPosition,
    mockApps,
    activeWindowId,
  } = useWindows();

  // Check if any window is maximized
  const hasMaximizedWindow = useMemo(
    () => windows.some(w => w.state === 'maximized'),
    [windows]
  );

  return (
    <Box
      sx={{
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        position: 'relative',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        // background: background,
      }}
    >
      {/* Animated gradient overlay for depth */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'radial-gradient(circle at 20% 50%, rgba(120, 119, 198, 0.3), transparent 50%), radial-gradient(circle at 80% 80%, rgba(138, 43, 226, 0.2), transparent 50%)',
          animation: 'gradientShift 15s ease infinite',
          '@keyframes gradientShift': {
            '0%, 100%': { opacity: 0.8 },
            '50%': { opacity: 0.4 },
          },
        }}
      />

      {/* Top System Bar */}
      <TopSystemBar />

      {/* Left Launcher - shrinks to half when window maximized */}
      <LeftLauncher
        activeApp={activeWindowId ? windows.find(w => w.id === activeWindowId)?.appId : undefined}
        onAppSelect={(appId: string) => {
          const app = mockApps.find((a) => a.id === appId);
          if (app) {
            createWindow(appId, app.name);
          }
        }}
        isCompact={hasMaximizedWindow}
      />

      {/* Desktop Windows */}
      <AnimatePresence>
        {windows.map((window) => (
          <DesktopWindow
            key={window.id}
            window={window}
            isActive={window.id === activeWindowId}
            onClose={() => closeWindow(window.id)}
            onMinimize={() => minimizeWindow(window.id)}
            onMaximize={() => {
              maximizeWindow(window.id);
              focusWindow(window.id);
            }}
            onFocus={() => focusWindow(window.id)}
            onPositionChange={(id, x, y) => updateWindowPosition(id, x, y)}
          />
        ))}
      </AnimatePresence>

      {/* Bottom Dock - shrinks to half when window maximized */}
      <BottomDock
        windows={windows}
        onWindowSelect={(windowId) => {
          const window = windows.find(w => w.id === windowId);
          if (window?.state === 'minimized') {
            minimizeWindow(windowId);
          }
          focusWindow(windowId);
        }}
        onWindowClose={(windowId) => closeWindow(windowId)}
        isCompact={hasMaximizedWindow}
      />
    </Box>
  );
};

export default Desktop;

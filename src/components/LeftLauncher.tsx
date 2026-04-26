import React, { useState } from 'react';
import { Box, IconButton, Tooltip, Modal } from '@mui/material';
import { Grid3x3, Terminal, Folder, FileText, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AppDrawer from './AppDrawer';

const PINNED_APPS = [
  { id: 'terminal', label: 'Terminal', Icon: Terminal },
  { id: 'files', label: 'Files', Icon: Folder },
  { id: 'editor', label: 'Editor', Icon: FileText },
  { id: 'browser', label: 'Browser', Icon: Globe },
];

interface LeftLauncherProps {
  onAppSelect?: (appId: string) => void;
  activeApp?: string;
  isCompact?: boolean; // New prop
}

export const LeftLauncher: React.FC<LeftLauncherProps> = ({ 
  onAppSelect, 
  activeApp,
  isCompact = false 
}) => {
  const [appDrawerOpen, setAppDrawerOpen] = useState(false);
  const [hoveredApp, setHoveredApp] = useState<string | null>(null);

  // Calculate dimensions based on compact mode
  const width = isCompact ? 40 : 64;
  const iconSize = isCompact ? 20 : 24;
  const buttonSize = isCompact ? 36 : 48;

  return (
    <>
      {/* Left Launcher Bar */}
      <Box
        component={motion.div}
        animate={{
          width: width,
        }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        sx={{
          position: 'fixed',
          left: 8,
          top: 56,
          bottom: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 1,
          py: 2,
          px: isCompact ? 0.5 : 1,
          background: 'rgba(255, 255, 255, 0.2)',
          backdropFilter: 'blur(15px)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '16px',
          boxShadow: '0px 2px 4px -1px rgba(0,0,0,0.2), 0px 4px 5px 0px rgba(0,0,0,0.14), 0px 1px 10px 0px rgba(0,0,0,0.12)',
          zIndex: 1100,
        }}
      >
        {/* App Drawer Button */}
        <Tooltip title="App Drawer" placement="right">
          <IconButton
            onClick={() => setAppDrawerOpen(true)}
            component={motion.button}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            sx={{
              width: buttonSize,
              height: buttonSize,
              borderRadius: '12px',
              backgroundColor: appDrawerOpen ? 'rgba(33, 150, 243, 0.2)' : 'transparent',
              border: appDrawerOpen ? '2px solid rgba(33, 150, 243, 0.5)' : '2px solid transparent',
              transition: 'all 0.2s ease',
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
              },
            }}
          >
            <Grid3x3 size={iconSize} />
          </IconButton>
        </Tooltip>

        {/* Divider */}
        <Box
          sx={{
            width: '80%',
            height: '1px',
            backgroundColor: 'rgba(255, 255, 255, 0.3)',
            my: 0.5,
          }}
        />

        {/* Pinned Apps */}
        {PINNED_APPS.map(({ id, label, Icon }) => {
          const isActive = activeApp === id;
          const isHovered = hoveredApp === id;

          return (
            <Box
              key={id}
              sx={{ position: 'relative' }}
              onMouseEnter={() => setHoveredApp(id)}
              onMouseLeave={() => setHoveredApp(null)}
            >
              <Tooltip title={label} placement="right" arrow>
                <IconButton
                  onClick={() => onAppSelect?.(id)}
                  component={motion.button}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  sx={{
                    width: buttonSize,
                    height: buttonSize,
                    borderRadius: '12px',
                    backgroundColor: isActive
                      ? 'rgba(33, 150, 243, 0.2)'
                      : 'transparent',
                    border: isActive
                      ? '2px solid rgba(33, 150, 243, 0.5)'
                      : '2px solid transparent',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    },
                  }}
                >
                  <Icon size={iconSize} />
                </IconButton>
              </Tooltip>

              {/* Active Indicator Dot */}
              <AnimatePresence>
                {isActive && (
                  <Box
                    component={motion.div}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    sx={{
                      position: 'absolute',
                      left: -8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 4,
                      height: isCompact ? 16 : 24,
                      backgroundColor: 'primary.main',
                      borderRadius: '2px',
                    }}
                  />
                )}
              </AnimatePresence>
            </Box>
          );
        })}
      </Box>

      {/* App Drawer Modal */}
      <Modal
        open={appDrawerOpen}
        onClose={() => setAppDrawerOpen(false)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(4px)',
        }}
      >
        <Box
          component={motion.div}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2 }}
        >
          <AppDrawer onClose={() => setAppDrawerOpen(false)} onAppSelect={onAppSelect} />
        </Box>
      </Modal>
    </>
  );
};

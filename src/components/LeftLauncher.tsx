import React, { useState } from 'react';
import { Repanel, Item, Divider } from 'remochi';
import { Grid3x3, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppHost, usePyxisTheme } from '@pyxis/app-sdk';
import { getAppAccent } from '../apps/registry';
import { useApps } from '../hooks/useApps';
import { AppIcon } from './AppIcon';
import type { AppLifecycleState } from '../types';
import '../styles/pinned-item-overrides.css';

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
  // Pinned strip comes from Nova's registry (via useApps), filtered by the
  // built-in overlay's `pinned` flag — so an app that is uninstalled while
  // pinned disappears from the strip instead of leaving a dead icon.
  const { pinned: pinnedApps } = useApps();

  // remochi Panel style follows the shell theme: dark mode uses the
  // "shadow" variant, light mode uses "default".
  const theme = usePyxisTheme('light');
  const panelStyle = theme === 'dark' ? 'shadow' : 'default';

  // Calculate dimensions based on compact mode
  const height = isCompact ? 40 : 64;
  const iconSize = isCompact ? 20 : 24;

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
      <motion.div
        animate={{ height }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        style={{
          position: 'fixed',
          left: 0,
          bottom: 0,
          zIndex: 1100,
          display: 'inline-flex',
          transform: 'scaleX(-1)',
        }}
      >
        <Repanel style={panelStyle}>
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '8px',
              paddingLeft: '16px',
              paddingRight: '16px',
              paddingTop: isCompact ? '4px' : '8px',
              paddingBottom: isCompact ? '4px' : '8px',
              transform: 'scaleX(-1)',
            }}
          >
            {/* App Drawer Button via Remochi Item */}
            <div title="App Drawer" style={{ position: 'relative' }}>
              <Item
                className="pinned-item"
                icon={<Grid3x3 size={iconSize} />}
                selected={appDrawerOpen}
                variant={itemVariant}
                onClick={onOpenAppDrawer}
              />
            </div>

            {/* Remochi Vertical Divider */}
            <div style={{ height: '70%', display: 'flex', alignItems: 'center', margin: '0 4px' }}>
              <Divider orientation="vertical" style={{ height: '100%' }} />
            </div>

        {/* Pinned Apps */}
        {pinnedApps.map((app) => {
          const { id } = app;
          const label = app.name;
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

          const accent = getAppAccent(id);

          return (
            <div
              key={id}
              style={{ position: 'relative' }}
              onMouseEnter={() => setHoveredApp(id)}
              onMouseLeave={() => setHoveredApp(null)}
              title={tooltipTitle}
            >
              <Item
                className="pinned-item"
                icon={<AppIcon app={app} size={iconSize} />}
                selected={isActive}
                variant={itemVariant}
                onClick={() => onAppSelect?.(id)}
              />

              {/* Lifecycle dot — amber=starting, green=running */}
              {dot && lifecycleState !== 'crashed' && (
                <motion.div
                  key={lifecycleState}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  style={{
                    position: 'absolute',
                    bottom: 4,
                    right: 4,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: dot,
                    boxShadow: `0 0 6px ${dot}`,
                    pointerEvents: 'none',
                  }}
                />
              )}

              {/* Crashed warning badge */}
              {lifecycleState === 'crashed' && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  style={{
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
                </motion.div>
              )}

              {/* Active Indicator Bar */}
              <AnimatePresence>
                {isActive && (
                  <motion.div
                    initial={{ scaleX: 0, opacity: 0 }}
                    animate={{ scaleX: 1, opacity: 1 }}
                    exit={{ scaleX: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    style={{
                      position: 'absolute',
                      bottom: -8,
                      left: 0,
                      width: '100%',
                      height: '2px',
                      backgroundColor: accent.border || 'var(--mochi-primary)',
                      borderRadius: '2px',
                      boxShadow: `0 0 6px ${accent.shadow}`,
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </AnimatePresence>
            </div>
          );
        })}
          </div>
        </Repanel>
      </motion.div>
    </>
  );
};

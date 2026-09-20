import React, { useState, useMemo } from 'react';
import { Repanel, Badge } from 'remochi';
import { motion, AnimatePresence } from 'framer-motion';
import type { DesktopWindowType } from '../types';
import { Globe, X, AlertTriangle } from 'lucide-react';
import { useAppHost, usePyxisTheme } from '@pyxis/app-sdk';
import { PYXIS_APPS, getAppAccent } from '../apps/registry';

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

  // The dock shows whenever there are open windows (including minimized ones)
  // or orphan running sessions. It only hides when all windows are closed and
  // no running sessions remain.
  const hasAnythingToShow =
    windows.length > 0 || orphanAppIds.length > 0;

  // Calculate dynamic dock width for subdock expansion
  const dockWidth = useMemo(() => {
    if (EXPAND_TO_SUBDOCK && expandedGroup) {
      const expandedWindows = groupedWindows[expandedGroup]?.length || 0;
      return Math.max(300, expandedWindows * 70 + 100);
    }
    return 'auto';
  }, [expandedGroup, groupedWindows]);

  return (
    <AnimatePresence>
      {hasAnythingToShow && (
        <motion.div
          key="pyxis-bottom-dock"
          initial={{ y: 90, opacity: 0 }}
          animate={{
            y: 0,
            opacity: 1,
            width: dockWidth,
            height: isCompact ? 48 : 'auto',
          }}
          exit={{
            y: 90,
            opacity: 0,
            transition: { type: 'spring', stiffness: 350, damping: 30 },
          }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 30,
            width: { duration: 0.3 },
            height: { duration: 0.3 },
          }}
          style={{
            position: 'fixed',
            right: 0,
            bottom: 0,
            zIndex: 1100,
          }}
        >
          <Repanel style={panelStyle}>
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'flex-end',
                gap: isCompact ? '8px' : '16px',
                paddingLeft: isCompact ? '8px' : '16px',
                paddingRight: isCompact ? '8px' : '16px',
                paddingTop: `${padding * 8}px`,
                paddingBottom: `${padding * 8}px`,
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
                  const isAllMinimized =
                    appWindows.length > 0 && appWindows.every((w) => w.state === 'minimized');
                  const isActiveGroup = appWindows.some(
                    (w) => w.id === activeWindowId && w.state !== 'minimized'
                  );
                  const accent = getAppAccent(appId);
                  const waterdropRadius = isCompact
                    ? '12px 2px 12px 12px'
                    : '22px 4px 22px 22px';

                  return (
                    <motion.div
                      key={appId}
                      layout
                      initial={{ scale: 0.6, opacity: 0, y: 16 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      exit={{
                        scale: 0.4,
                        opacity: 0,
                        y: 20,
                        transition: { duration: 0.2, ease: 'easeIn' },
                      }}
                      transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                      onMouseEnter={() => setHoveredGroup(appId)}
                      onMouseLeave={() => setHoveredGroup(null)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px',
                        position: 'relative',
                      }}
                    >
              {/* Expanded Grid View (Above Dock) */}
              {isExpanded && hasMultiple && !EXPAND_TO_SUBDOCK && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    marginBottom: '16px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: '12px',
                    padding: '16px',
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
                      <motion.div
                        key={win.id}
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
                        style={{
                          padding: '12px',
                          borderRadius: '14px',
                          cursor: 'pointer',
                          background: hoveredWindow === win.id
                            ? 'var(--mochi-primary-soft)'
                            : 'var(--mochi-hover)',
                          border: hoveredWindow === win.id
                            ? `1.5px solid ${accent.border}`
                            : '1px solid var(--color-border-light)',
                          transition: 'all 0.2s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '8px',
                          position: 'relative',
                        }}
                      >
                        <div
                          style={{
                            width: isCompact ? 32 : 40,
                            height: isCompact ? 32 : 40,
                            borderRadius: isCompact ? '12px 2px 12px 12px' : '16px 3px 16px 16px',
                            background: accent.bg,
                            border: `1px solid ${accent.border}`,
                            boxShadow: `0 2px 8px ${accent.shadow}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: accent.iconColor,
                          }}
                        >
                          <Icon size={isCompact ? 16 : 22} />
                        </div>
                        <span style={{ maxWidth: '100%', fontSize: '0.75rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {win.title}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onWindowClose?.(win.id);
                          }}
                          style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--color-text-secondary)',
                          }}
                          aria-label="Close window"
                        >
                          <X size={14} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}

              {/* Subdock Expansion (Horizontal) */}
              {isExpanded && hasMultiple && EXPAND_TO_SUBDOCK && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 'auto', opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  style={{
                    display: 'flex',
                    gap: '8px',
                    position: 'absolute',
                    left: '100%',
                    marginLeft: '8px',
                    alignItems: 'center',
                  }}
                >
                  <AnimatePresence mode="popLayout">
                    {appWindows.map((win, idx) => (
                      <motion.button
                        key={win.id}
                        type="button"
                        title={win.title}
                        layout
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        onClick={() => {
                          onWindowSelect?.(win.id);
                          setExpandedGroup(null);
                        }}
                        style={{
                          width: iconSize,
                          height: iconSize,
                          borderRadius: waterdropRadius,
                          background: accent.bg,
                          border: `1.5px solid ${accent.border}`,
                          boxShadow: `0 2px 8px ${accent.shadow}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          color: accent.iconColor,
                        }}
                      >
                        <Icon size={isCompact ? 20 : 28} />
                      </motion.button>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}

              {/* Main Icon/Thumbnail Stack with 3D Isometric Effect */}
              <div
                style={{
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
                  <motion.button
                    key={`orphan-${appId}`}
                    title={`${appId}${
                      session?.pid ? ` · pid ${session.pid}` : ''
                    } · ${lifecycleState ?? 'running'}${
                      lifecycleState === 'crashed' ? ' · click to relaunch' : ''
                    }${
                      lifecycleState === 'suspended' ? ' · click to restore' : ''
                    }`}
                    animate={{
                      scale: isHovered ? 1.08 : 1,
                      y: isHovered ? -6 : 0,
                    }}
                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    onClick={() =>
                      onOrphanSelect?.(appId, lifecycleState === 'crashed')
                    }
                    style={{
                      width: iconSize,
                      height: iconSize,
                      borderRadius: waterdropRadius,
                      background: isHovered ? accent.bg : 'var(--mochi-hover)',
                      border: isHovered ? `1.5px solid ${accent.border}` : '1.5px dashed var(--color-border)',
                      boxShadow: isHovered ? `0 4px 12px ${accent.shadow}` : 'none',
                      color: isHovered ? accent.iconColor : 'var(--color-text)',
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      padding: 0,
                      transition: 'background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
                    }}
                  >
                    <Icon size={isCompact ? 20 : 28} />
                  </motion.button>
                ) : (
                  appWindows.map((win, idx) => {
                    const isLast = idx === appWindows.length - 1;
                    const shouldShowStacked = hasMultiple && !isExpanded;
                    const isWinMinimized = win.state === 'minimized';

                    return (
                      <motion.button
                        key={win.id}
                        title={`${win.title}${
                          session?.pid ? ` · pid ${session.pid}` : ''
                        }${lifecycleState ? ` · ${lifecycleState}` : ''}${
                          isWinMinimized ? ' · minimized (click to restore)' : ''
                        }`}
                        animate={{
                          scale: isHovered ? 1.08 : 1,
                          y: isHovered ? -6 : 0,
                          x: shouldShowStacked ? idx * 8 : 0,
                          z: shouldShowStacked ? idx * -5 : 0,
                          rotateY: shouldShowStacked ? -25 : 0, // 3D stacking rotation
                          opacity: isWinMinimized && !isHovered && !isActiveGroup ? 0.72 : 1,
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
                        style={{
                          width: iconSize,
                          height: iconSize,
                          borderRadius: waterdropRadius,
                          background: isHovered || isActiveGroup ? accent.bg : 'var(--mochi-hover)',
                          border: isHovered || isActiveGroup
                            ? `1.5px solid ${accent.border}`
                            : isWinMinimized
                              ? '1.5px dashed var(--color-border)'
                              : '1px solid var(--color-border-light)',
                          color: isHovered || isActiveGroup ? accent.iconColor : 'var(--color-text)',
                          position: shouldShowStacked && !isLast ? 'absolute' : 'relative',
                          top: 0,
                          left: 0,
                          boxShadow: shouldShowStacked
                            ? '2px 2px 8px rgba(0,0,0,0.2)'
                            : (isHovered || isActiveGroup)
                              ? `0 4px 12px ${accent.shadow}`
                              : '0px 2px 4px rgba(0,0,0,0.1)',
                          zIndex: idx,
                          transformStyle: 'preserve-3d',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          padding: 0,
                          transition: 'background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
                        }}
                      >
                        <Icon size={isCompact ? 20 : 28} />
                      </motion.button>
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
                    <motion.div
                      initial={{ scaleX: 0, opacity: 0 }}
                      animate={{ scaleX: 1, opacity: 1 }}
                      exit={{ scaleX: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                      style={{
                        position: 'absolute',
                        bottom: -8,
                        left: 0,
                        width: iconSize,
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

              {/* Remochi Badge for multiple windows */}
              {hasMultiple && !isExpanded && (
                <div
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    zIndex: 10,
                  }}
                >
                  <Badge
                    content={appWindows.length}
                    background={accent.border}
                    color="#ffffff"
                  />
                </div>
              )}

              {/* Lifecycle indicator under the icon (running / starting). */}
              {lifecycleState === 'running' && (
                <div
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    backgroundColor: '#4CAF50',
                    boxShadow: '0 0 4px #4CAF50',
                  }}
                />
              )}
              {lifecycleState === 'starting' && (
                <div
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    backgroundColor: '#FFB74D',
                    boxShadow: '0 0 4px #FFB74D',
                    animation: 'pyxisDockPulse 1s ease-in-out infinite',
                  }}
                />
              )}

              {/* Suspended (minimized): a static amber dot — distinct from the
                  running green dot — so a paused app reads as present but
                  parked, and the user knows there's something to click back. */}
              {(lifecycleState === 'suspended' || (!lifecycleState && isAllMinimized)) && (
                <div
                  style={{
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
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  style={{
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
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
        </div>
      </Repanel>
    </motion.div>
  )}
</AnimatePresence>
  );
};

export default BottomDock;

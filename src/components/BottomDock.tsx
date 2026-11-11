import React, { useState, useMemo } from 'react';
import { Badge } from 'remochi';
import { motion } from 'framer-motion';
import type { DesktopWindowType, AppLifecycleState } from '../types';
import { Globe, X, AlertTriangle, Grid3x3, Layers } from 'lucide-react';
import { useAppHost } from '@pyxis/app-sdk';
import { appHue, getAppAccent } from '../apps/registry';
import { useApps } from '../hooks/useApps';
import { useAppWindows } from '../hooks/useAppWindows';
import { AppIcon } from './AppIcon';
import { useMotion } from '../useMotion';
import { TRANSITION } from '../motion';
import { LandingDip, LandingRipple } from './DockLanding';
import { useDockLandings } from '../hooks/useDockLandings';

export interface BottomDockProps {
  windows: DesktopWindowType[];
  activeWindowId?: string;
  onWindowSelect?: (windowId: string) => void;
  onWindowClose?: (windowId: string) => void;
  /** Compositor mode: dock click on a running app (minimize / restore / focus / relaunch). */
  onToggleApp?: (appId: string) => void;
  onLaunchApp?: (appId: string, name: string) => void;
  appDrawerOpen?: boolean;
  onToggleAppDrawer?: () => void;
  overviewOpen?: boolean;
  onToggleOverview?: () => void;
  isCompact?: boolean;
}

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

/**
 * BottomDock — Unified Palm Quick Launch & Running Tasks Dock.
 *
 * Combines App Drawer trigger, Multitasking Overview trigger, Pinned Favorites,
 * and Live Running Windows into a single centered, tactile Mochi dock.
 */
export const BottomDock: React.FC<BottomDockProps> = ({
  windows,
  activeWindowId,
  onWindowSelect,
  onWindowClose,
  onToggleApp,
  onLaunchApp,
  appDrawerOpen = false,
  onToggleAppDrawer,
  overviewOpen = false,
  onToggleOverview,
  isCompact = false,
}) => {
  const { tr, to } = useMotion();
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [hoveredWindow, setHoveredWindow] = useState<string | null>(null);
  const { stateForApp, sessionForApp, sessions } = useAppHost();
  const { viewForApp } = useAppWindows();
  const { byId: appsById, pinned: pinnedApps } = useApps();
  // Evo's Lumen landings: a window reaching or leaving an icon ripples it.
  const landings = useDockLandings();

  const iconSize = isCompact ? 32 : 46;
  const waterdropRadius = isCompact ? '10px 2px 10px 10px' : '16px 4px 16px 16px';

  // Running sessions from AppHost
  const orphanAppIds = useMemo(() => {
    const openAppIds = new Set(windows.map((w) => w.appId));
    const seen = new Set<string>();
    Object.values(sessions).forEach((s) => {
      if (
        (s.state === 'running' ||
          s.state === 'starting' ||
          s.state === 'suspended' ||
          s.state === 'crashed') &&
        !openAppIds.has(s.appId)
      ) {
        seen.add(s.appId);
      }
    });
    return Array.from(seen);
  }, [windows, sessions]);

  // Group windows by app
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

  // Determine unpinned running apps to append to the dock
  const unpinnedRunningAppIds = useMemo(() => {
    const pinnedSet = new Set(pinnedApps.map((p) => p.id));
    const runningKeys = Object.keys(groupedWindows);
    return runningKeys.filter((id) => !pinnedSet.has(id));
  }, [pinnedApps, groupedWindows]);

  const handleAppClick = (appId: string, name: string) => {
    const appWindows = groupedWindows[appId] || [];
    const isOrphan = orphanAppIds.includes(appId);
    if (appWindows.length > 1) {
      setExpandedGroup((prev) => (prev === appId ? null : appId));
      return;
    }

    if (appWindows.length === 1) {
      const win = appWindows[0];
      if (win.id === activeWindowId && win.state !== 'minimized') {
        // Toggle minimize if already active
        onWindowSelect?.(win.id);
      } else {
        onWindowSelect?.(win.id);
      }
      return;
    }

    if (isOrphan) {
      // Still starting: there is no window to focus yet, and asking for one
      // used to raise a "no mapped compositor window" error dialog.
      if (viewForApp(appId)?.starting) return;
      onToggleApp?.(appId);
      return;
    }

    // Not running -> Launch app
    onLaunchApp?.(appId, name);
  };

  return (
    <motion.div
      key="pyxis-bottom-dock"
      // The shell's bottom edge: it takes clicks (data-shell-region) and apps
      // are kept out from under it (data-shell-edge, see overlay/useWorkArea).
      // Each icon's `data-app` button is where that app's windows minimize
      // into and restore out of (overlay/useMinimizeTargets, from layout, not
      // the transformed box, since the dock springs in).
      data-shell-region=""
      data-shell-edge="bottom"
      initial={to({ y: 80, opacity: 0 })}
      animate={to({ y: 0, opacity: 1 })}
      transition={tr(TRANSITION.geometry)}
      style={{
        position: 'fixed',
        bottom: isCompact ? 6 : 10,
        left: 0,
        right: 0,
        margin: '0 auto',
        width: 'fit-content',
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        gap: isCompact ? '6px' : '8px',
        padding: isCompact ? '4px 10px' : '6px 12px',
        background: 'var(--color-surface, rgba(255, 255, 255, 0.88))',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid var(--color-border-light, rgba(255, 255, 255, 0.2))',
        borderRadius: isCompact ? '18px' : '24px',
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.2), 0 2px 6px rgba(0, 0, 0, 0.08)',
        userSelect: 'none',
      }}
    >
      {/* 1. App Drawer Trigger Button */}
      <motion.button
        type="button"
        title="App Drawer (All Applications)"
        onClick={onToggleAppDrawer}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.92 }}
        style={{
          width: iconSize,
          height: iconSize,
          borderRadius: waterdropRadius,
          background: appDrawerOpen
            ? 'var(--mochi-primary-soft, rgba(59, 130, 246, 0.15))'
            : 'var(--mochi-hover, rgba(0, 0, 0, 0.04))',
          border: appDrawerOpen
            ? '1.5px solid var(--color-primary, #3b82f6)'
            : '1px solid transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: appDrawerOpen ? 'var(--color-primary, #3b82f6)' : 'var(--color-text)',
          transition: 'all 0.15s ease',
        }}
      >
        <Grid3x3 size={isCompact ? 18 : 22} />
      </motion.button>

      {/* 2. Card Multitasking Overview Trigger Button */}
      <motion.button
        type="button"
        title="Card Multitasking Overview"
        onClick={onToggleOverview}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.92 }}
        style={{
          width: iconSize,
          height: iconSize,
          borderRadius: waterdropRadius,
          background: overviewOpen
            ? 'var(--mochi-primary-soft, rgba(59, 130, 246, 0.15))'
            : 'var(--mochi-hover, rgba(0, 0, 0, 0.04))',
          border: overviewOpen
            ? '1.5px solid var(--color-primary, #3b82f6)'
            : '1px solid transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: overviewOpen ? 'var(--color-primary, #3b82f6)' : 'var(--color-text)',
          transition: 'all 0.15s ease',
        }}
      >
        <Layers size={isCompact ? 18 : 22} />
      </motion.button>

      {/* Vertical Divider */}
      <div
        style={{
          width: '1px',
          height: isCompact ? '20px' : '28px',
          background: 'var(--color-border-light, rgba(0, 0, 0, 0.12))',
          margin: '0 2px',
        }}
      />

      {/* 3. Pinned Applications (with Live Running Status) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isCompact ? '6px' : '8px' }}>
        {pinnedApps.map((app) => {
          const appId = app.id;
          const appWindows = groupedWindows[appId] || [];
          const isOrphan = orphanAppIds.includes(appId);
          const isRunning = appWindows.length > 0 || isOrphan;
          const lifecycleState = stateForApp(appId);
          const session = sessionForApp(appId);
          const dot = isRunning ? badgeColor(lifecycleState ?? 'running') : null;
          const view = viewForApp(appId);
          const isMinimized = view?.minimized ?? false;
          const isActiveGroup =
            appWindows.some((w) => w.id === activeWindowId && w.state !== 'minimized') ||
            (view?.focused ?? false);
          const hasMultiple = appWindows.length > 1;
          const isHovered = hoveredGroup === appId;
          const isExpanded = expandedGroup === appId;
          const accent = getAppAccent(appId);

          return (
            <div
              key={appId}
              style={{ position: 'relative' }}
              onMouseEnter={() => setHoveredGroup(appId)}
              onMouseLeave={() => setHoveredGroup(null)}
            >
              {/* Multi-Window Popup Card (Expanded above dock) */}
              {isExpanded && hasMultiple && (
                <motion.div
                  data-shell-popup=""
                  initial={to({ opacity: 0, y: 8, scale: 0.97 })}
                  animate={{ ...to({ opacity: 1, y: 0, scale: 1 }), transition: tr(TRANSITION.popupIn) }}
                  exit={{ ...to({ opacity: 0, y: 8, scale: 0.97 }), transition: tr(TRANSITION.popupOut) }}
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginBottom: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    padding: '10px',
                    background: 'var(--color-surface, #ffffff)',
                    border: '1px solid var(--color-border, #d1d5db)',
                    borderRadius: '16px',
                    boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
                    minWidth: 200,
                    maxWidth: 320,
                    zIndex: 1300,
                  }}
                >
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-secondary)', padding: '2px 6px' }}>
                    {app.name} ({appWindows.length} windows)
                  </div>
                  {appWindows.map((win) => (
                    <div
                      key={win.id}
                      onClick={() => {
                        onWindowSelect?.(win.id);
                        setExpandedGroup(null);
                      }}
                      onMouseEnter={() => setHoveredWindow(win.id)}
                      onMouseLeave={() => setHoveredWindow(null)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        borderRadius: '8px',
                        background: hoveredWindow === win.id ? 'var(--mochi-primary-soft, #eff6ff)' : 'transparent',
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: 'var(--color-text)',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {win.title}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onWindowClose?.(win.id);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 2,
                          color: 'var(--color-text-secondary)',
                          display: 'flex',
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </motion.div>
              )}

              {/* Main Pinned Button */}
              <motion.button
                type="button"
                title={`${app.name}${isMinimized ? ' (Minimized)' : isRunning ? ' (Running)' : ''}${session?.pid ? ` · pid ${session.pid}` : ''}`}
                onClick={() => handleAppClick(appId, app.name)}
                data-app={appId}
                data-focused={isActiveGroup ? 'true' : 'false'}
                data-minimized={isMinimized ? 'true' : 'false'}
                data-state={lifecycleState ?? 'stopped'}
                whileHover={{ scale: 1.15, y: -4 }}
                whileTap={{ scale: 0.92 }}
                style={{
                  width: iconSize,
                  height: iconSize,
                  borderRadius: waterdropRadius,
                  background: isHovered || isActiveGroup ? accent.bg : 'var(--mochi-hover, rgba(0,0,0,0.03))',
                  border: isActiveGroup
                    ? `1.5px solid ${accent.border}`
                    : isHovered
                      ? `1px solid ${accent.border}`
                      : '1px solid transparent',
                  boxShadow: isActiveGroup
                    ? `0 4px 12px ${accent.shadow}`
                    : isHovered
                      ? `0 2px 8px ${accent.shadow}`
                      : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  position: 'relative',
                  padding: 0,
                  transition: 'background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                <LandingDip landing={landings[appId]}>
                  <AppIcon app={app} size={isCompact ? 20 : 28} fallback={Globe} />
                </LandingDip>
                <LandingRipple
                  landing={landings[appId]}
                  color={appHue(appId) ?? accent.border}
                  radius={waterdropRadius}
                />

                {/* Multiple windows count badge */}
                {hasMultiple && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -4,
                      zIndex: 2,
                    }}
                  >
                    <Badge content={appWindows.length} />
                  </div>
                )}

                {/* Running status indicator bar (mimics Mochi button bar) */}
                {isRunning && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: isCompact ? 2 : 3,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: isCompact ? 16 : 22,
                      height: isCompact ? 2.5 : 3,
                      borderRadius: 1.5,
                      background: dot ?? 'var(--mochi-primary, #3b82f6)',
                      boxShadow: isMinimized ? 'none' : `0 0 5px ${(dot ?? '#3b82f6')}80`,
                      // A minimized app is running but out of sight: a faint, short bar.
                      opacity: isMinimized ? 0.4 : 1,
                      pointerEvents: 'none',
                    }}
                  />
                )}
              </motion.button>
            </div>
          );
        })}
      </div>

      {/* 4. Unpinned Dynamic Running Applications */}
      {unpinnedRunningAppIds.length > 0 && (
        <>
          <div
            style={{
              width: '1px',
              height: isCompact ? '18px' : '24px',
              background: 'var(--color-border-light, rgba(0, 0, 0, 0.1))',
              margin: '0 2px',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: isCompact ? '6px' : '8px' }}>
            {unpinnedRunningAppIds.map((appId) => {
              const app = appsById(appId);
              const appWindows = groupedWindows[appId] || [];
              const lifecycleState = stateForApp(appId);
              const session = sessionForApp(appId);
              const dot = badgeColor(lifecycleState ?? 'running');
              const view = viewForApp(appId);
              const isMinimized = view?.minimized ?? false;
              const isActiveGroup =
                appWindows.some((w) => w.id === activeWindowId && w.state !== 'minimized') ||
                (view?.focused ?? false);
              const hasMultiple = appWindows.length > 1;
              const isHovered = hoveredGroup === appId;
              const isExpanded = expandedGroup === appId;
              const accent = getAppAccent(appId);

              return (
                <div
                  key={appId}
                  style={{ position: 'relative' }}
                  onMouseEnter={() => setHoveredGroup(appId)}
                  onMouseLeave={() => setHoveredGroup(null)}
                >
                  {/* Multi-window popup */}
                  {isExpanded && hasMultiple && (
                    <motion.div
                      data-shell-popup=""
                      initial={to({ opacity: 0, y: 8, scale: 0.97 })}
                      animate={{ ...to({ opacity: 1, y: 0, scale: 1 }), transition: tr(TRANSITION.popupIn) }}
                      exit={{ ...to({ opacity: 0, y: 8, scale: 0.97 }), transition: tr(TRANSITION.popupOut) }}
                      style={{
                        position: 'absolute',
                        bottom: '100%',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        marginBottom: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        padding: '10px',
                        background: 'var(--color-surface, #ffffff)',
                        border: '1px solid var(--color-border, #d1d5db)',
                        borderRadius: '16px',
                        boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
                        minWidth: 200,
                        maxWidth: 320,
                        zIndex: 1300,
                      }}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-text-secondary)', padding: '2px 6px' }}>
                        {app?.name ?? appId} ({appWindows.length} windows)
                      </div>
                      {appWindows.map((win) => (
                        <div
                          key={win.id}
                          onClick={() => {
                            onWindowSelect?.(win.id);
                            setExpandedGroup(null);
                          }}
                          onMouseEnter={() => setHoveredWindow(win.id)}
                          onMouseLeave={() => setHoveredWindow(null)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            background: hoveredWindow === win.id ? 'var(--mochi-primary-soft, #eff6ff)' : 'transparent',
                            cursor: 'pointer',
                            fontSize: '12px',
                            color: 'var(--color-text)',
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {win.title}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onWindowClose?.(win.id);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 2,
                              color: 'var(--color-text-secondary)',
                              display: 'flex',
                            }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </motion.div>
                  )}

                  <motion.button
                    type="button"
                    title={`${app?.name ?? appId}${isMinimized ? ' (Minimized)' : ''}${session?.pid ? ` · pid ${session.pid}` : ''}`}
                    onClick={() => handleAppClick(appId, app?.name ?? appId)}
                    data-app={appId}
                    data-focused={isActiveGroup ? 'true' : 'false'}
                    data-minimized={isMinimized ? 'true' : 'false'}
                    data-state={lifecycleState ?? 'stopped'}
                    whileHover={{ scale: 1.15, y: -4 }}
                    whileTap={{ scale: 0.92 }}
                    style={{
                      width: iconSize,
                      height: iconSize,
                      borderRadius: waterdropRadius,
                      background: isHovered || isActiveGroup ? accent.bg : 'var(--mochi-hover, rgba(0,0,0,0.03))',
                      border: isActiveGroup
                        ? `1.5px solid ${accent.border}`
                        : isHovered
                          ? `1px solid ${accent.border}`
                          : '1px solid var(--color-border-light, rgba(0,0,0,0.08))',
                      boxShadow: isActiveGroup
                        ? `0 4px 12px ${accent.shadow}`
                        : isHovered
                          ? `0 2px 8px ${accent.shadow}`
                          : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      position: 'relative',
                      padding: 0,
                      transition: 'background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease',
                    }}
                  >
                    <LandingDip landing={landings[appId]}>
                      <AppIcon app={app} size={isCompact ? 20 : 28} fallback={Globe} />
                    </LandingDip>
                    <LandingRipple
                      landing={landings[appId]}
                      color={appHue(appId) ?? accent.border}
                      radius={waterdropRadius}
                    />

                    {lifecycleState === 'crashed' && (
                      <div
                        style={{
                          position: 'absolute',
                          top: -4,
                          right: -4,
                          width: 14,
                          height: 14,
                          borderRadius: '50%',
                          backgroundColor: '#F44336',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <AlertTriangle size={8} color="#fff" />
                      </div>
                    )}

                    {/* Running status indicator bar (mimics Mochi button bar) */}
                    <div
                      style={{
                        position: 'absolute',
                        bottom: isCompact ? 2 : 3,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: isCompact ? 16 : 22,
                        height: isCompact ? 2.5 : 3,
                        borderRadius: 1.5,
                        background: dot ?? 'var(--mochi-primary, #3b82f6)',
                        boxShadow: isMinimized ? 'none' : `0 0 5px ${(dot ?? '#3b82f6')}80`,
                        opacity: isMinimized ? 0.4 : 1,
                        pointerEvents: 'none',
                      }}
                    />
                  </motion.button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </motion.div>
  );
};

export default BottomDock;

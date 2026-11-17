import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge } from 'remochi';
import { motion } from 'framer-motion';
import { Globe, X, AlertTriangle, Grid3x3, Layers } from 'lucide-react';
import { useAppHost, waterdrop } from '@pyxis/app-sdk';
import type { DesktopWindowType } from '../types';
import { appHue } from '../apps/registry';
import { useApps, type DesktopApp } from '../hooks/useApps';
import { useAppWindows } from '../hooks/useAppWindows';
import { useDockLandings } from '../hooks/useDockLandings';
import { useMotion } from '../useMotion';
import { PULSE, TRANSITION } from '../motion';
import { LandingDip, LandingRipple } from './DockLanding';
import { AppDropIcon } from './AppDropIcon';
import {
  LAUNCH_BAR_HEIGHT,
  LAUNCH_RAIL_TOP,
  LAUNCH_RAIL_WIDTH,
  runLineFor,
  useLaunchBarPosition,
  type RunLine,
} from './launchBarState';

const ICON = 40;
const ICON_GAP = 12;
/** Icon centre to icon centre, along the bar or down the rail. */
export const LAUNCH_ICON_PITCH = ICON + ICON_GAP;

/** Length (along the edge), opacity and glow of each line, in px. */
const LINE: Record<Exclude<RunLine, 'none'>, { width: number; opacity: number; glow: string | null }> = {
  running: { width: 16, opacity: 0.65, glow: null },
  focused: { width: 28, opacity: 0.95, glow: '0 0 6px 0px' },
  starting: { width: 16, opacity: 0.75, glow: null },
  minimized: { width: 16, opacity: 0.35, glow: null },
  crashed: { width: 16, opacity: 1, glow: '0 0 6px 0px' },
};

/**
 * The light on the screen's edge beside an icon: under it on the bar, to its
 * left on the rail (both are flush with their edge, so the line's outer side
 * is the screen's).
 */
const RunningLine: React.FC<{ line: RunLine; color: string; rail: boolean }> = ({ line, color, rail }) => {
  const { mode } = useMotion();
  if (line === 'none') return null;
  const spec = LINE[line];
  const fill = line === 'crashed' ? 'var(--px-spinner-red)' : color;
  const pulse = line === 'starting' && mode === 'full';
  return (
    <motion.span
      aria-hidden
      data-run-line={line}
      initial={false}
      animate={pulse ? { opacity: [0.3, spec.opacity, 0.3] } : { opacity: spec.opacity }}
      transition={pulse ? PULSE : { duration: 0.15 }}
      style={{
        position: 'absolute',
        ...(rail
          ? {
              left: 0,
              top: '50%',
              marginTop: -spec.width / 2,
              width: 3,
              height: spec.width,
              borderRadius: '0 2px 2px 0',
              transition: 'height 150ms ease, margin-top 150ms ease, box-shadow 150ms ease',
            }
          : {
              bottom: 0,
              left: '50%',
              marginLeft: -spec.width / 2,
              width: spec.width,
              height: 3,
              borderRadius: '2px 2px 0 0',
              transition: 'width 150ms ease, margin-left 150ms ease, box-shadow 150ms ease',
            }),
        background: fill,
        boxShadow: spec.glow ? `${spec.glow} ${fill}` : 'none',
        pointerEvents: 'none',
      }}
    />
  );
};

/** A system button at the bar's left end (Apps, Cards): a waterdrop in the material. */
const SystemButton: React.FC<{
  title: string;
  active: boolean;
  onClick?: () => void;
  icon: React.ReactNode;
  name: string;
}> = ({ title, active, onClick, icon, name }) => {
  const { to } = useMotion();
  return (
    <motion.button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      data-launch-bar-button={name}
      onClick={onClick}
      whileHover={to({ scale: 1.06 })}
      whileTap={to({ scale: 0.92 })}
      style={{
        width: ICON,
        height: ICON,
        padding: 0,
        flexShrink: 0,
        borderRadius: waterdrop(ICON),
        border: 'none',
        background: 'color-mix(in srgb, var(--px-edge-material-strong) 85%, transparent)',
        boxShadow: active
          ? 'inset 0 0 0 1.5px var(--px-glow), 0 0 10px color-mix(in srgb, var(--px-glow) 45%, transparent)'
          : 'inset 0 0 0 1px color-mix(in srgb, var(--px-edge-ink) 14%, transparent)',
        color: 'var(--px-edge-ink)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s ease',
      }}
    >
      {icon}
    </motion.button>
  );
};

/** One row of the windows popover: a dev-preview window, or one of Evo's. */
interface PopoverWindow {
  id: string;
  title: string;
  minimized: boolean;
  focused: boolean;
}

const POPOVER_WIDTH = 220;

/**
 * The popover over an app with several windows: pick one, or close one.
 * Above the icon on the bar; to its right on the rail. Portalled to the
 * body and placed from the icon's box, so the app strip scrolling (a small
 * screen, many apps) can't clip it; being outside the bar it marks itself
 * `data-shell-region` so Evo still gives it the clicks over apps.
 */
const WindowsPopover: React.FC<{
  name: string;
  windows: PopoverWindow[];
  anchor: HTMLElement | null;
  onSelect: (windowId: string) => void;
  onClose?: (windowId: string) => void;
  onDismiss: () => void;
  rail: boolean;
}> = ({ name, windows, anchor, onSelect, onClose, onDismiss, rail }) => {
  const { tr, to } = useMotion();
  const [hovered, setHovered] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const away = rail ? { x: -8 } : { y: 8 };

  // Placed from the icon's box as it is drawn (the bar doesn't move while the
  // popover is up, and a strip scrolled under it closes it with the press).
  let place: React.CSSProperties = {};
  if (anchor) {
    const r = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    place = rail
      ? { left: r.right + 4, top: Math.max(8, Math.min(r.top, vh - 8 - 40 * (windows.length + 1))) }
      : {
          left: Math.max(8, Math.min(r.left + r.width / 2 - POPOVER_WIDTH / 2, vw - POPOVER_WIDTH - 8)),
          bottom: vh - r.top + 4,
        };
  }

  // Escape, or a press anywhere but the popover and its icon, puts it away.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && (ref.current?.contains(t) || anchor?.contains(t))) return;
      onDismiss();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [anchor, onDismiss]);

  return createPortal(
    <motion.div
      ref={ref}
      role="menu"
      aria-label={`${name} windows`}
      data-shell-region=""
      data-shell-popup=""
      data-popover-side={rail ? 'right' : 'top'}
      initial={to({ opacity: 0, ...away, scale: 0.97 })}
      animate={{ ...to({ opacity: 1, x: 0, y: 0, scale: 1 }), transition: tr(TRANSITION.popupIn) }}
      exit={{ ...to({ opacity: 0, ...away, scale: 0.97 }), transition: tr(TRANSITION.popupOut) }}
      style={{
        position: 'fixed',
        ...place,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: 8,
        width: POPOVER_WIDTH,
        maxHeight: 'calc(100vh - 16px)',
        overflowY: 'auto',
        boxSizing: 'border-box',
        background: 'var(--px-material-strong)',
        color: 'var(--px-material-ink)',
        borderRadius: 'var(--px-corner)',
        boxShadow: '0 10px 28px rgba(0, 0, 0, 0.18), inset 0 0 0 1px color-mix(in srgb, var(--px-material-ink) 10%, transparent)',
        fontFamily: 'var(--px-font-ui)',
        zIndex: 1300,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--px-font-display)',
          fontWeight: 'var(--px-font-display-weight)' as React.CSSProperties['fontWeight'],
          letterSpacing: 'var(--px-font-display-tracking)',
          textTransform: 'uppercase',
          fontSize: 11,
          color: 'var(--px-material-ink-quiet)',
          padding: '2px 6px',
        }}
      >
        {name} · {windows.length}
      </div>
      {windows.map((win) => (
        <div
          key={win.id}
          role="menuitem"
          tabIndex={0}
          data-window-row={win.id}
          aria-current={win.focused ? 'true' : undefined}
          onClick={() => onSelect(win.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(win.id);
            }
          }}
          onMouseEnter={() => setHovered(win.id)}
          onMouseLeave={() => setHovered(null)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
            padding: '6px 8px',
            borderRadius: waterdrop(28),
            background:
              hovered === win.id || win.focused
                ? 'color-mix(in srgb, var(--px-material-ink) 8%, transparent)'
                : 'transparent',
            opacity: win.minimized ? 0.6 : 1,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {win.title}
            {win.minimized ? ' (Minimized)' : ''}
          </span>
          {onClose && (
            <button
              type="button"
              aria-label={`Close ${win.title}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(win.id);
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 2,
                color: 'var(--px-material-ink-quiet)',
                display: 'flex',
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      ))}
    </motion.div>,
    document.body
  );
};

export interface LaunchBarProps {
  windows: DesktopWindowType[];
  activeWindowId?: string;
  onWindowSelect?: (windowId: string) => void;
  onWindowClose?: (windowId: string) => void;
  /**
   * Compositor mode: a click on a running app (minimize / restore / focus /
   * relaunch), or on one of its windows in the popover.
   */
  onToggleApp?: (appId: string, windowId?: number) => void;
  /** Compositor mode: the popover's close button on one of an app's windows. */
  onCloseAppWindow?: (appId: string, windowId: number) => void;
  onLaunchApp?: (appId: string, name: string) => void;
  appDrawerOpen?: boolean;
  onToggleAppDrawer?: () => void;
  overviewOpen?: boolean;
  onToggleOverview?: () => void;
  /** Drawn at the bar's right end: the notification dashboard. */
  dashboard?: React.ReactNode;
}

/**
 * The launch bar: the shell's bottom edge, flush and full width, its
 * material fading up from the screen's edge (no blur: the overlay is
 * transparent, there is nothing behind it to blur). Apps and Cards at the
 * left end, pinned then running apps in the middle as waterdrop accent
 * icons, the notification dashboard at the right end. A running app is a
 * line of its accent light on the screen's very edge under its icon.
 *
 * It replaced the floating dock (identity plan, lane B) and keeps every
 * contract the dock had with Evo: it takes clicks (`data-shell-region`),
 * apps are kept out from under it (`data-shell-edge="bottom"`, its height is
 * the work area's bottom inset), and each `data-app` button is where that
 * app's windows minimize into and rise out of (overlay/useMinimizeTargets,
 * measured by layout: the middle is centred by a grid, never a transform,
 * because a transform is invisible to `offsetLeft`). Evo's Lumen landings
 * ripple the icon and dip it (DockLanding).
 *
 * `pyxis.launchBar.position` = `left` turns it into a rail: 64 px wide,
 * flush with the left edge below the status strip, its material fading toward
 * the right. Apps and Cards at the top, the app icons stacked 52 px apart
 * below them, each running app's line on the screen's left edge beside its
 * icon, and the dashboard's count at the bottom (no chips: they don't fit).
 * The contracts hold there too: the edge marker says `left`, so the work
 * area's left inset is its width, and the `data-app` buttons are still the
 * minimize targets.
 *
 * Self-contained, so the Duyo port can wrap it with `adapt()`.
 */
export const LaunchBar: React.FC<LaunchBarProps> = ({
  windows,
  activeWindowId,
  onWindowSelect,
  onWindowClose,
  onToggleApp,
  onCloseAppWindow,
  onLaunchApp,
  appDrawerOpen = false,
  onToggleAppDrawer,
  overviewOpen = false,
  onToggleOverview,
  dashboard,
}) => {
  const { tr, to } = useMotion();
  const position = useLaunchBarPosition();
  const rail = position === 'left';
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const { stateForApp, sessionForApp, sessions } = useAppHost();
  const { viewForApp } = useAppWindows();
  const { byId: appsById, pinned: pinnedApps } = useApps();
  // Evo's Lumen landings: a window reaching or leaving an icon ripples it.
  const landings = useDockLandings();

  // Apps AppHost runs that have no dev-preview window (in the compositor,
  // every running app: its windows are Evo's, not Bloom's).
  const orphanAppIds = useMemo(() => {
    const openAppIds = new Set(windows.map((w) => w.appId));
    const seen = new Set<string>();
    Object.values(sessions).forEach((s) => {
      if (
        (s.state === 'running' || s.state === 'starting' || s.state === 'suspended' || s.state === 'crashed') &&
        !openAppIds.has(s.appId)
      ) {
        seen.add(s.appId);
      }
    });
    return seen;
  }, [windows, sessions]);

  const groupedWindows = useMemo(() => {
    const groups: Record<string, DesktopWindowType[]> = {};
    windows.forEach((w) => {
      (groups[w.appId] ??= []).push(w);
    });
    orphanAppIds.forEach((appId) => {
      groups[appId] ??= [];
    });
    return groups;
  }, [windows, orphanAppIds]);

  const unpinnedRunningAppIds = useMemo(() => {
    const pinnedSet = new Set(pinnedApps.map((p) => p.id));
    return Object.keys(groupedWindows).filter((id) => !pinnedSet.has(id));
  }, [pinnedApps, groupedWindows]);

  /** Evo's windows for an app (compositor mode), in the order Evo lists them. */
  const evoWindowsFor = (appId: string) => viewForApp(appId)?.windows ?? [];

  const handleAppClick = (appId: string, name: string) => {
    const appWindows = groupedWindows[appId] ?? [];
    if (appWindows.length > 1 || (appWindows.length === 0 && evoWindowsFor(appId).length > 1)) {
      setExpandedGroup((prev) => (prev === appId ? null : appId));
      return;
    }
    if (appWindows.length === 1) {
      // The window store decides: minimize if active, else restore or focus.
      onWindowSelect?.(appWindows[0].id);
      return;
    }
    if (orphanAppIds.has(appId)) {
      // Still starting: there is no window to focus yet, and asking for one
      // used to raise a "no mapped compositor window" error dialog.
      if (viewForApp(appId)?.starting) return;
      onToggleApp?.(appId);
      return;
    }
    onLaunchApp?.(appId, name);
  };

  const renderApp = (appId: string, app: DesktopApp | undefined) => {
    const name = app?.name ?? appId;
    const appWindows = groupedWindows[appId] ?? [];
    const running = appWindows.length > 0 || orphanAppIds.has(appId);
    const lifecycleState = stateForApp(appId);
    const session = sessionForApp(appId);
    const view = viewForApp(appId);
    // Evo's windows say so in the view; the dev preview's in its own store.
    const minimized =
      (view?.minimized ?? false) || (appWindows.length > 0 && appWindows.every((w) => w.state === 'minimized'));
    const focused =
      appWindows.some((w) => w.id === activeWindowId && w.state !== 'minimized') || (view?.focused ?? false);
    const line = runLineFor({
      running,
      state: lifecycleState,
      starting: view?.starting,
      focused,
      minimized,
    });
    // The dev preview's windows, else Evo's: an app with two windows gets the
    // count and the popover either way.
    const evoWindows = appWindows.length === 0 ? evoWindowsFor(appId) : [];
    const windowCount = appWindows.length || evoWindows.length;
    const hasMultiple = windowCount > 1;
    const popoverWindows: PopoverWindow[] =
      appWindows.length > 0
        ? appWindows.map((w) => ({
            id: w.id,
            title: w.title,
            minimized: w.state === 'minimized',
            focused: w.id === activeWindowId,
          }))
        : evoWindows.map((w, i) => ({
            id: String(w.windowId),
            title: w.titleLabel || `${name} ${i + 1}`,
            minimized: w.minimized,
            // The view's window is the focused one when the app has the focus.
            focused: (view?.focused ?? false) && view?.windowId === w.windowId,
          }));

    return (
      <div
        key={appId}
        style={
          rail
            ? // The rail's full width, from the screen's left edge: the line
              // sits on the edge, the icon is centred.
              { position: 'relative', width: LAUNCH_RAIL_WIDTH, display: 'flex', justifyContent: 'center' }
            : { position: 'relative', height: LAUNCH_BAR_HEIGHT, display: 'flex', alignItems: 'center' }
        }
      >
        {expandedGroup === appId && hasMultiple && (
          <WindowsPopover
            rail={rail}
            name={name}
            windows={popoverWindows}
            anchor={buttons.current[appId] ?? null}
            onDismiss={() => setExpandedGroup(null)}
            onSelect={(windowId) => {
              if (appWindows.length > 0) onWindowSelect?.(windowId);
              else onToggleApp?.(appId, Number(windowId));
              setExpandedGroup(null);
            }}
            onClose={
              appWindows.length > 0
                ? onWindowClose
                : onCloseAppWindow && ((windowId) => onCloseAppWindow(appId, Number(windowId)))
            }
          />
        )}

        <motion.button
          type="button"
          ref={(el) => {
            buttons.current[appId] = el;
          }}
          aria-haspopup={hasMultiple ? 'menu' : undefined}
          aria-expanded={hasMultiple ? expandedGroup === appId : undefined}
          title={`${name}${minimized ? ' (Minimized)' : running ? ' (Running)' : ''}${session?.pid ? ` · pid ${session.pid}` : ''}`}
          aria-label={name}
          onClick={() => handleAppClick(appId, name)}
          data-app={appId}
          data-focused={focused ? 'true' : 'false'}
          data-minimized={minimized ? 'true' : 'false'}
          data-state={lifecycleState ?? 'stopped'}
          whileHover={to(rail ? { x: 3 } : { y: -3 })}
          whileTap={to({ scale: 0.92 })}
          style={{
            position: 'relative',
            width: ICON,
            height: ICON,
            padding: 0,
            border: 'none',
            background: 'none',
            borderRadius: waterdrop(ICON),
            cursor: 'pointer',
          }}
        >
          <LandingDip landing={landings[appId]}>
            <AppDropIcon appId={appId} size={ICON} fallback={Globe} />
          </LandingDip>
          <LandingRipple landing={landings[appId]} color={appHue(appId) ?? 'var(--px-glow)'} radius={waterdrop(ICON)} />

          {hasMultiple && (
            <span style={{ position: 'absolute', top: -5, right: -5, zIndex: 2 }}>
              <Badge
                content={windowCount}
                background="color-mix(in srgb, var(--color-primary, #21808d) 62%, #10132a)"
              />
            </span>
          )}

          {lifecycleState === 'crashed' && (
            <span
              data-crashed=""
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                width: 14,
                height: 14,
                borderRadius: waterdrop(14),
                background: 'var(--px-spinner-red)',
                boxShadow: 'inset 0 0 0 1px var(--px-spinner-red-outline)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2,
              }}
            >
              <AlertTriangle size={8} color="#fff" />
            </span>
          )}
        </motion.button>

        <RunningLine line={line} color="var(--px-edge-ink)" rail={rail} />
      </div>
    );
  };

  const divider = (show: boolean) =>
    show && (
      <div
        aria-hidden
        style={{
          ...(rail ? { width: 26, height: 1, flexShrink: 0 } : { width: 1, height: 26 }),
          background: 'color-mix(in srgb, var(--px-edge-ink) 22%, transparent)',
        }}
      />
    );
  const systemButtons = (
    <>
      <SystemButton
        name="apps"
        title="Apps"
        active={appDrawerOpen}
        onClick={onToggleAppDrawer}
        icon={<Grid3x3 size={20} />}
      />
      <SystemButton
        name="cards"
        title="Cards"
        active={overviewOpen}
        onClick={onToggleOverview}
        icon={<Layers size={20} />}
      />
    </>
  );
  const apps = (
    <>
      {pinnedApps.map((app) => renderApp(app.id, app))}
      {divider(unpinnedRunningAppIds.length > 0 && pinnedApps.length > 0)}
      {unpinnedRunningAppIds.map((appId) => renderApp(appId, appsById(appId)))}
    </>
  );

  if (rail) {
    return (
      <motion.div
        // Keyed by placement: switching remounts the bar, which the work-area
        // and minimize-target measurements see as a change.
        key="pyxis-launch-bar-left"
        data-shell-region=""
        data-shell-edge="left"
        data-launch-bar="left"
        initial={to({ x: -LAUNCH_RAIL_WIDTH, opacity: 0 })}
        animate={to({ x: 0, opacity: 1 })}
        transition={tr(TRANSITION.geometry)}
        style={{
          position: 'fixed',
          top: LAUNCH_RAIL_TOP,
          bottom: 0,
          left: 0,
          width: LAUNCH_RAIL_WIDTH,
          zIndex: 1100,
          boxSizing: 'border-box',
          padding: '10px 0 12px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          background:
            'linear-gradient(to right, var(--px-edge-material) 0%, color-mix(in srgb, var(--px-edge-material) 70%, transparent) 55%, transparent 100%)',
          fontFamily: 'var(--px-font-ui)',
          userSelect: 'none',
        }}
      >
        {systemButtons}
        {divider(true)}
        {/* Scrolls when there are more apps than the rail is tall (an 800x600
            screen fits about seven). The dashboard below it stays put. */}
        <div
          data-launch-bar-apps=""
          className="px-launch-scroll"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: ICON_GAP,
            flex: '1 1 auto',
            minHeight: 0,
            width: '100%',
            overflowY: 'auto',
            overflowX: 'hidden',
            paddingTop: 4,
          }}
        >
          {apps}
        </div>
        <div
          data-launch-bar-end=""
          style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
        >
          {dashboard}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      key="pyxis-launch-bar-bottom"
      data-shell-region=""
      data-shell-edge="bottom"
      data-launch-bar="bottom"
      initial={to({ y: LAUNCH_BAR_HEIGHT, opacity: 0 })}
      animate={to({ y: 0, opacity: 1 })}
      transition={tr(TRANSITION.geometry)}
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        height: LAUNCH_BAR_HEIGHT,
        zIndex: 1100,
        boxSizing: 'border-box',
        padding: '0 16px',
        display: 'grid',
        // The ends keep their width; the middle is centred and, when the apps
        // outgrow it, shrinks and scrolls sideways rather than pushing the ends off.
        gridTemplateColumns: 'minmax(max-content, 1fr) minmax(0, auto) minmax(max-content, 1fr)',
        alignItems: 'center',
        columnGap: ICON_GAP,
        background:
          'linear-gradient(to top, var(--px-edge-material) 0%, color-mix(in srgb, var(--px-edge-material) 70%, transparent) 55%, transparent 100%)',
        fontFamily: 'var(--px-font-ui)',
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{systemButtons}</div>

      <div
        data-launch-bar-apps=""
        className="px-launch-scroll"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: ICON_GAP,
          minWidth: 0,
          height: '100%',
          // Room for a landing's ripple at either end, which the scroller would clip.
          padding: '0 14px',
          overflowX: 'auto',
          overflowY: 'hidden',
        }}
      >
        {apps}
      </div>

      <div
        data-launch-bar-end=""
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minWidth: 0, height: '100%' }}
      >
        {dashboard}
      </div>
    </motion.div>
  );
};

export default LaunchBar;

import React from 'react';
import { Button } from 'remochi';
import { motion, type PanInfo } from 'framer-motion';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';
import { type DesktopWindowType, type AppLifecycleState } from '../types';
import { useAppHost } from '@pyxis/app-sdk';
import { IN_COMPOSITOR } from '../utils/environment';

// Visual map for lifecycle dots in the title bar.
const STATE_COLOR: Record<AppLifecycleState, string> = {
  starting: '#FFB300',
  running: '#4CAF50',
  suspended: '#FFA726',
  stopped: '#9E9E9E',
  crashed: '#FF5252',
};

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

/**
 * CrashOverlay — shown over a window's content when the bound app session
 * has entered the `crashed` lifecycle state (e.g. the SIGCHLD reaper picked
 * up an unexpected exit on the daemon side). Gives the user a one-click
 * recovery via `useAppHost().relaunch`.
 */
const CrashOverlay: React.FC<{ appId: string; pid: number }> = ({
  appId,
  pid,
}) => {
  const { relaunch } = useAppHost();
  const [busy, setBusy] = React.useState(false);
  const onRelaunch = async () => {
    setBusy(true);
    try {
      await relaunch(appId);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        textAlign: 'center',
        background:
          'linear-gradient(180deg, rgba(40,0,0,0.65) 0%, rgba(20,0,0,0.85) 100%)',
        backdropFilter: 'blur(6px)',
        borderRadius: '8px',
        color: '#fff',
        padding: '24px',
      }}
      data-crash-overlay="true"
      data-app-id={appId}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: '#FF525222',
          border: '2px solid #FF5252',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 24px #FF525266',
        }}
      >
        <AlertTriangle size={26} color="#FF5252" />
      </div>
      <div style={{ fontWeight: 600, fontSize: '1.25rem' }}>
        {appId} stopped unexpectedly
      </div>
      <div style={{ opacity: 0.85, fontSize: '0.875rem' }}>
        {pid > 0
          ? `Process ${pid} exited with a non-zero status.`
          : 'The session ended without a clean shutdown.'}
      </div>
      <div style={{ marginTop: '8px' }}>
        <Button
          variant="warning"
          disabled={busy}
          onClick={onRelaunch}
        >
          <RotateCcw size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
          {busy ? 'Relaunching…' : 'Relaunch app'}
        </Button>
      </div>
    </div>
  );
};

// Render this window's content. This component (and the rest of
// DesktopWindow's DOM-drawn frame/title-bar) is only ever mounted in
// !IN_COMPOSITOR (local dev/design preview, no compositor) mode — see
// Desktop.tsx, which gates DesktopWindow rendering on that. In real
// production use (IN_COMPOSITOR), a launched app is a separate Nova-launched
// vela process that Evo composites AND decorates directly in its own real
// xdg-toplevel; Bloom draws no window/frame for it at all (a second,
// DOM-drawn frame around an already-decorated real window is exactly the
// double-decoration bug this split exists to prevent — see
// pyxis-webos-parity-analysis.md's "surfaces — a myth to retire"). Bloom's
// only UI for a running app in that mode is a chrome-only dock icon (see
// BottomDock's orphan-session handling), not a window.
//
// Dev/design (http): embed the app's own dev server by URL (see registry.ts's
// per-app localhost ports) so the shell renders real app UI for local
// iteration without a compositor. The crash overlay floats on top regardless.
const WindowContent: React.FC<{
  win: DesktopWindowType;
}> = ({ win }) => {
  const { sessionForApp } = useAppHost();
  const session = sessionForApp(win.appId);
  const crashed = session?.state === 'crashed';

  let inner: React.ReactNode;
  if (win.entryUrl) {
    inner = (
      <iframe
        src={`${win.entryUrl}?windowId=${encodeURIComponent(win.id)}`}
        title={win.title}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
          background: 'var(--color-background, #f5f5f5)',
        }}
      />
    );
  } else {
    inner = null;
  }

  if (inner) {
    return (
      <div style={{ position: 'relative', height: '100%', width: '100%' }}>
        {inner}
        {crashed ? (
          <CrashOverlay appId={win.appId} pid={session?.pid ?? 0} />
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          textAlign: 'center',
          color: 'var(--color-text-secondary)',
          background:
            'repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0 12px, rgba(255,255,255,0.05) 12px 24px)',
          borderRadius: '8px',
        }}
      >
        <div style={{ fontWeight: 600, fontSize: '1.25rem', color: 'var(--color-text)' }}>
          {win.title}
        </div>
        <div style={{ fontSize: '0.875rem' }}>
          No app component is registered for <code>{win.appId}</code>.
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          Register one in <code>src/hooks/useWindows.ts</code>.
        </div>
      </div>
      {crashed ? (
        <CrashOverlay appId={win.appId} pid={session?.pid ?? 0} />
      ) : null}
    </div>
  );
};

// Tiny lifecycle indicator rendered in the title bar so users can see a
// window's host state (and any surfaces bound to it) without opening the dock.
const SurfaceIndicator: React.FC<{ appId: string }> = ({ appId }) => {
  const { stateForApp, sessionForApp, surfacesForApp } = useAppHost();
  const state = stateForApp(appId);
  if (!state) return null;
  const session = sessionForApp(appId);
  const surfaces = surfacesForApp(appId);
  const color = STATE_COLOR[state];
  const titleText = `${appId}\nstate: ${state}${session && session.pid > 0 ? `\npid: ${session.pid}` : ''}\nsurfaces: ${surfaces.length > 0 ? surfaces.join(', ') : 'none'}`;

  return (
    <div
      data-no-drag
      title={titleText}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: 999,
        background: `${color}22`,
        border: `1px solid ${color}66`,
        cursor: 'default',
      }}
    >
      <motion.div
        animate={
          state === 'starting'
            ? { opacity: [0.4, 1, 0.4] }
            : { opacity: 1 }
        }
        transition={
          state === 'starting'
            ? { duration: 1.2, repeat: Infinity }
            : undefined
        }
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: color,
        }}
      />
      {surfaces.length > 0 ? (
        <span
          style={{ fontSize: '0.7rem', color: 'var(--color-text)', lineHeight: 1 }}
        >
          {surfaces.length}× surface
        </span>
      ) : null}
      {state === 'crashed' ? (
        <AlertTriangle size={12} color={color} />
      ) : null}
    </div>
  );
};

// UI boundaries
const TOP_BAR_HEIGHT = 48;
const BOTTOM_DOCK_HEIGHT = 80; // Normal
const BOTTOM_DOCK_HEIGHT_COMPACT = 56; // Compact: 48px + 8px margin
const TITLE_BAR_HEIGHT = 40;

export const DesktopWindow = React.forwardRef<HTMLDivElement, DesktopWindowProps>(({
  window,
  isActive,
  onClose,
  onMinimize,
  onMaximize,
  onFocus,
  onPositionChange,
  children,
}, ref) => {
  // Belt-and-suspenders: Desktop.tsx is the real gate (it doesn't mount this
  // component at all in compositor mode), but guard here too so a future
  // caller mounting DesktopWindow directly in production can't reintroduce
  // the double-decoration bug (a DOM-drawn frame around an app that Evo is
  // already compositing and decorating as its own real xdg-toplevel).
  if (IN_COMPOSITOR) return null;

  // Calculate maximized dimensions
  const isMaximized = window.state === 'maximized';
  const bottomOffset = isMaximized ? BOTTOM_DOCK_HEIGHT_COMPACT : BOTTOM_DOCK_HEIGHT;

  const maxWidth = isMaximized
    ? window.innerWidth
    : window.size.width;

  const maxHeight = isMaximized
    ? window.innerHeight - TOP_BAR_HEIGHT - bottomOffset
    : window.size.height;

  const maxX = isMaximized
    ? 0
    : window.position.x;

  const maxY = window.state === 'maximized'
    ? TOP_BAR_HEIGHT
    : window.position.y;

  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    let newX = window.position.x + info.offset.x;
    let newY = window.position.y + info.offset.y;

    // Constrain to boundaries
    const minY = TOP_BAR_HEIGHT;
    const maxXConstraint = Math.max(0, window.innerWidth - window.size.width);
    const maxYConstraint = Math.max(minY, window.innerHeight - bottomOffset - TITLE_BAR_HEIGHT);

    newX = Math.max(0, Math.min(newX, maxXConstraint));
    newY = Math.max(minY, Math.min(newY, maxYConstraint));

    onPositionChange?.(window.id, newX, newY);
  };

  const isMinimizing = window.state === 'minimized';

  return (
    <motion.div
      ref={ref}
      key={window.id}
      layout
      initial={{
        scale: 0.86,
        opacity: 0,
        rotateX: 20,
        x: maxX,
        y: maxY + 36,
      }}
      animate={{
        scale: 1,
        opacity: 1,
        rotateX: 0,
        x: maxX,
        y: maxY,
        width: maxWidth,
        height: maxHeight,
      }}
      exit={{
        scale: isMinimizing ? 0.65 : 0.82,
        opacity: 0,
        rotateX: isMinimizing ? 28 : 22,
        x: maxX,
        y: maxY + (isMinimizing ? 130 : 48),
        transition: {
          duration: isMinimizing ? 0.28 : 0.22,
          ease: [0.32, 0, 0.24, 1],
        },
      }}
      transition={{
        type: 'spring',
        stiffness: 280,
        damping: 24,
        mass: 0.85,
        opacity: { duration: 0.18 },
      }}
      drag={window.state !== 'maximized'}
      dragMomentum={false}
      dragElastic={0}
      dragConstraints={{
        left: -window.position.x,
        top: TOP_BAR_HEIGHT - window.position.y,
        right: Math.max(0, window.innerWidth - window.size.width - window.position.x),
        bottom: Math.max(0, window.innerHeight - bottomOffset - TITLE_BAR_HEIGHT - window.position.y),
      }}
      onDragEnd={handleDragEnd}
      onClick={() => onFocus?.(window.id)}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        transformPerspective: 1200,
        transformOrigin: '50% 100%',
        transformStyle: 'preserve-3d',
        backfaceVisibility: 'hidden',
        zIndex: window.zIndex,
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '12px',
        overflow: 'hidden',
        border: isActive
          ? '1px solid var(--color-primary)'
          : '1px solid var(--color-border)',
        boxShadow: isActive
          ? '0px 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 2px var(--mochi-primary-soft)'
          : '0px 2px 4px -1px rgba(0,0,0,0.2), 0px 4px 5px 0px rgba(0,0,0,0.14)',
        transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
        cursor: window.state === 'maximized' ? 'default' : 'move',
      }}
    >
          {/* Mochi Title Bar */}
          <div
            style={{
              height: TITLE_BAR_HEIGHT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingLeft: '16px',
              paddingRight: '16px',
              background: 'var(--color-surface)',
              borderBottom: '1px solid var(--color-border-light)',
              cursor: window.state === 'maximized' ? 'default' : 'move',
            }}
          >
            {/* Window Title + lifecycle indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  userSelect: 'none',
                  color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
                }}
              >
                {window.title}
              </span>
              <SurfaceIndicator appId={window.appId} />
            </div>

            {/* Custom Window Controls */}
            <div
              data-no-drag
              style={{
                display: 'flex',
                gap: '8px',
                cursor: 'default',
              }}
            >
              {/* Warm-yellow Mochi pill - Minimize */}
              <motion.div
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onMinimize?.(window.id);
                }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '9px',
                  background: 'linear-gradient(135deg, #ffd479 0%, #ffb300 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s ease',
                }}
                title="Minimize"
              >
                <div
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: '6px solid transparent',
                    borderRight: '6px solid transparent',
                    borderTop: '8px solid rgba(0, 0, 0, 0.6)',
                  }}
                />
              </motion.div>

              {/* Blue Square - Maximize */}
              <motion.div
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onMaximize?.(window.id);
                }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '9px',
                  background:
                    'linear-gradient(135deg, var(--color-secondary, #6aaedb) 0%, var(--color-primary, #4a8bc2) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s ease',
                }}
                title="Maximize"
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    border: '2px solid rgba(255, 255, 255, 0.8)',
                    borderRadius: '2px',
                  }}
                />
              </motion.div>

              {/* Red Circle - Close */}
              <motion.div
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose?.(window.id);
                }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background:
                    'linear-gradient(135deg, var(--color-error, #c62828) 0%, #a02020 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s ease',
                }}
                title="Close"
              >
                <X size={14} color="rgba(255, 255, 255, 0.9)" strokeWidth={3} />
              </motion.div>
            </div>
          </div>

          {/* Content Area — no padding for embedded app documents, which
              own their whole viewport (they are separate processes). */}
          <div
            style={{
              flex: 1,
              overflow: window.entryUrl ? 'hidden' : 'auto',
              backgroundColor: 'var(--color-background)',
              padding: window.entryUrl ? 0 : '16px',
              position: 'relative',
            }}
          >
            {children || <WindowContent win={window} />}
            {/* Iframes swallow pointer events, so an inactive window with an
                embedded app would never receive the focusing click — this
                transparent veil catches the first click and raises the
                window, then disappears. */}
            {!isActive && window.entryUrl ? (
              <div
                onMouseDown={() => onFocus?.(window.id)}
                style={{ position: 'absolute', inset: 0, zIndex: 3 }}
              />
            ) : null}
          </div>
        </motion.div>
  );
});

DesktopWindow.displayName = 'DesktopWindow';

export default DesktopWindow;

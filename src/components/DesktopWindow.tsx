import React from 'react';
import { Box, Button, Tooltip, Typography } from '@mui/material';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
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
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1.5,
        textAlign: 'center',
        background:
          'linear-gradient(180deg, rgba(40,0,0,0.65) 0%, rgba(20,0,0,0.85) 100%)',
        backdropFilter: 'blur(6px)',
        borderRadius: 2,
        color: '#fff',
        padding: 3,
      }}
      data-crash-overlay="true"
      data-app-id={appId}
    >
      <Box
        sx={{
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
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 600 }}>
        {appId} stopped unexpectedly
      </Typography>
      <Typography variant="body2" sx={{ opacity: 0.85 }}>
        {pid > 0
          ? `Process ${pid} exited with a non-zero status.`
          : 'The session ended without a clean shutdown.'}
      </Typography>
      <Button
        variant="contained"
        color="error"
        startIcon={<RotateCcw size={16} />}
        disabled={busy}
        onClick={onRelaunch}
        sx={{ mt: 1 }}
      >
        {busy ? 'Relaunching…' : 'Relaunch app'}
      </Button>
    </Box>
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
  if (win.entryHtml) {
    inner = (
      <iframe
        src={`${win.entryHtml}?windowId=${encodeURIComponent(win.id)}`}
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
      <Box sx={{ position: 'relative', height: '100%', width: '100%' }}>
        {inner}
        {crashed ? (
          <CrashOverlay appId={win.appId} pid={session?.pid ?? 0} />
        ) : null}
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', height: '100%', width: '100%' }}>
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
      {crashed ? (
        <CrashOverlay appId={win.appId} pid={session?.pid ?? 0} />
      ) : null}
    </Box>
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
  const tooltip = (
    <Box>
      <Typography variant="caption" sx={{ fontWeight: 600 }}>
        {appId}
      </Typography>
      <br />
      <Typography variant="caption">state: {state}</Typography>
      {session && session.pid > 0 ? (
        <>
          <br />
          <Typography variant="caption">pid: {session.pid}</Typography>
        </>
      ) : null}
      <br />
      <Typography variant="caption">
        surfaces: {surfaces.length > 0 ? surfaces.join(', ') : 'none'}
      </Typography>
    </Box>
  );
  return (
    <Tooltip title={tooltip} arrow placement="bottom">
      <Box
        data-no-drag
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.25,
          borderRadius: 999,
          background: `${color}22`,
          border: `1px solid ${color}66`,
          cursor: 'default',
        }}
      >
        <Box
          component={motion.div}
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
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: color,
          }}
        />
        {surfaces.length > 0 ? (
          <Typography
            variant="caption"
            sx={{ fontSize: '0.7rem', color: 'text.primary', lineHeight: 1 }}
          >
            {surfaces.length}× surface
          </Typography>
        ) : null}
        {state === 'crashed' ? (
          <AlertTriangle size={12} color={color} />
        ) : null}
      </Box>
    </Tooltip>
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
  // Belt-and-suspenders: Desktop.tsx is the real gate (it doesn't mount this
  // component at all in compositor mode), but guard here too so a future
  // caller mounting DesktopWindow directly in production can't reintroduce
  // the double-decoration bug (a DOM-drawn frame around an app that Evo is
  // already compositing and decorating as its own real xdg-toplevel).
  if (IN_COMPOSITOR) return null;

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
          <Box
            sx={{
              height: TITLE_BAR_HEIGHT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2,
              background: 'var(--color-surface)',
              borderBottom: '1px solid var(--color-border-light)',
              cursor: window.state === 'maximized' ? 'default' : 'move',
            }}
          >
            {/* Window Title + lifecycle indicator */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  userSelect: 'none',
                  color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)',
                }}
              >
                {window.title}
              </Typography>
              <SurfaceIndicator appId={window.appId} />
            </Box>

            {/* Custom Window Controls */}
            <Box
              data-no-drag
              sx={{
                display: 'flex',
                gap: 1,
                cursor: 'default',
              }}
            >
              {/* Warm-yellow Mochi pill - Minimize */}
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
                  borderRadius: '9px',
                  background: 'linear-gradient(135deg, #ffd479 0%, #ffb300 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s ease',
                  '&:hover': {
                    boxShadow: '0 4px 12px rgba(255, 179, 0, 0.4)',
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
                  borderRadius: '9px',
                  background:
                    'linear-gradient(135deg, var(--color-secondary, #6aaedb) 0%, var(--color-primary, #4a8bc2) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s ease',
                  '&:hover': {
                    boxShadow: '0 4px 12px rgba(74, 139, 194, 0.4)',
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
                  background:
                    'linear-gradient(135deg, var(--color-error, #c62828) 0%, #a02020 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'box-shadow 0.2s ease',
                  '&:hover': {
                    boxShadow: '0 4px 12px rgba(198, 40, 40, 0.4)',
                  },
                }}
                title="Close"
              >
                <X size={14} color="rgba(255, 255, 255, 0.9)" strokeWidth={3} />
              </Box>
            </Box>
          </Box>

          {/* Content Area — no padding for embedded app documents, which
              own their whole viewport (they are separate processes). */}
          <Box
            sx={{
              flex: 1,
              overflow: window.entryHtml ? 'hidden' : 'auto',
              backgroundColor: 'var(--color-background)',
              p: window.entryHtml ? 0 : 2,
              position: 'relative',
            }}
          >
            {children || <WindowContent win={window} />}
            {/* Iframes swallow pointer events, so an inactive window with an
                embedded app would never receive the focusing click — this
                transparent veil catches the first click and raises the
                window, then disappears. */}
            {!isActive && window.entryHtml ? (
              <Box
                onMouseDown={() => onFocus?.(window.id)}
                sx={{ position: 'absolute', inset: 0, zIndex: 3 }}
              />
            ) : null}
          </Box>
        </Box>
      )}
    </AnimatePresence>
  );
};

export default DesktopWindow;

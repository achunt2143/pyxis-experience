import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Dialog } from 'remochi';
import { useWindows } from '../hooks/useWindows';
import { useApps } from '../hooks/useApps';
import { IN_COMPOSITOR } from '../utils/environment';
import { TopSystemBar } from './TopSystemBar';
import { QuickSettingsMenu } from './QuickSettingsMenu';
import { NotificationCenter } from './NotificationCenter';
import { NotificationToasts } from './NotificationToasts';
import { useNotifications } from '../hooks/useNotifications';
import { LeftLauncher } from './LeftLauncher';
import AppDrawer from './AppDrawer';
import BottomDock from './BottomDock';
import DesktopWindow from './DesktopWindow';
import {
  useEcho,
  useAppHost,
  getSetting,
  onSettingChange,
  SETTING_KEYS,
  WALLPAPERS as WALLPAPER_DEFS,
  playSystemSound,
} from '@pyxis/app-sdk';

const WALLPAPERS: Record<string, string> = Object.fromEntries(
  WALLPAPER_DEFS.map((w) => [w.id, w.css])
);
const DEFAULT_WALLPAPER = WALLPAPER_DEFS[0].css;

// Start page for the real vela browser window opened by the "Browser" app.
// Must be http(s) (Nova.OpenExternalBrowser rejects other schemes).
const BROWSER_START_PAGE = 'https://duckduckgo.com/';

export const Desktop: React.FC = () => {
  const {
    windows,
    createWindow,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    focusWindow,
    updateWindowPosition,
    activeWindowId,
  } = useWindows();

  const echo = useEcho();
  const { relaunch } = useAppHost();
  // Nova's registry. Every launch path below resolves its app id here, so
  // an .ipk app launches by exactly the same route a built-in does.
  const { byId: appsById } = useApps();

  const [wallpaper, setWallpaper] = useState<string>(DEFAULT_WALLPAPER);
  const [launchError, setLaunchErrorState] = useState<string | null>(null);
  // Every error dialog is announced with the system error sound. Clearing
  // the dialog (null) is silent.
  const setLaunchError = (message: string | null) => {
    setLaunchErrorState(message);
    if (message) void playSystemSound('error');
  };

  // Launch an app for real via Nova (single-instance raise-if-running or
  // spawn) — the only thing that happens on IN_COMPOSITOR launch. Bloom
  // never pre-creates a local "window" record for a real app anymore (see
  // useWindows.ts / DesktopWindow.tsx's IN_COMPOSITOR gate): the app is a
  // separate vela process that Evo composites and decorates directly, and
  // its dock representation (BottomDock's orphan-session icon) is driven
  // entirely by real AppHost session/surface state, not local UI state.
  // Outside the compositor (dev/design preview, no real launch possible),
  // fall back to the existing iframe-window preview via createWindow.
  const launchApp = (appId: string, name: string) => {
    if (!IN_COMPOSITOR) {
      createWindow(appId, name);
      return;
    }
    // The "Browser" entry launches a real, full vela (Gecko) window directly
    // rather than Bloom's BrowserApp shell. BrowserApp was only ever a toolbar
    // that turned around and called OpenExternalBrowser anyway (a web app can't
    // embed/drive a browsing context — X-Frame-Options/CSP block iframing, and
    // there's no Gecko embedding API), so going straight to vela gives a real
    // browser (its own chrome, tabs, persistent profile) in one click.
    // NB: OpenExternalBrowser only accepts http(s), so we can't hand it
    // `about:home`; a start page is used instead. Opening vela on its own
    // native home/new-tab would be a small Nova change (allow an empty URL).
    if (appId === 'browser') {
      echo.openExternalBrowser(BROWSER_START_PAGE).then((res) => {
        if (!res) setLaunchError("Couldn't open the browser");
      }).catch((err) => {
        setLaunchError(
          `Couldn't open the browser: ${err instanceof Error ? err.message : String(err)}`
        );
      });
      return;
    }
    echo.launchApp(appId).catch((err) => {
      setLaunchError(
        `Couldn't launch ${name}: ${err instanceof Error ? err.message : String(err)}`
      );
    });
  };

  // Dock click on an app that has a real running session but no local
  // window record (BottomDock's "orphan" branch) — relaunch if it crashed,
  // otherwise focusApp, which calls Nova's Focus method
  // (org.geckoOS.nova.Focus -> evo's FocusWindow Echo IPC command) to
  // actually raise the real compositor window and move keyboard focus to
  // it. This used to re-issue launchApp, which Nova's single-instance
  // policy turned into AppHost::set_active — bookkeeping only, it never
  // told Evo to move input focus or restack the window (there was no
  // incoming Echo IPC command for that at all; see
  // evo/src/enhancements/echo_ipc.rs's `FocusWindow`).
  const handleOrphanSelect = (appId: string, crashed: boolean) => {
    if (crashed) {
      relaunch(appId).catch(() => {});
    } else {
      echo.focusApp(appId).catch((err) => {
        setLaunchError(
          `Couldn't reach ${appId}: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    }
  };

  // Desktop Quick Settings, notification centre and App Drawer popovers.
  // Quick settings and the centre share the top-right corner, so opening
  // one closes the other.
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [appDrawerOpen, setAppDrawerOpen] = useState(false);
  const notificationCenter = useNotifications();

  // Wallpaper preference lives in the org.geckoOS.settings service; the
  // Settings app (a separate process) broadcasts changes on the settings bus.
  useEffect(() => {
    let mounted = true;
    getSetting<string>(SETTING_KEYS.wallpaper).then((saved) => {
      if (mounted && saved && WALLPAPERS[saved]) setWallpaper(WALLPAPERS[saved]);
    });
    const unsub = onSettingChange(({ key, value }) => {
      if (key === SETTING_KEYS.wallpaper && typeof value === 'string' && WALLPAPERS[value]) {
        setWallpaper(WALLPAPERS[value]);
      }
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  // Check if any window is maximized
  const hasMaximizedWindow = useMemo(
    () => windows.some(w => w.state === 'maximized'),
    [windows]
  );

  return (
    <>
      {/* Quick Settings — desktop system tray drop-down popover card */}
      <QuickSettingsMenu
        isOpen={quickSettingsOpen}
        onOpenChange={setQuickSettingsOpen}
        onLaunchApp={(appId) => {
          launchApp(appId, appsById(appId)?.name ?? appId);
        }}
      />

      <NotificationCenter
        isOpen={notificationsOpen}
        onOpenChange={setNotificationsOpen}
        notifications={notificationCenter.notifications}
        onDismiss={(id) => void notificationCenter.dismiss(id)}
        onClearAll={() => void notificationCenter.clearAll()}
      />
      {!notificationsOpen && <NotificationToasts />}

      {/* App Drawer — desktop application launcher popover card */}
      <AppDrawer
        isOpen={appDrawerOpen}
        onClose={() => setAppDrawerOpen(false)}
        onAppSelect={(appId: string) => {
          launchApp(appId, appsById(appId)?.name ?? appId);
        }}
        isCompact={hasMaximizedWindow}
      />

      <div
        style={{
          width: '100vw',
          height: '100vh',
          overflow: 'hidden',
          position: 'relative',
          background: wallpaper,
          transition: 'background 0.4s ease',
          perspective: '1200px',
        }}
      >
        {/* Animated gradient overlay for depth */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'radial-gradient(circle at 20% 50%, rgba(74, 139, 194, 0.3), transparent 50%), radial-gradient(circle at 80% 80%, rgba(255, 212, 121, 0.18), transparent 50%)',
            animation: 'gradientShift 15s ease infinite',
            pointerEvents: 'none',
          }}
        />

        {/* Top System Bar */}
        <TopSystemBar
          quickSettingsOpen={quickSettingsOpen}
          onToggleQuickSettings={() => {
            setNotificationsOpen(false);
            setQuickSettingsOpen((open) => !open);
          }}
          notificationsOpen={notificationsOpen}
          onToggleNotifications={() => {
            setQuickSettingsOpen(false);
            setNotificationsOpen((open) => !open);
          }}
          notificationCount={notificationCenter.notifications.length}
          onLaunchApp={launchApp}
        />

        {/* Left Launcher - shrinks to half when window maximized */}
        <LeftLauncher
          activeApp={activeWindowId ? windows.find(w => w.id === activeWindowId)?.appId : undefined}
          onAppSelect={(appId: string) => {
            launchApp(appId, appsById(appId)?.name ?? appId);
          }}
          isCompact={hasMaximizedWindow}
          appDrawerOpen={appDrawerOpen}
          onOpenAppDrawer={() => setAppDrawerOpen((open) => !open)}
        />

        {/* Desktop Windows — dev/design preview only. In the real
            compositor, launched apps are separate Evo-composited,
            Evo-decorated vela windows; Bloom draws no window/frame for
            them at all (see DesktopWindow.tsx's IN_COMPOSITOR gate and
            useWindows.ts — `windows` stays empty for real launches). */}
        {!IN_COMPOSITOR && (
          <AnimatePresence>
            {windows
              .filter((w) => w.state !== 'minimized')
              .map((window) => (
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
        )}

        {/* Bottom Dock - shrinks to half when window maximized */}
        <BottomDock
          windows={windows}
          activeWindowId={activeWindowId ?? undefined}
          onWindowSelect={(windowId) => {
            const window = windows.find((w) => w.id === windowId);
            if (window?.state === 'minimized') {
              minimizeWindow(windowId);
              focusWindow(windowId);
            } else if (window?.id === activeWindowId) {
              minimizeWindow(windowId);
            } else {
              focusWindow(windowId);
            }
          }}
          onWindowClose={(windowId) => closeWindow(windowId)}
          onOrphanSelect={handleOrphanSelect}
          isCompact={hasMaximizedWindow}
        />
      </div>

      <Dialog
        isOpen={launchError !== null}
        title="Launch Error"
        type="alert"
        confirmText="OK"
        onConfirm={() => setLaunchError(null)}
        onCancel={() => setLaunchError(null)}
        onClose={() => setLaunchError(null)}
      >
        <p style={{ margin: 0, color: 'var(--color-error)' }}>{launchError}</p>
      </Dialog>
    </>
  );
};

export default Desktop;

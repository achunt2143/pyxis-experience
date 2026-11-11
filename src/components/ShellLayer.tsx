import React, { useCallback, useState } from 'react';
import { Dialog } from 'remochi';
import { useApps } from '../hooks/useApps';
import { useAppWindows } from '../hooks/useAppWindows';
import { useNotifications } from '../hooks/useNotifications';
import type { useWindows } from '../hooks/useWindows';
import { CLOSE_SEARCH_EVENT, FOCUS_SEARCH_EVENT, useGlobalShortcuts } from '../hooks/useGlobalShortcuts';
import { IN_COMPOSITOR } from '../utils/environment';
import { useOverlayAnnouncer } from '../overlay/overlayChannel';
import { useOverlayKeyboard } from '../overlay/useOverlayKeyboard';
import { useFullScreenRegion, useShellRegion } from '../overlay/useOverlayRegion';
import { useWorkArea } from '../overlay/useWorkArea';
import { useMinimizeTargets } from '../overlay/useMinimizeTargets';
import { useSwitcher } from '../hooks/useSwitcher';
import { useMotion } from '../useMotion';
import { commitMs as commitDuration } from '../overview/flight';
import { useThumbnailPrefetch } from '../overview/useThumbnailPrefetch';
import { TopSystemBar } from './TopSystemBar';
import { QuickSettingsMenu } from './QuickSettingsMenu';
import { NotificationCenter } from './NotificationCenter';
import { NotificationToasts } from './NotificationToasts';
import AppDrawer from './AppDrawer';
import CardOverview from './CardOverview';
import BottomDock from './BottomDock';
import { playSystemSound, useEcho } from '@pyxis/app-sdk';

// Start page for the real vela browser window opened by the "Browser" app.
// Must be http(s) (Nova.OpenExternalBrowser rejects other schemes).
const BROWSER_START_PAGE = 'https://duckduckgo.com/';

export interface ShellLayerProps {
  /**
   * The dev/design preview's window store (`useWindows`). In the compositor
   * it stays empty: real apps are Evo's windows, not Bloom's.
   */
  windowStore: ReturnType<typeof useWindows>;
  /**
   * True where this is the shell's real layer: the overlay window, which Evo
   * keeps above apps. It then tells Evo what it covers (the input region),
   * what apps must leave alone (the work area), and when it needs the
   * keyboard. False where the shell is drawn beneath apps because there is no
   * overlay (the dev server, or an overlay that failed to open): Evo is told
   * nothing, so a stray second copy can never claim the screen.
   */
  reporting: boolean;
}

/**
 * The shell UI that must be seen over apps: top bar, dock, quick settings,
 * notification centre, app drawer, overview, search and toasts. It lives in
 * the overlay window (src/overlay/OverlayApp.tsx), so a maximized app can
 * cover none of it, and Evo keeps apps out of the bar and the dock by way of
 * the work area. The desktop window beneath is only the wallpaper.
 *
 * Panels are opened by their buttons, the dock and Evo's global shortcuts,
 * and none of that minimizes anything: the panels are simply drawn over the
 * app. While one is open it takes the whole screen for clicks (its backdrop)
 * and asks Evo for the keyboard, then gives both back on close.
 */
export const ShellLayer: React.FC<ShellLayerProps> = ({ windowStore, reporting }) => {
  const {
    windows,
    createWindow,
    closeWindow,
    minimizeWindow,
    focusWindow,
    activeWindowId,
  } = windowStore;

  const echo = useEcho();
  const appWindows = useAppWindows();
  // Nova's registry. Every launch path below resolves its app id here, so
  // an .ipk app launches by exactly the same route a built-in does.
  const { byId: appsById } = useApps();

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
    echo
      .launchApp(appId)
      .then((res) => {
        // launchApp has already asked for focus on a raise. A minimized
        // window needs restoring first, which only the window store knows.
        if (res?.raised && appWindows.viewForApp(appId)?.minimized) {
          return appWindows.activate(appId);
        }
      })
      .catch((err) => {
        setLaunchError(
          `Couldn't launch ${name}: ${err instanceof Error ? err.message : String(err)}`
        );
      });
  };

  // Dock and overview actions on a running app. They go to Evo by window id
  // (restore/focus/minimize/close) rather than back through launch, which
  // was the old path and which only moved AppHost's bookkeeping; a crashed
  // app is the one case that relaunches (see useAppWindows).
  const reportAppError = (appId: string) => (err: unknown) => {
    setLaunchError(
      `Couldn't reach ${appsById(appId)?.name ?? appId}: ${err instanceof Error ? err.message : String(err)}`
    );
  };
  const handleToggleApp = (appId: string) => {
    appWindows.toggle(appId).catch(reportAppError(appId));
  };
  const handleActivateApp = (appId: string) => {
    appWindows.activate(appId).catch(reportAppError(appId));
  };
  const handleCloseApp = (appId: string) => {
    appWindows.close(appId).catch(reportAppError(appId));
  };

  // Quick settings, notification centre, app drawer, overview and search.
  // Quick settings and the centre share the top-right corner, so opening
  // one closes the other.
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [appDrawerOpen, setAppDrawerOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const notificationCenter = useNotifications(notificationsOpen);

  // Alt+Tab, drawn as the overview (Evo owns the keys and the order). Not a
  // panel: it covers the screen so its cards take clicks, but never asks for
  // the keyboard, since Alt is held down in whatever app has it.
  // The committed card zooms onto its window before the overview comes down,
  // and how long that takes is the animation mode's (overview/flight.ts).
  const { mode } = useMotion();
  const commitMs = commitDuration(mode);
  const { switcher, dismiss: dismissSwitcher, guard: guardSwitcher } = useSwitcher(commitMs);

  const panelOpen = quickSettingsOpen || notificationsOpen || appDrawerOpen || overviewOpen || searchActive;
  const closePanels = useCallback(() => {
    setQuickSettingsOpen(false);
    setNotificationsOpen(false);
    setAppDrawerOpen(false);
    setOverviewOpen(false);
    // Search closes itself: it hears this too, and clears its query.
    window.dispatchEvent(new Event(CLOSE_SEARCH_EVENT));
  }, []);

  // A panel on screen takes every click (its backdrop covers the screen) and
  // asks for the keyboard. Evo gives the keyboard to the overlay only on
  // request, and says when something else took it, which closes the panels.
  useFullScreenRegion(reporting && (panelOpen || switcher !== null));
  useOverlayKeyboard(reporting && panelOpen, closePanels);

  // The top bar and dock take clicks wherever they are. A fullscreen app
  // covers the screen, so they leave it alone: neither drawn nor clickable.
  const shellHidden = reporting && appWindows.hasFullscreen;
  useShellRegion(reporting);
  useWorkArea(reporting);
  useMinimizeTargets(reporting);
  // Pictures of the windows for the overview and the switcher, drawn by Evo
  // and kept warm so Alt+Tab has them on its first frame.
  useThumbnailPrefetch(IN_COMPOSITOR);

  // Just type: the desktop beneath forwards the keys it hears while no app
  // has the keyboard, since the search box is here.
  useOverlayAnnouncer(
    reporting ? (text) => window.dispatchEvent(new CustomEvent(FOCUS_SEARCH_EVENT, { detail: { text } })) : undefined
  );

  // Global shortcuts, from Evo. The panels are drawn over apps, so none of
  // them needs the apps out of the way: they open over whatever is running.
  // Show desktop (Super+D) moves windows, and Evo does it itself: only the
  // compositor knows the stacking order its front-most-first, staggered
  // minimize runs in. The shell hears the signal too and has nothing to add.
  const showDesktop = () => {};
  useGlobalShortcuts({
    launcher: () => setAppDrawerOpen((open) => !open),
    overview: () => setOverviewOpen((open) => !open),
    search: () => window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT)),
    'show-desktop': showDesktop,
  });

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
      {!notificationsOpen && !quickSettingsOpen && <NotificationToasts reportRegion={reporting} />}

      {/* App Drawer — desktop application launcher popover card */}
      <AppDrawer
        isOpen={appDrawerOpen}
        onClose={() => setAppDrawerOpen(false)}
        onAppSelect={(appId: string) => {
          launchApp(appId, appsById(appId)?.name ?? appId);
        }}
      />

      {/* Palm webOS Card Overview Mode */}
      <CardOverview
        isOpen={overviewOpen || switcher !== null}
        switcher={switcher ?? undefined}
        onClose={() => {
          setOverviewOpen(false);
          dismissSwitcher();
        }}
        windows={windows}
        activeWindowId={activeWindowId ?? undefined}
        onSelectWindow={(windowId) => {
          const w = windows.find((win) => win.id === windowId);
          if (w?.state === 'minimized') {
            minimizeWindow(windowId);
          }
          focusWindow(windowId);
        }}
        onCloseWindow={(windowId) => closeWindow(windowId)}
        onActivateApp={(appId) => {
          if (switcher) guardSwitcher();
          handleActivateApp(appId);
        }}
        onCloseApp={handleCloseApp}
        onOpenAppDrawer={() => {
          setOverviewOpen(false);
          setAppDrawerOpen(true);
        }}
      />

      {!shellHidden && (
        <>
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
            onSearchActiveChange={setSearchActive}
          />

          {/* Unified Palm Quick Launch & Running Tasks Dock */}
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
            onToggleApp={handleToggleApp}
            onLaunchApp={(appId, name) => launchApp(appId, name)}
            appDrawerOpen={appDrawerOpen}
            onToggleAppDrawer={() => setAppDrawerOpen((open) => !open)}
            overviewOpen={overviewOpen}
            onToggleOverview={() => setOverviewOpen((open) => !open)}
          />
        </>
      )}

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

export default ShellLayer;

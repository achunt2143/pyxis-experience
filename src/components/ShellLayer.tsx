import React, { useCallback, useEffect, useState } from 'react';
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
import { useIdleLock } from '../overlay/useIdleLock';
import { useMinimizeTargets } from '../overlay/useMinimizeTargets';
import { useSwitcher } from '../hooks/useSwitcher';
import { useMotion } from '../useMotion';
import { ShellDialog } from './ShellDialog';
import { PrivilegePromptDialog } from './PrivilegePromptDialog';
import { commitMs as commitDuration } from '../overview/flight';
import { useThumbnailPrefetch } from '../overview/useThumbnailPrefetch';
import { TopSystemBar } from './TopSystemBar';
import { QuickSettingsMenu } from './QuickSettingsMenu';
import { NotificationCenter } from './NotificationCenter';
import { NotificationToasts } from './NotificationToasts';
import AppDrawer from './AppDrawer';
import CardOverview from './CardOverview';
import LaunchBar from './LaunchBar';
import NotificationDashboard from './NotificationDashboard';
import { LockLayer, type LockLayerPhase } from '../lock/LockLayer';
import { playSystemSound, revokePrivilege, useEcho, usePrivilegeState, useSessionState } from '@pyxis/app-sdk';

/** The shell's panels; at most one is open. */
type ShellPanel = 'quick-settings' | 'notifications' | 'drawer' | 'overview' | 'search';

// Start page for the real vela browser window opened by the "Browser" app.
// An empty URL opens vela on its native home page.
const BROWSER_START_PAGE = '';

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
 * The shell UI that must be seen over apps: top bar, launch bar (with the
 * notification dashboard), quick settings, notification centre, app drawer,
 * overview, search and toasts. It lives in
 * the overlay window (src/overlay/OverlayApp.tsx), so a maximized app can
 * cover none of it, and Evo keeps apps out of the two bars by way of
 * the work area. The desktop window beneath is only the wallpaper.
 *
 * When the session is locked (`useSessionState`) it draws the lock screen
 * (src/lock/) over all of it instead: Veil in, Clear out. Echo and Evo hold
 * the lock itself; see the comment at `lockPhase`.
 *
 * Panels are opened by their buttons, the launch bar and Evo's global shortcuts,
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
  // What the dialog said last, so its text doesn't vanish while it fades out.
  const [lastLaunchError, setLastLaunchError] = useState('');
  // Every error dialog is announced with the system error sound. Clearing
  // the dialog (null) is silent.
  const setLaunchError = (message: string | null) => {
    setLaunchErrorState(message);
    if (message) {
      setLastLaunchError(message);
      void playSystemSound('error');
    }
  };

  // Launch an app for real via Nova (single-instance raise-if-running or
  // spawn) — the only thing that happens on IN_COMPOSITOR launch. Bloom
  // never pre-creates a local "window" record for a real app anymore (see
  // useWindows.ts / DesktopWindow.tsx's IN_COMPOSITOR gate): the app is a
  // separate vela process that Evo composites and decorates directly, and
  // its launch bar representation (LaunchBar's orphan-session icon) is driven
  // entirely by real AppHost session/surface state, not local UI state.
  // Outside the compositor (dev/design preview, no real launch possible),
  // fall back to the existing iframe-window preview via createWindow.
  const launchApp = (appId: string, name: string) => {
    if (!IN_COMPOSITOR) {
      createWindow(appId, name);
      return;
    }
    // Check live window/session state before spawning so launching an already
    // running (or minimized) app from the drawer, search, or launcher activates
    // its existing window instead of creating a duplicate session.
    const existing = appWindows.viewForApp(appId);
    if (existing && !existing.crashed && (existing.windowId !== null || existing.starting)) {
      if (existing.windowId !== null) {
        void appWindows.activate(appId).catch(reportAppError(appId));
      }
      return;
    }
    // The "Browser" entry launches a real, full vela (Gecko) window directly
    // under the unified `"browser"` identity rather than Bloom's BrowserApp stub.
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

  // Launch bar and overview actions on a running app. They go to Evo by window id
  // (restore/focus/minimize/close) rather than back through launch, which
  // was the old path and which only moved AppHost's bookkeeping; a crashed
  // app is the one case that relaunches (see useAppWindows).
  const reportAppError = (appId: string) => (err: unknown) => {
    setLaunchError(
      `Couldn't reach ${appsById(appId)?.name ?? appId}: ${err instanceof Error ? err.message : String(err)}`
    );
  };
  const handleToggleApp = (appId: string, windowId?: number) => {
    appWindows.toggle(appId, windowId).catch(reportAppError(appId));
  };
  const handleActivateApp = (appId: string) => {
    appWindows.activate(appId).catch(reportAppError(appId));
  };
  const handleCloseApp = (appId: string) => {
    appWindows.close(appId).catch(reportAppError(appId));
  };

  // Quick settings, notification centre, app drawer, overview and search:
  // one at a time. Opening any of them closes the rest (the centre's toasts
  // and quick settings' panel would sit over each other, the drawer's search
  // and the bar's would both want the keyboard), through `showPanel`.
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [appDrawerOpen, setAppDrawerOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const notificationCenter = useNotifications(notificationsOpen);
  const showPanel = useCallback((panel: ShellPanel | null) => {
    setQuickSettingsOpen(panel === 'quick-settings');
    setNotificationsOpen(panel === 'notifications');
    setAppDrawerOpen(panel === 'drawer');
    setOverviewOpen(panel === 'overview');
    // Search closes itself: it hears this, and clears its query.
    if (panel !== 'search') window.dispatchEvent(new Event(CLOSE_SEARCH_EVENT));
  }, []);
  const togglePanel = (panel: ShellPanel, open: boolean) => showPanel(open ? null : panel);
  // The dashboard (at the launch bar's right end) opens the centre.
  const toggleNotifications = () => togglePanel('notifications', notificationsOpen);
  // The search box opening (a key, "just type", Super+Space) closes the rest too.
  const onSearchActiveChange = useCallback(
    (active: boolean) => {
      setSearchActive(active);
      if (active) showPanel('search');
    },
    [showPanel]
  );

  // Alt+Tab, drawn as the overview (Evo owns the keys and the order). Not a
  // panel: it covers the screen so its cards take clicks, but never asks for
  // the keyboard, since Alt is held down in whatever app has it.
  // The committed card zooms onto its window before the overview comes down,
  // and how long that takes is the animation mode's (overview/flight.ts).
  const { mode } = useMotion();
  const commitMs = commitDuration(mode);
  const { switcher, dismiss: dismissSwitcher, guard: guardSwitcher } = useSwitcher(commitMs);

  // The lock. Echo and Evo hold it (Evo draws only the overlay while locked,
  // and Echo checks the password); this layer only draws the lock screen over
  // everything while `locked`, and plays Veil and Clear around it. While it is
  // on screen it takes every click and the keyboard, and the rest of the shell
  // is hidden: beneath it during Veil (so the shell dissolves under the fade),
  // and gone once it is opaque, until Clear opens a hole onto it.
  const { state: session, locked } = useSessionState();
  const privilegeState = usePrivilegeState();
  const pendingPrivilege = privilegeState.pending[0] ?? null;
  const privilegePending = (privilegeState?.pending?.length ?? 0) > 0;
  const [lockPhase, setLockPhase] = useState<LockLayerPhase>('off');
  const lockOn = lockPhase !== 'off';
  const lockCovers = lockPhase === 'locked';

  const panelOpen = quickSettingsOpen || notificationsOpen || appDrawerOpen || overviewOpen || searchActive;
  // Locking closes every panel (adjusted while rendering; search closes itself, below).
  if (locked && (quickSettingsOpen || notificationsOpen || appDrawerOpen || overviewOpen)) {
    setQuickSettingsOpen(false);
    setNotificationsOpen(false);
    setAppDrawerOpen(false);
    setOverviewOpen(false);
  }
  useEffect(() => {
    if (locked) window.dispatchEvent(new Event(CLOSE_SEARCH_EVENT));
  }, [locked]);
  const closePanels = useCallback(() => showPanel(null), [showPanel]);

  // A panel on screen takes every click (its backdrop covers the screen) and
  // asks for the keyboard. Evo gives the keyboard to the overlay only on
  // request, and says when something else took it, which closes the panels.
  useFullScreenRegion(reporting && (panelOpen || switcher !== null || lockOn));
  useOverlayKeyboard(reporting && (panelOpen || launchError !== null || lockOn || privilegePending), closePanels);
  // Evo locks on idle, and it is told how long that is from the setting.
  useIdleLock(reporting);

  // The top bar and launch bar take clicks wherever they are. A fullscreen app
  // covers the screen, so they leave it alone: neither drawn nor clickable;
  // except that asking for search (Super+Space) brings the bar back over it
  // for as long as the search is open, since the box lives in the bar.
  const [searchSummoned, setSearchSummoned] = useState<{ text?: string } | null>(null);
  // The bar stays while the search is open: it used to go with the box still
  // open, and a box that went never said it closed, so the overlay kept the
  // whole screen and the keyboard over the fullscreen app.
  const shellHidden = reporting && appWindows.hasFullscreen && !searchActive && searchSummoned === null;
  if (searchSummoned !== null && searchActive) setSearchSummoned(null);
  useEffect(() => {
    if (!(reporting && appWindows.hasFullscreen)) return;
    const summon = (event: Event) => {
      const detail = (event as CustomEvent<{ text?: string; summoned?: boolean } | undefined>).detail;
      // Our own re-ask (below) is for the box, not another summons.
      if (searchActive || detail?.summoned) return;
      setSearchSummoned({ text: detail?.text });
    };
    window.addEventListener(FOCUS_SEARCH_EVENT, summon);
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, summon);
  }, [reporting, appWindows.hasFullscreen, searchActive]);
  // Once the bar is drawn again its box is listening: ask it again, and give
  // up after a second if it never opened, so the bar doesn't stay over the app.
  useEffect(() => {
    if (searchSummoned === null) return;
    window.dispatchEvent(new CustomEvent(FOCUS_SEARCH_EVENT, { detail: { text: searchSummoned.text, summoned: true } }));
    const giveUp = window.setTimeout(() => setSearchSummoned(null), 1000);
    return () => window.clearTimeout(giveUp);
  }, [searchSummoned]);
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
    launcher: () => togglePanel('drawer', appDrawerOpen),
    overview: () => togglePanel('overview', overviewOpen),
    search: () => window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT)),
    'show-desktop': showDesktop,
  });

  return (
    <>
      {/* While the lock screen is opaque the shell is not drawn at all: nothing of it can show through or be reached. */}
      {!lockCovers && (
        <>
        {/* Quick Settings — desktop system tray drop-down popover card */}
        <QuickSettingsMenu
          isOpen={quickSettingsOpen}
          onOpenChange={(open) => showPanel(open ? 'quick-settings' : null)}
          onLaunchApp={(appId) => {
            launchApp(appId, appsById(appId)?.name ?? appId);
          }}
        />

        <NotificationCenter
          isOpen={notificationsOpen}
          onOpenChange={(open) => showPanel(open ? 'notifications' : null)}
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
          onOpenAppDrawer={() => showPanel('drawer')}
        />

        {!shellHidden && (
          <>
            {/* Top System Bar */}
            <TopSystemBar
              quickSettingsOpen={quickSettingsOpen}
              onToggleQuickSettings={() => togglePanel('quick-settings', quickSettingsOpen)}
              onLaunchApp={launchApp}
              onSearchActiveChange={onSearchActiveChange}
              privilegeState={privilegeState}
              onRevokePrivilege={() => {
                void revokePrivilege(privilegeState.grant?.appId);
              }}
            />

            {/* The launch bar, with the notification dashboard at its right end */}
            <LaunchBar
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
              onCloseAppWindow={(appId, windowId) => {
                appWindows.close(appId, windowId).catch(reportAppError(appId));
              }}
              onLaunchApp={(appId, name) => launchApp(appId, name)}
              appDrawerOpen={appDrawerOpen}
              onToggleAppDrawer={() => togglePanel('drawer', appDrawerOpen)}
              overviewOpen={overviewOpen}
              onToggleOverview={() => togglePanel('overview', overviewOpen)}
              dashboard={
                <NotificationDashboard
                  notifications={notificationCenter.notifications}
                  centreOpen={notificationsOpen}
                  onToggleCentre={toggleNotifications}
                />
              }
            />
          </>
        )}

        <ShellDialog
          open={launchError !== null}
          id="launch-error"
          title="Launch Error"
          tone="error"
          confirmLabel="OK"
          onConfirm={() => setLaunchError(null)}
        >
          {launchError ?? lastLaunchError}
        </ShellDialog>

        <PrivilegePromptDialog request={pendingPrivilege} />
        </>
      )}

      {/* The lock screen, over everything: Veil in, Clear out (src/lock/). */}
      <LockLayer
        locked={locked}
        session={session}
        notifications={notificationCenter.notifications}
        onPhaseChange={setLockPhase}
      />
    </>
  );
};

export default ShellLayer;

import { createContext, useCallback, useContext, useMemo } from 'react';
import { useAppHost, useEcho } from '@pyxis/app-sdk';
import {
  deriveAppViews,
  type AppWindowView,
  type CompositorWindow,
  type WindowsState,
} from './compositorWindows';

export const CompositorWindowsContext = createContext<WindowsState | null>(null);

/** Raw Evo window state. Most callers want `useAppWindows`. */
export function useCompositorWindows(): WindowsState {
  const state = useContext(CompositorWindowsContext);
  if (!state) throw new Error('useCompositorWindows() needs a <CompositorWindowsProvider>');
  return state;
}

export interface AppWindows {
  views: AppWindowView[];
  viewForApp: (appId: string) => AppWindowView | undefined;
  /** Every window currently filling the screen, minimized ones excluded. */
  hasFullscreenOrMaximized: boolean;
  /** Whether an app window that is not minimized covers the whole screen. */
  hasFullscreen: boolean;
  allWindows: CompositorWindow[];
  /**
   * Bring an app forward: relaunch if it crashed, restore then focus if it is
   * minimized, focus otherwise. Does nothing for an app that has no window yet.
   */
  activate: (appId: string) => Promise<void>;
  /** Dock click: minimize the focused app, otherwise `activate` it. */
  toggle: (appId: string) => Promise<void>;
  /**
   * Close gracefully. An app with windows is asked to close them, as its
   * titlebar X does (so it can prompt for unsaved work); one with none yet
   * is closed through Nova. A crashed app has nothing to close.
   */
  close: (appId: string) => Promise<void>;
}

/**
 * The shell's view of running apps: AppHost sessions joined to Evo windows,
 * plus the actions the dock and overview share. Relaunch is only ever for a
 * crashed app, never a way to close one.
 */
export function useAppWindows(): AppWindows {
  const echo = useEcho();
  const { sessions, relaunch } = useAppHost();
  const windows = useCompositorWindows();

  const views = useMemo(() => deriveAppViews(sessions, windows), [sessions, windows]);

  const viewForApp = useCallback(
    (appId: string) => views.find((v) => v.appId === appId),
    [views]
  );

  const allWindows = useMemo(() => Object.values(windows.byId), [windows]);
  const hasFullscreenOrMaximized = useMemo(
    () => allWindows.some((w) => !w.minimized && (w.maximized || w.fullscreen)),
    [allWindows]
  );

  const hasFullscreen = useMemo(
    () => allWindows.some((w) => !w.minimized && w.fullscreen),
    [allWindows]
  );

  const activate = useCallback(
    async (appId: string) => {
      const v = viewForApp(appId);
      if (!v) return;
      if (v.crashed) {
        await relaunch(appId);
        return;
      }
      if (v.windowId === null) return;
      if (v.minimized) await echo.restoreWindow(v.windowId);
      await echo.focusWindow(v.windowId);
    },
    [viewForApp, relaunch, echo]
  );

  const toggle = useCallback(
    async (appId: string) => {
      const v = viewForApp(appId);
      if (v && v.focused && v.windowId !== null) {
        await echo.minimizeWindow(v.windowId);
        return;
      }
      await activate(appId);
    },
    [viewForApp, activate, echo]
  );

  const close = useCallback(
    async (appId: string) => {
      const v = viewForApp(appId);
      if (!v || v.crashed) return;
      if (v.windows.length > 0) {
        await Promise.all(v.windows.map((w) => echo.closeWindow(w.windowId)));
      } else {
        await echo.closeApp(appId);
      }
    },
    [viewForApp, echo]
  );

  return { views, viewForApp, hasFullscreenOrMaximized, hasFullscreen, allWindows, activate, toggle, close };
}

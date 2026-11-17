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

const SHELL_APP_IDS = new Set(['bloom', 'bloom-overlay']);

export interface AppWindows {
  views: AppWindowView[];
  viewForApp: (appId: string) => AppWindowView | undefined;
  /** Every window currently filling the screen, minimized ones excluded. */
  hasFullscreenOrMaximized: boolean;
  /** Whether an app window that is not minimized covers the whole screen. */
  hasFullscreen: boolean;
  allWindows: CompositorWindow[];
  /**
   * Bring an app (or a specific window of it) forward: relaunch if it crashed,
   * restore then focus if minimized, focus otherwise. Does nothing when no
   * matching mapped window exists yet.
   */
  activate: (appId: string, windowId?: number) => Promise<void>;
  /**
   * Dock / menu click: minimize the focused app (or the targeted window if it
   * holds focus and is visible), otherwise `activate` it.
   */
  toggle: (appId: string, windowId?: number) => Promise<void>;
  /**
   * Close gracefully. An app (or targeted window) with mapped windows is asked
   * to close them, as its titlebar X does (so it can prompt for unsaved work);
   * an app with none yet is closed through Nova when closing the whole app.
   * A crashed app has nothing to close.
   */
  close: (appId: string, windowId?: number) => Promise<void>;
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
    () =>
      allWindows.some(
        (w) => !SHELL_APP_IDS.has(w.waylandAppId) && !w.minimized && (w.maximized || w.fullscreen)
      ),
    [allWindows]
  );

  const hasFullscreen = useMemo(
    () => allWindows.some((w) => !SHELL_APP_IDS.has(w.waylandAppId) && !w.minimized && w.fullscreen),
    [allWindows]
  );

  const activate = useCallback(
    async (appId: string, windowId?: number) => {
      const v = viewForApp(appId);
      if (v?.crashed) {
        await relaunch(appId);
        return;
      }
      if (!v && windowId === undefined) return;
      const target =
        windowId !== undefined
          ? v?.windows.find((w) => w.windowId === windowId) ?? windows.byId[windowId]
          : v!.windows.find((w) => w.windowId === v!.windowId) ??
            v!.windows.find((w) => !w.minimized) ??
            v!.windows[0];
      if (!target) return;
      if (target.minimized) await echo.restoreWindow(target.windowId);
      await echo.focusWindow(target.windowId);
    },
    [viewForApp, windows.byId, relaunch, echo]
  );

  const toggle = useCallback(
    async (appId: string, windowId?: number) => {
      const v = viewForApp(appId);
      if (v?.crashed) {
        await relaunch(appId);
        return;
      }
      if (windowId !== undefined) {
        const target = v?.windows.find((w) => w.windowId === windowId) ?? windows.byId[windowId];
        if (target && !target.minimized && windows.focusedId === target.windowId) {
          await echo.minimizeWindow(target.windowId);
          return;
        }
        await activate(appId, windowId);
        return;
      }
      if (v && v.focused && v.windowId !== null) {
        await echo.minimizeWindow(v.windowId);
        return;
      }
      await activate(appId);
    },
    [viewForApp, windows.byId, windows.focusedId, relaunch, activate, echo]
  );

  const close = useCallback(
    async (appId: string, windowId?: number) => {
      const v = viewForApp(appId);
      if (v?.crashed) return;
      if (windowId !== undefined) {
        const target = v?.windows.find((w) => w.windowId === windowId) ?? windows.byId[windowId];
        if (target) await echo.closeWindow(target.windowId);
        return;
      }
      if (!v) return;
      if (v.windows.length > 0) {
        await Promise.all(v.windows.map((w) => echo.closeWindow(w.windowId)));
      } else {
        await echo.closeApp(appId);
      }
    },
    [viewForApp, windows.byId, echo]
  );

  return { views, viewForApp, hasFullscreenOrMaximized, hasFullscreen, allWindows, activate, toggle, close };
}

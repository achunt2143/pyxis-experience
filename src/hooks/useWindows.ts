import { useState, useCallback } from 'react';
import type { ComponentType } from 'react';
import type { DesktopWindowType, WindowState, AppEntry } from '../types';
import {
  TerminalApp,
  FilesApp,
  SettingsApp,
  BrowserApp,
} from '../apps';

// Real Pyxis built-in apps. The component reference is stored on the window
// so DesktopWindow can render it directly.
const REAL_APPS: AppEntry[] = [
  { id: 'terminal', name: 'Terminal', icon: '💻', component: TerminalApp as ComponentType<any> },
  { id: 'files', name: 'Files', icon: '📁', component: FilesApp as ComponentType<any> },
  { id: 'settings', name: 'Settings', icon: '⚙️', component: SettingsApp as ComponentType<any> },
  { id: 'browser', name: 'Browser', icon: '🌐', component: BrowserApp as ComponentType<any> },
];

export function useWindows() {
  const generateId = () => Math.random().toString(36).substr(2, 9);

  const findApp = (appId: string) => REAL_APPS.find((a) => a.id === appId);

  const buildWindow = (
    appId: string,
    title: string,
    overrides: Partial<DesktopWindowType> = {}
  ): DesktopWindowType => {
    const app = findApp(appId);
    return {
      id: overrides.id ?? generateId(),
      title,
      appId,
      state: 'normal',
      position: { x: Math.random() * 200 + 50, y: Math.random() * 200 + 50 },
      size: { width: 800, height: 600 },
      zIndex: 1,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      component: app?.component,
      ...overrides,
    };
  };

  const [windows, setWindows] = useState<DesktopWindowType[]>([
    buildWindow('terminal', 'Terminal — gecko@pyxis', {
      position: { x: 120, y: 120 },
      size: { width: 760, height: 460 },
      zIndex: 1,
    }),
    buildWindow('files', 'Files', {
      position: { x: 260, y: 160 },
      size: { width: 720, height: 500 },
      zIndex: 2,
    }),
  ]);

  const createWindow = useCallback((appId: string, title?: string) => {
    setWindows((prev) => {
      const app = findApp(appId);
      const resolvedTitle = title ?? app?.name ?? appId;
      const newWindow = buildWindow(appId, resolvedTitle, {
        zIndex: Math.max(...prev.map((w) => w.zIndex), 0) + 1,
      });
      return [...prev, newWindow];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeWindow = useCallback((windowId: string) => {
    setWindows((prev) => prev.filter((w) => w.id !== windowId));
  }, []);

  const minimizeWindow = useCallback((windowId: string) => {
    setWindows((prev) =>
      prev.map((w) =>
        w.id === windowId
          ? { ...w, state: (w.state === 'minimized' ? 'normal' : 'minimized') as WindowState }
          : w
      )
    );
  }, []);

  const maximizeWindow = useCallback((windowId: string) => {
    setWindows((prev) =>
      prev.map((w) => {
        if (w.id === windowId) {
          const isMaximized = w.state === 'maximized';
          return {
            ...w,
            state: (isMaximized ? 'normal' : 'maximized') as WindowState,
            innerWidth: window.innerWidth,
            innerHeight: window.innerHeight,
          };
        }
        return w;
      })
    );
  }, []);

  const focusWindow = useCallback((windowId: string) => {
    setWindows((prev) => {
      const maxZIndex = Math.max(...prev.map((w) => w.zIndex));
      return prev.map((w) =>
        w.id === windowId ? { ...w, zIndex: maxZIndex + 1 } : w
      );
    });
  }, []);

  const updateWindowPosition = useCallback(
    (windowId: string, x: number, y: number) => {
      setWindows((prev) =>
        prev.map((w) => (w.id === windowId ? { ...w, position: { x, y } } : w))
      );
    },
    []
  );

  const updateWindowSize = useCallback(
    (windowId: string, width: number, height: number) => {
      setWindows((prev) =>
        prev.map((w) =>
          w.id === windowId ? { ...w, size: { width, height } } : w
        )
      );
    },
    []
  );

  // Track active window ID
  const activeWindowId =
    windows.length > 0
      ? windows.reduce((max, w) => (w.zIndex > max.zIndex ? w : max)).id
      : null;

  return {
    windows,
    createWindow,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    focusWindow,
    updateWindowPosition,
    updateWindowSize,
    mockApps: REAL_APPS,
    apps: REAL_APPS,
    activeWindowId,
  };
}

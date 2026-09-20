import { useState, useCallback, useEffect } from 'react';
import type { DesktopWindowType, WindowState } from '../types';
import { PYXIS_APPS, appById } from '../apps/registry';

export function useWindows() {
  const generateId = () => Math.random().toString(36).substr(2, 9);

  const buildWindow = (
    appId: string,
    title: string,
    overrides: Partial<DesktopWindowType> = {}
  ): DesktopWindowType => {
    const app = appById(appId);
    return {
      id: overrides.id ?? generateId(),
      title,
      appId,
      state: 'normal',
      position: { x: Math.random() * 200 + 50, y: Math.random() * 200 + 50 },
      size: app?.defaultSize ?? { width: 800, height: 600 },
      zIndex: 1,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      entryHtml: app?.entryHtml,
      ...overrides,
    };
  };

  // No windows are seeded at mount. These used to pre-open fake
  // "terminal"/"notes" windows unconditionally, on every load, whether or
  // not those apps were actually running — in compositor mode that meant
  // Bloom drew its own fake decorated window around apps with zero real
  // Evo-composited surfaces the instant the shell painted, before the user
  // ever launched anything (see DesktopWindow.tsx's IN_COMPOSITOR gate for
  // why that DOM-drawn frame shouldn't exist for real app windows at all).
  const [windows, setWindows] = useState<DesktopWindowType[]>([]);

  const createWindow = useCallback((appId: string, title?: string) => {
    setWindows((prev) => {
      const app = appById(appId);
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

  // Standalone app documents request their own close cooperatively via
  // postMessage (see @pyxis/app-sdk's mountApp.tsx) — the shell owns the window.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; windowId?: string };
      if (data?.type === 'pyxis:app-close' && data.windowId) {
        closeWindow(data.windowId);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [closeWindow]);

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

  // Track active window ID (only among visible, non-minimized windows)
  const activeWindowId = (() => {
    const visibleWindows = windows.filter((w) => w.state !== 'minimized');
    return visibleWindows.length > 0
      ? visibleWindows.reduce((max, w) => (w.zIndex > max.zIndex ? w : max)).id
      : null;
  })();

  return {
    windows,
    createWindow,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    focusWindow,
    updateWindowPosition,
    updateWindowSize,
    mockApps: PYXIS_APPS,
    apps: PYXIS_APPS,
    activeWindowId,
  };
}

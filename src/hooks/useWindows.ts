import { useState, useCallback, useEffect, useRef } from 'react';
import type { DesktopWindowType, WindowState } from '../types';
import { DEFAULT_APP_SIZE } from '../apps/registry';
import { useApps } from './useApps';

export function useWindows() {
  const generateId = () => Math.random().toString(36).substr(2, 9);

  // Nova's registry supplies the window's entry URL and preferred size, so
  // an .ipk app opens a real window without an entry in PYXIS_APPS. Held in
  // a ref because buildWindow runs inside setWindows' updater, where a
  // captured value would be a render behind.
  const { byId: appsById } = useApps();
  const appsByIdRef = useRef(appsById);
  useEffect(() => {
    appsByIdRef.current = appsById;
  }, [appsById]);

  const buildWindow = (
    appId: string,
    title: string,
    overrides: Partial<DesktopWindowType> = {}
  ): DesktopWindowType => {
    const app = appsByIdRef.current(appId);
    return {
      id: overrides.id ?? generateId(),
      title,
      appId,
      state: 'normal',
      position: { x: Math.random() * 200 + 72, y: Math.random() * 200 + 48 },
      size: app?.defaultSize ?? DEFAULT_APP_SIZE,
      zIndex: 1,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      entryUrl: app?.entryUrl ?? undefined,
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
      const resolvedTitle = title ?? appsByIdRef.current(appId)?.name ?? appId;
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
    const onResize = () => {
      setWindows((prev) =>
        prev.length === 0
          ? prev
          : prev.map((w) =>
              w.innerWidth === window.innerWidth && w.innerHeight === window.innerHeight
                ? w
                : { ...w, innerWidth: window.innerWidth, innerHeight: window.innerHeight }
            )
      );
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('resize', onResize);
    };
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
    activeWindowId,
  };
}

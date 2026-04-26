import { useState, useCallback } from 'react';
import type { DesktopWindowType, WindowState } from '../types';

const MOCK_APPS = [
  { id: 'terminal', name: 'Terminal', icon: 'Terminal' },
  { id: 'files', name: 'File Manager', icon: 'Folder' },
  { id: 'editor', name: 'Text Editor', icon: 'FileText' },
  { id: 'browser', name: 'Web Browser', icon: 'Globe' },
  { id: 'settings', name: 'Settings', icon: 'Settings' },
];

export function useWindows() {
  const generateId = () => Math.random().toString(36).substr(2, 9);

  const [windows, setWindows] = useState<DesktopWindowType[]>([
    {
      id: generateId(),
      title: 'Terminal - /home/user',
      appId: 'terminal',
      state: 'normal',
      position: { x: 100, y: 100 },
      size: { width: 800, height: 600 },
      zIndex: 1,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    },
    {
      id: generateId(),
      title: 'File Manager',
      appId: 'files',
      state: 'normal',
      position: { x: 250, y: 150 },
      size: { width: 700, height: 500 },
      zIndex: 2,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    },
    {
      id: generateId(),
      title: 'Editor - project.rs',
      appId: 'editor',
      state: 'normal',
      position: { x: 400, y: 200 },
      size: { width: 900, height: 550 },
      zIndex: 3,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    },
    {
      id: generateId(),
      title: 'Terminal - build logs',
      appId: 'terminal',
      state: 'normal',
      position: { x: 120, y: 120 },
      size: { width: 800, height: 600 },
      zIndex: 0,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    },
  ]);

  const createWindow = useCallback((appId: string, title: string) => {
    const newWindow: DesktopWindowType = {
      id: generateId(),
      title,
      appId,
      state: 'normal',
      position: { x: Math.random() * 200 + 50, y: Math.random() * 200 + 50 },
      size: { width: 700, height: 500 },
      zIndex: Math.max(...windows.map(w => w.zIndex), 0) + 1,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    };
    setWindows(prev => [...prev, newWindow]);
  }, [windows]);

  const closeWindow = useCallback((windowId: string) => {
    setWindows(prev => prev.filter(w => w.id !== windowId));
  }, []);

  const minimizeWindow = useCallback((windowId: string) => {
    setWindows(prev =>
      prev.map(w =>
        w.id === windowId
          ? { ...w, state: (w.state === 'minimized' ? 'normal' : 'minimized') as WindowState }
          : w
      )
    );
  }, []);

  const maximizeWindow = useCallback((windowId: string) => {
    setWindows(prev =>
      prev.map(w => {
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
    setWindows(prev => {
      const maxZIndex = Math.max(...prev.map(w => w.zIndex));
      return prev.map(w =>
        w.id === windowId ? { ...w, zIndex: maxZIndex + 1 } : w
      );
    });
  }, []);

  const updateWindowPosition = useCallback((windowId: string, x: number, y: number) => {
    setWindows(prev =>
      prev.map(w => (w.id === windowId ? { ...w, position: { x, y } } : w))
    );
  }, []);

  const updateWindowSize = useCallback((windowId: string, width: number, height: number) => {
    setWindows(prev =>
      prev.map(w => (w.id === windowId ? { ...w, size: { width, height } } : w))
    );
  }, []);

  // Track active window ID
  const activeWindowId = windows.length > 0 
    ? windows.reduce((max, w) => w.zIndex > max.zIndex ? w : max).id 
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
    mockApps: MOCK_APPS,
    activeWindowId,
  };
}

export type WindowState = 'normal' | 'minimized' | 'maximized';

export interface DesktopWindowType {
  id: string;
  title: string;
  appId: string;
  state: WindowState;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  innerWidth: number;
  innerHeight: number;
}

export interface AppInfo {
  id: string;
  name: string;
  icon: string;
}

export interface WindowContextType {
  windows: DesktopWindowType[];
  createWindow: (appId: string, title: string) => void;
  closeWindow: (windowId: string) => void;
  minimizeWindow: (windowId: string) => void;
  maximizeWindow: (windowId: string) => void;
  focusWindow: (windowId: string) => void;
  updateWindowPosition: (windowId: string, x: number, y: number) => void;
  updateWindowSize: (windowId: string, width: number, height: number) => void;
}
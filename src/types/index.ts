import type { ComponentType } from 'react';

export type WindowState = 'normal' | 'minimized' | 'maximized';

/**
 * Props passed to every app component rendered inside a DesktopWindow.
 * Apps may accept additional props of their own type — this is the minimum
 * contract DesktopWindow guarantees.
 */
export interface AppComponentProps {
  windowId: string;
  onClose?: () => void;
}

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
  /** Component rendered inside the window body. Optional for backwards compat. */
  component?: ComponentType<AppComponentProps>;
}

export interface AppInfo {
  id: string;
  name: string;
  icon: string;
}

/**
 * AppEntry — registry entry for a built-in Pyxis app, including its component.
 */
export interface AppEntry extends AppInfo {
  component: ComponentType<AppComponentProps>;
}

export interface WindowContextType {
  windows: DesktopWindowType[];
  createWindow: (appId: string, title?: string) => void;
  closeWindow: (windowId: string) => void;
  minimizeWindow: (windowId: string) => void;
  maximizeWindow: (windowId: string) => void;
  focusWindow: (windowId: string) => void;
  updateWindowPosition: (windowId: string, x: number, y: number) => void;
  updateWindowSize: (windowId: string, width: number, height: number) => void;
}

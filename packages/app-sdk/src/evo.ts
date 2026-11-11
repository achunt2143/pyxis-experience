// Evo's window surface as the shell sees it: the `org.geckoOS.evo` service's
// window calls and the signals it emits. The names and payload fields mirror
// evo/src/enhancements/echo_ipc.rs (`emit_window_*`, the `ListWindows`
// handler); src/hooks/__tests__/evoContract.test.ts reads them back out of
// that file, so a rename there fails at the desk rather than on a device.

export const EVO_SERVICE = 'evo';
// EVO_IFACE lives in overlay.ts, which met it first.

export const EVO_SIGNALS = {
  created: 'WindowCreated',
  closed: 'WindowClosed',
  moved: 'WindowMoved',
  focusChanged: 'WindowFocusChanged',
  minimized: 'WindowMinimized',
  maximized: 'WindowMaximized',
  fullscreen: 'WindowFullscreen',
} as const;

// A global shortcut Evo caught whichever app had the keyboard: `launcher` is
// Super tapped alone, `overview` Super+Tab, `search` Super+Space, and
// `show-desktop` Super+D. (Alt+Tab never reaches the shell: Evo does it.)
// Not a window signal, so the contract test's window-signal check leaves it
// out; it reads this one on its own.
export const EVO_SHORTCUT_SIGNAL = 'ShortcutTriggered';
export type EvoShortcutAction = 'launcher' | 'overview' | 'search' | 'show-desktop';
export interface EvoShortcutPayload {
  action: EvoShortcutAction;
  timestamp: number;
}

/**
 * One row of `evo.ListWindows`. `window_id` is the compositor's id for the
 * toplevel, which is the same number AppHost lists in `session.surfaces`.
 *
 * `minimized`, `maximized` and `fullscreen` are not in every Evo build's
 * reply: the signals carry them, and a build that doesn't send them in the
 * list is read through `visible` (a minimized window is unmapped, so Evo
 * reports it `visible: false` at 0,0).
 */
export interface EvoWindowInfo {
  window_id: number;
  app_id: string;
  width: number;
  height: number;
  x: number;
  y: number;
  focused: boolean;
  visible: boolean;
  minimized?: boolean;
  maximized?: boolean;
  fullscreen?: boolean;
}

export interface EvoWindowCreatedPayload {
  window_id: number;
  app_id: string;
  width: number;
  height: number;
}
export interface EvoWindowClosedPayload {
  window_id: number;
}
export interface EvoWindowMovedPayload {
  window_id: number;
  x: number;
  y: number;
  timestamp: number;
}
export interface EvoWindowFocusChangedPayload {
  /** Null when focus left every window (the desktop, or an empty workspace). */
  window_id: number | null;
  workspace_id: number;
  timestamp: number;
}
export interface EvoWindowMinimizedPayload {
  window_id: number;
  minimized: boolean;
  timestamp: number;
}
export interface EvoWindowMaximizedPayload {
  window_id: number;
  maximized: boolean;
  timestamp: number;
}
export interface EvoWindowFullscreenPayload {
  window_id: number;
  fullscreen: boolean;
  timestamp: number;
}

/**
 * The shell's overlay window: Bloom's layer above app windows.
 *
 * Evo stacks the desktop (Bloom's main window) beneath every app. What must
 * be seen over apps, such as notification toasts and later the lock screen,
 * lives in a second, transparent Bloom window, the overlay, which Evo keeps
 * on top (evo/src/shell/overlay.rs). Evo can't tell which of the overlay's
 * pixels are drawn, so the overlay tells it: `setOverlayRegion` sends the
 * rectangles it currently draws in, and only those take clicks. Everywhere
 * else a click falls through to the app or desktop beneath.
 *
 * The overlay holds the whole shell UI (top bar, dock, panels), so three more
 * things go through Evo: the edges apps must leave to the bar and dock
 * (`setWorkArea`), the keyboard while a panel is open (`setOverlayFocus`;
 * Evo never gives it on its own), and a report of what Evo has granted
 * (`getOverlayState`, and the `OverlayFocusChanged` signal). All of it needs
 * `windows:manage`, which only the shell holds.
 */
import { echoClient } from './EchoClient';

export const EVO_IFACE = 'org.geckoOS.evo';

/** A rectangle in the overlay's CSS pixels, which are the screen's. */
export interface OverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Replace the overlay's input region. An empty list makes the whole overlay
 * click-through. Resolves to false when Evo isn't there to ask; the overlay
 * then simply takes no clicks, which never blocks the desktop.
 */
export async function setOverlayRegion(rects: OverlayRect[]): Promise<boolean> {
  try {
    const res = (await echoClient.callMethod('evo', EVO_IFACE, 'SetOverlayRegion', { rects })) as
      | { success?: boolean }
      | undefined;
    return res?.success ?? false;
  } catch {
    return false;
  }
}

/** Edges of the screen the shell occupies, in CSS pixels. */
export interface WorkAreaInsets {
  top: number;
  bottom: number;
  left?: number;
  right?: number;
}

/**
 * Tell Evo which edges of the screen the shell occupies. Maximized windows,
 * new windows and dragged windows then keep out of them; fullscreen still
 * covers everything. Windows already open are re-fitted.
 */
export async function setWorkArea(insets: WorkAreaInsets): Promise<boolean> {
  try {
    const res = (await echoClient.callMethod('evo', EVO_IFACE, 'SetWorkArea', {
      top: insets.top,
      bottom: insets.bottom,
      left: insets.left ?? 0,
      right: insets.right ?? 0,
    })) as { success?: boolean } | undefined;
    return res?.success ?? false;
  } catch {
    return false;
  }
}

/**
 * Where one app's dock icon is, in CSS pixels from the screen's origin: the
 * rectangle its windows minimize into and restore out of.
 */
export interface MinimizeTarget {
  appId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * The app's accent, `#rrggbb`: the colour Evo's Lumen Droplet rounds the
   * window off into. Omit it when the shell doesn't know one; Evo then takes
   * the window's own average colour.
   */
  accent?: string;
}

const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

/** One target as Evo's `SetMinimizeTargets` reads it (`accent` only when valid). */
export function minimizeTargetPayload(t: MinimizeTarget): Record<string, unknown> {
  const entry: Record<string, unknown> = { app_id: t.appId, x: t.x, y: t.y, w: t.width, h: t.height };
  if (t.accent && HEX_COLOUR.test(t.accent)) entry.accent = t.accent.toLowerCase();
  return entry;
}

/**
 * Tell Evo where each app's dock icon is, so a window springs into its icon
 * when minimized and out of it when restored. Replaces the previous table;
 * send it whenever the dock lays out or moves. An app with no entry
 * minimizes toward the bottom centre of the screen. Evo forgets the table
 * when the overlay window goes, so a dead shell leaves nothing behind.
 */
export async function setMinimizeTargets(targets: MinimizeTarget[]): Promise<boolean> {
  try {
    const res = (await echoClient.callMethod('evo', EVO_IFACE, 'SetMinimizeTargets', {
      targets: targets.map(minimizeTargetPayload),
    })) as { ok?: boolean } | undefined;
    return res?.ok ?? false;
  } catch {
    return false;
  }
}

/**
 * Ask Evo to give the overlay the keyboard (`true`), or take it back
 * (`false`, which hands it to the next app down the stack). A panel that
 * takes typing asks while it is open. Evo reports the outcome as
 * `OverlayFocusChanged`.
 */
export async function setOverlayFocus(focused: boolean): Promise<boolean> {
  try {
    const res = (await echoClient.callMethod('evo', EVO_IFACE, 'SetOverlayFocus', { focused })) as
      | { success?: boolean }
      | undefined;
    return res?.success ?? false;
  } catch {
    return false;
  }
}

/** What Evo says the overlay has right now. */
export interface OverlayState {
  keyboard: boolean;
  rects: OverlayRect[];
  workArea: Required<WorkAreaInsets>;
}

export async function getOverlayState(): Promise<OverlayState | null> {
  try {
    return ((await echoClient.callMethod('evo', EVO_IFACE, 'GetOverlayState', {})) as OverlayState | undefined) ?? null;
  } catch {
    return null;
  }
}

/**
 * Evo's signal for the overlay gaining or losing the keyboard. It loses it
 * when the shell gives it back, and also when anything else takes it (an
 * Alt+Tab, say): a panel that was typing into the overlay should close then.
 */
export const OVERLAY_FOCUS_SIGNAL = 'OverlayFocusChanged';

export function onOverlayFocusChanged(callback: (focused: boolean) => void): () => void {
  return echoClient.onSignal(EVO_IFACE, OVERLAY_FOCUS_SIGNAL, (data) => {
    callback(Boolean((data as { focused?: boolean } | undefined)?.focused));
  });
}

/**
 * Evo's Alt+Tab, for the shell to draw. Evo owns the keys and the
 * most-recently-used order (an app has the keyboard, so only Evo sees
 * Alt+Tab); the shell shows its overview with `selected` highlighted.
 *
 * - `open`: Alt is still held 150 ms after the first Tab. Never sent for a
 *   quick tap.
 * - `step`: another Tab (Shift+Tab goes back) while it is shown.
 * - `commit`: Alt released; Evo has already focused `selected`. Also sent for
 *   a quick tap, with no `open` before it: a shell that is not showing the
 *   switcher ignores it.
 * - `cancel`: Escape while Alt is held. Focus stays where it was.
 *
 * `order` is every switchable window id, most recently used first. Needs
 * `windows:manage`. There is no native Evo in the dev server: replay one
 * with `echoClient.emitSignal(EVO_IFACE, SWITCHER_SIGNAL, payload)`.
 */
export const SWITCHER_SIGNAL = 'SwitcherChanged';

export type SwitcherPhase = 'open' | 'step' | 'commit' | 'cancel';

export interface SwitcherPayload {
  phase: SwitcherPhase;
  /** The window the walk is on. */
  selected: number;
  order: number[];
  timestamp?: number;
}

export function onSwitcherChanged(callback: (payload: SwitcherPayload) => void): () => void {
  return echoClient.onSignal(EVO_IFACE, SWITCHER_SIGNAL, (data) => {
    const p = data as Partial<SwitcherPayload> | undefined;
    if (!p || typeof p.selected !== 'number' || !Array.isArray(p.order)) return;
    if (p.phase !== 'open' && p.phase !== 'step' && p.phase !== 'commit' && p.phase !== 'cancel') return;
    callback({ phase: p.phase, selected: p.selected, order: p.order, timestamp: p.timestamp });
  });
}

/**
 * Evo's signal for a window reaching its dock icon or leaving it (Lumen):
 * `land` when a minimizing window's Droplet is 90% of the way into the icon,
 * `rise` when a restore starts out of it. The dock ripples the icon at both.
 * Needs `windows:manage` (and a vela with the bridge entry). The dev server's
 * mock emits it from `MinimizeWindow` and `RestoreWindow`.
 */
export const MINIMIZE_LANDED_SIGNAL = 'MinimizeLanded';

export type MinimizeLandedPhase = 'land' | 'rise';

export interface MinimizeLandedPayload {
  app_id: string;
  window_id: number;
  phase: MinimizeLandedPhase;
  timestamp?: number;
}

export function onMinimizeLanded(callback: (payload: MinimizeLandedPayload) => void): () => void {
  return echoClient.onSignal(EVO_IFACE, MINIMIZE_LANDED_SIGNAL, (data) => {
    const p = data as Partial<MinimizeLandedPayload> | undefined;
    if (!p || typeof p.app_id !== 'string' || !p.app_id) return;
    if (p.phase !== 'land' && p.phase !== 'rise') return;
    callback({
      app_id: p.app_id,
      window_id: typeof p.window_id === 'number' ? p.window_id : -1,
      phase: p.phase,
      timestamp: p.timestamp,
    });
  });
}

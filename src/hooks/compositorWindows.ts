import type {
  AppLifecycleState,
  AppSession,
  EvoWindowInfo,
} from '@pyxis/app-sdk';

/**
 * What Bloom knows about one Evo toplevel, keyed by `window_id`.
 *
 * Evo is the only authority on whether a window is minimized, focused or
 * maximized, so the shell reads that here and nowhere else. AppHost's
 * `suspended` session state used to stand in for "minimized"; Nova no longer
 * SIGSTOPs a minimized app, so that state will not appear.
 */
export interface CompositorWindow {
  windowId: number;
  /** The Wayland app_id Evo sees. Not the Pyxis app id: join through the session. */
  waylandAppId: string;
  width: number;
  height: number;
  x: number;
  y: number;
  minimized: boolean;
  maximized: boolean;
  fullscreen: boolean;
  /** The app has stopped answering (Evo's title bar shows the spinner). */
  busy: boolean;
  /** What Evo's title bar says: the app's name, then the document's title. */
  titleLabel: string;
}

export interface WindowsState {
  byId: Record<number, CompositorWindow>;
  /** Keyboard-focused toplevel, or null. */
  focusedId: number | null;
  /** False until the first ListWindows answer lands. */
  ready: boolean;
}

export const EMPTY_WINDOWS: WindowsState = { byId: {}, focusedId: null, ready: false };

export type WindowsAction =
  /**
   * `keep`: windows a signal created around the time the list was asked for,
   * kept if the list doesn't have them; `drop`: windows a signal closed then,
   * dropped if it still does. Evo's list is a sample up to 250 ms old, so
   * without these a list could erase a window that had just opened (and no
   * later signal might name it again) or bring back one that had just closed.
   */
  | { type: 'list'; windows: EvoWindowInfo[]; keep?: readonly number[]; drop?: readonly number[] }
  | { type: 'created'; windowId: number; appId: string; width: number; height: number }
  | { type: 'closed'; windowId: number }
  | { type: 'focus'; windowId: number | null }
  | { type: 'minimized'; windowId: number; minimized: boolean }
  | { type: 'maximized'; windowId: number; maximized: boolean }
  | { type: 'fullscreen'; windowId: number; fullscreen: boolean }
  | { type: 'moved'; windowId: number; x: number; y: number };

function fromInfo(w: EvoWindowInfo): CompositorWindow {
  return {
    windowId: w.window_id,
    waylandAppId: w.app_id,
    width: w.width,
    height: w.height,
    x: w.x,
    y: w.y,
    // A build that doesn't send `minimized` is read through `visible`: Evo
    // unmaps a minimized window, so it lists as visible:false.
    minimized: w.minimized ?? w.visible === false,
    maximized: w.maximized ?? false,
    fullscreen: w.fullscreen ?? false,
    busy: w.busy ?? false,
    titleLabel: w.title_label ?? '',
  };
}

export function windowsReducer(state: WindowsState, action: WindowsAction): WindowsState {
  switch (action.type) {
    case 'list': {
      const byId: Record<number, CompositorWindow> = {};
      let focusedId: number | null = null;
      const drop = new Set(action.drop ?? []);
      for (const w of action.windows) {
        if (drop.has(w.window_id)) continue;
        byId[w.window_id] = fromInfo(w);
        if (w.focused) focusedId = w.window_id;
      }
      for (const id of action.keep ?? []) {
        if (!(id in byId) && !drop.has(id) && state.byId[id]) byId[id] = state.byId[id];
      }
      if (
        focusedId === null &&
        state.focusedId !== null &&
        (action.keep ?? []).includes(state.focusedId) &&
        byId[state.focusedId] &&
        !byId[state.focusedId].minimized
      ) {
        focusedId = state.focusedId;
      }
      return { byId, focusedId, ready: true };
    }
    case 'created': {
      // Keeps what a list already said about a window the signal races.
      const prev = state.byId[action.windowId];
      const base: CompositorWindow = prev ?? {
        windowId: action.windowId,
        waylandAppId: action.appId,
        width: action.width,
        height: action.height,
        x: 0,
        y: 0,
        minimized: false,
        maximized: false,
        fullscreen: false,
        busy: false,
        titleLabel: '',
      };
      return {
        ...state,
        byId: {
          ...state.byId,
          [action.windowId]: {
            ...base,
            waylandAppId: action.appId,
            width: action.width,
            height: action.height,
          },
        },
      };
    }
    case 'closed': {
      if (!(action.windowId in state.byId)) return state;
      const byId = { ...state.byId };
      delete byId[action.windowId];
      return {
        ...state,
        byId,
        focusedId: state.focusedId === action.windowId ? null : state.focusedId,
      };
    }
    case 'focus':
      return state.focusedId === action.windowId ? state : { ...state, focusedId: action.windowId };
    case 'minimized': {
      const w = state.byId[action.windowId];
      if (!w) return state;
      return {
        ...state,
        byId: { ...state.byId, [action.windowId]: { ...w, minimized: action.minimized } },
        // A minimized window cannot hold the keyboard.
        focusedId:
          action.minimized && state.focusedId === action.windowId ? null : state.focusedId,
      };
    }
    case 'maximized': {
      const w = state.byId[action.windowId];
      if (!w) return state;
      return {
        ...state,
        byId: { ...state.byId, [action.windowId]: { ...w, maximized: action.maximized } },
      };
    }
    case 'fullscreen': {
      const w = state.byId[action.windowId];
      if (!w) return state;
      return {
        ...state,
        byId: { ...state.byId, [action.windowId]: { ...w, fullscreen: action.fullscreen } },
      };
    }
    case 'moved': {
      const w = state.byId[action.windowId];
      if (!w) return state;
      return {
        ...state,
        byId: { ...state.byId, [action.windowId]: { ...w, x: action.x, y: action.y } },
      };
    }
  }
}

/** One app as the dock and overview draw it: its session joined to its windows. */
export interface AppWindowView {
  appId: string;
  sessionId: string;
  state: AppLifecycleState;
  /** Windows bound to the session through `session.surfaces`, in surface order. */
  windows: CompositorWindow[];
  /** The window a click acts on: the focused one, else a visible one, else any. */
  windowId: number | null;
  /** Holds the keyboard focus and is not minimized. */
  focused: boolean;
  /** Has windows and every one of them is minimized. */
  minimized: boolean;
  /** Launched but not yet mapped: there is nothing to focus or minimize. */
  starting: boolean;
  crashed: boolean;
}

const LIVE: ReadonlySet<AppLifecycleState> = new Set(['starting', 'running', 'suspended']);

/**
 * Join AppHost's sessions to Evo's windows. One view per app: a live session
 * wins over a dead one, newest first, as `sessionForApp` does. Stopped
 * sessions (kept 4 s by `useAppHostState` so the badge can be seen) are not
 * apps any more and are left out; crashed ones stay, so the dock can offer a
 * relaunch.
 */
export function deriveAppViews(
  sessions: Record<string, AppSession>,
  windows: WindowsState
): AppWindowView[] {
  const byApp = new Map<string, AppSession>();
  for (const s of Object.values(sessions)) {
    if (s.state === 'stopped') continue;
    const cur = byApp.get(s.appId);
    const better =
      !cur ||
      (LIVE.has(s.state) && !LIVE.has(cur.state)) ||
      (LIVE.has(s.state) === LIVE.has(cur.state) && s.startedAt > cur.startedAt);
    if (better) byApp.set(s.appId, s);
  }

  const views: AppWindowView[] = [];
  for (const s of byApp.values()) {
    const wins = (s.surfaces ?? [])
      .map((id) => windows.byId[id])
      .filter((w): w is CompositorWindow => w !== undefined);
    const minimized = wins.length > 0 && wins.every((w) => w.minimized);
    const focusedWin = wins.find((w) => w.windowId === windows.focusedId && !w.minimized);
    const primary = focusedWin ?? wins.find((w) => !w.minimized) ?? wins[0];
    views.push({
      appId: s.appId,
      sessionId: s.sessionId,
      state: s.state,
      windows: wins,
      windowId: primary?.windowId ?? null,
      focused: focusedWin !== undefined,
      minimized,
      starting: s.state === 'starting',
      crashed: s.state === 'crashed',
    });
  }
  // Launch order, so cards and dock icons don't shuffle as focus moves.
  const started = (v: AppWindowView) => sessions[v.sessionId]?.startedAt ?? 0;
  return views.sort((a, b) => started(a) - started(b) || a.appId.localeCompare(b.appId));
}

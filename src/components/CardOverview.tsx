import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useIsPresent, usePresence } from 'framer-motion';
import { X, Layers, Trash2, Grid3x3 } from 'lucide-react';
import { CORNER, waterdrop, type WindowThumbnail } from '@pyxis/app-sdk';
import { appHue, getAppAccent } from '../apps/registry';
import { useApps, type DesktopApp } from '../hooks/useApps';
import { useAppWindows } from '../hooks/useAppWindows';
import { AppIcon } from './AppIcon';
import type { DesktopWindowType } from '../types';
import { IN_COMPOSITOR } from '../utils/environment';
import { useMotion } from '../useMotion';
import { DURATION, EASE, STAGGER, TRANSITION } from '../motion';
import type { SwitcherState } from '../hooks/useSwitcher';
import {
  centredFrame,
  COMMIT_FADE_S,
  COMMIT_ZOOM_S,
  flies,
  flightTransform,
  previewBox,
  restRects,
  visibleFrame,
  type Flight,
  type Rect,
} from '../overview/flight';
import { refreshThumbnails, useThumbnails } from '../overview/thumbnailStore';
import './CardOverview.css';

/** What a card is doing while the switcher commits (see `useCardFlight`). */
type Role = 'idle' | 'chosen' | 'faded';

/** The size a minimized window is assumed to have if Evo never told us. */
const DEFAULT_WINDOW = { width: 900, height: 600 };

export interface CardOverviewProps {
  /**
   * Alt+Tab mode (see `useSwitcher`): Evo's order and selection decide the
   * cards' order and highlight, nothing here takes the keyboard (Alt is held
   * down in an app), and a card click leaves closing to Evo's `commit`, so
   * the card zooms toward its window instead of just vanishing. Implies
   * `staggerEntrance={false}`.
   */
  switcher?: SwitcherState;
  /**
   * Cards arrive one after another (default). A mode that opens with a card
   * already chosen, such as a switcher, passes false so all arrive together.
   */
  staggerEntrance?: boolean;
  isOpen: boolean;
  onClose: () => void;
  windows: DesktopWindowType[];
  activeWindowId?: string;
  onSelectWindow: (windowId: string) => void;
  onCloseWindow: (windowId: string) => void;
  /** Compositor mode: bring an app (or specific window) forward (relaunch if crashed). */
  onActivateApp?: (appId: string, windowId?: number) => void;
  /** Compositor mode: close an app (or specific window) gracefully. */
  onCloseApp?: (appId: string, windowId?: number) => void;
  onOpenAppDrawer?: () => void;
}

interface OverviewItem {
  id: string;
  key: string;
  appId: string;
  title: string;
  /** Compositor mode: 'starting' | 'running' | 'crashed' | … */
  state?: string;
  isMinimized?: boolean;
  isActive?: boolean;
  /** Compositor mode: Evo's ids for this app's windows (the switcher's keys). */
  windowIds: number[];
  /** The window the card pictures: the one a click would act on. */
  primaryId?: number;
  /** Where that window is on screen now; absent while minimized or unmapped. */
  frame?: Rect;
  /** Its size, whether or not it is on screen: the preview takes its aspect. */
  size?: { width: number; height: number };
  onSelect: () => void;
  onClose: () => void;
}

function statusOf(item: OverviewItem) {
  if (item.state === 'crashed') {
    return { kind: 'crashed', label: 'Crashed' };
  }
  if (item.state === 'starting') {
    return { kind: 'starting', label: 'Starting' };
  }
  if (item.isMinimized) {
    return { kind: 'minimized', label: 'Minimized' };
  }
  if (item.isActive) {
    return { kind: 'active', label: 'Active' };
  }
  return { kind: 'running', label: 'Running' };
}

// ---------------------------------------------------------------------------
// Flight: a card is its window, moving between the grid and the window's frame
// ---------------------------------------------------------------------------

const toRect = (r: DOMRect): Rect => ({ x: r.left, y: r.top, width: r.width, height: r.height });

/** The transform a card has right now (framer writes translate then scale). */
function currentFlight(el: HTMLElement): Flight {
  try {
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return { x: m.e, y: m.f, scale: m.a || 1 };
  } catch {
    return { x: 0, y: 0, scale: 1 };
  }
}

/** The card's box and its preview's, as they would sit with no transform on the card. */
function restBoxes(el: HTMLElement): { card: Rect; preview: Rect } | null {
  const preview = el.querySelector<HTMLElement>('[data-preview]');
  if (!preview) return null;
  return restRects(toRect(el.getBoundingClientRect()), toRect(preview.getBoundingClientRect()), currentFlight(el));
}

/**
 * The launch bar icon a minimized window goes to and comes from (on the
 * bottom bar or the left rail), else the bottom centre.
 */
function dockIconRect(appId: string): Rect {
  const id = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(appId) : appId;
  const icon = document.querySelector<HTMLElement>(`[data-shell-edge] [data-app="${id}"]`);
  const r = icon?.getBoundingClientRect();
  if (r && r.width > 0) return toRect(r);
  return { x: window.innerWidth / 2 - 24, y: window.innerHeight - 72, width: 48, height: 48 };
}

/**
 * Where a card flies to when it is chosen: its window's frame, or, for a
 * minimized window (which Evo will restore from the dock), where a window of
 * its size would sit centred.
 */
function commitTarget(item: OverviewItem): Rect {
  return (
    item.frame ??
    centredFrame(item.size ?? DEFAULT_WINDOW, { width: window.innerWidth, height: window.innerHeight })
  );
}

/**
 * The matched transitions of one card, on a wrapper around it (so they never
 * fight the card's own selection lift):
 *
 * - **Open**: the card starts laid exactly over its window (or over its dock
 *   icon, when minimized) and springs into the grid, its chrome fading in.
 * - **Chosen** (click, Enter, Alt released): it grows back onto the window's
 *   real frame, then fades to reveal the window Evo has raised.
 * - **Cancel**: it returns to its window and fades.
 * - The other cards fade when one is chosen.
 *
 * Only in `full` mode does anything fly; `reduced` and `off` just fade (the
 * transitions resolve through `tr`). A card with nowhere to fly from falls
 * back to a plain fade-in.
 */
function useCardFlight(
  wrapRef: React.RefObject<HTMLDivElement | null>,
  item: OverviewItem,
  role: Role,
  roleAtExit: () => Role,
  willFly: boolean
) {
  const { mode, tr } = useMotion();
  const live = useRef({ item, mode, tr, roleAtExit });
  useEffect(() => {
    live.current = { item, mode, tr, roleAtExit };
  });
  const [isPresent, safeToRemove] = usePresence();
  // A switcher commit already played; the exit has nothing left to do.
  const played = useRef<Role>('idle');

  const chromeOf = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('[data-chrome]')];

  const fadeOut = useCallback(async (el: HTMLElement) => {
    const { mode, tr } = live.current;
    await animate(
      el,
      flies(mode) ? { opacity: 0, scale: 0.96 } : { opacity: 0 },
      tr(TRANSITION.close)
    );
  }, []);

  /** Chosen: onto the window's frame, then away. */
  const zoomToWindow = useCallback(
    async (el: HTMLElement) => {
      const { mode, item } = live.current;
      const boxes = restBoxes(el);
      const t = boxes && flightTransform(boxes.card, boxes.preview, commitTarget(item));
      if (!flies(mode) || !t) {
        await animate(el, { opacity: 0 }, live.current.tr(TRANSITION.close));
        return;
      }
      void animate(chromeOf(el), { opacity: 0 }, { duration: 0.12, ease: 'linear' });
      await Promise.all([
        animate(el, { x: t.x, y: t.y, scale: t.scale }, TRANSITION.open),
        animate(el, { opacity: 0 }, { duration: COMMIT_FADE_S, delay: COMMIT_ZOOM_S - 0.04, ease: 'linear' }),
      ]);
    },
    []
  );

  /** Cancelled: back to the window (or its dock icon), and away. */
  const returnToWindow = useCallback(
    async (el: HTMLElement) => {
      const { mode, item } = live.current;
      const boxes = restBoxes(el);
      const t =
        boxes &&
        (item.frame
          ? flightTransform(boxes.card, boxes.preview, item.frame)
          : flightTransform(boxes.card, boxes.preview, dockIconRect(item.appId), 'contain'));
      if (!flies(mode) || !t) {
        await fadeOut(el);
        return;
      }
      void animate(chromeOf(el), { opacity: 0 }, { duration: 0.1, ease: 'linear' });
      await Promise.all([
        animate(el, { x: t.x, y: t.y, scale: t.scale }, TRANSITION.geometry),
        animate(el, { opacity: 0 }, { duration: 0.16, delay: 0.14, ease: 'linear' }),
      ]);
    },
    [fadeOut]
  );

  // Open.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const { mode, item, tr } = live.current;
    const boxes = willFly && flies(mode) ? restBoxes(el) : null;
    const target = item.frame
      ? { rect: item.frame, fit: 'width' as const }
      : { rect: dockIconRect(item.appId), fit: 'contain' as const };
    const t = boxes && flightTransform(boxes.card, boxes.preview, target.rect, target.fit);
    if (!willFly) return; // the card's own arrival (inner motion) does it
    if (!t) {
      void animate(el, { opacity: [0, 1] }, tr(TRANSITION.open));
      return;
    }
    el.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.scale})`;
    const chrome = chromeOf(el);
    chrome.forEach((c) => (c.style.opacity = '0'));
    const rise = animate(el, { x: [t.x, 0], y: [t.y, 0], scale: [t.scale, 1] }, TRANSITION.geometry);
    const fade = animate(chrome, { opacity: [0, 1] }, { duration: DURATION.open, delay: 0.06, ease: EASE.standard });
    return () => {
      rise.stop();
      fade.stop();
    };
    // Once, at mount: later layout changes are not a new arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The switcher commits (Alt released): this card zooms, the rest fade.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || role === 'idle') return;
    played.current = role;
    void (role === 'chosen' ? zoomToWindow(el) : fadeOut(el));
  }, [role, wrapRef, zoomToWindow, fadeOut]);

  // The overview is going away (click, Enter, Escape, the switcher's cancel).
  useEffect(() => {
    if (isPresent) return;
    const el = wrapRef.current;
    const done = () => safeToRemove?.();
    if (!el || played.current !== 'idle') {
      done();
      return;
    }
    const kind = live.current.roleAtExit();
    const motion = kind === 'chosen' ? zoomToWindow(el) : kind === 'faded' ? fadeOut(el) : returnToWindow(el);
    // Never leave the shell covered if an animation is cut short.
    const guard = window.setTimeout(done, 900);
    motion.catch(() => undefined).finally(() => {
      window.clearTimeout(guard);
      done();
    });
    return () => window.clearTimeout(guard);
  }, [isPresent, safeToRemove, wrapRef, zoomToWindow, fadeOut, returnToWindow]);
}

interface OverviewCardProps {
  item: OverviewItem;
  app?: DesktopApp;
  index: number;
  isSelected: boolean;
  switcherOpen: boolean;
  role: Role;
  roleAtExit: () => Role;
  thumb?: WindowThumbnail;
  arrived: boolean;
  staggerEntrance: boolean;
  nodeRef: (node: HTMLElement | null) => void;
  buttonRef: (node: HTMLButtonElement | null) => void;
  onFocusCard: () => void;
  onChoose: () => void;
}

/** The ring and strip colour of an app with no accent of its own. */
const NEUTRAL_ACCENT = 'var(--color-primary, #21808d)';

/** Height of a card's title strip, px. */
const STRIP_HEIGHT = 32;

/**
 * The preview's corners. Evo's picture is the window's frame, black outside
 * its waterdrop corners, shrunk to the preview; the top two corners are that
 * frame's own, shrunk the same way (a hair larger, so no black fringe is
 * left), which also makes them the frame's exact corners when the card lands
 * on the window. The bottom two are the card's.
 */
function previewCorners(box: { width: number }, size?: { width: number }): string {
  const s = size && size.width > box.width ? size.width / box.width : 1;
  const px = (r: number) => `${Math.round(((r + 1) / s) * 100) / 100}px`;
  return `${px(CORNER.tl)} ${px(CORNER.tr)} var(--px-corner-br) var(--px-corner-bl)`;
}

/** The app's waterdrop icon, small: its accent tile with the glyph on it. */
const AppDrop: React.FC<{
  appId: string;
  app?: React.ComponentProps<typeof AppIcon>['app'] & { accent?: string };
  size: number;
}> = ({ appId, app, size }) => {
  const accent = getAppAccent(appId, app?.accent);
  return (
    <span
      style={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: waterdrop(size),
        background: accent.bg,
        color: accent.iconColor,
        display: 'grid',
        placeItems: 'center',
        boxShadow: `0 1px 3px ${accent.shadow}`,
      }}
    >
      <AppIcon app={app} size={Math.round(size * 0.6)} />
    </span>
  );
};

/** One window's card: chrome around a preview that is the window itself. */
const OverviewCard: React.FC<OverviewCardProps> = ({
  item,
  app,
  index,
  isSelected,
  switcherOpen,
  role,
  roleAtExit,
  thumb,
  arrived,
  staggerEntrance,
  nodeRef,
  buttonRef,
  onFocusCard,
  onChoose,
}) => {
  const { tr, to, mode } = useMotion();
  const accent = getAppAccent(item.appId, app?.accent);
  const hue = appHue(item.appId, app?.accent) ?? NEUTRAL_ACCENT;
  const status = statusOf(item);
  const wrapRef = useRef<HTMLDivElement>(null);
  const willFly = flies(mode) && (item.frame !== undefined || item.isMinimized === true);
  useCardFlight(wrapRef, item, role, roleAtExit, willFly);
  const box = previewBox(item.size);
  // Layout animation (a neighbour closing) measures the card in the viewport,
  // so it would take the wrapper's flight for a layout change and fight it.
  // It starts once the card has landed.
  const [landed, setLanded] = useState(!willFly);
  useEffect(() => {
    if (landed) return;
    const timer = window.setTimeout(() => setLanded(true), DURATION.geometry * 1000);
    return () => window.clearTimeout(timer);
  }, [landed]);
  const [loaded, setLoaded] = useState<string | null>(null);
  const showImage = thumb && loaded === thumb.data;
  const quiet = status.label === 'Running' || status.label === 'Active';

  return (
    <div
      ref={wrapRef}
      data-flight={willFly ? 'true' : undefined}
      // The focused window is in front of the others where they overlap, so
      // its card is too while the cards are still over their windows.
      style={{ flex: '0 0 auto', position: 'relative', zIndex: item.isActive ? 1 : 0 }}
    >
      <motion.div
        key={item.key}
        data-app={item.appId}
        data-window-id={item.primaryId}
        data-active={item.isActive ? 'true' : 'false'}
        data-minimized={item.isMinimized ? 'true' : 'false'}
        data-state={item.state}
        data-selected={isSelected ? 'true' : 'false'}
        data-committed={role === 'chosen' ? 'true' : undefined}
        data-thumb={thumb ? (showImage ? 'shown' : 'loading') : 'none'}
        ref={nodeRef}
        layout={landed}
        initial={willFly ? false : to({ opacity: 0, y: 24, scale: 0.94 })}
        animate={{
          ...to({ opacity: 1, y: isSelected ? -8 : 0, scale: isSelected ? 1.02 : 1 }),
          // Cards arrive one after another; a selection or hover change
          // afterwards answers at once.
          transition: tr({
            ...TRANSITION.open,
            delay: arrived || !staggerEntrance || willFly ? 0 : Math.min(index, 8) * STAGGER,
          }),
        }}
        transition={{ layout: tr(TRANSITION.geometry) }}
        whileHover={to({ y: -10, scale: 1.03 })}
        onClick={(e) => {
          e.stopPropagation();
          onChoose();
        }}
        style={{
          width: box.width,
          borderRadius: 'var(--px-corner)',
          display: 'flex',
          flexDirection: 'column',
          cursor: 'pointer',
          position: 'relative',
        }}
      >
        {/* The plate behind the card, in the waterdrop corner: the material,
            the shadow and, when chosen, the ring in the app's accent. */}
        <div
          data-chrome
          data-card-plate
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            borderRadius: 'var(--px-corner)',
            background: 'var(--px-material-strong)',
            boxShadow: isSelected ? '0 30px 60px rgba(0, 0, 0, 0.45)' : '0 18px 40px rgba(0, 0, 0, 0.35)',
            outline: `3px solid ${isSelected ? hue : 'transparent'}`,
            outlineOffset: 4,
            transition: 'box-shadow 0.18s ease, outline-color 0.18s ease',
          }}
        />

        {/* Genuine keyboard-focusable trigger covering the card, kept as a
            sibling of the close button so buttons are never nested. */}
        <button
          type="button"
          className="px-card-button"
          ref={buttonRef}
          tabIndex={switcherOpen ? -1 : 0}
          aria-label={`Switch to ${item.title}${status.kind !== 'running' ? ` (${status.label})` : ''}`}
          aria-current={isSelected ? 'true' : undefined}
          onFocus={onFocusCard}
          onClick={(e) => {
            e.stopPropagation();
            onChoose();
          }}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            border: 'none',
            background: 'transparent',
            padding: 0,
            margin: 0,
            borderRadius: 'var(--px-corner)',
            cursor: 'pointer',
          }}
        />

        {/* Title strip: the app's accent over the material, its icon and name */}
        <div
          data-chrome
          data-card-strip
          style={{
            position: 'relative',
            zIndex: 2,
            pointerEvents: 'none',
            height: STRIP_HEIGHT,
            padding: '0 4px 0 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: 'var(--px-corner-tl) var(--px-corner-tr) 0 0',
            background: `color-mix(in srgb, ${hue} 20%, transparent)`,
            borderBottom: `1px solid color-mix(in srgb, ${hue} 30%, transparent)`,
            color: 'var(--px-material-ink)',
          }}
        >
          <AppDrop appId={item.appId} app={app} size={20} />
          <span
            className="px-ui"
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 13,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {item.title}
          </span>

          {/* Fling / Close Button */}
          <button
            type="button"
            className="px-card-close"
            tabIndex={switcherOpen ? -1 : 0}
            aria-label={`Close ${item.title}`}
            onClick={(e) => {
              e.stopPropagation();
              item.onClose();
            }}
            title="Close card"
            style={{
              border: 'none',
              cursor: 'pointer',
              width: 24,
              height: 24,
              padding: 0,
              borderRadius: waterdrop(24),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'auto',
            }}
          >
            <X size={14} />
          </button>
        </div>

        {/* The preview: Evo's picture of the window, over the app's icon
            card, which shows until (and unless) the picture arrives. */}
        <div
          data-preview
          style={{
            position: 'relative',
            pointerEvents: 'none',
            width: box.width,
            height: box.height,
            borderRadius: previewCorners(box, item.size),
            overflow: 'hidden',
            background: `radial-gradient(circle at 50% 40%, color-mix(in srgb, ${hue} 22%, transparent), color-mix(in srgb, ${hue} 6%, transparent) 80%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: waterdrop(68),
              background: accent.bg,
              border: `2px solid ${accent.border}`,
              boxShadow: `0 8px 24px ${accent.shadow}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: accent.iconColor,
            }}
          >
            {app && <AppIcon app={app} size={34} />}
          </div>
          {thumb && (
            <img
              src={thumb.data}
              alt=""
              draggable={false}
              onLoad={() => setLoaded(thumb.data)}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'top left',
                opacity: showImage ? 1 : 0,
                transition: mode === 'off' ? undefined : 'opacity 0.18s ease',
              }}
            />
          )}
          {!quiet && (
            <div
              className="px-ui px-card-status"
              data-status={status.kind}
              style={{
                position: 'absolute',
                left: 8,
                bottom: 8,
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '3px 8px',
                borderRadius: 'var(--px-corner-20)',
              }}
            >
              {status.label}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ),
  ].filter((el) => el.tabIndex >= 0);
}

const CardOverviewOverlay: React.FC<
  CardOverviewProps & { switcherOpen: boolean; committing: boolean }
> = ({
  onClose,
  windows,
  activeWindowId,
  onSelectWindow,
  onCloseWindow,
  onActivateApp,
  onCloseApp,
  onOpenAppDrawer,
  staggerEntrance: staggerProp = true,
  switcher,
  switcherOpen,
  committing,
}) => {
  const isPresent = useIsPresent();
  const staggerEntrance = staggerProp && !switcher;
  const { tr } = useMotion();
  // True once the entrance stagger has played, so later changes (selection,
  // a card closing) are not delayed by a card's place in the row.
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    if (!isPresent) return;
    const timer = window.setTimeout(() => setArrived(true), (DURATION.open + 8 * STAGGER) * 1000);
    return () => {
      window.clearTimeout(timer);
      setArrived(false);
    };
  }, [isPresent]);
  const { byId: appsById } = useApps();
  const { views } = useAppWindows();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const switcherOrder = switcher?.order;

  // Compile open items across dev windows and compositor sessions
  const built = useMemo<OverviewItem[]>(() => {
    if (!IN_COMPOSITOR) {
      // In dev mode: driven by window list
      return windows.map((w) => {
        const app = appsById(w.appId);
        return {
          id: w.id,
          key: `window-${w.id}`,
          appId: w.appId,
          title: w.title || app?.name || w.appId,
          isMinimized: w.state === 'minimized',
          isActive: w.id === activeWindowId,
          windowIds: [],
          frame:
            w.state === 'minimized'
              ? undefined
              : visibleFrame({ x: w.position.x, y: w.position.y, width: w.size.width, height: w.size.height }),
          size: { width: w.size.width, height: w.size.height },
          onSelect: () => {
            onSelectWindow(w.id);
            onClose();
          },
          onClose: () => onCloseWindow(w.id),
        };
      });
    }

    // In compositor mode: one card per live window (or one card for a
    // starting/crashed session with no mapped window yet), so multi-window
    // apps and Alt+Tab / Alt+Grave per-window selection match the exact window.
    return views.flatMap<OverviewItem>((v) => {
      const app = appsById(v.appId);
      if (v.windows.length === 0) {
        return [
          {
            id: v.sessionId,
            key: `session-${v.sessionId}`,
            appId: v.appId,
            title: app?.name || v.appId,
            state: v.state,
            isMinimized: v.minimized,
            isActive: v.focused,
            windowIds: [],
            primaryId: undefined,
            frame: undefined,
            size: undefined,
            onSelect: () => {
              onActivateApp?.(v.appId);
              // In the switcher, Evo's `commit` (a reply to the focus) closes it.
              if (!switcherOpen) onClose();
            },
            onClose: () => {
              onCloseApp?.(v.appId);
            },
          },
        ];
      }

      return v.windows.map((w) => {
        const isMinimized = w.minimized ?? v.minimized;
        const isActive =
          v.focused &&
          (v.windowId === null || w.windowId === v.windowId) &&
          !isMinimized;
        return {
          id: `${v.sessionId}-${w.windowId}`,
          key: `window-${v.sessionId}-${w.windowId}`,
          appId: v.appId,
          title: w.titleLabel || app?.name || v.appId,
          state: v.state,
          isMinimized,
          isActive,
          windowIds: [w.windowId],
          primaryId: w.windowId,
          frame: isMinimized ? undefined : visibleFrame(w),
          size: w.width && w.height ? { width: w.width, height: w.height } : undefined,
          onSelect: () => {
            onActivateApp?.(v.appId, w.windowId);
            // In the switcher, Evo's `commit` (a reply to the focus) closes it.
            if (!switcherOpen) onClose();
          },
          onClose: () => {
            onCloseApp?.(v.appId, w.windowId);
          },
        };
      });
    });
  }, [windows, activeWindowId, views, appsById, onSelectWindow, onCloseWindow, onActivateApp, onCloseApp, onClose, switcherOpen]);

  // The switcher shows Evo's order (most recently used first); a card with no
  // window of its own in it (an app still starting) goes last.
  const items = useMemo(() => {
    if (!switcherOrder) return built;
    const rank = (item: OverviewItem) => {
      const ranks = item.windowIds.map((id) => switcherOrder.indexOf(id)).filter((r) => r >= 0);
      return ranks.length ? Math.min(...ranks) : Number.MAX_SAFE_INTEGER;
    };
    return [...built].sort((a, b) => rank(a) - rank(b));
  }, [built, switcherOrder]);

  // Keep selected index in bounds. In the switcher Evo picks the card.
  const switcherIndex = switcher ? items.findIndex((item) => item.windowIds.includes(switcher.selected)) : -1;
  const safeIndex =
    switcher && switcherIndex >= 0
      ? switcherIndex
      : items.length === 0
        ? 0
        : Math.min(selectedIndex, items.length - 1);

  // The card a click or Enter picked, so that as the overview closes it zooms
  // onto its window and the rest fade; null means the overview was dismissed
  // and every card returns to its window. (The switcher's choice is
  // `switcher.committed`, which plays while the overview is still up.)
  const chosenKey = useRef<string | null>(null);
  useEffect(() => {
    if (isPresent) chosenKey.current = null;
  }, [isPresent]);
  const choose = useCallback((item: OverviewItem) => {
    chosenKey.current = item.key;
    item.onSelect();
  }, []);

  // Pictures of the windows, from Evo. The overview opens with whatever the
  // shell already has (kept warm by `useThumbnailPrefetch`) and refreshes in
  // the background; a card with no picture yet shows its icon.
  const thumbnails = useThumbnails();
  const liveWindowIds = useMemo(() => items.flatMap((item) => item.windowIds), [items]);
  const liveKey = liveWindowIds.join(',');
  useEffect(() => {
    if (isPresent && liveKey) void refreshThumbnails(liveKey.split(',').map(Number));
  }, [isPresent, liveKey]);

  const overlayRef = useRef<HTMLDivElement>(null);
  const closeOverviewButtonRef = useRef<HTMLButtonElement>(null);
  const emptyDrawerButtonRef = useRef<HTMLButtonElement>(null);
  const cardNodes = useRef(new Map<string, HTMLElement>());
  const cardButtonNodes = useRef(new Map<string, HTMLButtonElement>());

  // Keep the highlighted card in view in both Overview and Switcher modes.
  const selectedKey = items[safeIndex]?.key;
  useEffect(() => {
    if (!isPresent || !selectedKey) return;
    cardNodes.current.get(selectedKey)?.scrollIntoView?.({
      inline: switcherOpen ? 'center' : 'nearest',
      block: 'nearest',
    });
  }, [isPresent, selectedKey, switcherOpen]);

  // Capture focus before Overview moves it, and restore on close.
  useEffect(() => {
    if (!isPresent || switcherOpen) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (previous && previous.isConnected) previous.focus?.();
    };
  }, [isPresent, switcherOpen]);

  // Initial focus and re-focus if the focused card is closed while open.
  useEffect(() => {
    if (!isPresent || switcherOpen) return;
    const root = overlayRef.current;
    if (!root) return;
    const active = document.activeElement;
    if (active && root.contains(active)) return;
    const key = items[safeIndex]?.key;
    const target =
      (key ? cardButtonNodes.current.get(key) : undefined) ??
      emptyDrawerButtonRef.current ??
      closeOverviewButtonRef.current ??
      root;
    target?.focus?.({ preventScroll: true });
  }, [isPresent, switcherOpen, items, safeIndex]);

  // Keyboard navigation across cards and Tab focus trap. Not in the switcher:
  // it is a view of what Evo is doing and never holds the keyboard.
  useEffect(() => {
    if (!isPresent || switcherOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const root = overlayRef.current;
        if (!root) return;
        const focusables = getFocusableElements(root);
        if (focusables.length === 0) {
          e.preventDefault();
          root.focus();
          return;
        }
        const at = focusables.indexOf(document.activeElement as HTMLElement);
        const next = e.shiftKey
          ? at <= 0
            ? focusables.length - 1
            : at - 1
          : at === focusables.length - 1
            ? 0
            : at + 1;
        e.preventDefault();
        e.stopPropagation();
        focusables[next].focus();
        return;
      }

      if (items.length === 0) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const next = (safeIndex + 1) % items.length;
        setSelectedIndex(next);
        const nextItem = items[next];
        if (nextItem) cardButtonNodes.current.get(nextItem.key)?.focus?.();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = safeIndex - 1 < 0 ? items.length - 1 : safeIndex - 1;
        setSelectedIndex(next);
        const nextItem = items[next];
        if (nextItem) cardButtonNodes.current.get(nextItem.key)?.focus?.();
      } else if (e.key === 'Enter') {
        const targetEl = e.target;
        // Never hijack Enter when a focused button/control is active (Close All,
        // Exit Overview, card close X, card button, Open App Drawer).
        if (
          targetEl instanceof HTMLElement &&
          targetEl.closest('button, a, input, select, textarea, [role="button"]')
        ) {
          return;
        }
        e.preventDefault();
        const target = items[safeIndex];
        if (target) choose(target);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const targetEl = e.target;
        if (
          targetEl instanceof HTMLElement &&
          (targetEl.closest('input, textarea, select') ||
            targetEl.closest('.px-overview-action'))
        ) {
          return;
        }
        e.preventDefault();
        const target = items[safeIndex];
        target?.onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPresent, switcherOpen, items, safeIndex, onClose, choose]);

  const handleCloseAll = () => {
    items.forEach((item) => item.onClose());
  };

  return (
    <motion.div
      ref={overlayRef}
      tabIndex={-1}
      role={switcherOpen ? undefined : 'dialog'}
      aria-modal={switcherOpen ? undefined : true}
      aria-label={switcherOpen ? undefined : 'Cards overview'}
      data-switcher={switcherOpen ? (committing ? 'committing' : 'open') : undefined}
      onClick={onClose}
      style={{
        pointerEvents: committing || !isPresent ? 'none' : undefined,
        position: 'fixed',
        inset: 0,
        zIndex: 1280,
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        outline: 'none',
        ...({ '--mochi-text': '#ffffff' } as React.CSSProperties),
      }}
    >
      {/* The scrim fades on its own, so the cards can stay opaque while
          they fly to their windows and the overview is still dimming. */}
      <motion.div
        data-overview-scrim
        initial={{ opacity: 0 }}
        animate={
          committing
            ? { opacity: 0, transition: tr(TRANSITION.close) }
            : { opacity: 1, transition: tr(TRANSITION.open) }
        }
        exit={{ opacity: 0, transition: tr(TRANSITION.close) }}
        style={{
          position: 'absolute',
          inset: 0,
          // No blur: the overlay is its own surface, there is nothing
          // behind it to blur.
          background: 'rgba(8, 10, 24, 0.58)',
        }}
      />

      {/* The heading, in display type over the scrim, and the two actions */}
      <motion.div
        data-overview-header
        initial={{ opacity: 0 }}
        animate={
          committing
            ? { opacity: 0, transition: tr(TRANSITION.close) }
            : { opacity: 1, transition: tr(TRANSITION.open) }
        }
        exit={{ opacity: 0, transition: tr(TRANSITION.close) }}
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          padding: '64px 24px 0',
        }}
      >
        <span />
        <h2
          data-overview-heading
          className="px-display"
          style={{
            margin: 0,
            fontSize: 26,
            letterSpacing: '0.3em',
            // Tracking trails the last letter: pull it back so the word is centred.
            marginRight: '-0.3em',
            color: '#ffffff',
            textShadow: '0 1px 12px rgba(0, 0, 0, 0.35)',
          }}
        >
          Cards
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifySelf: 'end' }}>
          {items.length > 1 && (
            <button
              type="button"
              className="px-ui px-overview-action"
              onClick={(e) => {
                e.stopPropagation();
                handleCloseAll();
              }}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.16)',
                borderRadius: waterdrop(32),
                height: 32,
                padding: '0 12px',
                color: 'rgba(255, 255, 255, 0.88)',
                fontSize: 12.5,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.14s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255, 74, 74, 0.22)';
                (e.currentTarget as HTMLElement).style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = 'rgba(255, 255, 255, 0.1)';
                (e.currentTarget as HTMLElement).style.color = 'rgba(255, 255, 255, 0.88)';
              }}
            >
              <Trash2 size={13} />
              <span>Close All</span>
            </button>
          )}

          <button
            ref={closeOverviewButtonRef}
            type="button"
            className="px-overview-action"
            aria-label="Exit overview"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            title="Exit Overview (Esc)"
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              borderRadius: waterdrop(32),
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              cursor: 'pointer',
              transition: 'background 0.14s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255, 255, 255, 0.2)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(255, 255, 255, 0.1)';
            }}
          >
            <X size={16} />
          </button>
        </div>
      </motion.div>

      {/* Cards Carousel Area — margin-inline: auto on the inner track centres
          when cards fit and keeps leftmost cards scrollable when they overflow. */}
      <div
        data-overview-carousel
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          padding: '30px 40px',
          overflowX: 'auto',
          overflowY: 'hidden',
        }}
      >
        {items.length === 0 ? (
          /* Empty State */
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
              marginInline: 'auto',
              color: 'rgba(255, 255, 255, 0.75)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: waterdrop(64),
                background: 'rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255, 255, 255, 0.45)',
              }}
            >
              <Layers size={32} />
            </div>
            <div className="px-ui">
              <div style={{ fontSize: '1.1rem', color: '#ffffff' }}>No Active Cards</div>
              <div style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.6)', marginTop: 4 }}>
                Running applications will appear as cards here.
              </div>
            </div>

            {onOpenAppDrawer && (
              <button
                ref={emptyDrawerButtonRef}
                type="button"
                className="px-ui px-overview-action"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                  onOpenAppDrawer();
                }}
                style={{
                  marginTop: 8,
                  background: 'var(--color-primary, #21808d)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: waterdrop(40),
                  padding: '10px 18px',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)',
                }}
              >
                <Grid3x3 size={15} />
                <span>Open App Drawer</span>
              </button>
            )}
          </motion.div>
        ) : (
          /* Interactive Cards Flow */
          <div
            data-overview-track
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '24px',
              padding: '20px 10px',
              marginInline: 'auto',
              flexShrink: 0,
            }}
          >
            {items.map((item, index) => {
              const isSelected = index === safeIndex;
              // Alt released: the selected card grows onto its window
              // while the rest fade (the scrim fades on its own).
              const role: Role = committing ? (isSelected ? 'chosen' : 'faded') : 'idle';
              return (
                <OverviewCard
                  key={item.key}
                  item={item}
                  app={appsById(item.appId)}
                  index={index}
                  isSelected={isSelected}
                  switcherOpen={switcherOpen}
                  role={role}
                  roleAtExit={() =>
                    chosenKey.current === null ? 'idle' : chosenKey.current === item.key ? 'chosen' : 'faded'
                  }
                  thumb={item.primaryId !== undefined ? thumbnails.get(item.primaryId) : undefined}
                  arrived={arrived}
                  staggerEntrance={staggerEntrance}
                  nodeRef={(node) => {
                    if (node) cardNodes.current.set(item.key, node);
                    else cardNodes.current.delete(item.key);
                  }}
                  buttonRef={(node) => {
                    if (node) cardButtonNodes.current.set(item.key, node);
                    else cardButtonNodes.current.delete(item.key);
                  }}
                  onFocusCard={() => setSelectedIndex(index)}
                  onChoose={() => choose(item)}
                />
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
};

/**
 * CardOverview — Iconic Palm webOS Card Deck & Overview Mode.
 *
 * Implements Palm webOS's hallmark multitasking paradigm:
 * - Zoomed out carousel / deck of all active application cards
 * - Tactile lift-on-hover physics with elevation shadows
 * - One-tap fling/dismiss to close sessions
 * - Smooth keyboard navigation (Arrow keys, Tab, Enter, Esc, Delete)
 */
export const CardOverview: React.FC<CardOverviewProps> = (props) => {
  const switcherOpen = props.switcher !== undefined;
  const committing = props.switcher?.committed != null;
  return (
    <AnimatePresence>
      {props.isOpen && (
        <CardOverviewOverlay
          key="card-overview"
          {...props}
          switcherOpen={switcherOpen}
          committing={committing}
        />
      )}
    </AnimatePresence>
  );
};

export default CardOverview;

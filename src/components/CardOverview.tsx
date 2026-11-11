import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, usePresence } from 'framer-motion';
import { Header } from 'remochi';
import { X, Layers, Trash2, Grid3x3 } from 'lucide-react';
import { usePyxisTheme, type WindowThumbnail } from '@pyxis/app-sdk';
import { getAppAccent } from '../apps/registry';
import { useApps } from '../hooks/useApps';
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
  /** Compositor mode: bring an app's window forward (relaunch if crashed). */
  onActivateApp?: (appId: string) => void;
  /** Compositor mode: close an app's window gracefully. */
  onCloseApp?: (appId: string) => void;
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
    return { label: 'Crashed', bg: 'rgba(244, 67, 54, 0.15)', color: '#F44336' };
  }
  if (item.state === 'starting') {
    return { label: 'Starting', bg: 'rgba(255, 183, 77, 0.18)', color: '#E69100' };
  }
  if (item.isMinimized) {
    return {
      label: 'Minimized',
      bg: 'rgba(156, 163, 175, 0.15)',
      color: 'var(--color-text-secondary)',
    };
  }
  if (item.isActive) {
    return {
      label: 'Active',
      bg: 'var(--mochi-primary-soft, rgba(59, 130, 246, 0.15))',
      color: 'var(--color-primary, #3b82f6)',
    };
  }
  return { label: 'Running', bg: 'rgba(76, 175, 80, 0.15)', color: 'var(--color-success, #4caf50)' };
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

/** The dock icon a minimized window goes to and comes from, else the bottom centre. */
function dockIconRect(appId: string): Rect {
  const id = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(appId) : appId;
  const icon = document.querySelector<HTMLElement>(`[data-shell-edge="bottom"] [data-app="${id}"]`);
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
  index: number;
  isSelected: boolean;
  role: Role;
  roleAtExit: () => Role;
  thumb?: WindowThumbnail;
  arrived: boolean;
  staggerEntrance: boolean;
  dark: boolean;
  nodeRef: (node: HTMLElement | null) => void;
  onChoose: () => void;
}

/** One window's card: chrome around a preview that is the window itself. */
const OverviewCard: React.FC<OverviewCardProps> = ({
  item,
  index,
  isSelected,
  role,
  roleAtExit,
  thumb,
  arrived,
  staggerEntrance,
  dark,
  nodeRef,
  onChoose,
}) => {
  const { appsById } = useAppsById();
  const { tr, to, mode } = useMotion();
  const app = appsById(item.appId);
  const accent = getAppAccent(item.appId);
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
    const timer = window.setTimeout(() => setLanded(true), (DURATION.open + 0.5) * 1000);
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
        onClick={onChoose}
        style={{
          width: box.width + 16,
          borderRadius: 20,
          display: 'flex',
          flexDirection: 'column',
          cursor: 'pointer',
          position: 'relative',
        }}
      >
        {/* The glass plate behind the card: everything but the preview */}
        <div
          data-chrome
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 20,
            background: dark ? 'rgba(28, 32, 42, 0.85)' : 'rgba(255, 255, 255, 0.85)',
            border: isSelected ? '2px solid var(--color-primary, #3b82f6)' : '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: isSelected
              ? '0 24px 48px rgba(0, 0, 0, 0.4), 0 0 20px rgba(59, 130, 246, 0.35)'
              : '0 16px 36px rgba(0, 0, 0, 0.3)',
            transition: 'box-shadow 0.18s ease, border-color 0.18s ease',
          }}
        />

        {/* Card Chrome Bar */}
        <div
          data-chrome
          style={{
            position: 'relative',
            padding: '9px 12px 7px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {app && <AppIcon app={app} size={18} />}
            <span
              style={{
                fontSize: '0.82rem',
                fontWeight: 700,
                color: 'var(--color-text)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {item.title}
            </span>
          </div>

          {/* Fling / Close Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              item.onClose();
            }}
            title="Close card"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-secondary)',
              transition: 'background 0.12s ease, color 0.12s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(239, 68, 68, 0.15)';
              (e.currentTarget as HTMLElement).style.color = '#ef4444';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = 'transparent';
              (e.currentTarget as HTMLElement).style.color = 'var(--color-text-secondary)';
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
            margin: '0 8px 8px',
            width: box.width,
            height: box.height,
            borderRadius: 10,
            overflow: 'hidden',
            background: `radial-gradient(circle at 50% 40%, ${accent.bg}, rgba(20, 24, 34, 0.35) 80%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: '32px 6px 32px 32px',
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
              style={{
                position: 'absolute',
                left: 8,
                bottom: 8,
                fontSize: '0.68rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                padding: '3px 8px',
                borderRadius: 10,
                background: status.bg,
                color: status.color,
                backdropFilter: 'blur(8px)',
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

/** `useApps` as the card wants it, in one place so the card stays a plain component. */
function useAppsById() {
  const { byId } = useApps();
  return { appsById: byId };
}


/**
 * CardOverview — Iconic Palm webOS Card Deck & Overview Mode.
 *
 * Implements Palm webOS's hallmark multitasking paradigm:
 * - Zoomed out carousel / deck of all active application cards
 * - Tactile lift-on-hover physics with elevation shadows
 * - One-tap fling/dismiss to close sessions
 * - Smooth keyboard navigation (Arrow keys, Enter, Esc, Delete)
 */
export const CardOverview: React.FC<CardOverviewProps> = ({
  isOpen,
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
}) => {
  const staggerEntrance = staggerProp && !switcher;
  const { tr } = useMotion();
  // True once the entrance stagger has played, so later changes (selection,
  // a card closing) are not delayed by a card's place in the row.
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => setArrived(true), (DURATION.open + 8 * STAGGER) * 1000);
    return () => {
      window.clearTimeout(timer);
      setArrived(false);
    };
  }, [isOpen]);
  const theme = usePyxisTheme('light');
  const { byId: appsById } = useApps();
  const { views } = useAppWindows();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const switcherOpen = switcher !== undefined;
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

    // In compositor mode: every live app, from AppHost sessions joined to
    // Evo's windows. A minimized app is still running and stays here (it is
    // the only way back to it besides the dock); the focused one is marked.
    return views.map((v) => {
      const app = appsById(v.appId);
      const primary = v.windows.find((w) => w.windowId === v.windowId) ?? v.windows[0];
      return {
        id: v.sessionId,
        key: `session-${v.sessionId}`,
        appId: v.appId,
        title: app?.name || v.appId,
        state: v.state,
        isMinimized: v.minimized,
        isActive: v.focused,
        windowIds: v.windows.map((w) => w.windowId),
        primaryId: primary?.windowId,
        frame: visibleFrame(primary),
        size: primary?.width && primary.height ? { width: primary.width, height: primary.height } : undefined,
        onSelect: () => {
          onActivateApp?.(v.appId);
          // In the switcher, Evo's `commit` (a reply to the focus) closes it.
          if (!switcherOpen) onClose();
        },
        onClose: () => {
          onCloseApp?.(v.appId);
        },
      };
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
  const committing = switcher?.committed != null;

  // The card a click or Enter picked, so that as the overview closes it zooms
  // onto its window and the rest fade; null means the overview was dismissed
  // and every card returns to its window. (The switcher's choice is
  // `switcher.committed`, which plays while the overview is still up.)
  const chosenKey = useRef<string | null>(null);
  useEffect(() => {
    if (isOpen) chosenKey.current = null;
  }, [isOpen]);
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
    if (isOpen && liveKey) void refreshThumbnails(liveKey.split(',').map(Number));
  }, [isOpen, liveKey]);

  // Keep the highlighted card in view when there are more than fit.
  const cardNodes = useRef(new Map<string, HTMLElement>());
  const selectedKey = switcher ? items[safeIndex]?.key : undefined;
  useEffect(() => {
    if (selectedKey) cardNodes.current.get(selectedKey)?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [selectedKey]);

  // Keyboard navigation across cards. Not in the switcher: it is a view of
  // what Evo is doing and never holds the keyboard.
  useEffect(() => {
    if (!isOpen || switcherOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (items.length === 0) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % items.length);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 < 0 ? items.length - 1 : prev - 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = items[safeIndex];
        if (target) choose(target);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const target = items[safeIndex];
        target?.onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, switcherOpen, items, safeIndex, onClose, choose]);

  const handleCloseAll = () => {
    items.forEach((item) => item.onClose());
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          data-switcher={switcherOpen ? (committing ? 'committing' : 'open') : undefined}
          style={{
            pointerEvents: committing ? 'none' : undefined,
            position: 'fixed',
            inset: 0,
            zIndex: 1280,
            color: '#ffffff',
            display: 'flex',
            flexDirection: 'column',
            userSelect: 'none',
            ...({ '--mochi-text': '#ffffff' } as React.CSSProperties),
          }}
        >
          {/* The scrim fades on its own, so the cards can stay opaque while
              they fly to their windows and the overview is still dimming. */}
          <motion.div
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
              background: 'rgba(10, 15, 25, 0.72)',
              backdropFilter: 'blur(20px)',
            }}
          />

          {/* Remochi Header in Overview */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={
              committing
                ? { opacity: 0, transition: tr(TRANSITION.close) }
                : { opacity: 1, transition: tr(TRANSITION.open) }
            }
            exit={{ opacity: 0, transition: tr(TRANSITION.close) }}
            style={{
              position: 'relative',
              padding: '6px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(0, 0, 0, 0.18)',
            }}
          >
            <Header content="Overview">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={handleCloseAll}
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: 10,
                      padding: '6px 12px',
                      color: 'rgba(255, 255, 255, 0.85)',
                      fontSize: '0.76rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.14s ease',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(239, 68, 68, 0.2)';
                      (e.currentTarget as HTMLElement).style.color = '#ef4444';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(255, 255, 255, 0.08)';
                      (e.currentTarget as HTMLElement).style.color = 'rgba(255, 255, 255, 0.85)';
                    }}
                  >
                    <Trash2 size={13} />
                    <span>Close All</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  title="Exit Overview (Esc)"
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '50%',
                    width: 34,
                    height: 34,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    cursor: 'pointer',
                    transition: 'background 0.14s ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255, 255, 255, 0.18)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255, 255, 255, 0.08)';
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </Header>
          </motion.div>

          {/* Cards Carousel Area */}
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
            style={{
              position: 'relative',
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
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
                  color: 'rgba(255, 255, 255, 0.75)',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '26px 5px 26px 26px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'rgba(255, 255, 255, 0.45)',
                  }}
                >
                  <Layers size={32} />
                </div>
                <div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 600, color: '#ffffff' }}>
                    No Active Cards
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.5)', marginTop: 4 }}>
                    Running applications will appear as cards here.
                  </div>
                </div>

                {onOpenAppDrawer && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAppDrawer();
                    }}
                    style={{
                      marginTop: 8,
                      background: 'var(--color-primary, #3b82f6)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: 12,
                      padding: '10px 18px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
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
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '24px',
                  padding: '20px 10px',
                  maxWidth: '100%',
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
                      index={index}
                      isSelected={isSelected}
                      role={role}
                      roleAtExit={() =>
                        chosenKey.current === null ? 'idle' : chosenKey.current === item.key ? 'chosen' : 'faded'
                      }
                      thumb={item.primaryId !== undefined ? thumbnails.get(item.primaryId) : undefined}
                      arrived={arrived}
                      staggerEntrance={staggerEntrance}
                      dark={theme === 'dark'}
                      nodeRef={(node) => {
                        if (node) cardNodes.current.set(item.key, node);
                        else cardNodes.current.delete(item.key);
                      }}
                      onChoose={() => choose(item)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CardOverview;

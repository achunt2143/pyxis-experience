import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Package, AlertTriangle } from 'lucide-react';
import { useAppHost, waterdrop } from '@pyxis/app-sdk';
import { getAppAccent } from '../apps/registry';
import { useApps, type DesktopApp } from '../hooks/useApps';
import { AppIcon } from './AppIcon';
import { ShellPill } from './ShellDialog';
import { useMotion } from '../useMotion';
import { PANEL_ENTER, PANEL_REST, SCRIM_IN, SCRIM_OUT, TRANSITION } from '../motion';
import {
  LAUNCH_BAR_HEIGHT,
  LAUNCH_RAIL_TOP,
  LAUNCH_RAIL_WIDTH,
  useLaunchBarPosition,
} from './launchBarState';
import './AppDrawer.css';

export interface AppDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onAppSelect?: (appId: string) => void;
}

type CategoryFilter = 'all' | 'pim' | 'utility' | 'system';

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function matchesCategoryFilter(rawCategory: string | undefined, filter: CategoryFilter): boolean {
  if (filter === 'all') return true;
  const cat = (rawCategory ?? 'utility').trim().toLowerCase();
  if (filter === 'utility') {
    return cat === 'utility' || cat === 'utilities' || (cat !== 'pim' && cat !== 'system');
  }
  return cat === filter;
}

interface AppDrawerContentProps {
  isOpen: boolean;
  headingId: string;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  onAppSelect?: (appId: string) => void;
}

const AppDrawerContent: React.FC<AppDrawerContentProps> = ({
  isOpen,
  headingId,
  panelRef,
  onClose,
  onAppSelect,
}) => {
  const { to } = useMotion();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const appRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const { stateForApp } = useAppHost();
  // Nova's registry, not PYXIS_APPS — an .ipk app installed a moment ago
  // has no entry in the built-in overlay but must still show up here.
  const { apps, loading, error } = useApps();

  // Filter apps based on category and search query
  const filteredApps = useMemo(() => {
    const query = search.trim().toLowerCase();
    return apps.filter((app) => {
      const matchesSearch =
        query === '' ||
        app.name.toLowerCase().includes(query) ||
        app.id.toLowerCase().includes(query);
      const matchesCategory =
        matchesCategoryFilter(app.category, category) ||
        (query !== '' && matchesSearch); // search spans categories if query is entered
      return matchesSearch && matchesCategory;
    });
  }, [apps, search, category]);

  const safeSelectedIndex =
    filteredApps.length === 0
      ? 0
      : Math.min(selectedIndex, filteredApps.length - 1);

  const handleLaunch = useCallback(
    (app: DesktopApp) => {
      onAppSelect?.(app.id);
      onClose();
    },
    [onAppSelect, onClose]
  );

  // Focus search input on open and restore prior focus on close/unmount.
  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      const prev = previousFocusRef.current;
      previousFocusRef.current = null;
      if (prev && prev.isConnected) {
        prev.focus();
      }
    };
  }, [isOpen]);

  const categoryItems: { content: string; value: CategoryFilter }[] = useMemo(
    () => [
      { content: 'All', value: 'all' },
      { content: 'PIM', value: 'pim' },
      { content: 'Utilities', value: 'utility' },
      { content: 'System', value: 'system' },
    ],
    []
  );

  // Keyboard navigation, focus trap & Escape handling (only while open).
  useEffect(() => {
    if (!isOpen) return;

    const moveSelection = (nextIndex: number, focusTile: boolean) => {
      setSelectedIndex(nextIndex);
      const tile = appRefs.current[nextIndex];
      if (focusTile) tile?.focus();
      tile?.scrollIntoView?.({ block: 'nearest' });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const focusables = [
          ...(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []),
        ].filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (focusables.length === 0) {
          e.preventDefault();
          e.stopPropagation();
          panelRef.current?.focus();
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
        focusables[next]?.focus();
        return;
      }

      const activeEl = document.activeElement as HTMLElement | null;
      const inSearchInput = activeEl === searchInputRef.current;
      const tabContainer = activeEl?.closest('[role="tablist"]');
      const activeAppTile = activeEl?.closest('.px-drawer-app') as HTMLElement | null;
      const onOtherButton =
        activeEl instanceof HTMLButtonElement && !activeAppTile && !tabContainer;

      if (tabContainer) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          const currentTabIdx = tabRefs.current.findIndex((t) => t === activeEl);
          const idx = currentTabIdx >= 0 ? currentTabIdx : 0;
          const nextIdx =
            e.key === 'ArrowRight'
              ? (idx + 1) % categoryItems.length
              : (idx - 1 + categoryItems.length) % categoryItems.length;
          const nextCat = categoryItems[nextIdx];
          if (nextCat) {
            setCategory(nextCat.value);
            setSelectedIndex(0);
            tabRefs.current[nextIdx]?.focus();
          }
          return;
        }
        if (e.key === 'ArrowDown' && filteredApps.length > 0) {
          e.preventDefault();
          moveSelection(0, true);
        }
        return;
      }

      if (onOtherButton) {
        return;
      }

      if (inSearchInput && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        return;
      }

      if (filteredApps.length === 0) return;

      const columns = 4;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        moveSelection((safeSelectedIndex + 1) % filteredApps.length, !inSearchInput);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        moveSelection(
          safeSelectedIndex - 1 < 0 ? filteredApps.length - 1 : safeSelectedIndex - 1,
          !inSearchInput
        );
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next =
          safeSelectedIndex + columns < filteredApps.length
            ? safeSelectedIndex + columns
            : safeSelectedIndex;
        moveSelection(next, !inSearchInput);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const next =
          safeSelectedIndex - columns >= 0 ? safeSelectedIndex - columns : safeSelectedIndex;
        moveSelection(next, !inSearchInput);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = filteredApps[safeSelectedIndex];
        if (target) handleLaunch(target);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    onClose,
    panelRef,
    filteredApps,
    safeSelectedIndex,
    categoryItems,
    handleLaunch,
  ]);

  return (
    <div
      data-app-drawer
      className="px-ui"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        maxHeight: '100%',
        background: 'var(--px-material-strong)',
        color: 'var(--px-material-ink)',
      }}
    >
      {/* Header: Title bar & Search input */}
      <div
        style={{
          padding: '20px 22px 14px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          borderBottom: '1px solid color-mix(in srgb, var(--px-material-ink) 10%, transparent)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2
            id={headingId}
            data-drawer-heading
            className="px-display"
            style={{ margin: 0, fontSize: 22, letterSpacing: '0.2em', lineHeight: 1.2 }}
          >
            Applications
          </h2>

          <button
            type="button"
            onClick={onClose}
            title="Close launcher (Esc)"
            aria-label="Close launcher"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              width: 28,
              height: 28,
              padding: 0,
              borderRadius: waterdrop(28),
              color: 'var(--px-material-ink-quiet)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Search pill */}
        <input
          ref={searchInputRef}
          type="search"
          className="px-drawer-search"
          placeholder="Search applications…"
          aria-label="Search applications"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedIndex(0);
          }}
          autoFocus
        />

        {/* Category tabs */}
        <div
          role="tablist"
          aria-label="Application categories"
          style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 2 }}
        >
          {categoryItems.map((item, idx) => (
            <button
              key={item.value}
              ref={(el) => {
                tabRefs.current[idx] = el;
              }}
              type="button"
              role="tab"
              aria-selected={category === item.value}
              className="px-drawer-chip"
              onClick={() => {
                setCategory(item.value);
                setSelectedIndex(0);
              }}
            >
              {item.content}
            </button>
          ))}
        </div>
      </div>

      {/* Applications 4-column Grid */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '18px 16px',
          minHeight: 160,
        }}
      >
        {filteredApps.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              minHeight: 180,
              gap: 8,
              color: 'var(--px-material-ink-quiet)',
            }}
          >
            {/* Three different empty states, because they mean
                three different things. "No applications found"
                on an unreachable Nova would be the exact kind of
                confident falsehood alpha 3 was about. */}
            {error ? (
              <AlertTriangle size={32} style={{ opacity: 0.6 }} />
            ) : (
              <Package size={32} style={{ opacity: 0.5 }} />
            )}
            <div style={{ fontSize: '0.86rem', fontWeight: 500 }}>
              {error
                ? "Couldn't reach the app registry"
                : loading
                  ? 'Loading applications…'
                  : 'No applications found'}
            </div>
            {error && <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>{error}</div>}
            {!error && !loading && search && (
              <div style={{ marginTop: 8 }}>
                <ShellPill kind="secondary" onClick={() => setSearch('')}>
                  Clear search filter
                </ShellPill>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: '18px 8px',
            }}
          >
            {filteredApps.map((app, index) => {
              const isSelected = index === safeSelectedIndex;
              const accent = getAppAccent(app.id, app.accent);
              const lifecycleState = stateForApp(app.id);
              const isRunning =
                lifecycleState === 'running' || lifecycleState === 'starting';

              return (
                <motion.button
                  key={app.id}
                  ref={(el) => {
                    appRefs.current[index] = el;
                  }}
                  type="button"
                  className="px-drawer-app"
                  onClick={() => handleLaunch(app)}
                  onFocus={() => setSelectedIndex(index)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  whileHover={to({ scale: 1.05 })}
                  whileTap={to({ scale: 0.94 })}
                  style={{
                    background: isSelected
                      ? 'color-mix(in srgb, var(--px-material-ink) 7%, transparent)'
                      : 'transparent',
                    border: isSelected
                      ? '1px solid color-mix(in srgb, var(--px-material-ink) 16%, transparent)'
                      : '1px solid transparent',
                    borderRadius: 'var(--px-corner)',
                    padding: '10px 4px 8px 4px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease, border-color 0.15s ease',
                  }}
                >
                  {/* Waterdrop Shaped Icon Tile */}
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: waterdrop(56),
                      background: accent.bg,
                      border: `1.5px solid ${accent.border}`,
                      boxShadow: `0 4px 12px ${accent.shadow}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      color: accent.iconColor,
                      flexShrink: 0,
                    }}
                  >
                    <AppIcon app={app} size={26} />

                    {/* Running Indicator Dot at the sharp top-right corner */}
                    {isRunning && (
                      <div
                        title={`${app.name} is running`}
                        style={{
                          position: 'absolute',
                          top: 2,
                          right: 2,
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background:
                            lifecycleState === 'starting' ? '#FFB74D' : '#4CAF50',
                          border: '1.5px solid white',
                          boxShadow: '0 0 6px rgba(76, 175, 80, 0.8)',
                        }}
                      />
                    )}
                  </div>

                  {/* App Title */}
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 12.5,
                      color: 'var(--px-material-ink)',
                      textAlign: 'center',
                      width: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      padding: '0 4px',
                    }}
                    title={app.name}
                  >
                    {app.name}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export const AppDrawer: React.FC<AppDrawerProps> = ({
  isOpen,
  onClose,
  onAppSelect,
}) => {
  const { tr, to } = useMotion();
  const position = useLaunchBarPosition();
  const rail = position === 'left';
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const enter = rail ? { ...PANEL_ENTER, x: -8, y: 0 } : { ...PANEL_ENTER, y: 8 };
  return (
    <>
      {/* Click-outside backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            data-app-drawer-scrim=""
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: tr(SCRIM_IN) }}
            exit={{ opacity: 0, transition: tr(SCRIM_OUT) }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1299,
              background: 'rgba(8, 10, 24, 0.25)',
              pointerEvents: isOpen ? 'auto' : 'none',
            }}
            onClick={isOpen ? onClose : undefined}
          />
        )}
      </AnimatePresence>

      {/* Desktop App Drawer Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            tabIndex={-1}
            data-app-drawer-panel={rail ? 'rail' : 'bar'}
            initial={to(enter)}
            animate={{ ...to({ ...PANEL_REST, x: 0, y: 0 }), transition: tr(TRANSITION.open) }}
            exit={{ ...to(enter), transition: tr(TRANSITION.close) }}
            style={{
              position: 'fixed',
              ...(rail
                ? {
                    left: LAUNCH_RAIL_WIDTH + 12,
                    top: LAUNCH_RAIL_TOP + 8,
                    width: 'min(440px, calc(100vw - 88px))',
                    maxHeight: `calc(100vh - ${LAUNCH_RAIL_TOP + 24}px)`,
                    transformOrigin: 'top left',
                  }
                : {
                    left: 12,
                    bottom: LAUNCH_BAR_HEIGHT + 8,
                    width: 'min(440px, calc(100vw - 24px))',
                    maxHeight: 'min(580px, calc(100vh - 86px))',
                    transformOrigin: 'bottom left',
                  }),
              zIndex: 1300,
              pointerEvents: isOpen ? 'auto' : 'none',
              boxShadow:
                '0 30px 70px rgba(0, 0, 0, 0.35), inset 0 0 0 1px color-mix(in srgb, var(--px-material-ink) 10%, transparent)',
              borderRadius: 'var(--px-corner)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <AppDrawerContent
              isOpen={isOpen}
              headingId={headingId}
              panelRef={panelRef}
              onClose={onClose}
              onAppSelect={onAppSelect}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AppDrawer;

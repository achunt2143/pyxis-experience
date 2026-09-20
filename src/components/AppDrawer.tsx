import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Package, AlertTriangle } from 'lucide-react';
import {
  FloatingPanel,
  Input,
  Button,
  ViewSelectButton,
  Divider,
} from 'remochi';
import { usePyxisTheme, useAppHost } from '@pyxis/app-sdk';
import { getAppAccent } from '../apps/registry';
import { useApps, type DesktopApp } from '../hooks/useApps';
import { AppIcon } from './AppIcon';

export interface AppDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onAppSelect?: (appId: string) => void;
  isCompact?: boolean;
}

type CategoryFilter = 'all' | 'pim' | 'system';

interface AppDrawerContentProps {
  onClose: () => void;
  onAppSelect?: (appId: string) => void;
}

const AppDrawerContent: React.FC<AppDrawerContentProps> = ({
  onClose,
  onAppSelect,
}) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  const theme = usePyxisTheme('light');
  const panelStyle = theme === 'dark' ? 'shadow' : 'default';
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
        category === 'all' ||
        app.category === category ||
        (query !== '' && matchesSearch); // search spans categories if query is entered
      return matchesSearch && matchesCategory;
    });
  }, [apps, search, category]);

  const safeSelectedIndex =
    filteredApps.length === 0
      ? 0
      : Math.min(selectedIndex, filteredApps.length - 1);

  // Keyboard navigation: Escape to close, arrows to select, Enter to launch
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (filteredApps.length === 0) return;

      const columns = 4;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredApps.length);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev - 1 < 0 ? filteredApps.length - 1 : prev - 1
        );
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev + columns < filteredApps.length ? prev + columns : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev - columns >= 0 ? prev - columns : prev
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = filteredApps[safeSelectedIndex];
        if (target) {
          onAppSelect?.(target.id);
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onAppSelect, filteredApps, safeSelectedIndex]);

  const handleLaunch = (app: DesktopApp) => {
    onAppSelect?.(app.id);
    onClose();
  };

  const categoryItems = [
    { content: 'All', active: category === 'all' },
    { content: 'PIM', active: category === 'pim' },
    { content: 'System', active: category === 'system' },
  ];

  return (
    <FloatingPanel style={panelStyle}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
                  maxHeight: 'min(580px, calc(100vh - 86px))',
                  color: 'var(--color-text)',
                }}
              >
                {/* Header: Title bar & Search input */}
                <div
                  style={{
                    padding: '16px 18px 12px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    borderBottom: '1px solid var(--mochi-border, rgba(0,0,0,0.08))',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          letterSpacing: '-0.01em',
                          color: 'var(--color-text)',
                        }}
                      >
                        Applications
                        <span
                          style={{
                            fontSize: '0.74rem',
                            fontWeight: 400,
                            color: 'var(--color-text-secondary)',
                            marginLeft: 6,
                          }}
                        >
                          • pyxis
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={onClose}
                      title="Close launcher (Esc)"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 4,
                        borderRadius: 8,
                        color: 'var(--color-text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Remochi Search Box */}
                  <Input
                    type="search"
                    placeholder="Search applications…"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setSelectedIndex(0);
                    }}
                    autoFocus
                    style={{ width: '100%', margin: 0 }}
                  />

                  {/* Palm webOS Category Tabs (ViewSelectButton) */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 2,
                    }}
                  >
                    <ViewSelectButton
                      items={categoryItems}
                      onSelect={(item) => {
                        setCategory(item.content.toLowerCase() as CategoryFilter);
                        setSelectedIndex(0);
                      }}
                    />
                  </div>
                </div>

                {/* Applications 4-column Grid */}
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '16px 14px',
                    minHeight: 220,
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
                        color: 'var(--color-text-secondary)',
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
                      {error && (
                        <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>{error}</div>
                      )}
                      {!error && !loading && search && (
                        <div style={{ marginTop: 8 }}>
                          <Button variant="blue" onClick={() => setSearch('')}>
                            Clear search filter
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '16px 8px',
                      }}
                    >
                      {filteredApps.map((app, index) => {

                        const isSelected = index === safeSelectedIndex;
                        const accent = getAppAccent(app.id);
                        const lifecycleState = stateForApp(app.id);
                        const isRunning =
                          lifecycleState === 'running' ||
                          lifecycleState === 'starting';

                        return (
                          <motion.button
                            key={app.id}
                            type="button"
                            onClick={() => handleLaunch(app)}
                            onMouseEnter={() => setSelectedIndex(index)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.94 }}
                            style={{
                              background: isSelected
                                ? 'var(--mochi-hover, rgba(0,0,0,0.06))'
                                : 'transparent',
                              border: isSelected
                                ? '1px solid var(--color-primary, #2f6fed)'
                                : '1px solid transparent',
                              borderRadius: 14,
                              padding: '10px 4px 8px 4px',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              outline: 'none',
                              transition: 'background 0.15s ease, border-color 0.15s ease',
                            }}
                          >
                            {/* Waterdrop Shaped Icon Tile */}
                            <div
                              style={{
                                width: 56,
                                height: 56,
                                borderRadius: '26px 4px 26px 26px',
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
                                      lifecycleState === 'starting'
                                        ? '#FFB74D'
                                        : '#4CAF50',
                                    border: '1.5px solid white',
                                    boxShadow: '0 0 6px rgba(76, 175, 80, 0.8)',
                                  }}
                                />
                              )}
                            </div>

                            {/* App Title */}
                            <div
                              style={{
                                marginTop: 8,
                                fontSize: '0.74rem',
                                fontWeight: 500,
                                color: 'var(--color-text)',
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

                <Divider orientation="horizontal" style={{ margin: 0 }} />

                {/* Footer: Keyboard shortcut guide and status */}
                <div
                  style={{
                    padding: '8px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.72rem',
                    color: 'var(--color-text-secondary)',
                    background: 'var(--mochi-hover, rgba(0,0,0,0.02))',
                  }}
                >
                  <div>
                    {filteredApps.length}{' '}
                    {filteredApps.length === 1 ? 'app' : 'apps'}
                  </div>
                  <div>
                    <span style={{ opacity: 0.75 }}>↑↓←→</span> navigate •{' '}
                    <span style={{ opacity: 0.75 }}>↵</span> launch •{' '}
                    <span style={{ opacity: 0.75 }}>Esc</span> close
                  </div>
                </div>
              </div>
    </FloatingPanel>
  );
};

export const AppDrawer: React.FC<AppDrawerProps> = ({
  isOpen,
  onClose,
  onAppSelect,
  isCompact = false,
}) => {
  return (
    <>
      {/* Click-outside backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1299,
              background: 'rgba(0, 0, 0, 0.22)',
              backdropFilter: 'blur(2px)',
            }}
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Desktop App Drawer Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              y: '100%',
              transition: { duration: 0.22, ease: [0.32, 0, 0.24, 1] },
            }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'fixed',
              left: 16,
              bottom: isCompact ? 50 : 74,
              width: 440,
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: 'min(580px, calc(100vh - 86px))',
              zIndex: 1300,
              boxShadow: '0 20px 45px rgba(0, 0, 0, 0.28)',
              borderRadius: 16,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <AppDrawerContent onClose={onClose} onAppSelect={onAppSelect} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AppDrawer;

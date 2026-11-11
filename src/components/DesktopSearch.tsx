import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Input, PopupPanel } from 'remochi';
import { motion } from 'framer-motion';
import { useMotion } from '../useMotion';
import { TRANSITION } from '../motion';
import {
  Search,
  Globe,
  FileText,
  CheckSquare,
  Terminal,
  X,
  CornerDownLeft,
} from 'lucide-react';
import { useApps } from '../hooks/useApps';
import { AppIcon } from './AppIcon';
import { useEcho, loadAppData, saveAppData } from '@pyxis/app-sdk';
import { CLOSE_SEARCH_EVENT, FOCUS_SEARCH_EVENT } from '../hooks/useGlobalShortcuts';

interface DesktopSearchProps {
  onLaunch: (appId: string, name: string) => void;
  /**
   * Called when the box opens or closes. An open box takes typing, which in
   * the overlay means the shell has to hold the keyboard.
   */
  onActiveChange?: (active: boolean) => void;
}

interface StoredContact {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
}

interface StoredNote {
  id: string;
  title: string;
  body: string;
  category?: string;
  updatedAt: number;
}

interface StoredTask {
  id: string;
  text: string;
  done: boolean;
  priority?: string;
  createdAt: number;
}

export type SearchResultType = 'app' | 'action' | 'contact' | 'note' | 'task';

export interface SearchResultItem {
  id: string;
  type: SearchResultType;
  section: 'apps' | 'actions' | 'pim';
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

/**
 * DesktopSearch — Palm webOS "Just Type" Universal Intent Engine.
 *
 * Implements Palm's hallmark universal interface:
 * 1. Global Keystroke Capture: typing anywhere on desktop auto-focuses search.
 * 2. Instant App Launching: top application hit launches on Enter.
 * 3. Quick Actions: "Take a note", "Add task", "Search web", "Run in terminal".
 * 4. PIM Deep Search: live querying across saved contacts, notes, and tasks.
 */
export const DesktopSearch: React.FC<DesktopSearchProps> = ({ onLaunch, onActiveChange }) => {
  const { tr, to } = useMotion();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);

  const echo = useEcho();
  const { apps } = useApps();

  // Cached PIM datasets
  const [contacts, setContacts] = useState<StoredContact[]>([]);
  const [notes, setNotes] = useState<StoredNote[]>([]);
  const [tasks, setTasks] = useState<StoredTask[]>([]);

  // Refresh PIM data whenever search is opened or query typed. Each app's
  // documents are its own on a device, so the shell names whose it reads
  // (and writes, below); that takes filesystem:apps, which only it holds.
  useEffect(() => {
    let mounted = true;
    Promise.all([
      loadAppData<{ contacts: StoredContact[] }>('contacts', { contacts: [] }, { app: 'contacts' }),
      loadAppData<{ notes: StoredNote[] }>('notes', { notes: [] }, { app: 'notes' }),
      loadAppData<{ tasks: StoredTask[] }>('tasks', { tasks: [] }, { app: 'tasks' }),
    ])
      .then(([cDoc, nDoc, tDoc]) => {
        if (!mounted) return;
        setContacts(cDoc?.contacts ?? []);
        setNotes(nDoc?.notes ?? []);
        setTasks(tDoc?.tasks ?? []);
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [open]);

  const closeSearch = useCallback(() => {
    setQuery('');
    setOpen(false);
    setActiveIndex(0);
    // Not containerRef: the result items' handlers call this, and they are
    // built during render (useMemo), where reading a ref is refused.
    const focused = document.activeElement;
    if (focused instanceof HTMLInputElement) focused.blur();
  }, []);

  const updateQuery = (next: string) => {
    setQuery(next);
    setActiveIndex(0);
    if (!open && next.trim().length > 0) {
      setOpen(true);
    }
  };

  // Compile structured results
  const { flatResults, sections } = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return { flatResults: [] as SearchResultItem[], sections: [] };
    }

    // 1. Applications
    const matchingApps = apps.filter(
      (app) =>
        app.name.toLowerCase().includes(q) ||
        app.id.toLowerCase().includes(q) ||
        (app.category && app.category.toLowerCase().includes(q))
    );

    const appItems: SearchResultItem[] = matchingApps.map((app) => ({
      id: `app-${app.id}`,
      type: 'app',
      section: 'apps',
      title: app.name,
      subtitle: app.category ? `${app.category.toUpperCase()} · ${app.id}` : app.id,
      badge: 'App',
      badgeColor: 'var(--color-primary, #3b82f6)',
      icon: <AppIcon app={app} size={20} />,
      onSelect: () => {
        onLaunch(app.id, app.name);
        closeSearch();
      },
    }));

    // 2. Quick Actions
    const rawQ = query.trim();
    const actionItems: SearchResultItem[] = [
      {
        id: 'action-note',
        type: 'action',
        section: 'actions',
        title: `Take a note: "${rawQ}"`,
        subtitle: 'Save note and open Notes app',
        badge: 'Note',
        badgeColor: '#f59e0b',
        icon: <FileText size={18} style={{ color: '#f59e0b' }} />,
        onSelect: async () => {
          const newN: StoredNote = {
            id: Math.random().toString(36).slice(2, 11),
            title: rawQ,
            body: '',
            category: 'General',
            updatedAt: Date.now(),
          };
          await saveAppData('notes', { notes: [newN, ...notes] }, { app: 'notes' });
          onLaunch('notes', 'Notes');
          closeSearch();
        },
      },
      {
        id: 'action-task',
        type: 'action',
        section: 'actions',
        title: `Add task: "${rawQ}"`,
        subtitle: 'Add to Tasks checklist',
        badge: 'Task',
        badgeColor: '#10b981',
        icon: <CheckSquare size={18} style={{ color: '#10b981' }} />,
        onSelect: async () => {
          const newT: StoredTask = {
            id: Math.random().toString(36).slice(2, 11),
            text: rawQ,
            done: false,
            priority: 'medium',
            createdAt: Date.now(),
          };
          await saveAppData('tasks', { tasks: [newT, ...tasks] }, { app: 'tasks' });
          onLaunch('tasks', 'Tasks');
          closeSearch();
        },
      },
      {
        id: 'action-web',
        type: 'action',
        section: 'actions',
        title: `Search Web for "${rawQ}"`,
        subtitle: 'Search DuckDuckGo in Browser',
        badge: 'Web',
        badgeColor: '#0ea5e9',
        icon: <Globe size={18} style={{ color: '#0ea5e9' }} />,
        onSelect: () => {
          const url = `https://duckduckgo.com/?q=${encodeURIComponent(rawQ)}`;
          echo.openExternalBrowser(url).catch(() => {});
          closeSearch();
        },
      },
      {
        id: 'action-terminal',
        type: 'action',
        section: 'actions',
        title: `Run in Terminal: "${rawQ}"`,
        subtitle: 'Launch terminal session',
        badge: 'Terminal',
        badgeColor: '#6366f1',
        icon: <Terminal size={18} style={{ color: '#6366f1' }} />,
        onSelect: () => {
          onLaunch('terminal', 'Terminal');
          closeSearch();
        },
      },
    ];

    // 3. PIM Deep Search
    const matchingContacts = contacts
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (c.company && c.company.toLowerCase().includes(q))
      )
      .slice(0, 3)
      .map((c) => ({
        id: `contact-${c.id}`,
        type: 'contact' as const,
        section: 'pim' as const,
        title: c.name,
        subtitle: [c.phone, c.email, c.company].filter(Boolean).join(' · '),
        badge: 'Contact',
        badgeColor: '#8b5cf6',
        icon: (
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: '9px 2px 9px 9px',
              background: 'linear-gradient(135deg, #a78bfa, #7c3aed)',
              color: '#ffffff',
              fontSize: '10px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {c.name.charAt(0).toUpperCase()}
          </div>
        ),
        onSelect: () => {
          onLaunch('contacts', 'Contacts');
          closeSearch();
        },
      }));

    const matchingNotes = notes
      .filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q))
      .slice(0, 3)
      .map((n) => ({
        id: `note-${n.id}`,
        type: 'note' as const,
        section: 'pim' as const,
        title: n.title || 'Untitled Note',
        subtitle: n.body ? n.body.slice(0, 45) : (n.category ?? 'Note'),
        badge: 'Note',
        badgeColor: '#f59e0b',
        icon: <FileText size={18} style={{ color: '#f59e0b' }} />,
        onSelect: () => {
          onLaunch('notes', 'Notes');
          closeSearch();
        },
      }));

    const matchingTasks = tasks
      .filter((t) => t.text.toLowerCase().includes(q))
      .slice(0, 3)
      .map((t) => ({
        id: `task-${t.id}`,
        type: 'task' as const,
        section: 'pim' as const,
        title: t.text,
        subtitle: t.done ? 'Completed task' : (t.priority ? `${t.priority} priority` : 'Pending task'),
        badge: 'Task',
        badgeColor: '#10b981',
        icon: <CheckSquare size={18} style={{ color: t.done ? '#9ca3af' : '#10b981' }} />,
        onSelect: () => {
          onLaunch('tasks', 'Tasks');
          closeSearch();
        },
      }));

    const pimItems = [...matchingContacts, ...matchingNotes, ...matchingTasks];

    const flat = [...appItems, ...actionItems, ...pimItems];

    const secList: Array<{ id: string; label: string; items: SearchResultItem[] }> = [];
    if (appItems.length > 0) {
      secList.push({ id: 'apps', label: `Applications (${appItems.length})`, items: appItems });
    }
    secList.push({ id: 'actions', label: 'Quick Actions', items: actionItems });
    if (pimItems.length > 0) {
      secList.push({ id: 'pim', label: `Personal Data (${pimItems.length})`, items: pimItems });
    }

    return { flatResults: flat, sections: secList };
  }, [apps, contacts, notes, tasks, query, onLaunch, closeSearch, echo]);

  const showDropdown = open && query.trim().length > 0;

  // Global keystroke listener: typing anywhere on desktop triggers Just Type
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Ignore if focus is in an input, textarea, or editable element
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Ignore if a modal dialog is currently open
      if (document.querySelector('.mochi-dialog, [role="dialog"]')) {
        return;
      }

      // Hotkey toggle: Ctrl+Space or Meta+K
      if ((e.ctrlKey && e.code === 'Space') || (e.metaKey && e.code === 'KeyK')) {
        e.preventDefault();
        const inputEl = containerRef.current?.querySelector('input');
        inputEl?.focus();
        setOpen(true);
        return;
      }

      // Modifier key combos (Alt, Ctrl, Meta) shouldn't type
      if (e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }

      // Escape dismisses
      if (e.key === 'Escape') {
        if (open) {
          e.preventDefault();
          closeSearch();
        }
        return;
      }

      // Printable single character: auto-focus Just Type and append
      if (e.key.length === 1 && !e.repeat) {
        const inputEl = containerRef.current?.querySelector('input');
        if (inputEl) {
          inputEl.focus();
          setOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    // Evo's Super+Space reaches the shell as a signal, not a key (see
    // Desktop.tsx), because no key reaches Bloom while an app has focus.
    const handleFocusRequest = (event: Event) => {
      // "Just type" from the desktop beneath arrives with the key that
      // started it: the query begins with it.
      const text = (event as CustomEvent<{ text?: string } | undefined>).detail?.text;
      if (text) setQuery((current) => (current ? current : text));
      containerRef.current?.querySelector('input')?.focus();
      setOpen(true);
    };
    window.addEventListener(FOCUS_SEARCH_EVENT, handleFocusRequest);
    window.addEventListener(CLOSE_SEARCH_EVENT, closeSearch);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
      window.removeEventListener(FOCUS_SEARCH_EVENT, handleFocusRequest);
      window.removeEventListener(CLOSE_SEARCH_EVENT, closeSearch);
    };
  }, [open, closeSearch]);

  // Tell the shell whether the box is open: it takes typing, so in the
  // overlay the shell holds the keyboard for as long as it is.
  const activeChange = useRef(onActiveChange);
  useEffect(() => {
    activeChange.current = onActiveChange;
  });
  useEffect(() => {
    activeChange.current?.(open);
  }, [open]);

  // Measure anchor rect for PopupPanel
  useEffect(() => {
    if (!showDropdown) return;

    const computeRect = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setAnchorRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom,
        right: window.innerWidth,
      } as DOMRect);
    };
    computeRect();
    window.addEventListener('resize', computeRect);
    return () => window.removeEventListener('resize', computeRect);
  }, [showDropdown]);

  const effectiveAnchorRect = showDropdown ? anchorRect : null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      closeSearch();
      return;
    }
    if (!flatResults.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % flatResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + flatResults.length) % flatResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = flatResults[activeIndex] ?? flatResults[0];
      target?.onSelect();
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (!resultsListRef.current) return;
    const activeEl = resultsListRef.current.querySelector(
      `[data-item-index="${activeIndex}"]`
    ) as HTMLElement | null;
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* While open, a click anywhere else closes the box. Portalled to the
          page: the top bar's backdrop-filter would make it the containing
          block of a fixed child, shrinking this to the bar. Above the dock
          (1100), beneath the bar (1200) that holds the input. */}
      {open &&
        createPortal(
          <div
            aria-hidden="true"
            data-search-backdrop=""
            onMouseDown={closeSearch}
            style={{ position: 'fixed', inset: 0, zIndex: 1150 }}
          />,
          document.body
        )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          background: 'var(--color-surface-hover, rgba(0, 0, 0, 0.04))',
          borderRadius: '20px',
          padding: '2px 10px',
          border: '1px solid var(--color-border-light, rgba(0, 0, 0, 0.08))',
          transition: 'all 0.18s ease',
        }}
      >
        <Search size={16} style={{ opacity: 0.6, flexShrink: 0 }} />
        <Input
          placeholder="Just type..."
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            updateQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
            const next = e.relatedTarget as HTMLElement | null;
            if (next?.closest('.mochi-contextual-popup')) {
              e.target.focus();
            }
          }}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            fontSize: '12px',
            outline: 'none',
          }}
        />
        {query ? (
          <button
            type="button"
            onClick={() => updateQuery('')}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-text-secondary)',
              opacity: 0.7,
            }}
            title="Clear search"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      <PopupPanel isOpen={showDropdown} onClose={() => setOpen(false)} anchorRect={effectiveAnchorRect}>
        <motion.div
          ref={resultsListRef}
          initial={to({ opacity: 0, scale: 0.97 })}
          animate={{ ...to({ opacity: 1, scale: 1 }), transition: tr(TRANSITION.popupIn) }}
          style={{
            transformOrigin: 'top center',
            width: 380,
            maxHeight: 440,
            overflowY: 'auto',
            padding: '4px 0',
            fontFamily: 'inherit',
          }}
        >
          {flatResults.length === 0 ? (
            <div
              style={{
                padding: '16px',
                textAlign: 'center',
                fontSize: '0.85rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              No matching results
            </div>
          ) : (
            <>
              {sections.map((section) => (
                <div key={section.id} style={{ marginBottom: '6px' }}>
                  <div
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--color-text-secondary, #6b7280)',
                      padding: '6px 14px 4px 14px',
                    }}
                  >
                    {section.label}
                  </div>
                  {section.items.map((item) => {
                    const itemIndex = flatResults.indexOf(item);
                    const isActive = itemIndex === activeIndex;

                    return (
                      <div
                        key={item.id}
                        data-item-index={itemIndex}
                        onMouseEnter={() => setActiveIndex(itemIndex)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          item.onSelect();
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '7px 12px',
                          margin: '1px 6px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          background: isActive
                            ? 'var(--color-primary-light, rgba(59, 130, 246, 0.12))'
                            : 'transparent',
                          transition: 'background 0.12s ease',
                        }}
                      >
                        <div
                          style={{
                            flexShrink: 0,
                            width: 24,
                            height: 24,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {item.icon}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                          <div
                            style={{
                              fontSize: '13px',
                              fontWeight: isActive ? 600 : 500,
                              color: 'var(--color-text)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {item.title}
                          </div>
                          {item.subtitle && (
                            <div
                              style={{
                                fontSize: '11px',
                                color: 'var(--color-text-secondary, #6b7280)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {item.subtitle}
                            </div>
                          )}
                        </div>

                        {isActive ? (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '3px',
                              fontSize: '10px',
                              fontWeight: 600,
                              color: 'var(--color-primary, #3b82f6)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'rgba(59, 130, 246, 0.15)',
                              flexShrink: 0,
                            }}
                          >
                            <span>Launch</span>
                            <CornerDownLeft size={11} />
                          </div>
                        ) : item.badge ? (
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              padding: '2px 5px',
                              borderRadius: '4px',
                              background: 'var(--color-surface-hover, rgba(0, 0, 0, 0.05))',
                              color: item.badgeColor ?? 'var(--color-text-secondary)',
                              flexShrink: 0,
                            }}
                          >
                            {item.badge}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* End of results */}
            </>
          )}
        </motion.div>
      </PopupPanel>
    </div>
  );
};

export default DesktopSearch;

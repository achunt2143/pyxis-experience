import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
import { AppDropIcon } from './AppDropIcon';
import { useEcho, loadAppData, saveAppData } from '@pyxis/app-sdk';
import { CLOSE_SEARCH_EVENT, FOCUS_SEARCH_EVENT } from '../hooks/useGlobalShortcuts';
import { getActiveLockPhase } from '../lock/lockUi';

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

function buildQuickNote(title: string): StoredNote {
  return {
    id: Math.random().toString(36).slice(2, 11),
    title,
    body: '',
    category: 'General',
    updatedAt: Date.now(),
  };
}

function buildQuickTask(text: string): StoredTask {
  return {
    id: Math.random().toString(36).slice(2, 11),
    text,
    done: false,
    priority: 'medium',
    createdAt: Date.now(),
  };
}

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
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);

  const echo = useEcho();
  const { apps } = useApps();

  // Cached PIM datasets
  const [contacts, setContacts] = useState<StoredContact[]>([]);
  const [notes, setNotes] = useState<StoredNote[]>([]);
  const [tasks, setTasks] = useState<StoredTask[]>([]);

  // Re-read the PIM data each time the box opens, so what was written in
  // Notes a moment ago is found. Each app's documents are its own on a
  // device, so the shell names whose it reads (and writes, below); that
  // takes filesystem:apps, which only it holds.
  useEffect(() => {
    if (!open) return;
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
      badgeColor: 'var(--px-material-ink-quiet)',
      icon: <AppDropIcon appId={app.id} size={24} />,
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
          const newN = buildQuickNote(rawQ);
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
          const newT = buildQuickTask(rawQ);
          await saveAppData('tasks', { tasks: [newT, ...tasks] }, { app: 'tasks' });
          onLaunch('tasks', 'Tasks');
          closeSearch();
        },
      },
      {
        id: 'action-web',
        type: 'action',
        section: 'actions',
        title: /^https?:\/\//i.test(rawQ) ? `Open "${rawQ}" in Browser` : `Search Web for "${rawQ}"`,
        subtitle: /^https?:\/\//i.test(rawQ) ? 'Open URL in Vela' : 'Search DuckDuckGo in Browser',
        badge: 'Web',
        badgeColor: '#0ea5e9',
        icon: <Globe size={18} style={{ color: '#0ea5e9' }} />,
        onSelect: () => {
          const url = /^https?:\/\//i.test(rawQ)
            ? rawQ
            : `https://duckduckgo.com/?q=${encodeURIComponent(rawQ)}`;
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

      // Ignore if a modal dialog is currently open, or the lock screen is up
      // (it takes the typing: that is the password).
      if (document.querySelector('.mochi-dialog, [role="dialog"]') || getActiveLockPhase() !== 'off') {
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
      if (getActiveLockPhase() !== 'off') return;
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
  // Unmounted while open (the bar hidden under a fullscreen app): it is closed now.
  useEffect(() => () => activeChange.current?.(false), []);

  // Where the panel drops from: the box's bottom-left corner, in the page.
  useEffect(() => {
    if (!showDropdown) return;

    const computeAnchor = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setAnchor({ left: rect.left, top: rect.bottom });
    };
    computeAnchor();
    window.addEventListener('resize', computeAnchor);
    return () => window.removeEventListener('resize', computeAnchor);
  }, [showDropdown]);

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
          page so no ancestor's transform or filter can become the containing
          block of a fixed child and shrink this to the strip. Above the
          launch bar (1100), beneath the strip (1200) that holds the input. */}
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
      {/* The box: a quiet underline on the wallpaper, in the strip's ink
          (StatusStrip.css draws the line and its focus). */}
      <div
        className="px-strip-search"
        data-search-box=""
        data-open={open ? 'true' : 'false'}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          height: 26,
          boxSizing: 'border-box',
          paddingBottom: 3,
          color: 'var(--px-ink)',
        }}
      >
        <Search size={15} aria-hidden="true" style={{ flexShrink: 0, filter: 'drop-shadow(0 1px 3px var(--px-ink-shadow))' }} />
        <input
          type="text"
          aria-label="Search"
          placeholder="Just type"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => {
            updateQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={(e) => {
            const next = e.relatedTarget as HTMLElement | null;
            if (next?.closest('[data-search-panel]')) {
              e.target.focus();
            }
          }}
          style={{
            flex: 1,
            minWidth: 0,
            padding: 0,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--px-ink)',
            caretColor: 'var(--px-ink)',
            textShadow: 'inherit',
            fontFamily: 'var(--px-font-ui)',
            fontSize: 13,
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
              padding: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--px-ink-quiet)',
            }}
            title="Clear search"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      {showDropdown &&
        anchor &&
        createPortal(
          <motion.div
            ref={resultsListRef}
            data-search-panel=""
            role="listbox"
            aria-label="Search results"
            initial={to({ opacity: 0, y: -6, scale: 0.98 })}
            animate={{ ...to({ opacity: 1, y: 0, scale: 1 }), transition: tr(TRANSITION.popupIn) }}
            style={{
              position: 'fixed',
              left: Math.max(8, anchor.left - 6),
              top: anchor.top + 10,
              zIndex: 1210,
              transformOrigin: 'top left',
              width: 400,
              maxWidth: 'calc(100vw - 16px)',
              maxHeight: 'min(460px, calc(100vh - 160px))',
              overflowY: 'auto',
              boxSizing: 'border-box',
              padding: '10px 0 8px',
              borderRadius: 'var(--px-corner)',
              background: 'var(--px-material-strong)',
              color: 'var(--px-material-ink)',
              fontFamily: 'var(--px-font-ui)',
              boxShadow:
                '0 20px 50px rgba(0, 0, 0, 0.28), inset 0 0 0 1px color-mix(in srgb, var(--px-material-ink) 10%, transparent)',
            }}
          >
            {flatResults.length === 0 ? (
              <div
                style={{
                  padding: 16,
                  textAlign: 'center',
                  fontSize: 13,
                  color: 'var(--px-material-ink-quiet)',
                }}
              >
                No matching results
              </div>
            ) : (
              sections.map((section) => (
                <div key={section.id} style={{ marginBottom: 6 }}>
                  <div
                    data-search-head=""
                    style={{
                      fontFamily: 'var(--px-font-display)',
                      fontWeight: 300,
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--px-font-display-tracking)',
                      color: 'var(--px-material-ink-quiet)',
                      padding: '6px 16px 4px',
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
                        className="px-search-row"
                        role="option"
                        aria-selected={isActive}
                        data-active={isActive ? 'true' : 'false'}
                        data-item-index={itemIndex}
                        onMouseEnter={() => setActiveIndex(itemIndex)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          item.onSelect();
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '7px 12px',
                          margin: '1px 8px',
                          borderRadius: 'var(--px-corner-40)',
                          cursor: 'pointer',
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
                              fontSize: 13,
                              fontWeight: isActive ? 700 : 400,
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
                                fontSize: 11,
                                color: 'var(--px-material-ink-quiet)',
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
                              gap: 3,
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '2px 7px',
                              borderRadius: 'var(--px-corner-20)',
                              background: 'color-mix(in srgb, var(--px-material-ink) 10%, transparent)',
                              flexShrink: 0,
                            }}
                          >
                            <span>Launch</span>
                            <CornerDownLeft size={11} />
                          </div>
                        ) : item.badge ? (
                          <span
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                              padding: '2px 6px',
                              borderRadius: 'var(--px-corner-20)',
                              background: 'color-mix(in srgb, var(--px-material-ink) 6%, transparent)',
                              color: item.badgeColor
                                ? `color-mix(in srgb, ${item.badgeColor} 55%, var(--px-material-ink))`
                                : 'var(--px-material-ink-quiet)',
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
              ))
            )}
          </motion.div>,
          document.body
        )}
    </div>
  );
};

export default DesktopSearch;

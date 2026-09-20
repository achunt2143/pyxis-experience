import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Input, PopupPanel, Item } from 'remochi';
import { Search } from 'lucide-react';
import { useApps, type DesktopApp } from '../hooks/useApps';
import { AppIcon } from './AppIcon';

interface DesktopSearchProps {
  onLaunch: (appId: string, name: string) => void;
}

/**
 * The top bar's search box, wired up as a lightweight app launcher: typing
 * filters Nova's installed-app list, arrow keys move the highlight, Enter
 * launches. Searching an id as well as a name matters for third-party apps,
 * whose package name is often what a user remembers installing. Results
 * render in remochi's own contextual popup (PopupPanel) anchored to the
 * search field, so it reads as a native part of the shell's design system
 * rather than a bolted-on overlay.
 */
export const DesktopSearch: React.FC<DesktopSearchProps> = ({ onLaunch }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { apps } = useApps();

  const results = useMemo<DesktopApp[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return apps.filter(
      (app) =>
        app.name.toLowerCase().includes(q) || app.id.toLowerCase().includes(q)
    );
  }, [apps, query]);

  const showDropdown = open && query.trim().length > 0;

  // The highlight resets to the first result whenever the query changes.
  // Done in the one place the query is edited rather than in an effect
  // keyed on `query`: an effect would land a render *after* the new results
  // are painted, briefly highlighting a row at the old index (and tripping
  // react-hooks/set-state-in-effect for exactly that reason).
  const updateQuery = (next: string) => {
    setQuery(next);
    setActiveIndex(0);
  };

  // Feed PopupPanel a *fake* anchor rect rather than the search field's real
  // one. Its placement heuristic treats any anchor within 100px of the
  // viewport's top/bottom edge as "too close" and tries placing the popup
  // beside it (left/right) before ever trying below — which is *always*
  // true for anything pinned in this 48px-tall top bar, so it kept opening
  // sideways into the quick-settings area instead of dropping under the
  // bar. Reporting the anchor's right edge as flush with the viewport edge
  // makes that sideways placement overflow and fail, so it falls through to
  // its plain vertical-below placement — using the *real* top/left/width,
  // so the popup still lands exactly under the search field with the
  // nubbin pointing up. (Recomputed fresh on each open/resize, not on every
  // render — PopupPanel treats a new anchorRect identity as "reposition
  // now", so a value that changed every render would loop forever.)
  //
  // This effect only ever *measures*; it never clears. Clearing on close was
  // previously a `setAnchorRect(null)` early return here, which is a setState
  // in an effect for a value that is simply derived — the rect is meaningless
  // while the dropdown is shut, so the render passes null instead (see
  // `effectiveAnchorRect`), leaving this effect the one job that genuinely
  // needs a subscription: tracking resize.
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

  // A stale rect from the previous open must never reach PopupPanel — it
  // treats a new anchorRect identity as "reposition now".
  const effectiveAnchorRect = showDropdown ? anchorRect : null;

  const launch = (app: DesktopApp) => {
    onLaunch(app.id, app.name);
    updateQuery('');
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      updateQuery('');
      setOpen(false);
      e.currentTarget.blur();
      return;
    }
    if (!results.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      launch(results[activeIndex] ?? results[0]);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
        <Search size={18} style={{ opacity: 0.6, flexShrink: 0 }} />
        <Input
          placeholder="Search apps..."
          value={query}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            updateQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
            // PopupPanel auto-focuses its own panel once it finishes
            // positioning (so a plain context menu can be driven by
            // keyboard) — fine for a menu, but this is a live-search field,
            // so focus has to stay put or every keystroke after the first
            // stops reaching the input. Only fight the popup's own grab;
            // let any other blur (click elsewhere, Tab away) proceed.
            const next = e.relatedTarget as HTMLElement | null;
            if (next?.closest('.mochi-contextual-popup')) {
              e.target.focus();
            }
          }}
          style={{ width: '100%' }}
        />
      </div>

      <PopupPanel isOpen={showDropdown} onClose={() => setOpen(false)} anchorRect={effectiveAnchorRect}>
        <div style={{ width: 260, maxHeight: 320, overflowY: 'auto' }}>
          {results.length === 0 ? (
            <div
              style={{
                padding: '12px',
                fontSize: '0.8rem',
                color: 'var(--color-text-secondary)',
              }}
            >
              No apps found
            </div>
          ) : (
            results.map((app, idx) => {
              const isActive = idx === activeIndex;
              return (
                <div
                  key={app.id}
                  onMouseEnter={() => setActiveIndex(idx)}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <Item
                    title={app.name}
                    icon={<AppIcon app={app} size={18} />}
                    selected={isActive}
                    hoverable
                    variant="compact"
                    onClick={() => launch(app)}
                  />
                </div>
              );
            })
          )}
        </div>
      </PopupPanel>
    </div>
  );
};

export default DesktopSearch;

// Settings' adapted React islands: what draws a canvas (the SDK's DynamicWallpaper), a native
// range input that pyxis.Control cannot configure (no min/max/step), and the long time-zone
// list (hundreds of rows; a Duyo row is several nodes and every change re-renders every node).
import { Fragment, memo } from 'react';
import { Badge } from 'remochi';
import { DynamicWallpaper, WALLPAPERS, type WallpaperMotion } from '@pyxis/app-sdk';
import { BORDER, PRIMARY, SURFACE, fieldLabelStyle, secondaryText } from './styles';
import { formatMinutes } from './sunInfo';
import { zoneDetail, type ZoneOption } from './timezones';


/**
 * Props equal, ignoring callbacks. The props mapper makes a fresh callback each render, but each
 * one only forwards to the node (`node.doX(...)`), so a redraw of the whole Duyo tree (every
 * `set()` anywhere) need not redraw an island whose data did not change.
 */
const sameData = (a: object, b: object): boolean => {
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
  for (const key of keys) {
    if (typeof x[key] === 'function' && typeof y[key] === 'function') continue;
    if (!Object.is(x[key], y[key])) return false;
  }
  return true;
};

// ---------------------------------------------------------------------------
// Wallpaper thumbnails

interface GridProps {
  wallpaper: string;
  motion: WallpaperMotion;
  pinned: number | null;
  onPick: (id: string) => void;
}

export const WallpaperGrid = memo(function WallpaperGrid({ wallpaper, motion, pinned, onPick }: GridProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Wallpaper"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '10px' }}
    >
      {WALLPAPERS.map((wp) => {
        const isCurrent = wallpaper === wp.id;
        return (
          <button
            key={wp.id}
            type="button"
            role="radio"
            aria-checked={isCurrent}
            aria-label={`${wp.name} wallpaper`}
            data-wallpaper={wp.id}
            onClick={() => onPick(wp.id)}
            style={{
              borderRadius: '12px',
              overflow: 'hidden',
              cursor: 'pointer',
              padding: 0,
              background: SURFACE,
              border: `2px solid ${isCurrent ? PRIMARY : BORDER}`,
              transition: 'all 0.15s ease',
              textAlign: 'left',
              boxShadow: isCurrent ? '0 2px 8px rgba(47, 111, 237, 0.25)' : 'none',
              color: 'inherit',
            }}
          >
            <div style={{ position: 'relative', height: '64px', overflow: 'hidden', background: wp.css }}>
              {/* css: one WebGL context per preview would be too many; the large preview is the webgl one. */}
              <DynamicWallpaper
                wallpaper={wp.id}
                preview
                backend="css"
                motion={motion}
                time={wp.kind === 'daylight' ? (pinned ?? undefined) : undefined}
              />
            </div>
            <div
              style={{
                padding: '7px 10px',
                fontSize: '0.78rem',
                fontWeight: isCurrent ? 700 : 500,
                color: isCurrent ? PRIMARY : 'var(--color-text, #334155)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>{wp.name}</span>
              {isCurrent && <Badge content="Active" background={PRIMARY} color="#fff" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}, sameData);

// ---------------------------------------------------------------------------
// The large preview

interface PreviewProps {
  wallpaper: string;
  motion: WallpaperMotion;
  time: number | null;
  label: string;
  pill: string;
}

export const WallpaperPreview = memo(function WallpaperPreview({ wallpaper, motion, time, label, pill }: PreviewProps) {
  const selected = WALLPAPERS.find((w) => w.id === wallpaper) ?? WALLPAPERS[0];
  return (
    <div
      data-wallpaper-preview={selected.id}
      aria-label={label}
      role="img"
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        maxHeight: '300px',
        borderRadius: '12px',
        overflow: 'hidden',
        border: `1px solid ${BORDER}`,
        background: selected.css,
      }}
    >
      <DynamicWallpaper wallpaper={selected.id} preview backend="webgl" motion={motion} time={time ?? undefined} />
      {pill && (
        <div
          data-daylight-phase
          style={{
            position: 'absolute',
            left: '12px',
            bottom: '12px',
            padding: '5px 10px',
            borderRadius: '999px',
            background: 'rgba(15, 23, 42, 0.45)',
            color: '#fff',
            fontSize: '0.8rem',
            fontWeight: 600,
            backdropFilter: 'blur(6px)',
          }}
        >
          {pill}
        </div>
      )}
    </div>
  );
}, sameData);

// ---------------------------------------------------------------------------
// The time-of-day scrubber

interface ScrubberProps {
  shownMinutes: number;
  scrubbing: boolean;
  pinned: number | null;
  hour24: boolean;
  onScrub: (minutes: number | null) => void;
}

export const Scrubber = memo(function Scrubber({ shownMinutes, scrubbing, pinned, hour24, onScrub }: ScrubberProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <input
        type="range"
        min={0}
        max={1435}
        step={5}
        value={Math.min(1435, Math.round(shownMinutes / 5) * 5)}
        aria-label="Preview time of day"
        aria-valuetext={formatMinutes(shownMinutes, hour24)}
        data-daylight-scrubber
        onChange={(e) => onScrub(Number(e.target.value))}
        style={{ flex: 1, accentColor: '#2f6fed', cursor: 'pointer' }}
      />
      <button
        type="button"
        data-daylight-scrub-reset
        disabled={!scrubbing}
        onClick={() => onScrub(null)}
        style={{
          fontSize: '0.76rem',
          padding: '5px 10px',
          borderRadius: '8px',
          border: `1px solid ${BORDER}`,
          background: SURFACE,
          color: 'inherit',
          cursor: scrubbing ? 'pointer' : 'default',
          opacity: scrubbing ? 1 : 0.5,
          whiteSpace: 'nowrap',
        }}
      >
        {pinned === null ? 'Back to now' : 'Back to pinned'}
      </button>
    </div>
  );
}, sameData);

// ---------------------------------------------------------------------------
// The time-zone list

interface ZoneListProps {
  results: ZoneOption[];
  /** The list hasn't arrived. */
  loading: boolean;
  /** What to say when `results` is empty. */
  emptyText: string;
  /** Group by region (no query). */
  grouped: boolean;
  currentZone: string;
  pending: string | null;
  onChoose: (id: string) => void;
}

export const ZoneList = memo(function ZoneList({ results, loading, emptyText, grouped, currentZone, pending, onChoose }: ZoneListProps) {
  return (
    <div
      id="timezone-list"
      role="listbox"
      aria-label="Time zones"
      data-timezone-list
      style={{ maxHeight: '260px', overflowY: 'auto', border: `1px solid ${BORDER}`, borderRadius: '10px' }}
    >
      {loading && <div style={{ ...secondaryText, padding: '10px 12px' }}>Loading time zones…</div>}
      {!loading && results.length === 0 && <div style={{ ...secondaryText, padding: '10px 12px' }}>{emptyText}</div>}
      {results.map((option, index) => {
        const isCurrent = option.id === currentZone;
        const heading = grouped && option.region !== results[index - 1]?.region ? option.region : null;
        return (
          <Fragment key={option.id}>
            {heading && (
              <div
                role="presentation"
                style={{
                  ...fieldLabelStyle,
                  padding: '6px 12px 2px',
                  position: 'sticky',
                  top: 0,
                  background: SURFACE,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {heading}
              </div>
            )}
            <button
              type="button"
              role="option"
              aria-selected={isCurrent}
              data-timezone={option.id}
              disabled={pending !== null}
              onClick={() => onChoose(option.id)}
              style={{
                display: 'flex',
                width: '100%',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '7px 12px',
                border: 'none',
                borderLeft: `3px solid ${isCurrent ? PRIMARY : 'transparent'}`,
                background: isCurrent ? 'var(--mochi-primary-soft, rgba(47, 111, 237, 0.12))' : 'transparent',
                color: 'inherit',
                textAlign: 'left',
                cursor: pending ? 'progress' : 'pointer',
                font: 'inherit',
              }}
            >
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '0.84rem', fontWeight: isCurrent ? 700 : 500 }}>{option.city}</span>
                <span style={{ display: 'block', ...secondaryText }}>{zoneDetail(option)}</span>
              </span>
              <span style={{ ...secondaryText, whiteSpace: 'nowrap' }}>
                {pending === option.id ? 'Setting…' : isCurrent ? 'Current' : option.id}
              </span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}, sameData);


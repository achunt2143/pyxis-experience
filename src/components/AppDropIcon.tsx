import { Bell, Package, type LucideIcon } from 'lucide-react';
import { waterdrop } from '@pyxis/app-sdk';
import { useApps } from '../hooks/useApps';
import { appHue, getAppAccent } from '../apps/registry';
import { AppIcon } from './AppIcon';
import { VelaIcon } from './VelaIcon';

/**
 * An app as the drawer draws it: its glyph on a waterdrop filled with its
 * accent. No app (a notification a daemon or echo-cli raised) or an app
 * Bloom has no accent for gets a quiet tile in the material's ink, so it
 * never borrows another app's colour. `critical` draws it in the spinner's
 * red whatever the app.
 *
 * Self-contained (it reads the app list itself), so toasts, the
 * notification centre, search results and the launch bar's dashboard chips
 * can all use it, and the Duyo port can wrap it as it is.
 */
export function AppDropIcon({
  appId,
  size = 32,
  critical = false,
  fallback = Package,
}: {
  appId?: string | null;
  size?: number;
  critical?: boolean;
  /** Glyph for no app, or an app with no icon of its own. */
  fallback?: LucideIcon;
}) {
  const { apps } = useApps();
  const canonicalId = appId === 'browser-window' ? 'browser' : appId;
  const app = canonicalId ? apps.find((a) => a.id === canonicalId || a.id === appId) : undefined;
  const rawAccent = app?.accent ?? (canonicalId ? appHue(canonicalId) : undefined);
  const accent = canonicalId && rawAccent ? getAppAccent(canonicalId, rawAccent) : null;
  const glyph = Math.round(size * 0.53);

  const fill = critical
    ? { background: 'var(--px-spinner-red)', color: '#fff', boxShadow: 'inset 0 0 0 1px var(--px-spinner-red-outline)' }
    : accent
      ? {
          background: accent.bg,
          color: accent.iconColor,
          boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.26), inset 0 0 0 1px rgba(0, 0, 0, 0.14), 0 2px 6px ${accent.shadow}`,
        }
      : {
          background: 'color-mix(in srgb, var(--px-material-ink) 10%, transparent)',
          color: 'var(--px-material-ink)',
          boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--px-material-ink) 12%, transparent)',
        };

  return (
    <div
      aria-hidden="true"
      data-app-drop={canonicalId ?? ''}
      style={{
        width: size,
        height: size,
        borderRadius: waterdrop(size),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...fill,
      }}
    >
      {critical ? (
        <Bell size={glyph} />
      ) : (
        <AppIcon
          app={app}
          size={glyph}
          fallback={canonicalId === 'browser' ? VelaIcon : fallback}
        />
      )}
    </div>
  );
}

export default AppDropIcon;

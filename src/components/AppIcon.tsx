import React from 'react';
import { Package, type LucideIcon } from 'lucide-react';
import type { DesktopApp } from '../hooks/useApps';

interface AppIconProps {
  /**
   * Undefined when the caller has an app id Nova doesn't know — a real
   * case, not defensive padding: the dock shows windows, and Nova's
   * external-browser sessions ('browser-window') are windows with no
   * registry entry at all.
   */
  app?: Pick<DesktopApp, 'icon' | 'iconUrl' | 'name'>;
  size?: number;
  /** Glyph for an app with no icon of its own. */
  fallback?: LucideIcon;
}

/**
 * Draws an app's icon, whatever kind it has.
 *
 * Three tiers, in order: a built-in's Lucide glyph (crisp at every size and
 * theme-aware), the app's own artwork from its manifest (`pyxis://<id>/…`,
 * how a third-party app brands itself), and a generic package glyph as the
 * last resort — because an app Nova knows about must be launchable from the
 * desktop even if it shipped no icon at all. Before `useApps()`, an app not
 * in `PYXIS_APPS` had no icon *and* no entry, so it simply didn't exist.
 *
 * An <img> that fails to load falls back to the generic glyph rather than
 * leaving a broken-image box in the launcher.
 */
export function AppIcon({ app, size = 24, fallback = Package }: AppIconProps) {
  const [imgFailed, setImgFailed] = React.useState(false);

  if (app?.icon) {
    const Glyph = app.icon;
    return <Glyph size={size} />;
  }

  if (app?.iconUrl && !imgFailed) {
    return (
      <img
        src={app.iconUrl}
        alt=""
        width={size}
        height={size}
        onError={() => setImgFailed(true)}
        style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
      />
    );
  }

  const Fallback = fallback;
  return <Fallback size={size} />;
}

export default AppIcon;

import React from 'react';
import { Package, type LucideIcon } from 'lucide-react';
import { useEcho } from '@pyxis/app-sdk';
import type { DesktopApp } from '../hooks/useApps';
import {
  getCachedAppIcon,
  isCrossOriginPyxisUrl,
  pyxisAppIdFromUrl,
  resolveAppIcon,
} from '../apps/registry';

interface AppIconProps {
  /**
   * Undefined when the caller has an app id Nova doesn't know — a real
   * case, not defensive padding: the dock shows windows, and Nova's
   * external-browser sessions are windows that may lack a registry entry
   * in older mocks.
   */
  app?: Pick<DesktopApp, 'icon' | 'iconUrl' | 'name'> & { id?: string };
  size?: number;
  /** Glyph for an app with no icon of its own. */
  fallback?: LucideIcon;
}

/**
 * Draws an app's icon, whatever kind it has.
 *
 * Three tiers, in order: a built-in's Lucide glyph (crisp at every size and
 * theme-aware), the app's own artwork from its manifest (`pyxis://<id>/…` or
 * a `nova.GetAppIcon` data URL when Gecko blocks cross-origin `pyxis://`), and
 * a generic package glyph as the last resort — because an app Nova knows about
 * must be launchable from the desktop even if it shipped no icon at all.
 *
 * An <img> that fails to load falls back to `echo.getAppIcon(app.id)` and
 * then the generic glyph rather than leaving a broken-image box in the launcher.
 */
export function AppIcon({ app, size = 24, fallback = Package }: AppIconProps) {
  const echo = useEcho();
  const iconUrl = app?.iconUrl;
  const appId = app?.id ?? pyxisAppIdFromUrl(iconUrl);
  const crossOriginPyxis = isCrossOriginPyxisUrl(iconUrl);
  const identityKey = `${appId ?? ''}|${iconUrl ?? ''}`;

  const [prevKey, setPrevKey] = React.useState(identityKey);
  const [imgFailed, setImgFailed] = React.useState(false);
  const [triedGetAppIcon, setTriedGetAppIcon] = React.useState(false);
  const [resolvedUrl, setResolvedUrl] = React.useState<string | null>(() =>
    appId ? getCachedAppIcon(appId, iconUrl) ?? null : null
  );

  if (prevKey !== identityKey) {
    setPrevKey(identityKey);
    setImgFailed(false);
    setTriedGetAppIcon(false);
    setResolvedUrl(appId ? getCachedAppIcon(appId, iconUrl) ?? null : null);
  }

  const latestKeyRef = React.useRef(identityKey);
  React.useEffect(() => {
    latestKeyRef.current = identityKey;
  }, [identityKey]);

  React.useEffect(() => {
    if (!app || app.icon || !iconUrl || !crossOriginPyxis || !appId) return;
    if (resolvedUrl || triedGetAppIcon) return;
    let cancelled = false;
    void resolveAppIcon(appId, iconUrl, echo.getAppIcon).then((dataUrl) => {
      if (cancelled || latestKeyRef.current !== identityKey) return;
      setTriedGetAppIcon(true);
      if (dataUrl) setResolvedUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [app, iconUrl, crossOriginPyxis, appId, resolvedUrl, triedGetAppIcon, identityKey, echo]);

  if (app?.icon) {
    const Glyph = app.icon;
    return <Glyph size={size} />;
  }

  const effectiveSrc = resolvedUrl ?? (!crossOriginPyxis ? iconUrl : undefined);

  if (effectiveSrc && !imgFailed) {
    return (
      <img
        src={effectiveSrc}
        alt=""
        width={size}
        height={size}
        onError={() => {
          if (resolvedUrl || triedGetAppIcon || !appId) {
            setImgFailed(true);
            return;
          }
          const keyAtError = identityKey;
          setTriedGetAppIcon(true);
          void resolveAppIcon(appId, iconUrl, echo.getAppIcon).then((dataUrl) => {
            if (latestKeyRef.current !== keyAtError) return;
            if (dataUrl) {
              setResolvedUrl(dataUrl);
            } else {
              setImgFailed(true);
            }
          });
        }}
        style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
      />
    );
  }

  const Fallback = fallback;
  return <Fallback size={size} />;
}

export default AppIcon;

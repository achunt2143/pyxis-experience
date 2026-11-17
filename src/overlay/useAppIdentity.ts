import React, { useEffect } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { Package, type LucideIcon } from 'lucide-react';
import { getAppIcon, setAppIdentity, useShellTint, type AppIdentity } from '@pyxis/app-sdk';
import { useApps, type DesktopApp } from '../hooks/useApps';
import {
  appHue,
  isCrossOriginPyxisUrl,
  pyxisAppIdFromUrl,
  resolveAppIcon,
} from '../apps/registry';

/**
 * Evo draws each app window's title bar: the app's waterdrop icon and name,
 * looked up by the window's trusted app id, on frosted glass with the app's
 * accent as its seam (evo/src/shell/identity.rs, frost.rs). Bloom knows the
 * names, accents and icons, so it sends them (`setAppIdentity`) whenever the
 * app list or the theme changes, with the shell's material for each theme
 * (the flat bar Evo falls back to when it has nothing to frost). The icon is drawn as the drawer draws it, accent fill, white
 * glyph, waterdrop corner, rasterized to a 40 px PNG on a canvas.
 */

/** The icon's size, px, and its corners (top-left, top-right, bottom-right, bottom-left). */
export const ICON_SIZE = 40;
export const ICON_CORNERS: [number, number, number, number] = [12, 3, 12, 12];
const GLYPH_SIZE = 24;
const GLYPH_STROKE = 2.4;
/** The fill for an app Bloom has no accent for. */
const NEUTRAL_FILL = '#64748b';

/** Every app's name and accent, as Evo's table (icons added separately). */
export function identityEntries(
  apps: Pick<DesktopApp, 'id' | 'name' | 'accent'>[],
  hueFor: (appId: string) => string | undefined = appHue
): AppIdentity[] {
  return apps.map((app) => {
    const accent = app.accent ?? hueFor(app.id);
    return accent ? { appId: app.id, name: app.name, accent } : { appId: app.id, name: app.name };
  });
}

/** A waterdrop: a rectangle with one corner (top right) nearly square. */
export function waterdropPath(ctx: CanvasRenderingContext2D, size: number, corners = ICON_CORNERS) {
  const [tl, tr, br, bl] = corners;
  ctx.beginPath();
  ctx.moveTo(tl, 0);
  ctx.lineTo(size - tr, 0);
  ctx.arcTo(size, 0, size, tr, tr);
  ctx.lineTo(size, size - br);
  ctx.arcTo(size, size, size - br, size, br);
  ctx.lineTo(bl, size);
  ctx.arcTo(0, size, 0, size - bl, bl);
  ctx.lineTo(0, tl);
  ctx.arcTo(0, 0, tl, 0, tl);
  ctx.closePath();
}

/** A Lucide glyph as standalone SVG markup, white. */
export function glyphSvg(Glyph: LucideIcon): string {
  const host = document.createElement('div');
  const root = createRoot(host);
  flushSync(() => {
    root.render(React.createElement(Glyph, { size: GLYPH_SIZE, color: '#ffffff', strokeWidth: GLYPH_STROKE }));
  });
  const svg = host.innerHTML;
  root.unmount();
  return svg;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`icon did not load: ${src.slice(0, 40)}`));
    img.src = src;
  });
}

/**
 * The app's waterdrop icon as a PNG data URL, or undefined when there is no
 * canvas (tests, a broken GL) or nothing could be drawn. An app's own artwork
 * from another origin taints the canvas; it then gets the generic glyph.
 */
export async function rasterizeAppIcon(
  app: Pick<DesktopApp, 'icon' | 'iconUrl'> & { id?: string },
  fill: string
): Promise<string | undefined> {
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext('2d');
  } catch {
    return undefined;
  }
  if (!context) return undefined;
  const ctx = context;

  const draw = async (picture: () => Promise<HTMLImageElement>, inset: number) => {
    ctx.clearRect(0, 0, ICON_SIZE, ICON_SIZE);
    waterdropPath(ctx, ICON_SIZE);
    ctx.fillStyle = fill;
    ctx.fill();
    const img = await picture();
    ctx.drawImage(img, inset, inset, ICON_SIZE - 2 * inset, ICON_SIZE - 2 * inset);
    return canvas.toDataURL('image/png');
  };
  const svg = (glyph: LucideIcon) => () =>
    loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(glyphSvg(glyph))}`);
  const glyphInset = (ICON_SIZE - GLYPH_SIZE) / 2;

  try {
    if (app.icon) return await draw(svg(app.icon), glyphInset);
    if (app.iconUrl) {
      const appId = app.id ?? pyxisAppIdFromUrl(app.iconUrl);
      if (isCrossOriginPyxisUrl(app.iconUrl)) {
        const dataUrl = appId ? await resolveAppIcon(appId, app.iconUrl, getAppIcon) : null;
        if (dataUrl) {
          try {
            return await draw(() => loadImage(dataUrl), 6);
          } catch {
            // Fall through to generic glyph if dataUrl fails to draw.
          }
        }
      } else {
        try {
          return await draw(() => loadImage(app.iconUrl as string), 6);
        } catch {
          // Not loadable, or another origin's (a tainted canvas): try nova.GetAppIcon.
          const dataUrl = appId ? await resolveAppIcon(appId, app.iconUrl, getAppIcon) : null;
          if (dataUrl) {
            try {
              return await draw(() => loadImage(dataUrl), 6);
            } catch {
              // Fall through to generic glyph.
            }
          }
        }
      }
    }
    return await draw(svg(Package), glyphInset);
  } catch {
    return undefined;
  }
}

/** Icons already drawn, by app, glyph and fill: the table is resent often, icons rarely change. */
const iconCache = new Map<string, Promise<string | undefined>>();

function iconKey(app: Pick<DesktopApp, 'id' | 'icon' | 'iconUrl'>, fill: string): string {
  return `${app.id}|${app.icon?.displayName ?? ''}|${app.iconUrl ?? ''}|${fill}`;
}

/** Each app's identity with its icon, drawn once per app and fill. */
export async function buildIdentities(
  apps: DesktopApp[],
  hueFor: (appId: string) => string | undefined = appHue,
  rasterize: typeof rasterizeAppIcon = rasterizeAppIcon
): Promise<AppIdentity[]> {
  const entries = identityEntries(apps, hueFor);
  return Promise.all(
    entries.map(async (entry, i) => {
      const app = apps[i];
      const fill = entry.accent ?? NEUTRAL_FILL;
      const key = iconKey(app, fill);
      let icon = iconCache.get(key);
      if (!icon) {
        icon = rasterize(app, fill).then(
          (url) => {
            if (!url) iconCache.delete(key);
            return url;
          },
          () => {
            iconCache.delete(key);
            return undefined;
          }
        );
        iconCache.set(key, icon);
      }
      const url = await icon;
      return url ? { ...entry, icon: url } : entry;
    })
  );
}

/** Forget drawn icons (tests). */
export function __resetIconCache() {
  iconCache.clear();
}

/**
 * Send Evo the app table whenever the apps or the theme change. The overlay
 * runs this, once: it is the shell's window, and `windows:manage` is the
 * shell's.
 */
export function useAppIdentity(dark: boolean) {
  const { apps, loading } = useApps();
  // The tint is worked out from the wallpaper like the shell's own (and
  // written nowhere: the overlay's `useShellTint` owns the variables).
  const { light: materialLight, dark: materialDark } = useShellTint({ target: null }).titleMaterial;
  useEffect(() => {
    if (loading && apps.length === 0) return;
    let cancelled = false;
    void buildIdentities(apps).then((table) => {
      if (!cancelled) void setAppIdentity(table, dark, { light: materialLight, dark: materialDark });
    });
    return () => {
      cancelled = true;
    };
  }, [apps, loading, dark, materialLight, materialDark]);
}

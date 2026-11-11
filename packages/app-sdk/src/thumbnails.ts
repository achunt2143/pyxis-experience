/**
 * Live window thumbnails for the overview and the Alt+Tab switcher.
 *
 * A Bloom page can't speak Wayland, so it can't screencopy another window.
 * Evo draws each window itself, at card size, and hands the picture over as a
 * data URL: `org.geckoOS.evo GetWindowThumbnails`
 * (evo/src/shell/thumbnails.rs). The method name and reply fields mirror
 * evo/src/enhancements/echo_ipc.rs; src/hooks/__tests__/thumbnailContract.test.ts
 * reads them back out of that file.
 *
 * Needs `windows:manage`, which only the shell holds. In the dev server there
 * is no compositor: the EchoClient mock answers with placeholder pictures.
 */
import { echoClient } from './EchoClient';
import { EVO_IFACE } from './overlay';

export const THUMBNAIL_METHOD = 'GetWindowThumbnails';

/** Evo's default and its ceiling for width; the card is no bigger. */
export const THUMBNAIL_MAX_WIDTH = 480;
export const THUMBNAIL_MAX_HEIGHT = 300;

export interface WindowThumbnail {
  windowId: number;
  /** Pixels; the picture has the window's frame's aspect ratio. */
  width: number;
  height: number;
  /** `data:image/jpeg;base64,...` */
  data: string;
}

export interface GetThumbnailsOptions {
  /** Windows to draw; every app window when left out. */
  windowIds?: number[];
  maxWidth?: number;
  maxHeight?: number;
}

interface ThumbnailRow {
  window_id?: unknown;
  width?: unknown;
  height?: unknown;
  data?: unknown;
}

/** Parse Evo's reply, dropping rows that aren't a picture. */
export function parseThumbnails(reply: unknown): WindowThumbnail[] {
  const rows = (reply as { thumbnails?: ThumbnailRow[] } | undefined)?.thumbnails;
  if (!Array.isArray(rows)) return [];
  const out: WindowThumbnail[] = [];
  for (const r of rows) {
    if (
      typeof r?.window_id === 'number' &&
      typeof r.width === 'number' &&
      typeof r.height === 'number' &&
      typeof r.data === 'string' &&
      r.data.startsWith('data:image/')
    ) {
      out.push({ windowId: r.window_id, width: r.width, height: r.height, data: r.data });
    }
  }
  return out;
}

/**
 * One picture per window Evo could draw (a window with nothing on screen yet
 * is left out). Never rejects: with no Evo, or a vela without the bridge
 * entry, the answer is an empty list and the cards keep their icons.
 */
export async function getWindowThumbnails(options: GetThumbnailsOptions = {}): Promise<WindowThumbnail[]> {
  try {
    const args: Record<string, unknown> = {
      max_width: options.maxWidth ?? THUMBNAIL_MAX_WIDTH,
      max_height: options.maxHeight ?? THUMBNAIL_MAX_HEIGHT,
    };
    if (options.windowIds) args.window_ids = options.windowIds;
    return parseThumbnails(await echoClient.callMethod('evo', EVO_IFACE, THUMBNAIL_METHOD, args));
  } catch {
    return [];
  }
}

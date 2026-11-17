import { adapt, type PackEntry } from '@duyojs/duyo/react';
import type { ComponentType } from 'react';
import { DynamicWallpaper } from '../../wallpaper/DynamicWallpaper';

/**
 * `{ kind: 'pyxis.Wallpaper', wallpaper: 'daylight' }`: Duyo wrapper for `DynamicWallpaper`.
 * Uses the default `'wrap'` host (`position: relative; overflow: hidden`) so the inner
 * wallpaper fills its Duyo control bounds (`fit: true` or explicit dimensions) while
 * keeping `className`, `style`, `attributes`, `showing`, and `data-duyo-*`.
 */
export const wallpaperEntry: PackEntry = adapt({
  name: 'pyxis.Wallpaper',
  kind: 'pyxis.Control',
  component: DynamicWallpaper as unknown as ComponentType,
  hostStyle: { position: 'relative', overflow: 'hidden' },
  published: {
    wallpaper: 'daylight',
    preview: false,
    time: undefined,
    motion: undefined,
    animationMode: undefined,
    paused: false,
    backend: 'auto',
    fps: undefined,
    location: undefined,
    daySpeed: 1,
    flowSpeed: 1,
    logDetail: '',
  },
  props: (node) => ({
    wallpaper: node.get('wallpaper'),
    preview: node.get('preview'),
    time: node.get('time'),
    motion: node.get('motion'),
    animationMode: node.get('animationMode'),
    paused: node.get('paused'),
    backend: node.get('backend'),
    fps: node.get('fps'),
    location: node.get('location'),
    daySpeed: node.get('daySpeed'),
    flowSpeed: node.get('flowSpeed'),
    logDetail: (node.get('logDetail') as string) || undefined,
  }),
});

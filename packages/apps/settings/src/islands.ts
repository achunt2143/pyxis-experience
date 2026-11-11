// Settings' adapted kinds, collected into Settings' own pack (registerIsland.ts).
import type { ElementType } from 'react';
import { adapt } from '@duyojs/duyo/react';
import { Scrubber, WallpaperGrid, WallpaperPreview, ZoneList } from './IslandViews';
import { registerIsland } from './registerIsland';

type Props = Record<string, unknown>;

export const wallpaperGridEntry = adapt({
  name: 'Settings.WallpaperGrid',
  component: WallpaperGrid as unknown as ElementType,
  published: { wallpaper: 'daylight', motion: 'flow', pinned: null },
  events: { onPick: '' },
  props: (node): Props => ({
    wallpaper: node.get('wallpaper'),
    motion: node.get('motion'),
    pinned: node.get('pinned'),
    onPick: (id: string) => node['doPick']({ id }),
  }),

});

export const wallpaperPreviewEntry = adapt({
  name: 'Settings.WallpaperPreview',
  component: WallpaperPreview as unknown as ElementType,
  published: { wallpaper: 'daylight', motion: 'flow', time: null, label: '', pill: '' },
  props: (node): Props => ({
    wallpaper: node.get('wallpaper'),
    motion: node.get('motion'),
    time: node.get('time'),
    label: node.get('label'),
    pill: node.get('pill'),
  }),

});

export const scrubberEntry = adapt({
  name: 'Settings.Scrubber',
  component: Scrubber as unknown as ElementType,
  published: { shownMinutes: 0, scrubbing: false, pinned: null, hour24: false },
  events: { onScrub: '' },
  props: (node): Props => ({
    shownMinutes: node.get('shownMinutes'),
    scrubbing: node.get('scrubbing'),
    pinned: node.get('pinned'),
    hour24: node.get('hour24'),
    onScrub: (minutes: number | null) => node['doScrub']({ minutes }),
  }),

});

export const zoneListEntry = adapt({
  name: 'Settings.ZoneList',
  component: ZoneList as unknown as ElementType,
  published: { results: [], loading: true, emptyText: '', grouped: true, currentZone: '', pending: null },
  events: { onChoose: '' },
  props: (node): Props => ({
    results: node.get('results'),
    loading: node.get('loading'),
    emptyText: node.get('emptyText'),
    grouped: node.get('grouped'),
    currentZone: node.get('currentZone'),
    pending: node.get('pending'),
    onChoose: (id: string) => node['doChoose']({ id }),
  }),

});

for (const entry of [wallpaperGridEntry, wallpaperPreviewEntry, scrubberEntry, zoneListEntry]) registerIsland(entry);

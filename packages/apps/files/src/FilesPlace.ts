import { view } from '@duyojs/duyo';
import { createElement } from 'react';
import { Download, FileText, Film, HardDrive, Home, Image as ImageIcon, Monitor, Music } from 'lucide-react';
import spec from './FilesPlace.view.json';
import type { CodeBehind } from './FilesPlace.view.gen';
import type { Place } from './model';

/** A sidebar place: `item` is `Place & { system }`, `selected` is set by the sidebar. */
export type PlaceItem = Place & { system: boolean };

const ICONS = {
  home: Home,
  documents: FileText,
  downloads: Download,
  pictures: ImageIcon,
  music: Music,
  videos: Film,
  desktop: Monitor,
  root: HardDrive,
} as const;

/**
 * One remochi `Item`. Its `icon` is a React node (a tinted box round a glyph), which Duyo data
 * cannot express, so the code-behind builds it: a published property holds any value.
 */
export default view(spec, {
  create() {
    this.inherited();
    this.itemChanged();
  },

  itemChanged() {
    const place = this.item as PlaceItem | null;
    if (!place) return;
    this.$.item.setTitle(place.name);
    this.paint();
  },

  selectedChanged() {
    this.paint();
  },

  paint() {
    const place = this.item as PlaceItem | null;
    if (!place) return;
    const selected = this.selected as boolean;
    const key = `${place.id}:${selected}`;
    if (this._painted === key) return;
    this._painted = key;
    const Glyph = ICONS[place.id as keyof typeof ICONS] ?? FileText;
    const rest = place.system ? 'var(--mochi-text-muted)' : 'var(--mochi-primary)';
    this.$.item.setSelected(selected);
    this.$.item.setIcon(
      createElement(
        'div',
        {
          style: {
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: selected ? 'var(--mochi-primary)' : 'var(--mochi-hover)',
            color: selected ? 'var(--mochi-primary-text)' : rest,
            transition: 'all 0.15s ease',
          },
        },
        createElement(Glyph, { size: 16 })
      )
    );
  },
} satisfies CodeBehind);

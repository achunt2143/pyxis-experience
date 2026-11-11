import { adapt, createPack } from '@duyojs/duyo/react';
import type { ElementType } from 'react';
import { BookmarkRow, HistoryRow, SpeedDialTile, SuggestionRow } from './rows';

/**
 * The Browser's list rows as kinds (see rows.tsx for why they are React). Each is a
 * `pyxis.Row`, so a Repeater can set its `item`; the host (`className`, `style`, identity)
 * goes on the row's own root element.
 */
const row = (name: string, component: unknown, withRemove: boolean) =>
  adapt({
    name,
    kind: 'pyxis.Row',
    component: component as ElementType,
    host: 'props',
    events: { onOpenItem: '', ...(withRemove ? { onRemoveItem: '' } : {}) },
    props: (node) => {
      const item = node.get('item') as { id?: string; url?: string } | null;
      return {
        item,
        onOpen: () => node['doOpenItem']({ url: item?.url }),
        ...(withRemove ? { onRemove: () => node['doRemoveItem']({ id: item?.id }) } : {}),
      };
    },
  });

export const browserPack = createPack('browser', [
  row('Browser.Tile', SpeedDialTile, false),
  row('Browser.BookmarkRow', BookmarkRow, true),
  row('Browser.HistoryRow', HistoryRow, true),
  row('Browser.Suggestion', SuggestionRow, false),
]);

import { createPack } from '@duyojs/duyo/react';

import { controlBinding, controlKind } from './kinds/control';
import { iconEntry } from './kinds/icon';

export { registerIcons } from './kinds/icon';
import { repeaterBinding, repeaterKind, rowKind } from './kinds/repeater';
import type {} from './kinds/types'; // brings the KindTypes augmentation into any program that imports the pack

/**
 * The Pyxis kind pack: `pyxis.*`. It extends duyo.Control, so render it with `basePack`
 * (or any pack that binds duyo.Control) before it: `createRenderer([basePack, pyxisPack])`.
 *
 *  - `pyxis.Control`: `attributes`, a wider `tag`, DOM events (kinds/events.ts)
 *  - `pyxis.Row`: Control publishing `item`/`index`, a base for Repeater rows
 *  - `pyxis.Repeater`: keyed, reusing lists (kinds/repeater.ts)
 *  - `pyxis.Icon`: a lucide icon by name (kinds/icon.ts)
 */
export const pyxisPack = createPack('pyxis', [iconEntry], {
  kinds: [controlKind, rowKind, repeaterKind],
  bindings: {
    'pyxis.Control': controlBinding,
    'pyxis.Repeater': repeaterBinding,
  },
});

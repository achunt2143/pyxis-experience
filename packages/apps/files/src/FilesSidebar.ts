import { view, type Component } from '@duyojs/duyo';
import spec from './FilesSidebar.view.json';
import type { CodeBehind } from './FilesSidebar.view.gen';
import { PLACES, SYSTEM_PLACES, placeSelected } from './model';
import type { PlaceItem } from './FilesPlace';
import './FilesPlace';

/** The places panel. `folder` comes in (the current folder); `onPickPlace {path}` goes out. */
export default view(spec, {
  create() {
    this.inherited();
    this.$.favorites.setItems(PLACES.map((p): PlaceItem => ({ ...p, system: false })));
    this.$.storage.setItems(SYSTEM_PLACES.map((p): PlaceItem => ({ ...p, system: true })));
  },

  pickPlace(sender: Component) {
    this.doPickPlace({ path: (sender['item'] as PlaceItem).path });
    return true;
  },

  /** Raised for every row on every refresh: the highlight depends on the current path. */
  setupPlace(_sender, event) {
    const place = event['item'] as PlaceItem;
    event['component'].setSelected(placeSelected(place, this.folder as string, place.system));
    return true;
  },

  folderChanged() {
    this.$.favorites.refresh();
    this.$.storage.refresh();
  },
} satisfies CodeBehind);

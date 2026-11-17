import { view, type Component } from '@duyojs/duyo';
import spec from './FilesSidebar.view.json';
import type { CodeBehind } from './FilesSidebar.view.gen';
import { PLACES, SYSTEM_PLACES, formatBytes, placeSelected, type StorageSummary } from './model';
import type { PlaceItem } from './FilesPlace';
import './FilesPlace';

/** The places panel. `folder` and `storageInfo` come in; `onPickPlace {path}` and `onClosePlaces` go out. */
export default view(spec, {
  create() {
    this.inherited();
    this.$.favorites.setItems(PLACES.map((p): PlaceItem => ({ ...p, system: false })));
    this.$.storage.setItems(SYSTEM_PLACES.map((p): PlaceItem => ({ ...p, system: true })));
    this.storageInfoChanged();
  },

  rendered() {
    this.inherited();
    document
      .querySelector(`[data-duyo-id="${this.$.closePlaces.id}"] button`)
      ?.setAttribute('aria-label', 'Back to folder');
  },

  pickPlace(sender: Component) {
    this.doPickPlace({ path: (sender['item'] as PlaceItem).path });
    return true;
  },

  closePlaces() {
    this.doClosePlaces();
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

  storageInfoChanged() {
    const info = this.storageInfo as StorageSummary | null;
    const d = this.$;
    if (!info || info.total <= 0) {
      d.storageStatus.setContent('Unavailable');
      d.storageStatus.setStyle('font-size:0.75rem;color:var(--mochi-text-muted);font-weight:500');
      d.storageBar.setValue(0);
      d.storageBar.setShowing(false);
      d.storageDetail.setContent('');
      d.storageDetail.setShowing(false);
      return;
    }
    d.storageStatus.setContent(`${formatBytes(info.available)} free`);
    d.storageStatus.setStyle('font-size:0.75rem;color:var(--mochi-primary);font-weight:600');
    d.storageBar.setValue(info.pct);
    d.storageBar.setShowing(true);
    d.storageDetail.setContent(`${formatBytes(info.used)} / ${formatBytes(info.total)} (${info.pct}%)`);
    d.storageDetail.setShowing(true);
  },
} satisfies CodeBehind);

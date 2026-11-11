import { view, type Component, type ComponentEvent } from '@duyojs/duyo';
import type { PackageInfo } from '@pyxis/app-sdk';
import spec from './InstalledPane.view.json';
import { filterInstalled } from './model';
import type { CodeBehind } from './InstalledPane.view.gen';
import './InstalledRow';

/**
 * The installed-applications manager. The app pushes `packages` (the installed ones) and
 * `removing` (the package being removed, or null); the pane owns the search text and which
 * row is awaiting its "Confirm". It raises onLaunch / onRemove with `{ package }`.
 */
export default view(spec, {
  create() {
    this.inherited();
    this._search = '';
    this._confirming = null as string | null;
    this.draw();
  },

  searchInput(_sender, event) {
    this._search = String(event['value'] ?? '');
    this.draw();
    return true;
  },
  launchRow(_sender: Component, event: ComponentEvent) {
    this.doLaunch({ package: event['package'] });
    return true;
  },
  askRemove(_sender: Component, event: ComponentEvent) {
    this._confirming = event['package'];
    this.$.rows.refresh();
    return true;
  },
  cancelRemove() {
    this._confirming = null;
    this.$.rows.refresh();
    return true;
  },
  removeRow(_sender: Component, event: ComponentEvent) {
    this.doRemove({ package: event['package'] });
    return true;
  },
  /** Per-row state that is not the item. */
  setupRow(_sender, event) {
    const name = (event['item'] as PackageInfo).package;
    event['component'].setConfirming(this._confirming === name);
    event['component'].setRemoving(this.removing === name);
    return true;
  },

  packagesChanged() {
    this.draw();
  },
  removingChanged() {
    // The app finished removing: the confirmation closes with it.
    if (this.removing === null) this._confirming = null;
    this.$.rows.refresh();
  },

  draw() {
    const { rows, empty } = this.$;
    const shown = filterInstalled(this.packages as PackageInfo[], this._search as string);
    rows.setItems(shown);
    rows.refresh();
    empty.setShowing(shown.length === 0);
    empty.setContent(
      this._search ? 'No applications match your search query.' : 'No installed packages found in scan directories.',
    );
  },
} satisfies CodeBehind);

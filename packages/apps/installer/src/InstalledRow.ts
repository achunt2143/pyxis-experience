import { view } from '@duyojs/duyo';
import type { PackageInfo } from '@pyxis/app-sdk';
import spec from './InstalledRow.view.json';
import { formatSize } from './model';
import type { CodeBehind } from './InstalledRow.view.gen';

/**
 * One installed package. `item` is the PackageInfo; `confirming` (the remove button was
 * pressed once) and `removing` (the app is removing it) are pushed in by the list. The row
 * raises onLaunch / onAskRemove / onCancelRemove / onRemove with `{ package }`.
 */
export default view(spec, {
  create() {
    this.inherited();
    this.itemChanged();
    this.confirmingChanged();
  },

  itemChanged() {
    const pkg = this.item as PackageInfo | null;
    if (!pkg) return;
    const { letter, glyph, title, version, appType, meta } = this.$;
    letter.setShowing(Boolean(pkg.title));
    letter.setContent(pkg.title ? pkg.title.charAt(0).toUpperCase() : '');
    glyph.setShowing(!pkg.title);
    title.setContent(pkg.title ?? pkg.package);
    version.setContent(`v${pkg.installedVersion ?? pkg.version}`);
    appType.setShowing(Boolean(pkg.appType));
    appType.setContent(pkg.appType ?? '');
    meta.setContent(`${pkg.package} · ${formatSize(pkg.installedSize)} · ${pkg.architecture}`);
  },

  confirmingChanged() {
    this.$.confirmGroup.setShowing(this.confirming);
    this.$.trash.setShowing(!this.confirming);
  },

  removingChanged() {
    this.$.confirm.setDisabled(this.removing);
    this.$.confirmLabel.setContent(this.removing ? 'Removing…' : 'Confirm');
  },

  launch() {
    this.doLaunch({ package: this.item.package });
    return true;
  },
  askRemove() {
    this.doAskRemove({ package: this.item.package });
    return true;
  },
  cancelRemove() {
    this.doCancelRemove({ package: this.item.package });
    return true;
  },
  confirmRemove() {
    this.doRemove({ package: this.item.package });
    return true;
  },
} satisfies CodeBehind);

import { view } from '@duyojs/duyo';
import type { PackageInfo } from '@pyxis/app-sdk';
import spec from './PackageRow.view.json';
import type { CodeBehind } from './PackageRow.view.gen';

/** One available package in the chooser. `item` is the PackageInfo; `selected` is set by the list. */
export default view(spec, {
  create() {
    this.inherited();
    this.itemChanged();
  },

  itemChanged() {
    const pkg = this.item as PackageInfo | null;
    if (!pkg) return;
    const { title, version, description, arch, installed } = this.$;
    title.setContent(pkg.title ?? pkg.package);
    version.setContent(`v${pkg.version}`);
    description.setContent(pkg.description || pkg.package);
    arch.setContent(pkg.architecture);
    installed.setShowing(Boolean(pkg.installed));
    installed.setContent(`installed v${pkg.installedVersion ?? ''}`);
  },

  selectedChanged() {
    this.addRemoveClass('selected', this.selected);
  },
} satisfies CodeBehind);

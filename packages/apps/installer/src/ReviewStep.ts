import { view } from '@duyojs/duyo';
import type { PackageInfo } from '@pyxis/app-sdk';
import spec from './ReviewStep.view.json';
import { ENFORCED_PERMISSIONS, formatSize, type UpgradeKind } from './model';
import type { CodeBehind } from './ReviewStep.view.gen';
import './PermBadge';

export interface ReviewInfo {
  pkg: PackageInfo | null;
  upgradeKind: UpgradeKind | null;
}

/** Step 2: the selected package's details and requested permissions. The app pushes `info`. */
export default view(spec, {
  create() {
    this.inherited();
    this.infoChanged();
  },

  infoChanged() {
    const { pkg, upgradeKind } = this.info as Partial<ReviewInfo>;
    const $ = this.$;
    $.none.setShowing(!pkg);
    $.content.setShowing(Boolean(pkg));
    if (!pkg) return;

    $.letter.setShowing(Boolean(pkg.title));
    $.letter.setContent(pkg.title ? pkg.title.charAt(0).toUpperCase() : '');
    $.glyph.setShowing(!pkg.title);
    $.title.setContent(pkg.title ?? pkg.package);
    $.vendor.setContent(pkg.vendor ?? pkg.maintainer ?? 'Unknown vendor');
    $.version.setContent(`v${pkg.version}`);
    $.arch.setContent(pkg.architecture);
    $.appType.setShowing(Boolean(pkg.appType));
    $.appType.setContent(pkg.appType ?? '');
    $.size.setContent(formatSize(pkg.installedSize));

    $.identifier.setContent(pkg.package);
    $.versionStatus.setContent(
      upgradeKind ? `${pkg.version} (${upgradeKind} from ${pkg.installedVersion})` : pkg.version,
    );
    $.installedSize.setContent(formatSize(pkg.installedSize));
    $.architecture.setContent(pkg.architecture);
    $.source.setContent(pkg.path);

    const perms = pkg.requiredPermissions ?? [];
    $.noPerms.setShowing(perms.length === 0);
    $.perms.setShowing(perms.length > 0);
    $.perms.setItems(perms);
    $.permNote.setShowing(perms.some((p) => !ENFORCED_PERMISSIONS.has(p)));
    $.downgrade.setShowing(upgradeKind === 'downgrade');
  },
} satisfies CodeBehind);

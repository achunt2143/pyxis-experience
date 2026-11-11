import { view, type Component } from '@duyojs/duyo';
import type { PackageInfo } from '@pyxis/app-sdk';
import spec from './ChooseStep.view.json';
import { plural } from './model';
import type { CodeBehind } from './ChooseStep.view.gen';
import './PackageRow';

export interface ChooseInfo {
  packages: PackageInfo[];
  loading: boolean;
  error: string | null;
  selectedPath: string | null;
}

/** Step 1: the packages found. The app pushes `info`; the step raises onRescan and onPick {pkg}. */
export default view(spec, {
  create() {
    this.inherited();
    this.infoChanged();
  },

  rescanTap() {
    this.doRescan();
    return true;
  },
  pickRow(sender: Component) {
    this.doPick({ pkg: sender['item'] as PackageInfo });
    return true;
  },
  /** Per-row state that is not the item: which one is selected. */
  setupRow(_sender, event) {
    event['component'].setSelected(event['item'].path === (this.info as ChooseInfo).selectedPath);
    return true;
  },

  infoChanged() {
    const info = this.info as Partial<ChooseInfo>;
    const packages = info.packages ?? [];
    const loading = info.loading ?? true;
    const error = info.error ?? null;
    const { heading, rescan, spinner, errorRow, errorText, empty, list, rows } = this.$;
    heading.setContent(loading ? 'Scanning for packages…' : `${plural(packages.length, 'package')} found`);
    rescan.setDisabled(loading);
    spinner.setShowing(loading);
    errorRow.setShowing(Boolean(error));
    errorText.setContent(error ?? '');
    empty.setShowing(!loading && !error && packages.length === 0);
    list.setShowing(packages.length > 0);
    rows.setItems(packages);
    rows.refresh(); // selection moves without the items changing
  },
} satisfies CodeBehind);

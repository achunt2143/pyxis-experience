import { view, type Component } from '@duyojs/duyo';
import type { InstallerState, PackageInfo } from '@pyxis/app-sdk';
import { bindInstaller, registerIcons } from '@pyxis/app-sdk/duyo';
import { CircleCheck, Package, Play, RefreshCw, Search, ShieldAlert, Trash2, TriangleAlert } from 'lucide-react';
import spec from './InstallerApp.view.json';
import { launchApp } from './launch';
import { installedOf, upgradeKindOf } from './model';
import type { CodeBehind } from './InstallerApp.view.gen';
import './ChooseStep';
import './ReviewStep';
import './InstallStep';
import './DoneStep';
import './InstalledPane';
import './installer.css';

// Every icon the Installer's views name.
registerIcons({ CircleCheck, Package, Play, RefreshCw, Search, ShieldAlert, Trash2, TriangleAlert });

/** Same keys, same values (by identity per key): nothing to push. */
function same(a: Record<string, unknown> | undefined, b: Record<string, unknown>): boolean {
  if (!a) return false;
  const keys = Object.keys(b);
  return keys.length === Object.keys(a).length && keys.every((k) => a[k] === b[k]);
}

/**
 * App Installer: a package wizard (choose, review, install, done) and the installed-apps
 * manager. The installer state comes from the SDK's `bindInstaller` (the same Echo calls and
 * signals as `useInstaller`); this kind adds what is local to the window (the selection, the
 * mode, "launched", the package being removed) and pushes what each step shows into it.
 */
export default view(spec, {
  create() {
    this.inherited();
    this.setAttributes({ 'data-window-id': this.windowId });
    this._pushed = new Map<string, Record<string, unknown>>();
    this._installedFrom = null as PackageInfo[] | null;
    this._installed = [] as PackageInfo[];
    bindInstaller(this, 'installer'); // writes `installer`; installerChanged() syncs
    this.modeChanged();
    this.sync();
  },

  // ---- toolbar ----
  tapWizard() {
    this.setMode('wizard');
    return true;
  },
  tapInstalled() {
    this.setMode('installed');
    return true;
  },
  rescan() {
    void (this.installer as InstallerState | null)?.refresh();
    return true;
  },

  // ---- wizard ----
  /** Next is allowed from Choose and Review with a package picked, and from Install once done. */
  guardNext(_sender, event) {
    const index = event['index'] as number;
    const state = this.installer as InstallerState | null;
    if (index === 0 || index === 1) return this.selected === null;
    if (index === 2) return state?.progress.phase !== 'done';
    return false;
  },
  /** Arriving on the Install step starts the install, as that step's mounting used to. */
  wizardStepped(_sender, event) {
    if (event['step'] !== 2) return true;
    const pkg = this.selected as PackageInfo | null;
    const state = this.installer as InstallerState | null;
    if (pkg && state) void state.install(pkg, upgradeKindOf(pkg) === 'reinstall');
    return true;
  },
  closeApp() {
    this.doClose();
    return true;
  },
  pickPackage(_sender, event) {
    this.setSelected(event['pkg']);
    return true;
  },
  launchFromDone(_sender, event) {
    void launchApp(event['package'] as string).then((ok) => {
      if (ok && !this.destroyed) this.setLaunched(true);
    });
    return true;
  },
  startOver() {
    const state = this.installer as InstallerState | null;
    this.setSelected(null);
    this.setLaunched(false);
    state?.reset();
    void state?.refresh();
    return true;
  },

  // ---- installed apps ----
  launchInstalled(_sender, event) {
    void launchApp(event['package'] as string);
    return true;
  },
  removePackage(_sender, event) {
    const name = event['package'] as string;
    const state = this.installer as InstallerState | null;
    if (!state) return true;
    this.setRemoving(name);
    void state.remove(name).then(() => {
      if (this.destroyed) return;
      this.setRemoving(null);
      void (this.installer as InstallerState).refresh();
    });
    return true;
  },

  // ---- state in: each of these pushes to the steps ----
  installerChanged() {
    this.sync();
  },
  selectedChanged() {
    this.sync();
  },
  launchedChanged() {
    this.sync();
  },
  removingChanged() {
    this.sync();
  },
  modeChanged() {
    const installed = this.mode === 'installed';
    this.$.wizardBody.setShowing(!installed);
    this.$.installedBody.setShowing(installed);
    this.$.tabWizard.addRemoveClass('active', !installed);
    this.$.tabInstalled.addRemoveClass('active', installed);
  },

  /** Push to a step only what changed (progress signals touch the Install step alone). */
  push(name: string, info: Record<string, unknown>) {
    if (same(this._pushed.get(name), info)) return;
    this._pushed.set(name, info);
    (this.$ as unknown as Record<string, Component>)[name].set('info', info);
  },

  sync() {
    const state = this.installer as InstallerState | null;
    if (!state) return;
    const selected = this.selected as PackageInfo | null;
    const $ = this.$;
    this.push('choose', {
      packages: state.packages,
      loading: state.loading,
      error: state.error,
      selectedPath: selected?.path ?? null,
    });
    this.push('review', { pkg: selected, upgradeKind: upgradeKindOf(selected) });
    this.push('install', { pkg: selected, progress: state.progress, installError: state.installError });
    this.push('done', { result: state.result, launched: this.launched });

    if (this._installedFrom !== state.packages) {
      this._installedFrom = state.packages;
      this._installed = installedOf(state.packages);
    }
    $.installedPane.setPackages(this._installed);
    $.installedPane.setRemoving(this.removing);
    $.installedCount.setContent(String(this._installed.length));
    $.rescan.setDisabled(state.loading);
  },
} satisfies CodeBehind);

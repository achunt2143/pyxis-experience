import { view, type Component, type ComponentEvent } from '@duyojs/duyo';
import { launchApp, type InstallerState, type PackageInfo } from '@pyxis/app-sdk';
import { bindInstaller, onDestroy, registerIcons } from '@pyxis/app-sdk/duyo';
import { CircleCheck, Package, Play, RefreshCw, Search, ShieldAlert, Trash2, TriangleAlert } from 'lucide-react';
import spec from './InstallerApp.view.json';
import { installedOf, isInstallingPhase, upgradeKindOf } from './model';
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
    this._installing = false;
    this._wizardObserver = null as MutationObserver | null;
    onDestroy(this, () => {
      (this._wizardObserver as MutationObserver | null)?.disconnect();
      this._wizardObserver = null;
    });
    bindInstaller(this, 'installer'); // writes `installer`; installerChanged() syncs
    this.modeChanged();
    this.sync();
  },

  rendered() {
    this.inherited();
    this.syncWizardLock();
    const root = document.querySelector(`[data-duyo-id="${this.$.wizard.id}"]`);
    if (root && typeof MutationObserver !== 'undefined') {
      (this._wizardObserver as MutationObserver | null)?.disconnect();
      const observer = new MutationObserver(() => {
        if (!this.destroyed) this.syncWizardLock();
      });
      observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
      this._wizardObserver = observer;
    }
  },

  isInstallLocked(): boolean {
    const state = this.installer as InstallerState | null;
    return Boolean(this._installing || isInstallingPhase(state?.progress.phase));
  },

  syncWizardLock() {
    const locked = this.isInstallLocked();
    this.$.wizard.addRemoveClass('inst-wizard-locked', locked);
    const root = document.querySelector(`[data-duyo-id="${this.$.wizard.id}"]`);
    if (!root) return;
    const backBtn = [...root.querySelectorAll<HTMLButtonElement>('.mochi-wizard-actions-right button')].find(
      (b) => b.textContent?.replace(/[()]/g, '').trim() === 'Back',
    );
    if (backBtn && backBtn.disabled !== locked) {
      backBtn.disabled = locked;
    }
    for (const stepEl of root.querySelectorAll<HTMLElement>('.mochi-wizard-step')) {
      if (locked) {
        if (stepEl.getAttribute('aria-disabled') !== 'true') stepEl.setAttribute('aria-disabled', 'true');
      } else if (stepEl.hasAttribute('aria-disabled')) {
        stepEl.removeAttribute('aria-disabled');
      }
    }
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
    this.setInstalledError('');
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
  /** Arriving on the Install step starts the install; lock Back/jumps while active and reset when returning to Choose. */
  wizardStepped(_sender, event) {
    const step = event['step'] as number;
    const state = this.installer as InstallerState | null;
    if (this.isInstallLocked()) {
      if (step !== 2) {
        this.$.wizard.setStep(2);
        this.syncWizardLock();
      }
      return true;
    }
    if (step === 0) {
      state?.reset();
      this.setLaunched(false);
      this.setLaunching(false);
      this.setLaunchError('');
      void state?.refresh();
      return true;
    }
    if (step === 1 && state?.progress.phase === 'failed') {
      state.reset();
      return true;
    }
    if (step !== 2) return true;
    const pkg = this.selected as PackageInfo | null;
    if (pkg && state && state.progress.phase === 'idle') {
      void this.runInstall(pkg);
    }
    return true;
  },
  async runInstall(pkg: PackageInfo) {
    const state = this.installer as InstallerState | null;
    if (!state || this.isInstallLocked()) return;
    this._installing = true;
    this.sync();
    try {
      await state.install(pkg, upgradeKindOf(pkg) === 'reinstall');
    } finally {
      this._installing = false;
      if (!this.destroyed) this.sync();
    }
  },
  retryInstall() {
    const pkg = this.selected as PackageInfo | null;
    const state = this.installer as InstallerState | null;
    if (!pkg || !state || this.isInstallLocked()) return true;
    state.reset();
    void this.runInstall(pkg);
    return true;
  },
  closeApp() {
    this.doClose();
    return true;
  },
  pickPackage(_sender, event) {
    const state = this.installer as InstallerState | null;
    if (this.isInstallLocked()) return true;
    this.setSelected(event['pkg']);
    if (state && state.progress.phase !== 'idle') state.reset();
    this.setLaunched(false);
    this.setLaunching(false);
    this.setLaunchError('');
    return true;
  },
  async launchFromDone(_sender: Component, event: ComponentEvent) {
    if (this.launching || this.launched) return true;
    const pkgName = event['package'] as string;
    if (!pkgName) return true;
    this.setLaunchError('');
    this.setLaunching(true);
    try {
      const res = await launchApp(pkgName);
      if (this.destroyed) return true;
      if (res) {
        this.setLaunched(true);
      } else {
        this.setLaunchError(`Could not launch ${pkgName}.`);
      }
    } catch (err) {
      if (!this.destroyed) {
        this.setLaunchError(`Could not launch ${pkgName}: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      if (!this.destroyed) this.setLaunching(false);
    }
    return true;
  },
  startOver() {
    const state = this.installer as InstallerState | null;
    this.setSelected(null);
    this.setLaunched(false);
    this.setLaunching(false);
    this.setLaunchError('');
    this.$.wizard.setStep(0);
    state?.reset();
    void state?.refresh();
    return true;
  },

  // ---- installed apps ----
  async launchInstalled(_sender: Component, event: ComponentEvent) {
    const pkgName = event['package'] as string;
    if (!pkgName || this.launchingPackage !== null) return true;
    this.setInstalledError('');
    this.setLaunchingPackage(pkgName);
    try {
      const res = await launchApp(pkgName);
      if (this.destroyed) return true;
      if (!res) {
        this.setInstalledError(`Could not launch ${pkgName}.`);
      }
    } catch (err) {
      if (!this.destroyed) {
        this.setInstalledError(`Could not launch ${pkgName}: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      if (!this.destroyed) this.setLaunchingPackage(null);
    }
    return true;
  },
  async removePackage(_sender: Component, event: ComponentEvent) {
    if (this.removing !== null) return true;
    const name = event['package'] as string;
    const state = this.installer as InstallerState | null;
    if (!state || !name) return true;
    this.setInstalledError('');
    this.setRemoving(name);
    try {
      const ok = await state.remove(name);
      if (this.destroyed) return true;
      if (!ok) {
        this.setInstalledError(`Failed to remove ${name}.`);
      } else {
        await state.refresh();
      }
    } catch (err) {
      if (!this.destroyed) {
        this.setInstalledError(`Failed to remove ${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      if (!this.destroyed) this.setRemoving(null);
    }
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
  launchingChanged() {
    this.sync();
  },
  launchErrorChanged() {
    this.sync();
  },
  launchingPackageChanged() {
    this.sync();
  },
  removingChanged() {
    this.sync();
  },
  installedErrorChanged() {
    this.sync();
  },
  modeChanged() {
    const installed = this.mode === 'installed';
    if (!installed) this.setInstalledError('');
    this.$.rescan.setShowing(installed);
    this.$.wizardBody.setShowing(!installed);
    this.$.installedBody.setShowing(installed);
    this.$.installedPane.setActive(installed);
    this.$.tabWizard.addRemoveClass('active', !installed);
    this.$.tabInstalled.addRemoveClass('active', installed);
    this.$.tabWizard.setVariant(installed ? 'normal' : 'blue');
    this.$.tabInstalled.setVariant(installed ? 'blue' : 'normal');
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
    this.push('done', {
      result: state.result,
      launched: this.launched,
      launching: this.launching,
      launchError: this.launchError,
    });

    if (this._installedFrom !== state.packages) {
      this._installedFrom = state.packages;
      this._installed = installedOf(state.packages);
    }
    $.installedPane.setPackages(this._installed);
    $.installedPane.setRemoving(this.removing);
    $.installedPane.setLaunching(this.launchingPackage);
    $.installedPane.setError(this.installedError);
    $.installedCount.setContent(String(this._installed.length));
    $.rescan.setDisabled(state.loading);
    this.syncWizardLock();
  },
} satisfies CodeBehind);

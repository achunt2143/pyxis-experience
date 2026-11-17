/**
 * The installer state as a store, for Duyo code-behind: what `useInstaller()`
 * exposes (packages, loading, error, progress, result, installError and the
 * refresh/install/remove/reset actions), over the same Echo calls and signals,
 * with the same rule that a terminal phase is never overwritten by a late
 * progress signal. One store is shared by every `bindInstaller`; it lives
 * while at least one component is bound and is reset when the last unbinds.
 *
 * Not extracted from `useInstaller` (its state is per-hook React state with
 * per-mount `alive` guards); `binders.installer.test.tsx` runs both against
 * the same mock and compares.
 */
import { echoClient } from '../../EchoClient';
import {
  INSTALLER_IFACE,
  INSTALLER_SERVICE,
  INSTALLER_SIGNALS,
  type InstallPhase,
  type InstallProgress,
  type InstallResult,
  type InstallerState,
  type PackageInfo,
  installErrorText,
} from '../../useInstaller';
import { createStore } from './store';

const IDLE: InstallProgress = { phase: 'idle', message: '', package: null };

function errorOf(res: unknown): string | null {
  if (res && typeof res === 'object' && 'error' in res) {
    const e = (res as { error?: unknown }).error;
    return typeof e === 'string' ? installErrorText(e) : 'unknown error';
  }
  return null;
}

type Data = Omit<InstallerState, 'refresh' | 'install' | 'remove' | 'reset'>;

const INITIAL: Data = {
  packages: [],
  loading: true,
  error: null,
  progress: IDLE,
  result: null,
  installError: null,
};

export const installerStore = createStore<InstallerState>(
  () => ({ ...INITIAL, refresh: async () => {}, install: async () => null, remove: async () => false, reset: () => {} }),
  (control) => {
    let alive = true;
    let terminal = false;
    let data: Data = { ...INITIAL };
    const emit = () => control.set({ ...data, refresh, install, remove, reset });
    const patch = (p: Partial<Data>) => {
      if (!alive) return;
      data = { ...data, ...p };
      emit();
    };

    async function refresh(): Promise<void> {
      patch({ loading: true, error: null });
      try {
        const res = (await echoClient.callMethod(INSTALLER_SERVICE, INSTALLER_IFACE, 'ListAvailable', {})) as
          | { packages?: PackageInfo[]; error?: string }
          | undefined;
        const err = errorOf(res);
        if (err) patch({ error: err });
        else patch({ packages: res?.packages ?? [] });
      } catch (e) {
        patch({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        patch({ loading: false });
      }
    }

    async function install(pkg: PackageInfo, force = false): Promise<InstallResult | null> {
      terminal = false;
      patch({
        installError: null,
        result: null,
        progress: { phase: 'verifying', message: 'Starting…', package: pkg.package },
      });
      try {
        const res = (await echoClient.callMethod(INSTALLER_SERVICE, INSTALLER_IFACE, 'Install', {
          packagePath: pkg.path,
          force,
        })) as (InstallResult & { error?: string }) | undefined;
        const err = errorOf(res);
        terminal = true;
        if (err || !res) {
          patch({
            installError: err ?? 'Installation failed',
            progress: { phase: 'failed', message: err ?? 'Installation failed', package: pkg.package },
          });
          return null;
        }
        patch({
          result: res,
          progress: {
            phase: 'done',
            message: `${res.title ?? res.package} ${res.version} installed`,
            package: res.package,
          },
          packages: data.packages.map((p) =>
            p.package === res.package ? { ...p, installed: true, installedVersion: res.version } : p,
          ),
        });
        return res;
      } catch (e) {
        const msg = installErrorText(e instanceof Error ? e.message : String(e));
        terminal = true;
        patch({ installError: msg, progress: { phase: 'failed', message: msg, package: pkg.package } });
        return null;
      }
    }

    async function remove(packageName: string): Promise<boolean> {
      patch({ error: null });
      try {
        const res = (await echoClient.callMethod(INSTALLER_SERVICE, INSTALLER_IFACE, 'Remove', {
          package: packageName,
        })) as { package?: string; error?: string } | undefined;
        const err = errorOf(res);
        if (err !== null || !res) {
          patch({ error: err && err.trim() ? err : 'Failed to remove package' });
          return false;
        }
        patch({
          error: null,
          packages: data.packages.map((p) =>
            p.package === packageName ? { ...p, installed: false, installedVersion: null } : p,
          ),
        });
        return true;
      } catch (e) {
        const msg = e instanceof Error && e.message.trim() ? e.message : 'Failed to remove package';
        patch({ error: msg });
        return false;
      }
    }

    function reset(): void {
      terminal = false;
      patch({ progress: IDLE, result: null, installError: null });
    }

    emit();
    void refresh();
    const unsubs = [
      echoClient.onSignal(INSTALLER_IFACE, INSTALLER_SIGNALS.progress, (d0) => {
        const d = (d0 ?? {}) as { phase?: string; message?: string; package?: string };
        if (terminal) return;
        patch({
          progress: {
            phase: (d.phase as InstallPhase) ?? 'installing',
            message: d.message ?? '',
            package: d.package ?? null,
          },
        });
      }),
      echoClient.onSignal(INSTALLER_IFACE, INSTALLER_SIGNALS.failed, (d0) => {
        const d = (d0 ?? {}) as { error?: string; package?: string };
        if (terminal) return;
        terminal = true;
        const msg = typeof d.error === 'string' && d.error.trim() ? d.error : 'Installation failed';
        patch({
          installError: data.installError ?? msg,
          progress: { phase: 'failed', message: msg, package: d.package ?? null },
        });
      }),
    ];
    return () => {
      alive = false;
      unsubs.forEach((u) => u());
    };
  },
);

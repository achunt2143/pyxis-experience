/**
 * useInstaller
 * ------------
 * React binding for the `org.geckoOS.installer` Echo service
 * (`echo/src/services/installer.rs`) — `.ipk` discovery, metadata, and
 * opkg-backed install/remove.
 *
 * The service reports twice on purpose: `Install` is awaited and returns
 * the terminal result, while `InstallProgress`/`InstallCompleted`/
 * `InstallFailed` signals carry live phase updates. This hook consumes
 * both — `progress` drives the UI while the call is in flight, and the
 * awaited result is what decides success, so a dropped signal can never
 * leave the wizard stuck on a spinner.
 *
 * Every mutation ends with the service refreshing Nova's registry, so a
 * successful install means the app is immediately launchable (`launchable`
 * on the result reflects whether Nova actually picked it up).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { echoClient } from './EchoClient';

export const INSTALLER_SERVICE = 'installer';
export const INSTALLER_IFACE = 'org.geckoOS.installer';
export const INSTALLER_SIGNALS = {
  started: 'InstallStarted',
  progress: 'InstallProgress',
  completed: 'InstallCompleted',
  failed: 'InstallFailed',
  removed: 'RemoveCompleted',
} as const;

/** One installable package, as reported by installer.rs's `PackageInfo`. */
export interface PackageInfo {
  path: string;
  package: string;
  version: string;
  architecture: string;
  description: string;
  maintainer: string;
  installedSize: number;
  title: string | null;
  vendor: string | null;
  appType: 'web' | 'native' | null;
  requiredPermissions: string[];
  installed: boolean;
  installedVersion: string | null;
  /** Detached signature: verified, absent, or present but wrong (advisory: the install re-checks a private copy). */
  signed?: boolean | 'bad';
}

export interface InstallResult {
  package: string;
  version: string;
  title: string | null;
  appType: string | null;
  registeredApps: number;
  launchable: boolean;
  log: string;
}

export type InstallPhase =
  | 'idle'
  | 'verifying'
  | 'installing'
  | 'registering'
  | 'done'
  | 'failed';

export interface InstallProgress {
  phase: InstallPhase;
  message: string;
  package: string | null;
}

export interface InstallerState {
  packages: PackageInfo[];
  loading: boolean;
  /** Discovery error (not install error) — e.g. the service is unreachable. */
  error: string | null;
  progress: InstallProgress;
  result: InstallResult | null;
  installError: string | null;
  refresh: () => Promise<void>;
  install: (pkg: PackageInfo, force?: boolean) => Promise<InstallResult | null>;
  remove: (packageName: string) => Promise<boolean>;
  reset: () => void;
}

const IDLE: InstallProgress = { phase: 'idle', message: '', package: null };

/**
 * The installer's refusal in words. A refused install comes back as JSON text
 * (`{"reason":"unsigned"|"bad-signature","error":…}`) inside the call's error,
 * because the service's errors carry no structured field.
 */
export function installErrorText(raw: string): string {
  const reason = /"reason"\s*:\s*"([a-z-]+)"/.exec(raw)?.[1];
  if (reason === 'unsigned') return 'This package is not signed by a trusted publisher, so it was not installed.';
  if (reason === 'bad-signature') return 'This package’s signature does not match. It may have been altered, so it was not installed.';
  // Held calls (installer, nova, network, accounts) wait for the root-access
  // dialog; these are the three ways that wait can end without a change.
  if (reason === 'denied') return 'Cancelled.';
  if (reason === 'timeout') return 'No answer in time, so nothing was changed.';
  if (reason === 'no-password') return 'Set a password in Settings → Users & Lock first.';
  return raw;
}

function errorOf(res: unknown): string | null {
  if (res && typeof res === 'object' && 'error' in res) {
    const e = (res as { error?: unknown }).error;
    return typeof e === 'string' ? installErrorText(e) : 'unknown error';
  }
  return null;
}

export function useInstaller(): InstallerState {
  const [packages, setPackages] = useState<PackageInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<InstallProgress>(IDLE);
  const [result, setResult] = useState<InstallResult | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);

  // Guards against setState after unmount — an install can outlive the
  // step that started it if the user closes the window mid-run.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /**
   * Set once a run reaches a terminal phase (done/failed), cleared when the
   * next run starts. Progress signals arriving after that point are ignored.
   *
   * Without this the terminal state is not stable: the awaited `Install`
   * response and the `InstallProgress` signals are independent deliveries
   * (the service spawns each signal onto the runtime, so a signal can land
   * after the response), and a late "registering" would overwrite "done" —
   * stranding any UI that gates on the terminal phase. The response is the
   * authority; signals only narrate progress up to it.
   */
  const terminal = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = (await echoClient.callMethod(
        INSTALLER_SERVICE,
        INSTALLER_IFACE,
        'ListAvailable',
        {}
      )) as { packages?: PackageInfo[]; error?: string } | undefined;
      const err = errorOf(res);
      if (err) {
        if (alive.current) setError(err);
        return;
      }
      if (alive.current) setPackages(res?.packages ?? []);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live phase updates while an install runs.
  useEffect(() => {
    const unsubs = [
      echoClient.onSignal(INSTALLER_IFACE, INSTALLER_SIGNALS.progress, (data) => {
        const d = (data ?? {}) as { phase?: string; message?: string; package?: string };
        if (!alive.current || terminal.current) return;
        setProgress({
          phase: (d.phase as InstallPhase) ?? 'installing',
          message: d.message ?? '',
          package: d.package ?? null,
        });
      }),
      echoClient.onSignal(INSTALLER_IFACE, INSTALLER_SIGNALS.failed, (data) => {
        const d = (data ?? {}) as { error?: string; package?: string };
        if (!alive.current || terminal.current) return;
        terminal.current = true;
        const msg = typeof d.error === 'string' && d.error.trim() ? d.error : 'Installation failed';
        setInstallError((prev) => prev ?? msg);
        setProgress({
          phase: 'failed',
          message: msg,
          package: d.package ?? null,
        });
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const install = useCallback(
    async (pkg: PackageInfo, force = false): Promise<InstallResult | null> => {
      setInstallError(null);
      setResult(null);
      terminal.current = false;
      setProgress({ phase: 'verifying', message: 'Starting…', package: pkg.package });
      try {
        const res = (await echoClient.callMethod(
          INSTALLER_SERVICE,
          INSTALLER_IFACE,
          'Install',
          { packagePath: pkg.path, force }
        )) as (InstallResult & { error?: string }) | undefined;

        const err = errorOf(res);
        if (err || !res) {
          terminal.current = true;
          if (alive.current) {
            setInstallError(err ?? 'Installation failed');
            setProgress({
              phase: 'failed',
              message: err ?? 'Installation failed',
              package: pkg.package,
            });
          }
          return null;
        }
        terminal.current = true;
        if (alive.current) {
          setResult(res);
          setProgress({
            phase: 'done',
            message: `${res.title ?? res.package} ${res.version} installed`,
            package: res.package,
          });
          // Reflect the new state in the package list without a round trip.
          setPackages((prev) =>
            prev.map((p) =>
              p.package === res.package
                ? { ...p, installed: true, installedVersion: res.version }
                : p
            )
          );
        }
        return res;
      } catch (e) {
        const msg = installErrorText(e instanceof Error ? e.message : String(e));
        terminal.current = true;
        if (alive.current) {
          setInstallError(msg);
          setProgress({ phase: 'failed', message: msg, package: pkg.package });
        }
        return null;
      }
    },
    []
  );

  const remove = useCallback(async (packageName: string): Promise<boolean> => {
    if (alive.current) setError(null);
    try {
      const res = (await echoClient.callMethod(
        INSTALLER_SERVICE,
        INSTALLER_IFACE,
        'Remove',
        { package: packageName }
      )) as { package?: string; error?: string } | undefined;
      const err = errorOf(res);
      if (err !== null || !res) {
        if (alive.current) setError(err && err.trim() ? err : 'Failed to remove package');
        return false;
      }
      if (alive.current) {
        setError(null);
        setPackages((prev) =>
          prev.map((p) =>
            p.package === packageName
              ? { ...p, installed: false, installedVersion: null }
              : p
          )
        );
      }
      return true;
    } catch (e) {
      const msg = e instanceof Error && e.message.trim() ? e.message : 'Failed to remove package';
      if (alive.current) setError(msg);
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    terminal.current = false;
    setProgress(IDLE);
    setResult(null);
    setInstallError(null);
  }, []);

  return useMemo(
    () => ({
      packages,
      loading,
      error,
      progress,
      result,
      installError,
      refresh,
      install,
      remove,
      reset,
    }),
    [packages, loading, error, progress, result, installError, refresh, install, remove, reset]
  );
}

export default useInstaller;

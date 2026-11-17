// Pure helpers for the Installer: no Duyo here, so they unit-test and every view can share them.
import type { InstallPhase, PackageInfo } from '@pyxis/app-sdk';

/** Ordered install phases, used to drive the progress bar. */
export const PHASE_ORDER: InstallPhase[] = ['verifying', 'installing', 'registering', 'done'];

export const PHASE_LABEL: Record<InstallPhase, string> = {
  idle: 'Ready',
  verifying: 'Verifying package',
  installing: 'Installing',
  registering: 'Registering with launcher',
  done: 'Installed',
  failed: 'Failed',
};

/** Permissions that grant real capability at the bridge today. */
export const ENFORCED_PERMISSIONS = new Set(['filesystem:read', 'filesystem:write', 'notifications']);

export function isInstallingPhase(phase: InstallPhase | undefined): boolean {
  return phase === 'verifying' || phase === 'installing' || phase === 'registering';
}

export function formatSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.\-+]/).map((n) => parseInt(n, 10) || 0);
  const pb = b.split(/[.\-+]/).map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export type UpgradeKind = 'upgrade' | 'downgrade' | 'reinstall';

/** What installing `selected` would do to the copy that is already there, or null if none. */
export function upgradeKindOf(selected: PackageInfo | null): UpgradeKind | null {
  if (!selected?.installed || !selected.installedVersion) return null;
  const cmp = compareVersions(selected.version, selected.installedVersion);
  if (cmp > 0) return 'upgrade';
  if (cmp < 0) return 'downgrade';
  return 'reinstall';
}

/** Progress bar fill for a phase: failed fills the bar (red), unknown phases are empty. */
export function phasePercent(phase: InstallPhase): number {
  if (phase === 'failed') return 100;
  const i = PHASE_ORDER.indexOf(phase);
  return i < 0 ? 0 : ((i + 1) / PHASE_ORDER.length) * 100;
}

export function installedOf(packages: PackageInfo[]): PackageInfo[] {
  return packages.filter((p) => p.installed || Boolean(p.installedVersion));
}

export function filterInstalled(installed: PackageInfo[], search: string): PackageInfo[] {
  const q = search.trim().toLowerCase();
  if (!q) return installed;
  return installed.filter(
    (p) =>
      (p.title && p.title.toLowerCase().includes(q)) ||
      p.package.toLowerCase().includes(q) ||
      (p.description && p.description.toLowerCase().includes(q)),
  );
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

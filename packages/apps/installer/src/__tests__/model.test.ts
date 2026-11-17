import { describe, expect, it } from 'vitest';
import type { PackageInfo } from '@pyxis/app-sdk';
import { ENFORCED_PERMISSIONS, compareVersions, filterInstalled, formatSize, installedOf, isInstallingPhase, phasePercent, upgradeKindOf } from '../model';

const pkg = (over: Partial<PackageInfo>): PackageInfo =>
  ({ path: '/tmp/a.ipk', package: 'a', version: '1.0.0', architecture: 'all', description: '', maintainer: '',
    installedSize: 0, title: null, vendor: null, appType: null, requiredPermissions: [], installed: false,
    installedVersion: null, ...over }) as PackageInfo;

describe('installer model', () => {
  it('formats sizes', () => {
    expect(formatSize(0)).toBe('—');
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(2048)).toBe('2.0 KB');
    expect(formatSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });
  it('compares versions', () => {
    expect(compareVersions('1.2.0', '1.10.0')).toBe(-1);
    expect(compareVersions('2.0', '2.0.0')).toBe(0);
  });
  it('classifies upgrades', () => {
    expect(upgradeKindOf(null)).toBeNull();
    expect(upgradeKindOf(pkg({}))).toBeNull();
    const base = { installed: true, installedVersion: '1.0.0' };
    expect(upgradeKindOf(pkg({ ...base, version: '1.1.0' }))).toBe('upgrade');
    expect(upgradeKindOf(pkg({ ...base, version: '0.9.0' }))).toBe('downgrade');
    expect(upgradeKindOf(pkg({ ...base }))).toBe('reinstall');
  });
  it('maps phases to bar fill', () => {
    expect(phasePercent('idle')).toBe(0);
    expect(phasePercent('verifying')).toBe(25);
    expect(phasePercent('done')).toBe(100);
    expect(phasePercent('failed')).toBe(100);
  });
  it('filters installed packages', () => {
    const list = installedOf([pkg({ installed: true }), pkg({ package: 'b', installedVersion: '1' }), pkg({ package: 'c' })]);
    expect(list.map((p) => p.package)).toEqual(['a', 'b']);
    expect(filterInstalled(list, ' B ').map((p) => p.package)).toEqual(['b']);
  });
  it('uses colon-delimited enforced permissions matching PyxisBridgeParent and tracks active install phases', () => {
    expect(ENFORCED_PERMISSIONS.has('filesystem:read')).toBe(true);
    expect(ENFORCED_PERMISSIONS.has('filesystem:write')).toBe(true);
    expect(ENFORCED_PERMISSIONS.has('notifications')).toBe(true);
    expect(ENFORCED_PERMISSIONS.has('filesystem.read')).toBe(false);
    expect(ENFORCED_PERMISSIONS.has('filesystem.write')).toBe(false);

    expect(isInstallingPhase('verifying')).toBe(true);
    expect(isInstallingPhase('installing')).toBe(true);
    expect(isInstallingPhase('registering')).toBe(true);
    expect(isInstallingPhase('idle')).toBe(false);
    expect(isInstallingPhase('done')).toBe(false);
    expect(isInstallingPhase('failed')).toBe(false);
  });
});

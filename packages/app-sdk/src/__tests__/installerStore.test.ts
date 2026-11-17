// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntime, defineKind, type Component } from '@duyojs/duyo';
import { echoClient } from '../EchoClient';
import { INSTALLER_IFACE, INSTALLER_SIGNALS, type InstallerState, type PackageInfo } from '../useInstaller';
import { bindInstaller } from '../duyo/binders';

defineKind({
  name: 'InstallerStoreTest.Host',
  kind: 'duyo.Component',
  published: { installer: null },
});

const pkg: PackageInfo = {
  path: '/tmp/weather_1.0.0_all.ipk',
  package: 'weather',
  version: '1.0.0',
  architecture: 'all',
  description: 'Weather',
  maintainer: 'Example',
  installedSize: 1000,
  title: 'Weather',
  vendor: 'Example',
  appType: 'web',
  requiredPermissions: [],
  installed: true,
  installedVersion: '1.0.0',
};

describe('installerStore error and InstallFailed handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets state.error meaningfully on Remove failure', async () => {
    const runtime = createRuntime();
    const c: Component = runtime.create({ kind: 'InstallerStoreTest.Host' });
    vi.spyOn(echoClient, 'callMethod').mockImplementation(async (_svc, _iface, method) => {
      if (method === 'ListAvailable') return { packages: [pkg] };
      if (method === 'Remove') return { error: 'opkg database locked' };
      return {};
    });

    bindInstaller(c, 'installer');
    await vi.waitFor(() => expect((c.get('installer') as InstallerState).loading).toBe(false));

    const ok = await (c.get('installer') as InstallerState).remove('weather');
    expect(ok).toBe(false);
    expect((c.get('installer') as InstallerState).error).toBe('opkg database locked');

    vi.spyOn(echoClient, 'callMethod').mockRejectedValueOnce(new Error(''));
    const okEmpty = await (c.get('installer') as InstallerState).remove('weather');
    expect(okEmpty).toBe(false);
    expect((c.get('installer') as InstallerState).error).toBe('Failed to remove package');

    c.destroy();
    runtime.destroy();
  });

  it('populates state.installError on InstallFailed signal when missing', async () => {
    const runtime = createRuntime();
    const c: Component = runtime.create({ kind: 'InstallerStoreTest.Host' });
    vi.spyOn(echoClient, 'callMethod').mockResolvedValue({ packages: [pkg] });

    bindInstaller(c, 'installer');
    await vi.waitFor(() => expect((c.get('installer') as InstallerState).loading).toBe(false));

    await echoClient.emitSignal(INSTALLER_IFACE, INSTALLER_SIGNALS.failed, {
      package: 'weather',
      error: 'Checksum mismatch',
    });

    const state = c.get('installer') as InstallerState;
    expect(state.progress.phase).toBe('failed');
    expect(state.progress.message).toBe('Checksum mismatch');
    expect(state.installError).toBe('Checksum mismatch');

    c.destroy();
    runtime.destroy();
  });
});

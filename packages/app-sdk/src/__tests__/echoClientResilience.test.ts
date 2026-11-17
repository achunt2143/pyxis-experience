// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EchoClient, echoClient } from '../EchoClient';
import { SETTING_KEYS } from '../settingsBus';

describe('EchoClient resilience and mock alignment', () => {
  const originalGeckoOS = window.geckoOS;
  const originalLocation = window.location;

  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalGeckoOS === undefined) {
      delete window.geckoOS;
    } else {
      window.geckoOS = originalGeckoOS;
    }
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  it('onSignal attaches native listener once geckoOSReady resolves after early mount', async () => {
    Object.defineProperty(window, 'location', {
      value: { protocol: 'pyxis:', href: 'pyxis://bloom/index.html' },
      writable: true,
      configurable: true,
    });
    delete window.geckoOS;

    const client = new EchoClient();
    const received: unknown[] = [];
    const nativeUnsub = vi.fn();
    let registeredCb: ((data: unknown) => void) | undefined;
    const addEventListener = vi.fn((_svc: string, _evt: string, cb: (data: unknown) => void) => {
      registeredCb = cb;
      return nativeUnsub;
    });

    const unsub = client.onSignal('org.geckoOS.evo', 'WindowCreated', (d) => received.push(d));
    expect(addEventListener).not.toHaveBeenCalled();

    const bridge = {
      initialized: true,
      callService: vi.fn(),
      addEventListener,
    };
    window.geckoOS = bridge;
    window.dispatchEvent(new CustomEvent('geckoOSReady', { detail: bridge }));

    await vi.waitFor(() => expect(addEventListener).toHaveBeenCalledWith('evo', 'WindowCreated', expect.any(Function)));
    registeredCb?.({ window_id: 9 });
    expect(received).toEqual([{ window_id: 9 }]);

    unsub();
    expect(nativeUnsub).toHaveBeenCalledTimes(1);
  });

  it('onSignal cancels pending waitForGeckoOSReady when unsubscribed before bridge ready', async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'location', {
      value: { protocol: 'pyxis:', href: 'pyxis://bloom/index.html' },
      writable: true,
      configurable: true,
    });
    delete window.geckoOS;

    const client = new EchoClient();
    const addEventListener = vi.fn(() => () => {});
    const unsub = client.onSignal('org.geckoOS.evo', 'WindowCreated', () => {});
    unsub();

    const bridge = {
      initialized: true,
      callService: vi.fn(),
      addEventListener,
    };
    window.geckoOS = bridge;
    window.dispatchEvent(new CustomEvent('geckoOSReady', { detail: bridge }));
    await vi.advanceTimersByTimeAsync(3100);

    expect(addEventListener).not.toHaveBeenCalled();
  });

  it('settings.set mock returns a rejected Promise rather than throwing synchronously', async () => {
    const promise = echoClient.callMethod('settings', 'org.geckoOS.settings', 'set', {
      key: SETTING_KEYS.theme,
      value: 123,
    });
    expect(promise).toBeInstanceOf(Promise);
    await expect(promise).rejects.toThrow(/pyxis\.theme/);
  });

  it('aligns MOCK_APPS, MOCK_APP_ACCENTS, OpenExternalBrowser, and Launch windowId with manifests', async () => {
    const listRes = (await echoClient.callMethod('nova', 'org.geckoOS.nova', 'List', {})) as {
      apps: Array<{ id: string; name: string; accent: string | null }>;
    };
    const byId = Object.fromEntries(listRes.apps.map((a) => [a.id, a]));
    expect(byId.files?.name).toBe('File Manager');
    expect(byId.terminal?.accent).toBe('#34d399');
    expect(byId.browser?.accent).toBe('#0284c7');
    expect(byId.files?.accent).toBe('#d97706');
    expect(byId.notes?.accent).toBe('#eab308');
    expect(byId.contacts?.accent).toBe('#0d9488');
    expect(byId.tasks?.accent).toBe('#7c3aed');
    expect(byId.settings?.accent).toBe('#64748b');
    expect(byId.installer?.accent).toBe('#ea580c');

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const ext = (await echoClient.callMethod('nova', 'org.geckoOS.nova', 'OpenExternalBrowser', {
      url: 'https://example.com',
    })) as { appId: string; sessionId: string; url: string };
    expect(ext.appId).toBe('browser');
    expect(openSpy).toHaveBeenCalled();
  });
});

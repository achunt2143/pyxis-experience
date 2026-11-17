// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EVO_IFACE,
  NOVA_IFACE,
  authenticatePrivilege,
  echoClient,
  formatLocalDate,
  getAppIcon,
  launchApp,
  openExternalBrowser,
  parseLocalDate,
  saveAppData,
} from '../index';

describe('services native strictness, launch restore order, and getAppIcon', () => {
  const originalGeckoOS = window.geckoOS;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalGeckoOS === undefined) {
      delete window.geckoOS;
    } else {
      window.geckoOS = originalGeckoOS;
    }
  });

  it('launchApp uses callMethodStrict when native bridge is present and fails loudly on denial', async () => {
    const callService = vi.fn().mockRejectedValue(new Error('Capability denied: appManager:manage'));
    window.geckoOS = {
      initialized: true,
      callService,
      addEventListener: () => () => {},
    };

    await expect(launchApp('notes')).rejects.toThrow(/Capability denied/);
    expect(callService).toHaveBeenCalledWith('nova', 'Launch', { appId: 'notes', params: null });
  });

  it('openExternalBrowser uses callMethodStrict when native bridge is present', async () => {
    const callService = vi.fn().mockRejectedValue(new Error('Capability denied: browser'));
    window.geckoOS = {
      initialized: true,
      callService,
      addEventListener: () => () => {},
    };

    await expect(openExternalBrowser('https://example.com')).rejects.toThrow(/Capability denied/);
    expect(callService).toHaveBeenCalledWith('nova', 'OpenExternalBrowser', {
      url: 'https://example.com',
    });
  });

  it('launchApp issues RestoreWindow before FocusWindow when nova.Launch raises a windowId', async () => {
    const calls: Array<{ iface: string; method: string; args: Record<string, unknown> }> = [];
    vi.spyOn(echoClient, 'callMethod').mockImplementation(async (_svc, iface, method, args = {}) => {
      calls.push({ iface, method, args });
      if (iface === NOVA_IFACE && method === 'Launch') {
        return { sessionId: 'sess-1', appId: 'notes', raised: true, windowId: 42 };
      }
      return { success: true };
    });

    const res = await launchApp('notes');
    expect(res).toEqual({ sessionId: 'sess-1', appId: 'notes', raised: true, windowId: 42 });
    expect(calls.map((c) => `${c.iface}:${c.method}`)).toEqual([
      `${NOVA_IFACE}:Launch`,
      `${EVO_IFACE}:RestoreWindow`,
      `${EVO_IFACE}:FocusWindow`,
    ]);
    expect(calls[1]?.args).toEqual({ window_id: 42 });
    expect(calls[2]?.args).toEqual({ window_id: 42 });
  });

  it('launchApp falls back to nova.Focus if evo RestoreWindow/FocusWindow are denied', async () => {
    const calls: string[] = [];
    window.geckoOS = {
      initialized: true,
      callService: vi.fn(async (svc, method) => {
        calls.push(`${svc}:${method}`);
        if (svc === 'nova' && method === 'Launch') {
          return { sessionId: 'sess-2', appId: 'weather', raised: true, windowId: 17 };
        }
        if (svc === 'evo') {
          throw new Error('Capability denied: windows:manage');
        }
        return { appId: 'weather', sessionId: 'sess-2', windowId: 17 };
      }),
      addEventListener: () => () => {},
    };

    const res = await launchApp('weather');
    expect(res?.raised).toBe(true);
    expect(calls).toEqual(['nova:Launch', 'evo:RestoreWindow', 'evo:FocusWindow', 'nova:Focus']);
  });

  it('getAppIcon returns null in mock mode and decodes GetAppIcon responses cleanly', async () => {
    expect(await getAppIcon('weather')).toBeNull();

    const spy = vi.spyOn(echoClient, 'callMethod');
    spy.mockResolvedValueOnce({ dataUrl: 'data:image/png;base64,AAA' });
    expect(await getAppIcon('weather')).toBe('data:image/png;base64,AAA');

    spy.mockResolvedValueOnce({ data: 'BBB', mimeType: 'image/webp' });
    expect(await getAppIcon('weather')).toBe('data:image/webp;base64,BBB');

    spy.mockResolvedValueOnce({ error: 'not found' });
    expect(await getAppIcon('missing')).toBeNull();

    spy.mockRejectedValueOnce(new Error('ipc down'));
    expect(await getAppIcon('weather')).toBeNull();
  });
});

describe('privilege, appStorage, and localDate helpers', () => {
  const originalGeckoOS = window.geckoOS;

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalGeckoOS === undefined) {
      delete window.geckoOS;
    } else {
      window.geckoOS = originalGeckoOS;
    }
  });

  it('authenticatePrivilege says where to set a password when the account has none', async () => {
    vi.spyOn(echoClient, 'callMethodStrict').mockResolvedValueOnce({
      ok: false,
      granted: false,
      reason: 'no-password',
      error: 'set a password first',
    });
    const res = await authenticatePrivilege({ password: '', requestId: 'r1' });
    expect(res).toMatchObject({ ok: false, reason: 'no-password' });
    expect(res.ok ? '' : res.error).toContain('Settings');
  });

  it('authenticatePrivilege parses both snake_case and camelCase attemptsLeft / retryAtMs', async () => {
    const spy = vi.spyOn(echoClient, 'callMethodStrict');
    spy.mockResolvedValueOnce({
      ok: false,
      reason: 'wrong',
      error: 'Incorrect password',
      attemptsLeft: 3,
      retryAtMs: null,
    });
    expect(await authenticatePrivilege({ password: 'bad' })).toEqual({
      ok: false,
      reason: 'wrong',
      error: 'Incorrect password',
      attempts_left: 3,
      retry_at_ms: null,
    });

    spy.mockResolvedValueOnce({
      ok: false,
      reason: 'wait',
      error: 'Wait',
      attempts_left: 0,
      retry_at_ms: 999999,
    });
    expect(await authenticatePrivilege({ password: 'bad' })).toEqual({
      ok: false,
      reason: 'wait',
      error: 'Wait',
      attempts_left: 0,
      retry_at_ms: 999999,
    });
  });

  it('saveAppData returns boolean reliably for errors, false, undefined, and bytesWritten', async () => {
    const spy = vi.spyOn(echoClient, 'callMethod');
    spy.mockResolvedValueOnce({ bytesWritten: 10, path: '~/tasks.json' });
    expect(await saveAppData('tasks', { tasks: [] })).toBe(true);

    spy.mockResolvedValueOnce({ error: 'read-only' });
    expect(await saveAppData('tasks', { tasks: [] })).toBe(false);

    spy.mockResolvedValueOnce({ success: false });
    expect(await saveAppData('tasks', { tasks: [] })).toBe(false);

    spy.mockResolvedValueOnce(undefined);
    expect(await saveAppData('tasks', { tasks: [] })).toBe(false);

    window.geckoOS = {
      initialized: true,
      callService: vi.fn().mockRejectedValue(new Error('write denied')),
      addEventListener: () => () => {},
    };
    expect(await saveAppData('tasks', { tasks: [] })).toBe(false);
  });

  it('formatLocalDate and parseLocalDate round-trip in local time and reject invalid dates', () => {
    const localLateNight = new Date(2026, 10, 15, 23, 59, 59);
    expect(formatLocalDate(localLateNight)).toBe('2026-11-15');

    const parsed = parseLocalDate('2026-11-15');
    expect(parsed).not.toBeNull();
    expect(parsed!.getFullYear()).toBe(2026);
    expect(parsed!.getMonth()).toBe(10);
    expect(parsed!.getDate()).toBe(15);
    expect(parsed!.getHours()).toBe(0);
    expect(formatLocalDate(parsed!)).toBe('2026-11-15');

    expect(formatLocalDate(new Date('invalid'))).toBe('');
    expect(parseLocalDate('')).toBeNull();
    expect(parseLocalDate('2026-02-30')).toBeNull();
    expect(parseLocalDate('2026-13-01')).toBeNull();
    expect(parseLocalDate('not-a-date')).toBeNull();
  });
});

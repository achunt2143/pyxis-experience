import { afterEach, describe, expect, it, vi } from 'vitest';
import { getClockStrict, setTimezoneStrict } from '../strictTime';

afterEach(() => {
  delete window.geckoOS;
});

function fakeBridge(callService: (service: string, method: string, params?: Record<string, unknown>) => Promise<unknown>) {
  window.geckoOS = { initialized: true, callService: vi.fn(callService), addEventListener: () => () => {} };
  return window.geckoOS.callService as ReturnType<typeof vi.fn>;
}

describe('setTimezoneStrict on a device', () => {
  it('lets a bridge refusal through instead of answering from the mock', async () => {
    fakeBridge(async () => {
      throw new Error("Pyxis capability denied: app 'settings' called time.setTimezone");
    });
    await expect(setTimezoneStrict('Asia/Tokyo')).rejects.toThrow(/capability denied/);
  });

  it('lets the service’s own refusal through', async () => {
    fakeBridge(async () => ({ error: 'unknown time zone "Mars/Base" (not in zone1970.tab)' }));
    await expect(setTimezoneStrict('Mars/Base')).rejects.toThrow(/unknown time zone/);
  });

  it('returns what the service set', async () => {
    const call = fakeBridge(async () => ({ timezone: 'Asia/Tokyo', utc_offset_minutes: 540 }));
    await expect(setTimezoneStrict('Asia/Tokyo')).resolves.toEqual({ timezone: 'Asia/Tokyo', utc_offset_minutes: 540 });
    expect(call).toHaveBeenCalledWith('time', 'setTimezone', { timezone: 'Asia/Tokyo' });
  });
});

describe('getClockStrict on a device', () => {
  it('reads the service, and rejects rather than inventing a clock', async () => {
    fakeBridge(async () => ({ epoch_ms: 1, timezone: 'Asia/Tokyo', utc_offset_minutes: 540, abbreviation: 'JST', dst: false, next_transition_ms: null }));
    await expect(getClockStrict()).resolves.toMatchObject({ timezone: 'Asia/Tokyo' });
    fakeBridge(async () => {
      throw new Error('refused');
    });
    await expect(getClockStrict()).rejects.toThrow('refused');
  });
});

describe('with no bridge (the dev server)', () => {
  it('uses the SDK, whose mock is the time service', async () => {
    const set = await setTimezoneStrict('Asia/Tokyo');
    expect(set.timezone).toBe('Asia/Tokyo');
    expect((await getClockStrict()).timezone).toBe('Asia/Tokyo');
  });
});

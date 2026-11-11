import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  CLOCK_RESYNC_MS,
  clockAt,
  echoClient,
  formatClockTime,
  msUntilNextMinute,
  needsResync,
  resetClockForTests,
  setSetting,
  setTimezone,
  syncFrom,
  useClock,
  useLocation,
  wallClock,
  SETTING_KEYS,
  type EchoClock,
} from '@pyxis/app-sdk';
import { resetMockTime } from '../../../packages/app-sdk/src/timeMock';

/**
 * useClock's maths: Echo's instant plus Echo's offset, never the page's own
 * zone (vela caches the zone it started with); a tick on each minute
 * boundary; a re-sync every 10 minutes, at a DST transition, and on
 * TimezoneChanged.
 */

const at = (iso: string) => Date.parse(iso);

describe('clock maths', () => {
  it('applies the offset to the instant', () => {
    // 2026-03-08 09:59Z is 01:59 PST, a minute before clocks go forward.
    expect(wallClock(at('2026-03-08T09:59:00Z'), -480)).toMatchObject({
      year: 2026,
      month: 3,
      day: 8,
      hour: 1,
      minute: 59,
      weekday: 0,
      minutesOfDay: 119,
    });
    // Kathmandu, +05:45, across midnight.
    expect(wallClock(at('2026-11-09T20:00:30Z'), 345)).toMatchObject({
      day: 10,
      hour: 1,
      minute: 45,
      second: 30,
      minutesOfDay: 105.5,
    });
  });

  it('counts to the next whole minute', () => {
    expect(msUntilNextMinute(at('2026-11-09T20:00:30Z'))).toBe(30_000);
    expect(msUntilNextMinute(at('2026-11-09T20:00:59.999Z'))).toBe(1);
    expect(msUntilNextMinute(at('2026-11-09T20:01:00Z'))).toBe(60_000);
  });

  it('formats 12- and 24-hour times', () => {
    expect(formatClockTime({ hour: 0, minute: 5 }, false)).toBe('12:05 AM');
    expect(formatClockTime({ hour: 13, minute: 7 }, false)).toBe('01:07 PM');
    expect(formatClockTime({ hour: 12, minute: 0 }, false)).toBe('12:00 PM');
    expect(formatClockTime({ hour: 9, minute: 30 }, true)).toBe('09:30');
    expect(formatClockTime({ hour: 23, minute: 59 }, true)).toBe('23:59');
  });

  it("holds the drift against the page's clock, and knows when to re-sync", () => {
    const clock: EchoClock = {
      epoch_ms: at('2026-11-09T20:00:05Z'),
      timezone: 'America/Los_Angeles',
      utc_offset_minutes: -480,
      abbreviation: 'PST',
      dst: false,
      next_transition_ms: at('2027-03-14T10:00:00Z'),
    };
    // Sent at :00.000, answered at :00.200: Echo read its clock at :00.100.
    const sync = syncFrom(clock, at('2026-11-09T20:00:00Z'), at('2026-11-09T20:00:00.200Z'));
    expect(sync.skewMs).toBe(4_900);
    const state = clockAt(sync, at('2026-11-09T20:00:00.200Z') + 60_000);
    expect(state.epochMs).toBe(at('2026-11-09T20:01:05.100Z'));
    expect(state).toMatchObject({ hour: 12, minute: 1, timezone: 'America/Los_Angeles', synced: true });

    expect(needsResync(sync, sync.syncedAt + CLOCK_RESYNC_MS - 1)).toBe(false);
    expect(needsResync(sync, sync.syncedAt + CLOCK_RESYNC_MS)).toBe(true);
    const nearDst = { ...sync, syncedAt: at('2027-03-14T09:58:00Z') - sync.skewMs };
    expect(needsResync(nearDst, at('2027-03-14T10:00:00Z') - sync.skewMs - 1)).toBe(false);
    expect(needsResync(nearDst, at('2027-03-14T10:00:00Z') - sync.skewMs)).toBe(true);
  });
});

describe('useClock', () => {
  const flush = () => act(() => vi.advanceTimersByTimeAsync(0));
  const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
  let getClockCalls = 0;
  let realCall: typeof echoClient.callMethod;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(at('2026-11-09T20:00:30Z'));
    resetMockTime();
    resetClockForTests();
    getClockCalls = 0;
    realCall = echoClient.callMethod.bind(echoClient);
    vi.spyOn(echoClient, 'callMethod').mockImplementation((service, iface, method, args) => {
      if (method === 'getClock') getClockCalls++;
      return realCall(service, iface, method, args);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    resetMockTime();
  });

  it("shows Echo's zone, and ticks on the minute", async () => {
    await setTimezone('Asia/Kathmandu');
    const { result, unmount } = renderHook(() => useClock());
    await flush();
    expect(result.current).toMatchObject({
      synced: true,
      timezone: 'Asia/Kathmandu',
      utcOffsetMinutes: 345,
      day: 10,
      hour: 1,
      minute: 45,
    });

    await advance(29_999);
    expect(result.current.minute).toBe(45);
    await advance(1);
    expect(result.current.minute).toBe(46);
    await advance(60_000);
    expect(result.current.minute).toBe(47);
    unmount();
  });

  it("follows Echo's clock, not the page's", async () => {
    vi.mocked(echoClient.callMethod).mockImplementation(async (service, iface, method, args) => {
      const res = (await realCall(service, iface, method, args)) as EchoClock;
      // Echo is 75 s ahead of this page: 20:01:45 to its 20:00:30.
      return method === 'getClock' ? { ...res, epoch_ms: res.epoch_ms + 75_000 } : res;
    });
    const { result, unmount } = renderHook(() => useClock());
    await flush();
    expect(result.current.epochMs).toBe(Date.now() + 75_000);
    const minute = result.current.minute;
    // The tick lands on Echo's minute, 15 s away, not the page's (30 s).
    await advance(14_999);
    expect(result.current.minute).toBe(minute);
    await advance(1);
    expect(result.current.minute).toBe((minute + 1) % 60);
    expect(result.current.epochMs % 60_000).toBe(0);
    unmount();
  });

  it('re-syncs every 10 minutes, and at once on TimezoneChanged', async () => {
    await setTimezone('Europe/Paris');
    const a = renderHook(() => useClock());
    const b = renderHook(() => useClock());
    await flush();
    // Two readers, one call: the clock is shared.
    expect(getClockCalls).toBe(1);
    expect(a.result.current).toBe(b.result.current);

    await advance(9 * 60_000);
    expect(getClockCalls).toBe(1);
    // The first minute tick at least 10 minutes on.
    await advance(2 * 60_000);
    expect(getClockCalls).toBe(2);

    await act(async () => {
      await setTimezone('Asia/Tokyo');
    });
    await flush();
    expect(getClockCalls).toBe(3);
    expect(a.result.current).toMatchObject({ timezone: 'Asia/Tokyo', utcOffsetMinutes: 540 });
    a.unmount();
    b.unmount();
  });
});

describe('useLocation', () => {
  afterEach(() => resetMockTime());

  it('falls back to the zone, and follows the zone and the setting', async () => {
    await setTimezone('America/Los_Angeles');
    const { result, unmount } = renderHook(() => useLocation());
    await vi.waitFor(() => expect(result.current?.source).toBe('zone'));
    expect(result.current).toMatchObject({ label: 'Los Angeles', timezone: 'America/Los_Angeles' });
    expect(result.current!.lat).toBeCloseTo(34.05, 2);

    await act(async () => {
      await setTimezone('Europe/Berlin');
    });
    await vi.waitFor(() => expect(result.current?.label).toBe('Berlin'));

    await act(async () => {
      await setSetting(SETTING_KEYS.location, { lat: 48.85, lon: 2.35, label: 'Paris', source: 'manual' });
    });
    await vi.waitFor(() => expect(result.current?.source).toBe('manual'));
    expect(result.current).toMatchObject({ label: 'Paris', timezone: 'Europe/Berlin' });

    await act(async () => {
      await setSetting(SETTING_KEYS.location, null);
    });
    await vi.waitFor(() => expect(result.current?.source).toBe('zone'));
    unmount();
  });
});

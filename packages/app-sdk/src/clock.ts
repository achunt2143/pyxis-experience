/**
 * Time and place: the device's clock in its time zone, and where it is for
 * the sun.
 *
 * Both come from echo's `org.geckoOS.time` (echo/src/services/time.rs), never
 * from the page's `Date`/`Intl` zone: vela caches the zone it started with,
 * so after `setTimezone` a page's own offset is stale until it restarts. Echo
 * answers with the UTC instant and the zone's offset, and `useClock` builds
 * the wall clock from those. Bloom's top-bar clock and the Daylight wallpaper
 * both read `useClock`, so the clock and the sky always agree.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { echoClient } from './EchoClient';
import { onSettingChange, SETTING_KEYS } from './settingsBus';

export const TIME_IFACE = 'org.geckoOS.time';

export const TIME_SIGNALS = {
  /** `{ timezone, utc_offset_minutes }` */
  timezoneChanged: 'TimezoneChanged',
} as const;

/** `getClock`'s answer, as time.rs's `Clock` serializes it. */
export interface EchoClock {
  epoch_ms: number;
  timezone: string;
  utc_offset_minutes: number;
  /** "PST", "CEST", or numeric ("+0530") where the zone has no name. */
  abbreviation: string;
  dst: boolean;
  /** The zone's next change of offset, or null (UTC, zones without DST). */
  next_transition_ms: number | null;
}

/** One zone1970.tab row. */
export interface TimeZoneEntry {
  id: string;
  /** ISO 3166 codes, most populous first. */
  countries: string[];
  lat: number;
  lon: number;
}

/**
 * Where the device is for the sun. `manual`: the user set `pyxis.location`.
 * `zone`: the time zone's principal city. `none`: the zone has no place
 * (UTC), so lat, lon and label are null and the sun falls back to a fixed day.
 */
export interface DeviceLocation {
  lat: number | null;
  lon: number | null;
  label: string | null;
  source: 'manual' | 'zone' | 'none';
  timezone: string;
}

export interface TimezoneChange {
  timezone: string;
  utc_offset_minutes: number;
}

async function timeCall<T>(method: string, args: Record<string, unknown> = {}): Promise<T | undefined> {
  try {
    return (await echoClient.callMethod('time', TIME_IFACE, method, args)) as T | undefined;
  } catch {
    return undefined;
  }
}

/** null if there is no time service to ask. */
export async function getClock(): Promise<EchoClock | null> {
  const res = await timeCall<EchoClock>('getClock');
  return typeof res?.epoch_ms === 'number' && typeof res.utc_offset_minutes === 'number' ? res : null;
}

export async function listTimezones(): Promise<TimeZoneEntry[]> {
  return (await timeCall<{ timezones?: TimeZoneEntry[] }>('listTimezones'))?.timezones ?? [];
}

export async function getLocation(): Promise<DeviceLocation | null> {
  const res = await timeCall<DeviceLocation>('getLocation');
  return typeof res?.source === 'string' ? res : null;
}

/** Set the device's time zone (`settings:write`). Rejects with the service's
 *  reason for a zone it refuses. */
export async function setTimezone(timezone: string): Promise<TimezoneChange> {
  const res = (await echoClient.callMethod('time', TIME_IFACE, 'setTimezone', { timezone })) as
    | (Partial<TimezoneChange> & { error?: string })
    | undefined;
  if (typeof res?.timezone !== 'string' || typeof res.utc_offset_minutes !== 'number') {
    throw new Error(res?.error ?? `setTimezone(${timezone}) failed`);
  }
  return { timezone: res.timezone, utc_offset_minutes: res.utc_offset_minutes };
}

export function onTimezoneChanged(callback: (change: TimezoneChange) => void): () => void {
  return echoClient.onSignal(TIME_IFACE, TIME_SIGNALS.timezoneChanged, (data) => {
    const change = data as Partial<TimezoneChange> | undefined;
    if (typeof change?.timezone === 'string' && typeof change.utc_offset_minutes === 'number') {
      callback({ timezone: change.timezone, utc_offset_minutes: change.utc_offset_minutes });
    }
  });
}

// ---------------------------------------------------------------------------
// The maths, pure.

const MINUTE = 60_000;
/** How often the clock asks Echo again, against drift and missed signals. */
export const CLOCK_RESYNC_MS = 10 * MINUTE;

/** The wall clock in a zone. */
export interface WallClock {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
  /** 0-23 */
  hour: number;
  minute: number;
  second: number;
  /** 0 = Sunday */
  weekday: number;
  /** Minutes after local midnight, fractional (seconds included): what the
   *  sun maths and a pinned wallpaper time are expressed in. */
  minutesOfDay: number;
}

/** The wall clock `offsetMinutes` from UTC at the instant `epochMs`. */
export function wallClock(epochMs: number, offsetMinutes: number): WallClock {
  const d = new Date(epochMs + offsetMinutes * MINUTE);
  const hour = d.getUTCHours();
  const minute = d.getUTCMinutes();
  const second = d.getUTCSeconds();
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour,
    minute,
    second,
    weekday: d.getUTCDay(),
    minutesOfDay: hour * 60 + minute + (second + d.getUTCMilliseconds() / 1000) / 60,
  };
}

/** Until the next whole minute. Offsets are whole minutes, so a UTC minute
 *  boundary is a local one. Never 0: at a boundary, the next one. */
export function msUntilNextMinute(epochMs: number): number {
  return MINUTE - (((epochMs % MINUTE) + MINUTE) % MINUTE);
}

/** "14:05", or "02:05 PM". */
export function formatClockTime(clock: Pick<WallClock, 'hour' | 'minute'>, hour24: boolean): string {
  const mm = String(clock.minute).padStart(2, '0');
  if (hour24) return `${String(clock.hour).padStart(2, '0')}:${mm}`;
  const h12 = clock.hour % 12 === 0 ? 12 : clock.hour % 12;
  return `${String(h12).padStart(2, '0')}:${mm} ${clock.hour < 12 ? 'AM' : 'PM'}`;
}

/** What the clock knows from its last answer from Echo. */
export interface ClockSync {
  /** Echo's clock minus this page's `Date.now()`. */
  skewMs: number;
  timezone: string;
  utcOffsetMinutes: number;
  abbreviation: string;
  /** The UTC instant the offset stops being right, or null. */
  nextTransitionMs: number | null;
  /** This page's `Date.now()` when the answer came. */
  syncedAt: number;
  /** false until Echo has answered: the browser's own clock and zone. */
  synced: boolean;
}

/** A sync from Echo's answer to a call sent at `sentAt` and answered at
 *  `receivedAt` (both `Date.now()`): Echo read its clock half-way between. */
export function syncFrom(clock: EchoClock, sentAt: number, receivedAt: number): ClockSync {
  return {
    skewMs: clock.epoch_ms - Math.round((sentAt + receivedAt) / 2),
    timezone: clock.timezone,
    utcOffsetMinutes: clock.utc_offset_minutes,
    abbreviation: clock.abbreviation,
    nextTransitionMs: clock.next_transition_ms,
    syncedAt: receivedAt,
    synced: true,
  };
}

/** The stand-in until Echo answers: the page's own clock and zone. */
export function browserSync(now = Date.now()): ClockSync {
  let timezone = 'UTC';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    /* keep UTC */
  }
  return {
    skewMs: 0,
    timezone,
    utcOffsetMinutes: -new Date(now).getTimezoneOffset(),
    abbreviation: '',
    nextTransitionMs: null,
    syncedAt: now,
    synced: false,
  };
}

/** Whether it is time to ask Echo again: 10 minutes on, or the zone's offset
 *  has changed (a DST transition passed). */
export function needsResync(sync: ClockSync, localNow: number): boolean {
  if (localNow - sync.syncedAt >= CLOCK_RESYNC_MS) return true;
  return sync.nextTransitionMs !== null && localNow + sync.skewMs >= sync.nextTransitionMs;
}

/** What `useClock` returns. */
export interface ClockState extends WallClock {
  /** The true UTC instant, ms since the epoch (Echo's clock). Feed this to
   *  the sun maths, with the location. */
  epochMs: number;
  /** IANA id, e.g. "America/Los_Angeles". */
  timezone: string;
  utcOffsetMinutes: number;
  abbreviation: string;
  /** false until Echo has answered. */
  synced: boolean;
}

export function clockAt(sync: ClockSync, localNow: number): ClockState {
  const epochMs = localNow + sync.skewMs;
  return {
    ...wallClock(epochMs, sync.utcOffsetMinutes),
    epochMs,
    timezone: sync.timezone,
    utcOffsetMinutes: sync.utcOffsetMinutes,
    abbreviation: sync.abbreviation,
    synced: sync.synced,
  };
}

// ---------------------------------------------------------------------------
// One clock per document, shared by every useClock: one call to Echo, one
// timer, and every reader on the same minute.

let sync: ClockSync = browserSync();
let snapshot: ClockState = clockAt(sync, Date.now());
const listeners = new Set<() => void>();
let stopClock: (() => void) | null = null;

function publish() {
  snapshot = clockAt(sync, Date.now());
  listeners.forEach((l) => l());
}

function startClock(): () => void {
  let stopped = false;
  let tickTimer: ReturnType<typeof setTimeout> | undefined;

  // The next tick is on the next minute by Echo's clock, so it moves
  // whenever a sync changes the skew.
  const schedule = () => {
    clearTimeout(tickTimer);
    tickTimer = setTimeout(tick, msUntilNextMinute(Date.now() + sync.skewMs));
  };
  const tick = () => {
    if (needsResync(sync, Date.now())) void resync();
    publish();
    schedule();
  };

  let resyncSeq = 0;
  const resync = async () => {
    const seq = ++resyncSeq;
    const sentAt = Date.now();
    const clock = await getClock();
    // A newer resync was started (a TimezoneChanged mid-call): its answer wins.
    if (!clock || stopped || seq !== resyncSeq) return;
    sync = syncFrom(clock, sentAt, Date.now());
    publish();
    schedule();
  };

  const offZone = onTimezoneChanged((change) => {
    // Show the new zone at once; the resync brings its abbreviation and
    // next transition.
    sync = { ...sync, timezone: change.timezone, utcOffsetMinutes: change.utc_offset_minutes };
    publish();
    void resync();
  });
  schedule();
  void resync();

  return () => {
    stopped = true;
    clearTimeout(tickTimer);
    offZone();
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!stopClock) stopClock = startClock();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && stopClock) {
      stopClock();
      stopClock = null;
    }
  };
}

/**
 * The same clock as a store, for readers that can't call hooks (Duyo
 * code-behind, through `@pyxis/app-sdk/duyo`'s `bindClock`): one loop per
 * document whoever reads it.
 */
export const clockStore = {
  get: (): ClockState => snapshot,
  subscribe,
};

/** Forget what Echo said (tests). */
export function resetClockForTests(): void {
  sync = browserSync();
  snapshot = clockAt(sync, Date.now());
}

/**
 * The device's clock, live: Echo's UTC instant and the zone's offset, the
 * wall clock built from them. It changes on each minute boundary, when the
 * zone changes (TimezoneChanged), and when it re-syncs with Echo (every 10
 * minutes, and as a DST transition passes). Until Echo answers it is the
 * page's own clock (`synced: false`). Seconds are as of the last change, so
 * read `epochMs` from a frame loop for anything smoother than a minute.
 */
export function useClock(): ClockState {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

/**
 * Where the device is, for the sun: the `pyxis.location` setting, else the
 * time zone's city. null until the time service answers. Refreshed when the
 * zone changes and when `pyxis.location` does.
 */
export function useLocation(): DeviceLocation | null {
  const [location, setLocation] = useState<DeviceLocation | null>(null);

  useEffect(() => {
    let mounted = true;
    let seq = 0;
    const refresh = () => {
      const mine = ++seq;
      void getLocation().then((loc) => {
        if (mounted && mine === seq && loc) setLocation(loc);
      });
    };
    refresh();
    const offZone = onTimezoneChanged(refresh);
    const offSetting = onSettingChange((change) => {
      if (change.key === SETTING_KEYS.location) refresh();
    });
    return () => {
      mounted = false;
      offZone();
      offSetting();
    };
  }, []);

  return location;
}

/**
 * settingsBus
 * -----------
 * Read/write user settings through the real `org.geckoOS.settings` Echo
 * service (echo/src/services/settings.rs, a JSON file under
 * /var/lib/pyxis), and hear every change, wherever it was made.
 *
 * Echo signals `SettingChanged {key, value, previous, exists}` after every
 * write that changed a key. That signal is the path that works on a device:
 * the Settings app (`pyxis://settings`) and the shell (`pyxis://bloom`) are
 * different origins, so nothing same-origin can carry a change between them.
 * It needs a vela whose bridge lists `settings.SettingChanged`; on an older
 * vela the subscription is refused and the listener never fires.
 *
 * Two same-origin paths stay, for the dev server (one origin, no Echo) and
 * for a vela without the signal: a BroadcastChannel to sibling documents and
 * a CustomEvent for this one. A change made here therefore arrives up to
 * three times; `onSettingChange` reports it once.
 *
 * `pyxis.*` keys are checked by Echo against its schema (settingsSchema.ts
 * mirrors it): a bad value makes `setSetting` reject, and an absent key reads
 * as its default.
 */
import echoClient from './EchoClient';

const SETTINGS_SERVICE = 'settings';
export const SETTINGS_IFACE = 'org.geckoOS.settings';
export const SETTING_CHANGED_SIGNAL = 'SettingChanged';

const CHANNEL_NAME = 'pyxis-settings';
const LOCAL_EVENT = 'pyxis:setting-change';

/** How long the same key and value, heard again, counts as the same change. */
const DEDUPE_MS = 2000;

export interface SettingChange {
  key: string;
  /** What `get` now answers: the stored value, or the key's default after a delete. */
  value: unknown;
  /** What `get` answered before. Only Echo's signal carries it. */
  previous?: unknown;
  /** Whether a value is stored now (false after a delete). Only Echo's signal carries it. */
  exists?: boolean;
}

function channel(): BroadcastChannel | null {
  try {
    return new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
}

/**
 * The value `get` answers: the stored one, or for an absent `pyxis.*` key its
 * default. Null for an absent key with no default (an app's own key, or a
 * daemon too old to answer defaults).
 */
export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const res = (await echoClient.callMethod(SETTINGS_SERVICE, SETTINGS_IFACE, 'get', {
    key,
  })) as { value?: T; exists?: boolean } | undefined;
  return res && res.value !== undefined && res.value !== null ? (res.value as T) : null;
}

/** Store `value` under `key`. Rejects when Echo refuses it (a bad `pyxis.*` value). */
export async function setSetting(key: string, value: unknown): Promise<void> {
  await echoClient.callMethod(SETTINGS_SERVICE, SETTINGS_IFACE, 'set', {
    key,
    value,
  });
  const detail: SettingChange = { key, value };
  window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail }));
  const ch = channel();
  if (ch) {
    try {
      ch.postMessage(detail);
    } finally {
      ch.close();
    }
  }
}

/**
 * Subscribe to setting changes made anywhere: Echo's signal (any app, any
 * origin), sibling documents of this origin, and this document. Each change
 * is reported once: the same key and value heard again within a couple of
 * seconds, from another path, is dropped. Returns an unsubscribe function.
 */
export function onSettingChange(cb: (change: SettingChange) => void): () => void {
  const lastReported = new Map<string, { value: string; at: number }>();
  const report = (change: SettingChange | undefined) => {
    if (!change || typeof change.key !== 'string' || !change.key) return;
    const value = JSON.stringify(change.value ?? null);
    const now = Date.now();
    const last = lastReported.get(change.key);
    if (last && last.value === value && now - last.at < DEDUPE_MS) return;
    lastReported.set(change.key, { value, at: now });
    cb(change);
  };

  const onLocal = (e: Event) => report((e as CustomEvent<SettingChange>).detail);
  window.addEventListener(LOCAL_EVENT, onLocal);

  const ch = channel();
  const onRemote = (e: MessageEvent) => report(e.data as SettingChange);
  ch?.addEventListener('message', onRemote);

  let unsubSignal: (() => void) | undefined;
  try {
    unsubSignal = echoClient.onSignal(SETTINGS_IFACE, SETTING_CHANGED_SIGNAL, (data) =>
      report(data as SettingChange)
    );
  } catch {
    // No bridge to subscribe through: the same-origin paths still work.
  }

  return () => {
    window.removeEventListener(LOCAL_EVENT, onLocal);
    if (ch) {
      ch.removeEventListener('message', onRemote);
      ch.close();
    }
    unsubSignal?.();
  };
}

// Well-known setting keys shared between the shell and the Settings app.
export const SETTING_KEYS = {
  theme: 'pyxis.theme', // 'light' | 'dark' | 'auto' (auto follows the sun, see usePyxisTheme)
  wallpaper: 'pyxis.wallpaper', // wallpaper id, see wallpapers.ts; default 'daylight'
  wallpaperMotion: 'pyxis.wallpaper.motion', // 'flow' | 'still'
  wallpaperPinnedTime: 'pyxis.wallpaper.pinnedTime', // null | minutes after midnight, 0..1439
  location: 'pyxis.location', // null (from the time zone) | { lat, lon, label, source: 'zone' | 'manual' }
  clock24h: 'pyxis.clock24h', // boolean
  showBatteryPercent: 'pyxis.showBatteryPercent', // boolean, top-bar readout
  volume: 'pyxis.volume', // number 0..100
  brightness: 'pyxis.brightness', // number 0..100
  dnd: 'pyxis.dnd', // boolean
  animations: 'pyxis.animations', // 'full' | 'reduced' | 'off', see animations.ts
  launchBarPosition: 'pyxis.launchBar.position', // 'bottom' | 'left' (the rail), see Bloom's LaunchBar
  lockAfter: 'pyxis.lock.after', // null (never) | idle minutes 1..120, default 10
  lockOnSleep: 'pyxis.lock.onSleep', // boolean, lock before the device sleeps
  lockNotifications: 'pyxis.lock.notifications', // 'hidden' | 'count' | 'full', what the lock screen shows
  textScale: 'pyxis.accessibility.textScale', // integer 75..150 (%), default 100
  highContrast: 'pyxis.accessibility.highContrast', // boolean
  reduceTransparency: 'pyxis.accessibility.reduceTransparency', // boolean
  cursorSize: 'pyxis.accessibility.cursorSize', // 'default' | 'large' | 'xlarge'
} as const;

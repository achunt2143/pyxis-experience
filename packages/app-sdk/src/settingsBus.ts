/**
 * settingsBus
 * -----------
 * Read/write user settings through the real `org.geckoOS.settings` Echo
 * service (echo/src/services/settings.rs — a JSON file under
 * `~/.config/geckoos/settings.json`), and fan changes out to every other
 * Bloom document (the shell and each standalone app page run as separate
 * documents/processes, so a plain CustomEvent is not enough).
 *
 * Change propagation uses BroadcastChannel (same-origin, cross-document)
 * plus a same-document CustomEvent fallback. Both are best-effort: on a
 * `pyxis://` origin BroadcastChannel may be unavailable, in which case
 * settings still persist — other windows just pick the value up on next
 * launch instead of live.
 */
import echoClient from './EchoClient';

const SETTINGS_SERVICE = 'settings';
const SETTINGS_IFACE = 'org.geckoOS.settings';

const CHANNEL_NAME = 'pyxis-settings';
const LOCAL_EVENT = 'pyxis:setting-change';

export interface SettingChange {
  key: string;
  value: unknown;
}

function channel(): BroadcastChannel | null {
  try {
    return new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
}

export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const res = (await echoClient.callMethod(SETTINGS_SERVICE, SETTINGS_IFACE, 'get', {
    key,
  })) as { value?: T; exists?: boolean } | undefined;
  return res && res.exists !== false && res.value !== undefined && res.value !== null
    ? (res.value as T)
    : null;
}

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
 * Subscribe to setting changes from this document AND sibling documents
 * (other app windows / the shell). Returns an unsubscribe function.
 */
export function onSettingChange(cb: (change: SettingChange) => void): () => void {
  const onLocal = (e: Event) => {
    const ce = e as CustomEvent<SettingChange>;
    if (ce.detail?.key) cb(ce.detail);
  };
  window.addEventListener(LOCAL_EVENT, onLocal);

  const ch = channel();
  const onRemote = (e: MessageEvent) => {
    const data = e.data as SettingChange;
    if (data?.key) cb(data);
  };
  ch?.addEventListener('message', onRemote);

  return () => {
    window.removeEventListener(LOCAL_EVENT, onLocal);
    if (ch) {
      ch.removeEventListener('message', onRemote);
      ch.close();
    }
  };
}

// Well-known setting keys shared between the shell and the Settings app.
export const SETTING_KEYS = {
  theme: 'pyxis.theme', // 'light' | 'dark'
  wallpaper: 'pyxis.wallpaper', // wallpaper id, see wallpapers.ts
} as const;

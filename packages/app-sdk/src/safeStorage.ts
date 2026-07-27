/**
 * localStorage/sessionStorage throw synchronously on `pyxis://` origins —
 * Gecko's storage subsystem doesn't recognize the scheme as storage-eligible
 * (found via a real run: `NS_ERROR_FAILURE` from `localStorage.getItem`
 * at Bloom startup, crashing the whole app since it was uncaught at the
 * top of a component). Real support for this would mean teaching Gecko's
 * QuotaManager/Storage code about a brand-new scheme — genuine
 * core-Gecko-internals work, not something to take on for a first alpha.
 * These wrappers make storage failures degrade to "no persisted value"
 * instead of a crash, which is the right behavior anyway: a
 * desktop shell losing a wallpaper preference on restart is a cosmetic
 * regression, not a functional one.
 */
export function safeGetItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore — see file header */
  }
}

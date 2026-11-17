import { useEffect, useState } from 'react';
import { SETTINGS_IFACE, SETTING_KEYS, echoClient, onSettingChange, setIdleLock } from '@pyxis/app-sdk';

/** `pyxis.lock.after`'s default, minutes (Echo's schema; the SDK's copy is in settingsSchema.ts). */
const DEFAULT_LOCK_AFTER_MINUTES = 10;
const MAX_LOCK_AFTER_MINUTES = 120;

/**
 * The seconds Evo is told for a stored `pyxis.lock.after`: null (never) is 0,
 * a number of minutes (1..120) is that many times 60, and anything else is
 * not a lock time at all (undefined: leave what Evo has).
 */
export function idleLockSeconds(raw: unknown): number | undefined {
  if (raw === null) return 0;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 1) return undefined;
  return Math.round(Math.min(raw, MAX_LOCK_AFTER_MINUTES) * 60);
}

/**
 * Keep Evo's idle lock in step with `pyxis.lock.after`. Evo knows the last
 * input, so it locks when the machine has sat idle that long and no page need
 * be looking; the setting is the shell's to relay (`SetIdleLock {seconds}`,
 * 0 for never). `useSetting` can't carry this one, because it reads a stored
 * null as "use the fallback" and here null means never: so it reads the
 * setting itself, and sends nothing until it knows what the setting says
 * (sending 0 first would switch the idle lock off for a moment).
 */
export function useIdleLock(enabled: boolean) {
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;
    let heardChange = false;

    void (async () => {
      try {
        const res = (await echoClient.callMethod('settings', SETTINGS_IFACE, 'get', {
          key: SETTING_KEYS.lockAfter,
        })) as { value?: unknown; exists?: boolean } | undefined;
        // A daemon with no defaults answers an absent key with null: that is the default, not "never".
        const raw = res?.exists === false && (res.value === null || res.value === undefined)
          ? DEFAULT_LOCK_AFTER_MINUTES
          : res?.value;
        const read = raw === undefined ? undefined : idleLockSeconds(raw);
        if (mounted && !heardChange && read !== undefined) setSeconds(read);
      } catch {
        /* no settings service: leave Evo's own default */
      }
    })();

    const off = onSettingChange((change) => {
      if (change.key !== SETTING_KEYS.lockAfter) return;
      const read = idleLockSeconds(change.value);
      if (read === undefined) return;
      heardChange = true;
      setSeconds(read);
    });
    return () => {
      mounted = false;
      off();
    };
  }, [enabled]);

  useEffect(() => {
    if (enabled && seconds !== null) void setIdleLock(seconds);
  }, [enabled, seconds]);
}

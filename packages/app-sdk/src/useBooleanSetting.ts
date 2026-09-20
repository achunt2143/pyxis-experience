import { useEffect, useState } from 'react';
import { getSetting, onSettingChange } from './settingsBus';

/**
 * useBooleanSetting
 * -----------------
 * A boolean preference backed by the `org.geckoOS.settings` Echo service and
 * kept live across documents via the settings bus — the same contract as
 * `usePyxisTheme`, generalised, since every app runs as its own page and a
 * toggle in one window has to reach the others.
 *
 * Values are compared loosely on read: the settings service round-trips JSON,
 * but older values may have been stored as the strings "true"/"false".
 */
export function useBooleanSetting(key: string, defaultValue: boolean): boolean {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    let mounted = true;

    const coerce = (raw: unknown): boolean | undefined => {
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      return undefined;
    };

    getSetting<unknown>(key).then((saved) => {
      const parsed = coerce(saved);
      if (mounted && parsed !== undefined) setValue(parsed);
    });

    const unsub = onSettingChange((change) => {
      if (change.key !== key) return;
      const parsed = coerce(change.value);
      if (parsed !== undefined) setValue(parsed);
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, [key]);

  return value;
}

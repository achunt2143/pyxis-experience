import { useEffect, useState } from 'react';
import {
  getSetting,
  onSettingChange,
  SETTING_KEYS,
} from './settingsBus';

export type PyxisTheme = 'light' | 'dark';

/**
 * usePyxisTheme
 * -------------
 * The user's light/dark preference, backed by the `org.geckoOS.settings`
 * Echo service (key `pyxis.theme`) and kept live across documents via the
 * settings bus — every app runs as its own page/process, so this is how a
 * toggle in Settings reaches an already-open Notes window.
 */
export function usePyxisTheme(defaultTheme: PyxisTheme = 'light'): PyxisTheme {
  const [theme, setTheme] = useState<PyxisTheme>(defaultTheme);

  useEffect(() => {
    let mounted = true;
    getSetting<PyxisTheme>(SETTING_KEYS.theme).then((saved) => {
      if (mounted && (saved === 'light' || saved === 'dark')) setTheme(saved);
    });
    const unsub = onSettingChange(({ key, value }) => {
      if (key === SETTING_KEYS.theme && (value === 'light' || value === 'dark')) {
        setTheme(value);
      }
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  return theme;
}

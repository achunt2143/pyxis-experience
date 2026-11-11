import { asBoolean, useSetting } from './useSetting';

/**
 * useBooleanSetting
 * -----------------
 * A boolean preference, live across apps: `useSetting` with `asBoolean`
 * (which also takes the strings "true"/"false" older builds stored).
 */
export function useBooleanSetting(key: string, defaultValue: boolean): boolean {
  return useSetting(key, defaultValue, asBoolean);
}

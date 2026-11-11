/**
 * `useLocation` for a Duyo kind: the device's location into `property` (null until the time
 * service answers), refreshed when the zone changes and when `pyxis.location` does.
 * (SDK need: a `bindLocation` beside `bindClock`.)
 */
import type { Component } from '@duyojs/duyo';
import { SETTING_KEYS, getLocation, onSettingChange, onTimezoneChanged } from '@pyxis/app-sdk';
import { onDestroy } from '@pyxis/app-sdk/duyo';

export function bindLocation(component: Component, property: string): () => void {
  let live = true;
  let seq = 0;
  const refresh = () => {
    const mine = ++seq;
    void getLocation().then((loc) => {
      if (live && mine === seq && loc && !component.destroyed) component.set(property, loc);
    });
  };
  refresh();
  const offZone = onTimezoneChanged(refresh);
  const offSetting = onSettingChange((change) => {
    if (change.key === SETTING_KEYS.location) refresh();
  });
  const stop = () => {
    live = false;
    offZone();
    offSetting();
  };
  onDestroy(component, stop);
  return stop;
}

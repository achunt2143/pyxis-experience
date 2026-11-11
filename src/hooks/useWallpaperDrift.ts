import { useEffect, useState } from 'react';
import {
  EVO_IFACE,
  EVO_SHORTCUT_SIGNAL,
  EVO_SIGNALS,
  echoClient,
  type EvoShortcutPayload,
  type EvoWindowMinimizedPayload,
} from '@pyxis/app-sdk';

/** What moves the wallpaper: Evo's signals, reduced to three events. */
export type DriftEvent = 'show-desktop' | 'window-back' | 'window-opened';

/**
 * Whether the desktop is "shown" (Super+D has sent the windows away), as Evo
 * keeps it (`shell/minimize.rs`, Recede): a show desktop toggles it (the
 * second one brings the same windows back), and any window coming back by
 * other means (a dock restore, Rise) or a new one opening ends it.
 */
export function driftReducer(receded: boolean, event: DriftEvent): boolean {
  switch (event) {
    case 'show-desktop':
      return !receded;
    case 'window-back':
    case 'window-opened':
      return false;
  }
}

/**
 * Lumen's wallpaper drift: true while the windows are receded, which pushes
 * the wallpaper in a little (Desktop.tsx). Read from Evo's signals; needs
 * `windows:manage`, like the shortcut signal it rides on.
 */
export function useWallpaperDrift(): boolean {
  const [receded, setReceded] = useState(false);
  useEffect(() => {
    const step = (e: DriftEvent) => setReceded((r) => driftReducer(r, e));
    const offs = [
      echoClient.onSignal(EVO_IFACE, EVO_SHORTCUT_SIGNAL, (data) => {
        if ((data as EvoShortcutPayload | undefined)?.action === 'show-desktop') step('show-desktop');
      }),
      echoClient.onSignal(EVO_IFACE, EVO_SIGNALS.minimized, (data) => {
        if ((data as EvoWindowMinimizedPayload | undefined)?.minimized === false) step('window-back');
      }),
      echoClient.onSignal(EVO_IFACE, EVO_SIGNALS.created, () => step('window-opened')),
    ];
    return () => offs.forEach((off) => off());
  }, []);
  return receded;
}

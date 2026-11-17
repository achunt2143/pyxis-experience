import React, { useMemo } from 'react';
import 'remochi/css';
import './identity.css';
import { ThemeWrapper } from 'remochi';
import { appAccentTokens } from './identity';
import * as pyxisTheme from './usePyxisTheme';
import type { PyxisTheme } from './usePyxisTheme';

export type { PyxisTheme };

const usePyxisAnimationMode =
  'usePyxisAnimationMode' in pyxisTheme ? pyxisTheme.usePyxisAnimationMode : () => 'full' as const;
const usePyxisAccessibility =
  'usePyxisAccessibility' in pyxisTheme ? pyxisTheme.usePyxisAccessibility : () => undefined;

export interface AppShellProps {
  children: React.ReactNode;
  /** Used when no theme has been persisted yet (e.g. Terminal wants dark). */
  defaultTheme?: PyxisTheme;
  /** Optional `#rrggbb` per-app accent or built-in app id. */
  accent?: string;
}

/**
 * AppShell
 * --------
 * Common chrome for every standalone Pyxis app page: loads the remochi
 * global CSS bundle and Pyxis static identity tokens, and mounts the app
 * inside remochi's controlled ThemeWrapper synced to the user's persisted
 * theme (including `auto` dusk/dawn transitions) without remounting the tree.
 */
export const AppShell: React.FC<AppShellProps> = ({ children, defaultTheme, accent }) => {
  const theme = pyxisTheme.usePyxisTheme(defaultTheme ?? 'light');
  usePyxisAnimationMode();
  usePyxisAccessibility();
  const tokens = useMemo(() => appAccentTokens(accent, accent), [accent]);
  return (
    <ThemeWrapper theme={theme} tokens={tokens}>
      <div
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </ThemeWrapper>
  );
};

export default AppShell;

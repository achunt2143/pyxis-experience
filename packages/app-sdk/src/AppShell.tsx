import React from 'react';
import 'remochi/css';
import { ThemeWrapper } from 'remochi';
import { usePyxisTheme, type PyxisTheme } from './usePyxisTheme';

export type { PyxisTheme };

export interface AppShellProps {
  children: React.ReactNode;
  /** Used when no theme has been persisted yet (e.g. Terminal wants dark). */
  defaultTheme?: PyxisTheme;
}

/**
 * AppShell
 * --------
 * Common chrome for every standalone Pyxis app page: loads the remochi
 * global CSS bundle and mounts the app inside remochi's ThemeWrapper so all
 * components pick up the Mochi design language and the user's persisted
 * theme. ThemeWrapper only reads `defaultTheme` at mount, so it is keyed by
 * the live theme value to re-mount when the preference changes.
 */
export const AppShell: React.FC<AppShellProps> = ({ children, defaultTheme }) => {
  const theme = usePyxisTheme(defaultTheme ?? 'light');
  return (
    <ThemeWrapper key={theme} defaultTheme={theme}>
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

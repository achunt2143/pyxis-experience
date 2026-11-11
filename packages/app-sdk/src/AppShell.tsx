import React, { useEffect } from 'react';
import 'remochi/css';
import { ThemeWrapper, useTheme } from 'remochi';
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
 * theme. ThemeWrapper only reads `defaultTheme` at mount, so a later change
 * is steered from inside it (ThemeSync) rather than by re-mounting it: a
 * re-mount rebuilt the whole app, losing whatever was on screen, at every
 * theme change, and with `auto` that is twice a day without the user doing
 * anything.
 */
export const AppShell: React.FC<AppShellProps> = ({ children, defaultTheme }) => {
  const theme = usePyxisTheme(defaultTheme ?? 'light');
  return (
    <ThemeWrapper defaultTheme={theme}>
      <ThemeSync theme={theme} />
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

/** Brings ThemeWrapper's own theme in line with the user's preference. */
const ThemeSync: React.FC<{ theme: PyxisTheme }> = ({ theme }) => {
  const { theme: current, toggleTheme } = useTheme();
  useEffect(() => {
    if (current !== theme) toggleTheme();
  }, [current, theme, toggleTheme]);
  return null;
};

export default AppShell;

import { createTheme, type ThemeOptions } from '@mui/material/styles';

/**
 * MUI theme aligned to the remochi (Enyo Mochi) design language: mochi
 * blues, warm yellow accent, soft rounded corners, solid surfaces instead
 * of frosted glass. remochi's ThemeWrapper is the source of truth for CSS
 * variables; this theme only keeps the remaining MUI primitives visually
 * consistent with it.
 */

// Mirror of remochi's .mochi-theme-light / .mochi-theme-dark palettes.
const MOCHI = {
  light: {
    primary: '#4a8bc2',
    primaryHover: '#5b9dd9',
    secondary: '#ffb300',
    background: '#f5f5f5',
    surface: '#ffffff',
    textPrimary: '#1a1a1a',
    textSecondary: '#555555',
    border: 'rgba(0, 0, 0, 0.12)',
  },
  dark: {
    primary: '#5b9dd9',
    primaryHover: '#6ba5db',
    secondary: '#ffb300',
    background: '#1a1a1a',
    surface: '#2a2a2a',
    textPrimary: '#ffffff',
    textSecondary: '#999999',
    border: '#646464',
  },
};

const ELEVATION = '0px 2px 4px -1px rgba(0,0,0,0.2), 0px 4px 5px 0px rgba(0,0,0,0.14)';

const getThemeOptions = (mode: 'light' | 'dark'): ThemeOptions => {
  const c = MOCHI[mode];

  return {
    palette: {
      mode,
      primary: {
        main: c.primary,
        light: c.primaryHover,
        dark: mode === 'light' ? '#3a7bb2' : '#4a8bc2',
      },
      secondary: {
        main: c.secondary,
        light: '#ffd479',
        dark: '#e6a000',
      },
      background: {
        paper: c.surface,
      },
      text: {
        primary: c.textPrimary,
        secondary: c.textSecondary,
      },
      divider: c.border,
    },
    shape: {
      borderRadius: 12,
    },
    typography: {
      fontFamily: [
        'Prelude',
        'Lato',
        '-apple-system',
        'BlinkMacSystemFont',
        '"Segoe UI"',
        'Roboto',
        '"Helvetica Neue"',
        'Arial',
        'sans-serif',
      ].join(','),
      body1: {
        fontSize: '0.95rem',
        fontWeight: 400,
      },
      body2: {
        fontSize: '0.875rem',
        fontWeight: 400,
      },
    },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 10,
            transition: 'all 0.2s ease',
            '&:hover': {
              boxShadow: ELEVATION,
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            background: c.surface,
            border: `1px solid ${c.border}`,
            boxShadow: ELEVATION,
            backgroundImage: 'none',
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            transition: 'all 0.2s ease',
            '&:hover': {
              transform: 'scale(1.08)',
            },
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            background: c.surface,
            color: c.textPrimary,
            border: `1px solid ${c.border}`,
            boxShadow: ELEVATION,
            fontSize: '0.75rem',
          },
        },
      },
    },
  };
};

// Export both light and dark themes
export const lightTheme = createTheme(getThemeOptions('light'));
export const darkTheme = createTheme(getThemeOptions('dark'));

// Export default theme (light)
export const theme = lightTheme;

import { createTheme, type ThemeOptions } from '@mui/material/styles';

// Glass effect constants
const GLASS_LIGHT = {
  background: 'rgba(255, 255, 255, 0.2)',
  border: 'rgba(255, 255, 255, 0.3)',
  backdropFilter: 'blur(15px)',
};

const GLASS_DARK = {
  background: 'rgba(0, 0, 0, 0.3)',
  border: 'rgba(255, 255, 255, 0.3)',
  backdropFilter: 'blur(15px)',
};

// MUI elevation 4 shadow
const ELEVATION_4 = '0px 2px 4px -1px rgba(0,0,0,0.2), 0px 4px 5px 0px rgba(0,0,0,0.14), 0px 1px 10px 0px rgba(0,0,0,0.12)';

const getThemeOptions = (mode: 'light' | 'dark'): ThemeOptions => {
  const isLight = mode === 'light';
  const glass = isLight ? GLASS_LIGHT : GLASS_DARK;

  return {
    palette: {
      mode,
      primary: {
        main: '#2196F3',
        light: '#64B5F6',
        dark: '#1976D2',
      },
      secondary: {
        main: '#FF9800',
        light: '#FFB74D',
        dark: '#F57C00',
      },
      background: {
        default: isLight ? '#F5F5F5' : '#121212',
        paper: glass.background,
      },
      text: {
        primary: isLight ? 'rgba(0, 0, 0, 0.87)' : 'rgba(255, 255, 255, 0.87)',
        secondary: isLight ? 'rgba(0, 0, 0, 0.54)' : 'rgba(255, 255, 255, 0.60)',
      },
    },
    shape: {
      borderRadius: 16,
    },
    typography: {
      fontFamily: [
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
            fontWeight: 500,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              boxShadow: ELEVATION_4,
            },
          },
          contained: {
            background: isLight
              ? 'linear-gradient(135deg, #2196F3 0%, #1976D2 100%)'
              : 'linear-gradient(135deg, #1976D2 0%, #0D47A1 100%)',
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            background: glass.background,
            backdropFilter: glass.backdropFilter,
            border: `1px solid ${glass.border}`,
            boxShadow: ELEVATION_4,
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              transform: 'scale(1.1)',
              backgroundColor: glass.background,
            },
          },
        },
      },
      MuiInputBase: {
        styleOverrides: {
          root: {
            backgroundColor: glass.background,
            backdropFilter: glass.backdropFilter,
            borderRadius: '24px',
            border: `1px solid ${glass.border}`,
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            '&:hover': {
              backgroundColor: isLight
                ? 'rgba(255, 255, 255, 0.3)'
                : 'rgba(0, 0, 0, 0.4)',
              border: `1px solid ${isLight ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.4)'}`,
            },
            '&.Mui-focused': {
              backgroundColor: isLight
                ? 'rgba(255, 255, 255, 0.4)'
                : 'rgba(0, 0, 0, 0.5)',
              border: '1px solid rgba(33, 150, 243, 0.5)',
              boxShadow: '0 0 0 3px rgba(33, 150, 243, 0.1)',
            },
          },
        },
      },
      // Glass component base - can be used with MUI components
      MuiCard: {
        styleOverrides: {
          root: {
            background: glass.background,
            backdropFilter: glass.backdropFilter,
            border: `1px solid ${glass.border}`,
            boxShadow: ELEVATION_4,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            background: glass.background,
            backdropFilter: glass.backdropFilter,
            border: `1px solid ${glass.border}`,
            boxShadow: ELEVATION_4,
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

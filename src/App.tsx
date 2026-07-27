import { ThemeProvider, CssBaseline } from '@mui/material';
import 'remochi/css';
import { ThemeWrapper } from 'remochi';
import { lightTheme, darkTheme } from './theme/theme';
import Desktop from './components/Desktop';
import { usePyxisTheme } from '@pyxis/app-sdk';

/**
 * Bloom shell root. remochi's ThemeWrapper provides the Mochi design tokens
 * (CSS variables) every shell component now uses; the MUI ThemeProvider
 * remains only for the legacy MUI primitives still used for layout, themed
 * to match. Theme follows the persisted `pyxis.theme` setting, live via the
 * settings bus (the Settings app is a separate process).
 */
function App() {
  const theme = usePyxisTheme('light');
  return (
    <ThemeProvider theme={theme === 'dark' ? darkTheme : lightTheme}>
      <CssBaseline />
      <ThemeWrapper key={theme} defaultTheme={theme}>
        <Desktop />
      </ThemeWrapper>
    </ThemeProvider>
  );
}

export default App;

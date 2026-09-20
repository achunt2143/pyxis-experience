import 'remochi/css';
import { ThemeWrapper } from 'remochi';
import Desktop from './components/Desktop';
import { usePyxisTheme } from '@pyxis/app-sdk';

/**
 * Bloom shell root. remochi's ThemeWrapper provides the Mochi design tokens
 * (CSS variables) used across all shell components and apps. Theme follows
 * the persisted `pyxis.theme` setting, live via the settings bus.
 */
function App() {
  const theme = usePyxisTheme('light');
  return (
    <ThemeWrapper key={theme} defaultTheme={theme}>
      <Desktop />
    </ThemeWrapper>
  );
}

export default App;

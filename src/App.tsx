import 'remochi/css';
import { ThemeWrapper } from 'remochi';
import Desktop from './components/Desktop';
import { AppHostProvider, usePyxisTheme } from '@pyxis/app-sdk';
import { CompositorWindowsProvider } from './hooks/CompositorWindowsProvider';
import { MotionProvider } from './MotionProvider';

/**
 * Bloom shell root. remochi's ThemeWrapper provides the Mochi design tokens
 * (CSS variables) used across all shell components and apps. Theme follows
 * the persisted `pyxis.theme` setting, live via the settings bus.
 */
function App() {
  const theme = usePyxisTheme('light');
  return (
    <ThemeWrapper key={theme} defaultTheme={theme}>
      {/* One AppHost subscription set and one Evo window store for the whole
          shell; the dock, overview and launchers all read these. */}
      <AppHostProvider>
        <CompositorWindowsProvider>
          <MotionProvider>
            <Desktop />
          </MotionProvider>
        </CompositorWindowsProvider>
      </AppHostProvider>
    </ThemeWrapper>
  );
}

export default App;

import 'remochi/css';
import { ThemeWrapper } from 'remochi';
import { AppHostProvider, usePyxisTheme } from '@pyxis/app-sdk';
import { CompositorWindowsProvider } from '../hooks/CompositorWindowsProvider';
import { useWindows } from '../hooks/useWindows';
import ShellLayer from '../components/ShellLayer';
import { MotionProvider } from '../MotionProvider';

/**
 * Bloom's overlay: the shell UI that has to be seen over app windows.
 *
 * vela opens this page as a second window of the shell (`--pyxis-overlay
 * overlay.html`, passed by geckoOS-boot). The window covers the whole screen
 * and is transparent wherever nothing is drawn. Evo stacks it above every
 * app, and only the areas it reports (see useOverlayRegion) take clicks.
 * Everything else passes through to the app or desktop beneath. See
 * evo/src/shell/overlay.rs for Evo's half.
 *
 * It holds the whole shell: top bar, dock, every panel and the toasts (see
 * ShellLayer), and is where the lock screen goes. The desktop window beneath
 * is only the wallpaper. Evo keeps apps out from under the bar and dock with
 * a work area this page reports, and gives this window the keyboard only
 * while a panel that takes typing is open.
 *
 * It needs the same providers the desktop used to: one AppHost subscription
 * set and one Evo window store, which the dock, the overview and the
 * launchers all read.
 */
function OverlayApp() {
  const theme = usePyxisTheme('light');
  // In the compositor the store stays empty (real apps are Evo's windows).
  const windowStore = useWindows();
  return (
    <ThemeWrapper key={theme} defaultTheme={theme}>
      <AppHostProvider>
        <CompositorWindowsProvider>
          <MotionProvider syncEvo>
            <ShellLayer windowStore={windowStore} reporting />
          </MotionProvider>
        </CompositorWindowsProvider>
      </AppHostProvider>
    </ThemeWrapper>
  );
}

export default OverlayApp;

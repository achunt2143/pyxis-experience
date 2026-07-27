import React from 'react';
import ReactDOM from 'react-dom/client';
import type { ComponentType } from 'react';
import type { AppComponentProps } from './types';
import AppShell, { type PyxisTheme } from './AppShell';

/**
 * mountStandaloneApp
 * ------------------
 * Entry-point helper for every Pyxis app's own HTML page (browser, notes,
 * …). Each Pyxis app is its own document — a separate process/package from
 * Bloom — following the same pattern terminal.html established. Bloom (or
 * any host) passes `?windowId=<id>` so the app can identify its window;
 * closing is requested cooperatively via postMessage to the embedding
 * shell, falling back to window.close() when the app runs top-level (real
 * kiosk client).
 */
export function mountStandaloneApp(
  App: ComponentType<AppComponentProps>,
  opts?: { defaultTheme?: PyxisTheme }
) {
  const params = new URLSearchParams(window.location.search);
  const windowId = params.get('windowId') ?? 'standalone';

  const requestClose = () => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'pyxis:app-close', windowId }, '*');
    } else {
      window.close();
    }
  };

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <AppShell defaultTheme={opts?.defaultTheme}>
        <App windowId={windowId} onClose={requestClose} />
      </AppShell>
    </React.StrictMode>
  );
}

export default mountStandaloneApp;

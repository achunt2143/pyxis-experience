import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// TEMP DIAGNOSTIC CANARY - remove after confirming console capture + bridge injection timing
console.error('[BLOOM-CANARY] main.tsx executing, geckoOS=' + typeof (window as unknown as { geckoOS?: unknown }).geckoOS + ' location=' + location.href);
window.addEventListener('geckoOSReady', () => console.error('[BLOOM-CANARY] geckoOSReady event fired'));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
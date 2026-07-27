/**
 * Wallpapers are shared vocabulary between the Bloom desktop shell (renders
 * the current one) and the Settings app (lets the user pick one). Stored via
 * the real `org.geckoOS.settings` service and broadcast on the settings bus
 * so the running shell reacts live even though Settings is a separate
 * process/package.
 */
export const WALLPAPERS = [
  { id: 'aurora', name: 'Aurora', css: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
  { id: 'sunset', name: 'Sunset', css: 'linear-gradient(135deg, #ff7e5f 0%, #feb47b 100%)' },
  { id: 'forest', name: 'Forest', css: 'linear-gradient(135deg, #134e5e 0%, #71b280 100%)' },
  { id: 'mochi', name: 'Mochi', css: 'linear-gradient(135deg, #4a8bc2 0%, #6aaedb 55%, #ffd479 100%)' },
] as const;

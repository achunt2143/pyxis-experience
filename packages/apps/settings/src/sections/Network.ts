import { view } from '@duyojs/duyo';
import { getNetworkStatus, type NetworkStatus } from '@pyxis/app-sdk';
import { present } from '../parts/present';
import spec from './Network.view.json';
import type { CodeBehind } from './Network.view.gen';

/** Network: what the network service says now; surfaces an error instead of spinning forever on failure. */
export default view(spec, {
  create() {
    this.inherited();
    this.draw();
    void this.loadStatus();
  },
  async loadStatus() {
    this.setLoadState('loading');
    this.setError('');
    try {
      const status = await getNetworkStatus();
      if (this.destroyed) return;
      if (status) {
        this.setStatus(status);
        this.setLoadState('ready');
      } else {
        this.setStatus(null);
        this.setError('Unable to detect network status: the network service did not answer.');
        this.setLoadState('error');
      }
    } catch (err) {
      if (this.destroyed) return;
      this.setStatus(null);
      this.setError(`Unable to detect network status: ${err instanceof Error ? err.message : String(err)}`);
      this.setLoadState('error');
    }
  },
  statusChanged() {
    this.draw();
  },
  loadStateChanged() {
    this.draw();
  },
  errorChanged() {
    this.draw();
  },
  draw() {
    const network = this.status as NetworkStatus | null;
    const loadState = this.loadState as string;
    const { loading, panel, errorRow, badge, netIcon, headline, detail, ssid, iface } = this.$;
    loading.setShowing(loadState === 'loading');
    panel.setShowing(loadState === 'ready' && !!network);
    errorRow.setContent(this.error);
    present(errorRow, loadState === 'error' && this.error !== '', { role: 'alert', 'data-network-error': true });
    if (loadState !== 'ready' || !network) return;
    const ok = network.connected;
    badge.setStyle(
      `width:42px;height:42px;flex-shrink:0;border-radius:12px;display:flex;align-items:center;justify-content:center;background:${
        ok
          ? 'color-mix(in srgb, var(--mochi-success) 15%, transparent)'
          : 'color-mix(in srgb, var(--mochi-error) 15%, transparent)'
      };color:${ok ? 'var(--mochi-success)' : 'var(--mochi-error)'}`
    );
    netIcon.setIcon(ok ? 'Wifi' : 'WifiOff');
    headline.setContent(ok ? 'Connected to Network' : 'Disconnected');
    detail.setContent(ok ? `Active connection via ${network.type || 'Ethernet/Wi-Fi'}` : 'No internet access');
    ssid.setContent(network.ssid || 'Wired Connection');
    iface.setContent(network.type || 'Standard Network');
  },
} satisfies CodeBehind);

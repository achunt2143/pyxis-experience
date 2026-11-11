import { view } from '@duyojs/duyo';
import type { NetworkStatus } from '@pyxis/app-sdk';
import { getNetworkStatus } from '../services';
import spec from './Network.view.json';
import type { CodeBehind } from './Network.view.gen';

/** Network: what the network service says now. Null (no answer) keeps the spinner, as before. */
export default view(spec, {
  create() {
    this.inherited();
    void getNetworkStatus().then((status) => {
      if (!this.destroyed && status) this.setStatus(status);
    });
  },
  statusChanged() {
    const network = this.status as NetworkStatus | null;
    const { loading, panel, badge, netIcon, headline, detail, ssid, iface } = this.$;
    loading.setShowing(!network);
    panel.setShowing(!!network);
    if (!network) return;
    const ok = network.connected;
    badge.setStyle(
      `width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:${
        ok ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'
      };color:${ok ? '#10b981' : '#ef4444'}`
    );
    netIcon.setIcon(ok ? 'Wifi' : 'WifiOff');
    headline.setContent(ok ? 'Connected to Network' : 'Disconnected');
    detail.setContent(ok ? `Active connection via ${network.type || 'Ethernet/Wi-Fi'}` : 'No internet access');
    ssid.setContent(network.ssid || 'Wired Connection');
    iface.setContent(network.type || 'Standard Network');
  },
} satisfies CodeBehind);

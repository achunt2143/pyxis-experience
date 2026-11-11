import { view } from '@duyojs/duyo';
import spec from './System.view.json';
import type { CodeBehind } from './System.view.gen';

/** System: sleep, restart and shut down. A press raises `onRequest {action}`; the app confirms and acts. */
export default view(spec, {
  create() {
    this.inherited();
    this.statusChanged();
  },
  askSleep() {
    this.doRequest({ action: 'sleep' });
    return true;
  },
  askReboot() {
    this.doRequest({ action: 'reboot' });
    return true;
  },
  askShutdown() {
    this.doRequest({ action: 'shutdown' });
    return true;
  },
  /** What the app is doing about it ("Rebooting system..."), pushed in. */
  statusChanged() {
    this.$.statusBox.setShowing(this.status !== '');
    this.$.badge.setContent(this.status);
  },
} satisfies CodeBehind);

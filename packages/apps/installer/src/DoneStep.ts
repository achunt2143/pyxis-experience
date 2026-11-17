import { view } from '@duyojs/duyo';
import type { InstallResult } from '@pyxis/app-sdk';
import spec from './DoneStep.view.json';
import type { CodeBehind } from './DoneStep.view.gen';

export interface DoneInfo {
  result: InstallResult | null;
  launched: boolean;
  launching?: boolean;
  launchError?: string;
}

/** Step 4: the outcome. The app pushes `info`; raises onOpen {package} and onAgain. */
export default view(spec, {
  create() {
    this.inherited();
    this.infoChanged();
  },

  openTap() {
    const { result, launched, launching } = this.info as Partial<DoneInfo>;
    if (result && !launched && !launching) this.doOpen({ package: result.package });
    return true;
  },
  againTap() {
    this.doAgain();
    return true;
  },

  infoChanged() {
    const { result, launched, launching, launchError } = this.info as Partial<DoneInfo>;
    const $ = this.$;
    $.none.setShowing(!result);
    $.content.setShowing(Boolean(result));
    if (!result) return;
    const name = result.title ?? result.package;
    $.title.setContent(`${name} installed successfully!`);
    $.detail.setContent(
      `Version ${result.version} · ${result.registeredApps} application registered in Pyxis launcher`,
    );
    $.notLaunchable.setShowing(!result.launchable);
    $.open.setShowing(result.launchable);
    $.open.setDisabled(Boolean(launched || launching));
    $.openLabel.setContent(launched ? 'Launched' : launching ? 'Launching…' : `Open ${name}`);
    const err = String(launchError ?? '');
    $.launchErrorRow.setShowing(err !== '');
    $.launchErrorRow.setAttributes(err !== '' ? { role: 'alert', 'data-launch-error': true } : {});
    $.launchErrorText.setContent(err);
    $.logBox.setShowing(Boolean(result.log));
    $.log.setContent(result.log ?? '');
  },
} satisfies CodeBehind);

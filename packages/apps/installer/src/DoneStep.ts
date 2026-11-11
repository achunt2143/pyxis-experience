import { view } from '@duyojs/duyo';
import type { InstallResult } from '@pyxis/app-sdk';
import spec from './DoneStep.view.json';
import type { CodeBehind } from './DoneStep.view.gen';

export interface DoneInfo {
  result: InstallResult | null;
  launched: boolean;
}

/** Step 4: the outcome. The app pushes `info`; raises onOpen {package} and onAgain. */
export default view(spec, {
  create() {
    this.inherited();
    this.infoChanged();
  },

  openTap() {
    const { result } = this.info as Partial<DoneInfo>;
    if (result) this.doOpen({ package: result.package });
    return true;
  },
  againTap() {
    this.doAgain();
    return true;
  },

  infoChanged() {
    const { result, launched } = this.info as Partial<DoneInfo>;
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
    $.open.setDisabled(Boolean(launched));
    $.openLabel.setContent(launched ? 'Launched' : `Open ${name}`);
    $.logBox.setShowing(Boolean(result.log));
    $.log.setContent(result.log ?? '');
  },
} satisfies CodeBehind);

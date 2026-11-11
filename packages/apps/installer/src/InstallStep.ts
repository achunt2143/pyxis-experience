import { view } from '@duyojs/duyo';
import type { InstallProgress, PackageInfo } from '@pyxis/app-sdk';
import spec from './InstallStep.view.json';
import { PHASE_LABEL, phasePercent } from './model';
import type { CodeBehind } from './InstallStep.view.gen';

export interface InstallInfo {
  pkg: PackageInfo | null;
  progress: InstallProgress;
  installError: string | null;
}

/**
 * Step 3: live install progress. The app pushes `info` on every progress signal; the whole
 * step is a handful of nodes whose properties each change at most a few times per install,
 * so it needs no island.
 */
export default view(spec, {
  create() {
    this.inherited();
    this.infoChanged();
  },

  infoChanged() {
    const { pkg, progress, installError } = this.info as Partial<InstallInfo>;
    const phase = progress?.phase ?? 'idle';
    const $ = this.$;
    $.phase.setContent(PHASE_LABEL[phase]);
    $.bar.setValue(phasePercent(phase));
    $.bar.setColor(phase === 'failed' ? 'red' : 'blue');
    $.message.setContent(progress?.message || 'Waiting to start…');
    const busy = phase !== 'failed' && phase !== 'done';
    $.busy.setShowing(busy && Boolean(pkg));
    $.busyText.setContent(`Installing ${pkg?.title ?? pkg?.package ?? ''}…`);
    $.failed.setShowing(phase === 'failed');
    $.failText.setContent(installError ?? progress?.message ?? '');
  },
} satisfies CodeBehind);

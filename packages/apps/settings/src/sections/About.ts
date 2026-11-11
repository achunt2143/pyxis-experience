import { view } from '@duyojs/duyo';
import { aboutRows, type SystemInfo } from '../about';
import type { FactItem } from '../parts/Fact';
import spec from './About.view.json';
import type { CodeBehind } from './About.view.gen';

/**
 * About: `system.getInfo` as rows. The app root asks once (its footer reads the same
 * answer) and pushes `infoState` (asking | ready | failed) and `info` in.
 */
export default view(spec, {
  create() {
    this.inherited();
    this.draw();
  },
  infoStateChanged() {
    this.draw();
  },
  infoChanged() {
    this.draw();
  },
  draw() {
    const { asking, answer, rows, failed } = this.$;
    const state = this.infoState as string;
    asking.setShowing(state === 'asking');
    answer.setShowing(state !== 'asking');
    failed.setShowing(state === 'failed');
    if (state === 'asking') return;
    rows.setItems(
      aboutRows(this.info as SystemInfo | null).map(
        (row): FactItem => ({
          key: row.key,
          label: row.label,
          text: row.value,
          mono: row.mono,
          attributes: { 'data-about': row.key },
        })
      )
    );
  },
} satisfies CodeBehind);

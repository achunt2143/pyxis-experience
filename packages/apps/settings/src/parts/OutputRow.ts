import { view } from '@duyojs/duyo';
import type { AudioOutput } from '@pyxis/app-sdk';
import spec from './OutputRow.view.json';
import type { CodeBehind } from './OutputRow.view.gen';

/** One audio output: its description and name, a "Default" badge on the chosen one. */
export default view(spec, {
  create() {
    this.inherited();
    this.itemChanged();
  },
  itemChanged() {
    const output = this.item as AudioOutput | null;
    if (!output) return;
    const { description, outputName, badge } = this.$;
    description.setContent(output.description);
    description.setStyle(`font-size:0.84rem;font-weight:${output.isDefault ? 700 : 500}`);
    outputName.setContent(output.name);
    badge.setShowing(output.isDefault);
    this.addRemoveClass('current', output.isDefault);
  },
} satisfies CodeBehind);

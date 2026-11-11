import { view, type Component } from '@duyojs/duyo';
import spec from './TaskLists.view.json';
import { CUSTOM_LISTS, SMART_LISTS, type Counts } from './model';
import type { CodeBehind } from './TaskLists.view.gen';
import type { ViewItem } from './ViewRow';
import './ViewRow';

/** The sidebar: views, lists with counts, and the progress meter. State comes in, onPickList goes out. */
export default view(spec, {
  create() {
    this.inherited();
    this.draw();
  },

  pickList(sender: Component) {
    this.doPickList({ id: (sender['item'] as ViewItem).id });
    return true;
  },

  /** Takes `{ counts, selectedList, progress }`; each missing key keeps its value. */
  update(state: { counts?: Counts; selectedList?: string; progress?: number }) {
    if (state.counts !== undefined) this.setCounts(state.counts);
    if (state.selectedList !== undefined) this.setSelectedList(state.selectedList);
    if (state.progress !== undefined) this.setProgress(state.progress);
    this.draw();
  },

  draw() {
    const counts = this.counts as Record<string, number>;
    const rows = (lists: readonly { id: string; label: string; icon: string }[], group: ViewItem['group']) =>
      lists.map((l): ViewItem => ({ ...l, group, count: counts[l.id] ?? 0, selected: l.id === this.selectedList }));
    this.$.smart.setItems(rows(SMART_LISTS, 'smart'));
    this.$.custom.setItems(rows(CUSTOM_LISTS, 'custom'));
    this.$.percent.setContent(`${this.progress}%`);
    this.$.bar.setValue(this.progress);
  },
} satisfies CodeBehind);

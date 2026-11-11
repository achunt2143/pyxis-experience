import { view } from '@duyojs/duyo';
import spec from './FilesCrumb.view.json';
import type { CodeBehind } from './FilesCrumb.view.gen';

export interface CrumbItem {
  label: string;
  path: string;
  first: boolean;
  last: boolean;
}

/** One breadcrumb: a chevron (not on the first) and a button (the last is highlighted). */
export default view(spec, {
  create() {
    this.inherited();
    this.itemChanged();
  },

  itemChanged() {
    const crumb = this.item as CrumbItem | null;
    if (!crumb) return;
    this.$.chevron.setShowing(!crumb.first);
    this.$.button.setContent(crumb.label);
    this.$.button.addRemoveClass('last', crumb.last);
  },
} satisfies CodeBehind);

import { view } from '@duyojs/duyo';
import spec from './Groupbox.view.json';
import type { CodeBehind } from './Groupbox.view.gen';

/**
 * A card of related settings with its uppercase header line. What the section writes inside
 * it (`components` where it is used) follows the header. `group` is the `data-settings-group`
 * suites look for; the card's `aria-label` is its title.
 */
export default view(spec, {
  create() {
    this.inherited();
    this.paint();
  },
  titleChanged() {
    this.paint();
  },
  glyphChanged() {
    this.paint();
  },
  glyphColorChanged() {
    this.paint();
  },
  groupChanged() {
    this.paint();
  },
  paint() {
    const title = String(this.title);
    this.$.label.setContent(title.toUpperCase());
    this.$.icon.setIcon(this.glyph);
    this.$.icon.setColor(this.glyphColor || undefined);
    this.setAttributes({ 'aria-label': title, ...(this.group ? { 'data-settings-group': this.group } : {}) });
  },
} satisfies CodeBehind);

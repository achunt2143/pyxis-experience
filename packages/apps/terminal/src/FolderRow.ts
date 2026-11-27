import { view, type Component, type ComponentEvent } from '@duyojs/duyo';
import spec from './FolderRow.view.json';
import { tidyPath } from './sessions';
import type { CodeBehind } from './FolderRow.view.gen';

/** One "Start In" row: `item` is `{ cwd }`, a folder a session was in lately. Tapping it starts a session there. */
export default view(spec, {
  create() {
    this.inherited();
    this.itemChanged();
  },

  itemChanged() {
    const folder = this.item as { cwd: string } | null;
    if (!folder) return;
    const path = tidyPath(folder.cwd);
    const parts = path.split('/').filter(Boolean);
    this.$.title.setContent(path === '~' ? 'Home' : (parts[parts.length - 1] ?? path));
    this.$.caption.setContent(path);
    this.setAttributes({ role: 'button', tabIndex: 0, 'aria-label': `New session in ${path}` });
  },

  rowKeyDown(_sender: Component, event: ComponentEvent) {
    if (event['key'] === 'Enter' || event['key'] === ' ') {
      event['preventDefault']?.();
      this.bubble('ontap', { type: 'tap', originator: this });
      return true;
    }
    return false;
  },
} satisfies CodeBehind);

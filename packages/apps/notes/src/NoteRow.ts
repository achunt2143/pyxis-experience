import { view } from '@duyojs/duyo';
import spec from './NoteRow.view.json';
import { categoryColor, formatRelativeDate, snippetOf, type Note } from './model';
import type { CodeBehind } from './NoteRow.view.gen';

/** One row of the notes list. `item` is the Note (set by the Repeater); `selected` by the list. */
export default view(spec, {
  create() {
    this.inherited();
    this.itemChanged();
  },

  itemChanged() {
    const note = this.item as Note | null;
    if (!note) return;
    const { title, snippet, pin, dot, category, date } = this.$;
    title.setContent(note.title || 'Untitled note');
    pin.setShowing(!!note.pinned);
    const text = snippetOf(note.body);
    snippet.setContent(text || 'Empty note');
    snippet.addRemoveClass('empty', !text);
    // `style` is one string and setStyle replaces it: the dot's fixed look is a class.
    dot.setStyle(`background:${categoryColor(note.category || 'General')}`);
    category.setContent(note.category || 'General');
    date.setContent(formatRelativeDate(note.updatedAt));
  },

  selectedChanged() {
    this.addRemoveClass('selected', this.selected);
  },
} satisfies CodeBehind);

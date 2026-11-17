import { view, type Component, type ComponentEvent } from '@duyojs/duyo';
import spec from './TaskStream.view.json';
import {
  chipPills,
  getTodayString,
  getTomorrowString,
  type Priority,
  type Task,
} from './model';
import type { CodeBehind } from './TaskStream.view.gen';
import './TaskPill';
import './TaskRow';

type State = {
  items?: Task[];
  selectedId?: string | null;
  loaded?: boolean;
  heading?: string;
  listTotal?: number;
  listCompleted?: number;
  doneCount?: number;
  sortBy?: string;
  search?: string;
};

/**
 * The middle panel: header with progress badge, sort and Clear Done, the quick-add form
 * with its chips, and the task rows. It owns the draft (text, priority, due date); the app
 * pushes the rest in through `update` and hears onAddTask / onSelectTask / onToggleTask /
 * onSortChange / onClearDone / onSearchChange / onBack.
 */
export default view(spec, {
  create() {
    this.inherited();
    this.draw();
  },

  update(state: State) {
    for (const [key, value] of Object.entries(state)) this.set(key, value);
    this.draw();
  },

  // Events from inside, re-raised as the panel's own.
  pickTask(sender: Component) {
    this.doSelectTask({ id: (sender['item'] as Task).id });
    return true;
  },
  toggleRow(_sender: Component, event: ComponentEvent) {
    this.doToggleTask({ id: event['id'], checked: event['checked'] });
    return true;
  },
  clearDone() {
    this.doClearDone();
    return true;
  },
  back() {
    this.doBack();
    return true;
  },
  searchInput(_sender, event) {
    this.doSearchChange({ value: String(event['value'] ?? '') });
    return true;
  },
  focusDraft() {
    this.focusInput(this.$.draft.id);
  },
  focusSearch() {
    this.focusInput(this.$.search.id, true);
  },
  focusInput(id: string, select = false) {
    const input = document.querySelector<HTMLInputElement>(
      `input[data-duyo-id="${id}"], [data-duyo-id="${id}"] input`
    );
    input?.focus();
    if (select) input?.select();
  },
  sortInput(_sender, event) {
    this.doSortChange({ value: String(event['value']) });
    return true;
  },
  setupRow(_sender, event) {
    event['component'].setSelected(event['item'].id === this.selectedId);
    return true;
  },

  // The draft.
  draftInput(_sender, event) {
    this.setDraftText(String(event['value'] ?? ''));
    this.draw();
    return true;
  },
  pickChip(sender: Component) {
    const id = (sender['item'] as { id: string }).id;
    const today = getTodayString();
    const tomorrow = getTomorrowString();
    if (id === 'today') this.setDraftDueDate(this.draftDueDate === today ? '' : today);
    else if (id === 'tomorrow') this.setDraftDueDate(this.draftDueDate === tomorrow ? '' : tomorrow);
    else this.setDraftPriority(this.draftPriority === id ? 'none' : (id as Priority));
    this.draw();
    return true;
  },
  /** The form's submit (Enter in the field, or the + button). */
  submitDraft(_sender, event) {
    event['preventDefault']?.();
    const text = String(this.draftText).trim();
    if (!text) return true;
    this.doAddTask({ text, priority: this.draftPriority, dueDate: this.draftDueDate });
    this.setDraftText('');
    this.setDraftDueDate('');
    this.setDraftPriority('none');
    this.draw();
    // Quick add stays quick: the field keeps the keyboard for the next task.
    this.focusDraft();
    return true;
  },

  draw() {
    const { header, badge, sort, clearWrap, draft, addButton, chips, loading, empty, emptyText, rows } = this.$;
    const items = this.items as Task[];
    header.setContent(this.heading);
    badge.setContent(`${this.listCompleted}/${this.listTotal}`);
    sort.setValue(this.sortBy);
    if (this.$.search.getValue() !== this.search) this.$.search.setValue(this.search as string);
    clearWrap.setShowing((this.doneCount as number) > 0);

    draft.setValue(this.draftText);
    addButton.setDisabled(!String(this.draftText).trim());
    chips.setItems(chipPills(this.draftDueDate, this.draftPriority, getTodayString(), getTomorrowString()));

    loading.setShowing(!this.loaded);
    empty.setShowing(this.loaded && items.length === 0);
    emptyText.setContent(
      String(this.search).trim()
        ? 'No tasks match your search'
        : this.listTotal === 0
          ? 'No tasks yet — add one above!'
          : 'All clear in this view'
    );
    rows.setShowing(this.loaded && items.length > 0);
    rows.setItems(items);
    rows.refresh();
  },
} satisfies CodeBehind);

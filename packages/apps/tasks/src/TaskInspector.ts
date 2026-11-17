import { view, type Component } from '@duyojs/duyo';
import { formatLocalDate, parseLocalDate } from '@pyxis/app-sdk';
import spec from './TaskInspector.view.json';
import { priorityPills, type Priority, type Task } from './model';
import type { CodeBehind } from './TaskInspector.view.gen';
import './TaskPill';

/**
 * The right-hand inspector for one task. The app pushes `task` and `saveStatus`; edits go
 * out as onEditTask {patch}, plus onCloseInspector and onAskDelete (the app owns the dialog).
 */
export default view(spec, {
  create() {
    this.inherited();
    this.saveStatusChanged();
    this.taskChanged();
  },

  /** remochi.Button takes no aria attributes: label the close button's DOM once drawn. */
  rendered() {
    this.inherited();
    const host = document.querySelector(`[data-duyo-id="${this.$.closeButton.id}"]`);
    host?.querySelector('button')?.setAttribute('aria-label', 'Close Inspector');
  },

  close() {
    this.doCloseInspector();
    return true;
  },
  askDelete() {
    this.doAskDelete();
    return true;
  },
  doneToggled(_sender, event) {
    this.doEditTask({ patch: { done: !!event['value'] } });
    return true;
  },
  // An emptied name is not saved: the task keeps the last name it had until a new one is typed.
  textInput(_sender, event) {
    const text = String(event['value'] ?? '');
    if (text.trim()) this.doEditTask({ patch: { text } });
    return true;
  },
  notesInput(_sender, event) {
    this.doEditTask({ patch: { notes: String(event['value'] ?? '') } });
    return true;
  },
  pickPriority(sender: Component) {
    this.doEditTask({ patch: { priority: (sender['item'] as { id: Priority }).id } });
    return true;
  },
  // The picker hands back local midnight; toISOString() would be the day before west of UTC.
  dueInput(_sender, event) {
    const day = formatLocalDate(event['value'] as Date);
    if (day) this.doEditTask({ patch: { dueDate: day } });
    return true;
  },
  clearDue() {
    this.doEditTask({ patch: { dueDate: undefined } });
    return true;
  },
  categoryInput(_sender, event) {
    this.doEditTask({ patch: { category: String(event['value']) } });
    return true;
  },

  taskChanged() {
    const task = this.task as Task | null;
    if (!task) return;
    const { done, text, priorities, due, category, notes, created } = this.$;
    done.setChecked(task.done);
    text.setValue(task.text);
    text.addRemoveClass('done', task.done);
    priorities.setItems(priorityPills(task.priority || 'none'));
    // A Date, not the string: the picker reads a 'YYYY-MM-DD' string as UTC midnight.
    due.setValue(parseLocalDate(task.dueDate || '') ?? '');
    this.$.clearDue.setShowing(!!task.dueDate);
    category.setValue(task.category || 'Inbox');
    notes.setValue(task.notes || '');
    created.setContent(`Created ${new Date(task.createdAt).toLocaleDateString()}`);
  },
  saveStatusChanged() {
    this.$.saving.setShowing(this.saveStatus === 'saving');
    // Never "Saved" after a failed save: the app shows the error and a Retry.
    this.$.saved.setShowing(this.saveStatus === 'saved');
  },
} satisfies CodeBehind);

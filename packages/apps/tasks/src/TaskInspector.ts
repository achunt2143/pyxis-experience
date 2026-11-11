import { view, type Component } from '@duyojs/duyo';
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
  textInput(_sender, event) {
    this.doEditTask({ patch: { text: String(event['value'] ?? '') } });
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
  dueInput(_sender, event) {
    const d = event['value'] as Date;
    this.doEditTask({ patch: { dueDate: d.toISOString().split('T')[0] } });
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
    due.setValue(task.dueDate || '');
    category.setValue(task.category || 'Inbox');
    notes.setValue(task.notes || '');
    created.setContent(`Created ${new Date(task.createdAt).toLocaleDateString()}`);
  },
  saveStatusChanged() {
    this.$.saving.setShowing(this.saveStatus === 'saving');
    this.$.saved.setShowing(this.saveStatus !== 'saving');
  },
} satisfies CodeBehind);

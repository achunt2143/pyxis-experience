import { view, type Component, type ComponentEvent } from '@duyojs/duyo';
import { loadAppData, saveAppData } from '@pyxis/app-sdk';
import { onDestroy, registerIcons } from '@pyxis/app-sdk/duyo';
import { Calendar, Check, CircleCheck, Clock, Flag, Plus, Trash2, X } from 'lucide-react';
import spec from './TasksApp.view.json';
import {
  ALL_LISTS,
  AUTOSAVE_MS,
  SMART_LISTS,
  STORE,
  categoryForList,
  countTasks,
  getTodayString,
  newTaskId,
  visibleTasks,
  type ListId,
  type SortOption,
  type Task,
  type TasksDoc,
} from './model';
import type { CodeBehind } from './TasksApp.view.gen';
import './TaskLists';
import './TaskStream';
import './TaskInspector';
import './tasks.css';

// Every icon the Tasks specs name (the React rows import theirs directly).
registerIcons({ Calendar, Check, CircleCheck, Clock, Flag, Plus, Trash2, X });

const INSPECTOR_PANEL = {
  kind: 'remochi.Repanel',
  look: 'shadow',
  components: [
    {
      name: 'inspector',
      kind: 'Tasks.Inspector',
      onEditTask: 'editTask',
      onCloseInspector: 'closeInspector',
      onAskDelete: 'askDelete',
    },
  ],
};

/**
 * Tasks: a three-panel task manager (lists, task stream, inspector). This kind owns the
 * data, the selection and the persistence; the panels are views of it. The inspector
 * panel exists only while a task is selected (made and destroyed here, as the React app
 * mounted it conditionally). A change goes: handler -> `mutate` -> `sync`.
 */
export default view(spec, {
  create() {
    this.inherited();
    this.setAttributes({ 'data-window-id': this.windowId });
    this._saveTimer = null as ReturnType<typeof setTimeout> | null;
    this._countsKey = '';
    this._panel = null as Component | null;

    const flush = () => {
      if (this._saveTimer) {
        clearTimeout(this._saveTimer);
        this._saveTimer = null;
        void saveAppData(STORE, { tasks: this.tasks } satisfies TasksDoc);
      }
    };
    window.addEventListener('beforeunload', flush);
    onDestroy(this, () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    });

    void loadAppData<TasksDoc>(STORE, { tasks: [] }).then((doc) => {
      if (this.destroyed) return;
      this.setTasks(doc.tasks);
      this.setLoaded(true);
      this.sync();
    });
    this.sync();
  },

  // Handlers for the panels' events.
  listPicked(_sender, event) {
    this.setSelectedList(event['id'] as ListId);
    this.setSelectedId(null);
    this.$.stack.setActiveIndex(1);
    this.sync();
    return true;
  },
  sortPicked(_sender, event) {
    this.setSortBy(event['value'] as SortOption);
    this.sync();
    return true;
  },
  selectTask(_sender, event) {
    this.setSelectedId(event['id']);
    this.$.stack.setActiveIndex(2);
    this.sync();
    return true;
  },
  toggleTask(_sender, event) {
    const { id, checked } = event as { id: string; checked: boolean };
    this.mutate((prev: Task[]) => prev.map((t) => (t.id === id ? { ...t, done: checked } : t)));
    this.sync();
    return true;
  },
  addTask(_sender, event) {
    const list = this.selectedList as ListId;
    const today = getTodayString();
    const task: Task = {
      id: newTaskId(),
      text: event['text'],
      done: false,
      priority: event['priority'],
      dueDate: event['dueDate'] || (list === 'today' ? today : undefined),
      category: categoryForList(list),
      createdAt: Date.now(),
    };
    this.mutate((prev: Task[]) => [task, ...prev]);
    this.setSelectedId(task.id);
    this.$.stack.setActiveIndex(2); // the new task opens in the inspector
    this.sync();
    return true;
  },
  editTask(_sender: Component, event: ComponentEvent) {
    const id = this.selectedId as string | null;
    if (id === null) return true;
    const patch = event['patch'] as Partial<Task>;
    this.mutate((prev: Task[]) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    this.sync();
    return true;
  },
  closeInspector() {
    this.setSelectedId(null);
    this.$.stack.setActiveIndex(1);
    this.sync();
    return true;
  },
  /** The stack moved (a drag, or our own change coming back): leaving the inspector deselects. */
  stackMoved(_sender, event) {
    if ((event['index'] as number) < 2 && this.selectedId) {
      this.setSelectedId(null);
      this.sync();
    }
    return true;
  },

  askDelete() {
    const task = this.selectedTask();
    this.$.deleteName.setContent(task?.text || 'this task');
    this.$.deleteDialog.setOpen(true);
    return true;
  },
  deleteConfirmed() {
    const id = this.selectedId as string | null;
    if (!id) return true;
    this.mutate((prev: Task[]) => prev.filter((t) => t.id !== id));
    this.setSelectedId(null);
    this.$.stack.setActiveIndex(1);
    this.sync();
    return true;
  },
  askClear() {
    this.$.clearCount.setContent(String(countTasks(this.tasks, getTodayString()).done));
    this.$.clearDialog.setOpen(true);
    return true;
  },
  clearConfirmed() {
    const selected = this.selectedTask() as Task | null;
    this.mutate((prev: Task[]) => prev.filter((t) => !t.done));
    if (selected?.done) {
      this.setSelectedId(null);
      this.$.stack.setActiveIndex(1);
    }
    this.sync();
    return true;
  },
  /** A dialog's close would bubble to the root's onClose and close the whole app: stop it here. */
  dialogDismissed() {
    return true;
  },

  selectedTask() {
    return (this.tasks as Task[]).find((t) => t.id === this.selectedId) ?? null;
  },

  /** Replaces the tasks (never edits in place) and schedules the save. */
  mutate(change: (prev: Task[]) => Task[]) {
    const next = change(this.tasks as Task[]);
    this.setTasks(next);
    this.setSaveStatus('saving');
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(async () => {
      this._saveTimer = null;
      await saveAppData(STORE, { tasks: next } satisfies TasksDoc);
      if (!this.destroyed && this._saveTimer === null) this.setSaveStatus('saved');
    }, AUTOSAVE_MS);
  },

  /** Pushes what the panels show; the inspector panel is made or dropped to match the selection. */
  sync() {
    const { lists, stream } = this.$;
    const tasks = this.tasks as Task[];
    const today = getTodayString();
    const counts = countTasks(tasks, today);
    const visible = visibleTasks(tasks, this.selectedList, this.sortBy, today);
    const def = ALL_LISTS.find((l) => l.id === this.selectedList) ?? SMART_LISTS[0];
    const total = visible.length;
    const completed = visible.filter((t) => t.done).length;
    const progress = total === 0 ? 0 : Math.round((completed / total) * 100);

    const countsKey = JSON.stringify(counts);
    lists.update({
      ...(countsKey !== this._countsKey ? { counts } : {}),
      selectedList: this.selectedList,
      progress,
    });
    this._countsKey = countsKey;
    stream.update({
      items: visible,
      selectedId: this.selectedId,
      loaded: this.loaded,
      heading: def.label,
      listTotal: total,
      listCompleted: completed,
      doneCount: counts.done,
      sortBy: this.sortBy,
    });

    const task = this.selectedTask() as Task | null;
    if (task && !this._panel) {
      this._panel = this.$.stack.createComponent(INSPECTOR_PANEL, { owner: this });
    } else if (!task && this._panel) {
      this._panel.destroy();
      this._panel = null;
    }
    const inspector = (this.$ as Record<string, Component | undefined>)['inspector'];
    if (task && inspector) {
      inspector.set('saveStatus', this.saveStatus);
      inspector.set('task', task);
    }
  },

  saveStatusChanged() {
    const inspector = (this.$ as Record<string, Component | undefined>)['inspector'];
    if (inspector && !inspector.destroyed) inspector.set('saveStatus', this.saveStatus);
  },
} satisfies CodeBehind);

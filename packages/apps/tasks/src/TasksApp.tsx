import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  DateInput,
  Dialog,
  Divider,
  Dropdown,
  Header,
  Input,
  Item,
  List,
  ListHeader,
  ProgressBar,
  Repanel,
  RepanelStack,
  Spinner,
} from 'remochi';
import {
  Plus,
  Trash2,
  Calendar,
  AlertCircle,
  CheckCircle2,
  ListTodo,
  Inbox,
  Briefcase,
  User,
  ShoppingBag,
} from 'lucide-react';
import { loadAppData, saveAppData } from '@pyxis/app-sdk';

export interface TasksAppProps {
  windowId: string;
  onClose?: () => void;
}

export type Priority = 'high' | 'medium' | 'low' | 'none';

export interface Task {
  id: string;
  text: string;
  done: boolean;
  priority?: Priority;
  dueDate?: string; // YYYY-MM-DD
  category?: string;
  notes?: string;
  createdAt: number;
}

interface TasksDoc {
  tasks: Task[];
}

const STORE = 'tasks';
const AUTOSAVE_MS = 600;

const LISTS = [
  { id: 'all', label: 'All Tasks', icon: ListTodo },
  { id: 'today', label: 'Today', icon: Calendar },
  { id: 'upcoming', label: 'Upcoming', icon: AlertCircle },
  { id: 'completed', label: 'Completed', icon: CheckCircle2 },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'work', label: 'Work', icon: Briefcase },
  { id: 'personal', label: 'Personal', icon: User },
  { id: 'shopping', label: 'Shopping', icon: ShoppingBag },
] as const;

type ListId = (typeof LISTS)[number]['id'];

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string }> = {
  high: { label: 'High', color: '#f7768e', bg: 'rgba(247, 118, 142, 0.15)' },
  medium: { label: 'Medium', color: '#e0af68', bg: 'rgba(224, 175, 104, 0.15)' },
  low: { label: 'Low', color: '#7dcfff', bg: 'rgba(125, 207, 255, 0.15)' },
  none: { label: 'None', color: 'var(--color-text-muted)', bg: 'transparent' },
};

function getTodayString(): string {
  return new Date().toISOString().slice(0, 10);
}

type SortOption = 'dueDate' | 'priority' | 'createdAt';

/**
 * TasksApp — Full Palm webOS Mochi-styled task manager with priorities,
 * smart views (Today, Upcoming), lists, due dates, sorting, and progress tracking.
 */
export const TasksApp: React.FC<TasksAppProps> = ({ windowId }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState('');
  const [draftPriority, setDraftPriority] = useState<Priority>('none');
  const [draftDueDate, setDraftDueDate] = useState('');
  const [selectedList, setSelectedList] = useState<ListId>('all');
  const [sortBy, setSortBy] = useState<SortOption>('createdAt');
  const [loaded, setLoaded] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [activeIndex, setActiveIndex] = useState(1);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    loadAppData<TasksDoc>(STORE, { tasks: [] }).then((doc) => {
      if (!mounted) return;
      setTasks(doc.tasks);
      setLoaded(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const scheduleSave = useCallback((next: Task[]) => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void saveAppData(STORE, { tasks: next } satisfies TasksDoc);
    }, AUTOSAVE_MS);
  }, []);

  const mutate = useCallback(
    (fn: (prev: Task[]) => Task[]) => {
      setTasks((prev) => {
        const next = fn(prev);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  const addTask = () => {
    const text = draft.trim();
    if (!text) return;

    // Default category based on active list
    let cat = 'Inbox';
    if (['work', 'personal', 'shopping'].includes(selectedList)) {
      cat = selectedList.charAt(0).toUpperCase() + selectedList.slice(1);
    }

    const newTask: Task = {
      id: Math.random().toString(36).slice(2, 11),
      text,
      done: false,
      priority: draftPriority,
      dueDate: draftDueDate || (selectedList === 'today' ? getTodayString() : undefined),
      category: cat,
      createdAt: Date.now(),
    };

    mutate((prev) => [newTask, ...prev]);
    setDraft('');
    setDraftDueDate('');
    setDraftPriority('none');
  };

  const todayStr = getTodayString();

  const counts = useMemo(() => {
    return {
      all: tasks.length,
      today: tasks.filter((t) => !t.done && t.dueDate === todayStr).length,
      upcoming: tasks.filter((t) => !t.done && t.dueDate && t.dueDate > todayStr).length,
      completed: tasks.filter((t) => t.done).length,
      inbox: tasks.filter((t) => (t.category || 'Inbox').toLowerCase() === 'inbox' && !t.done).length,
      work: tasks.filter((t) => (t.category || '').toLowerCase() === 'work' && !t.done).length,
      personal: tasks.filter((t) => (t.category || '').toLowerCase() === 'personal' && !t.done).length,
      shopping: tasks.filter((t) => (t.category || '').toLowerCase() === 'shopping' && !t.done).length,
      done: tasks.filter((t) => t.done).length,
    };
  }, [tasks, todayStr]);

  const visible = useMemo(() => {
    let list = tasks;

    switch (selectedList) {
      case 'all':
        break;
      case 'today':
        list = list.filter((t) => !t.done && t.dueDate === todayStr);
        break;
      case 'upcoming':
        list = list.filter((t) => !t.done && t.dueDate && t.dueDate > todayStr);
        break;
      case 'completed':
        list = list.filter((t) => t.done);
        break;
      case 'inbox':
      case 'work':
      case 'personal':
      case 'shopping':
        list = list.filter(
          (t) => (t.category || 'Inbox').toLowerCase() === selectedList
        );
        break;
    }

    // Sort visible tasks
    const priorityWeight: Record<Priority, number> = { high: 3, medium: 2, low: 1, none: 0 };
    return [...list].sort((a, b) => {
      // Completed always sink to bottom
      if (a.done !== b.done) return a.done ? 1 : -1;

      if (sortBy === 'priority') {
        const pDiff = (priorityWeight[b.priority || 'none'] || 0) - (priorityWeight[a.priority || 'none'] || 0);
        if (pDiff !== 0) return pDiff;
      } else if (sortBy === 'dueDate') {
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
      }
      return b.createdAt - a.createdAt;
    });
  }, [tasks, selectedList, sortBy, todayStr]);

  const currentListDef = LISTS.find((l) => l.id === selectedList) || LISTS[0];
  const listTotal = visible.length;
  const listCompleted = visible.filter((t) => t.done).length;
  const progress = listTotal === 0 ? 0 : Math.round((listCompleted / listTotal) * 100);

  const selectList = (id: ListId) => {
    setSelectedList(id);
    setActiveIndex(1);
  };

  const handleClearCompleted = () => {
    mutate((prev) => prev.filter((t) => !t.done));
    setConfirmClear(false);
  };

  return (
    <div
      data-window-id={windowId}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-background)',
        minHeight: 0,
      }}
    >
      <div style={{ flex: 1, minHeight: 0 }}>
        <RepanelStack
          activeIndex={activeIndex}
          onActiveIndexChange={(index) => setActiveIndex(index)}
        >
          {/* Sidebar Lists Panel */}
          <Repanel>
            <div style={{ paddingTop: 8, position: 'absolute', inset: 0, overflowY: 'auto' }}>
              <List>
                <ListHeader content="Smart Views" />
                {LISTS.slice(0, 4).map((item) => {
                  const Icon = item.icon;
                  return (
                    <Item
                      key={item.id}
                      title={item.label}
                      icon={<Icon size={14} style={{ marginRight: 6 }} />}
                      rightContent={<Badge content={counts[item.id]} />}
                      selected={selectedList === item.id}
                      hoverable
                      variant="compact"
                      onClick={() => selectList(item.id)}
                    />
                  );
                })}
              </List>
              <Divider />
              <List>
                <ListHeader content="Custom Lists" />
                {LISTS.slice(4).map((item) => {
                  const Icon = item.icon;
                  return (
                    <Item
                      key={item.id}
                      title={item.label}
                      icon={<Icon size={14} style={{ marginRight: 6 }} />}
                      rightContent={<Badge content={counts[item.id]} />}
                      selected={selectedList === item.id}
                      hoverable
                      variant="compact"
                      onClick={() => selectList(item.id)}
                    />
                  );
                })}
              </List>
            </div>
          </Repanel>

          {/* Task List View Panel */}
          <Repanel>
            <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', inset: 0, minHeight: 0 }}>
              <div style={{ padding: '14px 18px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Header content={currentListDef.label} />
                    <Badge
                      content={`${listCompleted}/${listTotal}`}
                      background="var(--color-primary, #4a8bc2)"
                      color="#fff"
                    />
                  </div>

                  {/* Sort Control */}
                  <div style={{ width: 120 }}>
                    <Dropdown
                      options={[
                        { value: 'createdAt', label: 'Created' },
                        { value: 'dueDate', label: 'Due Date' },
                        { value: 'priority', label: 'Priority' },
                      ]}
                      value={sortBy}
                      onChange={(v) => setSortBy(v as SortOption)}
                    />
                  </div>
                </div>

                <div style={{ margin: '10px 0' }}>
                  <ProgressBar value={progress} />
                </div>

                {/* New Task Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addTask();
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    background: 'var(--color-surface)',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-light)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Input
                      placeholder="Add a new task…"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      aria-label="new task"
                      style={{ width: '100%' }}
                    />
                    <span title="Add Task">
                      <Button variant="affirmative" disabled={!draft.trim()}>
                        <Plus size={15} style={{ verticalAlign: 'middle' }} />
                      </Button>
                    </span>
                  </div>

                  {/* Priority and Due Date Selectors */}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ width: 140 }}>
                      <Dropdown
                        options={[
                          { value: 'none', label: 'Priority: None' },
                          { value: 'low', label: 'Priority: Low' },
                          { value: 'medium', label: 'Priority: Medium' },
                          { value: 'high', label: 'Priority: High' },
                        ]}
                        value={draftPriority}
                        onChange={(v) => setDraftPriority(v as Priority)}
                      />
                    </div>

                    <div>
                      <DateInput
                        value={draftDueDate}
                        placeholder="Due date…"
                        onChange={(d: Date) => {
                          const iso = d.toISOString().split('T')[0];
                          setDraftDueDate(iso);
                        }}
                      />
                    </div>
                  </div>
                </form>

                {/* Clear Completed Action */}
                <div style={{ margin: '8px 0', display: 'flex', justifyContent: 'flex-end' }}>
                  <span title="Clear completed tasks">
                    <Button
                      variant="warning"
                      disabled={counts.done === 0}
                      onClick={() => setConfirmClear(true)}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <Trash2 size={13} /> Clear done ({counts.done})
                      </span>
                    </Button>
                  </span>
                </div>
                <Divider />
              </div>

              {/* Task list */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '6px 18px 18px', minHeight: 0 }}>
                {!loaded ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                    <Spinner active size="normal" styleType="light" alt="Loading tasks" />
                  </div>
                ) : visible.length === 0 ? (
                  <div style={{ padding: 16, color: 'var(--color-text-muted)', fontSize: 13 }}>
                    {listTotal === 0
                      ? 'Nothing to do — add your first task above.'
                      : 'No tasks match this filter.'}
                  </div>
                ) : (
                  visible.map((t) => {
                    const isOverdue = t.dueDate && t.dueDate < todayStr && !t.done;
                    const isDueToday = t.dueDate && t.dueDate === todayStr && !t.done;
                    const priorityCfg = PRIORITY_CONFIG[t.priority || 'none'];

                    return (
                      <Item
                        key={t.id}
                        title={t.text}
                        subtitle={
                          t.dueDate
                            ? `${isDueToday ? 'Today' : isOverdue ? `Overdue (${t.dueDate})` : t.dueDate}${t.category ? ` • ${t.category}` : ''}`
                            : t.category || undefined
                        }
                        icon={
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Checkbox
                              checked={t.done}
                              onChange={({ checked }) =>
                                mutate((prev) =>
                                  prev.map((x) => (x.id === t.id ? { ...x, done: checked } : x))
                                )
                              }
                            />
                            {t.priority && t.priority !== 'none' && (
                              <div
                                title={`Priority: ${priorityCfg.label}`}
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  backgroundColor: priorityCfg.color,
                                  flexShrink: 0,
                                }}
                              />
                            )}
                          </div>
                        }
                        rightContent={
                          <span title="Delete task">
                            <Button
                              variant="normal"
                              onClick={() => mutate((prev) => prev.filter((x) => x.id !== t.id))}
                            >
                              <Trash2 size={13} style={{ verticalAlign: 'middle' }} />
                            </Button>
                          </span>
                        }
                        hoverable
                        variant="compact"
                      />
                    );
                  })
                )}
              </div>
            </div>
          </Repanel>
        </RepanelStack>
      </div>

      <Dialog
        isOpen={confirmClear}
        title="Clear completed tasks"
        type="confirm"
        confirmText="Clear Done"
        cancelText="Cancel"
        onConfirm={handleClearCompleted}
        onCancel={() => setConfirmClear(false)}
        onClose={() => setConfirmClear(false)}
      >
        <p>Are you sure you want to remove all {counts.done} completed tasks?</p>
      </Dialog>
    </div>
  );
};

export default TasksApp;

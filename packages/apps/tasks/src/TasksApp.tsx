import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  Divider,
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
import { Plus, Trash2 } from 'lucide-react';
import { loadAppData, saveAppData } from '@pyxis/app-sdk';

export interface TasksAppProps {
  windowId: string;
  onClose?: () => void;
}

interface Task {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

interface TasksDoc {
  tasks: Task[];
}

const STORE = 'tasks';
const AUTOSAVE_MS = 600;

type Filter = 'all' | 'active' | 'done';
const FILTERS: Filter[] = ['all', 'active', 'done'];
const FILTER_LABEL: Record<Filter, string> = { all: 'All', active: 'Active', done: 'Done' };

/**
 * TasksApp — Mochi-styled to-do list, persisted through the
 * `org.geckoOS.filesystem` Echo service (see @pyxis/app-sdk's appStorage.ts).
 */
export const TasksApp: React.FC<TasksAppProps> = ({ windowId }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [loaded, setLoaded] = useState(false);
  // Which Repanel is in front: 0 = filter list alone (detail swiped away),
  // 1 = the selected filter's task list (filters stay revealed behind it).
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
    mutate((prev) => [
      {
        id: Math.random().toString(36).slice(2, 11),
        text,
        done: false,
        createdAt: Date.now(),
      },
      ...prev,
    ]);
    setDraft('');
  };

  const selectFilter = (f: Filter) => {
    setFilter(f);
    setActiveIndex(1);
  };

  const counts = useMemo(
    () => ({
      all: tasks.length,
      active: tasks.filter((t) => !t.done).length,
      done: tasks.filter((t) => t.done).length,
    }),
    [tasks]
  );

  const visible = useMemo(() => {
    if (filter === 'active') return tasks.filter((t) => !t.done);
    if (filter === 'done') return tasks.filter((t) => t.done);
    return tasks;
  }, [tasks, filter]);

  const progress = counts.all === 0 ? 0 : Math.round((counts.done / counts.all) * 100);

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
          {/* Filter list */}
          <Repanel>
            <div style={{ paddingTop: 8, height: '100%', overflowY: 'auto' }}>
              <List>
                <ListHeader content="Lists" />
                {FILTERS.map((f) => (
                  <Item
                    key={f}
                    title={FILTER_LABEL[f]}
                    rightContent={<Badge content={counts[f]} />}
                    selected={filter === f}
                    hoverable
                    variant="compact"
                    onClick={() => selectFilter(f)}
                  />
                ))}
              </List>
            </div>
          </Repanel>

          {/* Selected filter's task list */}
          <Repanel>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
              <div style={{ padding: '14px 18px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Header content={FILTER_LABEL[filter]} />
                  <Badge
                    content={`${counts.done}/${counts.all}`}
                    background="var(--color-primary)"
                    color="#fff"
                  />
                </div>
                <div style={{ margin: '10px 0' }}>
                  <ProgressBar value={progress} />
                </div>

                {/* New task */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addTask();
                  }}
                  style={{ display: 'flex', gap: 6, alignItems: 'center' }}
                >
                  <Input
                    placeholder="Add a task…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-label="new task"
                    style={{ width: '100%' }}
                  />
                  {/* No onClick: the button submits the surrounding form, and adding
                      here too would double-add (remochi buttons are type="submit"). */}
                  <Button variant="affirmative" disabled={!draft.trim()}>
                    <Plus size={15} style={{ verticalAlign: 'middle' }} />
                  </Button>
                </form>

                <div style={{ margin: '10px 0', display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="warning"
                    disabled={counts.done === 0}
                    onClick={() => mutate((prev) => prev.filter((t) => !t.done))}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Trash2 size={13} /> Clear done
                    </span>
                  </Button>
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
                    {counts.all === 0
                      ? 'Nothing to do — add your first task above.'
                      : filter === 'active'
                      ? 'No active tasks. Nice work!'
                      : 'No completed tasks yet.'}
                  </div>
                ) : (
                  visible.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 6px',
                        borderBottom: '1px solid var(--color-border-light)',
                      }}
                    >
                      <Checkbox
                        checked={t.done}
                        onChange={({ checked }) =>
                          mutate((prev) =>
                            prev.map((x) => (x.id === t.id ? { ...x, done: checked } : x))
                          )
                        }
                      />
                      <span
                        style={{
                          flex: 1,
                          fontSize: 14,
                          color: t.done ? 'var(--color-text-muted)' : 'var(--color-text)',
                          textDecoration: t.done ? 'line-through' : 'none',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t.text}
                      </span>
                      <Button
                        onClick={() => mutate((prev) => prev.filter((x) => x.id !== t.id))}
                      >
                        <Trash2 size={13} style={{ verticalAlign: 'middle' }} />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Repanel>
        </RepanelStack>
      </div>
    </div>
  );
};

export default TasksApp;

// @vitest-environment jsdom
import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTodayString, getTomorrowString, type Task } from '../model';
import {
  $,
  $$,
  buttonText,
  chip,
  click,
  draftInput,
  listEntry,
  mountTasks,
  nameInput,
  notesArea,
  rowTexts,
  rows,
  seedTask,
  storage,
  stubCanvas,
  type,
  type Mounted,
} from './testUtils';

vi.mock('../../../../app-sdk/src/appStorage', () => ({
  loadAppData: async () => structuredClone(storage.doc),
  saveAppData: async (_store: string, data: { tasks: Task[] }) => {
    storage.saves.push(structuredClone(data));
    return !storage.fail;
  },
}));
vi.mock('../../../../app-sdk/src/usePyxisTheme', () => ({ usePyxisTheme: () => 'light' }));

stubCanvas();

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

let m: Mounted | undefined;
afterEach(() => {
  m?.unmount();
  m = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const today = () => getTodayString();
const open = (host: HTMLElement, text: string) => click(rows(host).find((r) => r.textContent?.includes(text))!);
const inspectorOpen = (host: HTMLElement) => !!nameInput(host);
const badgeFor = (host: HTMLElement, label: string) => listEntry(host, label).textContent;

describe('Tasks: loading and views', () => {
  it('lists stored tasks newest first, done ones last, with nothing selected', async () => {
    m = await mountTasks([
      seedTask(0),
      seedTask(1, { done: true }),
      seedTask(2),
    ]);
    expect(rowTexts(m.host)).toEqual(['Task number 2', 'Task number 0', 'Task number 1']);
    expect(inspectorOpen(m.host)).toBe(false);
    expect(m.host.textContent).toContain('All Tasks');
    expect(m.host.textContent).toContain('1/3');
  });

  it('empty store shows the empty message', async () => {
    m = await mountTasks([]);
    expect(rows(m.host)).toEqual([]);
    expect(m.host.textContent).toContain('No tasks yet — add one above!');
  });

  it('shows a spinner until the load lands', async () => {
    storage.doc = { tasks: [seedTask(0)] };
    const { mountDuyoApp } = await import('@pyxis/app-sdk/duyo');
    const host = document.createElement('div');
    document.body.appendChild(host);
    let app!: ReturnType<typeof mountDuyoApp>;
    act(() => {
      app = mountDuyoApp('Tasks.App', { element: host });
    });
    expect(app.root.get('loaded')).toBe(false);
    await act(async () => {});
    expect(app.root.get('loaded')).toBe(true);
    act(() => app.unmount());
    host.remove();
  });

  it('counts per view and list, and filters on tap', async () => {
    m = await mountTasks([
      seedTask(0, { dueDate: today() }),
      seedTask(1, { dueDate: '2999-01-01' }),
      seedTask(2, { category: 'Work' }),
      seedTask(3, { category: 'Work', done: true }),
    ]);
    expect(badgeFor(m.host, 'All Tasks')).toContain('4');
    expect(badgeFor(m.host, 'Today')).toContain('1');
    expect(badgeFor(m.host, 'Upcoming')).toContain('1');
    expect(badgeFor(m.host, 'Completed')).toContain('1');
    expect(badgeFor(m.host, 'Inbox')).toContain('2');
    expect(badgeFor(m.host, 'Work')).toContain('1');
    click(listEntry(m.host, 'Work'));
    expect(rowTexts(m.host)).toEqual(['Task number 2', 'Task number 3']);
    expect(m.host.textContent).toContain('1/2');
    click(listEntry(m.host, 'Completed'));
    expect(rowTexts(m.host)).toEqual(['Task number 3']);
    click(listEntry(m.host, 'Today'));
    expect(rowTexts(m.host)).toEqual(['Task number 0']);
  });

  it('sorts by priority and by due date', async () => {
    m = await mountTasks([
      seedTask(0, { priority: 'low', dueDate: '2030-01-03' }),
      seedTask(1, { priority: 'high' }),
      seedTask(2, { priority: 'medium', dueDate: '2030-01-01' }),
    ]);
    const sort = m.app.root.$['stream']!.$['sort']!;
    act(() => {
      sort.set('value', 'priority');
      sort.doChange({ value: 'priority' });
    });
    expect(rowTexts(m.host)).toEqual(['Task number 1', 'Task number 2', 'Task number 0']);
    act(() => sort.doChange({ value: 'dueDate' }));
    expect(rowTexts(m.host)).toEqual(['Task number 2', 'Task number 0', 'Task number 1']);
  });

  it('draws every icon it names', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    m = await mountTasks([seedTask(0)]);
    open(m.host, 'Task number 0');
    expect(warn.mock.calls.filter(([text]) => String(text).startsWith('pyxis.Icon'))).toEqual([]);
  });
});

describe('Tasks: quick add', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  it('adds on submit into Inbox, opens it in the inspector, saves after 600 ms, clears the draft', async () => {
    // A wide window: jsdom lays out nothing, and a 0 px stack is the narrow, one-panel layout.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 1200, bottom: 800, width: 1200, height: 800, toJSON: () => ({}),
    } as DOMRect);
    m = await mountTasks([]);
    const submit = $(m.host, 'button[type="submit"]') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    type(draftInput(m.host), '  Buy milk ');
    expect(submit.disabled).toBe(false);
    act(() => {
      fireEvent.submit($(m!.host, 'form')!);
    });
    expect(rowTexts(m.host)).toEqual(['Buy milk']);
    expect(draftInput(m.host).value).toBe('');
    expect(nameInput(m.host).value).toBe('Buy milk');
    expect(m.host.textContent).toContain('Saving…'.slice(0, 6));
    expect(storage.saves).toEqual([]);
    await advance(600);
    expect(storage.saves.length).toBe(1);
    expect(storage.saves[0]!.tasks[0]).toMatchObject({ text: 'Buy milk', done: false, priority: 'none', category: 'Inbox' });
  });

  it('ignores an empty draft', async () => {
    m = await mountTasks([]);
    type(draftInput(m.host), '   ');
    act(() => {
      fireEvent.submit($(m!.host, 'form')!);
    });
    expect(rows(m.host)).toEqual([]);
  });

  it('chips set the due date and priority (and toggle off), the new task keeps them', async () => {
    m = await mountTasks([]);
    click(chip(m.host, 'Tomorrow'));
    click(chip(m.host, 'High'));
    type(draftInput(m.host), 'Plan');
    act(() => {
      fireEvent.submit($(m!.host, 'form')!);
    });
    await advance(600);
    expect(storage.saves[0]!.tasks[0]).toMatchObject({ dueDate: getTomorrowString(), priority: 'high' });
    // draft chips reset
    click(chip(m.host, 'Today'));
    click(chip(m.host, 'Today'));
    type(draftInput(m.host), 'Other');
    act(() => {
      fireEvent.submit($(m!.host, 'form')!);
    });
    await advance(600);
    expect(storage.saves[1]!.tasks[0]!.dueDate).toBeUndefined();
  });

  it('files into the open custom list, and Today gets today as due date', async () => {
    m = await mountTasks([]);
    click(listEntry(m.host, 'Shopping'));
    type(draftInput(m.host), 'Eggs');
    act(() => {
      fireEvent.submit($(m!.host, 'form')!);
    });
    click(listEntry(m.host, 'Today'));
    type(draftInput(m.host), 'Call');
    act(() => {
      fireEvent.submit($(m!.host, 'form')!);
    });
    await advance(600);
    const saved = storage.saves.at(-1)!.tasks;
    expect(saved.find((t) => t.text === 'Eggs')!.category).toBe('Shopping');
    expect(saved.find((t) => t.text === 'Call')).toMatchObject({ category: 'Inbox', dueDate: today() });
  });
});

describe('Tasks: stream and inspector', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  it('toggling the checkbox completes without opening the inspector', async () => {
    m = await mountTasks([seedTask(0), seedTask(1)]);
    const box = $$(rows(m.host)[0]!, 'input[type="checkbox"], [role="checkbox"], button')[0]!;
    click(box);
    await advance(600);
    expect(storage.saves.at(-1)!.tasks.filter((t) => t.done).map((t) => t.id).length).toBe(1);
    expect(inspectorOpen(m.host)).toBe(false);
  });

  it('opens the inspector on a row, edits name, notes, priority, category; saves', async () => {
    m = await mountTasks([seedTask(0)]);
    open(m.host, 'Task number 0');
    expect(nameInput(m.host).value).toBe('Task number 0');
    type(nameInput(m.host), 'Renamed');
    type(notesArea(m.host), 'details');
    click($$($(m.host, '[data-duyo-id="' + m.app.root.$['inspector']!.$['priorities']!.id + '"]')!, '[data-duyo-kind="Tasks.Pill"]').find((p) => p.textContent === 'Medium')!);
    const category = m.app.root.$['inspector']!.$['category']!;
    act(() => category.doChange({ value: 'Work' }));
    expect(rowTexts(m.host)).toEqual(['Renamed']);
    await advance(600);
    expect(storage.saves.at(-1)!.tasks[0]).toMatchObject({
      text: 'Renamed',
      notes: 'details',
      priority: 'medium',
      category: 'Work',
    });
    expect(m.host.textContent).toContain('Saved to Pyxis PIM storage');
  });

  it('the due date picker writes an ISO date', async () => {
    m = await mountTasks([seedTask(0)]);
    open(m.host, 'Task number 0');
    act(() => m!.app.root.$['inspector']!.$['due']!.doChange({ value: new Date('2031-05-04T12:00:00Z') }));
    await advance(600);
    expect(storage.saves.at(-1)!.tasks[0]!.dueDate).toBe('2031-05-04');
  });

  it('close button gets its aria-label and closes the inspector', async () => {
    m = await mountTasks([seedTask(0)]);
    open(m.host, 'Task number 0');
    const close = $(m.host, 'button[aria-label="Close Inspector"]')!;
    expect(close).toBeTruthy();
    click(close);
    expect(inspectorOpen(m.host)).toBe(false);
  });

  it('delete asks first, then removes the task and closes the inspector', async () => {
    m = await mountTasks([seedTask(0), seedTask(1)]);
    open(m.host, 'Task number 0');
    click(buttonText(m.host, 'Delete'));
    expect(document.body.textContent).toContain('This cannot be undone.');
    expect(document.body.textContent).toContain('Task number 0');
    expect(rows(m.host).length).toBe(2);
    click($$(document.body, 'button').filter((b) => b.textContent === '(Delete)').at(-1)!);
    expect(rowTexts(m.host)).toEqual(['Task number 1']);
    expect(inspectorOpen(m.host)).toBe(false);
    await advance(600);
    expect(storage.saves.at(-1)!.tasks.map((t) => t.id)).toEqual(['t1']);
  });

  it('cancelling a dialog does not close the app (no close message to the shell)', async () => {
    const post = vi.spyOn(window, 'close').mockImplementation(() => {});
    m = await mountTasks([seedTask(0)]);
    open(m.host, 'Task number 0');
    click(buttonText(m.host, 'Delete'));
    click($$(document.body, 'button').filter((b) => b.textContent === '(Cancel)').at(-1)!);
    expect(post).not.toHaveBeenCalled();
    expect(rows(m.host).length).toBe(1);
  });

  it('Clear Done is offered only with completed tasks and clears them after confirming', async () => {
    m = await mountTasks([seedTask(0), seedTask(1, { done: true }), seedTask(2, { done: true })]);
    const wrap = $(m.host, '[title="Clear completed tasks"]')!;
    expect(wrap.style.display).not.toBe('none');
    click(buttonText(m.host, 'Clear Done'));
    expect(document.body.textContent).toContain('clear all 2 completed tasks?');
    click($$(document.body, 'button').filter((b) => b.textContent === '(Clear Done)').at(-1)!);
    expect(rowTexts(m.host)).toEqual(['Task number 0']);
    expect($(m.host, '[title="Clear completed tasks"]')!.style.display).toBe('none');
    await advance(600);
    expect(storage.saves.at(-1)!.tasks.map((t) => t.id)).toEqual(['t0']);
  });

  it('flags overdue and due-today rows', async () => {
    m = await mountTasks([seedTask(0, { dueDate: '2001-01-01' }), seedTask(1, { dueDate: today() })]);
    expect(m.host.textContent).toContain('Overdue (');
    expect(m.host.textContent).toContain('Today');
  });

  it('flushes a pending save when the app is destroyed', async () => {
    m = await mountTasks([seedTask(0)]);
    open(m.host, 'Task number 0');
    type(nameInput(m.host), 'Late');
    expect(storage.saves).toEqual([]);
    m.unmount();
    m = undefined;
    expect(storage.saves.at(-1)!.tasks[0]!.text).toBe('Late');
  });
});

describe('Tasks: Wave B fixes', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  it("today is the device's calendar day, not UTC's", async () => {
    vi.setSystemTime(new Date(2030, 0, 31, 23, 30));
    const { getTodayString, getTomorrowString } = await import('../model');
    expect(getTodayString()).toBe('2030-01-31');
    expect(getTomorrowString()).toBe('2030-02-01');
  });

  it('the due date shows as that local day, a pick stores that day, and Clear removes it', async () => {
    m = await mountTasks([seedTask(0, { dueDate: '2031-05-04' })]);
    open(m.host, 'Task number 0');
    const due = m.app.root.$['inspector']!.$['due']!;
    const shown = due.get('value') as Date;
    expect([shown.getFullYear(), shown.getMonth(), shown.getDate()]).toEqual([2031, 4, 4]);
    act(() => due.doChange({ value: new Date(2032, 2, 1) }));
    await advance(600);
    expect(storage.saves.at(-1)!.tasks[0]!.dueDate).toBe('2032-03-01');
    click($(m.host, 'button[aria-label="Clear Due Date"]') ?? $(m.host, '[title="Clear Due Date"] button')!);
    await advance(600);
    expect(storage.saves.at(-1)!.tasks[0]!.dueDate).toBeUndefined();
  });

  it('an emptied name is not saved: the task keeps its last name', async () => {
    m = await mountTasks([seedTask(0)]);
    open(m.host, 'Task number 0');
    type(nameInput(m.host), '   ');
    await advance(600);
    expect(storage.saves).toEqual([]);
    expect(rowTexts(m.host)).toEqual(['Task number 0']);
  });

  it('a failed save never says Saved: it shows the error, and Retry writes again', async () => {
    m = await mountTasks([seedTask(0)]);
    open(m.host, 'Task number 0');
    storage.fail = true;
    type(nameInput(m.host), 'Renamed');
    await advance(600);
    const root = m.app.root.$;
    expect(root['saveErrorBanner']!.getShowing()).toBe(true);
    expect(root['inspector']!.$['saved']!.getShowing()).toBe(false);
    storage.fail = false;
    click($$(m.host, 'button').find((b) => b.textContent?.includes('Retry'))!);
    await advance(0);
    expect(storage.saves.at(-1)!.tasks[0]!.text).toBe('Renamed');
    expect(root['saveErrorBanner']!.getShowing()).toBe(false);
    expect(root['inspector']!.$['saved']!.getShowing()).toBe(true);
  });

  it('search narrows the stream by title and notes, and Escape clears it', async () => {
    m = await mountTasks([seedTask(0), seedTask(1, { notes: 'call the plumber' }), seedTask(2)]);
    const search = $(m.host, 'input[placeholder="Search tasks…"]') as HTMLInputElement;
    type(search, 'plumber');
    expect(rowTexts(m.host)).toEqual(['Task number 1']);
    type(search, 'number 2');
    expect(rowTexts(m.host)).toEqual(['Task number 2']);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(search.value).toBe('');
    expect(rows(m.host).length).toBe(3);
  });

  it('in the narrow layout quick add stays in the stream, with the field still focused', async () => {
    m = await mountTasks([]);
    type(draftInput(m.host), 'First');
    act(() => {
      fireEvent.submit($(m!.host, 'form')!);
    });
    expect(rowTexts(m.host)).toEqual(['First']);
    expect(inspectorOpen(m.host)).toBe(false);
    expect(document.activeElement).toBe(draftInput(m.host));
  });

  it('Ctrl+N puts the keyboard in the quick-add field', async () => {
    m = await mountTasks([seedTask(0)]);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }));
    });
    expect(document.activeElement).toBe(draftInput(m.host));
  });
});

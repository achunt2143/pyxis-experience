// @vitest-environment jsdom
//
// Gap 4 of docs/internal/pyxis-duyo-port-plan.md: RuntimeView re-renders every node on any
// runtime change. This prints what that costs in Notes; it asserts nothing about speed, so
// it cannot fail CI, and it is skipped unless asked for:
//
//   VITE_NOTES_PERF=1 npx vitest run packages/apps/notes/src/__tests__/rerenderCost --disableConsoleIntercept
//
// Per scenario it reports (per operation, averaged over 100): binding renders (one per
// NodeView that draws, counted by wrapping every pack binding), how many of them were
// adapted React libraries (remochi.* and pyxis.Icon, each of which also re-renders its
// library component), React commits, the Profiler's render time, runtime changes (version
// bumps) and wall time including jsdom's event dispatch and DOM updates.
import { Profiler, type ComponentType, type ProfilerOnRenderCallback, type ReactNode } from 'react';
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntime, type Component } from '@duyojs/duyo';
import { RuntimeView, createRenderer, type BindingProps, type KindPack } from '@duyojs/duyo/react';
import { createPyxisPacks, installPyxisPacks } from '@pyxis/app-sdk/duyo';
import type { Note } from '../model';
import { bodyArea, seedNote, storage, stubCanvas, titled, type } from './testUtils';

vi.mock('../../../../app-sdk/src/appStorage', () => ({
  loadAppData: async () => structuredClone(storage.doc),
  saveAppData: async () => true,
}));
vi.mock('../../../../app-sdk/src/usePyxisTheme', () => ({ usePyxisTheme: () => 'light' }));

stubCanvas();

const enabled = import.meta.env['VITE_NOTES_PERF'] === '1';
const KEYS = 100;

const counts = { total: 0, adapted: 0, byKind: new Map<string, number>() };
const isAdapted = (kind: string) => kind.startsWith('remochi.') || kind === 'pyxis.Icon';
/** A function, not inline `counts.x++`: the hooks lint forbids a component writing to module state. */
function tally(kind: string) {
  counts.total++;
  if (isAdapted(kind)) counts.adapted++;
  counts.byKind.set(kind, (counts.byKind.get(kind) ?? 0) + 1);
}

/** Every binding counted, nothing else changed. */
function counting(packs: readonly KindPack[]): KindPack[] {
  return packs.map((pack) => ({
    ...pack,
    bindings: Object.fromEntries(
      Object.entries(pack.bindings).map(([kind, binding]) => {
        const Inner = binding.component as ComponentType<BindingProps>;
        const Counted = (props: BindingProps): ReactNode => {
          tally(props.node.kind);
          return <Inner {...props} />;
        };
        return [kind, { ...binding, component: Counted }];
      })
    ),
  }));
}

async function mountCounted(notes: Note[]) {
  storage.doc = { notes: structuredClone(notes) };
  const packs = createPyxisPacks();
  const runtime = createRuntime();
  installPyxisPacks(runtime.registry, packs);
  const root = runtime.create({ kind: 'Notes.App', windowId: 'perf' });
  const renderer = createRenderer(counting(packs));
  const profile = { commits: 0, ms: 0 };
  const onRender: ProfilerOnRenderCallback = (_id, _phase, actual) => {
    profile.commits++;
    profile.ms += actual;
  };
  const view = render(
    <Profiler id="notes" onRender={onRender}>
      <RuntimeView root={root} renderer={renderer} />
    </Profiler>
  );
  await act(async () => {});
  return { view, root, runtime, profile };
}

function measure(
  label: string,
  { runtime, profile }: Awaited<ReturnType<typeof mountCounted>>,
  op: (i: number) => void
) {
  for (let i = 0; i < 10; i++) op(-1 - i); // warm up
  counts.total = counts.adapted = 0;
  counts.byKind.clear();
  profile.commits = 0;
  profile.ms = 0;
  const version = runtime.version;
  const t0 = performance.now();
  for (let i = 0; i < KEYS; i++) op(i);
  const wall = performance.now() - t0;
  const top = [...counts.byKind.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, n]) => `${k} ${Math.round(n / KEYS)}`)
    .join(', ');
  console.log(
    `PERF ${label}: ${(wall / KEYS).toFixed(2)} ms/op wall | ${(profile.ms / KEYS).toFixed(2)} ms/op React render | ` +
      `${Math.round(counts.total / KEYS)} binding renders/op (${Math.round(counts.adapted / KEYS)} adapted) | ` +
      `${(profile.commits / KEYS).toFixed(1)} commits/op | ${((runtime.version - version) / KEYS).toFixed(1)} runtime changes/op | top: ${top}`
  );
}

const nodeCount = (c: Component): number => 1 + c.children.reduce((n, k) => n + nodeCount(k), 0);

afterEach(() => vi.restoreAllMocks());

describe.skipIf(!enabled).each([50, 200])('Notes re-render cost, %i notes', (n) => {
  it('keystroke, pin toggle, and one unrelated change', async () => {
    const notes = Array.from({ length: n }, (_, i) => seedNote(i, { pinned: i % 9 === 0 }));
    const m = await mountCounted(notes);
    const host = m.view.container;
    console.log(`PERF ${n} notes: ${nodeCount(m.root)} components in the tree`);

    measure(`${n} notes, keystroke in the body`, m, () => {
      const area = bodyArea(host);
      type(area, area.value + 'x');
    });

    measure(`${n} notes, pin toggle`, m, () => {
      const pin = titled(host, 'Pin Note to Top') ?? titled(host, 'Unpin Note');
      act(() => {
        fireEvent.click(pin);
      });
    });

    // The cheapest possible change: one string on one leaf, as a ticking clock would make.
    const edited = m.root.$['editor']!.$['edited']!;
    measure(`${n} notes, one leaf setContent (a clock tick)`, m, (i) => {
      act(() => {
        edited.setContent(`tick ${i}`);
      });
    });

    expect(counts.total).toBeGreaterThan(0);
    m.view.unmount();
  }, 300_000);
});

import { createRuntime, KindRegistry, type Component, type ComponentDefinition, type KindInput } from '@duyojs/duyo';
import { basePack, createRenderer, installPack, RuntimeView } from '@duyojs/duyo/react';
import { render } from '@testing-library/react';

import { Search, Trash2, X } from 'lucide-react';

import { pyxisPack, registerIcons } from '../pack';

registerIcons({ Search, Trash2, X });

/**
 * A private registry and runtime per call (never the global default registry), with the
 * base pack and the Pyxis pack installed, `kinds` registered on top, and `definition`
 * created and drawn.
 */
export function mount(definition: ComponentDefinition, kinds: readonly KindInput[] = []) {
  const registry = new KindRegistry();
  installPack(registry, basePack);
  installPack(registry, pyxisPack);
  for (const kind of kinds) registry.register(kind);

  const diagnostics: string[] = [];
  const runtime = createRuntime({ registry, onDiagnostic: (d) => diagnostics.push(`${d.code}: ${d.message}`) });
  const root = runtime.create(definition);
  const renderer = createRenderer([basePack, pyxisPack]);
  const view = render(<RuntimeView root={root} renderer={renderer} />);
  return { ...view, root, runtime, diagnostics };
}

/** The element a component was drawn as. */
export const elementOf = (container: HTMLElement, component: Component) =>
  container.querySelector<HTMLElement>(`[data-duyo-id="${component.id}"]`)!;

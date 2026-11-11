import React from 'react';
import ReactDOM from 'react-dom/client';
import type { ReactNode } from 'react';
import {
  createRuntime,
  kindName,
  type ActionContext,
  type Component,
  type ComponentDefinition,
  type KindReference,
  type Runtime,
} from '@duyojs/duyo';
import { RuntimeView, createRenderer, type KindPack } from '@duyojs/duyo/react';
import type { PyxisTheme } from '../usePyxisTheme';
import { createPyxisPacks, installPyxisPacks } from './packs';

/** Registered as a runtime action; the root's `onClose` delegate names it. */
const CLOSE_ACTION = 'pyxis:app-close';

/**
 * The full-viewport column AppShell puts inside its ThemeWrapper. As a pack
 * wrapper it is the innermost one, so it sits inside the theme wrapper too.
 */
const viewportPack: KindPack = {
  name: 'pyxis.viewport',
  kinds: [],
  bindings: {},
  wrapper: ({ children }: { children: ReactNode }) => (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {children}
    </div>
  ),
};

export interface MountDuyoOptions {
  defaultTheme?: PyxisTheme;
  /** Where to draw; default `#root`. */
  element?: Element;
  /**
   * The app's own packs (its `adapt()`ed React islands, via `createPack` from
   * `@duyojs/duyo/react`), installed and drawn after the Pyxis packs.
   */
  packs?: readonly KindPack[];
}

export interface DuyoApp {
  runtime: Runtime;
  root: Component;
  unmount(): void;
}

/**
 * mountDuyoApp
 * ------------
 * The Duyo twin of `mountStandaloneApp`: entry point for an app's own HTML
 * page. Same `?windowId` (published on the root kind as `windowId` when the
 * kind declares that property), same cooperative close (`pyxis:app-close` to
 * the embedding shell, else `window.close()` when top-level), same
 * full-viewport column inside remochi's themed wrapper.
 *
 * `root` is a kind (its name, or the definition `kind()` returned) or a
 * component definition (`{ kind, name, ...properties }`). It is created on a
 * runtime over Duyo's default registry, where module-level `kind()` calls
 * register, with the Pyxis packs installed.
 *
 * Close: Duyo has no "quit" notion, so the root gets an `onClose` delegate
 * naming an action registered on the runtime. Any component inside the app
 * closes it by bubbling `onClose` to the root: `this.bubble('onClose')`, or
 * `this.doClose()` on a kind that declares `events: { onClose: '' }`. A
 * kind-level `handlers: { onClose: 'method' }` runs first and can veto by
 * returning true. A root definition that sets its own `onClose` keeps it.
 * An `onClose` a remochi widget raises (a Dialog or popup dismissing itself)
 * is not the app's and never closes it, though it still reaches handlers.
 */
export function mountDuyoApp(
  root: KindReference | ComponentDefinition,
  opts: MountDuyoOptions = {}
): DuyoApp {
  const windowId = new URLSearchParams(window.location.search).get('windowId') ?? 'standalone';

  const requestClose = ({ event }: ActionContext) => {
    // remochi's Dialog, PopupPanel, … raise `onClose` when they dismiss
    // themselves; it bubbles to the root like the app's own.
    if (event.originator?.kind.startsWith('remochi.')) return;
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'pyxis:app-close', windowId }, '*');
    } else {
      window.close();
    }
  };

  const packs = [...createPyxisPacks({ defaultTheme: opts.defaultTheme }), ...(opts.packs ?? [])];
  const runtime = createRuntime();
  installPyxisPacks(runtime.registry, packs);
  runtime.actions.register(CLOSE_ACTION, requestClose);

  // `kind()` returns a definition whose `name` is the kind's; a component
  // definition's `name` is its own, so a registered name means "a kind".
  const isKind = typeof root === 'string' || (typeof root.name === 'string' && runtime.registry.has(root.name));
  const definition: ComponentDefinition = isKind ? { kind: root as KindReference } : { ...(root as ComponentDefinition) };
  const kind = kindName((definition.kind ?? 'duyo.Control') as KindReference);
  if (runtime.registry.resolve(kind).published.has('windowId')) definition.windowId ??= windowId;
  if (typeof definition.onClose !== 'string') definition.onClose = CLOSE_ACTION;

  const renderer = createRenderer([...packs, viewportPack]);
  const component = runtime.create(definition);
  const reactRoot = ReactDOM.createRoot(opts.element ?? document.getElementById('root')!);
  reactRoot.render(
    <React.StrictMode>
      <RuntimeView root={component} renderer={renderer} />
    </React.StrictMode>
  );

  return {
    runtime,
    root: component,
    unmount: () => {
      reactRoot.unmount();
      runtime.destroy();
    },
  };
}

export default mountDuyoApp;

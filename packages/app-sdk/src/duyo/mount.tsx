import React from 'react';
import ReactDOM from 'react-dom/client';
import type { ReactNode } from 'react';
import {
  createRuntime,
  kindName,
  type Component,
  type ComponentDefinition,
  type KindReference,
  type Runtime,
} from '@duyojs/duyo';
import { RuntimeView, createRenderer, type KindPack } from '@duyojs/duyo/react';
import type { PyxisTheme } from '../usePyxisTheme';
import { resolveAppAccent } from '../identity';
import { createPyxisPacks, installPyxisPacks } from './packs';

export interface MountDuyoOptions {
  defaultTheme?: PyxisTheme;
  /** Optional `#rrggbb` per-app accent (defaults to the root kind's built-in accent when known). */
  accent?: string;
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
 * Close: Duyo has no "quit" notion, so unhandled `onClose` events that bubble
 * past the root close the app. Any component inside the app closes it by
 * bubbling `onClose`: `this.bubble('onClose')`, or `this.doClose()` on a kind
 * that declares `events: { onClose: '' }`. A kind-level `handlers: { onClose: 'method' }`
 * or root `onClose` delegate can handle and veto by returning true (or by
 * naming a root `onClose` action delegate in the definition).
 */
export function mountDuyoApp(
  root: KindReference | ComponentDefinition,
  opts: MountDuyoOptions = {}
): DuyoApp {
  const windowId = new URLSearchParams(window.location.search).get('windowId') ?? 'standalone';

  const requestClose = () => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'pyxis:app-close', windowId }, '*');
    } else {
      window.close();
    }
  };

  const rootKindHint =
    typeof root === 'string'
      ? root
      : 'kind' in root && typeof root.kind === 'string'
        ? root.kind
        : typeof root.name === 'string'
          ? root.name
          : undefined;
  const accent = resolveAppAccent(opts.accent, rootKindHint);
  const packs = [...createPyxisPacks({ defaultTheme: opts.defaultTheme, accent }), ...(opts.packs ?? [])];
  const runtime = createRuntime();
  installPyxisPacks(runtime.registry, packs);

  // `kind()` returns a definition whose `name` is the kind's; a component
  // definition's `name` is its own, so a registered name means "a kind".
  const isKind = typeof root === 'string' || (typeof root.name === 'string' && runtime.registry.has(root.name));
  const definition: ComponentDefinition = isKind ? { kind: root as KindReference } : { ...(root as ComponentDefinition) };
  const kind = kindName((definition.kind ?? 'duyo.Control') as KindReference);
  if (runtime.registry.resolve(kind).published.has('windowId')) definition.windowId ??= windowId;
  if (typeof definition.onClose !== 'string') {
    runtime.onUnhandled('onClose', requestClose);
  }
  const renderer = createRenderer(packs);
  const component = runtime.create(definition);
  const Viewport = ({ children }: { children: ReactNode }) => (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {children}
    </div>
  );
  const reactRoot = ReactDOM.createRoot(opts.element ?? document.getElementById('root')!);
  reactRoot.render(
    <React.StrictMode>
      <RuntimeView root={component} renderer={renderer} wrapper={Viewport} />
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

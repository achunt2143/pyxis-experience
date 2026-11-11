import type { ReactNode } from 'react';
import '@duyojs/duyo/remochi/css';
import { basePack, installPack, type KindPack } from '@duyojs/duyo/react';
import type { KindRegistry } from '@duyojs/duyo';
import { createRemochiPack } from '@duyojs/duyo/remochi';
import { ThemeWrapper } from 'remochi';
import { usePyxisTheme, type PyxisTheme } from '../usePyxisTheme';
import { pyxisPack } from './pack';

export interface PyxisPacksOptions {
  /** Used until the persisted `pyxis.theme` arrives (Terminal wants dark). */
  defaultTheme?: PyxisTheme;
}

/**
 * The packs every Pyxis Duyo app draws through, outermost first (RuntimeView
 * wraps the earliest pack's `wrapper` outside the rest):
 *
 *  1. `pyxis.theme`: remochi's root `ThemeWrapper`, controlled by the user's
 *     `pyxis.theme`. `usePyxisTheme` already resolves `auto` to light/dark, so
 *     it maps straight onto ThemeMode. Controlled, a change re-themes in place:
 *     none of AppShell's ThemeSync or `key={theme}` workarounds is needed.
 *  2. Duyo's base kinds, 3. every remochi component as `remochi.*` (its own
 *     theme wrapper off, so the one above is the only one), 4. `pyxis.*`.
 *
 * The remochi stylesheet is loaded here, once, as a side effect of importing
 * this module.
 */
export function createPyxisPacks(options: PyxisPacksOptions = {}): KindPack[] {
  const defaultTheme = options.defaultTheme ?? 'light';
  const Theme = ({ children }: { children: ReactNode }) => {
    const theme = usePyxisTheme(defaultTheme);
    return <ThemeWrapper theme={theme}>{children}</ThemeWrapper>;
  };
  const themePack: KindPack = { name: 'pyxis.theme', kinds: [], bindings: {}, wrapper: Theme };
  return [themePack, basePack, createRemochiPack({ theme: false }), pyxisPack];
}

/**
 * Registers the packs' kinds, skipping any the registry already has.
 * `installPack` throws on a name clash, and a second call is ordinary: HMR
 * re-runs an entry module, and two mounts can share a document's registry.
 */
export function installPyxisPacks(registry: KindRegistry, packs: readonly KindPack[]): void {
  for (const pack of packs) {
    installPack(registry, { ...pack, kinds: pack.kinds.filter((kind) => !registry.has(kind.name)) });
  }
}

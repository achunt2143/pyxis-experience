import { cloneElement, isValidElement, type ReactNode } from 'react';
import '@duyojs/duyo/remochi/css';
import '../identity.css';
import { basePack, installPack, type BindingProps, type KindPack, type RendererBinding } from '@duyojs/duyo/react';
import type { KindRegistry } from '@duyojs/duyo';
import { createRemochiPack } from '@duyojs/duyo/remochi';
import { ThemeWrapper } from 'remochi';
import { appAccentTokens } from '../identity';
import * as pyxisTheme from '../usePyxisTheme';
import type { PyxisTheme } from '../usePyxisTheme';
import { pyxisPack } from './pack';

const usePyxisAnimationMode =
  'usePyxisAnimationMode' in pyxisTheme ? pyxisTheme.usePyxisAnimationMode : () => 'full' as const;
const usePyxisAccessibility =
  'usePyxisAccessibility' in pyxisTheme ? pyxisTheme.usePyxisAccessibility : () => undefined;

const ARIA_FORWARDED_KINDS = new Set(['remochi.Button', 'remochi.Toggle', 'remochi.Slider']);

function withInnerAria(pack: KindPack): KindPack {
  const kinds = pack.kinds.map((kind) =>
    ARIA_FORWARDED_KINDS.has(kind.name)
      ? { ...kind, published: { ...kind.published, ariaLabel: '' } }
      : kind,
  );
  const bindings: Record<string, RendererBinding> = { ...pack.bindings };
  for (const name of ARIA_FORWARDED_KINDS) {
    const orig = bindings[name];
    if (!orig) continue;
    const OrigComponent = orig.component;
    const ForwardedComponent = (props: BindingProps): ReactNode => {
      const propLabel = props.node.get('ariaLabel');
      const {
        'aria-label': attrLabel,
        'aria-labelledby': ariaLabelledBy,
        'aria-describedby': ariaDescribedBy,
        ...restHostProps
      } = props.hostProps;
      const resolvedLabel =
        typeof propLabel === 'string' && propLabel !== ''
          ? propLabel
          : typeof attrLabel === 'string' && attrLabel !== ''
            ? attrLabel
            : undefined;
      const innerAria: Record<string, string> = {};
      if (resolvedLabel !== undefined) innerAria['aria-label'] = resolvedLabel;
      if (typeof ariaLabelledBy === 'string' && ariaLabelledBy !== '') {
        innerAria['aria-labelledby'] = ariaLabelledBy;
      }
      if (typeof ariaDescribedBy === 'string' && ariaDescribedBy !== '') {
        innerAria['aria-describedby'] = ariaDescribedBy;
      }
      if (Object.keys(innerAria).length === 0) {
        return (OrigComponent as (p: BindingProps) => ReactNode)(props);
      }
      const rendered = (OrigComponent as (p: BindingProps) => ReactNode)({
        ...props,
        hostProps: restHostProps,
      });
      if (isValidElement<{ children?: ReactNode }>(rendered) && isValidElement(rendered.props.children)) {
        return cloneElement(rendered, undefined, cloneElement(rendered.props.children, innerAria));
      }
      return rendered;
    };
    ForwardedComponent.displayName = `WithInnerAria(${name})`;
    bindings[name] = { ...orig, component: ForwardedComponent };
  }
  return { ...pack, kinds, bindings };
}

export interface PyxisPacksOptions {
  /** Used until the persisted `pyxis.theme` arrives (Terminal wants dark). */
  defaultTheme?: PyxisTheme;
  /** Optional `#rrggbb` per-app accent or built-in app id/root kind. */
  accent?: string;
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
 * The remochi stylesheet (including dark-mode token overrides) and Pyxis
 * static identity tokens (`identity.css`, `--px-corner*` / `--px-font-*`)
 * are loaded here, once, as a side effect of importing this module.
 */
export function createPyxisPacks(options: PyxisPacksOptions = {}): KindPack[] {
  const defaultTheme = options.defaultTheme ?? 'light';
  const tokens = appAccentTokens(options.accent, options.accent);
  const Theme = ({ children }: { children: ReactNode }) => {
    const theme = pyxisTheme.usePyxisTheme(defaultTheme);
    usePyxisAnimationMode();
    usePyxisAccessibility();
    return (
      <ThemeWrapper theme={theme} tokens={tokens}>
        {children}
      </ThemeWrapper>
    );
  };
  const themePack: KindPack = { name: 'pyxis.theme', kinds: [], bindings: {}, wrapper: Theme };
  return [themePack, basePack, withInnerAria(createRemochiPack({ theme: false })), pyxisPack];
}

/**
 * Registers the packs' kinds, skipping any the registry already has.
 * `installPack` throws on a name clash, and a second call is ordinary: HMR
 * re-runs an entry module, and two mounts can share a document's registry.
 */
export function installPyxisPacks(registry: KindRegistry, packs: readonly KindPack[]): void {
  for (const pack of packs) {
    installPack(registry, pack, { skipExisting: true });
  }
}

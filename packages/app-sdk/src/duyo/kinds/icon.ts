import { adapt, type PackEntry } from '@duyojs/duyo/react';
import type { LucideProps } from 'lucide-react';
import { createElement, useEffect, type ComponentType } from 'react';

import { filterAttributes } from './attributes';
import { domEventHandlers } from './events';

const warned = new Set<string>();

const pascal = (name: string) =>
  name
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

// Only the icons an app registers. Looking names up in lucide's own `icons` map kept all
// ~1.7k of them in every bundle (Notes went 510 KB -> 1161 KB); named imports tree-shake.
const registry = new Map<string, ComponentType<LucideProps>>();

/**
 * Makes icons drawable by name: `registerIcons({ Trash2, Pin })` with lucide's named
 * exports, once, before mounting. The key is the name specs use, so an alias such as
 * `CheckCircle2` works when registered under it.
 */
export function registerIcons(icons: Record<string, ComponentType<LucideProps>>): void {
  for (const [name, icon] of Object.entries(icons)) registry.set(pascal(name), icon);
}

/** `Trash2`, or its kebab-case spelling `trash-2`; undefined when nothing registered it. */
export function findIcon(name: unknown): ComponentType<LucideProps> | undefined {
  if (typeof name !== 'string' || name === '') return undefined;
  return registry.get(pascal(name));
}

interface IconViewProps extends LucideProps {
  icon: unknown;
  /** Resolved by the props mapper, so no component is looked up during render. */
  glyph: ComponentType<LucideProps> | undefined;
}

function IconView({ icon, glyph, ...rest }: IconViewProps) {
  const missing = glyph === undefined && typeof icon === 'string' && icon !== '';
  useEffect(() => {
    if (missing && !warned.has(icon as string)) {
      warned.add(icon as string);
      console.warn(`pyxis.Icon: no icon "${icon as string}" is registered (registerIcons).`);
    }
  }, [missing, icon]);
  return glyph ? createElement(glyph, rest) : null;
}

/**
 * `{ kind: 'pyxis.Icon', icon: 'Trash2', size: 16 }`. The `<svg>` itself carries the
 * Duyo class, style, identity, `ontap`, attributes and DOM events (`host: 'props'`), so it
 * lays out like the lucide component it replaces. An unknown name draws nothing and warns
 * once (the element is simply absent, so give a tap target a pyxis.Control around it).
 */
export const iconEntry: PackEntry = adapt({
  name: 'pyxis.Icon',
  kind: 'pyxis.Control',
  component: IconView as ComponentType,
  host: 'props',
  published: { icon: '', size: 18, color: undefined, strokeWidth: 2 },
  props: (node) => ({
    icon: node.get('icon'),
    glyph: findIcon(node.get('icon')),
    size: node.get('size'),
    color: node.get('color'),
    strokeWidth: node.get('strokeWidth'),
    ...filterAttributes(node.get('attributes')),
    ...domEventHandlers(node),
  }),
});

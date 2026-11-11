import type { Component, KindDefinition } from '@duyojs/duyo';
import type { BindingProps, RendererBinding } from '@duyojs/duyo/react';
import { createElement, type ChangeEvent, type KeyboardEvent, type ReactNode, type SyntheticEvent } from 'react';

import { filterAttributes } from './attributes';
import { domEventHandlers } from './events';

/**
 * duyo.Control's set plus what the shell and apps draw: controls and media. `tag` is
 * redeclared in full because a subkind's bare value only changes the default; to widen
 * `allowed` it has to restate the declaration (registry.ts, `declare`).
 */
export const CONTROL_TAGS = [
  'div', 'span', 'section', 'article', 'header', 'footer', 'nav', 'main', 'aside',
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'label',
  'button', 'a', 'img', 'input', 'form', 'canvas',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'pre', 'code', 'kbd', 'strong', 'em', 'small',
  'hr', 'br', 'figure', 'figcaption', 'details', 'summary',
] as const;

/** Elements React refuses children on. */
const VOID_TAGS: ReadonlySet<string> = new Set(['img', 'input', 'hr', 'br']);

/** `javascript:` and friends are not links an app spec may make (browsers ignore control characters inside the scheme). */
// eslint-disable-next-line no-control-regex
const safeHref = (href: string) => !/^(javascript|data|vbscript):/i.test(href.replace(/[\u0000-\u0020]/g, ''));

export const controlKind: KindDefinition = {
  name: 'pyxis.Control',
  kind: 'duyo.Control',
  published: {
    /**
     * Extra element attributes: `data-*`, `aria-*`, `role`, `tabIndex`, `id`, `title`,
     * `draggable`. Anything else is dropped (see attributes.ts). Treat the object as
     * immutable: set a new one to change it.
     */
    attributes: {},
    tag: { default: 'div', allowed: CONTROL_TAGS },
    /** `img`'s picture and `a`'s link; ignored by other tags. */
    src: '',
    alt: '',
    href: '',
    target: '',
    /** `button` and `input`: the element's `type` (a button's defaults to "button"). */
    type: '',
    disabled: false,
    /** `input` only; two-way like duyo.Input: typing writes `value` and bubbles `oninput`. */
    value: '',
    placeholder: '',
  },
};

type Extra = Record<string, unknown>;

const text = (node: Component, property: string): string | undefined => {
  const value = node.get(property);
  return typeof value === 'string' && value !== '' ? value : undefined;
};

/** The element properties a tag needs beyond the shared host props. */
function tagProps(node: Component, tag: string, bubble: BindingProps['bubble']): Extra {
  switch (tag) {
    case 'img':
      return { src: text(node, 'src'), alt: node.get('alt') ?? '' };
    case 'a': {
      const href = text(node, 'href');
      const target = text(node, 'target');
      return {
        href: href !== undefined && safeHref(href) ? href : undefined,
        target,
        rel: target === '_blank' ? 'noopener noreferrer' : undefined,
      };
    }
    case 'button':
      return { type: text(node, 'type') ?? 'button', disabled: node.get('disabled') === true };
    case 'form':
      return {
        onSubmit: (event: SyntheticEvent) => {
          event.preventDefault();
          bubble('onsubmit', { type: 'submit', nativeEvent: event.nativeEvent });
        },
      };
    case 'input': {
      const handlers = domEventHandlers(node);
      const commit = () => bubble('onchange', { type: 'change', value: node.get('value') });
      return {
        type: text(node, 'type') ?? 'text',
        value: String(node.get('value') ?? ''),
        placeholder: text(node, 'placeholder'),
        disabled: node.get('disabled') === true,
        onChange: (event: ChangeEvent<HTMLInputElement>) => {
          node.set('value', event.target.value);
          bubble('oninput', { type: 'input', value: event.target.value });
        },
        // Blur and Enter commit, as duyo.Input does, after the DOM-event mapping has run.
        onBlur: (event: SyntheticEvent) => {
          handlers.onBlur(event);
          commit();
        },
        onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
          handlers.onKeyDown(event);
          if (event.key === 'Enter') commit();
        },
      };
    }
    default:
      return {};
  }
}

/**
 * Everything a pyxis element gets: attributes first, so the renderer's identity
 * (`data-duyo-kind`/`-id`, `className`, `style`, `onClick`) cannot be overridden by a spec,
 * then the DOM-event mapping, then what the tag needs.
 */
export function pyxisHostProps(props: BindingProps, tag: string): Extra {
  const { node, hostProps, bubble } = props;
  const attributes: Extra = { ...filterAttributes(node.get('attributes')) };
  return {
    ...attributes,
    ...domEventHandlers(node),
    ...hostProps,
    ...tagProps(node, tag, bubble),
  };
}

/** Draws a pyxis.Control (or a kind built on it); `children` replaces the rendered children. */
export function renderControl(props: BindingProps, children: ReactNode = props.children): ReactNode {
  const { node } = props;
  const tag = String(node.get('tag') ?? 'div');
  const hostProps = pyxisHostProps(props, tag);
  if (VOID_TAGS.has(tag)) return createElement(tag, hostProps);

  const content = node.get('content');
  return createElement(tag, hostProps, typeof content === 'string' && content !== '' ? content : null, children);
}

function PyxisControl(props: BindingProps): ReactNode {
  return renderControl(props);
}

export const controlBinding: RendererBinding = { component: PyxisControl };

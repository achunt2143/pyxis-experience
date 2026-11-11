// DOM events on pyxis.Control, as bubbled Duyo events.
//
// duyo.Control raises `ontap` and nothing else. The shell and several apps need keyboard,
// pointer, focus, context-menu and wheel input on plain elements, so pyxis.Control maps a
// declared set of React events to Duyo events named as Enyo names them: lowercase, `on`
// prefix (`onkeydown`). A spec handles one the usual way: `onkeydown: 'handleKey'` on the
// component, resolved against its owner.
//
// DECISIONS (written down because each could go the other way):
//
//  1. Listeners are ALWAYS attached, on every pyxis.Control, not only where a handler
//     exists. Component keeps its `on<Event>: 'method'` delegates in a private map, and a
//     handler can also sit on an ancestor or in a kind's `handlers`, so "could anyone handle
//     this" has no public answer. React delegates to the root, so a prop costs no DOM
//     listener; the cost is one closure set per node (cached, so props are stable) and a
//     short walk up the Duyo parents per event. pointermove and wheel are the hot ones. If a
//     measurement ever says that matters, the fix is upstream: expose the delegate names.
//
//  2. A DOM event bubbles natively AND would bubble again through the Duyo tree from every
//     element on its path, so a handler on an ancestor would run once per descendant. Like
//     duyo's own click handling, each native event is therefore bubbled once, by the
//     innermost pyxis.Control it passes through (`bubbled` below). That is also what makes
//     an event that starts inside an adapted island reach the Duyo tree.
//
//  3. pointerenter / pointerleave do not bubble in the DOM, so they do not bubble in Duyo
//     either: they go to the node itself only (`dispatchEvent`, no parent walk).
//
//  4. A handler returning truthy stops Duyo bubbling only (Enyo's rule, and Component's).
//     It does NOT call preventDefault. A handler that wants the default stopped calls
//     `event.preventDefault()` on the payload, which forwards to the native event. (wheel
//     is a passive listener in React: preventDefault there is a no-op, as in the browser.)

import type { Component, ComponentEvent } from '@duyojs/duyo';
import type { SyntheticEvent } from 'react';

/** React prop -> [Duyo event name, whether it bubbles through the Duyo tree]. */
export const DOM_EVENTS = {
  onKeyDown: ['onkeydown', true],
  onKeyUp: ['onkeyup', true],
  onPointerDown: ['onpointerdown', true],
  onPointerMove: ['onpointermove', true],
  onPointerUp: ['onpointerup', true],
  onPointerEnter: ['onpointerenter', false],
  onPointerLeave: ['onpointerleave', false],
  onFocus: ['onfocus', true],
  onBlur: ['onblur', true],
  onContextMenu: ['oncontextmenu', true],
  onDoubleClick: ['ondoubleclick', true],
  onWheel: ['onwheel', true],
} as const;

export type DomEventProp = keyof typeof DOM_EVENTS;
export type DomEventHandlers = Record<DomEventProp, (event: SyntheticEvent) => void>;

/** Fields copied from the native event when it has them. */
const COPIED = [
  'key',
  'code',
  'clientX',
  'clientY',
  'button',
  'pointerId',
  'deltaX',
  'deltaY',
  'ctrlKey',
  'shiftKey',
  'altKey',
  'metaKey',
] as const;

function payloadFor(event: SyntheticEvent): ComponentEvent {
  const native = event.nativeEvent as unknown as Record<string, unknown>;
  const payload: ComponentEvent = {
    type: event.type,
    nativeEvent: event.nativeEvent,
    preventDefault: () => event.nativeEvent.preventDefault(),
  };
  for (const field of COPIED) if (field in native) payload[field] = native[field];
  return payload;
}

/** Native events already bubbled through the Duyo tree by an inner pyxis.Control. */
const bubbled = new WeakSet<object>();

const cache = new WeakMap<Component, DomEventHandlers>();

/** The handler set for a node. Cached per node so React sees the same functions every render. */
export function domEventHandlers(node: Component): DomEventHandlers {
  let handlers = cache.get(node);
  if (handlers) return handlers;

  const built: Partial<DomEventHandlers> = {};
  for (const [prop, [name, bubbles]] of Object.entries(DOM_EVENTS) as [DomEventProp, readonly [string, boolean]][]) {
    built[prop] = bubbles
      ? (event) => {
          if (bubbled.has(event.nativeEvent)) return;
          bubbled.add(event.nativeEvent);
          node.bubble(name, payloadFor(event));
        }
      : (event) => {
          const payload = payloadFor(event);
          payload.originator = node;
          node.dispatchEvent(name, payload, node);
        };
  }
  handlers = built as DomEventHandlers;
  cache.set(node, handlers);
  return handlers;
}

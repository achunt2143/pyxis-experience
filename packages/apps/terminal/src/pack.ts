import { adapt, createPack } from '@duyojs/duyo/react';
import type { ElementType } from 'react';
import { QuickKeyButton } from './QuickKey';
import { TerminalScreens } from './TerminalScreens';

/**
 * `Terminal.Screens`: the island as a kind. State comes in as published properties
 * (low-frequency: the tab list, the active id, the font size), the two things a view can
 * say go out as events, and the live terminals are reached through `hub`. Terminal
 * output never touches a property: it goes signal -> `term.write` inside the island.
 */
export const screensEntry = adapt({
  name: 'Terminal.Screens',
  component: TerminalScreens as unknown as ElementType,
  published: { tabs: [], activeId: '', fontSize: 13, hub: null },
  events: { onCloseTab: '', onSetTitle: '' },
  props: (node) => ({
    tabs: node.get('tabs'),
    activeId: node.get('activeId'),
    fontSize: node.get('fontSize'),
    hub: node.get('hub'),
    onCloseTab: (id: string) => node['doCloseTab']({ id }),
    onSetTitle: (id: string, title: string) => node['doSetTitle']({ id, title }),
  }),
});


/** `Terminal.Key`: a Repeater row whose `item` is a QuickKeyDef; raises `onSend {value}`. */
export const quickKeyEntry = adapt({
  name: 'Terminal.Key',
  kind: 'pyxis.Row',
  component: QuickKeyButton as unknown as ElementType,
  host: 'props',
  events: { onSend: '' },
  members: { classes: 'term-key' },
  props: (node) => ({
    item: node.get('item'),
    onSend: (value: string) => node['doSend']({ value }),
  }),
});

/** The app's own pack, passed to `mountDuyoApp` as `packs`. */
export const terminalPack = createPack('terminal', [screensEntry, quickKeyEntry]);

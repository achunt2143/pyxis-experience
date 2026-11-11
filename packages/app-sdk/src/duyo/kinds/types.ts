// Editor types for the pyxis.* kinds, written by hand in the shape of the generated
// `@duyojs/duyo/lib/remochi/src/kinds.gen.ts`. Without them `Instance<'pyxis.Repeater'>` is
// a bare `Component` (whose index signature types every member `any`), so `this.$.list
// .setItems(...)` works but is unchecked. Nothing at runtime reads this. Keep it in step
// with control.ts / repeater.ts / icon.ts.
import type { Component, ComponentEvent, ControlMembers } from '@duyojs/duyo';

import type { Attributes } from './attributes';

type Tag = (typeof import('./control'))['CONTROL_TAGS'][number];

/** pyxis.Control */
export interface PyxisControl extends Omit<ControlMembers, 'tag' | 'getTag' | 'setTag'> {
  attributes: Attributes | Record<string, unknown>;
  getAttributes: () => Attributes;
  setAttributes: (value: Record<string, unknown>) => void;
  tag: Tag;
  getTag: () => Tag;
  setTag: (value: Tag) => void;
  src: string;
  getSrc: () => string;
  setSrc: (value: string) => void;
  alt: string;
  getAlt: () => string;
  setAlt: (value: string) => void;
  href: string;
  getHref: () => string;
  setHref: (value: string) => void;
  target: string;
  getTarget: () => string;
  setTarget: (value: string) => void;
  type: string;
  getType: () => string;
  setType: (value: string) => void;
  disabled: boolean;
  getDisabled: () => boolean;
  setDisabled: (value: boolean) => void;
  value: string;
  getValue: () => string;
  setValue: (value: string) => void;
  placeholder: string;
  getPlaceholder: () => string;
  setPlaceholder: (value: string) => void;
}

/** pyxis.Row */
export interface PyxisRow extends PyxisControl {
  item: unknown;
  getItem: () => unknown;
  setItem: (value: unknown) => void;
  index: number;
  getIndex: () => number;
  setIndex: (value: number) => void;
}

/** pyxis.Repeater */
export interface PyxisRepeater extends PyxisControl {
  items: unknown[];
  getItems: () => unknown[];
  setItems: (value: readonly unknown[]) => void;
  itemKind: string;
  getItemKind: () => string;
  setItemKind: (value: string) => void;
  keyField: string;
  getKeyField: () => string;
  setKeyField: (value: string) => void;
  itemProperty: string;
  getItemProperty: () => string;
  setItemProperty: (value: string) => void;
  itemProps: Record<string, unknown>;
  getItemProps: () => Record<string, unknown>;
  setItemProps: (value: Record<string, unknown>) => void;
  doSetupItem: (event?: ComponentEvent & { index: number; item: unknown; component: Component }) => boolean;
  /** Rows in item order (`children` keeps creation order). */
  rows: () => Component[];
  rowFor: (key: unknown) => Component | undefined;
  refresh: () => void;
  rebuild: () => void;
}

/** pyxis.Icon */
export interface PyxisIcon extends PyxisControl {
  icon: string;
  getIcon: () => string;
  setIcon: (value: string) => void;
  size: number | string;
  getSize: () => number | string;
  setSize: (value: number | string) => void;
  color: string | undefined;
  getColor: () => string | undefined;
  setColor: (value: string | undefined) => void;
  strokeWidth: number;
  getStrokeWidth: () => number;
  setStrokeWidth: (value: number) => void;
}

declare module '@duyojs/duyo' {
  interface KindTypes {
    'pyxis.Control': PyxisControl;
    'pyxis.Row': PyxisRow;
    'pyxis.Repeater': PyxisRepeater;
    'pyxis.Icon': PyxisIcon;
  }
}

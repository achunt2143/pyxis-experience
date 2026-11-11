// The `Files.Listing` kind: the memoised listing island (Listing.tsx) as a Duyo component.
import { adapt } from '@duyojs/duyo/react';
import type { Component } from '@duyojs/duyo';
import type { ComponentType } from 'react';
import { Listing } from './Listing';
import { registerIsland } from './islands';
import type { FsEntry, ViewMode } from './model';

interface Callbacks {
  onOpen: (entry: FsEntry) => void;
  onMenu: (entry: FsEntry, rect: DOMRect) => void;
}

/** One callback pair per kind instance, so a re-render does not hand the memo new functions. */
const callbacks = new WeakMap<Component, Callbacks>();
function callbacksFor(node: Component): Callbacks {
  let cb = callbacks.get(node);
  if (!cb) {
    cb = {
      onOpen: (entry) => node['doOpenEntry']({ entry }),
      onMenu: (entry, rect) => node['doEntryMenu']({ entry, rect }),
    };
    callbacks.set(node, cb);
  }
  return cb;
}

/**
 * `Files.Listing {entries, viewMode, selectedPath}`: raises `onOpenEntry {entry}` (a click) and
 * `onEntryMenu {entry, rect}` (a right-click; `rect` is the entry's box, for the popup).
 */
export const listingEntry = adapt({
  name: 'Files.Listing',
  component: Listing as unknown as ComponentType,
  published: { entries: [], viewMode: 'list', selectedPath: null },
  events: { onOpenEntry: '', onEntryMenu: '' },
  props: (node) => ({
    entries: node.get('entries'),
    viewMode: node.get('viewMode'),
    selectedPath: node.get('selectedPath'),
    ...callbacksFor(node),
  }),
});

registerIsland(listingEntry);

// Editor types for the island, in the shape of the SDK's pyxis kinds.
declare module '@duyojs/duyo' {
  interface KindTypes {
    'Files.Listing': {
      entries: FsEntry[];
      setEntries: (value: readonly FsEntry[]) => void;
      viewMode: ViewMode;
      setViewMode: (value: ViewMode) => void;
      selectedPath: string | null;
      setSelectedPath: (value: string | null) => void;
    };
  }
}

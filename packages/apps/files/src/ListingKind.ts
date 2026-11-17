// The `Files.Listing` kind: the memoised listing island (Listing.tsx) as a Duyo component.
import { adaptIsland } from '@pyxis/app-sdk/duyo';
import type { Component } from '@duyojs/duyo';
import type { ComponentType } from 'react';
import { Listing } from './Listing';
import { registerIsland } from './islands';
import type { FsEntry, ViewMode } from './model';

interface Callbacks {
  onOpen: (entry: FsEntry) => void;
  onMenu: (entry: FsEntry, rect: DOMRect) => void;
  onRename: (entry: FsEntry) => void;
  onDelete: (entry: FsEntry) => void;
}

/** One callback set per kind instance, so a re-render does not hand the memo new functions. */
const callbacks = new WeakMap<Component, Callbacks>();
function callbacksFor(node: Component): Callbacks {
  let cb = callbacks.get(node);
  if (!cb) {
    cb = {
      onOpen: (entry) => node['doOpenEntry']({ entry }),
      onMenu: (entry, rect) => node['doEntryMenu']({ entry, rect }),
      onRename: (entry) => node['doRenameEntry']({ entry }),
      onDelete: (entry) => node['doDeleteEntry']({ entry }),
    };
    callbacks.set(node, cb);
  }
  return cb;
}

/**
 * `Files.Listing {entries, viewMode, selectedPath}`: raises `onOpenEntry {entry}`,
 * `onEntryMenu {entry, rect}`, `onRenameEntry {entry}`, and `onDeleteEntry {entry}`.
 */
export const listingEntry = adaptIsland({
  name: 'Files.Listing',
  component: Listing as unknown as ComponentType,
  published: { entries: [], viewMode: 'list', selectedPath: null },
  events: { onOpenEntry: '', onEntryMenu: '', onRenameEntry: '', onDeleteEntry: '' },
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

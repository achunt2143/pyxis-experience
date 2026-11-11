import { createPack, type KindPack, type PackEntry } from '@duyojs/duyo/react';

const entries: PackEntry[] = [];

/** Adds an `adapt()`ed React component to this app's pack (call at module load). */
export function registerIsland(entry: PackEntry): void {
  if (!entries.some((e) => e.name === entry.name)) entries.push(entry);
}

/** This app's islands as a pack, for `mountDuyoApp(..., { packs: [islandPack()] })`. */
export function islandPack(): KindPack {
  return createPack('files', entries);
}

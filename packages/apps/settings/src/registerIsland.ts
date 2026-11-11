import { createPack, type KindPack, type PackEntry } from '@duyojs/duyo/react';

const entries: PackEntry[] = [];

/** Adds an `adapt()`ed React component to Settings' pack (call at module load). */
export function registerIsland(entry: PackEntry): void {
  if (!entries.some((e) => e.name === entry.name)) entries.push(entry);
}

/** Settings' islands as a pack, for `mountDuyoApp(..., { packs: [islandPack()] })`. */
export function islandPack(): KindPack {
  return createPack('settings', entries);
}

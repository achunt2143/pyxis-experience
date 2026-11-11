import { describe, expect, it } from 'vitest';
import {
  PLACES,
  SYSTEM_PLACES,
  formatBytes,
  getCrumbsForPath,
  getParentPath,
  isReadOnly,
  kindOf,
  nextSort,
  normalizePath,
  placeSelected,
  visibleEntries,
  type FsEntry,
} from '../model';

const e = (name: string, over: Partial<FsEntry> = {}): FsEntry => ({
  name,
  path: `~/${name}`,
  isFile: true,
  isDirectory: false,
  isSymlink: false,
  size: 0,
  ...over,
});

describe('paths', () => {
  it('normalises, finds parents and breadcrumbs for ~ and absolute paths', () => {
    expect(normalizePath('/usr/')).toBe('/usr');
    expect(normalizePath('///')).toBe('/');
    expect(getParentPath('~/a')).toBe('~');
    expect(getParentPath('~/a/b')).toBe('~/a');
    expect(getParentPath('/usr')).toBe('/');
    expect(getParentPath('/usr/lib')).toBe('/usr');
    expect(getParentPath('~')).toBe('~');
    expect(getParentPath('/')).toBe('/');
    expect(getCrumbsForPath('~')).toEqual([{ label: 'Home', path: '~' }]);
    expect(getCrumbsForPath('~/a/b')).toEqual([
      { label: 'Home', path: '~' },
      { label: 'a', path: '~/a' },
      { label: 'b', path: '~/a/b' },
    ]);
    expect(getCrumbsForPath('/usr/lib').map((c) => c.path)).toEqual(['/', '/usr', '/usr/lib']);
  });

  it('only paths outside the home are read-only', () => {
    expect(isReadOnly('~')).toBe(false);
    expect(isReadOnly('~/x')).toBe(false);
    expect(isReadOnly('/etc')).toBe(true);
  });

  it('highlights a favourite for its folder and anything under it; File System only for /', () => {
    const [home, docs] = PLACES;
    expect(placeSelected(home!, '~', false)).toBe(true);
    expect(placeSelected(home!, '~/Documents', false)).toBe(false);
    expect(placeSelected(docs!, '~/Documents/x', false)).toBe(true);
    expect(placeSelected(SYSTEM_PLACES[0]!, '/', true)).toBe(true);
    expect(placeSelected(SYSTEM_PLACES[0]!, '/etc', true)).toBe(false);
  });
});

describe('entries', () => {
  it('sorts folders first, names numerically and case-insensitively, then by size', () => {
    const list = [e('b10'), e('B2'), e('dir', { isDirectory: true }), e('big', { size: 9 }), e('a', { size: 1 })];
    expect(visibleEntries(list, '', 'name', 'asc').map((x) => x.name)).toEqual(['dir', 'a', 'B2', 'b10', 'big']);
    expect(visibleEntries(list, '', 'name', 'desc').map((x) => x.name)).toEqual(['dir', 'big', 'b10', 'B2', 'a']);
    expect(visibleEntries(list, '', 'size', 'desc')[1]!.name).toBe('big');
    expect(visibleEntries(list, ' B1 ', 'name', 'asc').map((x) => x.name)).toEqual(['b10']);
    expect(visibleEntries(undefined, '', 'name', 'asc')).toEqual([]);
  });

  it('the sort button walks name asc, name desc, size desc, size asc', () => {
    let s = { sortBy: 'name', sortOrder: 'asc' } as ReturnType<typeof nextSort>;
    const seen = [];
    for (let i = 0; i < 4; i++) {
      s = nextSort(s.sortBy, s.sortOrder);
      seen.push(`${s.sortBy}-${s.sortOrder}`);
    }
    expect(seen).toEqual(['name-desc', 'size-desc', 'size-asc', 'name-asc']);
  });

  it('classifies by extension, and formats sizes', () => {
    expect(kindOf(e('x.PNG'))).toBe('image');
    expect(kindOf(e('x.mp3'))).toBe('audio');
    expect(kindOf(e('x.rs'))).toBe('code');
    expect(kindOf(e('x.ipk'))).toBe('archive');
    expect(kindOf(e('x.txt'))).toBe('text');
    expect(kindOf(e('x.bin'))).toBe('file');
    expect(kindOf(e('x', { isDirectory: true }))).toBe('folder');
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });
});

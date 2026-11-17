import { describe, expect, it } from 'vitest';
import {
  PLACES,
  SYSTEM_PLACES,
  formatBytes,
  getCrumbsForPath,
  getParentPath,
  isPathOrDescendant,
  isReadOnly,
  joinPath,
  kindOf,
  nextSort,
  normalizePath,
  placeSelected,
  summarizeStorage,
  validateEntryName,
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
  it('normalises, joins, finds parents and breadcrumbs for ~ and absolute paths', () => {
    expect(normalizePath('/usr/')).toBe('/usr');
    expect(normalizePath('///')).toBe('/');
    expect(joinPath('/', 'etc')).toBe('/etc');
    expect(joinPath('~', 'Projects')).toBe('~/Projects');
    expect(joinPath('/etc/', 'pyxis.d')).toBe('/etc/pyxis.d');
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

  it('highlights a favourite on path boundaries only, never sibling prefixes like ~/Documents2', () => {
    const [home, docs] = PLACES;
    expect(placeSelected(home!, '~', false)).toBe(true);
    expect(placeSelected(home!, '~/Documents', false)).toBe(false);
    expect(placeSelected(docs!, '~/Documents', false)).toBe(true);
    expect(placeSelected(docs!, '~/Documents/x', false)).toBe(true);
    expect(placeSelected(docs!, '~/Documents2', false)).toBe(false);
    expect(placeSelected(SYSTEM_PLACES[0]!, '/', true)).toBe(true);
    expect(placeSelected(SYSTEM_PLACES[0]!, '/etc', true)).toBe(false);
  });

  it('checks subtree boundaries cleanly with isPathOrDescendant', () => {
    expect(isPathOrDescendant('~/Documents', '~/Documents')).toBe(true);
    expect(isPathOrDescendant('~/Documents/sub', '~/Documents')).toBe(true);
    expect(isPathOrDescendant('~/Documents2', '~/Documents')).toBe(false);
    expect(isPathOrDescendant('/etc', '/')).toBe(true);
    expect(isPathOrDescendant('~', '/')).toBe(false);
  });
});

describe('validation', () => {
  it('rejects empty, dot/dotdot, slashes, NUL bytes, and existing sibling conflicts', () => {
    expect(validateEntryName('')).toBeTruthy();
    expect(validateEntryName('   ')).toBeTruthy();
    expect(validateEntryName('.')).toBeTruthy();
    expect(validateEntryName('..')).toBeTruthy();
    expect(validateEntryName('a/b')).toBeTruthy();
    expect(validateEntryName('/')).toBeTruthy();
    expect(validateEntryName('a\0b')).toBeTruthy();
    expect(validateEntryName('Documents', { existingNames: ['Documents', 'notes.txt'] })).toContain('already exists');
    expect(validateEntryName('notes.txt', { existingNames: ['Documents', 'notes.txt'], currentName: 'notes.txt' })).toBeNull();
    expect(validateEntryName('Documents', { existingNames: ['Documents', 'notes.txt'], currentName: 'notes.txt' })).toContain('already exists');
    expect(validateEntryName('Projects', { existingNames: ['Documents'] })).toBeNull();
  });
});

describe('entries', () => {
  it('sorts folders first, names numerically and case-insensitively, size, modified date, and type; filters dotfiles', () => {
    const list = [
      e('.secret', { size: 1, modified: 500 }),
      e('b10', { size: 5, modified: 100 }),
      e('B2', { size: 3, modified: 300 }),
      e('dir', { isDirectory: true, modified: 50 }),
      e('big.bin', { size: 9, modified: 400 }),
      e('a.txt', { size: 1, modified: 200 }),
    ];
    expect(visibleEntries(list, '', 'name', 'asc').map((x) => x.name)).toEqual(['dir', 'a.txt', 'B2', 'b10', 'big.bin']);
    expect(visibleEntries(list, '', 'name', 'asc', true).map((x) => x.name)).toEqual(['dir', '.secret', 'a.txt', 'B2', 'b10', 'big.bin']);
    expect(visibleEntries(list, '', 'name', 'desc').map((x) => x.name)).toEqual(['dir', 'big.bin', 'b10', 'B2', 'a.txt']);
    expect(visibleEntries(list, '', 'size', 'desc')[1]!.name).toBe('big.bin');
    expect(visibleEntries(list, '', 'modified', 'desc').map((x) => x.name)).toEqual(['dir', 'big.bin', 'B2', 'a.txt', 'b10']);
    expect(visibleEntries(list, '', 'type', 'asc').map((x) => x.name)).toEqual(['dir', 'B2', 'b10', 'big.bin', 'a.txt']);
    expect(visibleEntries(list, ' B1 ', 'name', 'asc').map((x) => x.name)).toEqual(['b10']);
    expect(visibleEntries(undefined, '', 'name', 'asc')).toEqual([]);
  });

  it('the sort button walks name -> size -> modified -> type -> name', () => {
    let s = { sortBy: 'name', sortOrder: 'asc' } as ReturnType<typeof nextSort>;
    const seen = [];
    for (let i = 0; i < 8; i++) {
      s = nextSort(s.sortBy, s.sortOrder);
      seen.push(`${s.sortBy}-${s.sortOrder}`);
    }
    expect(seen).toEqual([
      'name-desc',
      'size-desc',
      'size-asc',
      'modified-desc',
      'modified-asc',
      'type-asc',
      'type-desc',
      'name-asc',
    ]);
  });

  it('classifies by extension, formats sizes, and summarizes storage partitions', () => {
    expect(kindOf(e('x.PNG'))).toBe('image');
    expect(kindOf(e('x.mp3'))).toBe('audio');
    expect(kindOf(e('x.rs'))).toBe('code');
    expect(kindOf(e('x.ipk'))).toBe('archive');
    expect(kindOf(e('x.txt'))).toBe('text');
    expect(kindOf(e('x.bin'))).toBe('file');
    expect(kindOf(e('x', { isDirectory: true }))).toBe('folder');
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.5 KB');

    expect(summarizeStorage([], '~')).toBeNull();
    const parts = [
      { device: '/dev/sda1', mountPoint: '/', total: 1000, used: 200, available: 800 },
      { device: '/dev/sda2', mountPoint: '/home', total: 2000, used: 1000, available: 1000 },
    ];
    expect(summarizeStorage(parts, '~')).toMatchObject({ mountPoint: '/home', pct: 50, available: 1000 });
    expect(summarizeStorage(parts, '/etc')).toMatchObject({ mountPoint: '/', pct: 20, available: 800 });
  });
});

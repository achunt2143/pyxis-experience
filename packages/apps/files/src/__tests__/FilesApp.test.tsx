// @vitest-environment jsdom
import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticatePrivilege, getPrivilegeState } from '@pyxis/app-sdk';
import { resetMockPrivilege } from '../../../../app-sdk/src/EchoClient';
import { resetMockSession } from '../../../../app-sdk/src/sessionMock';
import {
  $,
  $$,
  buttonText,
  callsOf,
  click,
  crumbs,
  dialogButton,
  dir,
  entryNames,
  entryRow,
  fake,
  file,
  flush,
  installFake,
  mountFiles,
  nameInput,
  openDialog,
  press,
  resetFake,
  rightClick,
  shown,
  searchInput,
  status,
  stubCanvas,
  type,
  type Mounted,
} from './testUtils';

vi.mock('../../../../app-sdk/src/usePyxisTheme', () => ({ usePyxisTheme: () => 'light' }));

stubCanvas();

let m: Mounted | undefined;

const HOME = [dir('~/Pictures'), dir('~/Documents'), file('~/notes.txt', 300), file('~/a.png', 20), file('~/big.bin', 5000)];

beforeEach(() => {
  resetMockSession();
  resetMockPrivilege();
  resetFake({
    '~': HOME,
    '~/Documents': [file('~/Documents/todo.md', 40)],
    '~/Pictures': [],
    '/': [dir('/etc'), dir('/usr'), file('/vmlinuz', 99)],
    '/etc': [file('/etc/hostname', 8)],
  });
  installFake();
});
const origClipboardDesc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard') ??
  Object.getOwnPropertyDescriptor(navigator, 'clipboard');

afterEach(() => {
  m?.unmount();
  m = undefined;
  if (origClipboardDesc) {
    Object.defineProperty(navigator, 'clipboard', origClipboardDesc);
  } else {
    delete (navigator as unknown as Record<string, unknown>)['clipboard'];
  }
  vi.restoreAllMocks();
});

describe('Files: loading', () => {
  it('lists the home on start: folders first, then by name; one readDirectory call', async () => {
    m = await mountFiles();
    expect(callsOf('readDirectory')).toEqual([{ method: 'readDirectory', args: { path: '~' } }]);
    expect(entryNames(m.host)).toEqual(['Documents', 'Pictures', 'a.png', 'big.bin', 'notes.txt']);
    expect(status(m.host)).toBe('5 items');
    expect(crumbs(m.host)).toEqual(['Home']);
    expect($(m.host, '[data-window-id]')).toBeTruthy();
  });

  it('shows a spinner until the listing arrives', async () => {
    fake.hold.add('~');
    m = await mountFiles();
    expect($$(m.host, '.files-entry')).toHaveLength(0);
    expect($(m.host, '[data-duyo-kind="remochi.Spinner"]')!.closest('[style*="display: none"]')).toBeNull();
    await act(async () => fake.held['~']!());
    await flush();
    expect($$(m.host, '.files-entry')).toHaveLength(5);
  });

  it('shows the error and retries from Try Again', async () => {
    fake.failing['readDirectory'] = 'Permission denied';
    m = await mountFiles();
    expect(m.host.textContent).toContain('Permission denied');
    expect(buttonText(m.host, 'New Folder')!.disabled).toBe(true);
    delete fake.failing['readDirectory'];
    await click(buttonText(m.host, 'Try Again'));
    await flush();
    expect(callsOf('readDirectory')).toHaveLength(2);
    expect(entryNames(m.host)).toHaveLength(5);
  });

  it('says so when a folder is empty', async () => {
    m = await mountFiles();
    await click(entryRow(m.host, '~/Pictures'));
    await flush();
    expect(m.host.textContent).toContain('This folder is empty');
    expect(status(m.host)).toBe('0 items');
  });
});

describe('Files: navigating', () => {
  it('opens a folder, then Back and Up, reading each folder once', async () => {
    m = await mountFiles();
    await click(entryRow(m.host, '~/Documents'));
    await flush();
    expect(entryNames(m.host)).toEqual(['todo.md']);
    expect(crumbs(m.host)).toEqual(['Home', 'Documents']);
    expect(status(m.host)).toBe('1 item');

    await click($(m.host, 'button[aria-label="Go Back"]'));
    expect(crumbs(m.host)).toEqual(['Home']);
    expect(entryNames(m.host)).toHaveLength(5);
    // Back to a folder already seen uses the cached listing.
    expect(callsOf('readDirectory')).toHaveLength(2);

    await click(entryRow(m.host, '~/Documents'));
    await click($(m.host, 'button[aria-label="Parent Directory"]'));
    expect(crumbs(m.host)).toEqual(['Home']);
    expect($(m.host, 'button[aria-label="Parent Directory"]')!.hasAttribute('disabled')).toBe(true);
    expect($(m.host, 'button[aria-label="Go Back"]')!.hasAttribute('disabled')).toBe(false);
  });

  it('a breadcrumb jumps to that folder, and a place in the sidebar to its own', async () => {
    m = await mountFiles();
    await click(entryRow(m.host, '~/Documents'));
    await click($$(m.host, '.files-crumb')[0]!);
    expect(crumbs(m.host)).toEqual(['Home']);
    const places = $$(m.host, '[data-duyo-kind="remochi.Item"]');
    expect(places.map((p) => p.textContent)).toEqual([
      'Home', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos', 'Desktop', 'File System',
    ]);
    await click(places[1]);
    await flush();
    expect(crumbs(m.host)).toEqual(['Home', 'Documents']);
  });

  it('File System lists / read-only: New Folder is off and the status says why', async () => {
    m = await mountFiles();
    const places = $$(m.host, '[data-duyo-kind="remochi.Item"]');
    await click(places.at(-1));
    await flush();
    expect(callsOf('readDirectory').at(-1)!.args).toEqual({ path: '/' });
    expect(crumbs(m.host)).toEqual(['Root']);
    expect(entryNames(m.host)).toEqual(['etc', 'usr', 'vmlinuz']);
    expect(m.host.textContent).toContain('Read-only: outside your home, files can be opened but not changed');
    expect(buttonText(m.host, 'New Folder')!.disabled).toBe(true);
    await click(entryRow(m.host, '/etc'));
    await flush();
    expect(crumbs(m.host)).toEqual(['Root', 'etc']);
  });
});

describe('Files: search, sort, view', () => {
  it('filters by name, says when nothing matches, and clears on navigation', async () => {
    m = await mountFiles();
    await type(searchInput(m.host), 'NOTE');
    expect(entryNames(m.host)).toEqual(['notes.txt']);
    expect(status(m.host)).toBe('1 item matching "NOTE"');
    await type(searchInput(m.host), 'zzz');
    expect(m.host.textContent).toContain('No matching files found');
    expect(m.host.textContent).toContain('Try clearing your search query');
    await type(searchInput(m.host), '');
    await type(searchInput(m.host), 'doc');
    await click(entryRow(m.host, '~/Documents'));
    await flush();
    expect(searchInput(m.host).value).toBe('');
  });

  it('cycles name asc -> name desc -> size desc -> size asc -> modified -> type -> name asc, folders always first', async () => {
    m = await mountFiles();
    const sortButton = () => $(m!.host, '[title^="Sort by"] button')!;
    expect($(m.host, '[title^="Sort by"]')!.getAttribute('title')).toBe('Sort by name (asc)');
    await click(sortButton());
    expect(entryNames(m.host)).toEqual(['Pictures', 'Documents', 'notes.txt', 'big.bin', 'a.png']);
    await click(sortButton());
    expect($(m.host, '[title^="Sort by"]')!.getAttribute('title')).toBe('Sort by size (desc)');
    expect(entryNames(m.host).slice(2)).toEqual(['big.bin', 'notes.txt', 'a.png']);
    await click(sortButton());
    expect(entryNames(m.host).slice(2)).toEqual(['a.png', 'notes.txt', 'big.bin']);
    await click(sortButton());
    expect($(m.host, '[title^="Sort by"]')!.getAttribute('title')).toBe('Sort by modified (desc)');
    await click(sortButton());
    expect($(m.host, '[title^="Sort by"]')!.getAttribute('title')).toBe('Sort by modified (asc)');
    await click(sortButton());
    expect($(m.host, '[title^="Sort by"]')!.getAttribute('title')).toBe('Sort by type (asc)');
    await click(sortButton());
    expect($(m.host, '[title^="Sort by"]')!.getAttribute('title')).toBe('Sort by type (desc)');
    await click(sortButton());
    expect($(m.host, '[title^="Sort by"]')!.getAttribute('title')).toBe('Sort by name (asc)');
  });

  it('switches between list and grid', async () => {
    m = await mountFiles();
    expect($(m.host, '.files-listing')!.getAttribute('data-view')).toBe('list');
    await click($$(m.host, '[data-duyo-kind="remochi.ViewSelectButton"] *').find((e) => e.textContent === '⊞' && e.children.length === 0));
    expect($(m.host, '.files-listing')!.getAttribute('data-view')).toBe('grid');
    expect($$(m.host, '.files-entry')).toHaveLength(5);
  });

  it('draws a big folder as one element per entry, and typing in search does not redraw them', async () => {
    const many = Array.from({ length: 600 }, (_, i) => file(`~/f${String(i).padStart(4, '0')}.txt`, i));
    fake.dirs['~'] = many;
    m = await mountFiles();
    expect($$(m.host, '.files-entry')).toHaveLength(600);
    const first = entryRow(m.host, '~/f0000.txt');
    // The whole app is a few dozen Duyo nodes, not several per entry.
    const nodes = $$(m.host, '[data-duyo-kind]').length;
    expect(nodes).toBeLessThan(150);
    await type(searchInput(m.host), 'f00');
    await type(searchInput(m.host), 'f0');
    expect(entryNames(m.host).length).toBe(600);
    await type(searchInput(m.host), '');
    expect(entryRow(m.host, '~/f0000.txt')).toBe(first);
  });
});

describe('Files: preview', () => {
  it('previews a text file: stat, then readFile as utf-8 under the size cap; Close puts it away', async () => {
    fake.files['~/notes.txt'] = 'hello files';
    m = await mountFiles();
    await click(entryRow(m.host, '~/notes.txt'));
    await flush();
    expect(callsOf('stat')[0]!.args).toEqual({ path: '~/notes.txt' });
    expect(callsOf('readFile')[0]!.args).toEqual({ path: '~/notes.txt', encoding: 'utf-8', maxBytes: 512 * 1024 });
    expect($(m.host, 'pre')!.textContent).toBe('hello files');
    expect(m.host.textContent).toContain('TEXT PREVIEW');
    expect(m.host.textContent).toContain('rw-r--r--');
    expect(m.host.textContent).toContain('1.2 KB'); // stat's size wins over the listing's
    // The selected row is the previewed one.
    expect(entryRow(m.host, '~/notes.txt').style.background).toContain('primary-soft');
    // Rename and Delete are there: it is inside the home.
    expect(buttonText(m.host, 'Rename')).toBeTruthy();
    await click($(m.host, 'button[aria-label="Close Inspector"]'));
    expect($(m.host, 'pre')).toBeNull();
    expect(entryRow(m.host, '~/notes.txt').style.background).toBe('transparent');
  });

  it('previews an image as a data URI', async () => {
    fake.files['~/a.png'] = 'AAAA';
    m = await mountFiles();
    await click(entryRow(m.host, '~/a.png'));
    await flush();
    expect(callsOf('readFile')[0]!.args).toMatchObject({ encoding: 'base64' });
    expect($(m.host, 'img[alt="a.png"]')!.getAttribute('src')).toBe('data:image/png;base64,AAAA');
  });

  it('a file over the 512 KB cap surfaces the size limit message; binary/audio show their cards without reading', async () => {
    fake.dirs['~'] = [file('~/huge.txt', 5 * 1024 * 1024), file('~/big.bin', 5000), file('~/song.mp3', 10)];
    m = await mountFiles();
    await click(entryRow(m.host, '~/huge.txt'));
    await flush();
    expect(callsOf('readFile')).toHaveLength(0);
    expect(m.host.textContent).toContain('File is too large to preview (512 KB limit)');
    await click(entryRow(m.host, '~/big.bin'));
    await flush();
    expect(m.host.textContent).toContain('Binary or unpreviewable file type');
    await click(entryRow(m.host, '~/song.mp3'));
    await flush();
    expect(m.host.textContent).toContain('Audio File');
    expect(callsOf('readFile')).toHaveLength(0);
  });

  it('a failed read shows its message on the card; navigating away drops a preview', async () => {
    m = await mountFiles();
    fake.failing['readFile'] = 'EIO';
    await click(entryRow(m.host, '~/notes.txt'));
    await flush();
    expect(m.host.textContent).toContain('EIO');
    await click(entryRow(m.host, '~/Documents'));
    await flush();
    expect(m.host.textContent).not.toContain('EIO');
    expect(shown(buttonText(m.host, 'Rename'))).toBe(false);
  });

  it('outside the home there is no Rename or Delete', async () => {
    m = await mountFiles();
    await click($$(m.host, '[data-duyo-kind="remochi.Item"]').at(-1));
    await flush();
    await click(entryRow(m.host, '/vmlinuz'));
    await flush();
    expect(m.host.textContent).toContain('FULL PATH');
    expect(shown(buttonText(m.host, 'Rename'))).toBe(false);
    expect(shown(buttonText(m.host, 'Delete'))).toBe(false);
  });
});

describe('Files: changing things', () => {
  it('New Folder: Create makes ~/name and shows it; empty names cannot be created', async () => {
    m = await mountFiles();
    await click(buttonText(m.host, 'New Folder'));
    await flush();
    const field = nameInput('Folder name')!;
    expect(field).toBeTruthy();
    expect(dialogButton('Create')!.disabled).toBe(true);
    await type(field, '  ');
    expect(dialogButton('Create')!.disabled).toBe(true);
    await type(field, ' Projects ');
    await click(dialogButton('Create'));
    await flush();
    expect(callsOf('createDirectory')[0]!.args).toEqual({ path: '~/Projects' });
    expect(entryNames(m.host)).toContain('Projects');
    expect(nameInput('Folder name')).toBeNull();
  });

  it('Enter submits the name; Cancel does not (blur must not submit)', async () => {
    m = await mountFiles();
    await click(buttonText(m.host, 'New Folder'));
    await flush();
    await type(nameInput('Folder name')!, 'Enter-made');
    await press(nameInput('Folder name')!, 'Enter');
    await flush();
    expect(callsOf('createDirectory').map((c) => c.args['path'])).toEqual(['~/Enter-made']);

    await click(buttonText(m.host, 'New Folder'));
    await flush();
    await type(nameInput('Folder name')!, 'never');
    await click(dialogButton('Cancel'));
    await flush();
    expect(callsOf('createDirectory')).toHaveLength(1);
    expect(nameInput('Folder name')).toBeNull();
  });

  it('Rename from the inspector moves the file, closes the inspector and reloads', async () => {
    m = await mountFiles();
    await click(entryRow(m.host, '~/notes.txt'));
    await flush();
    await click(buttonText(m.host, 'Rename'));
    await flush();
    const field = nameInput('New name')!;
    expect(field.value).toBe('notes.txt');
    await type(field, 'journal.txt');
    await click(dialogButton('Rename') ?? null);
    await flush();
    expect(callsOf('move')[0]!.args).toEqual({ source: '~/notes.txt', destination: '~/journal.txt' });
    expect(entryNames(m.host)).toContain('journal.txt');
    expect(entryNames(m.host)).not.toContain('notes.txt');
    expect($(m.host, 'pre')).toBeNull();
    expect(m.host.textContent).not.toContain('FULL PATH');
  });

  it('renaming to the same name does nothing', async () => {
    m = await mountFiles();
    await click(entryRow(m.host, '~/notes.txt'));
    await flush();
    await click(buttonText(m.host, 'Rename'));
    await flush();
    await press(nameInput('New name')!, 'Enter');
    await flush();
    expect(callsOf('move')).toHaveLength(0);
    expect(nameInput('New name')).toBeNull();
  });

  it('Delete asks first; a folder goes recursively, a file by deleteFile', async () => {
    m = await mountFiles();
    await click(entryRow(m.host, '~/notes.txt'));
    await flush();
    await click(buttonText(m.host, 'Delete'));
    await flush();
    expect(openDialog()!.textContent).toContain('Confirm Delete');
    expect(openDialog()!.textContent).toContain('Delete notes.txt? This cannot be undone.');
    expect(callsOf('deleteFile')).toHaveLength(0);
    await click(dialogButton('Delete'));
    await flush();
    expect(callsOf('deleteFile')[0]!.args).toEqual({ path: '~/notes.txt' });
    expect(entryNames(m.host)).not.toContain('notes.txt');
    expect(openDialog()).toBeUndefined();

    await rightClick(entryRow(m.host, '~/Pictures'));
    await flush();
    await click(menuItem('Delete'));
    await flush();
    expect(openDialog()!.textContent).toContain('Delete Pictures and everything inside it?');
    await click(dialogButton('Delete'));
    await flush();
    expect(callsOf('deleteDirectory')[0]!.args).toEqual({ path: '~/Pictures', recursive: true });
    expect(entryNames(m.host)).not.toContain('Pictures');
  });

  it('Cancel on the delete dialog deletes nothing', async () => {
    m = await mountFiles();
    await click(entryRow(m.host, '~/notes.txt'));
    await flush();
    await click(buttonText(m.host, 'Delete'));
    await flush();
    await click(dialogButton('Cancel'));
    await flush();
    expect(openDialog()).toBeUndefined();
    expect(callsOf('deleteFile')).toHaveLength(0);
  });

  it('a failing action closes the input dialog cleanly and shows only the Files Error dialog', async () => {
    m = await mountFiles();
    fake.failing['createDirectory'] = 'Disk full';
    await click(buttonText(m.host, 'New Folder'));
    await flush();
    await type(nameInput('Folder name')!, 'x');
    await click(dialogButton('Create'));
    await flush();
    expect(openDialog('Files Error')!.textContent).toContain('Disk full');
    expect(openDialog('New Folder')).toBeUndefined();
    await click(dialogButton('OK', 'Files Error'));
    await flush();
    expect(openDialog('Files Error')).toBeUndefined();
    expect(openDialog('New Folder')).toBeUndefined();
  });
});

/** An action in the open context menu. */
const menuItem = (label: string) => {
  const popup = document.querySelector('.mochi-contextual-popup');
  return popup ? buttonText(popup, label) : undefined;
};

describe('Files: context menu', () => {
  it('a file offers Preview, Rename and Delete; Preview opens the inspector', async () => {
    fake.files['~/notes.txt'] = 'x';
    m = await mountFiles();
    await rightClick(entryRow(m.host, '~/notes.txt'));
    await flush();
    expect(menuItem('Preview')).toBeTruthy();
    expect(menuItem('Rename')).toBeTruthy();
    expect(menuItem('Delete')).toBeTruthy();
    expect(menuItem('Open Folder')).toBeUndefined();
    expect(document.body.textContent).toContain('~/notes.txt');
    await click(menuItem('Preview'));
    await flush();
    expect(m.host.textContent).toContain('FULL PATH');
  });

  it('a folder offers Open Folder, and a system entry only the view action', async () => {
    m = await mountFiles();
    await rightClick(entryRow(m.host, '~/Documents'));
    await flush();
    await click(menuItem('Open Folder'));
    await flush();
    expect(crumbs(m.host)).toEqual(['Home', 'Documents']);

    await click($$(m.host, '[data-duyo-kind="remochi.Item"]').at(-1));
    await flush();
    await rightClick(entryRow(m.host, '/vmlinuz'));
    await flush();
    expect(menuItem('Preview')).toBeTruthy();
    expect(menuItem('Rename')).toBeUndefined();
    expect(menuItem('Delete')).toBeUndefined();
  });
});

describe('Files: leaving', () => {
  it('a listing that lands after the app is gone is ignored', async () => {
    fake.hold.add('~');
    m = await mountFiles();
    const mounted = m;
    m = undefined;
    mounted.unmount();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => fake.held['~']!());
    expect(errors).not.toHaveBeenCalled();
  });

  it('a preview that is still loading when you open a folder does not come back', async () => {
    m = await mountFiles();
    await click(entryRow(m.host, '~/notes.txt'));
    await click(entryRow(m.host, '~/Documents')); // navigates before the preview's reads settle
    await flush();
    expect(crumbs(m.host)).toEqual(['Home', 'Documents']);
    expect(m.host.textContent).not.toContain('FULL PATH');
  });
});

describe('Files: privileged access unlock', () => {
  it('shows "Unlock to make changes" outside home, enables mutations after grant, and locks again on "Lock"', async () => {
    m = await mountFiles();

    // Home has neither unlock nor lock button.
    expect(shown($(m.host, '[data-files-unlock]'))).toBe(false);
    expect(shown($(m.host, '[data-files-lock]'))).toBe(false);

    // Navigate to /etc (outside home).
    await click($$(m.host, '[data-duyo-kind="remochi.Item"]').at(-1));
    await flush();
    await click(entryRow(m.host, '/etc'));
    await flush();

    expect(status(m.host)).toContain('Read-only: outside your home, files can be opened but not changed');
    expect(shown($(m.host, '[data-files-unlock]'))).toBe(true);
    expect(shown($(m.host, '[data-files-lock]'))).toBe(false);
    expect(buttonText(m.host, 'New Folder')!.disabled).toBe(true);

    // Clicking "Unlock to make changes" raises a pending privilege request for 'files'.
    await click($(m.host, '[data-files-unlock]'));
    await flush();
    const pendingState = await getPrivilegeState('files');
    expect(pendingState.active).toBe(false);
    expect(pendingState.pending).toHaveLength(1);
    expect(pendingState.pending[0]!.appId).toBe('files');

    // Simulate overlay password authentication -> PrivilegeChanged unlocks Files.
    await act(async () => {
      const res = await authenticatePrivilege({
        password: 'pyxis',
        requestId: pendingState.pending[0]!.requestId,
      });
      expect(res.ok).toBe(true);
    });
    await flush();

    expect(status(m.host)).toContain('Privileged access unlocked');
    expect(status(m.host)).not.toContain('Read-only');
    expect(shown($(m.host, '[data-files-unlock]'))).toBe(false);
    expect(shown($(m.host, '[data-files-lock]'))).toBe(true);
    expect(buttonText(m.host, 'New Folder')!.disabled).toBe(false);

    // Context menu now offers Rename and Delete outside home.
    await rightClick(entryRow(m.host, '/etc/hostname'));
    await flush();
    expect(menuItem('Rename')).toBeTruthy();
    expect(menuItem('Delete')).toBeTruthy();

    // Inspector also offers Rename and Delete while privileged.
    await click(menuItem('Preview'));
    await flush();
    expect(shown(buttonText(m.host, 'Rename'))).toBe(true);
    expect(shown(buttonText(m.host, 'Delete'))).toBe(true);
    await click($(m.host, 'button[aria-label="Close Inspector"]'));
    await flush();

    // New Folder works inside /etc while privileged.
    await click(buttonText(m.host, 'New Folder'));
    await flush();
    await type(nameInput('Folder name')!, 'pyxis.d');
    await click(dialogButton('Create'));
    await flush();
    expect(callsOf('createDirectory').at(-1)!.args).toEqual({ path: '/etc/pyxis.d' });
    expect(entryNames(m.host)).toContain('pyxis.d');

    // Clicking "Lock" in the status bar revokes privilege immediately.
    await click($(m.host, '[data-files-lock]'));
    await flush();
    expect((await getPrivilegeState('files')).active).toBe(false);
    expect(buttonText(m.host, 'New Folder')!.disabled).toBe(true);
    expect(status(m.host)).toContain('Read-only: outside your home, files can be opened but not changed');
    expect(shown($(m.host, '[data-files-unlock]'))).toBe(true);
    expect(shown($(m.host, '[data-files-lock]'))).toBe(false);
  });
});

describe('Files: Wave A polish, validation, cache, navigation & keyboard', () => {
  it('validates New Folder and Rename names against ., .., /, NUL, and existing sibling conflicts', async () => {
    m = await mountFiles();
    await click(buttonText(m.host, 'New Folder'));
    await flush();
    const field = nameInput('Folder name')!;

    for (const bad of ['.', '..', 'a/b', 'bad\0name', 'Documents']) {
      await type(field, bad);
      expect(dialogButton('Create')!.disabled).toBe(true);
      await press(field, 'Enter');
      await flush();
      expect(callsOf('createDirectory')).toHaveLength(0);
    }
    expect(openDialog('New Folder')!.textContent).toContain('"Documents" already exists in this folder');
    await click(dialogButton('Cancel'));
    await flush();

    await rightClick(entryRow(m.host, '~/notes.txt'));
    await flush();
    await click(menuItem('Rename'));
    await flush();
    const rField = nameInput('New name')!;
    await type(rField, 'a.png');
    expect(dialogButton('Rename')!.disabled).toBe(true);
    expect(openDialog('Rename')!.textContent).toContain('"a.png" already exists in this folder');
    await press(rField, 'Enter');
    await flush();
    expect(callsOf('move')).toHaveLength(0);
  });

  it('creates and renames inside / without //name double slashes', async () => {
    m = await mountFiles();
    await click($$(m.host, '[data-duyo-kind="remochi.Item"]').at(-1));
    await flush();

    // Grant privilege for /
    await click($(m.host, '[data-files-unlock]'));
    await flush();
    const pending = (await getPrivilegeState('files')).pending[0]!;
    await act(async () => {
      await authenticatePrivilege({ password: 'pyxis', requestId: pending.requestId });
    });
    await flush();

    await click(buttonText(m.host, 'New Folder'));
    await flush();
    await type(nameInput('Folder name')!, 'opt');
    await click(dialogButton('Create'));
    await flush();
    expect(callsOf('createDirectory').at(-1)!.args).toEqual({ path: '/opt' });
    expect(entryNames(m.host)).toContain('opt');

    await rightClick(entryRow(m.host, '/vmlinuz'));
    await flush();
    await click(menuItem('Rename'));
    await flush();
    await type(nameInput('New name')!, 'vmlinuz.bak');
    await click(dialogButton('Rename') ?? null);
    await flush();
    expect(callsOf('move').at(-1)!.args).toEqual({ source: '/vmlinuz', destination: '/vmlinuz.bak' });
  });

  it('retries failed folder fetches automatically when revisited', async () => {
    m = await mountFiles();
    fake.failing['readDirectory'] = 'Temporary I/O error';
    await click(entryRow(m.host, '~/Documents'));
    await flush();
    expect(m.host.textContent).toContain('Temporary I/O error');

    delete fake.failing['readDirectory'];
    await click($(m.host, 'button[aria-label="Go Back"]'));
    await flush();
    await click(entryRow(m.host, '~/Documents'));
    await flush();
    expect(entryNames(m.host)).toEqual(['todo.md']);
  });

  it('invalidates cached subtree entries on directory rename and recursive delete', async () => {
    fake.dirs['~/Documents'] = [dir('~/Documents/sub'), file('~/Documents/todo.md', 40)];
    fake.dirs['~/Documents/sub'] = [file('~/Documents/sub/deep.txt', 10)];
    m = await mountFiles();

    // Warm cache for ~/Documents and ~/Documents/sub
    await click(entryRow(m.host, '~/Documents'));
    await flush();
    await click(entryRow(m.host, '~/Documents/sub'));
    await flush();
    expect(entryNames(m.host)).toEqual(['deep.txt']);

    // Go back to ~ and rename Documents -> Archive
    await click($(m.host, 'button[aria-label="Go Back"]'));
    await flush();
    await click($(m.host, 'button[aria-label="Go Back"]'));
    await flush();
    const readsBefore = callsOf('readDirectory').length;

    await rightClick(entryRow(m.host, '~/Documents'));
    await flush();
    await click(menuItem('Rename'));
    await flush();
    await type(nameInput('New name')!, 'Archive');
    await click(dialogButton('Rename') ?? null);
    await flush();

    // Re-create ~/Documents and open it: must NOT serve stale pre-rename cache!
    await click(buttonText(m.host, 'New Folder'));
    await flush();
    await type(nameInput('Folder name')!, 'Documents');
    await click(dialogButton('Create'));
    await flush();

    await click(entryRow(m.host, '~/Documents'));
    await flush();
    expect(callsOf('readDirectory').length).toBeGreaterThan(readsBefore + 1);
    expect(entryNames(m.host)).toEqual([]);

    // Delete Archive recursively after warming ~/Archive/sub, verify subtree cache clears
    await click($(m.host, 'button[aria-label="Go Back"]'));
    await flush();
    await click(entryRow(m.host, '~/Archive'));
    await flush();
    await click(entryRow(m.host, '~/Archive/sub'));
    await flush();
    await click($(m.host, 'button[aria-label="Go Back"]'));
    await flush();
    await click($(m.host, 'button[aria-label="Go Back"]'));
    await flush();

    await rightClick(entryRow(m.host, '~/Archive'));
    await flush();
    await click(menuItem('Delete'));
    await flush();
    await click(dialogButton('Delete'));
    await flush();

    // Recreate ~/Archive -> revisiting fetches fresh empty dir rather than stale cache
    await click(buttonText(m.host, 'New Folder'));
    await flush();
    await type(nameInput('Folder name')!, 'Archive');
    await click(dialogButton('Create'));
    await flush();
    await click(entryRow(m.host, '~/Archive'));
    await flush();
    expect(entryNames(m.host)).toEqual([]);
  });

  it('supports Forward button, Alt+Left/Alt+Right/Backspace, and narrow Places toggle', async () => {
    m = await mountFiles();
    const backBtn = () => $(m!.host, 'button[aria-label="Go Back"]')!;
    const forwardBtn = () => $(m!.host, 'button[aria-label="Go Forward"]')!;
    expect(forwardBtn().hasAttribute('disabled')).toBe(true);

    await click(entryRow(m.host, '~/Documents'));
    await flush();
    expect(backBtn().hasAttribute('disabled')).toBe(false);
    expect(forwardBtn().hasAttribute('disabled')).toBe(true);

    await click(backBtn());
    await flush();
    expect(crumbs(m.host)).toEqual(['Home']);
    expect(forwardBtn().hasAttribute('disabled')).toBe(false);

    await click(forwardBtn());
    await flush();
    expect(crumbs(m.host)).toEqual(['Home', 'Documents']);
    expect(forwardBtn().hasAttribute('disabled')).toBe(true);

    // Alt+Left and Alt+Right
    await press(document, 'ArrowLeft', { altKey: true });
    await flush();
    expect(crumbs(m.host)).toEqual(['Home']);
    await press(document, 'ArrowRight', { altKey: true });
    await flush();
    expect(crumbs(m.host)).toEqual(['Home', 'Documents']);

    // Backspace goes back when not editing an input
    await press(document, 'Backspace');
    await flush();
    expect(crumbs(m.host)).toEqual(['Home']);

    // Narrow screen Places button switches to panel 0 and Back to folder / picking place returns to panel 1
    const stack = m.app.root.$.stack;
    await click($(m.host, 'button[aria-label="Places"]'));
    await flush();
    expect(stack.getActiveIndex()).toBe(0);
    await click($(m.host, 'button[aria-label="Back to folder"]'));
    await flush();
    expect(stack.getActiveIndex()).toBe(1);
  });

  it('renders real storage metrics when available and graceful Unavailable fallback otherwise', async () => {
    m = await mountFiles();
    expect(m.host.textContent).toContain('Unavailable');
    expect(m.host.textContent).not.toContain('42%');
    expect(shown($(m.host, '[data-duyo-kind="remochi.ProgressBar"]'))).toBe(false);
    m.unmount();

    fake.storage = [
      { device: '/dev/mmcblk0p2', mountPoint: '/', fsType: 'ext4', total: 1024 * 1024 * 100, used: 1024 * 1024 * 25, available: 1024 * 1024 * 75 },
    ];
    m = await mountFiles();
    expect(m.host.textContent).toContain('75.0 MB free');
    expect(m.host.textContent).toContain('25.0 MB / 100.0 MB (25%)');
    expect(shown($(m.host, '[data-duyo-kind="remochi.ProgressBar"]'))).toBe(true);
  });

  it('handles corrupt image <img onerror> fallback and clipboard rejection without fake Copied flash', async () => {
    fake.files['~/a.png'] = 'not-an-image';
    fake.files['~/notes.txt'] = 'hello copy';
    m = await mountFiles();

    // Corrupt image preview -> fire error on <img>
    await click(entryRow(m.host, '~/a.png'));
    await flush();
    const img = $(m.host, 'img[alt="a.png"]')!;
    expect(img).toBeTruthy();
    await act(async () => {
      fireEvent.error(img);
    });
    await flush();
    expect(m.host.textContent).toContain('Failed to load image preview (corrupt or unsupported image)');
    expect(shown($(m.host, 'img[alt="a.png"]'))).toBe(false);

    // Clipboard failure must NOT flash Copied and surfaces an error
    const rejectWrite = vi.fn().mockRejectedValue(new Error('Clipboard blocked'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: rejectWrite },
      configurable: true,
    });

    await click(entryRow(m.host, '~/notes.txt'));
    await flush();
    const copyPathBtn = $(m.host, 'button[aria-label="Copy Path"]')!;
    expect(copyPathBtn).toBeTruthy();
    await click(copyPathBtn);
    await flush();
    expect(openDialog('Files Error')!.textContent).toContain('Clipboard blocked');
    await click(dialogButton('OK', 'Files Error'));
    await flush();

    await click($(m.host, 'button[aria-label="Copy Text Preview"]'));
    await flush();
    expect(m.host.textContent).not.toContain('Copied');
    expect(openDialog('Files Error')!.textContent).toContain('Clipboard blocked');
    await click(dialogButton('OK', 'Files Error'));
    await flush();

    // Clipboard success flashes Copied
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    await click($(m.host, 'button[aria-label="Copy Text Preview"]'));
    await flush();
    expect(m.host.textContent).toContain('Copied');
  });

  it('supports clear search button, hidden dotfiles toggle, global shortcuts, and Listing keyboard navigation', async () => {
    fake.dirs['~'] = [...HOME, file('~/.bashrc', 120)];
    m = await mountFiles();

    // Hidden dotfiles hidden by default, toggled by button and Ctrl+H
    expect(entryNames(m.host)).not.toContain('.bashrc');
    await click($(m.host, '[data-files-hidden-toggle]'));
    await flush();
    expect(entryNames(m.host)).toContain('.bashrc');
    await press(document, 'h', { ctrlKey: true });
    await flush();
    expect(entryNames(m.host)).not.toContain('.bashrc');

    // Ctrl+F focuses search, clear search button clears, Escape clears search / closes inspector
    await press(document, 'f', { ctrlKey: true });
    expect(document.activeElement).toBe(searchInput(m.host));
    await type(searchInput(m.host), 'notes');
    expect(entryNames(m.host)).toEqual(['notes.txt']);
    const clearBtn = $(m.host, 'button[aria-label="Clear Search"]')!;
    expect(shown(clearBtn)).toBe(true);
    await click(clearBtn);
    await flush();
    expect(searchInput(m.host).value).toBe('');
    expect(entryNames(m.host)).toHaveLength(5);

    // F5 refreshes, Ctrl+N opens New Folder
    const readsBefore = callsOf('readDirectory').length;
    await press(document, 'F5');
    await flush();
    expect(callsOf('readDirectory').length).toBe(readsBefore + 1);

    await press(document, 'n', { ctrlKey: true });
    await flush();
    expect(openDialog('New Folder')).toBeTruthy();
    await click(dialogButton('Cancel'));
    await flush();

    // Listing rows are keyboard-focusable with ArrowDown/ArrowUp, Enter, F2, Delete, Escape
    const docRow = entryRow(m.host, '~/Documents');
    expect(docRow.getAttribute('tabindex')).toBe('0');
    expect(docRow.getAttribute('role')).toBe('option');
    docRow.focus();
    await press(docRow, 'ArrowDown');
    expect(document.activeElement).toBe(entryRow(m.host, '~/Pictures'));
    await press(document.activeElement as HTMLElement, 'ArrowUp');
    expect(document.activeElement).toBe(docRow);

    // Enter on file opens inspector, Escape closes inspector
    const notesRow = entryRow(m.host, '~/notes.txt');
    notesRow.focus();
    await press(notesRow, 'Enter');
    await flush();
    expect(m.host.textContent).toContain('FULL PATH');
    await press(document, 'Escape');
    await flush();
    expect(m.host.textContent).not.toContain('FULL PATH');

    // F2 opens Rename, Delete opens Confirm Delete
    notesRow.focus();
    await press(notesRow, 'F2');
    await flush();
    expect(openDialog('Rename')).toBeTruthy();
    await click(dialogButton('Cancel'));
    await flush();

    await press(notesRow, 'Delete');
    await flush();
    expect(openDialog('Confirm Delete')).toBeTruthy();
    await click(dialogButton('Cancel'));
    await flush();
  });
});

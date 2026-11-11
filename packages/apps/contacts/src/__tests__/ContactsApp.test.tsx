// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contact } from '../model';
import { vcardOf } from '../model';
import {
  $,
  $$,
  click,
  mountContacts,
  nameInput,
  pill,
  searchInput,
  seedContact,
  storage,
  stubCanvas,
  titled,
  type,
  type Mounted,
} from './testUtils';

vi.mock('../../../../app-sdk/src/appStorage', () => ({
  loadAppData: async () => structuredClone(storage.doc),
  saveAppData: async (_store: string, data: { contacts: Contact[] }) => {
    storage.saves.push(structuredClone(data));
    return true;
  },
}));
vi.mock('../../../../app-sdk/src/usePyxisTheme', () => ({ usePyxisTheme: () => 'light' }));

stubCanvas();

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

let m: Mounted | undefined;
afterEach(() => {
  m?.unmount();
  m = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const five = () => [0, 1, 2, 3, 4].map((i) => seedContact(i, i === 2 ? { starred: true } : {}));
const dirText = (host: HTMLElement) => $(host, '.contacts-scroll')?.textContent ?? '';
const letters = (host: HTMLElement) =>
  $$(host, '[id^="letter-group-"]').map((g) => g.id.replace('letter-group-', ''));
const pickRow = (host: HTMLElement, name: string) => {
  const title = $$(host, '.contacts-scroll *').find((e) => e.children.length === 0 && e.textContent === name)!;
  click(title);
};

describe('Contacts: loading and listing', () => {
  it('groups A-Z with # last, opens the first stored contact in the card', async () => {
    m = await mountContacts([...five(), seedContact(6)]);
    expect(letters(m.host)).toEqual(['A', 'B', 'C', 'D', 'E', '#']);
    expect(nameInput(m.host).value).toBe('Ada Lovelace');
    expect(m.host.textContent).toContain('Send Email');
  });

  it('shows the scrubber only above 5 contacts, with letters disabled when empty', async () => {
    m = await mountContacts(five());
    expect($$(m.host, 'button').filter((b) => b.textContent === 'Z')).toEqual([]);
    m.unmount();
    m = await mountContacts([...five(), seedContact(5)]);
    const rail = $$(m.host, 'button').filter((b) => /^[A-Z#]$/.test(b.textContent ?? ''));
    expect(rail.length).toBe(27);
    expect((rail.find((b) => b.textContent === 'Z') as HTMLButtonElement).disabled).toBe(true);
    expect((rail.find((b) => b.textContent === 'A') as HTMLButtonElement).disabled).toBe(false);
  });

  it('category pills count and filter; Starred and a search narrow further', async () => {
    m = await mountContacts(five());
    const counts = Object.fromEntries($$(m.host, '.contacts-pill').map((p) => [p.firstElementChild!.textContent, p.lastElementChild!.textContent]));
    expect(counts).toEqual({ All: '5', '★ Starred': '1', Personal: '2', Work: '1', Family: '1', Other: '1' });
    click(pill(m.host, 'Starred'));
    expect(dirText(m.host)).toContain('Cleo Carter');
    expect(dirText(m.host)).not.toContain('Ada Lovelace');
    click(pill(m.host, 'All'));
    type(searchInput(m.host), 'bob');
    expect(dirText(m.host)).toContain('Bob Brown');
    expect(dirText(m.host)).not.toContain('Ada');
    type(searchInput(m.host), 'zzz');
    expect(m.host.textContent).toContain('No contacts match your search');
    type(searchInput(m.host), '');
    click(pill(m.host, 'Other'));
    click(pill(m.host, 'Work'));
    expect(dirText(m.host)).toContain('Bob Brown');
  });

  it('with nothing stored: empty list message, card placeholder and no export button', async () => {
    m = await mountContacts([]);
    expect(m.host.textContent).toContain('No contacts in this category');
    expect(m.host.textContent).toContain('Select a contact, or create a new one.');
    expect($(m.host, '[title="Export all contacts (.vcf)"]')!.style.display).toBe('none');
  });

  it('draws every icon it names', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    m = await mountContacts(five());
    expect(warn.mock.calls.filter(([t]) => String(t).startsWith('pyxis.Icon'))).toEqual([]);
  });

  it('keeps the title wrappers the old app had', async () => {
    m = await mountContacts(five());
    for (const t of ['New Contact', 'Export all contacts (.vcf)', 'Star Contact', 'Export vCard (.vcf)', 'Delete Contact']) {
      expect($(m.host, `[title="${t}"]`), t).toBeTruthy();
    }
    expect($(m.host, '[data-window-id]')).toBeTruthy();
  });
});

describe('Contacts: editing', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });

  it('New appends a contact, opens it, and saves after 600 ms', async () => {
    m = await mountContacts(five());
    click(titled(m.host, 'New Contact'));
    expect(nameInput(m.host).value).toBe('New contact');
    expect(storage.saves).toEqual([]);
    await advance(600);
    expect(storage.saves[0]!.contacts.length).toBe(6);
    expect(storage.saves[0]!.contacts[5]).toMatchObject({ name: 'New contact', category: 'Personal' });
  });

  it('typing edits the contact, bumps updatedAt and re-sorts the list', async () => {
    m = await mountContacts(five());
    type(nameInput(m.host), 'Zed');
    expect(letters(m.host)).toEqual(['B', 'C', 'D', 'E', 'Z']);
    type($(m.host, 'input[placeholder="name@example.com"]') as HTMLInputElement, 'zed@x.io');
    type($(m.host, 'input[placeholder="Organization name"]') as HTMLInputElement, 'Acme');
    type($(m.host, 'textarea') as HTMLTextAreaElement, 'hi');
    await advance(600);
    const saved = storage.saves.at(-1)!.contacts[0]!;
    expect(saved).toMatchObject({ name: 'Zed', email: 'zed@x.io', company: 'Acme', notes: 'hi' });
    expect(saved.updatedAt).toBeGreaterThan(1_700_000_000_000);
    expect(m.host.textContent).toContain('Saved to Pyxis PIM storage');
    expect(m.host.textContent).toContain('@ Acme');
  });

  it('category, birthday and star', async () => {
    m = await mountContacts(five());
    const d = m.app.root.$['detail']!.$;
    act(() => d['category']!.doChange({ value: 'Family' }));
    act(() => d['birthday']!.doChange({ value: new Date('1990-02-03T12:00:00Z') }));
    click(titled(m.host, 'Star Contact'));
    await advance(600);
    expect(storage.saves.at(-1)!.contacts[0]).toMatchObject({ category: 'Family', birthday: '1990-02-03', starred: true });
    expect($(m.host, '[title="Unstar Contact"]')).toBeTruthy();
  });

  it('copy shows feedback for 2 s', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    m = await mountContacts(five());
    click($$(m.host, 'button').find((b) => b.textContent?.includes('Copy Email'))!);
    expect(writeText).toHaveBeenCalledWith('p0@example.com');
    expect(m.host.textContent).toContain('Copied Email');
    await advance(2000);
    expect(m.host.textContent).toContain('Copy Email');
  });

  it('email and phone become mailto / tel links', async () => {
    m = await mountContacts(five());
    expect($$(m.host, 'a').map((a) => a.getAttribute('href'))).toEqual(['mailto:p0@example.com', 'tel:555-0000']);
  });

  it('export vCard builds the old file', () => {
    const c = seedContact(0, { company: 'Acme', notes: 'a\nb' });
    expect(vcardOf(c)).toBe(
      'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada Lovelace\r\nEMAIL:p0@example.com\r\nTEL:555-0000\r\nORG:Acme\r\nNOTE:a\\nb\r\nEND:VCARD'
    );
  });

  it('delete asks first, then removes the contact', async () => {
    m = await mountContacts(five());
    click(titled(m.host, 'Delete Contact'));
    expect(document.body.textContent).toContain('from your address book? This cannot be undone.');
    expect(storage.saves).toEqual([]);
    click($$(document.body, 'button').filter((b) => b.textContent === '(Delete)').at(-1)!);
    expect(dirText(m.host)).not.toContain('Ada Lovelace');
    expect(m.host.textContent).toContain('Select a contact, or create a new one.');
    await advance(600);
    expect(storage.saves.at(-1)!.contacts.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('cancelling the dialog does not close the app', async () => {
    const close = vi.spyOn(window, 'close').mockImplementation(() => {});
    m = await mountContacts(five());
    click(titled(m.host, 'Delete Contact'));
    click($$(document.body, 'button').filter((b) => b.textContent === '(Cancel)').at(-1)!);
    expect(close).not.toHaveBeenCalled();
    expect(nameInput(m.host).value).toBe('Ada Lovelace');
  });

  it('picking another contact opens it', async () => {
    m = await mountContacts(five());
    pickRow(m.host, 'Bob Brown');
    expect(nameInput(m.host).value).toBe('Bob Brown');
  });

  it('flushes a pending save when destroyed', async () => {
    m = await mountContacts(five());
    type(nameInput(m.host), 'Late');
    m.unmount();
    m = undefined;
    expect(storage.saves.at(-1)!.contacts[0]!.name).toBe('Late');
  });
});

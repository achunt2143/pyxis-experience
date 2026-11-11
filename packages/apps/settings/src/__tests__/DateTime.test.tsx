// @vitest-environment jsdom
import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  $, $$, callsTo, checked, click, echo, emit, installEcho, mountSettings, openSection, settle, stubCanvas, text, typeInto, shown, visibleText,
  type Mounted,
} from './testUtils';

// The theme hook starts the Echo clock; the wallpaper draws a canvas jsdom cannot.
vi.mock('../../../../app-sdk/src/usePyxisTheme', async (original) => ({
  ...(await original<object>()),
  usePyxisTheme: () => 'light',
}));
vi.mock('../../../../app-sdk/src/wallpaper/DynamicWallpaper', () => ({
  DynamicWallpaper: (p: { wallpaper: string; backend?: string; time?: number | null }) => (
    <div data-mock-wallpaper={p.wallpaper} data-backend={p.backend} data-time={p.time ?? ''} />
  ),
}));

stubCanvas();

let m: Mounted | undefined;
beforeEach(() => installEcho());
afterEach(() => {
  m?.unmount();
  m = undefined;
  vi.restoreAllMocks();
});

const lastSet = () => callsTo('settings', 'set').at(-1)?.args;
const zones = (host: HTMLElement) => $$(host, '[data-timezone]').map((z) => z.dataset.timezone);
/** remochi's Toggle turns on with the right arrow (its pointer path needs pointer capture, which jsdom lacks). */
const flip = async (host: HTMLElement) => {
  act(() => {
    fireEvent.keyDown($(host, '[data-clock24h] [role="switch"]')!, { key: 'ArrowRight' });
  });
  await settle();
};
const openDateTime = async (host: HTMLElement) => openSection(host, 'datetime');

describe('Settings: Date & Time, the clock', () => {
  it('shows the clock, its zone, and the groupboxes the suites look for', async () => {
    m = await mountSettings();
    await openDateTime(m.host);
    expect(text(m.host, '[data-clock-time]')).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
    expect(text(m.host, '[data-clock-zone]')).toBe('America/New_York');
    expect(text(m.host, '[data-settings-stage]')).toContain('UTC−05:00');
    expect($$(m.host, '[data-settings-group]').map((g) => g.dataset.settingsGroup)).toEqual(['clock', 'timezone', 'location']);
  });

  it('uses the 24-hour format when the setting says so', async () => {
    echo.settings.set('pyxis.clock24h', true);
    m = await mountSettings();
    await openDateTime(m.host);
    expect(text(m.host, '[data-clock-time]')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('writes the 24-hour switch (remochi 0.4 Toggle, value in and out)', async () => {
    m = await mountSettings();
    await openDateTime(m.host);
    await flip(m.host);
    expect(lastSet()).toEqual({ key: 'pyxis.clock24h', value: true });
    expect(text(m.host, '[data-clock-time]')).toMatch(/^\d{2}:\d{2}$/);
  });

  it('shows a refused 24-hour write and puts the switch back', async () => {
    echo.refuseSet.add('pyxis.clock24h');
    m = await mountSettings();
    await openDateTime(m.host);
    await flip(m.host);
    expect(visibleText($(m.host, '[data-settings-stage]')!)).toContain("Couldn't save:");
    expect(text(m.host, '[data-clock-time]')).toMatch(/(AM|PM)$/);
    expect(checked($(m.host, '[data-clock24h] [role="switch"]'))).toBe(false);
  });

  it('follows a zone change signalled by the time service', async () => {
    m = await mountSettings();
    await openDateTime(m.host);
    echo.zone = 'Asia/Tokyo';
    emit('org.geckoOS.time', 'TimezoneChanged', { timezone: 'Asia/Tokyo', utc_offset_minutes: 540 });
    await settle();
    expect(text(m.host, '[data-clock-zone]')).toBe('Asia/Tokyo');
    expect($(m.host, '[data-timezone-current]')!.dataset.timezoneCurrent).toBe('Asia/Tokyo');
  });
});

describe('Settings: Date & Time, the time zone', () => {
  it('lists the zones (data-timezone) under data-timezone-list, grouped by region, marking the current one', async () => {
    m = await mountSettings();
    await openDateTime(m.host);
    expect(zones(m.host)).toEqual(['America/New_York', 'Asia/Tokyo', 'Europe/Paris']);
    expect($(m.host, '[data-timezone-list]')!.getAttribute('role')).toBe('listbox');
    expect($(m.host, '[data-timezone="America/New_York"]')!.getAttribute('aria-selected')).toBe('true');
    expect($(m.host, '[data-timezone="America/New_York"]')!.textContent).toContain('Current');
    expect($(m.host, '[data-timezone-list]')!.textContent).toContain('America');
    expect($(m.host, '[data-timezone-current]')!.dataset.timezoneCurrent).toBe('America/New_York');
  });

  it('filters by what is typed into the search box (data-timezone-search) and drops the region headings', async () => {
    m = await mountSettings();
    await openDateTime(m.host);
    const search = $(m.host, '[data-timezone-search]') as HTMLInputElement;
    expect(search.getAttribute('aria-label')).toBe('Search time zones');
    expect(search.type).toBe('search');
    await typeInto(search, 'Tokyo');
    expect(zones(m.host)).toEqual(['Asia/Tokyo']);
    expect($(m.host, '[data-timezone-list]')!.textContent).not.toContain('ASIA');
    await typeInto(search, 'zzzz');
    expect(zones(m.host)).toEqual([]);
    expect($(m.host, '[data-timezone-list]')!.textContent).toContain('No time zone matches “zzzz”.');
  });

  it('sets the zone through the time service, reads the clock back, and says so', async () => {
    m = await mountSettings();
    await openDateTime(m.host);
    await typeInto($(m.host, '[data-timezone-search]') as HTMLInputElement, 'Tokyo');
    await click($(m.host, '[data-timezone="Asia/Tokyo"]')!);
    expect(callsTo('time', 'setTimezone').at(-1)?.args).toEqual({ timezone: 'Asia/Tokyo' });
    expect(text(m.host, '[data-timezone-status]')).toBe('Time zone set to Tokyo (UTC+09:00).');
    expect($(m.host, '[data-timezone-error]')).toBeNull();
    expect(text(m.host, '[data-clock-zone]')).toBe('Asia/Tokyo');
  });

  it('shows the refusal when the time service will not take the zone', async () => {
    echo.refuseZone = true;
    m = await mountSettings();
    await openDateTime(m.host);
    await click($(m.host, '[data-timezone="Europe/Paris"]')!);
    expect(text(m.host, '[data-timezone-error]')).toBe("Couldn't set the time zone to Paris: the time service refused it");
    expect($(m.host, '[data-timezone-status]')).toBeNull();
    // The list is usable again (nothing left pending).
    expect($(m.host, '[data-timezone="Europe/Paris"]')!.hasAttribute('disabled')).toBe(false);
  });

  it('says when the service accepted it but still reports the old zone', async () => {
    echo.ignoreZone = true;
    m = await mountSettings();
    await openDateTime(m.host);
    await click($(m.host, '[data-timezone="Europe/Paris"]')!);
    expect(text(m.host, '[data-timezone-error]')).toContain("didn't take the change: it still reports America/New_York");
  });

  it('keeps what the user was told when the section is left and opened again', async () => {
    m = await mountSettings();
    await openDateTime(m.host);
    await click($(m.host, '[data-timezone="Asia/Tokyo"]')!);
    await openSection(m.host, 'about');
    await openDateTime(m.host);
    expect(text(m.host, '[data-timezone-status]')).toContain('Time zone set to Tokyo');
  });
});

describe('Settings: Date & Time, the location', () => {
  const stage = (host: HTMLElement) => $(host, '[data-settings-stage]')!;
  const field = (host: HTMLElement, key: string) => $(host, `[data-location-field="${key}"]`) as HTMLInputElement;

  it('says where the sun is from: the zone, with coordinates and today', async () => {
    m = await mountSettings();
    await openDateTime(m.host);
    expect($(m.host, '[data-location-source]')!.dataset.locationSource).toBe('zone');
    expect(text(m.host, '[data-location-source]')).toContain('From time zone: New York');
    expect(text(m.host, '[data-location-coords]')).toMatch(/N, .*W/);
    expect(text(m.host, '[data-location-sun]')).toMatch(/Today/);
    expect($(m.host, '[data-location-use-zone]')).toBeNull();
    expect(visibleText(stage(m.host))).toContain('Set by hand…');
    expect(shown($(m.host, '[data-location-form]'))).toBe(false);
  });

  it('opens a form prefilled from the zone, validates it, and saves a hand-set location', async () => {
    m = await mountSettings();
    await openDateTime(m.host);
    await click($$(m.host, 'button').find((b) => b.textContent!.includes('Set by hand…'))!);
    expect(shown($(m.host, '[data-location-form]'))).toBe(true);
    expect(field(m.host, 'lat').value).toBe('40.7');

    await typeInto(field(m.host, 'lat'), '95');
    await click($(m.host, '[data-location-save]')!.querySelector('button')!);
    expect(callsTo('settings', 'set')).toHaveLength(0);
    expect(field(m.host, 'lat').getAttribute('aria-invalid')).toBe('true');
    expect(visibleText($(m.host, '[data-location-form]')!)).toMatch(/atitude/);

    await typeInto(field(m.host, 'lat'), '34.05 N');
    await typeInto(field(m.host, 'lon'), '118.24 W');
    await typeInto(field(m.host, 'label'), 'Home');
    await click($(m.host, '[data-location-save]')!.querySelector('button')!);
    expect(lastSet()).toEqual({
      key: 'pyxis.location',
      value: { lat: 34.05, lon: -118.24, label: 'Home', source: 'manual' },
    });
    expect(shown($(m.host, '[data-location-form]'))).toBe(false);
    expect($(m.host, '[data-location-source]')!.dataset.locationSource).toBe('manual');
    expect(text(m.host, '[data-location-source]')).toContain('Set by hand: Home');
    expect(visibleText(stage(m.host))).toContain('Change location…');
  });

  it('saves on Enter in a field', async () => {
    m = await mountSettings();
    const host = m.host;
    await openDateTime(host);
    await click($$(m.host, 'button').find((b) => b.textContent!.includes('Set by hand…'))!);
    await typeInto(field(m.host, 'lat'), '10');
    await typeInto(field(m.host, 'lon'), '20');
    act(() => {
      fireEvent.keyDown(field(host, 'lon'), { key: 'Enter' });
    });
    await settle();
    expect((lastSet()!.value as { lat: number }).lat).toBe(10);
  });

  it('cancels without writing, and goes back to the zone location', async () => {
    echo.settings.set('pyxis.location', { lat: 1, lon: 2, label: 'Somewhere', source: 'manual' });
    m = await mountSettings();
    await openDateTime(m.host);
    expect(text(m.host, '[data-location-source]')).toContain('Set by hand: Somewhere');
    await click($$(m.host, 'button').find((b) => b.textContent!.includes('Change location…'))!);
    expect(field(m.host, 'label').value).toBe('Somewhere');
    await click($(m.host, '[data-location-cancel]')!.querySelector('button')!);
    expect(shown($(m.host, '[data-location-form]'))).toBe(false);
    expect(callsTo('settings', 'set')).toHaveLength(0);

    await click($(m.host, '[data-location-use-zone]')!.querySelector('button')!);
    expect(lastSet()).toEqual({ key: 'pyxis.location', value: null });
    expect($(m.host, '[data-location-source]')!.dataset.locationSource).toBe('zone');
  });

  it('shows a refused save', async () => {
    echo.refuseSet.add('pyxis.location');
    m = await mountSettings();
    await openDateTime(m.host);
    await click($$(m.host, 'button').find((b) => b.textContent!.includes('Set by hand…'))!);
    await click($(m.host, '[data-location-save]')!.querySelector('button')!);
    expect(text(m.host, '[data-location-error]')).toContain("Couldn't save the location");
    expect(shown($(m.host, '[data-location-form]'))).toBe(true);
  });

  it('says a fixed day stands in when the zone has no city (UTC)', async () => {
    echo.zone = 'UTC';
    m = await mountSettings();
    await openDateTime(m.host);
    expect($(m.host, '[data-location-source]')!.dataset.locationSource).toBe('none');
    expect(text(m.host, '[data-location-source]')).toContain('fixed 06:30–18:30 day');
    expect($(m.host, '[data-location-coords]')).toBeNull();
    expect(text(m.host, '[data-location-sun]')).toContain('(fixed day)');
  });
});

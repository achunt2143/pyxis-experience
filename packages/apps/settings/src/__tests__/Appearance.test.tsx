// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  $, $$, callsTo, checked, click, echo, emit, installEcho, mountSettings, openSection, slideTo, stubCanvas, text, shown, visibleText,
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

describe('Settings: Appearance, the theme', () => {
  it('offers Light, Dark and Auto (data-theme-choice) with the stored one checked', async () => {
    echo.settings.set('pyxis.theme', 'dark');
    m = await mountSettings();
    expect($$(m.host, '[data-theme-choice]').map((c) => c.dataset.themeChoice)).toEqual(['light', 'dark', 'auto']);
    expect($(m.host, '[role="radiogroup"][aria-label="Theme"]')).not.toBeNull();
    expect(checked($(m.host, '[data-theme-choice="dark"]'))).toBe(true);
    expect(checked($(m.host, '[data-theme-choice="light"]'))).toBe(false);
    expect($(m.host, '[data-settings-group="theme"]')).not.toBeNull();
  });

  it('writes the theme when a card is pressed, and the card follows the stored value', async () => {
    m = await mountSettings();
    await click($(m.host, '[data-theme-choice="dark"]')!);
    expect(lastSet()).toEqual({ key: 'pyxis.theme', value: 'dark' });
    expect(checked($(m.host, '[data-theme-choice="dark"]'))).toBe(true);
    expect(checked($(m.host, '[data-theme-choice="light"]'))).toBe(false);
  });

  it('follows a theme changed elsewhere (quick settings, echo-cli)', async () => {
    m = await mountSettings();
    emit('org.geckoOS.settings', 'SettingChanged', { key: 'pyxis.theme', value: 'dark' });
    expect(checked($(m.host, '[data-theme-choice="dark"]'))).toBe(true);
  });

  it('shows a refused write instead of swallowing it, and clears it on the next write', async () => {
    echo.refuseSet.add('pyxis.theme');
    m = await mountSettings();
    expect($(m.host, '[data-settings-error]')).toBeNull();
    await click($(m.host, '[data-theme-choice="dark"]')!);
    expect(text(m.host, '[data-settings-error]')).toContain("Couldn't save pyxis.theme");
    expect(checked($(m.host, '[data-theme-choice="dark"]'))).toBe(false);
    echo.refuseSet.clear();
    await click($(m.host, '[data-theme-choice="dark"]')!);
    expect($(m.host, '[data-settings-error]')).toBeNull();
  });

  it('says when Auto turns the theme, only while Auto is chosen', async () => {
    m = await mountSettings();
    expect($(m.host, '[data-auto-next]')).toBeNull();
    await click($(m.host, '[data-theme-choice="auto"]')!);
    expect(text(m.host, '[data-auto-next]')).toMatch(/(Light|Dark) now\. Turns (dark|light)/);
  });
});

describe('Settings: Appearance, the launch bar', () => {
  it('offers Bottom and Left (data-launch-bar-choice), Bottom checked by default', async () => {
    m = await mountSettings();
    expect($$(m.host, '[data-launch-bar-choice]').map((c) => c.dataset.launchBarChoice)).toEqual(['bottom', 'left']);
    expect($(m.host, '[role="radiogroup"][aria-label="Launch bar"]')).not.toBeNull();
    expect($(m.host, '[data-settings-group="launch-bar"]')).not.toBeNull();
    expect(checked($(m.host, '[data-launch-bar-choice="bottom"]'))).toBe(true);
    expect(checked($(m.host, '[data-launch-bar-choice="left"]'))).toBe(false);
  });

  it('shows the stored placement', async () => {
    echo.settings.set('pyxis.launchBar.position', 'left');
    m = await mountSettings();
    expect(checked($(m.host, '[data-launch-bar-choice="left"]'))).toBe(true);
    expect(checked($(m.host, '[data-launch-bar-choice="bottom"]'))).toBe(false);
  });

  it('writes pyxis.launchBar.position when a card is pressed, and the card follows', async () => {
    m = await mountSettings();
    await click($(m.host, '[data-launch-bar-choice="left"]')!);
    expect(lastSet()).toEqual({ key: 'pyxis.launchBar.position', value: 'left' });
    expect(checked($(m.host, '[data-launch-bar-choice="left"]'))).toBe(true);
    await click($(m.host, '[data-launch-bar-choice="bottom"]')!);
    expect(lastSet()).toEqual({ key: 'pyxis.launchBar.position', value: 'bottom' });
    expect(checked($(m.host, '[data-launch-bar-choice="bottom"]'))).toBe(true);
  });

  it('follows a placement changed elsewhere', async () => {
    m = await mountSettings();
    emit('org.geckoOS.settings', 'SettingChanged', { key: 'pyxis.launchBar.position', value: 'left' });
    expect(checked($(m.host, '[data-launch-bar-choice="left"]'))).toBe(true);
  });

  it('shows a refused write instead of swallowing it', async () => {
    echo.refuseSet.add('pyxis.launchBar.position');
    m = await mountSettings();
    await click($(m.host, '[data-launch-bar-choice="left"]')!);
    expect(text(m.host, '[data-settings-error]')).toContain("Couldn't save pyxis.launchBar.position");
    expect(checked($(m.host, '[data-launch-bar-choice="left"]'))).toBe(false);
  });
});

describe('Settings: Appearance, the wallpaper', () => {
  it('lists every wallpaper (data-wallpaper) with the stored one checked and Active', async () => {
    echo.settings.set('pyxis.wallpaper', 'sunset');
    m = await mountSettings();
    expect($$(m.host, '[data-wallpaper]').map((b) => b.dataset.wallpaper)).toEqual([
      'daylight', 'aurora', 'sunset', 'forest', 'mochi',
    ]);
    expect(checked($(m.host, '[data-wallpaper="sunset"]'))).toBe(true);
    expect($(m.host, '[data-wallpaper="sunset"]')!.textContent).toContain('Active');
    expect($(m.host, '[data-wallpaper="aurora"]')!.textContent).not.toContain('Active');
    expect($(m.host, '[data-settings-group="wallpaper"]')).not.toBeNull();
  });

  it('draws each thumbnail with the css backend and the large preview with webgl', async () => {
    m = await mountSettings();
    const grid = $$(m.host, '[data-wallpaper] [data-mock-wallpaper]');
    expect(grid).toHaveLength(5);
    expect(grid.every((w) => w.dataset.backend === 'css')).toBe(true);
    expect($(m.host, '[data-wallpaper-preview] [data-mock-wallpaper]')!.dataset.backend).toBe('webgl');
  });

  it('writes the wallpaper when a thumbnail is pressed', async () => {
    m = await mountSettings();
    await click($(m.host, '[data-wallpaper="sunset"]')!);
    expect(lastSet()).toEqual({ key: 'pyxis.wallpaper', value: 'sunset' });
    expect(checked($(m.host, '[data-wallpaper="sunset"]'))).toBe(true);
    expect($(m.host, '[data-wallpaper-preview]')!.dataset.wallpaperPreview).toBe('sunset');
  });

  it('follows a wallpaper changed elsewhere', async () => {
    m = await mountSettings();
    emit('org.geckoOS.settings', 'SettingChanged', { key: 'pyxis.wallpaper', value: 'forest' });
    expect(checked($(m.host, '[data-wallpaper="forest"]'))).toBe(true);
  });

  it('offers Flowing and Still, writes the motion, and notes reduced animations', async () => {
    m = await mountSettings();
    expect($(m.host, '[data-wallpaper-motion-note]')).toBeNull();
    await click($(m.host, '[data-wallpaper-motion="still"]')!);
    expect(lastSet()).toEqual({ key: 'pyxis.wallpaper.motion', value: 'still' });
    expect(checked($(m.host, '[data-wallpaper-motion="still"]'))).toBe(true);
    await click($(m.host, '[data-wallpaper-motion="flow"]')!);
    expect(checked($(m.host, '[data-wallpaper-motion="flow"]'))).toBe(true);

    emit('org.geckoOS.settings', 'SettingChanged', { key: 'pyxis.animations', value: 'reduced' });
    expect(text(m.host, '[data-wallpaper-motion-note]')).toContain('Animations are reduced (Accessibility)');
    emit('org.geckoOS.settings', 'SettingChanged', { key: 'pyxis.animations', value: 'off' });
    expect(text(m.host, '[data-wallpaper-motion-note]')).toContain('Animations are off');
  });
});

describe('Settings: Appearance, Daylight', () => {
  it('shows the phase pill, the scrubber and the follow/pin choices only for Daylight', async () => {
    m = await mountSettings();
    expect(text(m.host, '[data-daylight-phase]')).toMatch(/\d{2}:\d{2} (AM|PM) · /);
    expect($(m.host, '[data-daylight-scrubber]')).not.toBeNull();
    expect($$(m.host, '[data-daylight-time]').map((c) => c.dataset.daylightTime)).toEqual(['follow', 'pin']);
    expect(checked($(m.host, '[data-daylight-time="follow"]'))).toBe(true);
    expect(text(m.host, '[data-daylight-desktop]')).toContain('Desktop follows the day');
    expect(text(m.host, '[data-daylight-sun]')).toMatch(/Sunrise/);

    await click($(m.host, '[data-wallpaper="aurora"]')!);
    expect($(m.host, '[data-daylight-scrubber]')).toBeNull();
    expect($(m.host, '[data-daylight-time]')).toBeNull();
    expect($(m.host, '[data-daylight-phase]')).toBeNull();
  });

  it('scrubs a preview time without writing anything, and Back to now returns', async () => {
    m = await mountSettings();
    const scrubber = $(m.host, '[data-daylight-scrubber]')!;
    expect($(m.host, '[data-daylight-scrub-reset]')!.hasAttribute('disabled')).toBe(true);
    await slideTo(scrubber, 360);
    expect(text(m.host, '[data-daylight-phase]')).toContain('06:00 AM');
    expect($(m.host, '[data-wallpaper-preview] [data-mock-wallpaper]')!.dataset.time).toBe('360');
    expect(callsTo('settings', 'set')).toHaveLength(0);
    expect($(m.host, '[data-daylight-scrub-reset]')!.hasAttribute('disabled')).toBe(false);

    await click($(m.host, '[data-daylight-scrub-reset]')!);
    expect($(m.host, '[data-wallpaper-preview] [data-mock-wallpaper]')!.dataset.time).toBe('');
    expect(text(m.host, '[data-daylight-phase]')).not.toContain('06:00 AM');
  });

  it('pins the scrubbed time, and follows the day again', async () => {
    m = await mountSettings();
    await slideTo($(m.host, '[data-daylight-scrubber]')!, 390);
    await click($(m.host, '[data-daylight-time="pin"]')!);
    expect(lastSet()).toEqual({ key: 'pyxis.wallpaper.pinnedTime', value: 390 });
    expect(checked($(m.host, '[data-daylight-time="pin"]'))).toBe(true);
    expect(text(m.host, '[data-daylight-desktop]')).toContain('Desktop pinned at 06:30 AM');
    expect($(m.host, '[data-daylight-scrub-reset]')!.textContent).toContain('Back to pinned');

    await click($(m.host, '[data-daylight-time="follow"]')!);
    expect(lastSet()).toEqual({ key: 'pyxis.wallpaper.pinnedTime', value: null });
    expect(checked($(m.host, '[data-daylight-time="follow"]'))).toBe(true);
  });

  it('reads the clock hour format from the 24-hour setting', async () => {
    echo.settings.set('pyxis.clock24h', true);
    m = await mountSettings();
    expect(text(m.host, '[data-daylight-phase]')).toMatch(/^\d{2}:\d{2} · /);
  });

  it('counts a hand-set location as the sun place', async () => {
    echo.settings.set('pyxis.location', { lat: -33.9, lon: 151.2, label: 'Sydney', source: 'manual' });
    m = await mountSettings();
    expect(text(m.host, '[data-daylight-sun]')).not.toContain('fixed day');
  });

  it('keeps the visible tree to the section that is open', async () => {
    m = await mountSettings();
    await openSection(m.host, 'accessibility');
    expect($(m.host, '[data-mock-wallpaper]')).toBeNull();
    expect(shown($(m.host, '[data-settings-stage]'))).toBe(true);
    expect(visibleText(m.host)).toContain('ANIMATIONS');
  });
});

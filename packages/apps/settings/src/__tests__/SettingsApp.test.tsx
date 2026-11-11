// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  $, $$, callsTo, checked, click, echo, emit, installEcho, mountSettings, openSection, settle, stubCanvas, text, visibleText,
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

describe('Settings: the shell', () => {
  it('lists the seven sections on the rail, each carrying data-settings-section, with Appearance open', async () => {
    m = await mountSettings();
    expect($$(m.host, '[data-settings-section]').map((r) => r.dataset.settingsSection)).toEqual([
      'appearance', 'sound', 'accessibility', 'network', 'datetime', 'system', 'about',
    ]);
    expect($(m.host, '[data-settings-rail]')).not.toBeNull();
    expect($(m.host, '[data-settings-stage]')!.dataset.settingsStage).toBe('appearance');
    expect(text(m.host, '[data-settings-stage] h1')).toBe('Appearance');
    expect($(m.host, '[data-window-id]')).not.toBeNull();
  });

  it('opens a section when its row is pressed, and shows only that one', async () => {
    m = await mountSettings();
    expect($(m.host, '[data-theme-choice]')).not.toBeNull();
    await openSection(m.host, 'accessibility');
    expect($(m.host, '[data-settings-stage]')!.dataset.settingsStage).toBe('accessibility');
    expect(text(m.host, '[data-settings-stage] h1')).toBe('Accessibility');
    expect($(m.host, '[data-theme-choice]')).toBeNull();
    expect($$(m.host, '[data-animation-mode]')).toHaveLength(3);
  });

  it('marks the open section selected on the rail', async () => {
    m = await mountSettings();
    expect($(m.host, '[data-settings-section="appearance"] .mochi-item')!.className).toContain('selected');
    await openSection(m.host, 'network');
    expect($(m.host, '[data-settings-section="appearance"] .mochi-item')!.className).not.toContain('selected');
    expect($(m.host, '[data-settings-section="network"] .mochi-item')!.className).toContain('selected');
  });

  it('makes rail rows keyboard buttons: Enter and Space open a section, other keys do nothing', async () => {
    m = await mountSettings();
    const row = (id: string) => $(m!.host, `[data-settings-section="${id}"]`)!;
    expect(row('sound').getAttribute('role')).toBe('button');
    expect(row('sound').tabIndex).toBe(0);
    expect(row('appearance').getAttribute('aria-current')).toBe('page');
    const press = async (id: string, key: string) => {
      await act(async () => {
        row(id).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      });
      await settle();
    };
    await press('sound', 'a');
    expect($(m.host, '[data-settings-stage]')!.dataset.settingsStage).toBe('appearance');
    await press('sound', 'Enter');
    expect($(m.host, '[data-settings-stage]')!.dataset.settingsStage).toBe('sound');
    await press('about', ' ');
    expect($(m.host, '[data-settings-stage]')!.dataset.settingsStage).toBe('about');
    expect(row('about').getAttribute('aria-current')).toBe('page');
  });

  it('puts the OS version from system.getInfo in the rail footer', async () => {
    m = await mountSettings();
    expect(m.host.textContent).toContain('Pyxis OS 0.5.0');
  });

  it('says just "Pyxis OS" when the system service did not answer', async () => {
    echo.info = null;
    m = await mountSettings();
    expect(m.host.textContent).toContain('Pyxis OS');
    expect(m.host.textContent).not.toContain('Pyxis OS 0.5.0');
  });
});

describe('Settings: Accessibility', () => {
  it('shows the stored animation mode and writes a new one through settings and Evo', async () => {
    echo.settings.set('pyxis.animations', 'reduced');
    m = await mountSettings();
    await openSection(m.host, 'accessibility');
    expect(checked($(m.host, '[data-animation-mode="reduced"]'))).toBe(true);
    expect(checked($(m.host, '[data-animation-mode="full"]'))).toBe(false);

    await click($(m.host, '[data-animation-mode="off"]')!);
    expect(callsTo('settings', 'set').at(-1)?.args).toEqual({ key: 'pyxis.animations', value: 'off' });
    expect(callsTo('evo', 'SetAnimationSettings').at(-1)?.args).toEqual({ mode: 'off' });
    expect(checked($(m.host, '[data-animation-mode="off"]'))).toBe(true);
  });

  it('follows a change made elsewhere', async () => {
    m = await mountSettings();
    await openSection(m.host, 'accessibility');
    emit('org.geckoOS.settings', 'SettingChanged', { key: 'pyxis.animations', value: 'off' });
    expect(checked($(m.host, '[data-animation-mode="off"]'))).toBe(true);
  });
});

describe('Settings: Network', () => {
  it('shows the connection the network service reports', async () => {
    m = await mountSettings();
    await openSection(m.host, 'network');
    const stage = $(m.host, '[data-settings-stage]')!;
    expect(stage.textContent).toContain('Connected to Network');
    expect(stage.textContent).toContain('Active connection via wifi');
    expect(stage.textContent).toContain('GeckoNet');
  });

  it('says Disconnected when it is, and keeps the spinner when the service gives no answer', async () => {
    echo.network = { connected: false, ssid: '', type: '' };
    m = await mountSettings();
    await openSection(m.host, 'network');
    expect(visibleText($(m.host, '[data-settings-stage]')!)).toContain('Disconnected');
    expect($(m.host, '[data-settings-stage]')!.textContent).toContain('Wired Connection');
    m.unmount();

    echo.network = null;
    m = await mountSettings();
    await openSection(m.host, 'network');
    expect(visibleText($(m.host, '[data-settings-stage]')!)).toContain('Detecting network hardware');
    expect(visibleText($(m.host, '[data-settings-stage]')!)).not.toContain('Connected');
  });
});

describe('Settings: About', () => {
  it('lists the real system facts, each row carrying data-about', async () => {
    m = await mountSettings();
    await openSection(m.host, 'about');
    const rows = Object.fromEntries($$(m.host, '[data-about]').map((r) => [r.dataset.about, r.textContent]));
    expect(Object.keys(rows)).toEqual(['os', 'kernel', 'memory', 'cpu', 'hostname', 'uptime']);
    expect(rows.os).toContain('Pyxis OS 0.5.0 (build 1234)');
    expect(rows.kernel).toContain('Linux 6.12.1');
    expect(rows.memory).toContain('4.0 GB (3.0 GB available)');
    expect(rows.cpu).toContain('QEMU Virtual CPU · 4 cores');
    expect(rows.hostname).toContain('pyxis-vm');
    expect(rows.uptime).toContain('1 h 2 min');
    expect($(m.host, '[data-settings-group="about"]')).not.toBeNull();
  });

  it('shows "unknown" and says so when the system service did not answer', async () => {
    echo.info = null;
    m = await mountSettings();
    await openSection(m.host, 'about');
    expect($$(m.host, '[data-about]').every((r) => r.textContent!.includes('unknown'))).toBe(true);
    expect(visibleText($(m.host, '[data-settings-stage]')!)).toContain("The system service didn't answer.");
  });

  it('asks the system while the answer is in flight, and the answer fills in without reopening', async () => {
    let release!: (v: unknown) => void;
    const answer = new Promise((r) => (release = r));
    const original = echo.info;
    const { echoClient } = await import('../../../../app-sdk/src/EchoClient');
    const mocked = vi.mocked(echoClient.callMethod);
    const impl = mocked.getMockImplementation()!;
    mocked.mockImplementation(async (s, i, method, args) => (s === 'system' && method === 'getInfo' ? answer : impl(s, i, method, args)));
    m = await mountSettings();
    await openSection(m.host, 'about');
    expect(visibleText($(m.host, '[data-settings-stage]')!)).toContain('Asking the system');
    await act(async () => release(original));
    await settle();
    expect(visibleText($(m.host, '[data-settings-stage]')!)).not.toContain('Asking the system');
    expect(visibleText($(m.host, '[data-settings-stage]')!)).not.toContain("didn't answer");
    expect($$(m.host, '[data-about]')).toHaveLength(6);
  });
});

describe('Settings: System', () => {
  it('asks before restarting, then restarts and says so', async () => {
    m = await mountSettings();
    await openSection(m.host, 'system');
    const restart = $$(m.host, 'button').find((b) => b.textContent === 'Restart')!;
    await click(restart);
    expect(document.body.textContent).toContain('Restart System?');
    expect(callsTo('power', 'reboot')).toHaveLength(0);

    const confirm = $$(document.body, 'button').find((b) => b.textContent!.includes('Restart') && b !== restart)!;
    await click(confirm);
    expect(callsTo('power', 'reboot')).toHaveLength(1);
    expect(visibleText($(m.host, '[data-settings-stage]')!)).toContain('Rebooting system...');
  });

  it('does nothing when the confirmation is cancelled', async () => {
    m = await mountSettings();
    await openSection(m.host, 'system');
    await click($$(m.host, 'button').find((b) => b.textContent === 'Shut Down')!);
    expect(document.body.textContent).toContain('Shut Down System?');
    await click($$(document.body, 'button').find((b) => b.textContent!.includes('Cancel'))!);
    expect(callsTo('power', 'shutdown')).toHaveLength(0);
    expect(visibleText($(m.host, '[data-settings-stage]')!)).not.toContain('Shutting down');
  });

  it('uses the sleep wording for Sleep', async () => {
    m = await mountSettings();
    await openSection(m.host, 'system');
    await click($$(m.host, 'button').find((b) => b.textContent === 'Sleep')!);
    expect(document.body.textContent).toContain('Suspend System?');
    expect(document.body.textContent).toContain('low-power sleep mode');
  });
});

describe('Settings: Sound', () => {
  it('shows the master volume and the output devices', async () => {
    m = await mountSettings();
    await openSection(m.host, 'sound');
    const stage = $(m.host, '[data-settings-stage]')!;
    expect(stage.textContent).toContain('40%');
    expect(stage.textContent).toContain('Built-in Audio');
    expect(stage.textContent).toContain('HDMI Audio');
    expect(stage.textContent).toContain('Default');
  });

  it('mutes and unmutes through the audio service', async () => {
    m = await mountSettings();
    await openSection(m.host, 'sound');
    await click($(m.host, 'button[title="Mute"]')!);
    expect(callsTo('audio', 'setMute').at(-1)?.args).toEqual({ muted: true });
    expect($(m.host, '[data-settings-stage]')!.textContent).toContain('Muted');
    await click($(m.host, 'button[title="Unmute"]')!);
    expect(callsTo('audio', 'setMute').at(-1)?.args).toEqual({ muted: false });
    expect($(m.host, '[data-settings-stage]')!.textContent).toContain('40%');
  });

  it('follows a volume changed elsewhere (the slider too: remochi 0.4 sliders are controlled)', async () => {
    m = await mountSettings();
    await openSection(m.host, 'sound');
    emit('org.geckoOS.audio', 'VolumeChanged', { volume: 72, muted: false });
    expect($(m.host, '[data-settings-stage]')!.textContent).toContain('72%');
    expect($(m.host, '[role="slider"]')!.getAttribute('aria-valuenow')).toBe('72');
  });

  it('makes the chosen output the default', async () => {
    m = await mountSettings();
    await openSection(m.host, 'sound');
    const hdmi = $$(m.host, '.st-output').find((r) => r.textContent!.includes('HDMI'))!;
    await click(hdmi);
    expect(callsTo('audio', 'setDefaultOutput').at(-1)?.args).toEqual({ id: 2 });
    expect($$(m.host, '.st-output').find((r) => r.textContent!.includes('HDMI'))!.className).toContain('current');
    expect($$(m.host, '.st-output').find((r) => r.textContent!.includes('Built-in'))!.className).not.toContain('current');
  });

  it('plays the test tone as the notification sound', async () => {
    m = await mountSettings();
    await openSection(m.host, 'sound');
    await click($$(m.host, 'button').find((b) => b.textContent!.includes('Play Test Tone'))!);
    expect(callsTo('sound', 'play').at(-1)?.args).toEqual({ name: 'notification' });
  });

  it('says there is no audio when the service cannot be asked', async () => {
    echo.volume = null;
    m = await mountSettings();
    await openSection(m.host, 'sound');
    expect(visibleText($(m.host, '[data-settings-stage]')!)).toContain('No audio output is available.');
    expect(visibleText($(m.host, '[data-settings-stage]')!)).not.toContain('Play Test Tone');
  });
});

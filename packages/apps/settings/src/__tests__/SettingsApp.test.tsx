// @vitest-environment jsdom
import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  $, $$, callsTo, checked, click, echo, emit, installEcho, mountSettings, openSection, settle, slideTo, stubCanvas, text, toggleSwitch, typeInto, visibleText,
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
  it('lists the eight sections on the rail, each carrying data-settings-section, with Appearance open', async () => {
    m = await mountSettings();
    expect($$(m.host, '[data-settings-section]').map((r) => r.dataset.settingsSection)).toEqual([
      'appearance', 'sound', 'accessibility', 'network', 'datetime', 'users', 'system', 'about',
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

  it('says Disconnected when it is, and clears spinner with an error when the service gives no answer or rejects', async () => {
    echo.network = { connected: false, ssid: '', type: '' };
    m = await mountSettings();
    await openSection(m.host, 'network');
    expect(visibleText($(m.host, '[data-settings-stage]')!)).toContain('Disconnected');
    expect($(m.host, '[data-settings-stage]')!.textContent).toContain('Wired Connection');
    m.unmount();

    echo.network = null;
    m = await mountSettings();
    await openSection(m.host, 'network');
    expect(visibleText($(m.host, '[data-settings-stage]')!)).not.toContain('Detecting network hardware');
    expect(visibleText($(m.host, '[data-settings-stage]')!)).not.toContain('Connected');
    expect($(m.host, '[data-network-error][role="alert"]')!.textContent).toContain('did not answer');
    m.unmount();

    const { echoClient } = await import('../../../../app-sdk/src/EchoClient');
    const mocked = vi.mocked(echoClient.callMethod);
    const impl = mocked.getMockImplementation()!;
    mocked.mockImplementation(async (s, i, method, args) => {
      if (s === 'network' && method === 'getStatus') throw new Error('network down');
      return impl(s, i, method, args);
    });
    m = await mountSettings();
    await openSection(m.host, 'network');
    expect(visibleText($(m.host, '[data-settings-stage]')!)).not.toContain('Detecting network hardware');
    expect($(m.host, '[data-network-error][role="alert"]')!.textContent).toContain('network down');
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

  it('clears the pending power action when the confirmation dialog is dismissed', async () => {
    m = await mountSettings();
    await openSection(m.host, 'system');
    await click($$(m.host, 'button').find((b) => b.textContent === 'Restart')!);
    expect(document.body.textContent).toContain('Restart System?');
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(callsTo('power', 'reboot')).toHaveLength(0);
    expect(m.app.root.get('pendingPower')).toBe('');
  });

  it('uses the sleep wording for Sleep', async () => {
    m = await mountSettings();
    await openSection(m.host, 'system');
    await click($$(m.host, 'button').find((b) => b.textContent === 'Sleep')!);
    expect(document.body.textContent).toContain('Suspend System?');
    expect(document.body.textContent).toContain('low-power sleep mode');
  });

  it('shows the Privileged access groupbox with sudo Details disclosure', async () => {
    m = await mountSettings();
    await openSection(m.host, 'system');
    const stage = $(m.host, '[data-settings-stage]')!;
    expect(stage.textContent).toContain('PRIVILEGED ACCESS');
    const card = $(m.host, '[data-privilege-card]');
    expect(card).not.toBeNull();
    const details = $(m.host, '[data-privilege-details]');
    expect(details).not.toBeNull();
    expect(details!.textContent).toContain('sudo -l');
    expect(details!.textContent).toContain('/etc/sudoers.d/pyxis');
  });

  it('shows App permissions and toggles capabilities via nova.SetPermission', async () => {
    m = await mountSettings();
    const host = m.host;
    await openSection(host, 'system');
    const stage = $(host, '[data-settings-stage]')!;
    expect(stage.textContent).toContain('APP PERMISSIONS');
    await vi.waitFor(() => {
      expect($(host, '[data-permission-toggle="files:filesystem:write"]')).not.toBeNull();
    });
    const toggle = $(host, '[data-permission-toggle="files:filesystem:write"]')!;
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await toggleSwitch(toggle, 'ArrowLeft');
    await vi.waitFor(() => {
      expect(callsTo('nova', 'SetPermission')).toHaveLength(1);
    });
    expect(callsTo('nova', 'SetPermission')[0].args).toEqual({
      appId: 'files',
      permission: 'filesystem:write',
      granted: false,
    });
    expect($(host, '[data-permission-toggle="files:filesystem:write"]')?.getAttribute('aria-checked')).toBe('false');
  });

  it('shows Display & outputs and updates scale factor via evo.SetOutputConfig', async () => {
    m = await mountSettings();
    const host = m.host;
    await openSection(host, 'system');
    const stage = $(host, '[data-settings-stage]')!;
    expect(stage.textContent).toContain('DISPLAY & OUTPUTS');
    await vi.waitFor(() => {
      expect($(host, '[data-display-scale="eDP-1:1.5"]')).not.toBeNull();
    });
    const scaleBtn = $(host, '[data-display-scale="eDP-1:1.5"]')!;
    await click(scaleBtn);
    await vi.waitFor(() => {
      expect(callsTo('evo', 'SetOutputConfig').length).toBeGreaterThanOrEqual(1);
    });
    expect(callsTo('evo', 'SetOutputConfig').at(-1)?.args).toEqual({
      name: 'eDP-1',
      scale: 1.5,
    });
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

  it('controls microphone input mute, default input device, and system sound previews', async () => {
    m = await mountSettings();
    await openSection(m.host, 'sound');
    const stage = $(m.host, '[data-settings-stage]')!;
    await vi.waitFor(() => {
      expect(stage.textContent).toContain('65%');
      expect(stage.textContent).toContain('USB Headset Mic');
    });

    await click($(m.host, '[data-input-mute]')!);
    expect(callsTo('audio', 'setInputMute').at(-1)?.args).toEqual({ muted: true });
    expect($(m.host, '[data-input-level]')!.textContent).toBe('Muted');

    const usbMic = $$(m.host, '[data-input-devices] .st-output').find((r) => r.textContent!.includes('USB Headset Mic'))!;
    await click(usbMic);
    expect(callsTo('audio', 'setDefaultInput').at(-1)?.args).toEqual({ id: 11 });

    await click($(m.host, '[data-sound-preview="error"] button')!);
    expect(callsTo('sound', 'play').at(-1)?.args).toEqual({ name: 'error' });
  });
});

describe('Settings: Extended full-featured controls', () => {
  it('persists accessibility text scale, high contrast, reduce transparency, and cursor size', async () => {
    m = await mountSettings();
    await openSection(m.host, 'accessibility');

    await click($(m.host, '[data-text-scale="125"]')!);
    expect(callsTo('settings', 'set').at(-1)?.args).toEqual({
      key: 'pyxis.accessibility.textScale',
      value: 125,
    });
    expect(checked($(m.host, '[data-text-scale="125"]'))).toBe(true);

    // Scope inside each wrapper first: usePyxisAccessibility() sets data-high-contrast and
    // data-reduce-transparency on <html>, which matches ancestor combinators on m.host.querySelector().
    const hcToggle = $($(m.host, '[data-high-contrast]')!, '[role="switch"]')!;
    act(() => {
      fireEvent.keyDown(hcToggle, { key: 'ArrowRight' });
    });
    await settle();
    expect(callsTo('settings', 'set').at(-1)?.args).toEqual({
      key: 'pyxis.accessibility.highContrast',
      value: true,
    });

    const rtToggle = $($(m.host, '[data-reduce-transparency]')!, '[role="switch"]')!;
    act(() => {
      fireEvent.keyDown(rtToggle, { key: 'ArrowRight' });
    });
    await settle();
    expect(callsTo('settings', 'set').at(-1)?.args).toEqual({
      key: 'pyxis.accessibility.reduceTransparency',
      value: true,
    });

    await click($(m.host, '[data-cursor-size="large"]')!);
    expect(callsTo('settings', 'set').at(-1)?.args).toEqual({
      key: 'pyxis.accessibility.cursorSize',
      value: 'large',
    });
    expect(checked($(m.host, '[data-cursor-size="large"]'))).toBe(true);
  });

  it('scans and joins Wi-Fi, saves DNS nameservers, and updates hostname in Network', async () => {
    m = await mountSettings();
    await openSection(m.host, 'network');
    await vi.waitFor(() => {
      expect($(m!.host, '[data-wifi-network="StudioGuest"]')).not.toBeNull();
    });

    await click($(m.host, '[data-wifi-scan]')!);
    expect(callsTo('network', 'scanWifi').length).toBeGreaterThanOrEqual(2);

    await click($(m.host, '[data-wifi-network="StudioGuest"]')!);
    await typeInto($(m.host, '[data-wifi-password]') as HTMLInputElement, 'guestpass');
    await click($(m.host, '[data-wifi-connect]')!);
    expect(callsTo('network', 'connectWifi').at(-1)?.args).toEqual({
      ssid: 'StudioGuest',
      password: 'guestpass',
    });

    await typeInto($(m.host, '[data-net-dns-input]') as HTMLInputElement, '9.9.9.9, 1.1.1.1');
    await click($(m.host, '[data-net-dns-save]')!);
    expect(callsTo('network', 'setDNS').at(-1)?.args).toEqual({
      nameservers: ['9.9.9.9', '1.1.1.1'],
    });

    await typeInto($(m.host, '[data-net-hostname-input]') as HTMLInputElement, 'pyxis-studio');
    await click($(m.host, '[data-net-hostname-save]')!);
    expect(callsTo('network', 'setHostname').at(-1)?.args).toEqual({
      hostname: 'pyxis-studio',
    });
  });

  it('updates screen brightness, Do Not Disturb, battery readout, and display resolution', async () => {
    m = await mountSettings();
    await openSection(m.host, 'system');
    await vi.waitFor(() => {
      expect($(m!.host, '[data-system-battery]')?.textContent).toContain('Charging · 82%');
      expect($(m!.host, '[data-display-resolution="eDP-1"]')).not.toBeNull();
    });

    const brightnessSlider = $(m.host, '[data-system-brightness]')!;
    await slideTo(brightnessSlider, 55);
    expect(callsTo('settings', 'set').some((c) => c.args.key === 'pyxis.brightness' && c.args.value === 55)).toBe(true);
    expect(callsTo('power', 'setScreenBrightness').at(-1)?.args).toEqual({ brightness: 55 });

    await toggleSwitch($(m.host, '[data-system-dnd]')!, 'ArrowRight');
    expect(callsTo('settings', 'set').some((c) => c.args.key === 'pyxis.dnd' && c.args.value === true)).toBe(true);

    await click($(m.host, '[data-display-resolution="eDP-1"] [role="combobox"]')!);
    const resOption = $$(document.body, '[role="option"]').find((o) => o.textContent?.includes('2560 × 1440'))!;
    await click(resOption);
    expect(callsTo('evo', 'SetOutputConfig').at(-1)?.args).toEqual({
      name: 'eDP-1',
      width: 2560,
      height: 1440,
    });
    expect($(m.host, '[data-display-saved]')?.textContent).toContain('eDP-1');
  });

  it('calls session.logout from Users & Lock and displays storage & services diagnostics in About', async () => {
    m = await mountSettings();
    await openSection(m.host, 'users');
    await click($(m.host, '[data-logout-now] button')!);
    expect(callsTo('session', 'logout')).toHaveLength(1);
    expect(text(m.host, '[data-lock-status]')).toBe('Signing out…');

    await openSection(m.host, 'about');
    await vi.waitFor(() => {
      expect($(m!.host, '[data-storage-mount="/"]')).not.toBeNull();
      expect($(m!.host, '[data-service-status="settings"]')).not.toBeNull();
    });
    expect($(m.host, '[data-storage-mount="/"]')!.textContent).toContain('64 GB');
    expect($(m.host, '[data-service-status="network"]')!.textContent).toContain('Online');
  });
});

describe('Settings: Wave A reliability, validation, confirmations & a11y', () => {
  it('supports returning to the section rail via the ← Sections Back button and refreshes About on entry', async () => {
    m = await mountSettings();
    expect(m.app.root.$.stack.activeIndex).toBe(1);
    await click($(m.host, '[data-settings-back] button')!);
    expect(m.app.root.$.stack.activeIndex).toBe(0);

    echo.info = {
      ...echo.info,
      uptime: { seconds: 7320 },
    };
    await openSection(m.host, 'about');
    expect(m.app.root.$.stack.activeIndex).toBe(1);
    expect(text(m.host, '[data-about="uptime"]')).toContain('2 h 2 min');
  });

  it('forwards aria-label onto inner controls in LockSettings, Accessibility, Sound, and Network', async () => {
    m = await mountSettings();
    await openSection(m.host, 'accessibility');
    expect($($(m.host, '[data-high-contrast]')!, '[role="switch"]')!.getAttribute('aria-label')).toBe('High contrast');
    expect($($(m.host, '[data-reduce-transparency]')!, '[role="switch"]')!.getAttribute('aria-label')).toBe('Reduce transparency');

    await openSection(m.host, 'sound');
    const sliders = $$(m.host, '[role="slider"]').filter((el) => el.getAttribute('aria-label') === 'Master volume' || el.getAttribute('aria-label') === 'Microphone input volume');
    expect(sliders.map((s) => s.getAttribute('aria-label'))).toEqual(['Master volume', 'Microphone input volume']);
    expect($(m.host, 'button[aria-label="Mute"]')).not.toBeNull();
    expect($(m.host, 'button[aria-label="Mute microphone"]')).not.toBeNull();

    await openSection(m.host, 'users');
    expect($(m.host, '[data-lock-after] [role="combobox"]')!.getAttribute('aria-label')).toBe('Lock after');
    expect($(m.host, '[data-lock-on-sleep] [role="switch"]')!.getAttribute('aria-label')).toBe('Lock when the device sleeps');

    await openSection(m.host, 'network');
    await vi.waitFor(() => {
      expect($(m!.host, '[data-net-iface-toggle="wlan0"]')).not.toBeNull();
    });
    expect($(m.host, '[data-net-iface-toggle="wlan0"]')!.getAttribute('aria-label')).toBe('Disable wlan0');
  });

  it('catches Accessibility setter failures, shows role=alert, and reverts UI state', async () => {
    m = await mountSettings();
    await openSection(m.host, 'accessibility');

    echo.refuseSet.add('pyxis.animations');
    await click($(m.host, '[data-animation-mode="off"]')!);
    expect($(m.host, '[data-accessibility-error][role="alert"]')!.textContent).toContain('pyxis.animations');
    expect(checked($(m.host, '[data-animation-mode="full"]'))).toBe(true);
    expect(checked($(m.host, '[data-animation-mode="off"]'))).toBe(false);

    echo.refuseSet.add('pyxis.accessibility.highContrast');
    const hcToggle = $($(m.host, '[data-high-contrast]')!, '[role="switch"]')!;
    await toggleSwitch(hcToggle, 'ArrowRight');
    expect($(m.host, '[data-accessibility-error][role="alert"]')!.textContent).toContain('pyxis.accessibility.highContrast');
    expect(checked(hcToggle)).toBe(false);

    echo.refuseSet.clear();
    await toggleSwitch(hcToggle, 'ArrowRight');
    expect($(m.host, '[data-accessibility-error]')).toBeNull();
    expect(checked(hcToggle)).toBe(true);
  });

  it('reverts Sound mute on failure, shows role=alert errors, and flushes pending slider writes on leave', async () => {
    m = await mountSettings();
    await openSection(m.host, 'sound');

    const { echoClient } = await import('../../../../app-sdk/src/EchoClient');
    const mocked = vi.mocked(echoClient.callMethod);
    const impl = mocked.getMockImplementation()!;
    mocked.mockImplementation(async (s, i, method, args) => {
      if (s === 'audio' && method === 'setMute') return {};
      return impl(s, i, method, args);
    });
    await click($(m.host, 'button[aria-label="Mute"]')!);
    expect($(m.host, '[data-sound-error][role="alert"]')!.textContent).toContain('Failed to update mute state');
    expect($(m.host, '[data-settings-stage]')!.textContent).toContain('40%');

    mocked.mockImplementation(impl);
    const masterSlider = $$(m.host, '[role="slider"]').find((el) => el.getAttribute('aria-label') === 'Master volume')!;
    const beforeCalls = callsTo('audio', 'setVolume').length;
    await slideTo(masterSlider, 88);
    // Leave Sound immediately before the 80ms throttle timer fires -> onDestroy must flush 88.
    await openSection(m.host, 'appearance');
    expect(callsTo('audio', 'setVolume').length).toBeGreaterThan(beforeCalls);
    expect(callsTo('audio', 'setVolume').at(-1)?.args).toEqual({ volume: 88 });
  });

  it('uses warning tone & confirmType on powerDialog and Escape cancels Reset Settings cleanly', async () => {
    m = await mountSettings();
    await openSection(m.host, 'system');
    const shutdownBtn = $$(m.host, 'button').find((b) => b.textContent === 'Shut Down')!;
    await click(shutdownBtn);
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.dataset.tone).toBe('warning');
    expect(dialog.className).toContain('mochi-dialog--warning');
    const confirmPowerBtn = $$(document.body, '[role="dialog"] button').find((b) => b.textContent!.includes('Shut Down'))!;
    expect(confirmPowerBtn.className).not.toContain('affirmative');
    await click($$(document.body, '[role="dialog"] button').find((b) => b.textContent!.includes('Cancel'))!);

    await click($(m.host, '[data-system-reset-settings]')!);
    expect($(m.host, '[data-system-reset-confirm]')).not.toBeNull();
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await settle();
    expect($(m.host, '[data-system-reset-confirm]')).toBeNull();
    expect(callsTo('settings', 'reset')).toHaveLength(0);
  });

  it('surfaces errors in Display, AppPermissions, PrivilegedAccess, and Diagnostics with Refresh', async () => {
    const { echoClient } = await import('../../../../app-sdk/src/EchoClient');
    const mocked = vi.mocked(echoClient.callMethod);
    const impl = mocked.getMockImplementation()!;
    mocked.mockImplementation(async (s, i, method, args) => {
      if (s === 'evo' && method === 'SetOutputConfig') throw new Error('mode rejected');
      if (s === 'nova' && method === 'SetPermission') return { error: 'cannot revoke' };
      if (s === 'privilege' && method === 'Revoke') return { ok: false, error: 'revoke failed' };
      if (s === 'power' && method === 'setScreenBrightness') throw new Error('backlight error');
      if (s === 'settings' && method === 'reset') throw new Error('reset blocked');
      return impl(s, i, method, args);
    });

    m = await mountSettings();
    await openSection(m.host, 'system');
    await vi.waitFor(() => {
      expect($(m!.host, '[data-display-scale="eDP-1:1.5"]')).not.toBeNull();
      expect($(m!.host, '[data-permission-toggle="files:filesystem:write"]')).not.toBeNull();
    });

    await click($(m.host, '[data-display-scale="eDP-1:1.5"]')!);
    expect($(m.host, '[data-display-error][role="alert"]')!.textContent).toContain('mode rejected');

    const permToggle = $(m.host, '[data-permission-toggle="files:filesystem:write"]')!;
    await toggleSwitch(permToggle, 'ArrowLeft');
    expect($(m.host, '[data-app-permissions-error][role="alert"]')!.textContent).toContain('Failed to revoke');
    expect($(m.host, '[data-permission-toggle="files:filesystem:write"]')!.getAttribute('aria-checked')).toBe('true');

    emit('org.geckoOS.privilege', 'PrivilegeChanged', {
      active: true,
      grants: [
        {
          appId: 'files',
          appName: 'Files',
          reason: 'Edit /etc',
          grantedAt: Date.now(),
          expiresAt: Date.now() + 120_000,
          remainingSecs: 120,
        },
      ],
      pending: [],
      audit: [],
    });
    await settle();
    await click($(m.host, '[data-privilege-revoke="files"]')!);
    expect($(m.host, '[data-privilege-error][role="alert"]')!.textContent).toContain('Failed to lock privileged access');

    await slideTo($(m.host, '[data-system-brightness]')!, 35);
    expect($(m.host, '[data-power-error][role="alert"]')!.textContent).toContain('backlight error');
    expect($(m.host, '[data-system-brightness]')!.getAttribute('aria-valuenow')).toBe('80');

    await click($(m.host, '[data-system-reset-settings]')!);
    await click($(m.host, '[data-system-reset-confirm]')!);
    expect($(m.host, '[data-power-error][role="alert"]')!.textContent).toContain('reset blocked');
    expect($(m.host, '[data-system-reset-confirm]')).toBeNull();

    mocked.mockImplementation(impl);
    await openSection(m.host, 'about');
    await vi.waitFor(() => {
      expect($(m!.host, '[data-diagnostics-refresh]')).not.toBeNull();
    });
    const prevStorageCalls = callsTo('deviceInfo', 'getStorageInfo').length;
    await click($(m.host, '[data-diagnostics-refresh]')!);
    expect(callsTo('deviceInfo', 'getStorageInfo').length).toBeGreaterThan(prevStorageCalls);
  });

  it('validates DNS and hostname in NetworkConfigCard, submits on Enter, and shows errors in red role=alert', async () => {
    m = await mountSettings();
    await openSection(m.host, 'network');
    await vi.waitFor(() => {
      expect($(m!.host, '[data-net-dns-input]')).not.toBeNull();
    });

    const dnsInput = $(m.host, '[data-net-dns-input]') as HTMLInputElement;
    await typeInto(dnsInput, 'invalid-dns');
    await click($(m.host, '[data-net-dns-save]')!);
    expect($(m.host, '[data-net-config-error][role="alert"]')!.textContent).toContain('Invalid DNS IP address');
    expect($(m.host, '[data-net-config-status]')).toBeNull();
    expect(callsTo('network', 'setDNS')).toHaveLength(0);

    await typeInto(dnsInput, '2001:4860:4860::8888, 1.1.1.1');
    act(() => {
      fireEvent.keyDown(dnsInput, { key: 'Enter' });
    });
    await settle();
    expect(callsTo('network', 'setDNS').at(-1)?.args).toEqual({ nameservers: ['2001:4860:4860::8888', '1.1.1.1'] });
    expect($(m.host, '[data-net-config-status][role="status"]')!.textContent).toContain('DNS updated');

    const hostInput = $(m.host, '[data-net-hostname-input]') as HTMLInputElement;
    await typeInto(hostInput, '-bad_host');
    await click($(m.host, '[data-net-hostname-save]')!);
    expect($(m.host, '[data-net-config-error][role="alert"]')!.textContent).toContain('RFC-1123');
    expect(callsTo('network', 'setHostname')).toHaveLength(0);

    await typeInto(hostInput, 'pyxis-node');
    act(() => {
      fireEvent.keyDown(hostInput, { key: 'Enter' });
    });
    await settle();
    expect(callsTo('network', 'setHostname').at(-1)?.args).toEqual({ hostname: 'pyxis-node' });

    const passInput = $(m.host, '[data-wifi-password]') as HTMLInputElement;
    await click($(m.host, '[data-wifi-network="StudioGuest"]')!);
    await typeInto(passInput, 'enterpass');
    act(() => {
      fireEvent.keyDown(passInput, { key: 'Enter' });
    });
    await settle();
    expect(callsTo('network', 'connectWifi').at(-1)?.args).toEqual({ ssid: 'StudioGuest', password: 'enterpass' });
  });
});

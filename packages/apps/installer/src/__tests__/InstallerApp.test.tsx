// @vitest-environment jsdom
import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountDuyoApp, type DuyoApp } from '@pyxis/app-sdk/duyo';
import { echoClient } from '@pyxis/app-sdk';
import '../InstallerApp';

vi.mock('../../../../app-sdk/src/usePyxisTheme', () => ({ usePyxisTheme: () => 'light' }));

HTMLCanvasElement.prototype.getContext = (() => ({
  font: '',
  measureText: (t: string) => ({ width: t.length * 8 }),
})) as unknown as typeof HTMLCanvasElement.prototype.getContext;

let app: DuyoApp | undefined;
let host: HTMLElement;

const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const $$ = (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)];
// Hidden pieces stay in the DOM (display:none), so read only what a user can see.
function visibleText(el: Node): string {
  if (el.nodeType === Node.TEXT_NODE) return el.textContent ?? '';
  if (el instanceof HTMLElement && el.style.display === 'none') return '';
  return [...el.childNodes].map(visibleText).join(' ');
}
const text = () => visibleText(host);
const button = (label: string) =>
  $$('button').find((b) => visibleText(b).includes(label) && !b.closest('[style*="display: none"]'))!;
const click = (el: Element) => act(() => { fireEvent.click(el); });

const trash = () => $$('button').filter((b) => !b.closest('[style*="display: none"]')).at(-1)!;

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  await act(async () => { app = mountDuyoApp('Installer.App', { element: host }); });
  await advance(50);
}

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }));
afterEach(() => {
  act(() => app?.unmount());
  host.remove();
  app = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Installer', () => {
  it('lists packages found and carries the window id', async () => {
    await mount();
    expect(host.querySelector('[data-window-id]')).not.toBeNull();
    expect(text()).toContain('3 packages found');
    expect($$('.inst-row')).toHaveLength(3);
    expect(text()).toContain('installed v0.1.0'); // notes is seeded as installed
  });

  it('blocks Next until a package is picked, then reviews it', async () => {
    await mount();
    await click(button('Next'));
    await advance(10);
    expect(text()).toContain('Choose a package');
    await click($$('.inst-row')[1]);
    expect($$('.inst-row.selected')).toHaveLength(1);
    await click(button('Next'));
    await advance(10);
    expect(text()).toContain('Review details');
    expect(text()).toContain('PACKAGE SPECIFICATIONS');
    expect(text()).toContain('Example Corp');
    expect(text()).toContain('recorded for the app registry only'); // network/location unenforced
  });

  it('installs through the phases and ends on Done', async () => {
    await mount();
    await click($$('.inst-row')[1]); // weather
    await click(button('Next'));
    await click(button('Next')); // -> Install, which starts at once
    await advance(10);
    expect(text()).toContain('Verifying package');
    // Next stays blocked until the install is done.
    await click(button('Next'));
    expect(text()).toContain('Installing');
    expect(text()).not.toContain('Installation complete');
    await advance(700);
    expect(text()).toContain('Running opkg install');
    await advance(1200);
    expect(text()).toContain('Weather 1.0.0 installed');
    await click(button('Next'));
    await advance(10);
    expect(text()).toContain('Weather installed successfully!');
    expect(text()).toContain('Open Weather');
    expect(text()).toContain('Installation log');

    await click(button('Install another package'));
    await advance(10);
    expect(text()).toContain('Choose a package');
  });

  it('shows the installed list, searches it and removes with confirmation', async () => {
    await mount();
    await click(button('Installed Applications'));
    expect(text()).toContain('Notes');
    const search = host.querySelector<HTMLInputElement>('input[placeholder="Search installed applications…"]')!;
    await act(async () => { fireEvent.change(search, { target: { value: 'zzz' } }); });
    expect(text()).toContain('No applications match your search query.');
    await act(async () => { fireEvent.change(search, { target: { value: '' } }); });
    const spy = vi.spyOn(echoClient, 'callMethod');
    const before = host.querySelectorAll('.inst-card').length;
    // First press asks, second confirms.
    await click(trash());
    expect(text()).toContain('Confirm');
    await click(button('Cancel'));
    expect(text()).not.toContain('Confirm');
    await click(trash());
    await click(button('Confirm'));
    await advance(50);
    // (the mock's installed set is shared with the previous test, which added weather)
    expect(spy).toHaveBeenCalledWith('installer', 'org.geckoOS.installer', 'Remove', expect.objectContaining({ package: expect.any(String) }));
    expect(host.querySelectorAll('.inst-card').length).toBeLessThan(before);
  });

  it('locks Back and step jumps during active install so concurrent installs cannot start', async () => {
    await mount();
    const spy = vi.spyOn(echoClient, 'callMethod');
    await click($$('.inst-row')[1]); // weather
    await click(button('Next'));
    await click(button('Next')); // -> Install starts
    await advance(50);

    const installCallsBefore = spy.mock.calls.filter((c) => c[2] === 'Install').length;
    expect(installCallsBefore).toBe(1);
    const backBtn = button('Back') as HTMLButtonElement;
    expect(backBtn.disabled).toBe(true);
    expect(host.querySelector('.inst-wizard-locked')).not.toBeNull();

    // Clicking Back or an earlier step header stays on Install and never fires a second Install.
    await click(backBtn);
    await click($$('.mochi-wizard-step')[0]);
    await advance(50);
    expect(spy.mock.calls.filter((c) => c[2] === 'Install').length).toBe(1);
    expect(text()).toContain('Installing');

    await advance(2000);
    expect(text()).toContain('Weather 1.0.0 installed');
    expect((button('Back') as HTMLButtonElement).disabled).toBe(false);
  });

  it('offers Retry on InstallStep failure, resets & rescans when returning to Choose, and prevents duplicate launches', async () => {
    let failInstall = true;
    let releaseLaunch!: (v: unknown) => void;
    const orig = echoClient.callMethod.bind(echoClient);
    const spy = vi.spyOn(echoClient, 'callMethod').mockImplementation(async (service, iface, method, args) => {
      if (service === 'installer' && method === 'Install' && failInstall) {
        return { error: 'disk full' };
      }
      if (service === 'nova' && method === 'Launch') {
        return new Promise((r) => {
          releaseLaunch = r;
        });
      }
      return orig(service, iface, method, args);
    });

    await mount();
    await click($$('.inst-row')[1]);
    await click(button('Next'));
    await click(button('Next'));
    await advance(50);

    const alert = host.querySelector<HTMLElement>('[data-install-error][role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toContain('disk full');

    // Retry succeeds cleanly once issue is fixed.
    failInstall = false;
    await click(host.querySelector('[data-install-retry]')!);
    await advance(2000);
    expect(text()).toContain('Weather 1.0.0 installed');

    await click(button('Next'));
    await advance(10);

    // Double-click Open before Launch resolves -> only one nova.Launch call.
    const openBtn = button('Open Weather') as HTMLButtonElement;
    await click(openBtn);
    expect(openBtn.disabled).toBe(true);
    await click(openBtn);
    expect(spy.mock.calls.filter((c) => c[2] === 'Launch')).toHaveLength(1);

    await act(async () => {
      releaseLaunch(null);
    });
    await advance(10);
    expect(host.querySelector('[data-launch-error][role="alert"]')!.textContent).toContain('Could not launch');

    // Returning to Choose resets error state and rescans.
    const listCallsBefore = spy.mock.calls.filter((c) => c[2] === 'ListAvailable').length;
    await click($$('.mochi-wizard-step')[0]);
    await advance(50);
    expect(spy.mock.calls.filter((c) => c[2] === 'ListAvailable').length).toBeGreaterThan(listCallsBefore);
    expect(text()).toContain('Choose a package');
  });

  it('supports Ctrl+F/Escape in Installed tab, aria-label on trash, and displays remove/launch errors', async () => {
    const orig = echoClient.callMethod.bind(echoClient);
    vi.spyOn(echoClient, 'callMethod').mockImplementation(async (service, iface, method, args) => {
      if (service === 'installer' && method === 'Remove') {
        return { error: 'package locked' };
      }
      if (service === 'nova' && method === 'Launch') {
        return null;
      }
      return orig(service, iface, method, args);
    });

    await mount();
    await click(button('Installed Applications'));
    await advance(10);

    const trashBtn = host.querySelector('button[aria-label^="Remove "]');
    expect(trashBtn).not.toBeNull();

    // Ctrl+F focuses search input.
    const search = host.querySelector<HTMLInputElement>('input[placeholder="Search installed applications…"]')!;
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }));
    });
    expect(document.activeElement).toBe(search);

    // Type search, open inline confirm, Escape cancels confirm first, second Escape clears search.
    await act(async () => {
      fireEvent.change(search, { target: { value: 'Notes' } });
    });
    await click(trash());
    expect(text()).toContain('Confirm');
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(text()).not.toContain('Confirm');
    expect(search.value).toBe('Notes');

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(search.value).toBe('');

    // Launch failure shows error banner.
    await click(button('Launch'));
    await advance(20);
    expect(host.querySelector('[data-installed-error][role="alert"]')!.textContent).toContain('Could not launch');

    // Remove failure shows error banner.
    await click(trash());
    await click(button('Confirm'));
    await advance(50);
    expect(host.querySelector('[data-installed-error][role="alert"]')!.textContent).toContain('Failed to remove');
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import {
  PRIVILEGE_IFACE,
  PRIVILEGE_SERVICE,
  echoClient,
  getPrivilegeState,
  requestPrivilege,
  revokePrivilege,
  usePrivilegeState,
  waterdrop,
  type PrivilegePromptRequest,
  type PrivilegeState,
} from '@pyxis/app-sdk';
import { resetMockPrivilege } from '../../../packages/app-sdk/src/EchoClient';
import { resetMockSession } from '../../../packages/app-sdk/src/sessionMock';
import type { DesktopApp } from '../../hooks/useApps';
import { PrivilegeLockContext, PrivilegePromptDialog } from '../PrivilegePromptDialog';
import { ShellDialog } from '../ShellDialog';
import { TopSystemBar } from '../TopSystemBar';

const fake = vi.hoisted(() => ({
  apps: [
    {
      id: 'files',
      name: 'File Manager',
      info: {} as DesktopApp['info'],
      entryUrl: null,
      defaultSize: { width: 720, height: 500 },
      category: 'system',
      pinned: true,
    },
  ] as DesktopApp[],
}));

vi.mock('../../hooks/useApps', () => ({
  useApps: () => ({
    apps: fake.apps,
    byId: (id: string) => fake.apps.find((a) => a.id === id),
    pinned: fake.apps,
    loading: false,
    error: null,
    refresh: async () => {},
  }),
}));

beforeEach(() => {
  resetMockSession();
  resetMockPrivilege();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('TopSystemBar privilege badge', () => {
  function strip(props: Partial<React.ComponentProps<typeof TopSystemBar>> = {}) {
    return render(
      <TopSystemBar
        quickSettingsOpen={false}
        onToggleQuickSettings={() => {}}
        onLaunchApp={() => {}}
        {...props}
      />
    );
  }

  it('omits the badge when privilegeState is omitted or inactive', () => {
    const { container, rerender } = strip();
    expect(container.querySelector('[data-privilege-badge]')).toBeNull();

    rerender(
      <TopSystemBar
        quickSettingsOpen={false}
        onToggleQuickSettings={() => {}}
        onLaunchApp={() => {}}
        privilegeState={{ active: false, grant: null, grants: [], pending: [] }}
      />
    );
    expect(container.querySelector('[data-privilege-badge]')).toBeNull();
  });

  it('shows a waterdrop badge with app name, m:ss countdown, and Lock revoke action when active', () => {
    const onRevoke = vi.fn();
    const state: PrivilegeState = {
      active: true,
      grant: {
        appId: 'files',
        reason: 'Change system files',
        grantedAt: Date.now(),
        expiresAt: Date.now() + 185_000,
        remainingSecs: 185,
      },
      grants: [
        {
          appId: 'files',
          reason: 'Change system files',
          grantedAt: Date.now(),
          expiresAt: Date.now() + 185_000,
          remainingSecs: 185,
        },
      ],
      pending: [],
    };
    const { container } = strip({ privilegeState: state, onRevokePrivilege: onRevoke });
    const badge = container.querySelector<HTMLElement>('[data-privilege-badge]')!;
    expect(badge).not.toBeNull();
    expect(badge.style.borderRadius).toBe(waterdrop(24));
    expect(badge.querySelector('svg')).not.toBeNull();
    expect(badge.textContent).toContain('File Manager');
    expect(badge.textContent).toContain('3:05');

    const lockBtn = screen.getByRole('button', { name: 'Lock' });
    fireEvent.click(lockBtn);
    expect(onRevoke).toHaveBeenCalledTimes(1);
  });
});

describe('PrivilegePromptDialog', () => {
  const sampleReq: PrivilegePromptRequest = {
    requestId: 'req-1',
    appId: 'files',
    reason: 'Change system files',
    requestedAt: Date.now(),
    durationSecs: 300,
  };

  it('renders nothing when request is null', () => {
    render(<PrivilegePromptDialog request={null} />);
    expect(document.body.querySelector('[data-privilege-dialog]')).toBeNull();
  });

  it('displays app name, 5-minute message, security notice, and collapsible sudo Details', () => {
    render(<PrivilegePromptDialog request={sampleReq} />);
    const dialog = document.body.querySelector<HTMLElement>('[data-privilege-dialog]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain(
      'File Manager wants to change system files. Enter your password to allow this for 5 minutes.'
    );
    expect(dialog.textContent).toContain(
      "Pyxis never asks for your password inside an app's window."
    );
    const details = dialog.querySelector('details')!;
    expect(details).not.toBeNull();
    expect(details.open).toBe(false);
    expect(details.querySelector('summary')!.textContent).toBe('Details');
    expect(details.textContent).toContain(
      'Pyxis uses sudo for this. In Terminal, sudo -l lists the same rules, and /etc/sudoers.d/pyxis holds them.'
    );
  });

  it('shows error feedback on wrong password and grants privilege on correct password', async () => {
    const req = await requestPrivilege('Change system files', 'files');
    expect(req.pending).toBe(true);
    const onAuthenticated = vi.fn();

    render(<PrivilegePromptDialog request={req.request!} onAuthenticated={onAuthenticated} />);

    const input = screen.getByLabelText('Password') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'wrong-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => {
      const err = document.body.querySelector('[data-privilege-error]');
      expect(err?.textContent).toContain('Incorrect password');
    });
    expect(onAuthenticated).not.toHaveBeenCalled();
    expect((await getPrivilegeState('files')).active).toBe(false);

    fireEvent.change(input, { target: { value: 'pyxis' } });
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }));

    await waitFor(() => expect(onAuthenticated).toHaveBeenCalledTimes(1));
    const state = await getPrivilegeState('files');
    expect(state.active).toBe(true);
    expect(state.pending).toHaveLength(0);
  });

  it('dismisses the pending prompt on Cancel or Escape', async () => {
    const req1 = await requestPrivilege('Change system files', 'files');
    const onDismiss = vi.fn();
    const { rerender } = render(
      <PrivilegePromptDialog request={req1.request!} onDismiss={onDismiss} />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
    expect((await getPrivilegeState('files')).pending).toHaveLength(0);

    const req2 = await requestPrivilege('Change system files', 'files');
    rerender(<PrivilegePromptDialog request={req2.request!} onDismiss={onDismiss} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(2));
    expect((await getPrivilegeState('files')).pending).toHaveLength(0);
  });

  it('traps Tab and Shift+Tab inside the dialog and restores previous focus on close', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Trigger';
    document.body.append(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { rerender } = render(<PrivilegePromptDialog request={sampleReq} />);
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    const summary = document.body.querySelector('[data-privilege-dialog] summary') as HTMLElement;
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    const unlockBtn = screen.getByRole('button', { name: 'Unlock' });

    await waitFor(() => expect(document.activeElement).toBe(input));

    fireEvent.keyDown(input, { key: 'Tab' });
    expect(document.activeElement).toBe(cancelBtn);
    fireEvent.keyDown(cancelBtn, { key: 'Tab' });
    expect(document.activeElement).toBe(unlockBtn);
    fireEvent.keyDown(unlockBtn, { key: 'Tab' });
    expect(document.activeElement).toBe(summary);
    fireEvent.keyDown(summary, { key: 'Tab' });
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(summary);
    fireEvent.keyDown(summary, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(unlockBtn);

    rerender(<PrivilegePromptDialog request={null} />);
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('displays remaining attempts and live cooldown countdown from authenticatePrivilege', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(1_700_000_000_000);

    let call = 0;
    vi.spyOn(echoClient, 'callMethodStrict').mockImplementation(async (_svc, _iface, method) => {
      if (method === 'Authenticate') {
        call += 1;
        if (call === 1) {
          return { ok: false, reason: 'wrong', error: 'Incorrect password', attempts_left: 1, retry_at_ms: null };
        }
        return {
          ok: false,
          reason: 'wait',
          error: 'Too many attempts',
          attempts_left: 0,
          retry_at_ms: Date.now() + 5000,
        };
      }
      return { ok: true };
    });

    render(<PrivilegePromptDialog request={sampleReq} />);
    const input = screen.getByLabelText('Password') as HTMLInputElement;
    const unlockBtn = screen.getByRole('button', { name: 'Unlock' }) as HTMLButtonElement;

    fireEvent.change(input, { target: { value: 'bad1' } });
    await act(async () => {
      fireEvent.click(unlockBtn);
      await Promise.resolve();
    });
    expect(document.body.querySelector('[data-privilege-error]')?.textContent).toContain('Incorrect password');
    expect(document.body.querySelector('[data-privilege-attempts]')?.textContent).toBe('1 attempt remaining');
    expect(unlockBtn.disabled).toBe(false);

    fireEvent.change(input, { target: { value: 'bad2' } });
    await act(async () => {
      fireEvent.click(unlockBtn);
      await Promise.resolve();
    });
    expect(document.body.querySelector('[data-privilege-error]')?.textContent).toBe(
      'Too many attempts. Try again in 0:05'
    );
    expect(unlockBtn.disabled).toBe(true);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(document.body.querySelector('[data-privilege-error]')?.textContent).toBe(
      'Too many attempts. Try again in 0:02'
    );
    expect(unlockBtn.disabled).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2200);
    });
    expect(document.body.querySelector('[data-privilege-error]')).toBeNull();
    expect(unlockBtn.disabled).toBe(false);
  });

  it('displays live Caps Lock warning on keydown/keyup', () => {
    render(<PrivilegePromptDialog request={sampleReq} />);
    const input = screen.getByLabelText('Password');
    expect(document.body.querySelector('[data-privilege-caps]')).toBeNull();

    fireEvent.keyDown(input, { key: 'A', modifierCapsLock: true });
    expect(document.body.querySelector('[data-privilege-caps]')?.textContent).toContain('Caps Lock is on');

    fireEvent.keyUp(input, { key: 'CapsLock', modifierCapsLock: false });
    expect(document.body.querySelector('[data-privilege-caps]')).toBeNull();
  });

  it('shows inline error if dismissPrivilegePrompt returns false instead of hanging or dismissing', async () => {
    vi.spyOn(echoClient, 'callMethodStrict').mockResolvedValue({ ok: false, error: 'Dismiss denied' });
    const onDismiss = vi.fn();
    render(<PrivilegePromptDialog request={sampleReq} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      const err = document.body.querySelector('[data-privilege-error]');
      expect(err?.textContent).toContain('Could not dismiss prompt');
    });
    expect(onDismiss).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('sets pointerEvents: none and removes data-shell-region immediately while exiting', () => {
    const { rerender } = render(<PrivilegePromptDialog request={sampleReq} />);
    const scrim = document.body.querySelector<HTMLElement>('[data-privilege-scrim]')!;
    expect(scrim.hasAttribute('data-shell-region')).toBe(true);
    expect(scrim.style.pointerEvents).toBe('auto');

    rerender(<PrivilegePromptDialog request={null} />);
    const exiting = document.body.querySelector<HTMLElement>('[data-privilege-scrim]');
    if (exiting) {
      expect(exiting.style.pointerEvents).toBe('none');
      expect(exiting.hasAttribute('data-shell-region')).toBe(false);
    }
  });

  it('coordinates with ShellDialog modal stack so higher zIndex (1450) wins Escape regardless of mount order', async () => {
    const shellCancel = vi.fn();
    const privDismiss = vi.fn();
    vi.spyOn(echoClient, 'callMethodStrict').mockResolvedValue({ ok: true });

    // Mount ShellDialog (1400) first, then PrivilegePromptDialog (1450).
    const view1 = render(
      <>
        <ShellDialog open title="Confirm" confirmLabel="OK" cancelLabel="Cancel" onConfirm={() => {}} onCancel={shellCancel}>
          body
        </ShellDialog>
        <PrivilegePromptDialog request={sampleReq} onDismiss={privDismiss} />
      </>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(privDismiss).toHaveBeenCalledTimes(1));
    expect(shellCancel).not.toHaveBeenCalled();
    view1.unmount();

    // Mount PrivilegePromptDialog (1450) first, then ShellDialog (1400): PrivilegePromptDialog still wins!
    const view2 = render(
      <>
        <PrivilegePromptDialog request={sampleReq} onDismiss={privDismiss} />
        <ShellDialog open title="Confirm" confirmLabel="OK" cancelLabel="Cancel" onConfirm={() => {}} onCancel={shellCancel}>
          body
        </ShellDialog>
      </>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(privDismiss).toHaveBeenCalledTimes(2));
    expect(shellCancel).not.toHaveBeenCalled();

    // Once PrivilegePromptDialog closes, Escape reaches ShellDialog.
    view2.rerender(
      <>
        <PrivilegePromptDialog request={null} onDismiss={privDismiss} />
        <ShellDialog open title="Confirm" confirmLabel="OK" cancelLabel="Cancel" onConfirm={() => {}} onCancel={shellCancel}>
          body
        </ShellDialog>
      </>
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(shellCancel).toHaveBeenCalledTimes(1);
  });

  it('suppresses itself when locked via PrivilegeLockContext without intercepting Escape', () => {
    const onDismiss = vi.fn();
    render(
      <PrivilegeLockContext.Provider value={true}>
        <PrivilegePromptDialog request={sampleReq} onDismiss={onDismiss} />
      </PrivilegeLockContext.Provider>
    );
    expect(document.body.querySelector('[data-privilege-dialog]')).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onDismiss).not.toHaveBeenCalled();
  });
});

describe('usePrivilegeState hook and ShellLayer integration', () => {
  it('exports expected privilege service constants', () => {
    expect(PRIVILEGE_SERVICE).toBe('org.geckoOS.privilege');
    expect(PRIVILEGE_IFACE).toBe('org.geckoOS.privilege');
  });

  it('ticks 1s countdown while a grant is active and clears on revoke', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);

    const { result } = renderHook(() => usePrivilegeState());
    expect(result.current.active).toBe(false);

    await act(async () => {
      await requestPrivilege('Change system files', 'files');
    });
    expect(result.current.pending).toHaveLength(1);

    const { authenticatePrivilege } = await import('@pyxis/app-sdk');
    await act(async () => {
      await authenticatePrivilege({
        password: 'pyxis',
        requestId: result.current.pending[0]!.requestId,
        durationSecs: 10,
      });
    });
    expect(result.current.active).toBe(true);
    expect(result.current.grant?.remainingSecs).toBe(10);

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.grant?.remainingSecs).toBe(7);

    await act(async () => {
      await revokePrivilege('files');
    });
    expect(result.current.active).toBe(false);
    expect(result.current.grant).toBeNull();
  });

  it('ShellLayer wires privilege state, overlay focus for pending prompts, and empty URL for Vela', () => {
    const source = readFileSync(resolve(__dirname, '../ShellLayer.tsx'), 'utf8');
    expect(source).toContain('usePrivilegeState()');
    expect(source).toContain('privilegePending');
    expect(source).toContain('<PrivilegePromptDialog');
    expect(source).toContain("const BROWSER_START_PAGE = ''");
    expect(source).toContain('echo.openExternalBrowser(BROWSER_START_PAGE)');
  });
});

describe('PrivilegePromptDialog actions', () => {
  const base: PrivilegePromptRequest = {
    requestId: 'req-a',
    appId: 'files',
    reason: 'SECRET-APP-TEXT',
    requestedAt: Date.now(),
  };
  const dialogOf = (req: PrivilegePromptRequest) => {
    render(<PrivilegePromptDialog request={req} />);
    return document.body.querySelector<HTMLElement>('[data-privilege-dialog]')!;
  };

  const cases: Array<[string, Record<string, string>, string, string]> = [
    [
      'package.install',
      { package: 'weather', title: 'Weather', version: '1.2' },
      'Install software',
      'File Manager wants to install Weather 1.2.',
    ],
    [
      'package.install',
      { package: 'weather' },
      'Install software',
      'File Manager wants to install weather.',
    ],
    ['package.remove', { package: 'notes' }, 'Remove software', 'File Manager wants to remove notes.'],
    [
      'network.manage',
      { ssid: 'Home' },
      'Change network settings',
      'File Manager wants to join the Wi-Fi network Home.',
    ],
    [
      'network.manage',
      { hostname: 'box' },
      'Change network settings',
      'File Manager wants to change the hostname to box.',
    ],
    [
      'accounts.manage',
      { username: 'alex' },
      'Manage users',
      'File Manager wants to create or remove the user alex.',
    ],
  ];

  it.each(cases)('%s renders from details', (action, details, title, sentence) => {
    const dialog = dialogOf({ ...base, action, details });
    expect(dialog.getAttribute('data-privilege-request-action')).toBe(action);
    expect(dialog.querySelector('h2')!.textContent).toBe(title);
    expect(dialog.textContent).toContain(sentence);
    expect(dialog.textContent).not.toContain('SECRET-APP-TEXT');
    expect(dialog.querySelector('input[type="password"]')).not.toBeNull();
    expect(dialog.querySelector('strong')).not.toBeNull();
  });

  it('does not interpret markup in details', () => {
    const dialog = dialogOf({
      ...base,
      action: 'network.manage',
      details: { ssid: '<img src=x onerror=alert(1)>' },
    });
    expect(dialog.querySelector('img')).toBeNull();
    expect(dialog.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('keeps the file-write wording for filesystem.system-write', () => {
    const dialog = dialogOf({ ...base, action: 'filesystem.system-write', durationSecs: 300 });
    expect(dialog.querySelector('h2')!.textContent).toBe('Privileged Access');
    expect(dialog.textContent).toContain(
      'File Manager wants to change system files. Enter your password to allow this for 5 minutes.'
    );
  });

  it('gives an unknown action a generic sentence', () => {
    const dialog = dialogOf({ ...base, action: 'time.set', details: { x: 'y' } });
    expect(dialog.querySelector('h2')!.textContent).toBe('System change');
    expect(dialog.textContent).toContain('File Manager wants to make a system change (time.set).');
    expect(dialog.textContent).not.toContain('SECRET-APP-TEXT');
  });
});

describe('PrivilegePromptDialog: the shell as requester', () => {
  it('names the shell Pyxis, not Bloom', () => {
    render(
      <PrivilegePromptDialog
        request={{ requestId: 'r-shell', appId: 'bloom', appName: 'Bloom', action: 'package.install', details: { package: 'Weather', version: '1.2' } } as never}
      />
    );
    const dialog = document.body.querySelector('[data-privilege-dialog]')!;
    expect(dialog.textContent).toContain('Pyxis wants to install');
    expect(dialog.textContent).not.toContain('Bloom');
  });
});

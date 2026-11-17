// @vitest-environment jsdom
import { act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { echoClient } from '../../../../app-sdk/src/EchoClient';
import {
  $, $$, callsTo, checked, click, echo, emit, installEcho, mountSettings, openSection, settle, stubCanvas, text, typeInto, shown, visibleText,
  type Call, type Mounted,
} from './testUtils';

// The theme hook starts the Echo clock; the wallpaper draws a canvas jsdom cannot.
vi.mock('../../../../app-sdk/src/usePyxisTheme', async (original) => ({
  ...(await original<object>()),
  usePyxisTheme: () => 'light',
}));
vi.mock('../../../../app-sdk/src/wallpaper/DynamicWallpaper', () => ({
  DynamicWallpaper: () => <div />,
}));

stubCanvas();

/** What the scripted session and accounts services hold and did. Reset by `installAccounts`. */
const acc = {
  calls: [] as Call[],
  account: { user: 'geckouser', uid: 1000, display_name: 'Andrew', accent: '#7c6cf0', avatar: null as string | null },
  extraUsers: [] as Array<{
    user: string;
    uid: number;
    display_name: string;
    accent: string;
    avatar: string | null;
    has_password: boolean;
  }>,
  /** null: no password set. */
  password: 'pyxis' as string | null,
  /** `setPassword` answers `wait` until this epoch ms. */
  waitUntil: null as number | null,
  /** Methods (`accounts.setProfile`) the bridge refuses, as a thrown error. */
  refuse: new Map<string, string>(),
  /** `session.getState` and `accounts.list` say nothing. */
  down: false,
  /** `session.lock` answers not locked. */
  lockFails: false,
};

const strictCalls = (service: string, method: string) => acc.calls.filter((c) => c.service === service && c.method === method);

function installAccounts(password: string | null = 'pyxis') {
  acc.calls = [];
  acc.account = { user: 'geckouser', uid: 1000, display_name: 'Andrew', accent: '#7c6cf0', avatar: null };
  acc.extraUsers = [];
  acc.password = password;
  acc.waitUntil = null;
  acc.refuse = new Map();
  acc.down = false;
  acc.lockFails = false;
  vi.spyOn(echoClient, 'callMethodStrict').mockImplementation(async (service, _iface, method, args = {}) => {
    const a = args as Record<string, unknown>;
    acc.calls.push({ service, method, args: a });
    const refused = acc.refuse.get(`${service}.${method}`);
    if (refused) throw new Error(refused);
    switch (`${service}.${method}`) {
      case 'session.getState':
        if (acc.down) throw new Error('no session service');
        return {
          locked: false, user: acc.account.user, display_name: acc.account.display_name, accent: acc.account.accent,
          has_password: acc.password !== null, attempts_left: 5, retry_at_ms: null,
        };
      case 'accounts.list':
        if (acc.down) throw new Error('no accounts service');
        return {
          users: [
            { ...acc.account, has_password: acc.password !== null },
            ...acc.extraUsers,
          ],
        };
      case 'accounts.create': {
        const user = String(a.user ?? '');
        const created = {
          user,
          uid: 1002 + acc.extraUsers.length,
          display_name: typeof a.display_name === 'string' && a.display_name ? a.display_name : user,
          accent: typeof a.accent === 'string' && a.accent ? a.accent : '#0ea5e9',
          avatar: null,
          has_password: typeof a.password === 'string' && a.password.length > 0,
        };
        acc.extraUsers.push(created);
        return { ok: true, user: created };
      }
      case 'accounts.delete': {
        const user = String(a.user ?? '');
        acc.extraUsers = acc.extraUsers.filter((u) => u.user !== user);
        return { ok: true };
      }
      case 'session.switchUser':
        return { ok: true, user: a.user, locked: true };
      case 'accounts.setPassword': {
        if (acc.waitUntil !== null && Date.now() < acc.waitUntil) {
          return { ok: false, reason: 'wait', attempts_left: 0, retry_at_ms: acc.waitUntil };
        }
        if (acc.password !== null && a.current !== acc.password) {
          return { ok: false, reason: 'wrong', attempts_left: 4, retry_at_ms: null };
        }
        acc.password = a.new as string;
        return { ok: true };
      }
      case 'accounts.setProfile':
        if (typeof a.display_name === 'string') acc.account.display_name = a.display_name;
        if (typeof a.accent === 'string') acc.account.accent = a.accent;
        return { ok: true };
      case 'session.lock':
        return { locked: !acc.lockFails };
      default:
        return undefined;
    }
  });
}

let m: Mounted | undefined;
beforeEach(() => {
  installEcho();
  installAccounts();
  echo.settings.set('pyxis.lock.after', 10);
  echo.settings.set('pyxis.lock.onSleep', true);
  echo.settings.set('pyxis.lock.notifications', 'count');
});
afterEach(() => {
  m?.unmount();
  m = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const lastSet = () => callsTo('settings', 'set').at(-1)?.args;
const openUsers = async () => {
  m = await mountSettings();
  await openSection(m.host, 'users');
  return m.host;
};
const press = (host: HTMLElement, selector: string) => click($(host, `${selector} button`)!);
const pw = (host: HTMLElement, which: 'current' | 'new' | 'confirm') => $(host, `[data-password-${which}]`) as HTMLInputElement;
const fill = async (host: HTMLElement, current: string | null, next: string, confirm: string) => {
  if (current !== null) await typeInto(pw(host, 'current'), current);
  await typeInto(pw(host, 'new'), next);
  await typeInto(pw(host, 'confirm'), confirm);
};
const status = (host: HTMLElement) => text(host, '[data-password-status]');

describe('Settings: Users & Lock, the section', () => {
  it('is on the rail as data-settings-section="users" and opens three groups', async () => {
    const host = await openUsers();
    expect(text(host, '[data-settings-stage] h1')).toBe('Users & Lock');
    expect($(host, '[data-settings-stage]')!.dataset.settingsStage).toBe('users');
    expect($$(host, '[data-settings-group]').map((g) => g.dataset.settingsGroup)).toEqual(['profile', 'password', 'lock']);
  });

  it('says so, and keeps the lock settings, when the accounts service does not answer', async () => {
    acc.down = true;
    const host = await openUsers();
    expect($(host, '[data-users-unavailable]')).not.toBeNull();
    expect(shown($(host, '[data-settings-group="profile"]'))).toBe(false);
    expect(shown($(host, '[data-settings-group="password"]'))).toBe(false);
    expect(shown($(host, '[data-lock-now]'))).toBe(true);
  });
});

describe('Settings: Users & Lock, you', () => {
  it("draws the user's waterdrop avatar with their initial on their accent, and their name", async () => {
    acc.account.accent = '#ef4444';
    acc.account.display_name = 'ada';
    const host = await openUsers();
    const avatar = $(host, '[data-user-avatar]')!;
    expect(avatar.textContent).toBe('A');
    expect(avatar.style.borderRadius).toBe('16px 4px 16px 16px');
    expect(avatar.style.background).toContain('rgb(239, 68, 68)');
    expect((($(host, '[data-profile-name]')) as HTMLInputElement).value).toBe('ada');
    expect(checked($(host, '[data-profile-accent="#ef4444"]'))).toBe(true);
    expect(checked($(host, '[data-profile-accent="#7c6cf0"]'))).toBe(false);
  });

  it('saves a changed display name through setProfile, says so, and shows the new initial', async () => {
    const host = await openUsers();
    await typeInto($(host, '[data-profile-name]') as HTMLInputElement, '  Grace ');
    await press(host, '[data-profile-save]');
    expect(strictCalls('accounts', 'setProfile').at(-1)?.args).toEqual({ user: 'geckouser', display_name: 'Grace' });
    expect(text(host, '[data-profile-status]')).toBe('Name saved.');
    expect($(host, '[data-user-avatar]')!.textContent).toBe('G');
    expect(($(host, '[data-profile-name]') as HTMLInputElement).value).toBe('Grace');
  });

  it('saves on Enter in the name field', async () => {
    const host = await openUsers();
    const input = $(host, '[data-profile-name]') as HTMLInputElement;
    await typeInto(input, 'Grace');
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    await settle();
    expect(strictCalls('accounts', 'setProfile').at(-1)?.args).toEqual({ user: 'geckouser', display_name: 'Grace' });
  });

  it('refuses an empty name before calling, and sends nothing for an unchanged one', async () => {
    const host = await openUsers();
    await typeInto($(host, '[data-profile-name]') as HTMLInputElement, '   ');
    await press(host, '[data-profile-save]');
    expect(text(host, '[data-profile-error]')).toBe("Your name can't be empty.");
    await typeInto($(host, '[data-profile-name]') as HTMLInputElement, 'Andrew');
    await press(host, '[data-profile-save]');
    expect(strictCalls('accounts', 'setProfile')).toHaveLength(0);
    expect($(host, '[data-profile-error]')).toBeNull();
  });

  it('saves an accent from the swatches as #rrggbb, and the ring and avatar follow', async () => {
    const host = await openUsers();
    expect($$(host, '[data-profile-accent]').length).toBeGreaterThanOrEqual(6);
    await click($(host, '[data-profile-accent="#14b8a6"]')!);
    expect(strictCalls('accounts', 'setProfile').at(-1)?.args).toEqual({ user: 'geckouser', accent: '#14b8a6' });
    expect(checked($(host, '[data-profile-accent="#14b8a6"]'))).toBe(true);
    expect(checked($(host, '[data-profile-accent="#7c6cf0"]'))).toBe(false);
    expect($(host, '[data-user-avatar]')!.style.background).toContain('rgb(20, 184, 166)');
    // The one already chosen is not sent again.
    await click($(host, '[data-profile-accent="#14b8a6"]')!);
    expect(strictCalls('accounts', 'setProfile')).toHaveLength(1);
  });

  it('shows a refused profile save instead of a silent success', async () => {
    acc.refuse.set('accounts.setProfile', 'Pyxis capability denied: settings:write');
    const host = await openUsers();
    await click($(host, '[data-profile-accent="#ef4444"]')!);
    expect(text(host, '[data-profile-error]')).toBe("Couldn't save: Pyxis capability denied: settings:write");
    expect($(host, '[data-profile-status]')).toBeNull();
    expect(checked($(host, '[data-profile-accent="#7c6cf0"]'))).toBe(true);
  });
});

describe('Settings: Users & Lock, the password', () => {
  it('says a password is set, and asks for the current one', async () => {
    const host = await openUsers();
    expect($(host, '[data-password-set]')!.dataset.passwordSet).toBe('true');
    expect(text(host, '[data-password-set]')).toContain('A password is set.');
    expect(pw(host, 'current')).not.toBeNull();
    expect(visibleText($(host, '[data-password-save]')!)).toContain('Change password');
  });

  it('asks for no current password while none is set, and offers to set one', async () => {
    installAccounts(null);
    const host = await openUsers();
    expect($(host, '[data-password-set]')!.dataset.passwordSet).toBe('false');
    expect(text(host, '[data-password-set]')).toContain('No password is set.');
    expect(pw(host, 'current')).toBeNull();
    expect(visibleText($(host, '[data-password-save]')!)).toContain('Set password');
  });

  it('hides what is typed: the three fields are password inputs, and the name is not', async () => {
    const host = await openUsers();
    expect(['current', 'new', 'confirm'].map((w) => pw(host, w as 'current').type)).toEqual(['password', 'password', 'password']);
    expect(($(host, '[data-profile-name]') as HTMLInputElement).type).toBe('text');
  });

  it('catches an empty current password, an empty new one and a mismatch before calling', async () => {
    const host = await openUsers();
    await press(host, '[data-password-save]');
    expect(status(host)).toBe('Enter your current password.');
    await fill(host, 'pyxis', '', '');
    await press(host, '[data-password-save]');
    expect(status(host)).toBe('Enter a new password.');
    await fill(host, null, 'one', 'two');
    await press(host, '[data-password-save]');
    expect(status(host)).toBe("The two new passwords don't match.");
    expect($(host, '[data-password-status]')!.dataset.passwordStatus).toBe('error');
    expect(strictCalls('accounts', 'setPassword')).toHaveLength(0);
  });

  it('changes the password, clears the fields, and says so', async () => {
    const host = await openUsers();
    await fill(host, 'pyxis', 'fresh', 'fresh');
    await press(host, '[data-password-save]');
    expect(strictCalls('accounts', 'setPassword').at(-1)?.args).toEqual({ user: 'geckouser', current: 'pyxis', new: 'fresh' });
    expect(acc.password).toBe('fresh');
    expect(status(host)).toBe('Password changed.');
    expect($(host, '[data-password-status]')!.dataset.passwordStatus).toBe('ok');
    expect(['current', 'new', 'confirm'].map((w) => pw(host, w as 'current').value)).toEqual(['', '', '']);
  });

  it('sets a first password with no current one, then asks for it, from the service not from memory', async () => {
    installAccounts(null);
    const host = await openUsers();
    await fill(host, null, 'first', 'first');
    await press(host, '[data-password-save]');
    expect(strictCalls('accounts', 'setPassword').at(-1)?.args).toEqual({ user: 'geckouser', current: '', new: 'first' });
    expect(status(host)).toBe('Password set.');
    // The account was read again: now a password is set and the current field appears.
    expect($(host, '[data-password-set]')!.dataset.passwordSet).toBe('true');
    expect(pw(host, 'current')).not.toBeNull();
  });

  it("answers a wrong current password with the lock screen's words, and empties it", async () => {
    const host = await openUsers();
    await fill(host, 'nope', 'fresh', 'fresh');
    await press(host, '[data-password-save]');
    expect(status(host)).toBe("That's not the current password.");
    expect(acc.password).toBe('pyxis');
    expect(pw(host, 'current').value).toBe('');
    // What was typed for the new one is kept for the retry.
    expect(pw(host, 'new').value).toBe('fresh');
  });

  it('answers a wait with the time left, counting down, and stops when it is over', async () => {
    const host = await openUsers();
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    acc.waitUntil = Date.now() + 65_000;
    await fill(host, 'pyxis', 'fresh', 'fresh');
    await press(host, '[data-password-save]');
    expect(status(host)).toBe('Too many tries. Try again in 1:05');
    expect($(host, '[data-password-status]')!.dataset.passwordStatus).toBe('wait');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(status(host)).toBe('Too many tries. Try again in 1:00');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect($(host, '[data-password-status]')).toBeNull();
    expect(acc.password).toBe('pyxis');
  });

  it('shows the reason when the service refuses the call outright', async () => {
    acc.refuse.set('accounts.setPassword', 'Pyxis capability denied: settings:write');
    const host = await openUsers();
    await fill(host, 'pyxis', 'fresh', 'fresh');
    await press(host, '[data-password-save]');
    expect(status(host)).toBe("Couldn't change the password: Pyxis capability denied: settings:write");
    expect($(host, '[data-password-status]')!.dataset.passwordStatus).toBe('error');
  });

  it('never puts a password in the page, a log or the DOM beyond the fields', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
    const host = await openUsers();
    await fill(host, 'nope', 'secret-new', 'secret-new');
    await press(host, '[data-password-save]');
    await fill(host, 'pyxis', 'secret-new', 'secret-new');
    await press(host, '[data-password-save]');
    for (const spy of spies) expect(JSON.stringify(spy.mock.calls)).not.toMatch(/secret-new|pyxis"|nope/);
    expect(visibleText(host)).not.toContain('secret-new');
    expect($$(host, '[data-password-status], [data-profile-status]').map((e) => e.textContent).join()).not.toContain('secret-new');
  });
});

describe('Settings: Users & Lock, the lock', () => {
  it('reads the three settings live', async () => {
    echo.settings.set('pyxis.lock.after', 30);
    echo.settings.set('pyxis.lock.onSleep', false);
    echo.settings.set('pyxis.lock.notifications', 'full');
    const host = await openUsers();
    expect(text(host, '[data-lock-after] .mochi-dropdown-value')).toBe('30 minutes');
    expect(checked($(host, '[data-lock-on-sleep] [role="switch"]'))).toBe(false);
    expect($(host, '[data-lock-notifications]')!.dataset.lockNotifications).toBe('full');
    expect(checked($(host, '[data-lock-notifications-option="full"]'))).toBe(true);

    emit('org.geckoOS.settings', 'SettingChanged', { key: 'pyxis.lock.notifications', value: 'hidden' });
    expect(checked($(host, '[data-lock-notifications-option="hidden"]'))).toBe(true);
    emit('org.geckoOS.settings', 'SettingChanged', { key: 'pyxis.lock.after', value: null });
    await settle();
    expect(text(host, '[data-lock-after] .mochi-dropdown-value')).toBe('Never');
  });

  it('offers Never and 1, 5, 10, 15, 30 and 60 minutes, and writes the one picked (Never is null)', async () => {
    const host = await openUsers();
    const labels = async () => {
      await click($(host, '[data-lock-after] [role="combobox"]')!);
      return $$(document.body, '[role="option"]').map((o) => o.textContent);
    };
    expect(await labels()).toEqual(['Never', '1 minute', '5 minutes', '10 minutes', '15 minutes', '30 minutes', '1 hour']);
    const pick = async (label: string) => {
      const option = $$(document.body, '[role="option"]').find((o) => o.textContent === label)!;
      await click(option);
    };
    await pick('5 minutes');
    expect(lastSet()).toEqual({ key: 'pyxis.lock.after', value: 5 });
    await click($(host, '[data-lock-after] [role="combobox"]')!);
    await pick('1 hour');
    expect(lastSet()).toEqual({ key: 'pyxis.lock.after', value: 60 });
    await click($(host, '[data-lock-after] [role="combobox"]')!);
    await pick('Never');
    expect(lastSet()).toEqual({ key: 'pyxis.lock.after', value: null });
    expect(text(host, '[data-lock-after] .mochi-dropdown-value')).toBe('Never');
  });

  it('keeps a stored value that is not a stock choice, so the dropdown never lies', async () => {
    echo.settings.set('pyxis.lock.after', 2);
    const host = await openUsers();
    expect(text(host, '[data-lock-after] .mochi-dropdown-value')).toBe('2 minutes');
  });

  it('writes the sleep switch, and puts it back when the write is refused', async () => {
    const host = await openUsers();
    const key = async (k: string) => {
      act(() => {
        fireEvent.keyDown($(host, '[data-lock-on-sleep] [role="switch"]')!, { key: k });
      });
      await settle();
    };
    await key('ArrowLeft');
    expect(lastSet()).toEqual({ key: 'pyxis.lock.onSleep', value: false });
    expect(checked($(host, '[data-lock-on-sleep] [role="switch"]'))).toBe(false);

    echo.refuseSet.add('pyxis.lock.onSleep');
    await key('ArrowRight');
    expect(text(host, '[data-lock-error]')).toContain("Couldn't save pyxis.lock.onSleep:");
    expect(checked($(host, '[data-lock-on-sleep] [role="switch"]'))).toBe(false);
  });

  it('writes the notification choice: Hidden, Count only, Full', async () => {
    const host = await openUsers();
    expect($$(host, '[data-lock-notifications-option]').map((c) => c.dataset.lockNotificationsOption)).toEqual(['hidden', 'count', 'full']);
    await click($(host, '[data-lock-notifications-option="full"]')!);
    expect(lastSet()).toEqual({ key: 'pyxis.lock.notifications', value: 'full' });
    expect(checked($(host, '[data-lock-notifications-option="full"]'))).toBe(true);
    await click($(host, '[data-lock-notifications-option="hidden"]')!);
    expect(lastSet()).toEqual({ key: 'pyxis.lock.notifications', value: 'hidden' });
    expect($(host, '[data-lock-notifications]')!.dataset.lockNotifications).toBe('hidden');
  });

  it('shows a refused notification write, and clears it on the next', async () => {
    echo.refuseSet.add('pyxis.lock.notifications');
    const host = await openUsers();
    await click($(host, '[data-lock-notifications-option="full"]')!);
    expect(text(host, '[data-lock-error]')).toContain("Couldn't save pyxis.lock.notifications:");
    expect(checked($(host, '[data-lock-notifications-option="count"]'))).toBe(true);
    echo.refuseSet.delete('pyxis.lock.notifications');
    await click($(host, '[data-lock-notifications-option="full"]')!);
    expect($(host, '[data-lock-error]')).toBeNull();
  });

  it('locks now through the session service', async () => {
    const host = await openUsers();
    await press(host, '[data-lock-now]');
    expect(strictCalls('session', 'lock')).toHaveLength(1);
    expect(text(host, '[data-lock-status]')).toBe('Locking…');
    expect($(host, '[data-lock-error]')).toBeNull();
  });

  it('says so when the screen did not lock', async () => {
    acc.lockFails = true;
    const host = await openUsers();
    await press(host, '[data-lock-now]');
    expect(text(host, '[data-lock-error]')).toContain("Couldn't lock the screen");
    expect($(host, '[data-lock-status]')).toBeNull();
  });
});

describe('Settings: Users & Lock, multi-user accounts', () => {
  it('adds a secondary user, switches to them, and removes them', async () => {
    const host = await openUsers();
    expect($(host, '[data-account-row="geckouser"]')).not.toBeNull();
    expect($(host, '[data-account-active="geckouser"]')).not.toBeNull();

    await typeInto($(host, '[data-add-user-login]') as HTMLInputElement, 'maya');
    await typeInto($(host, '[data-add-user-name]') as HTMLInputElement, 'Maya');
    await typeInto($(host, '[data-add-user-password]') as HTMLInputElement, 'secret');
    await press(host, '[data-add-user-submit]');

    expect(strictCalls('accounts', 'create').at(-1)?.args).toMatchObject({
      user: 'maya',
      display_name: 'Maya',
      password: 'secret',
    });
    expect(text(host, '[data-accounts-status]')).toBe('Added Maya.');
    expect($(host, '[data-account-row="maya"]')).not.toBeNull();

    await press(host, '[data-account-switch="maya"]');
    expect(strictCalls('session', 'switchUser').at(-1)?.args).toEqual({ user: 'maya' });

    // Clicking Remove asks for inline confirmation first; Cancel & Escape abort without deleting.
    await press(host, '[data-account-delete="maya"]');
    expect(strictCalls('accounts', 'delete')).toHaveLength(0);
    expect($(host, '[data-account-confirm-delete="maya"]')).not.toBeNull();

    await press(host, '[data-account-cancel-delete="maya"]');
    expect($(host, '[data-account-confirm-delete="maya"]')).toBeNull();
    expect(strictCalls('accounts', 'delete')).toHaveLength(0);

    await press(host, '[data-account-delete="maya"]');
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await settle();
    expect($(host, '[data-account-confirm-delete="maya"]')).toBeNull();
    expect(strictCalls('accounts', 'delete')).toHaveLength(0);

    await press(host, '[data-account-delete="maya"]');
    await press(host, '[data-account-confirm-delete="maya"]');
    expect(strictCalls('accounts', 'delete').at(-1)?.args).toEqual({ user: 'maya' });
    expect($(host, '[data-account-row="maya"]')).toBeNull();
  });
});

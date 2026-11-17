import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ACCOUNTS_IFACE,
  SESSION_FIRST_WAIT_MS,
  SESSION_FREE_TRIES,
  SESSION_IFACE,
  SESSION_MAX_WAIT_MS,
  SESSION_SIGNALS,
  createAccount,
  deleteAccount,
  getSessionState,
  listAccounts,
  lock,
  logout,
  onLockChanged,
  onUnlockFailed,
  setPassword,
  setProfile,
  switchUser,
  unlock,
  type LockChange,
  type UnlockFailure,
} from '@pyxis/app-sdk';
import { MOCK_PASSWORD, resetMockSession } from '../../../packages/app-sdk/src/sessionMock';

/**
 * Session and accounts contract tests: this is the notification suite's
 * pattern applied to org.geckoOS.session and org.geckoOS.accounts. The method
 * and signal names, the answer shapes and the rate limit are read out of the
 * Rust source (echo/src/services/session.rs and accounts.rs), so a rename or a
 * new field there fails at the desk instead of on a device. The mock's
 * behaviour (what `npm run dev` unlocks with) is checked against the same
 * contract.
 *
 * When the Rust source isn't there (a checkout of Bloom alone) the source
 * checks are skipped and say so; the behaviour checks always run.
 */

const SESSION_RS = resolve(__dirname, '../../../../geckos/echo/src/services/session.rs');
const ACCOUNTS_RS = resolve(__dirname, '../../../../geckos/echo/src/services/accounts.rs');
const DAEMON_RS = resolve(__dirname, '../../../../geckos/echo/src/bin/daemon.rs');
const ECHO_IPC_RS = resolve(__dirname, '../../../../geckos/evo/src/enhancements/echo_ipc.rs');
const BRIDGE_MJS = resolve(__dirname, '../../../../geckos/gecko/patches/pyxis/toolkit/actors/PyxisBridgeParent.sys.mjs');
const haveSession = existsSync(SESSION_RS) && existsSync(DAEMON_RS);
const haveAccounts = existsSync(ACCOUNTS_RS) && existsSync(DAEMON_RS);

if (!haveSession || !haveAccounts) {
  const missing = [SESSION_RS, ACCOUNTS_RS, DAEMON_RS].filter((p) => !existsSync(p));
  console.warn(
    `[sessionContract] SKIPPED the Rust-source checks: ${missing.join(', ')} not found. ` +
      'The mock-behaviour checks still ran.'
  );
}

function rustStr(source: string, name: string): string {
  const m = source.match(new RegExp(`pub const ${name}: &str = "([^"]+)";`));
  if (!m) throw new Error(`${name} not found`);
  return m[1];
}
function rustNum(source: string, name: string): number {
  const m = source.match(new RegExp(`const ${name}: \\w+ = ([0-9_ *]+);`));
  if (!m) throw new Error(`${name} not found`);
  return m[1].split('*').reduce((a, n) => a * Number(n.replace(/_/g, '').trim()), 1);
}
/** The keys of the first `json!({ ... })` after `marker`. */
function jsonKeys(source: string, marker: string): string[] {
  const at = source.indexOf(marker);
  if (at < 0) throw new Error(`${marker} not found`);
  const start = source.indexOf('json!({', at);
  const end = source.indexOf('})', start);
  return [...source.slice(start, end).matchAll(/"([a-z_]+)"\s*:/g)].map((m) => m[1]);
}

describe.runIf(haveSession)('the SDK speaks the session service the Rust registers', () => {
  const rust = () => readFileSync(SESSION_RS, 'utf8');
  const daemon = () => readFileSync(DAEMON_RS, 'utf8');

  it('names: the interface, the signals and the rate limit', () => {
    expect(SESSION_IFACE).toBe(rustStr(rust(), 'SESSION_IFACE'));
    expect(SESSION_SIGNALS.lockChanged).toBe(rustStr(rust(), 'SIGNAL_LOCK_CHANGED'));
    expect(SESSION_SIGNALS.unlockFailed).toBe(rustStr(rust(), 'SIGNAL_UNLOCK_FAILED'));
    expect(SESSION_FREE_TRIES).toBe(rustNum(rust(), 'FREE_TRIES'));
    expect(SESSION_FIRST_WAIT_MS).toBe(rustNum(rust(), 'FIRST_WAIT_MS'));
    expect(SESSION_MAX_WAIT_MS).toBe(rustNum(rust(), 'MAX_WAIT_MS'));
  });

  it('calls only methods echo-daemon registers: lock, unlock, switchUser, getState, logout', () => {
    const registered = [...daemon().matchAll(/^\s+SESSION_IFACE,\s*(METHOD_\w+)/gm)].map((m) => rustStr(rust(), m[1]));
    expect(registered.sort()).toEqual(['getState', 'lock', 'logout', 'switchUser', 'unlock']);
    // The SDK sends exactly those.
    const sdk = readFileSync(resolve(__dirname, '../../../packages/app-sdk/src/session.ts'), 'utf8');
    for (const method of registered) expect(sdk).toContain(`SESSION_IFACE, '${method}'`);
  });

  it('getState answers every field the SDK reads, and the mock answers the same set', async () => {
    const keys = jsonKeys(rust(), 'pub fn state_at');
    expect(keys.sort()).toEqual(
      ['accent', 'attempts_left', 'display_name', 'has_password', 'locked', 'retry_at_ms', 'user'].sort()
    );
    resetMockSession();
    const state = await getSessionState();
    expect(Object.keys(state ?? {}).sort()).toEqual([...keys].sort());
  });

  it('unlock refuses with reason, attempts_left and retry_at_ms (reasons wrong and wait)', () => {
    const source = rust();
    expect(jsonKeys(source, 'Check::Refused { reason, attempts_left, retry_at_ms } =>').sort()).toEqual(
      ['attempts_left', 'ok', 'reason', 'retry_at_ms'].sort()
    );
    expect(source).toContain('reason: "wrong"');
    expect(source).toContain('reason: "wait"');
  });
});

describe.runIf(haveAccounts)('the SDK speaks the accounts service the Rust registers', () => {
  const rust = () => readFileSync(ACCOUNTS_RS, 'utf8');
  const daemon = () => readFileSync(DAEMON_RS, 'utf8');

  it('names and methods', () => {
    expect(ACCOUNTS_IFACE).toBe(rustStr(rust(), 'ACCOUNTS_IFACE'));
    const registered = [...daemon().matchAll(/^\s+ACCOUNTS_IFACE,\s*(METHOD_\w+)/gm)].map((m) => rustStr(rust(), m[1]));
    expect(registered.sort()).toEqual(['create', 'delete', 'list', 'setPassword', 'setProfile']);
    const sdk = readFileSync(resolve(__dirname, '../../../packages/app-sdk/src/accounts.ts'), 'utf8');
    for (const method of registered) expect(sdk).toContain(`ACCOUNTS_IFACE, '${method}'`);
  });

  it('list carries the fields the mock and the SDK type carry', async () => {
    const keys = jsonKeys(rust(), 'pub fn list');
    expect(keys.sort()).toEqual(['accent', 'avatar', 'display_name', 'has_password', 'uid', 'user'].sort());
    resetMockSession();
    const [account] = await listAccounts();
    expect(Object.keys(account).sort()).toEqual([...keys].sort());
  });

  it('setPassword takes user, current and new', () => {
    const source = rust();
    const at = source.indexOf('pub fn set_password');
    expect(at).toBeGreaterThan(-1);
    const body = source.slice(at, at + 900);
    for (const field of ['user', 'current', 'new']) expect(body).toContain(`"${field}"`);
  });
});

describe.runIf(existsSync(BRIDGE_MJS))('the bridge lets the shell make these calls and no one else', () => {
  const bridge = () => readFileSync(BRIDGE_MJS, 'utf8');

  it('unlock is windows:manage; lock, logout and switchUser are settings:write (Settings uses them); reading the state needs nothing', () => {
    const at = bridge().indexOf('  session: {');
    expect(at).toBeGreaterThan(-1);
    const block = bridge().slice(at, at + 250);
    expect(block).toMatch(/\block: "settings:write"/);
    expect(block).toMatch(/unlock: "windows:manage"/);
    expect(block).toMatch(/switchUser: "settings:write"/);
    expect(block).toMatch(/getState: null/);
    expect(block).toMatch(/logout: "settings:write"/);
  });

  it('accounts is settings:write, and the two signals are windows:manage', () => {
    const src = bridge();
    const accounts = src.slice(src.indexOf('  accounts: {'), src.indexOf('  accounts: {') + 300);
    for (const m of ['list', 'setPassword', 'setProfile', 'create', 'delete']) {
      expect(accounts).toContain(`${m}: "settings:write"`);
    }
    expect(src).toContain(`${SESSION_SIGNALS.lockChanged}: "windows:manage"`);
    expect(src).toContain(`${SESSION_SIGNALS.unlockFailed}: "windows:manage"`);
  });
});

describe('Evo’s lock calls', () => {
  const evo = existsSync(ECHO_IPC_RS) ? readFileSync(ECHO_IPC_RS, 'utf8') : '';
  const landed = evo.includes('"SetIdleLock" =>');
  if (existsSync(ECHO_IPC_RS) && !landed) {
    console.warn('[sessionContract] SKIPPED the Evo lock-call checks: echo_ipc.rs has no "SetIdleLock" yet (the Evo lock lane has not landed).');
  }

  it.runIf(landed)('Evo handles Lock, SetIdleLock {seconds} and SetLockOrigin {x, y}', () => {
    expect(evo).toContain('"Lock" =>');
    expect(evo).toContain('"SetLockOrigin" =>');
    expect(evo).toMatch(/"SetIdleLock" =>[\s\S]{0,800}"seconds"/);
    expect(evo).toMatch(/"SetLockOrigin" =>[\s\S]{0,800}"x"[\s\S]{0,200}"y"/);
  });

  it.runIf(landed && existsSync(BRIDGE_MJS))('the bridge passes them as windows:manage', () => {
    const bridge = readFileSync(BRIDGE_MJS, 'utf8');
    for (const m of ['Lock', 'SetIdleLock', 'SetLockOrigin']) expect(bridge).toMatch(new RegExp(`\\b${m}: "windows:manage"`));
  });

  it('the dev mock answers them like Evo: ok', async () => {
    const { echoClient } = await import('@pyxis/app-sdk');
    expect(await echoClient.callMethod('evo', 'org.geckoOS.evo', 'SetIdleLock', { seconds: 600 })).toMatchObject({ ok: true });
    expect(await echoClient.callMethod('evo', 'org.geckoOS.evo', 'SetLockOrigin', { x: 640, y: 461 })).toMatchObject({ ok: true });
  });
});

describe('the mock honours the contract', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_700_000_000_000);
    resetMockSession();
  });
  afterEach(() => vi.useRealTimers());

  it('starts unlocked, with a password set, and it is "pyxis"', async () => {
    expect(MOCK_PASSWORD).toBe('pyxis');
    expect(await getSessionState()).toMatchObject({
      locked: false,
      user: 'geckouser',
      has_password: true,
      attempts_left: 5,
      retry_at_ms: null,
    });
  });

  it('lock signals once, the right password unlocks and signals', async () => {
    const changes: LockChange[] = [];
    const off = onLockChanged((c) => changes.push(c));
    expect(await lock()).toBe(true);
    await lock();
    expect(changes).toEqual([{ locked: true }]);
    expect((await getSessionState())?.locked).toBe(true);

    off();
  });

  it('logout locks an unlocked session and emits LockChanged', async () => {
    const changes: LockChange[] = [];
    const off = onLockChanged((c) => changes.push(c));
    expect(await logout()).toBe(true);
    expect(changes).toEqual([{ locked: true }]);
    expect((await getSessionState())?.locked).toBe(true);
    off();
  });

  it('locks and unlocks again cleanly (checking LockChange)', async () => {
    const changes: LockChange[] = [];
    const off = onLockChanged((c) => changes.push(c));
    await lock();

    expect(await unlock(MOCK_PASSWORD)).toEqual({ ok: true });
    expect(changes).toEqual([{ locked: true }, { locked: false }]);
    off();
  });

  it('the sixth try waits: 5 wrong, then 30 s, doubling to 15 min, and a try while waiting does not count', async () => {
    await lock();
    const failures: UnlockFailure[] = [];
    const off = onUnlockFailed((f) => failures.push(f));

    for (let tries = 1; tries <= 4; tries++) {
      expect(await unlock('nope')).toEqual({ ok: false, reason: 'wrong', attempts_left: 5 - tries, retry_at_ms: null });
    }
    const now = Date.now();
    expect(await unlock('nope')).toEqual({
      ok: false,
      reason: 'wrong',
      attempts_left: 0,
      retry_at_ms: now + 30_000,
    });
    expect(failures).toHaveLength(5);

    // While waiting, even the right password is refused, and nothing is counted.
    expect(await unlock(MOCK_PASSWORD)).toEqual({ ok: false, reason: 'wait', attempts_left: 0, retry_at_ms: now + 30_000 });
    expect(failures).toHaveLength(5);
    expect((await getSessionState())?.retry_at_ms).toBe(now + 30_000);

    // After the wait: another wrong try doubles it, up to the cap.
    let at = now + 30_000;
    for (const wait of [60_000, 120_000, 240_000, 480_000, 900_000, 900_000]) {
      vi.setSystemTime(at);
      const refused = await unlock('nope');
      expect(refused).toMatchObject({ ok: false, reason: 'wrong', retry_at_ms: at + wait });
      at += wait;
    }

    // Success resets everything.
    vi.setSystemTime(at);
    expect(await unlock(MOCK_PASSWORD)).toEqual({ ok: true });
    expect(await getSessionState()).toMatchObject({ attempts_left: 5, retry_at_ms: null });
    off();
  });

  it('with no password set, any unlock (the empty one too) succeeds', async () => {
    resetMockSession(null);
    expect(await getSessionState()).toMatchObject({ has_password: false });
    await lock();
    expect(await unlock('')).toEqual({ ok: true });
    expect((await getSessionState())?.locked).toBe(false);
  });

  it('setPassword needs the current password when one is set, and shares the rate limit', async () => {
    expect(await setPassword('geckouser', 'wrong', 'x')).toMatchObject({ ok: false, reason: 'wrong', attempts_left: 4 });
    expect(await setPassword('geckouser', MOCK_PASSWORD, 'new-one')).toEqual({ ok: true });
    await lock();
    expect(await unlock(MOCK_PASSWORD)).toMatchObject({ ok: false, reason: 'wrong' });
    expect(await unlock('new-one')).toEqual({ ok: true });
    await expect(setPassword('geckouser', 'new-one', '')).rejects.toThrow();
  });

  it('setProfile changes what the lock screen shows', async () => {
    await setProfile('geckouser', { display_name: 'Sam', accent: '#0D9488' });
    expect(await getSessionState()).toMatchObject({ display_name: 'Sam', accent: '#0d9488' });
    const [account] = await listAccounts();
    expect(account).toMatchObject({ display_name: 'Sam', has_password: true });
  });

  it('createAccount, switchUser, unlock(password, user), and deleteAccount manage multi-user sessions', async () => {
    const maya = await createAccount({
      user: 'maya',
      display_name: 'Maya',
      accent: '#EC4899',
      password: 'secret',
    });
    expect(maya).toMatchObject({
      user: 'maya',
      uid: 1002,
      display_name: 'Maya',
      accent: '#ec4899',
      has_password: true,
    });

    const accounts = await listAccounts();
    expect(accounts.map((a) => a.user)).toEqual(['geckouser', 'maya']);

    // Switch to Maya -> locks the session and sets active user to maya
    expect(await switchUser('maya')).toBe(true);
    expect(await getSessionState()).toMatchObject({
      locked: true,
      user: 'maya',
      display_name: 'Maya',
      accent: '#ec4899',
      has_password: true,
    });

    // Wrong password for Maya fails
    expect(await unlock(MOCK_PASSWORD, 'maya')).toMatchObject({ ok: false, reason: 'wrong' });
    // Right password for Maya unlocks as Maya
    expect(await unlock('secret', 'maya')).toEqual({ ok: true });
    expect(await getSessionState()).toMatchObject({
      locked: false,
      user: 'maya',
    });

    // Cannot delete active user or primary user
    await expect(deleteAccount('maya')).rejects.toThrow(/active/i);
    await expect(deleteAccount('geckouser')).rejects.toThrow(/primary/i);

    // Switch back to geckouser via unlock while locked
    await lock();
    expect(await unlock(MOCK_PASSWORD, 'geckouser')).toEqual({ ok: true });
    expect((await getSessionState())?.user).toBe('geckouser');

    // Now maya is non-active and can be deleted
    await deleteAccount('maya');
    expect((await listAccounts()).map((a) => a.user)).toEqual(['geckouser']);
  });
});

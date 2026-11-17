import { describe, it, expect, beforeEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PRIVILEGE_IFACE,
  PRIVILEGE_SERVICE,
  PRIVILEGE_SIGNALS,
  authenticatePrivilege,
  dismissPrivilegePrompt,
  getPrivilegeState,
  normalizePrivilegeState,
  onPrivilegeChanged,
  onPrivilegeRequested,
  requestPrivilege,
  revokePrivilege,
} from '@pyxis/app-sdk';
import { resetMockPrivilege } from '../../../packages/app-sdk/src/EchoClient';
import { MOCK_PASSWORD, resetMockSession } from '../../../packages/app-sdk/src/sessionMock';

/**
 * Privilege contract tests: verifies `org.geckoOS.privilege` across
 * echo/src/services/privilege.rs, echo/src/bin/daemon.rs,
 * PyxisBridgeParent.sys.mjs, packages/app-sdk/src/privilege.ts, and EchoClient's mock.
 */

const PRIVILEGE_RS = resolve(__dirname, '../../../../geckos/echo/src/services/privilege.rs');
const DAEMON_RS = resolve(__dirname, '../../../../geckos/echo/src/bin/daemon.rs');
const BRIDGE_MJS = resolve(
  __dirname,
  '../../../../geckos/gecko/patches/pyxis/toolkit/actors/PyxisBridgeParent.sys.mjs'
);
const haveRust = existsSync(PRIVILEGE_RS) && existsSync(DAEMON_RS);

function rustStr(source: string, name: string): string {
  const m = source.match(new RegExp(`pub const ${name}: &str = "([^"]+)";`));
  if (!m) throw new Error(`${name} not found`);
  return m[1];
}

describe.runIf(haveRust)('the SDK speaks the privilege service the Rust registers', () => {
  const rust = () => readFileSync(PRIVILEGE_RS, 'utf8');
  const daemon = () => readFileSync(DAEMON_RS, 'utf8');

  it('names: interface, service, and signals match privilege.rs (lowercase privilege for bridge lookup)', () => {
    expect(PRIVILEGE_SERVICE).toBe(rustStr(rust(), 'PRIVILEGE_SERVICE'));
    expect(PRIVILEGE_IFACE).toBe(rustStr(rust(), 'PRIVILEGE_IFACE'));
    expect(PRIVILEGE_IFACE).toBe('org.geckoOS.privilege');
    expect(PRIVILEGE_SIGNALS.requested).toBe(rustStr(rust(), 'SIGNAL_PRIVILEGE_REQUESTED'));
    expect(PRIVILEGE_SIGNALS.changed).toBe(rustStr(rust(), 'SIGNAL_PRIVILEGE_CHANGED'));
  });

  it('registers all five PascalCase methods in daemon.rs and handles them in privilege.rs', () => {
    const src = rust();
    const dmn = daemon();
    const methods = ['Request', 'Authenticate', 'Dismiss', 'Revoke', 'GetState'];
    for (const m of methods) {
      expect(src).toContain(`"${m}"`);
      expect(dmn).toContain(`"${m}"`);
    }
    const sdk = readFileSync(resolve(__dirname, '../../../packages/app-sdk/src/privilege.ts'), 'utf8');
    for (const m of methods) {
      expect(sdk).toContain(`'${m}'`);
    }
  });

  it('normalizePrivilegeState accepts raw privilege.rs snapshot shapes (grantedAtMs, expiresAtMs, requestedAtMs, auditLog)', () => {
    const now = 1_700_000_000_000;
    const rawFromDaemon = {
      active: true,
      granted: true,
      grant: {
        appId: 'files',
        appName: 'Files',
        reason: 'Edit /etc/hosts',
        grantedBy: 'geckouser',
        grantedAtMs: now - 10_000,
        expiresAtMs: now + 290_000,
      },
      grants: [
        {
          appId: 'files',
          appName: 'Files',
          reason: 'Edit /etc/hosts',
          grantedBy: 'geckouser',
          grantedAtMs: now - 10_000,
          expiresAtMs: now + 290_000,
        },
      ],
      pending: [
        {
          requestId: 'priv-1700000000000-1',
          appId: 'terminal',
          appName: 'Terminal',
          reason: 'Inspect logs',
          requestedAtMs: now - 2_000,
        },
      ],
      auditLog: [
        {
          timestampMs: now - 5_000,
          timestamp: '2023-11-14T22:13:15Z',
          appId: 'files',
          method: 'writeFile',
          path: '/etc/hosts',
        },
      ],
    };

    const parsed = normalizePrivilegeState(rawFromDaemon, undefined, now);
    expect(parsed.active).toBe(true);
    expect(parsed.grant).toMatchObject({
      appId: 'files',
      appName: 'Files',
      reason: 'Edit /etc/hosts',
      grantedAt: now - 10_000,
      expiresAt: now + 290_000,
      remainingSecs: 290,
    });
    expect(parsed.pending).toHaveLength(1);
    expect(parsed.pending[0]).toMatchObject({
      requestId: 'priv-1700000000000-1',
      appId: 'terminal',
      appName: 'Terminal',
      requestedAt: now - 2_000,
    });
    expect(parsed.audit).toHaveLength(1);
    expect(parsed.audit?.[0]).toMatchObject({
      appId: 'files',
      action: 'writeFile',
      reason: '/etc/hosts',
      timestamp: now - 5_000,
    });
  });
});

describe.runIf(existsSync(BRIDGE_MJS))('the bridge gates privileged calls & signals accurately', () => {
  const bridge = () => readFileSync(BRIDGE_MJS, 'utf8');

  it('Authenticate and Dismiss require windows:manage; Request, Revoke, and GetState are open', () => {
    const src = bridge();
    const at = src.indexOf('  privilege: {');
    expect(at).toBeGreaterThan(-1);
    const block = src.slice(at, at + 350);
    expect(block).toMatch(/Request:\s*null/);
    expect(block).toMatch(/Authenticate:\s*"windows:manage"/);
    expect(block).toMatch(/Dismiss:\s*"windows:manage"/);
    expect(block).toMatch(/Revoke:\s*null/);
    expect(block).toMatch(/GetState:\s*null/);
  });

  it('PrivilegeRequested requires windows:manage and PrivilegeChanged is open', () => {
    const src = bridge();
    const sigAt = src.indexOf('const BRIDGE_SIGNALS');
    const privAt = src.indexOf('  privilege: {', sigAt);
    expect(privAt).toBeGreaterThan(-1);
    const block = src.slice(privAt, privAt + 140);
    expect(block).toMatch(/PrivilegeRequested:\s*"windows:manage"/);
    expect(block).toMatch(/PrivilegeChanged:\s*null/);
  });
});

describe('the privilege mock honours the contract', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_700_000_000_000);
    resetMockSession();
    resetMockPrivilege();
  });

  it('requests, refuses wrong password, grants on valid password, and revokes cleanly', async () => {
    const requested: string[] = [];
    const changed: boolean[] = [];
    const offReq = onPrivilegeRequested((r) => requested.push(r.requestId));
    const offChg = onPrivilegeChanged((s) => changed.push(s.active));

    const req = await requestPrivilege('Edit /etc/hosts', 'files');
    expect(req.granted).toBe(false);
    expect(req.pending).toBe(true);
    expect(req.requestId).toBeTruthy();
    expect(requested).toEqual([req.requestId!]);

    const bad = await authenticatePrivilege({ password: 'wrong', requestId: req.requestId });
    expect(bad).toMatchObject({ ok: false, reason: 'wrong' });

    const ok = await authenticatePrivilege({
      password: MOCK_PASSWORD,
      requestId: req.requestId,
      appId: 'files',
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.grant?.appId).toBe('files');
      expect(ok.grant?.remainingSecs).toBeGreaterThan(0);
    }

    const st = await getPrivilegeState('files');
    expect(st.active).toBe(true);
    expect(st.grant?.appId).toBe('files');

    expect(await revokePrivilege('files')).toBe(true);
    const after = await getPrivilegeState('files');
    expect(after.active).toBe(false);
    expect(changed.at(-1)).toBe(false);

    const dismissed = await dismissPrivilegePrompt({ appId: 'files' });
    expect(dismissed).toBe(true);

    offReq();
    offChg();
    vi.useRealTimers();
  });
});

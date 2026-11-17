import { describe, it, expect, beforeEach } from 'vitest';
import {
  PRIVILEGE_IFACE,
  PRIVILEGE_SIGNALS,
  echoClient,
  normalizePrivilegeState,
  onPrivilegeRequested,
  type PrivilegePromptRequest,
} from '../index';
import { emitMockPrivilegeAction, resetMockPrivilege } from '../EchoClient';

beforeEach(() => resetMockPrivilege());

describe('privilege action requests', () => {
  it('parses action and details from GetState pending, snake or camel', () => {
    const state = normalizePrivilegeState({
      pending: [
        { request_id: 'a', app_id: 'installer', action: 'package.remove', details: { package: 'notes', n: 3, bad: {} } },
        { requestId: 'b', appId: 'settings' },
      ],
    });
    expect(state.pending[0].action).toBe('package.remove');
    expect(state.pending[0].details).toEqual({ package: 'notes', n: '3' });
    expect(state.pending[1].action).toBeUndefined();
    expect(state.pending[1].details).toBeUndefined();
  });

  it('the mock emits PrivilegeRequested with action and details', () => {
    const seen: PrivilegePromptRequest[] = [];
    const off = onPrivilegeRequested((r) => seen.push(r));
    const id = emitMockPrivilegeAction('network.manage', { ssid: 'Home' }, 'settings');
    off();
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ requestId: id, appId: 'settings', action: 'network.manage', details: { ssid: 'Home' } });
    expect(PRIVILEGE_SIGNALS.requested).toBe('PrivilegeRequested');
    expect(PRIVILEGE_IFACE).toBeTruthy();
    void echoClient;
  });
});

/**
 * Privilege elevation: apps (such as Files) request temporary privileged
 * access for system operations, and Bloom's overlay prompts the user for
 * their password outside the app's window.
 *
 * `Echo` owns the grant, timer, and audit log (`org.geckoOS.privilege`).
 * Apps never see the password: they call `requestPrivilege`, observe
 * `getPrivilegeState` / `onPrivilegeChanged`, and can call `revokePrivilege`.
 * Only the shell overlay calls `authenticatePrivilege` and
 * `dismissPrivilegePrompt`.
 */
import { useEffect, useState } from 'react';
import { echoClient } from './EchoClient';

export const PRIVILEGE_SERVICE = 'org.geckoOS.privilege';
export const PRIVILEGE_IFACE = 'org.geckoOS.privilege';

const BRIDGE_SERVICE = 'privilege';

export const PRIVILEGE_SIGNALS = {
  changed: 'PrivilegeChanged',
  requested: 'PrivilegeRequested',
} as const;

export interface PrivilegeGrant {
  appId: string;
  appName?: string;
  reason?: string;
  grantedAt: number;
  expiresAt: number;
  remainingSecs: number;
}

export interface PrivilegePromptRequest {
  requestId: string;
  appId: string;
  appName?: string;
  reason?: string;
  requestedAt: number;
  durationSecs?: number;
  /** Named root action (`package.install`, `network.manage`, …), from Echo. */
  action?: string;
  /** Facts about the action, filled in by Echo (never the app's own text). */
  details?: Record<string, string>;
}

export interface PrivilegeAuditEntry {
  id: string;
  appId: string;
  action: 'requested' | 'granted' | 'denied' | 'revoked' | 'expired' | 'dismissed' | string;
  reason?: string;
  timestamp: number;
}

export interface PrivilegeState {
  active: boolean;
  grant: PrivilegeGrant | null;
  grants: PrivilegeGrant[];
  pending: PrivilegePromptRequest[];
  audit?: PrivilegeAuditEntry[];
}

export interface PrivilegeRequestResult {
  granted: boolean;
  pending: boolean;
  requestId?: string;
  grant?: PrivilegeGrant | null;
  request?: PrivilegePromptRequest | null;
  error?: string;
}

export interface AuthenticatePrivilegeOptions {
  password: string;
  requestId?: string;
  appId?: string;
  durationSecs?: number;
}

export type PrivilegeAuthResult =
  | {
      ok: true;
      grant?: PrivilegeGrant | null;
      state?: PrivilegeState;
    }
  | {
      ok: false;
      /** `no-password`: the account has none, so there is nothing to check (set one first). */
      reason?: 'wrong' | 'wait' | 'no-password' | 'error';
      error: string;
      attempts_left?: number;
      retry_at_ms?: number | null;
    };

export interface DismissPrivilegeOptions {
  requestId?: string;
  appId?: string;
}

const EMPTY_STATE: PrivilegeState = {
  active: false,
  grant: null,
  grants: [],
  pending: [],
  audit: [],
};

function toMs(ts: unknown, fallback: number): number {
  if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) return fallback;
  return ts > 1e11 ? ts : ts * 1000;
}

function normalizeGrant(raw: unknown, now = Date.now()): PrivilegeGrant | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  const appId = typeof g.appId === 'string' ? g.appId : typeof g.app_id === 'string' ? g.app_id : '';
  if (!appId) return null;
  const rawAppName = g.appName ?? g.app_name;
  const appName = typeof rawAppName === 'string' && rawAppName.trim() ? rawAppName : undefined;

  const grantedAt = toMs(g.grantedAt ?? g.grantedAtMs ?? g.granted_at, now);
  const rawRemaining =
    typeof g.remainingSecs === 'number'
      ? g.remainingSecs
      : typeof g.remaining_secs === 'number'
        ? g.remaining_secs
        : undefined;
  const rawExpires = g.expiresAt ?? g.expiresAtMs ?? g.expires_at;
  const expiresAt =
    rawExpires !== undefined
      ? toMs(rawExpires, now)
      : rawRemaining !== undefined
        ? now + Math.max(0, rawRemaining) * 1000
        : now;
  const remainingSecs = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  if (remainingSecs <= 0) return null;

  return {
    appId,
    ...(appName ? { appName } : {}),
    ...(typeof g.reason === 'string' ? { reason: g.reason } : {}),
    grantedAt,
    expiresAt,
    remainingSecs,
  };
}

function normalizeDetails(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && v) out[k] = v;
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = String(v);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeRequest(raw: unknown, now = Date.now()): PrivilegePromptRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const requestId =
    typeof r.requestId === 'string'
      ? r.requestId
      : typeof r.request_id === 'string'
        ? r.request_id
        : '';
  const appId = typeof r.appId === 'string' ? r.appId : typeof r.app_id === 'string' ? r.app_id : '';
  if (!requestId || !appId) return null;
  const rawAppName = r.appName ?? r.app_name;
  const appName = typeof rawAppName === 'string' && rawAppName.trim() ? rawAppName : undefined;

  const durationRaw = r.durationSecs ?? r.duration_secs;
  const action = typeof r.action === 'string' && r.action.trim() ? r.action.trim() : undefined;
  const details = normalizeDetails(r.details);
  return {
    requestId,
    appId,
    ...(appName ? { appName } : {}),
    ...(typeof r.reason === 'string' ? { reason: r.reason } : {}),
    requestedAt: toMs(r.requestedAt ?? r.requestedAtMs ?? r.requested_at, now),
    ...(typeof durationRaw === 'number' && Number.isFinite(durationRaw) && durationRaw > 0
      ? { durationSecs: durationRaw }
      : {}),
    ...(action ? { action } : {}),
    ...(details ? { details } : {}),
  };
}

function normalizeAudit(raw: unknown): PrivilegeAuditEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: PrivilegeAuditEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const e = item as Record<string, unknown>;
    const appId = typeof e.appId === 'string' ? e.appId : typeof e.app_id === 'string' ? e.app_id : '';
    const action =
      typeof e.action === 'string'
        ? e.action
        : typeof e.method === 'string'
          ? e.method
          : '';
    if (!appId || !action) continue;
    const reasonVal =
      typeof e.reason === 'string'
        ? e.reason
        : typeof e.path === 'string'
          ? e.path
          : typeof e.outcome === 'string'
            ? e.outcome
            : undefined;
    const tsRaw = e.timestampMs ?? e.timestamp;
    const tsNum = typeof tsRaw === 'number' ? tsRaw : undefined;
    out.push({
      id: typeof e.id === 'string' ? e.id : `${appId}-${action}-${String(tsRaw ?? '')}`,
      appId,
      action,
      ...(reasonVal ? { reason: reasonVal } : {}),
      timestamp: toMs(tsNum, Date.now()),
    });
  }
  return out;
}

export function normalizePrivilegeState(raw: unknown, appId?: string, now = Date.now()): PrivilegeState {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_STATE };
  const obj = ((raw as Record<string, unknown>).state ?? raw) as Record<string, unknown>;

  const listRaw = Array.isArray(obj.grants) ? obj.grants : obj.grant ? [obj.grant] : [];
  const allGrants = listRaw
    .map((g) => normalizeGrant(g, now))
    .filter((g): g is PrivilegeGrant => g !== null);

  const grants = appId ? allGrants.filter((g) => g.appId === appId) : allGrants;
  const directGrant = normalizeGrant(obj.grant, now);
  const grant =
    (appId
      ? grants[0] ?? (directGrant && directGrant.appId === appId ? directGrant : null)
      : directGrant ?? grants[0] ?? null) ?? null;

  const pendingRaw = Array.isArray(obj.pending) ? obj.pending : [];
  const allPending = pendingRaw
    .map((p) => normalizeRequest(p, now))
    .filter((p): p is PrivilegePromptRequest => p !== null);
  const pending = appId ? allPending.filter((p) => p.appId === appId) : allPending;

  const audit = normalizeAudit(obj.audit ?? obj.auditLog);

  return {
    active: grants.length > 0 || grant !== null,
    grant,
    grants,
    pending,
    audit,
  };
}

/** Request temporary privileged access for `appId` with a user-facing `reason`. */
export async function requestPrivilege(reason?: string, appId?: string): Promise<PrivilegeRequestResult> {
  try {
    const payload: Record<string, unknown> = {};
    if (reason !== undefined) payload.reason = reason;
    if (appId !== undefined) payload.appId = appId;
    const res = (await echoClient.callMethodStrict(
      BRIDGE_SERVICE,
      PRIVILEGE_IFACE,
      'Request',
      payload
    )) as Record<string, unknown> | undefined;

    if (res?.error) {
      return { granted: false, pending: false, error: String(res.error) };
    }
    const grant = normalizeGrant(res?.grant);
    const request = normalizeRequest(res?.request);
    const requestId =
      typeof res?.requestId === 'string'
        ? res.requestId
        : typeof res?.request_id === 'string'
          ? res.request_id
          : request?.requestId;

    return {
      granted: Boolean(res?.granted ?? grant !== null),
      pending: Boolean(res?.pending ?? request !== null),
      ...(requestId ? { requestId } : {}),
      grant,
      request,
    };
  } catch (err) {
    return {
      granted: false,
      pending: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Query current privilege grants and pending requests (optionally scoped to `appId`). */
export async function getPrivilegeState(appId?: string): Promise<PrivilegeState> {
  try {
    const payload: Record<string, unknown> = appId ? { appId } : {};
    const res = await echoClient.callMethodStrict(BRIDGE_SERVICE, PRIVILEGE_IFACE, 'GetState', payload);
    return normalizePrivilegeState(res, appId);
  } catch {
    return { ...EMPTY_STATE };
  }
}

/** Revoke active privilege grant(s) (for `appId`, or all grants when omitted). */
export async function revokePrivilege(appId?: string): Promise<boolean> {
  try {
    const payload: Record<string, unknown> = appId ? { appId } : {};
    const res = (await echoClient.callMethodStrict(
      BRIDGE_SERVICE,
      PRIVILEGE_IFACE,
      'Revoke',
      payload
    )) as { ok?: boolean; error?: string } | undefined;
    return res?.ok !== false && !res?.error;
  } catch {
    return false;
  }
}

/** Submit the user's password in the shell overlay to authorize a pending privilege request. */
export async function authenticatePrivilege(
  options: AuthenticatePrivilegeOptions
): Promise<PrivilegeAuthResult> {
  try {
    const payload: Record<string, unknown> = { password: options.password };
    if (options.requestId) payload.requestId = options.requestId;
    if (options.appId) payload.appId = options.appId;
    if (options.durationSecs !== undefined) payload.durationSecs = options.durationSecs;

    const res = (await echoClient.callMethodStrict(
      BRIDGE_SERVICE,
      PRIVILEGE_IFACE,
      'Authenticate',
      payload
    )) as Record<string, unknown> | undefined;

    if (res?.ok === true) {
      return {
        ok: true,
        grant: normalizeGrant(res.grant),
        ...(res.state ? { state: normalizePrivilegeState(res.state) } : {}),
      };
    }

    const reason =
      res?.reason === 'wrong' || res?.reason === 'wait' || res?.reason === 'no-password'
        ? res.reason
        : ('error' as const);
    const rawAttemptsLeft =
      res?.attemptsLeft !== undefined ? res.attemptsLeft : res?.attempts_left;
    const rawRetryAtMs =
      res?.retryAtMs !== undefined ? res.retryAtMs : res?.retry_at_ms;
    return {
      ok: false,
      reason,
      error:
        reason === 'no-password'
          ? 'Set a password in Settings → Users & Lock first.'
          : typeof res?.error === 'string' && res.error
          ? res.error
          : reason === 'wrong'
            ? 'Incorrect password'
            : reason === 'wait'
              ? 'Too many attempts, please wait'
              : 'Authentication failed',
      ...(typeof rawAttemptsLeft === 'number' ? { attempts_left: rawAttemptsLeft } : {}),
      ...(typeof rawRetryAtMs === 'number' || rawRetryAtMs === null
        ? { retry_at_ms: rawRetryAtMs as number | null }
        : {}),
    };
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      error: err instanceof Error ? err.message : 'Authentication failed',
    };
  }
}

/** Dismiss a pending privilege prompt without granting access. */
export async function dismissPrivilegePrompt(options: DismissPrivilegeOptions = {}): Promise<boolean> {
  try {
    const payload: Record<string, unknown> = {};
    if (options.requestId) payload.requestId = options.requestId;
    if (options.appId) payload.appId = options.appId;
    const res = (await echoClient.callMethodStrict(
      BRIDGE_SERVICE,
      PRIVILEGE_IFACE,
      'Dismiss',
      payload
    )) as { ok?: boolean; error?: string } | undefined;
    return res?.ok !== false && !res?.error;
  } catch {
    return false;
  }
}

export function onPrivilegeChanged(handler: (state: PrivilegeState) => void): () => void {
  return echoClient.onSignal(PRIVILEGE_IFACE, PRIVILEGE_SIGNALS.changed, (data) => {
    handler(normalizePrivilegeState(data));
  });
}

export function onPrivilegeRequested(handler: (request: PrivilegePromptRequest) => void): () => void {
  return echoClient.onSignal(PRIVILEGE_IFACE, PRIVILEGE_SIGNALS.requested, (data) => {
    const raw = (data as { request?: unknown } | undefined)?.request ?? data;
    const req = normalizeRequest(raw);
    if (req) handler(req);
  });
}

function tickPrivilegeState(prev: PrivilegeState, now: number): { next: PrivilegeState; expired: boolean } {
  let expired = false;
  const grants: PrivilegeGrant[] = [];
  for (const g of prev.grants) {
    const remainingSecs =
      g.expiresAt > 0 ? Math.max(0, Math.ceil((g.expiresAt - now) / 1000)) : Math.max(0, g.remainingSecs - 1);
    if (remainingSecs <= 0) {
      expired = true;
    } else {
      grants.push({ ...g, remainingSecs });
    }
  }
  const grant = grants[0] ?? null;
  return {
    expired,
    next: {
      ...prev,
      active: grants.length > 0,
      grant,
      grants,
    },
  };
}

/**
 * Live privilege state for React components (shell overlay or apps): fetches
 * initial state, listens for `PrivilegeChanged` (and, with `prompts`, for
 * `PrivilegeRequested`), and ticks a 1 s countdown interval while any grant is
 * active.
 *
 * `prompts` is the shell's: `PrivilegeRequested` is `windows:manage` at the
 * bridge, so an app that subscribes is refused (and the refusal logged). An
 * app showing the status (Settings → System) passes `{ prompts: false }`.
 */
export function usePrivilegeState(appId?: string, { prompts = true }: { prompts?: boolean } = {}): PrivilegeState {
  const [state, setState] = useState<PrivilegeState>(EMPTY_STATE);

  useEffect(() => {
    let mounted = true;
    let heardSignal = false;

    void getPrivilegeState(appId).then((initial) => {
      if (!mounted || heardSignal) return;
      setState(initial);
    });

    const offChanged = onPrivilegeChanged((rawState) => {
      heardSignal = true;
      if (!mounted) return;
      setState(normalizePrivilegeState(rawState, appId));
    });

    const offRequested = !prompts ? () => {} : onPrivilegeRequested((req) => {
      heardSignal = true;
      if (!mounted) return;
      if (appId && req.appId !== appId) return;
      setState((prev) => {
        if (prev.pending.some((p) => p.requestId === req.requestId)) return prev;
        return {
          ...prev,
          pending: [...prev.pending, req],
        };
      });
    });

    return () => {
      mounted = false;
      offChanged();
      offRequested();
    };
  }, [appId, prompts]);

  const hasGrants = state.active || state.grants.length > 0;
  const earliestExpiry = state.grants.reduce(
    (min, g) => (g.expiresAt > 0 && g.expiresAt < min ? g.expiresAt : min),
    Infinity
  );
  useEffect(() => {
    if (!hasGrants) return;
    let mounted = true;
    let syncedExpiry = false;
    const id = window.setInterval(() => {
      const now = Date.now();
      setState((prev) => tickPrivilegeState(prev, now).next);
      if (!syncedExpiry && Number.isFinite(earliestExpiry) && now >= earliestExpiry) {
        syncedExpiry = true;
        void getPrivilegeState(appId).then((fresh) => {
          if (mounted) setState(fresh);
        });
      }
    }, 1000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [hasGrants, earliestExpiry, appId]);

  return state;
}

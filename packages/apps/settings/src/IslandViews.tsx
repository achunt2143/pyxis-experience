// Settings' adapted React islands: what draws a canvas (the SDK's DynamicWallpaper), a native
// range input that pyxis.Control cannot configure (no min/max/step), and the long time-zone
// list (hundreds of rows; a Duyo row is several nodes and every change re-renders every node).
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Collapsable,
  Divider,
  Dropdown,
  Input,
  Item,
  ListHeader,
  NumberInput,
  ProgressBar,
  Slider,
  Toggle,
} from 'remochi';
import {
  DynamicWallpaper,
  EVO_IFACE,
  SETTING_KEYS,
  WALLPAPERS,
  connectWifi,
  disconnectWifi,
  echoClient,
  getAppPermissions,
  getBatteryStatus,
  getNetworkDetails,
  getNetworkInterfaces,
  getScreenBrightness,
  getSetting,
  getStorageInfo,
  installErrorText,
  listSystemServices,
  onSettingChange,
  revokePrivilege,
  scanWifi,
  setAppPermission,
  setInterfaceEnabled,
  setNetworkDns,
  setScreenBrightness,
  setSetting,
  setSystemHostname,
  usePrivilegeState,
  type Account,
  type AppPermissionInfo,
  type BatteryStatus,
  type NetworkInterfaceInfo,
  type StoragePartition,
  type SystemServiceStatus,
  type WallpaperMotion,
  type WifiNetworkInfo,
} from '@pyxis/app-sdk';
import { formatBytes } from './about';
import { validateDnsInput, validateHostname } from './networkValidation';
import {
  BORDER,
  PRIMARY,
  PRIMARY_SOFT,
  SURFACE,
  fieldLabelStyle,
  mochiCardStyle,
  secondaryText,
} from './styles';
import { formatMinutes } from './sunInfo';
import { zoneDetail, type ZoneOption } from './timezones';
import { accentOf, initialOf } from './usersModel';

const compactInputStyle = {
  width: '100%',
  minWidth: 0,
  marginRight: 0,
  padding: '7px 12px',
  fontSize: '0.84rem',
  boxSizing: 'border-box' as const,
};

function AlertBanner({ message, dataAttr }: { message: string; dataAttr: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      {...{ [dataAttr]: true }}
      className="st-error st-alert-banner"
      style={{ fontWeight: 600 }}
    >
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wallpaper thumbnails

interface GridProps {
  wallpaper: string;
  motion: WallpaperMotion;
  pinned: number | null;
  onPick: (id: string) => void;
}

export function WallpaperGrid({ wallpaper, motion, pinned, onPick }: GridProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Wallpaper"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(120px, 100%), 1fr))',
        gap: '10px',
        width: '100%',
        minWidth: 0,
      }}
    >
      {WALLPAPERS.map((wp) => {
        const isCurrent = wallpaper === wp.id;
        return (
          <Item
            key={wp.id}
            variant="compact"
            hoverable
            selected={isCurrent}
            className="st-wallpaper-tile"
            aria-checked={isCurrent}
            aria-label={`${wp.name} wallpaper`}
            data-wallpaper={wp.id}
            onClick={() => onPick(wp.id)}
            style={{
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: 0,
              padding: 0,
              overflow: 'hidden',
              minWidth: 0,
              boxShadow: isCurrent ? 'inset 0 0 0 1px var(--mochi-primary)' : 'none',
            }}
          >
            <div style={{ position: 'relative', height: '64px', overflow: 'hidden', background: wp.css }}>
              {/* css: one WebGL context per preview would be too many; the large preview is the webgl one. */}
              <DynamicWallpaper
                wallpaper={wp.id}
                preview
                backend="css"
                motion={motion}
                time={wp.kind === 'daylight' ? (pinned ?? undefined) : undefined}
              />
            </div>
            <div
              style={{
                padding: '7px 10px',
                fontSize: '0.78rem',
                fontWeight: isCurrent ? 700 : 500,
                color: isCurrent ? PRIMARY : 'var(--mochi-text)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '4px',
                minWidth: 0,
              }}
            >
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {wp.name}
              </span>
              {isCurrent && <Badge content="Active" background={PRIMARY_SOFT} color={PRIMARY} />}
            </div>
          </Item>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The large preview

interface PreviewProps {
  wallpaper: string;
  motion: WallpaperMotion;
  time: number | null;
  label: string;
  pill: string;
}

export function WallpaperPreview({ wallpaper, motion, time, label, pill }: PreviewProps) {
  const selected = WALLPAPERS.find((w) => w.id === wallpaper) ?? WALLPAPERS[0];
  return (
    <div
      data-wallpaper-preview={selected.id}
      aria-label={label}
      role="img"
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        maxHeight: '300px',
        borderRadius: '12px',
        overflow: 'hidden',
        border: `1px solid ${BORDER}`,
        background: selected.css,
      }}
    >
      <DynamicWallpaper wallpaper={selected.id} preview backend="webgl" motion={motion} time={time ?? undefined} />
      {pill && (
        <Badge
          data-daylight-phase=""
          content={pill}
          background="rgba(15, 23, 42, 0.55)"
          color="#fff"
          style={{
            position: 'absolute',
            left: '12px',
            bottom: '12px',
            backdropFilter: 'blur(6px)',
            borderRadius: '999px',
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The time-of-day scrubber

interface ScrubberProps {
  shownMinutes: number;
  scrubbing: boolean;
  pinned: number | null;
  hour24: boolean;
  onScrub: (minutes: number | null) => void;
}

export function Scrubber({ shownMinutes, scrubbing, pinned, hour24, onScrub }: ScrubberProps) {
  const snapped = Math.min(1435, Math.round(shownMinutes / 5) * 5);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', width: '100%', minWidth: 0 }}>
      <div className="st-slider-compact" style={{ flex: '1 1 180px', minWidth: 0 }}>
        <Slider
          width="100%"
          min={0}
          max={1435}
          step={5}
          value={snapped}
          aria-label="Preview time of day"
          aria-valuetext={formatMinutes(shownMinutes, hour24)}
          data-daylight-scrubber=""
          onChange={(next) => onScrub(next)}
        />
      </div>
      <Button
        data-daylight-scrub-reset=""
        disabled={!scrubbing}
        onClick={() => onScrub(null)}
      >
        {pinned === null ? 'Back to now' : 'Back to pinned'}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The time-zone list

interface ZoneListProps {
  results: ZoneOption[];
  /** The list hasn't arrived. */
  loading: boolean;
  /** What to say when `results` is empty. */
  emptyText: string;
  /** Group by region (no query). */
  grouped: boolean;
  currentZone: string;
  pending: string | null;
  onChoose: (id: string) => void;
}

export function ZoneList({ results, loading, emptyText, grouped, currentZone, pending, onChoose }: ZoneListProps) {
  return (
    <div
      id="timezone-list"
      role="listbox"
      aria-label="Time zones"
      data-timezone-list
      style={{
        width: '100%',
        minWidth: 0,
        maxWidth: '100%',
        boxSizing: 'border-box',
        maxHeight: '260px',
        overflowY: 'auto',
        overflowX: 'hidden',
        border: `1px solid ${BORDER}`,
        borderRadius: 'var(--mochi-corner-sm, 10px)',
        background: SURFACE,
      }}
    >
      {loading && <div style={{ ...secondaryText, padding: '10px 12px' }}>Loading time zones…</div>}
      {!loading && results.length === 0 && <div style={{ ...secondaryText, padding: '10px 12px' }}>{emptyText}</div>}
      {results.map((option, index) => {
        const isCurrent = option.id === currentZone;
        const heading = grouped && option.region !== results[index - 1]?.region ? option.region : null;
        return (
          <Fragment key={option.id}>
            {heading && (
              <ListHeader
                role="presentation"
                className="st-zone-header"
                style={{
                  ...fieldLabelStyle,
                  padding: '6px 12px 4px',
                  position: 'sticky',
                  top: 0,
                  background: SURFACE,
                  borderBottom: `1px solid ${BORDER}`,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  fontStyle: 'normal',
                  zIndex: 1,
                }}
              >
                {heading}
              </ListHeader>
            )}
            <Item
              variant="compact"
              hoverable
              selected={isCurrent}
              disabled={pending !== null}
              aria-selected={isCurrent}
              data-timezone={option.id}
              title={option.city}
              subtitle={zoneDetail(option)}
              rightContent={
                <span style={{ ...secondaryText, whiteSpace: 'nowrap' }}>
                  {pending === option.id ? 'Setting…' : isCurrent ? 'Current' : option.id}
                </span>
              }
              onClick={() => onChoose(option.id)}
              style={{
                borderRadius: 0,
                border: 'none',
                borderBottom: `1px solid ${BORDER}`,
                borderLeft: `3px solid ${isCurrent ? PRIMARY : 'transparent'}`,
                cursor: pending ? 'progress' : 'pointer',
              }}
            />
          </Fragment>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The machine's user accounts roster

export interface AccountRosterProps {
  accounts: Account[];
  activeUser: string;
  busyUser: string | null;
  confirmingUser?: string | null;
  onSwitch: (user: string) => void;
  onDelete: (user: string) => void;
  onAskDelete?: (user: string) => void;
  onCancelDelete?: () => void;
}

export function AccountRoster({
  accounts,
  activeUser,
  busyUser,
  confirmingUser,
  onSwitch,
  onDelete,
  onAskDelete,
  onCancelDelete,
}: AccountRosterProps) {
  const [localConfirm, setLocalConfirm] = useState<string | null>(null);
  const controlled = confirmingUser !== undefined;
  const activeConfirm = controlled ? confirmingUser : localConfirm;

  const cancelConfirm = useCallback(() => {
    if (controlled) onCancelDelete?.();
    else setLocalConfirm(null);
  }, [controlled, onCancelDelete]);

  useEffect(() => {
    if (!activeConfirm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelConfirm();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activeConfirm, cancelConfirm]);

  if (!accounts || accounts.length === 0) return null;
  return (
    <div
      data-accounts-roster=""
      style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', minWidth: 0 }}
    >
      {accounts.map((acct) => {
        const isCurrent = acct.user === activeUser;
        const isPrimary = acct.user === 'geckouser' || acct.uid === 1000;
        const label = acct.display_name || acct.user;
        const busy = busyUser === acct.user;
        const confirming = activeConfirm === acct.user;
        return (
          <Item
            key={acct.user}
            variant="compact"
            hoverable={false}
            className="st-avatar-item st-wrap-item"
            data-account-row={acct.user}
            title={label}
            subtitle={`@${acct.user} · ${acct.has_password ? 'Password set' : 'No password'}`}
            icon={
              <div
                aria-hidden="true"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '12px 3px 12px 12px',
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                  color: '#fff',
                  fontSize: 18,
                  fontWeight: 300,
                  background: accentOf(acct.accent),
                }}
              >
                {initialOf(label)}
              </div>
            }
            rightContent={
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                  justifyContent: 'flex-end',
                  maxWidth: '100%',
                }}
              >
                {isCurrent ? (
                  <span data-account-active={acct.user}>
                    <Badge content="Current session" background={PRIMARY_SOFT} color={PRIMARY} />
                  </span>
                ) : (
                  <>
                    <span data-account-switch={acct.user}>
                      <Button disabled={busy} onClick={() => onSwitch(acct.user)}>
                        Switch user
                      </Button>
                    </span>
                    {!isPrimary &&
                      (!confirming ? (
                        <span data-account-delete={acct.user}>
                          <Button
                            disabled={busy}
                            onClick={() => {
                              if (controlled) onAskDelete?.(acct.user);
                              else setLocalConfirm(acct.user);
                            }}
                          >
                            Remove
                          </Button>
                        </span>
                      ) : (
                        <div
                          data-account-confirm-group={acct.user}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}
                        >
                          <span data-account-confirm-delete={acct.user}>
                            <Button
                              type="warning"
                              disabled={busy}
                              onClick={() => {
                                if (!controlled) setLocalConfirm(null);
                                onDelete(acct.user);
                              }}
                            >
                              {busy ? 'Removing…' : 'Confirm'}
                            </Button>
                          </span>
                          <span data-account-cancel-delete={acct.user}>
                            <Button disabled={busy} onClick={cancelConfirm}>
                              Cancel
                            </Button>
                          </span>
                        </div>
                      ))}
                  </>
                )}
              </div>
            }
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Privileged access status, grants, and audit log (Settings → System)

function formatRemainingTime(secs: number): string {
  const clamped = Math.max(0, Math.floor(secs));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${m}:${String(s).padStart(2, '0')} left`;
}

export function PrivilegedAccessCard() {
  // Status only: the prompts are the shell's (and their signal is refused to apps).
  const state = usePrivilegeState(undefined, { prompts: false });
  const [revoking, setRevoking] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleRevoke = async (appId: string) => {
    setRevoking(appId);
    setErrorMsg('');
    try {
      const ok = await revokePrivilege(appId);
      if (!ok) {
        setErrorMsg(`Failed to lock privileged access for ${appId}.`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? installErrorText(err.message) : `Failed to lock privileged access for ${appId}.`);
    } finally {
      setRevoking((prev) => (prev === appId ? null : prev));
    }
  };

  const recentAudit = (state.audit ?? []).slice(0, 5);

  return (
    <div data-privilege-card="" style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', minWidth: 0 }}>
      <AlertBanner message={errorMsg} dataAttr="data-privilege-error" />
      {!state.active || state.grants.length === 0 ? (
        <Item
          data-privilege-status="locked"
          variant="compact"
          hoverable={false}
          className="st-wrap-item"
          title="Locked — system files outside your home folder are read-only"
          rightContent={
            <Badge
              content="Locked"
              background="var(--mochi-hover)"
              color="var(--mochi-text-muted)"
            />
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
          {state.grants.map((g) => (
            <Item
              key={g.appId}
              data-privilege-grant={g.appId}
              variant="compact"
              hoverable={false}
              className="st-wrap-item"
              title={g.appName || g.appId}
              subtitle={`${g.reason || 'System access'} · ${formatRemainingTime(g.remainingSecs)}`}
              rightContent={
                <Button
                  data-privilege-revoke={g.appId}
                  disabled={revoking === g.appId}
                  onClick={() => void handleRevoke(g.appId)}
                >
                  {revoking === g.appId ? 'Locking…' : 'Lock'}
                </Button>
              }
            />
          ))}
        </div>
      )}

      {recentAudit.length > 0 && (
        <div
          data-privilege-audit=""
          style={{
            ...mochiCardStyle,
            gap: '6px',
            padding: '10px 14px',
          }}
        >
          <div style={fieldLabelStyle}>Recent privileged activity</div>
          <Divider />
          {recentAudit.map((entry) => (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                overflowWrap: 'anywhere',
                ...secondaryText,
              }}
            >
              <span>
                <strong style={{ color: 'var(--mochi-text)' }}>{entry.appId}</strong> · {entry.action}
                {entry.reason ? ` (${entry.reason})` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      <Collapsable
        title="Details"
        data-privilege-details=""
        className="st-compact-collapsable"
        style={{ width: '100%', maxWidth: '100%', minWidth: 0 }}
      >
        <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: 'var(--mochi-text-muted)', lineHeight: 1.45 }}>
          Pyxis uses sudo for this. In Terminal, <code>sudo -l</code> lists the same rules, and{' '}
          <code>/etc/sudoers.d/pyxis</code> holds them. Each unlock lasts 5 minutes for the requesting
          app only and ends when the screen locks or you tap Lock.
        </p>
      </Collapsable>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-app Echo capability viewer & runtime revocation (Settings → System)

export function AppPermissionsCard() {
  const [apps, setApps] = useState<AppPermissionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [revertTicks, setRevertTicks] = useState<Record<string, number>>({});

  useEffect(() => {
    let mounted = true;
    void getAppPermissions()
      .then((list) => {
        if (!mounted) return;
        setApps(list.filter((entry) => entry.declared.length > 0));
      })
      .catch((err) => {
        if (!mounted) return;
        setErrorMsg(err instanceof Error ? installErrorText(err.message) : 'Failed to load app capabilities.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleToggle = async (app: AppPermissionInfo, perm: string) => {
    const key = `${app.id}:${perm}`;
    const isGranted = app.effective.includes(perm);
    setBusyKey(key);
    setErrorMsg('');
    try {
      const updated = await setAppPermission(app.id, perm, !isGranted);
      if (updated) {
        setApps((prev) => prev.map((entry) => (entry.id === app.id ? updated : entry)));
      } else {
        setRevertTicks((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
        setErrorMsg(`Failed to ${isGranted ? 'revoke' : 'grant'} ${perm} for ${app.name || app.id}.`);
      }
    } catch (err) {
      setRevertTicks((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
      setErrorMsg(err instanceof Error ? installErrorText(err.message) : `Failed to update ${perm} for ${app.name || app.id}.`);
    } finally {
      setBusyKey((prev) => (prev === key ? null : prev));
    }
  };

  if (loading) {
    return (
      <div data-app-permissions-card="" style={secondaryText}>
        Loading app capabilities…
      </div>
    );
  }

  if (apps.length === 0) {
    return (
      <div data-app-permissions-card="" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', minWidth: 0 }}>
        <AlertBanner message={errorMsg} dataAttr="data-app-permissions-error" />
        {!errorMsg && <div style={secondaryText}>No installed apps declare Echo capabilities.</div>}
      </div>
    );
  }

  return (
    <div data-app-permissions-card="" style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', minWidth: 0 }}>
      <AlertBanner message={errorMsg} dataAttr="data-app-permissions-error" />
      {apps.map((app) => (
        <div
          key={app.id}
          data-app-permission-row={app.id}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            width: '100%',
            minWidth: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', padding: '0 2px', minWidth: 0 }}>
            <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--mochi-text)', overflowWrap: 'anywhere' }}>{app.name || app.id}</span>
            <span style={{ ...secondaryText, overflowWrap: 'anywhere' }}>{app.id}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
            {app.declared.map((perm) => {
              const granted = app.effective.includes(perm);
              const key = `${app.id}:${perm}`;
              return (
                <Item
                  key={perm}
                  variant="compact"
                  hoverable={false}
                  className="st-wrap-item"
                  title={perm}
                  rightContent={
                    <Toggle
                      key={`${key}:${revertTicks[key] ?? 0}`}
                      value={granted}
                      checked={granted}
                      onContent="On"
                      offContent="Off"
                      disabled={busyKey === key}
                      data-permission-toggle={key}
                      aria-label={`${perm} for ${app.name || app.id}`}
                      onChange={() => void handleToggle(app, perm)}
                    />
                  }
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Display outputs, resolution, scaling & arrangement (Settings → System)

interface DisplayMode {
  width: number;
  height: number;
  refresh_mhz: number;
}

interface DisplayOutput {
  name: string;
  description: string;
  width: number;
  height: number;
  refresh_mhz: number;
  scale: number;
  x: number;
  y: number;
  modes: DisplayMode[];
}

const SCALE_PRESETS = [1, 1.25, 1.5, 2];

export function DisplayCard() {
  const [outputs, setOutputs] = useState<DisplayOutput[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    const load = () => {
      setErrorMsg('');
      echoClient
        .callMethod('evo', EVO_IFACE, 'GetOutputs', {})
        .then((res) => {
          if (!mounted) return;
          const reply = res as { outputs?: DisplayOutput[]; error?: string } | undefined;
          if (reply?.error) {
            setErrorMsg(reply.error);
            return;
          }
          if (Array.isArray(reply?.outputs)) setOutputs(reply.outputs);
          else setErrorMsg('Could not read display outputs.');
        })
        .catch((err) => {
          if (!mounted) return;
          setErrorMsg(err instanceof Error ? installErrorText(err.message) : 'Failed to load display outputs.');
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    };
    load();
    const unsub = echoClient.onSignal(EVO_IFACE, 'OutputsChanged', (data) => {
      const list = (data as { outputs?: DisplayOutput[] } | undefined)?.outputs;
      if (mounted && Array.isArray(list)) setOutputs(list);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  const applyConfig = async (name: string, patch: Record<string, unknown>) => {
    setBusy(name);
    setSavedMsg('');
    setErrorMsg('');
    try {
      const res = (await echoClient.callMethod('evo', EVO_IFACE, 'SetOutputConfig', {
        name,
        ...patch,
      })) as { ok?: boolean; error?: string; outputs?: DisplayOutput[] } | undefined;
      if (res?.error || res?.ok === false) {
        setErrorMsg(res.error || `Failed to update display ${name}.`);
      } else if (Array.isArray(res?.outputs)) {
        setOutputs(res.outputs);
        setSavedMsg(`Saved layout for ${name}`);
      } else {
        setErrorMsg(`Failed to update display ${name}.`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? installErrorText(err.message) : `Failed to update display ${name}.`);
    } finally {
      setBusy((prev) => (prev === name ? null : prev));
    }
  };

  if (loading) {
    return (
      <div data-display-card="" style={secondaryText}>
        Loading display outputs…
      </div>
    );
  }

  if (outputs.length === 0) {
    return (
      <div data-display-card="" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', minWidth: 0 }}>
        <AlertBanner message={errorMsg} dataAttr="data-display-error" />
        {!errorMsg && <div style={secondaryText}>No active display outputs detected.</div>}
      </div>
    );
  }

  return (
    <div data-display-card="" style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', minWidth: 0 }}>
      <AlertBanner message={errorMsg} dataAttr="data-display-error" />
      {savedMsg && (
        <div role="status" data-display-saved="" style={{ ...secondaryText, color: PRIMARY, fontWeight: 600 }}>
          {savedMsg}
        </div>
      )}
      {outputs.map((out) => {
        const currentModeValue = `${out.width}x${out.height}`;
        const modes =
          out.modes && out.modes.length > 0
            ? out.modes
            : [{ width: out.width, height: out.height, refresh_mhz: out.refresh_mhz }];
        return (
          <div
            key={out.name}
            data-display-output={out.name}
            style={mochiCardStyle}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', minWidth: 0 }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--mochi-text)', overflowWrap: 'anywhere' }}>{out.description || out.name}</span>
              <span style={secondaryText}>{out.name}</span>
            </div>
            <Divider />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', minWidth: 0 }}>
              <span style={fieldLabelStyle}>Resolution</span>
              <div style={{ flex: '0 1 240px', width: '100%', minWidth: 0, maxWidth: '100%' }}>
                <Dropdown
                  aria-label={`Resolution for ${out.name}`}
                  data-display-resolution={out.name}
                  value={currentModeValue}
                  disabled={busy === out.name}
                  options={modes.map((m) => {
                    const val = `${m.width}x${m.height}`;
                    const hz = Math.round((m.refresh_mhz || 60000) / 1000);
                    return { value: val, label: `${m.width} × ${m.height} (${hz} Hz)` };
                  })}
                  onChange={(val) => {
                    const [wStr, hStr] = String(val).split('x');
                    const width = Number(wStr);
                    const height = Number(hStr);
                    if (width > 0 && height > 0) {
                      void applyConfig(out.name, { width, height });
                    }
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', minWidth: 0 }}>
              <span style={fieldLabelStyle}>Scale</span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', maxWidth: '100%' }} role="radiogroup" aria-label={`Scale for ${out.name}`}>
                {SCALE_PRESETS.map((scale) => {
                  const active = Math.abs(out.scale - scale) < 0.01;
                  return (
                    <Button
                      key={scale}
                      type={active ? 'blue' : 'normal'}
                      role="radio"
                      aria-checked={active}
                      data-display-scale={`${out.name}:${scale}`}
                      disabled={busy === out.name}
                      onClick={() => void applyConfig(out.name, { scale })}
                    >
                      {Math.round(scale * 100)}%
                    </Button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', minWidth: 0 }}>
              <span style={fieldLabelStyle}>Position (X, Y)</span>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', maxWidth: '100%', minWidth: 0 }}>
                <NumberInput
                  label="X"
                  aria-label={`X offset for ${out.name}`}
                  data-display-x={out.name}
                  value={out.x}
                  step={10}
                  disabled={busy === out.name}
                  onChange={(x) => {
                    if (Number.isFinite(x)) void applyConfig(out.name, { x, y: out.y });
                  }}
                />
                <NumberInput
                  label="Y"
                  aria-label={`Y offset for ${out.name}`}
                  data-display-y={out.name}
                  value={out.y}
                  step={10}
                  disabled={busy === out.name}
                  onChange={(y) => {
                    if (Number.isFinite(y)) void applyConfig(out.name, { x: out.x, y });
                  }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Power, brightness, Do Not Disturb & system reset (Settings → System)

export function PowerBrightnessCard() {
  const [brightness, setBrightness] = useState<number>(80);
  const confirmedBrightnessRef = useRef<number>(80);
  const [backlightSupported, setBacklightSupported] = useState<boolean>(true);
  const [dnd, setDnd] = useState<boolean>(false);
  const [dndRevertKey, setDndRevertKey] = useState(0);
  const [battery, setBattery] = useState<BatteryStatus | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetStatus, setResetStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    void Promise.allSettled([
      getSetting(SETTING_KEYS.brightness),
      getSetting(SETTING_KEYS.dnd),
      getScreenBrightness(),
      getBatteryStatus(),
    ]).then(([brightRes, dndRes, hwRes, batRes]) => {
      if (!mountedRef.current) return;
      const savedBright = brightRes.status === 'fulfilled' ? brightRes.value : null;
      const savedDnd = dndRes.status === 'fulfilled' ? dndRes.value : null;
      const hwBright = hwRes.status === 'fulfilled' ? hwRes.value : null;
      const bat = batRes.status === 'fulfilled' ? batRes.value : null;

      if (typeof hwBright?.brightness === 'number') {
        confirmedBrightnessRef.current = hwBright.brightness;
        setBrightness(hwBright.brightness);
        setBacklightSupported(hwBright.supported);
      } else {
        if (hwBright) setBacklightSupported(hwBright.supported);
        if (typeof savedBright === 'number') {
          confirmedBrightnessRef.current = savedBright;
          setBrightness(savedBright);
        }
      }
      if (typeof savedDnd === 'boolean') setDnd(savedDnd);
      if (bat) setBattery(bat);
      if (hwRes.status === 'rejected' || brightRes.status === 'rejected') {
        setErrorMsg('Failed to load power and brightness preferences.');
      }
    });

    const offSettings = onSettingChange(({ key, value }) => {
      if (!mountedRef.current) return;
      if (key === SETTING_KEYS.brightness && typeof value === 'number') {
        confirmedBrightnessRef.current = value;
        setBrightness(value);
      }
      if (key === SETTING_KEYS.dnd && typeof value === 'boolean') setDnd(value);
    });
    return () => {
      mountedRef.current = false;
      offSettings();
    };
  }, []);

  useEffect(() => {
    if (!confirmReset) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setConfirmReset(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [confirmReset]);

  const handleBrightness = async (next: number) => {
    const prev = confirmedBrightnessRef.current;
    setBrightness(next);
    setErrorMsg('');
    try {
      const [, hwRes] = await Promise.all([
        setSetting(SETTING_KEYS.brightness, next),
        setScreenBrightness(next),
      ]);
      if (!mountedRef.current) return;
      if (typeof hwRes.supported === 'boolean') setBacklightSupported(hwRes.supported);
      if (!hwRes.success && hwRes.supported !== false) {
        setBrightness(prev);
        setErrorMsg('Failed to update screen brightness.');
        return;
      }
      const resolved = typeof hwRes.brightness === 'number' ? hwRes.brightness : next;
      confirmedBrightnessRef.current = resolved;
      setBrightness(resolved);
    } catch (err) {
      if (!mountedRef.current) return;
      setBrightness(prev);
      setErrorMsg(err instanceof Error ? installErrorText(err.message) : 'Failed to update screen brightness.');
    }
  };

  const toggleDnd = async () => {
    const prev = dnd;
    const next = !prev;
    setDnd(next);
    setErrorMsg('');
    try {
      await setSetting(SETTING_KEYS.dnd, next);
    } catch (err) {
      if (!mountedRef.current) return;
      setDnd(prev);
      setDndRevertKey((k) => k + 1);
      setErrorMsg(err instanceof Error ? installErrorText(err.message) : 'Failed to update Do Not Disturb.');
    }
  };

  const handleReset = async () => {
    if (resetting) return;
    setResetting(true);
    setResetStatus('');
    setErrorMsg('');
    try {
      const res = (await echoClient.callMethod('settings', 'org.geckoOS.settings', 'reset', {})) as
        | { success?: boolean; error?: string }
        | undefined;
      if (!mountedRef.current) return;
      if (res?.error || res?.success === false) {
        setConfirmReset(false);
        setErrorMsg(res.error || 'Failed to reset preferences.');
        return;
      }
      setConfirmReset(false);
      setResetStatus('System preferences restored to defaults.');
      const [brightRes, dndRes] = await Promise.allSettled([
        getSetting(SETTING_KEYS.brightness),
        getSetting(SETTING_KEYS.dnd),
      ]);
      if (!mountedRef.current) return;
      const defaultBright =
        brightRes.status === 'fulfilled' && typeof brightRes.value === 'number' ? brightRes.value : 80;
      const defaultDnd = dndRes.status === 'fulfilled' && typeof dndRes.value === 'boolean' ? dndRes.value : false;
      confirmedBrightnessRef.current = defaultBright;
      setBrightness(defaultBright);
      setDnd(defaultDnd);
      setDndRevertKey((k) => k + 1);
      void setScreenBrightness(defaultBright).catch(() => {});
    } catch (err) {
      if (!mountedRef.current) return;
      setConfirmReset(false);
      setErrorMsg(err instanceof Error ? installErrorText(err.message) : 'Failed to reset preferences.');
    } finally {
      if (mountedRef.current) setResetting(false);
    }
  };

  const batteryText = battery
    ? battery.present && typeof battery.level === 'number'
      ? `${battery.charging ? 'Charging' : 'On battery'} · ${battery.level}%`
      : 'AC power (no battery detected)'
    : 'Checking power source…';

  return (
    <div data-power-brightness-card="" style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', minWidth: 0 }}>
      <div style={{ ...mochiCardStyle, gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--mochi-text)' }}>Screen brightness</span>
          <span style={{ ...secondaryText, fontWeight: 600 }}>{brightness}%</span>
        </div>
        <div className="st-slider-compact">
          <Slider
            width="100%"
            min={5}
            max={100}
            step={1}
            value={brightness}
            aria-label="Screen brightness"
            data-system-brightness=""
            onChange={(next) => void handleBrightness(next)}
          />
        </div>
        {!backlightSupported && (
          <div style={secondaryText}>
            Virtual display detected: preference saved (hardware backlight unavailable).
          </div>
        )}
      </div>

      <Item
        variant="compact"
        hoverable={false}
        className="st-wrap-item"
        title="Do Not Disturb"
        subtitle="Silence pop-up notifications while working."
        rightContent={
          <Toggle
            key={dndRevertKey}
            value={dnd}
            checked={dnd}
            onContent="On"
            offContent="Off"
            aria-label="Do Not Disturb"
            data-system-dnd=""
            onChange={() => void toggleDnd()}
          />
        }
      />

      <Item
        data-system-battery=""
        variant="compact"
        hoverable={false}
        className="st-wrap-item"
        title="Power source"
        rightContent={<span style={{ fontWeight: 600, color: 'var(--mochi-text)' }}>{batteryText}</span>}
      />

      <Item
        variant="compact"
        hoverable={false}
        className="st-wrap-item"
        title="Reset settings"
        subtitle="Restore all system settings to factory defaults."
        rightContent={
          !confirmReset ? (
            <Button
              data-system-reset-settings=""
              onClick={() => {
                setResetStatus('');
                setErrorMsg('');
                setConfirmReset(true);
              }}
            >
              Reset Settings
            </Button>
          ) : (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '100%' }}>
              <Button
                type="warning"
                disabled={resetting}
                data-system-reset-confirm=""
                onClick={() => void handleReset()}
              >
                {resetting ? 'Resetting…' : 'Confirm Reset'}
              </Button>
              <Button disabled={resetting} data-system-reset-cancel="" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
            </div>
          )
        }
      />
      {resetStatus && (
        <div role="status" data-system-reset-status="" style={{ ...secondaryText, color: PRIMARY, fontWeight: 600 }}>
          {resetStatus}
        </div>
      )}
      <AlertBanner message={errorMsg} dataAttr="data-power-error" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Interactive Wi-Fi, interfaces, DNS & hostname configuration (Settings → Network)

export function NetworkConfigCard() {
  const [interfaces, setInterfaces] = useState<NetworkInterfaceInfo[]>([]);
  const [gateway, setGateway] = useState('');
  const [dnsInput, setDnsInput] = useState('');
  const [hostnameInput, setHostnameInput] = useState('');
  const [wifiList, setWifiList] = useState<WifiNetworkInfo[]>([]);
  const [wirelessAvailable, setWirelessAvailable] = useState(false);
  const [selectedSsid, setSelectedSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [dnsInvalid, setDnsInvalid] = useState(false);
  const [hostnameInvalid, setHostnameInvalid] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [ifaces, details, scan, sysInfo] = await Promise.all([
        getNetworkInterfaces(),
        getNetworkDetails(),
        scanWifi(),
        echoClient.callMethod('system', 'org.geckoOS.system', 'getInfo', {}).catch(() => null) as Promise<{
          hostname?: string;
        } | null>,
      ]);
      if (!mountedRef.current) return;
      setInterfaces(ifaces);
      setGateway(details.gateway);
      setDnsInput(details.dns.join(', '));
      if (sysInfo?.hostname) setHostnameInput(sysInfo.hostname);
      setWifiList(scan.networks);
      setWirelessAvailable(scan.wirelessAvailable);
    } catch (err) {
      if (!mountedRef.current) return;
      setErrorMsg(err instanceof Error ? installErrorText(err.message) : 'Failed to load network configuration.');
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  const handleScan = async () => {
    setBusy(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      const scan = await scanWifi();
      if (!mountedRef.current) return;
      setWifiList(scan.networks);
      setWirelessAvailable(scan.wirelessAvailable);
      setStatusMsg(scan.wirelessAvailable ? `Found ${scan.networks.length} wireless networks` : 'No Wi-Fi adapter detected');
    } catch (err) {
      if (!mountedRef.current) return;
      setErrorMsg(err instanceof Error ? installErrorText(err.message) : 'Failed to scan Wi-Fi networks.');
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const handleConnect = async () => {
    if (!selectedSsid.trim() || busy) return;
    setBusy(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      const res = await connectWifi(selectedSsid.trim(), wifiPassword);
      if (!mountedRef.current) return;
      if (res.success) {
        setStatusMsg(res.message || `Saved Wi-Fi profile for ${selectedSsid}`);
        setWifiPassword('');
        await refresh();
      } else {
        setErrorMsg(res.message || 'Failed to join Wi-Fi.');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setErrorMsg(err instanceof Error ? installErrorText(err.message) : 'Failed to join Wi-Fi.');
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      const res = await disconnectWifi();
      if (!mountedRef.current) return;
      if (res.success) {
        setStatusMsg('Disconnected wireless session');
        await refresh();
      } else {
        setErrorMsg('Failed to disconnect wireless session.');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setErrorMsg(err instanceof Error ? installErrorText(err.message) : 'Failed to disconnect wireless session.');
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const handleToggleIface = async (iface: NetworkInterfaceInfo) => {
    setBusy(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      const res = await setInterfaceEnabled(iface.name, !iface.isUp);
      if (!mountedRef.current) return;
      if (!res.success) {
        setErrorMsg(`Failed to ${iface.isUp ? 'disable' : 'enable'} ${iface.name}.`);
        return;
      }
      setStatusMsg(`${iface.name} ${iface.isUp ? 'disabled' : 'enabled'}.`);
      await refresh();
    } catch (err) {
      if (!mountedRef.current) return;
      setErrorMsg(err instanceof Error ? installErrorText(err.message) : `Failed to toggle ${iface.name}.`);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const handleSaveDns = async () => {
    if (busy) return;
    const { servers, error } = validateDnsInput(dnsInput);
    if (error) {
      setDnsInvalid(true);
      setStatusMsg('');
      setErrorMsg(error);
      return;
    }
    setDnsInvalid(false);
    setBusy(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      const res = await setNetworkDns(servers);
      if (!mountedRef.current) return;
      if (res.success) {
        setStatusMsg(`DNS updated (${servers.join(', ')})`);
      } else {
        setErrorMsg('Failed to update DNS nameservers.');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setErrorMsg(err instanceof Error ? installErrorText(err.message) : 'Invalid DNS address.');
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const handleSaveHostname = async () => {
    if (busy) return;
    const { hostname, error } = validateHostname(hostnameInput);
    if (error) {
      setHostnameInvalid(true);
      setStatusMsg('');
      setErrorMsg(error);
      return;
    }
    setHostnameInvalid(false);
    setBusy(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      const res = await setSystemHostname(hostname);
      if (!mountedRef.current) return;
      if (res.success) {
        setHostnameInput(res.hostname || hostname);
        setStatusMsg(`Hostname set to ${res.hostname || hostname}`);
      } else {
        setErrorMsg('Failed to update hostname.');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setErrorMsg(err instanceof Error ? installErrorText(err.message) : 'Invalid hostname.');
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  return (
    <div data-network-config="" style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', minWidth: 0 }}>
      <div
        data-network-wifi=""
        style={mochiCardStyle}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', minWidth: 0 }}>
          <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--mochi-text)' }}>Wi-Fi networks</span>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <Button data-wifi-scan="" disabled={busy} onClick={() => void handleScan()}>
              Scan
            </Button>
            <Button data-wifi-disconnect="" disabled={busy} onClick={() => void handleDisconnect()}>
              Disconnect
            </Button>
          </div>
        </div>
        <Divider />
        {!wirelessAvailable && wifiList.length === 0 ? (
          <div style={secondaryText}>No wireless interface available on this device.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
            {wifiList.map((net) => {
              const active = selectedSsid === net.ssid;
              return (
                <Item
                  key={net.ssid}
                  variant="compact"
                  hoverable
                  selected={active}
                  className="st-wrap-item"
                  data-wifi-network={net.ssid}
                  title={net.ssid}
                  rightContent={
                    <span style={secondaryText}>
                      {net.security} · {net.signal}%{net.connected ? ' · Active' : ''}
                    </span>
                  }
                  onClick={() => setSelectedSsid(net.ssid)}
                />
              );
            })}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px', minWidth: 0 }}>
              <Input
                type="text"
                placeholder="SSID"
                aria-label="Wi-Fi network name"
                data-wifi-ssid-input=""
                value={selectedSsid}
                onChange={(e) => setSelectedSsid(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && selectedSsid.trim()) {
                    e.preventDefault();
                    void handleConnect();
                  }
                }}
                style={{ ...compactInputStyle, flex: '1 1 130px' }}
              />
              <Input
                type="password"
                placeholder="Passphrase"
                aria-label="Wi-Fi passphrase"
                data-wifi-password=""
                value={wifiPassword}
                onChange={(e) => setWifiPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleConnect();
                  }
                }}
                style={{ ...compactInputStyle, flex: '1 1 130px' }}
              />
              <Button data-wifi-connect="" disabled={busy || !selectedSsid.trim()} onClick={() => void handleConnect()}>
                Join
              </Button>
            </div>
          </div>
        )}
      </div>

      <div
        data-network-interfaces=""
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          width: '100%',
          minWidth: 0,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '6px', padding: '0 2px', minWidth: 0 }}>
          <span style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--mochi-text)' }}>Interfaces</span>
          {gateway && <span style={secondaryText}>Gateway: {gateway}</span>}
        </div>
        {interfaces.length === 0 ? (
          <div style={secondaryText}>No interfaces reported.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
            {interfaces.map((iface) => (
              <Item
                key={iface.name}
                data-net-iface={iface.name}
                variant="compact"
                hoverable={false}
                className="st-wrap-item"
                title={`${iface.name} (${iface.type})`}
                subtitle={`${iface.ipv4 || 'No IPv4'} · ${iface.macAddress || 'virtual'} · ${iface.isUp ? 'Up' : 'Down'}`}
                rightContent={
                  iface.name !== 'lo' ? (
                    <Button
                      data-net-iface-toggle={iface.name}
                      aria-label={`${iface.isUp ? 'Disable' : 'Enable'} ${iface.name}`}
                      disabled={busy}
                      onClick={() => void handleToggleIface(iface)}
                    >
                      {iface.isUp ? 'Disable' : 'Enable'}
                    </Button>
                  ) : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      <div
        data-network-dns-hostname=""
        style={mochiCardStyle}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
          <span style={fieldLabelStyle}>DNS NAMESERVERS</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
            <Input
              type="text"
              aria-label="DNS nameservers"
              aria-invalid={dnsInvalid || undefined}
              data-net-dns-input=""
              value={dnsInput}
              placeholder="1.1.1.1, 8.8.8.8"
              onChange={(e) => {
                setDnsInput(e.target.value);
                if (dnsInvalid) setDnsInvalid(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSaveDns();
                }
              }}
              style={{
                ...compactInputStyle,
                flex: '1 1 160px',
                minWidth: 0,
                ...(dnsInvalid ? { borderColor: 'var(--mochi-error)' } : {}),
              }}
            />
            <Button data-net-dns-save="" disabled={busy} onClick={() => void handleSaveDns()}>
              Save DNS
            </Button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
          <span style={fieldLabelStyle}>DEVICE HOSTNAME</span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
            <Input
              type="text"
              aria-label="Device hostname"
              aria-invalid={hostnameInvalid || undefined}
              data-net-hostname-input=""
              value={hostnameInput}
              placeholder="pyxis"
              onChange={(e) => {
                setHostnameInput(e.target.value);
                if (hostnameInvalid) setHostnameInvalid(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSaveHostname();
                }
              }}
              style={{
                ...compactInputStyle,
                flex: '1 1 160px',
                minWidth: 0,
                ...(hostnameInvalid ? { borderColor: 'var(--mochi-error)' } : {}),
              }}
            />
            <Button data-net-hostname-save="" disabled={busy} onClick={() => void handleSaveHostname()}>
              Save Hostname
            </Button>
          </div>
        </div>
      </div>

      {statusMsg && (
        <div role="status" data-net-config-status="" style={{ ...secondaryText, color: PRIMARY, fontWeight: 600 }}>
          {statusMsg}
        </div>
      )}
      <AlertBanner message={errorMsg} dataAttr="data-net-config-error" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Storage partitions & Echo service diagnostics (Settings → About)

export function SystemDiagnosticsCard() {
  const [partitions, setPartitions] = useState<StoragePartition[]>([]);
  const [services, setServices] = useState<SystemServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [storage, svcs] = await Promise.all([getStorageInfo(), listSystemServices()]);
      if (!mountedRef.current) return;
      setPartitions(storage);
      setServices(svcs);
    } catch (err) {
      if (!mountedRef.current) return;
      setErrorMsg(err instanceof Error ? installErrorText(err.message) : 'Failed to load storage and service diagnostics.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  if (loading && partitions.length === 0 && services.length === 0 && !errorMsg) {
    return (
      <div data-diagnostics-card="" style={secondaryText}>
        Checking storage and services…
      </div>
    );
  }

  return (
    <div data-diagnostics-card="" style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <span style={fieldLabelStyle}>STORAGE &amp; SERVICES</span>
        <Button data-diagnostics-refresh="" disabled={loading} onClick={() => void load()}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      <AlertBanner message={errorMsg} dataAttr="data-diagnostics-error" />
      {partitions.map((part) => {
        const pct = part.total > 0 ? Math.round((part.used / part.total) * 100) : 0;
        return (
          <div
            key={part.mountPoint}
            data-storage-mount={part.mountPoint}
            style={{
              ...mochiCardStyle,
              gap: '6px',
              padding: '10px 14px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px', fontSize: '0.82rem', minWidth: 0 }}>
              <span style={{ fontWeight: 600, color: 'var(--mochi-text)', overflowWrap: 'anywhere' }}>
                {part.mountPoint} ({part.device})
              </span>
              <span style={secondaryText}>
                {formatBytes(part.used)} / {formatBytes(part.total)} · {formatBytes(part.available)} free
              </span>
            </div>
            <ProgressBar value={Math.min(100, pct)} width="100%" height="6px" />
          </div>
        );
      })}

      {services.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', minWidth: 0 }}>
          <div style={{ ...fieldLabelStyle, padding: '2px 2px 0' }}>ECHO SERVICES ({services.length})</div>
          {services.map((svc) => (
            <Item
              key={svc.destination || svc.name}
              data-service-status={svc.name}
              variant="compact"
              hoverable={false}
              className="st-wrap-item"
              title={svc.name}
              subtitle={svc.kind}
              rightContent={
                <Badge
                  content={svc.reachable ? 'Online' : 'Offline'}
                  background={
                    svc.reachable
                      ? 'color-mix(in srgb, var(--mochi-success) 15%, transparent)'
                      : 'color-mix(in srgb, var(--mochi-error) 15%, transparent)'
                  }
                  color={svc.reachable ? 'var(--mochi-success)' : 'var(--mochi-error)'}
                />
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}


import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Collapsable,
  Divider,
  Item,
  List,
  ListHeader,
  ProgressBar,
  Spinner,
  Subheader,
  Wizard,
} from 'remochi';
import {
  AlertTriangle,
  CheckCircle2,
  Package,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import {
  useEcho,
  useInstaller,
  type InstallPhase,
  type InstallProgress,
  type PackageInfo,
} from '@pyxis/app-sdk';

export interface InstallerAppProps {
  windowId: string;
  onClose?: () => void;
}

/** Ordered install phases, used to drive the progress bar. */
const PHASE_ORDER: InstallPhase[] = ['verifying', 'installing', 'registering', 'done'];

const PHASE_LABEL: Record<InstallPhase, string> = {
  idle: 'Ready',
  verifying: 'Verifying package',
  installing: 'Installing',
  registering: 'Registering with launcher',
  done: 'Installed',
  failed: 'Failed',
};

/**
 * Permissions that grant real capability at the bridge today. The rest are
 * recorded by Nova but enforce nothing yet (deny-by-default), so flagging
 * only the enforceable ones keeps the review step honest rather than
 * implying guarantees the platform does not make. Kept in lockstep with
 * `nova::appinfo_permission_to_capability`.
 */
const ENFORCED_PERMISSIONS = new Set([
  'filesystem.read',
  'filesystem.write',
  'notifications',
]);

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Is this install an upgrade, downgrade, or reinstall of what is already
 * present? Drives the confirm copy and whether opkg needs
 * `--force-reinstall` (which it does for same-version installs).
 */
function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.\-+]/).map((n) => parseInt(n, 10) || 0);
  const pb = b.split(/[.\-+]/).map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 };
const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 12 };

/**
 * The install step's body. Kicks the install off when it mounts — the
 * Wizard renders only the active step's content, so mounting *is* the
 * "user arrived at this step" signal. Doing it here rather than in the
 * previous step's `onNext` keeps the await off the Next button, so the
 * user watches live progress instead of a frozen Review screen.
 */
const InstallStep: React.FC<{
  pkg: PackageInfo | null;
  force: boolean;
  progress: InstallProgress;
  installError: string | null;
  onStart: (pkg: PackageInfo, force: boolean) => Promise<unknown>;
}> = ({ pkg, force, progress, installError, onStart }) => {
  // StrictMode double-invokes mount effects in dev; without this guard that
  // would fire two concurrent opkg runs for one user action.
  const started = useRef(false);

  useEffect(() => {
    if (!pkg || started.current) return;
    started.current = true;
    void onStart(pkg, force);
  }, [pkg, force, onStart]);

  const phaseIndex = PHASE_ORDER.indexOf(progress.phase);
  const percent =
    progress.phase === 'failed'
      ? 100
      : phaseIndex < 0
        ? 0
        : ((phaseIndex + 1) / PHASE_ORDER.length) * 100;
  const busy = progress.phase !== 'failed' && progress.phase !== 'done';

  return (
    <div style={col}>
      <Subheader content={PHASE_LABEL[progress.phase]} />
      <ProgressBar value={percent} color={progress.phase === 'failed' ? 'red' : 'blue'} />
      <div style={{ minHeight: 22, fontSize: 13, opacity: 0.8 }}>
        {progress.message || 'Waiting to start…'}
      </div>

      {busy && pkg && (
        <div style={row}>
          <Spinner />
          <span style={{ fontSize: 13, opacity: 0.7 }}>
            Installing {pkg.title ?? pkg.package}…
          </span>
        </div>
      )}

      {progress.phase === 'failed' && (
        <div style={{ ...row, alignItems: 'flex-start', color: '#b3261e', fontSize: 13 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontWeight: 600 }}>Installation failed</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {installError ?? progress.message}
            </div>
            <div style={{ opacity: 0.75, marginTop: 6 }}>
              Go Back to pick a different package, or fix the issue and retry.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * InstallerApp — Mochi-styled `.ipk` installer.
 *
 * A thin frontend over the `org.geckoOS.installer` Echo service (see
 * `echo/src/services/installer.rs`): discovery, metadata, and opkg-backed
 * installation all happen daemon-side. This app never shells out itself —
 * it has no way to; it is an ordinary sandboxed web app whose only channel
 * to the system is Echo. The service refreshes Nova's registry after a
 * successful install, which is what makes the app immediately launchable
 * from the final step.
 */
export const InstallerApp: React.FC<InstallerAppProps> = ({ onClose }) => {
  const {
    packages,
    loading,
    error,
    progress,
    result,
    installError,
    refresh,
    install,
    reset,
  } = useInstaller();
  const { launchApp } = useEcho();
  const [selected, setSelected] = useState<PackageInfo | null>(null);
  const [launched, setLaunched] = useState(false);
  // Bumped on "Install another" so the install step remounts (and so
  // re-runs its start-on-mount effect) for the next package.
  const [runId, setRunId] = useState(0);

  const upgradeKind = useMemo(() => {
    if (!selected?.installed || !selected.installedVersion) return null;
    const cmp = compareVersions(selected.version, selected.installedVersion);
    if (cmp > 0) return 'upgrade' as const;
    if (cmp < 0) return 'downgrade' as const;
    return 'reinstall' as const;
  }, [selected]);

  const handleLaunch = useCallback(async () => {
    if (!result) return;
    const res = await launchApp(result.package);
    if (res) setLaunched(true);
  }, [result, launchApp]);

  const startOver = useCallback(() => {
    setSelected(null);
    setLaunched(false);
    reset();
    setRunId((n) => n + 1);
    void refresh();
  }, [reset, refresh]);

  const onStart = useCallback(
    (pkg: PackageInfo, force: boolean) => install(pkg, force),
    [install]
  );

  // ---- Step 1: choose a package ----
  const chooseStep = (
    <div style={col}>
      <div style={{ ...row, justifyContent: 'space-between' }}>
        <Subheader
          content={
            loading
              ? 'Scanning for packages…'
              : `${packages.length} package${packages.length === 1 ? '' : 's'} found`
          }
        />
        <Button variant="normal" disabled={loading} onClick={() => void refresh()}>
          <span style={{ ...row, gap: 6 }}>
            <RefreshCw size={14} />
            Rescan
          </span>
        </Button>
      </div>

      {loading && <Spinner />}

      {error && (
        <div style={{ ...row, color: '#b3261e', fontSize: 13 }}>
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && packages.length === 0 && (
        <div style={{ opacity: 0.7, lineHeight: 1.6, fontSize: 13 }}>
          <p>
            No <code>.ipk</code> packages found.
          </p>
          <p>
            Copy one to <code>/var/lib/pyxis/incoming</code>, <code>/tmp</code>, or a
            mounted volume under <code>/media</code>, then rescan.
          </p>
        </div>
      )}

      {packages.length > 0 && (
        <List>
          <ListHeader>Available packages</ListHeader>
          {packages.map((pkg) => (
            <Item
              key={pkg.path}
              selected={selected?.path === pkg.path}
              onClick={() => setSelected(pkg)}
            >
              <div style={{ ...row, width: '100%' }}>
                <Package size={18} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>
                    {pkg.title ?? pkg.package}{' '}
                    <span style={{ opacity: 0.6, fontWeight: 400 }}>{pkg.version}</span>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      opacity: 0.7,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {pkg.description || pkg.package}
                  </div>
                </div>
                <Badge content={pkg.architecture} />
                {pkg.installed && <Badge content={`installed ${pkg.installedVersion}`} />}
              </div>
            </Item>
          ))}
        </List>
      )}
    </div>
  );

  // ---- Step 2: review ----
  const reviewStep = selected ? (
    <div style={{ ...col, gap: 10 }}>
      <div style={{ ...row, gap: 10 }}>
        <Package size={22} />
        <div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>
            {selected.title ?? selected.package}
          </div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>
            {selected.vendor ?? selected.maintainer}
          </div>
        </div>
      </div>

      <Divider />

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'max-content 1fr',
          gap: '6px 16px',
          margin: 0,
          fontSize: 13,
        }}
      >
        <dt style={{ opacity: 0.65 }}>Package</dt>
        <dd style={{ margin: 0 }}>
          <code>{selected.package}</code>
        </dd>
        <dt style={{ opacity: 0.65 }}>Version</dt>
        <dd style={{ margin: 0 }}>
          {selected.version}
          {upgradeKind && (
            <span style={{ opacity: 0.7 }}>
              {' '}
              ({upgradeKind} from {selected.installedVersion})
            </span>
          )}
        </dd>
        <dt style={{ opacity: 0.65 }}>Architecture</dt>
        <dd style={{ margin: 0 }}>{selected.architecture}</dd>
        <dt style={{ opacity: 0.65 }}>Type</dt>
        <dd style={{ margin: 0 }}>{selected.appType ?? 'package'}</dd>
        <dt style={{ opacity: 0.65 }}>Size</dt>
        <dd style={{ margin: 0 }}>{formatSize(selected.installedSize)}</dd>
        <dt style={{ opacity: 0.65 }}>Source</dt>
        <dd style={{ margin: 0, wordBreak: 'break-all' }}>
          <code>{selected.path}</code>
        </dd>
      </dl>

      <Divider />

      <div>
        <Subheader content="Requested permissions" />
        {selected.requiredPermissions.length === 0 ? (
          <div style={{ opacity: 0.7, fontSize: 13 }}>None requested.</div>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {selected.requiredPermissions.map((p) => (
                <Badge key={p} content={p} />
              ))}
            </div>
            {selected.requiredPermissions.some((p) => !ENFORCED_PERMISSIONS.has(p)) && (
              <div
                style={{
                  ...row,
                  alignItems: 'flex-start',
                  marginTop: 10,
                  fontSize: 12,
                  opacity: 0.8,
                }}
              >
                <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  Some requested permissions have no enforcement point yet and grant
                  nothing at runtime. They are recorded for the app registry only.
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {upgradeKind === 'downgrade' && (
        <div style={{ ...row, alignItems: 'flex-start', color: '#b26a00', fontSize: 13 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span>
            This installs an older version than the one already present. App data is
            not migrated backwards.
          </span>
        </div>
      )}
    </div>
  ) : (
    <div style={{ opacity: 0.7 }}>Select a package on the previous step.</div>
  );

  // ---- Step 4: done ----
  const doneStep = result ? (
    <div style={col}>
      <div style={{ ...row, gap: 10 }}>
        <CheckCircle2 size={22} color="#2e7d32" />
        <div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>
            {result.title ?? result.package} installed
          </div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>
            Version {result.version} · {result.registeredApps} apps registered
          </div>
        </div>
      </div>

      {!result.launchable && (
        <div style={{ ...row, alignItems: 'flex-start', fontSize: 13, opacity: 0.85 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span>
            Installed, but the launcher has not registered it as a launchable app. It
            may be a library or service package.
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {result.launchable && (
          <Button variant="affirmative" disabled={launched} onClick={() => void handleLaunch()}>
            {launched ? 'Launched' : `Open ${result.title ?? result.package}`}
          </Button>
        )}
        <Button variant="normal" onClick={startOver}>
          Install another
        </Button>
      </div>

      {result.log && (
        <div style={{ marginTop: 12 }}>
          <Collapsable title="Installation log" defaultExpanded={false}>
            <pre
              style={{
                fontSize: 11,
                lineHeight: 1.45,
                whiteSpace: 'pre-wrap',
                background: 'rgba(0,0,0,0.05)',
                padding: 10,
                borderRadius: 6,
                marginTop: 8,
                maxHeight: 160,
                overflow: 'auto',
              }}
            >
              {result.log}
            </pre>
          </Collapsable>
        </div>
      )}
    </div>
  ) : (
    <div style={{ opacity: 0.7 }}>Nothing installed yet.</div>
  );

  const steps = [
    {
      label: 'Choose',
      title: 'Choose a package',
      description: 'Select an .ipk package to install.',
      content: chooseStep,
      // Returning false is the Wizard's "block advancing" signal.
      onNext: () => selected !== null,
    },
    {
      label: 'Review',
      title: 'Review details',
      description: 'Check what this package is and what it asks for.',
      content: reviewStep,
      onNext: () => selected !== null,
    },
    {
      label: 'Install',
      title: 'Installing',
      description: 'Running opkg and refreshing the app registry.',
      content: (
        <InstallStep
          key={runId}
          pkg={selected}
          force={upgradeKind === 'reinstall'}
          progress={progress}
          installError={installError}
          onStart={onStart}
        />
      ),
      // Hold the user here until the install actually finishes; a failure
      // never advances to a "complete" screen.
      onNext: () => progress.phase === 'done',
    },
    {
      label: 'Done',
      title: 'Installation complete',
      content: doneStep,
    },
  ];

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: 16,
        overflow: 'auto',
      }}
    >
      <Wizard steps={steps} showStepNumbers onComplete={onClose} onCancel={onClose} />
    </div>
  );
};

export default InstallerApp;

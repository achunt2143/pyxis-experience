import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowBigUpDash } from 'lucide-react';
import { AnimatePresence, motion, useIsPresent } from 'framer-motion';
import {
  authenticatePrivilege,
  dismissPrivilegePrompt,
  type PrivilegePromptRequest,
} from '@pyxis/app-sdk';
import { appById } from '../apps/registry';
import { useApps } from '../hooks/useApps';
import { getActiveLockPhase, subscribeActiveLockPhase } from '../lock/lockUi';
import { useMotion } from '../useMotion';
import { PANEL_ENTER, PANEL_REST, SCRIM_IN, SCRIM_OUT, TRANSITION } from '../motion';
import { Divider, Input as RemochiInput } from 'remochi';
import { AppDropIcon } from './AppDropIcon';
import {
  ShellPill,
  getFocusableElements,
  isTopModalLayer,
  registerModalLayer,
  unregisterModalLayer,
} from './ShellDialog';

export const PRIVILEGE_DIALOG_Z_INDEX = 1450;

// remochi's Input is a styled input, which passes a ref through to the
// <input>; its type says only ComponentType, so say so here.
const Input = RemochiInput as unknown as React.ForwardRefExoticComponent<
  React.InputHTMLAttributes<HTMLInputElement> & React.RefAttributes<HTMLInputElement>
>;

const SHELL_REQUESTERS = new Set(['bloom', 'bloom-overlay']);

// eslint-disable-next-line react-refresh/only-export-components
export const PrivilegeLockContext = createContext(false);

export interface PrivilegePromptDialogProps {
  request: PrivilegePromptRequest | null;
  onDismiss?: () => void;
  onAuthenticated?: () => void;
  suppressed?: boolean;
}

function formatDurationPhrase(durationSecs?: number): string {
  const secs = durationSecs && durationSecs > 0 ? durationSecs : 300;
  const mins = Math.max(1, Math.round(secs / 60));
  return `${mins} ${mins === 1 ? 'minute' : 'minutes'}`;
}

function formatWaitCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface ActionCopy {
  title: string;
  sentence: React.ReactNode;
}

/**
 * Title and sentence for a request. Filled only from Echo's `details` and the
 * app's trusted name (Nova's), never from `reason` or anything else the app
 * wrote. No action, or `filesystem.system-write`, keeps the original wording.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function describeAction(
  request: Pick<PrivilegePromptRequest, 'action' | 'details'>,
  appName: string,
  durationPhrase: string
): ActionCopy {
  const d = request.details ?? {};
  const app = <strong>{appName}</strong>;
  switch (request.action) {
    case undefined:
    case '':
    case 'filesystem.system-write':
      return {
        title: 'Privileged Access',
        sentence: (
          <>
            {appName} wants to change system files. Enter your password to allow this for{' '}
            {durationPhrase}.
          </>
        ),
      };
    case 'package.install': {
      const what = d.title || d.package;
      return {
        title: 'Install software',
        sentence: (
          <>
            {app} wants to install {what ? <strong>{what}</strong> : 'software'}
            {d.version ? ` ${d.version}` : ''}.
          </>
        ),
      };
    }
    case 'package.remove':
      return {
        title: 'Remove software',
        sentence: (
          <>
            {app} wants to remove {d.package ? <strong>{d.package}</strong> : 'software'}.
          </>
        ),
      };
    case 'network.manage': {
      let what: React.ReactNode;
      if (d.ssid) {
        what = (
          <>
            join the Wi-Fi network <strong>{d.ssid}</strong>
          </>
        );
      } else if (d.dns) {
        what = (
          <>
            change the DNS servers to <strong>{d.dns}</strong>
          </>
        );
      } else if (d.hostname) {
        what = (
          <>
            change the hostname to <strong>{d.hostname}</strong>
          </>
        );
      } else if (d.interface) {
        what = (
          <>
            change the network interface <strong>{d.interface}</strong>
          </>
        );
      } else {
        what = 'change network settings';
      }
      return {
        title: 'Change network settings',
        sentence: (
          <>
            {app} wants to {what}.
          </>
        ),
      };
    }
    case 'accounts.manage':
      return {
        title: 'Manage users',
        sentence: (
          <>
            {app} wants to create or remove the user{' '}
            {d.username ? <strong>{d.username}</strong> : 'account'}.
          </>
        ),
      };
    default:
      return {
        title: 'System change',
        sentence: (
          <>
            {app} wants to make a system change ({request.action}).
          </>
        ),
      };
  }
}

interface PrivilegePromptScrimProps {
  request: PrivilegePromptRequest;
  formRef: React.RefObject<HTMLFormElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  titleId: string;
  bodyId: string;
  appName: string;
  durationPhrase: string;
  password: string;
  submitting: boolean;
  waiting: boolean;
  capsLock: boolean;
  displayedError: string | null;
  attemptsLeft: number | null;
  onPasswordChange: (value: string) => void;
  onSyncCaps: (e: React.KeyboardEvent) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

function PrivilegePromptScrim({
  request,
  formRef,
  inputRef,
  titleId,
  bodyId,
  appName,
  durationPhrase,
  password,
  submitting,
  waiting,
  capsLock,
  displayedError,
  attemptsLeft,
  onPasswordChange,
  onSyncCaps,
  onSubmit,
  onCancel,
}: PrivilegePromptScrimProps) {
  const { tr, to } = useMotion();
  const isPresent = useIsPresent();
  const copy = describeAction(request, appName, durationPhrase);
  const isFileWrite = !request.action || request.action === 'filesystem.system-write';

  return (
    <motion.div
      key="privilege-scrim"
      data-shell-region={isPresent ? '' : undefined}
      data-privilege-scrim=""
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: tr(SCRIM_IN) }}
      exit={{ opacity: 0, transition: tr(SCRIM_OUT) }}
      onClick={(e) => {
        if (isPresent && e.target === e.currentTarget) onCancel();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: PRIVILEGE_DIALOG_Z_INDEX,
        background: 'rgba(8, 10, 24, 0.36)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        pointerEvents: isPresent ? 'auto' : 'none',
      }}
    >
      <motion.form
        ref={formRef}
        onSubmit={onSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        data-privilege-dialog=""
        data-privilege-request-action={request.action}
        className="mochi-dialog"
        initial={to(PANEL_ENTER)}
        animate={{ ...to(PANEL_REST), transition: tr(TRANSITION.open) }}
        exit={{ ...to(PANEL_ENTER), transition: tr(TRANSITION.close) }}
        // remochi shows its card only inside its own open overlay (opacity 0
        // otherwise): this one sits in the shell's scrim, so the resting pose
        // is set here.
        style={{ opacity: 1, y: 0, scale: 1, width: 420 }}
      >
        <div className="mochi-dialog-header" style={{ alignItems: 'center' }}>
          <AppDropIcon appId={request.appId} size={32} />
          <h2 id={titleId} className="mochi-dialog-title">
            {copy.title}
          </h2>
        </div>
        <Divider />

        <div
          className="mochi-dialog-content"
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
        <div
          id={bodyId}
          style={{ display: 'flex', flexDirection: 'column', gap: 8, lineHeight: 1.5 }}
        >
          <p style={{ margin: 0 }}>
            {copy.sentence}
            {isFileWrite ? '' : ' Enter your password to allow this.'}
          </p>
          <p style={{ margin: 0, fontSize: 12.5, opacity: 0.78 }}>
            Pyxis never asks for your password inside an app&apos;s window.
          </p>
          {isFileWrite && (
          <details style={{ fontSize: 12.5, opacity: 0.85 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, userSelect: 'none' }}>
              Details
            </summary>
            <p style={{ margin: '6px 0 0', lineHeight: 1.45 }}>
              Pyxis uses sudo for this. In Terminal, sudo -l lists the same rules, and
              /etc/sudoers.d/pyxis holds them.
            </p>
          </details>
          )}
        </div>

        {/* remochi's field, as in the apps; its border goes red on an error. */}
        <Input
          ref={inputRef}
          className="px-privilege-input"
          type="password"
          aria-label="Password"
          placeholder="Password"
          autoComplete="current-password"
          disabled={submitting}
          value={password}
          onKeyDown={onSyncCaps}
          onKeyUp={onSyncCaps}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onPasswordChange(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            marginRight: 0,
            ...(displayedError ? { borderColor: 'var(--mochi-error, #d34431)' } : {}),
          }}
        />

        {capsLock && (
          <div
            role="status"
            aria-live="polite"
            className="px-privilege-caps"
            data-privilege-caps=""
            style={{
              fontSize: 12,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <ArrowBigUpDash size={14} aria-hidden="true" />
            <span>Caps Lock is on</span>
          </div>
        )}

        {displayedError && (
          <div
            role="alert"
            className="px-privilege-error"
            data-privilege-error=""
            data-privilege-cooldown={waiting ? 'true' : undefined}
            style={{
              fontSize: 12.5,
              fontWeight: 500,
            }}
          >
            {displayedError}
          </div>
        )}

        {attemptsLeft !== null && !waiting && (
          <div
            data-privilege-attempts=""
            style={{
              fontSize: 12,
              opacity: 0.8,
            }}
          >
            {attemptsLeft} {attemptsLeft === 1 ? 'attempt' : 'attempts'} remaining
          </div>
        )}

        </div>

        <div className="mochi-dialog-actions">
          <ShellPill
            kind="secondary"
            data-privilege-action="cancel"
            disabled={submitting}
            onClick={onCancel}
          >
            Cancel
          </ShellPill>
          <ShellPill
            kind="primary"
            type="submit"
            data-privilege-action="unlock"
            disabled={submitting || waiting}
          >
            {submitting ? 'Unlocking…' : 'Unlock'}
          </ShellPill>
        </div>
      </motion.form>
    </motion.div>
  );
}

/**
 * Overlay password prompt for privilege elevation (`org.geckoOS.privilege`).
 * Always rendered in Bloom's overlay above app windows so an app can never
 * read or spoof the user's password inside its own window.
 */
export function PrivilegePromptDialog({
  request,
  onDismiss,
  onAuthenticated,
  suppressed = false,
}: PrivilegePromptDialogProps) {
  const { byId } = useApps();
  const titleId = useId();
  const bodyId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);

  const lockPhase = useSyncExternalStore(subscribeActiveLockPhase, getActiveLockPhase, () => 'off');
  const contextLocked = useContext(PrivilegeLockContext);
  const isLockSuppressed = Boolean(suppressed || contextLocked || lockPhase !== 'off');
  const suppressedRef = useRef(isLockSuppressed);
  useEffect(() => {
    suppressedRef.current = isLockSuppressed;
  }, [isLockSuppressed]);

  const active = Boolean(request) && !isLockSuppressed;

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [retryAtMs, setRetryAtMs] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [capsLock, setCapsLock] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const requestId = request?.requestId ?? null;
  useEffect(() => {
    setPassword('');
    setError(null);
    setSubmitting(false);
    setAttemptsLeft(null);
    setRetryAtMs(null);
    setCapsLock(false);
  }, [requestId]);

  useEffect(() => {
    if (isLockSuppressed) {
      setPassword('');
      setCapsLock(false);
    }
  }, [isLockSuppressed]);

  useEffect(() => {
    if (retryAtMs === null) return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= retryAtMs) {
        setRetryAtMs(null);
        setError(null);
      }
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [retryAtMs]);

  const waiting = retryAtMs !== null && retryAtMs > now;
  const waitSecs = waiting && retryAtMs !== null ? Math.max(0, Math.ceil((retryAtMs - now) / 1000)) : 0;
  const displayedError = waiting ? `Too many attempts. Try again in ${formatWaitCountdown(waitSecs)}` : error;

  const handleCancel = useCallback(async () => {
    if (!active || !request || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const dismissed = await dismissPrivilegePrompt({ requestId: request.requestId, appId: request.appId });
      if (!mountedRef.current) return;
      if (!dismissed) {
        setError('Could not dismiss prompt. Please try again.');
        return;
      }
      onDismiss?.();
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Could not dismiss prompt. Please try again.');
      }
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  }, [active, request, submitting, onDismiss]);

  const cancelRef = useRef(handleCancel);
  useEffect(() => {
    cancelRef.current = handleCancel;
  });

  const syncCaps = useCallback((e: React.KeyboardEvent | KeyboardEvent) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLock(e.getModifierState('CapsLock'));
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const modalKey = registerModalLayer(PRIVILEGE_DIALOG_Z_INDEX);
    const form = formRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);

    const onKeyDown = (e: KeyboardEvent) => {
      syncCaps(e);
      if (!isTopModalLayer(modalKey)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        void cancelRef.current();
      } else if (e.key === 'Tab') {
        const panel = formRef.current;
        if (!panel) return;
        const focusables = getFocusableElements(panel);
        if (focusables.length === 0) return;
        const at = focusables.indexOf(document.activeElement as HTMLElement);
        const next = e.shiftKey
          ? at <= 0
            ? focusables.length - 1
            : at - 1
          : at < 0 || at === focusables.length - 1
            ? 0
            : at + 1;
        e.preventDefault();
        e.stopPropagation();
        focusables[next].focus();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      syncCaps(e);
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      unregisterModalLayer(modalKey);
      if (!suppressedRef.current && previous && previous.isConnected && !form?.contains(previous)) {
        previous.focus();
      }
    };
  }, [active, requestId, syncCaps]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active || !request || submitting || waiting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await authenticatePrivilege({
        password,
        requestId: request.requestId,
        appId: request.appId,
        ...(request.durationSecs ? { durationSecs: request.durationSecs } : {}),
      });
      if (!mountedRef.current) return;
      if (res.ok) {
        setPassword('');
        setAttemptsLeft(null);
        setRetryAtMs(null);
        onAuthenticated?.();
        return;
      }
      const rawAttemptsLeft = (res as { attemptsLeft?: number }).attemptsLeft ?? res.attempts_left;
      const rawRetryAtMs = (res as { retryAtMs?: number | null }).retryAtMs ?? res.retry_at_ms;
      if (typeof rawAttemptsLeft === 'number') {
        setAttemptsLeft(rawAttemptsLeft);
      }
      const current = Date.now();
      if (typeof rawRetryAtMs === 'number' && rawRetryAtMs > current) {
        setNow(current);
        setRetryAtMs(rawRetryAtMs);
        setError(null);
      } else {
        setRetryAtMs(null);
        setError(res.error || 'Incorrect password');
      }
      window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  };

  if (typeof document === 'undefined') return null;
  // Gone at once when the lock comes down: Evo draws the overlay over the
  // lock, so an exit animation would leave the prompt showing on it.
  if (isLockSuppressed) return null;

  // The shell asks as `bloom` (its own root actions go through this dialog
  // too); to the user that is the system, not an app called Bloom.
  const appName = !request
    ? ''
    : SHELL_REQUESTERS.has(request.appId)
      ? 'Pyxis'
      : byId(request.appId)?.name ?? appById(request.appId)?.name ?? request.appName ?? request.appId;
  const durationPhrase = formatDurationPhrase(request?.durationSecs);

  return createPortal(
    <AnimatePresence>
      {active && request && (
        <PrivilegePromptScrim
          key={request.requestId}
          request={request}
          formRef={formRef}
          inputRef={inputRef}
          titleId={titleId}
          bodyId={bodyId}
          appName={appName}
          durationPhrase={durationPhrase}
          password={password}
          submitting={submitting}
          waiting={waiting}
          capsLock={capsLock}
          displayedError={displayedError}
          attemptsLeft={attemptsLeft}
          onPasswordChange={(val) => {
            setPassword(val);
            if (error) setError(null);
          }}
          onSyncCaps={syncCaps}
          onSubmit={handleSubmit}
          onCancel={() => void handleCancel()}
        />
      )}
    </AnimatePresence>,
    document.body
  );
}

export default PrivilegePromptDialog;

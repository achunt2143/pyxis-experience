import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowBigUpDash, Battery, BatteryCharging, BatteryLow, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { Button } from 'remochi';
import {
  DEFAULT_WALLPAPER_ID,
  DynamicWallpaper,
  SETTING_KEYS,
  asBoolean,
  asNumber,
  contrastRatio,
  getSessionState,
  isWallpaperId,
  listAccounts,
  oneOf,
  onUnlockFailed,
  setLockOrigin,
  shellTint,
  skyFor,
  unlock,
  useBatteryStatus,
  useClock,
  useLocation,
  useNetworkStatus,
  useOutputVolume,
  useSetting,
  waterdrop,
  type Account,
  type NotificationEntry,
  type SessionState,
} from '@pyxis/app-sdk';
import { AppDropIcon } from '../components/AppDropIcon';
import { useAppName } from '../hooks/useAppName';
import { layoutBox } from '../overlay/useMinimizeTargets';
import { useMotion } from '../useMotion';
import { lensGradient, supportsMozElement } from './lensClock';
import { LOCK_WALLPAPER_ID, accentOf, bigTime, defaultOrigin } from './lockUi';
import type { Point } from './clearMath';
import {
  WRONG_BURN_MS,
  formatWait,
  initialModel,
  isPrintable,
  reduce,
  stateName,
  waitFraction,
  waitSecondsLeft,
  type LockEvent,
  type LockModel,
} from './lockMachine';
import './LockScreen.css';

/** How many drops the field shows at once; a longer password scrolls (the last ones stay in view). */
const MAX_DOTS = 14;
/** After an accepted try, how long to wait for `LockChanged` before Clear starts anyway. */
const UNLOCK_SIGNAL_GRACE_MS = 1500;
/** The spinner shows at least this long in full motion, so a quick answer doesn't read as a flicker. */
const MIN_VERIFY_MS = 450;

export type LockNotifications = 'hidden' | 'count' | 'full';
const asNotifications = oneOf<LockNotifications>('hidden', 'count', 'full');

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** The wallpaper's palette on screen now (Daylight at the device's clock and place, or a fixed one). */
function useWallpaperPalette() {
  const wallpaper = useSetting<string>(SETTING_KEYS.wallpaper, DEFAULT_WALLPAPER_ID, (raw) =>
    isWallpaperId(raw) ? raw : undefined
  );
  const pinned = useSetting<number | null>(SETTING_KEYS.wallpaperPinnedTime, null, asNumber);
  const clock = useClock();
  const place = useLocation();
  const lat = place?.lat ?? null;
  const lon = place?.lon ?? null;
  const { epochMs, utcOffsetMinutes } = clock;
  const palette = useMemo(
    () =>
      skyFor(wallpaper, {
        nowMs: epochMs,
        utcOffsetMinutes,
        location: lat !== null && lon !== null ? { lat, lon } : null,
        time: pinned,
        daySpeed: 1,
        anchorMs: epochMs,
      }).palette,
    [wallpaper, pinned, epochMs, utcOffsetMinutes, lat, lon]
  );
  return { wallpaper, palette };
}

export interface LockScreenProps {
  /** What Echo says about the session: the user's name and accent, whether a password is set. */
  session: SessionState | null;
  /** The notification store (shown as the `pyxis.lock.notifications` setting says). */
  notifications: readonly NotificationEntry[];
  /** `LockChanged {locked: false}` has arrived: Clear is under way and the screen stops taking input. */
  unlocking: boolean;
  /** The password field's centre, once known, for Clear to open from. */
  onOrigin?: (origin: Point) => void;
}

/**
 * The lock screen: the wallpaper as the hero, a huge thin clock whose digits
 * are lenses, and, once any key or click wakes it, the user's waterdrop and a
 * password field. "Just type": the key that wakes it is the first character
 * of the password.
 *
 * It decides nothing. Evo holds the lock (it draws only the overlay while
 * locked) and Echo checks the password; this page asks `session.unlock` and
 * draws what comes back, and it never sees a way to unlock by itself. The
 * walk through its states is `lockMachine.ts`; Veil and Clear, the lock and
 * unlock motions, are `LockLayer`'s.
 *
 * Selectors for the device suite: `data-lock-screen`,
 * `data-lock-state="rest|awake|verify|wrong|wait|unlocking|ambient|no-password"`,
 * `data-lock-field` (the password field: its centre is Clear's origin) and
 * `data-lock-clock`. Self-contained, so the Duyo port can wrap it as it is.
 */
export const LockScreen: React.FC<LockScreenProps> = ({ session, notifications, unlocking, onOrigin }) => {
  const { mode } = useMotion();
  const { wallpaper, palette } = useWallpaperPalette();
  const clock = useClock();
  const clock24h = useSetting(SETTING_KEYS.clock24h, false, asBoolean);
  const notesMode = useSetting<LockNotifications>(SETTING_KEYS.lockNotifications, 'count', asNotifications);

  // ---- multi-user accounts and active picker selection ----
  const [accounts, setAccounts] = useState<Account[]>([]);
  const sessionUser = session?.user ?? 'geckouser';
  const [picked, setPicked] = useState<{ sessionUser: string; user: string } | null>(null);
  const selectedUser = picked && picked.sessionUser === sessionUser ? picked.user : sessionUser;
  const selectedUserRef = useRef<string>(selectedUser);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  useEffect(() => {
    let mounted = true;
    void listAccounts().then((list) => {
      if (!mounted) return;
      setAccounts(list);
    });
    return () => {
      mounted = false;
    };
  }, [sessionUser, session?.display_name, session?.accent, session?.has_password]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.user === selectedUser) ?? null,
    [accounts, selectedUser]
  );

  // ---- the state machine, with its one effect ----
  const hasPassword = selectedAccount ? selectedAccount.has_password : (session?.has_password ?? true);
  const [model, setModel] = useState<LockModel>(() => initialModel(Date.now(), hasPassword));
  const [capsLock, setCapsLock] = useState(false);
  const modelRef = useRef(model);
  const graceRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const composingRef = useRef(false);
  const pasteHandledRef = useRef(false);
  const pasteFallbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (graceRef.current !== null) {
        window.clearTimeout(graceRef.current);
        graceRef.current = null;
      }
      if (pasteFallbackTimerRef.current !== null) {
        window.clearTimeout(pasteFallbackTimerRef.current);
        pasteFallbackTimerRef.current = null;
      }
    };
  }, []);

  const send = useCallback((event: LockEvent) => {
    const dispatch = (ev: LockEvent) => {
      const step = reduce(modelRef.current, ev);
      modelRef.current = step.model;
      setModel(step.model);
      if (!step.effect) return;
      if (graceRef.current !== null) {
        window.clearTimeout(graceRef.current);
        graceRef.current = null;
      }
      const minimum = new Promise<void>((resolve) => window.setTimeout(resolve, mode === 'full' ? MIN_VERIFY_MS : 0));
      const targetUser =
        selectedUserRef.current && selectedUserRef.current !== sessionUser ? selectedUserRef.current : undefined;
      void Promise.all([unlock(step.effect.password, targetUser), minimum]).then(([result]) => {
        if (!mountedRef.current) return;
        dispatch({ type: 'result', result, now: Date.now() });
        if (result.ok) {
          // Clear starts on LockChanged. If the signal does not arrive in time, check Echo's
          // session state rather than faking 'unlocking' while Evo may still be locked.
          graceRef.current = window.setTimeout(() => {
            graceRef.current = null;
            if (!mountedRef.current || modelRef.current.phase !== 'verify') return;
            void getSessionState()
              .then((s) => {
                if (!mountedRef.current || modelRef.current.phase !== 'verify') return;
                if (s && !s.locked) {
                  dispatch({ type: 'unlocked' });
                  return;
                }
                dispatch({
                  type: 'unlockTimeout',
                  hasPassword: s ? s.has_password : modelRef.current.hasPassword,
                  retryAtMs: s?.retry_at_ms ?? null,
                  attemptsLeft: s?.attempts_left ?? null,
                  now: Date.now(),
                });
              })
              .catch(() => {
                if (!mountedRef.current || modelRef.current.phase !== 'verify') return;
                dispatch({
                  type: 'unlockTimeout',
                  hasPassword: modelRef.current.hasPassword,
                  retryAtMs: null,
                  attemptsLeft: modelRef.current.attemptsLeft,
                  now: Date.now(),
                });
              });
          }, UNLOCK_SIGNAL_GRACE_MS);
        }
      });
    };
    dispatch(event);
  }, [mode, sessionUser]);

  // What Echo knows: at start, and when it changes (a password set, a wait running, or user selected).
  const retryAtMs = session?.retry_at_ms ?? null;
  const attemptsLeft = session?.attempts_left ?? null;
  useEffect(() => {
    if (!session && !selectedAccount) return;
    send({ type: 'session', hasPassword, retryAtMs, attemptsLeft, now: Date.now() });
  }, [send, session, selectedAccount, hasPassword, retryAtMs, attemptsLeft]);
  // A try made from elsewhere (echo-cli) still counts: the wait it starts shows here too.
  useEffect(
    () =>
      onUnlockFailed((failure) =>
        send({
          type: 'session',
          hasPassword: modelRef.current.hasPassword,
          retryAtMs: failure.retry_at_ms,
          attemptsLeft: failure.attempts_left,
          now: Date.now(),
        })
      ),
    [send]
  );

  // Clear began (LockChanged arrived).
  useEffect(() => {
    if (!unlocking) return;
    if (graceRef.current !== null) {
      window.clearTimeout(graceRef.current);
      graceRef.current = null;
    }
    send({ type: 'unlocked' });
  }, [unlocking, send]);

  const selectAccount = useCallback(
    (account: Account) => {
      if (modelRef.current.phase === 'verify' || modelRef.current.phase === 'unlocking') return;
      selectedUserRef.current = account.user;
      setPicked({ sessionUser, user: account.user });
      send({
        type: 'session',
        hasPassword: account.has_password,
        retryAtMs,
        attemptsLeft,
        resetPassword: true,
        now: Date.now(),
      });
      if (account.has_password && modelRef.current.phase === 'rest') {
        send({ type: 'pointer', now: Date.now() });
      }
    },
    [send, sessionUser, retryAtMs, attemptsLeft]
  );

  // Keys: the window hears them (Evo gives the overlay the keyboard while locked).
  useEffect(() => {
    const syncCaps = (e: KeyboardEvent) => {
      if (typeof e.getModifierState === 'function') {
        setCapsLock(e.getModifierState('CapsLock'));
      }
    };

    const onCompositionStart = () => {
      composingRef.current = true;
    };

    const onCompositionEnd = (e: CompositionEvent) => {
      composingRef.current = false;
      if (e.data) {
        send({ type: 'paste', text: e.data, now: Date.now() });
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      pasteHandledRef.current = true;
      const text = e.clipboardData?.getData('text/plain') || e.clipboardData?.getData('text') || '';
      if (!text) return;
      e.preventDefault();
      send({ type: 'paste', text, now: Date.now() });
    };

    const onKey = (e: KeyboardEvent) => {
      syncCaps(e);

      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const altGraph = typeof e.getModifierState === 'function' && e.getModifierState('AltGraph');

      // Ctrl+V paste: allow native `paste` event first; fall back to navigator.clipboard if needed.
      if (e.ctrlKey && !e.altKey && !e.metaKey && !altGraph && e.key.toLowerCase() === 'v') {
        if (e.repeat) return;
        pasteHandledRef.current = false;
        if (pasteFallbackTimerRef.current !== null) {
          window.clearTimeout(pasteFallbackTimerRef.current);
        }
        pasteFallbackTimerRef.current = window.setTimeout(() => {
          pasteFallbackTimerRef.current = null;
          if (!mountedRef.current || pasteHandledRef.current) return;
          if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
            void navigator.clipboard
              .readText()
              .then((text) => {
                if (mountedRef.current && !pasteHandledRef.current && text) {
                  send({ type: 'paste', text, now: Date.now() });
                }
              })
              .catch(() => {});
          }
        }, 0);
        return;
      }

      // Shortcuts are Evo's (Super+L, Ctrl+Tab, Alt+F4); chords are never password characters,
      // except AltGr character composition and non-ASCII Option/Alt keys.
      if (e.metaKey) return;
      if (e.ctrlKey && !altGraph) return;
      if (e.altKey && !altGraph) {
        const codePoint = e.key.codePointAt(0) ?? 0;
        if (!isPrintable(e.key) || codePoint <= 0x7f) return;
      }

      // During an active IME composition session, wait for compositionend rather than consuming raw keys.
      if (composingRef.current) return;
      if (e.isComposing && !isPrintable(e.key)) return;

      if (
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        accounts.length > 1 &&
        modelRef.current.password.length === 0
      ) {
        e.preventDefault();
        const idx = Math.max(
          0,
          accounts.findIndex((a) => a.user === selectedUserRef.current)
        );
        const delta = e.key === 'ArrowRight' ? 1 : -1;
        const next = accounts[(idx + delta + accounts.length) % accounts.length];
        if (next) selectAccount(next);
        return;
      }
      const handled = isPrintable(e.key) || e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Escape';
      if (handled) e.preventDefault();
      send({ type: 'key', key: e.key, now: Date.now() });
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', syncCaps, true);
    window.addEventListener('compositionstart', onCompositionStart, true);
    window.addEventListener('compositionend', onCompositionEnd, true);
    window.addEventListener('paste', onPaste, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', syncCaps, true);
      window.removeEventListener('compositionstart', onCompositionStart, true);
      window.removeEventListener('compositionend', onCompositionEnd, true);
      window.removeEventListener('paste', onPaste, true);
    };
  }, [send, accounts, selectAccount]);

  // Once a second: the ambient timeout, and the end of a wait.
  useEffect(() => {
    const id = window.setInterval(() => send({ type: 'tick', now: Date.now() }), 1000);
    return () => window.clearInterval(id);
  }, [send]);

  // A wrong try burns for a moment, then the field is ready again.
  const phase = model.phase;
  useEffect(() => {
    if (phase !== 'wrong') return;
    const id = window.setTimeout(
      () => send({ type: 'burned', now: Date.now() }),
      mode === 'full' ? WRONG_BURN_MS : 350
    );
    return () => window.clearTimeout(id);
  }, [phase, mode, send]);

  // ---- what to draw ----
  const interactive = hasPassword && (phase === 'awake' || phase === 'verify' || phase === 'wrong' || phase === 'wait');
  // Clear from the field keeps the field; Clear from press-to-enter never had one.
  const [fieldKept, setFieldKept] = useState(false);
  if (interactive && !fieldKept) setFieldKept(true);
  const fieldOn = interactive || (phase === 'unlocking' && fieldKept);
  const name = stateName(model);
  const waiting = phase === 'wait' && model.retryAtMs !== null;

  // The countdown's clock, only while there is one.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => setNow(Date.now()), mode === 'full' ? 250 : 1000);
    return () => window.clearInterval(id);
  }, [waiting, mode]);
  // `now` ticks only while waiting, so on entering a wait it is as old as the last render: the
  // moment the screen last heard something (the key that woke it, Echo's answer) is newer.
  const shownNow = Math.max(now, model.lastTouch, model.waitStartMs ?? 0);
  const waitLeft = waiting ? waitFraction(model, shownNow) : 0;

  const ambient = phase === 'ambient';
  const accent = accentOf(selectedAccount?.accent || session?.accent);
  const displayName = selectedAccount?.display_name || selectedAccount?.user || session?.display_name || session?.user || '';
  const initial = [...displayName][0]?.toUpperCase() ?? '';

  // The ink follows the wallpaper (light over a dark sky), as the shell's strip does.
  const tint = useMemo(() => shellTint(palette, 'light'), [palette]);
  const lightInk = contrastRatio(tint.ink, '#000000') > contrastRatio(tint.ink, '#ffffff');
  const vars = {
    '--lk-ink': lightInk ? '#ffffff' : tint.ink,
    '--lk-shadow': tint.inkShadow,
    '--lk-veil': lightInk ? 'rgba(20, 22, 48, 0.42)' : 'rgba(255, 255, 255, 0.38)',
    '--lock-accent': accent,
    // The clock sits a little off its place each minute while ambient (burn-in), a few px at a time.
    '--lock-drift-x': ambient ? `${14 + ((clock.minute * 5) % 29) - 14}px` : '0px',
    '--lock-drift-y': ambient ? `${40 + ((clock.minute * 3) % 21) - 10}px` : '0px',
  } as React.CSSProperties;

  // Gecko borrows the wallpaper's live canvas for the lens; elsewhere, a lightened gradient.
  const live = useMemo(() => supportsMozElement(), []);
  const lensStyle: React.CSSProperties = ambient
    ? { backgroundImage: 'none' }
    : { backgroundImage: live ? `-moz-element(#${LOCK_WALLPAPER_ID})` : lensGradient(palette) };

  // ---- the field's centre: where Clear opens from ----
  const fieldRef = useRef<HTMLDivElement>(null);
  const onOriginRef = useRef(onOrigin);
  useEffect(() => {
    onOriginRef.current = onOrigin;
  });
  useEffect(() => {
    if (!fieldOn) return;
    const report = () => {
      const el = fieldRef.current;
      const box = el ? layoutBox(el) : null;
      // No layout (a test): the field's usual place.
      const origin =
        box && box.width > 0
          ? { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) }
          : defaultOrigin();
      onOriginRef.current?.(origin);
      void setLockOrigin(origin.x, origin.y);
    };
    report();
    window.addEventListener('resize', report);
    return () => window.removeEventListener('resize', report);
  }, [fieldOn]);

  const text = model.password;
  const chars = [...text];
  const firstDot = Math.max(0, chars.length - MAX_DOTS);
  const wrong = phase === 'wrong';
  const message =
    phase === 'wait' && model.retryAtMs !== null
      ? `Try again in ${formatWait(waitSecondsLeft(model.retryAtMs, shownNow))}`
      : model.notQuite
        ? 'Not quite. Try again.'
        : model.unconfirmed
          ? 'Could not confirm unlock. Please try again.'
          : '';

  const submit = () => send({ type: 'key', key: 'Enter', now: Date.now() });
  const touch = (e: React.PointerEvent) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLock(e.getModifierState('CapsLock'));
    }
    send({ type: 'pointer', now: Date.now() });
  };

  return (
    <div
      className="lock"
      data-lock-screen=""
      data-lock-state={name}
      data-lock-notes-mode={notesMode}
      data-field-on={fieldOn ? 'true' : 'false'}
      data-motion={mode}
      style={vars}
      onPointerDown={touch}
    >
      <div id={LOCK_WALLPAPER_ID} className="lock-wall">
        <div className="lock-wall-dim">
          {/* Its own Daylight, so the glass here is real: there is something behind it inside the page. */}
          <DynamicWallpaper wallpaper={wallpaper} paused={ambient} motion={ambient ? 'still' : undefined} />
        </div>
      </div>
      <div className="lock-vignette" aria-hidden="true" />

      <LockStatus />

      <div className="lock-veil-scale">
        <div className="lock-clock">
          <div className="lock-time">
            {!ambient && <div className="lock-lens-glow" aria-hidden="true">{bigTime(clock, clock24h)}</div>}
            <div
              className="lock-lens"
              data-lock-clock=""
              data-lens={live ? 'live' : 'gradient'}
              style={lensStyle}
            >
              {bigTime(clock, clock24h)}
            </div>
          </div>
          <div className="lock-date">
            <b>{WEEKDAYS[clock.weekday]}</b> {MONTHS[clock.month - 1]} {clock.day}
          </div>
        </div>
      </div>

      <div className="lock-hint" data-lock-hint={name === 'no-password' ? 'no-password' : 'type'}>
        <div className="lock-orb" aria-hidden="true" />
        {name === 'no-password' ? (
          <>
            <div>Press Enter to unlock</div>
            {model.unconfirmed ? (
              <div className="lock-hint-sub lock-hint-warn" role="status" aria-live="polite" data-lock-message="">
                Could not confirm unlock. Please try again.
              </div>
            ) : (
              <div className="lock-hint-sub">Set a password in Settings → Users to protect this screen</div>
            )}
          </>
        ) : (
          <div>Just type to unlock</div>
        )}
      </div>

      <div className="lock-who" aria-hidden={!fieldOn}>
        {accounts.length > 1 ? (
          <div className="lock-users" data-lock-users="">
            {accounts.map((acct) => {
              const acctName = acct.display_name || acct.user;
              const acctInitial = [...acctName][0]?.toUpperCase() ?? '';
              const isSelected = acct.user === (selectedAccount?.user ?? sessionUser);
              if (isSelected) {
                return (
                  <div key={acct.user} className="lock-user" data-lock-user={acct.user} data-selected="true">
                    <div className="lock-halo" data-waiting={waiting ? 'true' : 'false'}>
                      <div className="lock-avatar" style={{ borderRadius: waterdrop(108) }}>
                        {acctInitial}
                      </div>
                      {waiting && <WaitRing fraction={waitLeft} />}
                    </div>
                    <div className="lock-name" title={acctName}>{acctName}</div>
                  </div>
                );
              }
              return (
                <button
                  key={acct.user}
                  type="button"
                  tabIndex={-1}
                  className="lock-user"
                  data-lock-user={acct.user}
                  data-selected="false"
                  style={{ '--user-accent': accentOf(acct.accent) } as React.CSSProperties}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => selectAccount(acct)}
                >
                  <div className="lock-avatar lock-avatar-peer" style={{ borderRadius: waterdrop(56) }}>
                    {acctInitial}
                  </div>
                  <span title={acctName}>{acctName}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <>
            <div className="lock-halo" data-waiting={waiting ? 'true' : 'false'}>
              <div className="lock-avatar" style={{ borderRadius: waterdrop(108) }}>
                {initial}
              </div>
              {waiting && <WaitRing fraction={waitLeft} />}
            </div>
            <div className="lock-name" title={displayName}>{displayName}</div>
          </>
        )}
        <div
          ref={fieldRef}
          className="lock-field lock-glass"
          data-lock-field={fieldOn ? '' : undefined}
          data-wrong={wrong ? 'true' : 'false'}
          data-busy={phase === 'verify' ? 'true' : 'false'}
          role="group"
          aria-label="Password"
        >
          {chars.length === 0 && <span className="lock-ph">Password</span>}
          {chars.slice(firstDot).map((_, i) => (
            <i key={firstDot + i} className="lock-dot" data-bad={wrong ? 'true' : undefined} />
          ))}
          {phase === 'verify' && (
            <span className="lock-spin-slot">
              <LockSpinner />
            </span>
          )}
        </div>
        <Button
          type="normal"
          htmlType="button"
          className="lock-login"
          data-busy={phase === 'verify' ? 'true' : 'false'}
          aria-label={phase === 'verify' ? 'Checking' : 'Login'}
          disabled={phase === 'verify' || waiting}
          tabIndex={-1}
          onClick={submit}
        >
          Login
        </Button>
        <div className="lock-msg" role="status" aria-live="polite" data-lock-message={fieldOn ? '' : undefined}>
          {message}
        </div>
        {capsLock && interactive && (
          <div className="lock-caps" role="status" aria-live="polite" data-lock-caps="">
            <ArrowBigUpDash size={14} aria-hidden="true" />
            <span>Caps Lock is on</span>
          </div>
        )}
      </div>

      <div className="lock-mini" aria-hidden={fieldOn || ambient}>
        <div className="lock-avatar lock-avatar-mini" style={{ borderRadius: waterdrop(30) }}>
          {initial}
        </div>
        <span className="lock-mini-name">{displayName}</span>
      </div>

      {notesMode !== 'hidden' && notifications.length > 0 && (
        <LockNotes mode={notesMode} notifications={notifications} ambient={ambient} />
      )}

    </div>
  );
};

/** The status cluster, top right, as the strip draws it, but not a button here. */
const LockStatus: React.FC = () => {
  const battery = useBatteryStatus();
  const network = useNetworkStatus();
  const { volume, muted } = useOutputVolume();
  const hasBattery = battery?.present === true && battery.level !== null;
  const showBatteryPercent = useSetting(SETTING_KEYS.showBatteryPercent, true, asBoolean);
  const BatteryGlyph = battery?.charging ? BatteryCharging : hasBattery && battery.level! <= 20 ? BatteryLow : Battery;
  const WifiGlyph = network?.connected ? Wifi : WifiOff;
  const VolumeGlyph = muted || volume === 0 ? VolumeX : Volume2;
  return (
    <div className="lock-status" aria-hidden="true">
      <WifiGlyph size={16} />
      <VolumeGlyph size={16} />
      <span className="lock-status-battery">
        <BatteryGlyph size={16} />
        {hasBattery && showBatteryPercent && <span>{battery!.level}%</span>}
      </span>
    </div>
  );
};

/** The wait's ring, draining clockwise around the avatar. */
const WaitRing: React.FC<{ fraction: number }> = ({ fraction }) => {
  const r = 70;
  const circumference = 2 * Math.PI * r;
  return (
    <svg className="lock-wait-ring" viewBox="0 0 148 148" aria-hidden="true" data-wait-fraction={fraction.toFixed(3)}>
      <circle className="lock-wait-track" cx="74" cy="74" r={r} />
      <circle
        className="lock-wait-arc"
        cx="74"
        cy="74"
        r={r}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - fraction)}
        transform="rotate(-90 74 74)"
      />
    </svg>
  );
};

/** The remochi spinner: circle, square and triangle in turn (shown while verifying). */
const LockSpinner: React.FC = () => (
  <svg className="lock-spin" width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
    <g className="m a">
      <circle cx="16" cy="16" r="9" fill="var(--px-spinner-red)" stroke="var(--px-spinner-red-outline)" strokeWidth="1.2" />
    </g>
    <g className="m b">
      <rect x="7" y="7" width="18" height="18" rx="2" fill="var(--px-spinner-blue)" stroke="var(--px-spinner-blue-outline)" strokeWidth="1.2" />
    </g>
    <g className="m c">
      <path d="M7 10h18L16 25z" fill="var(--px-spinner-yellow)" stroke="var(--px-spinner-yellow-outline)" strokeWidth="1.2" strokeLinejoin="round" />
    </g>
  </svg>
);

const MAX_COUNT_CHIPS = 4;
const MAX_FULL_CHIPS = 3;

/**
 * Notifications on the lock screen. The lock screen is the one the person in
 * front of the machine may not own, so `count` (the default) shows who has
 * something and how many, never the text; `full` shows titles and bodies;
 * `hidden` shows nothing. (The parent draws none for `hidden`.)
 */
const LockNotes: React.FC<{
  mode: Exclude<LockNotifications, 'hidden'>;
  notifications: readonly NotificationEntry[];
  ambient: boolean;
}> = ({ mode, notifications, ambient }) => {
  // By app, newest app first.
  const groups = useMemo(() => {
    const byApp = new Map<string, NotificationEntry[]>();
    for (const n of notifications) {
      const key = n.appId ?? '';
      byApp.set(key, [...(byApp.get(key) ?? []), n]);
    }
    return [...byApp.entries()].map(([appId, list]) => ({ appId, list }));
  }, [notifications]);

  if (ambient) {
    // A quiet screen only says that something is waiting: one dim drop per app.
    return (
      <div className="lock-notes lock-notes-ambient" data-lock-notes="ambient" aria-hidden="true">
        {groups.slice(0, MAX_COUNT_CHIPS).map((g) => (
          <i key={g.appId} className="lock-notes-dot" />
        ))}
      </div>
    );
  }

  if (mode === 'full') {
    const shown = notifications.slice(0, MAX_FULL_CHIPS);
    return (
      <div className="lock-notes" data-lock-notes="full">
        {shown.map((n) => (
          <div key={n.id} className="lock-chip lock-glass lock-chip-full" data-lock-note={n.id}>
            <AppDropIcon appId={n.appId} size={28} critical={n.urgency === 'critical'} />
            <span>
              <b>{n.title}</b>
              {n.body && (
                <>
                  <br />
                  <i>{n.body}</i>
                </>
              )}
            </span>
          </div>
        ))}
        {notifications.length > shown.length && (
          <div className="lock-more">+{notifications.length - shown.length} more</div>
        )}
      </div>
    );
  }

  return (
    <div className="lock-notes" data-lock-notes="count">
      {groups.slice(0, MAX_COUNT_CHIPS).map((g) => (
        <CountChip key={g.appId} appId={g.appId || null} count={g.list.length} critical={g.list.some((n) => n.urgency === 'critical')} />
      ))}
      {groups.length > MAX_COUNT_CHIPS && <div className="lock-more">+{groups.length - MAX_COUNT_CHIPS} more</div>}
    </div>
  );
};

const CountChip: React.FC<{ appId: string | null; count: number; critical: boolean }> = ({ appId, count, critical }) => {
  const name = useAppName(appId);
  return (
    <div className="lock-chip lock-glass" data-lock-note={appId ?? 'system'} data-count={count}>
      <AppDropIcon appId={appId} size={28} critical={critical} />
      <span>
        <b>{name}</b> <i>{count} new</i>
      </span>
    </div>
  );
};

export default LockScreen;

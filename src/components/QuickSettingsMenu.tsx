import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Slider, Toggle } from 'remochi';
import {
  Battery,
  BatteryCharging,
  BatteryLow,
  BellOff,
  Lock,
  LogOut,
  Moon,
  Power,
  RotateCcw,
  Settings,
  SunMedium,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  useBatteryStatus,
  useNetworkStatus,
  useSetting,
  asBoolean,
  asNumber,
  setSetting,
  setScreenBrightness,
  SETTING_KEYS,
  usePyxisTheme,
  useEcho,
  echoClient,
  useOutputVolume,
  useClock,
  waterdrop,
  lock as lockSession,
  logout as logoutSession,
  listAccounts,
  getSessionState,
  switchUser,
  type Account,
} from '@pyxis/app-sdk';
import { useMotion } from '../useMotion';
import { PANEL_ENTER, PANEL_REST, SCRIM_IN, SCRIM_OUT, TRANSITION } from '../motion';
import { STATUS_STRIP_HEIGHT } from './TopSystemBar';
import { ShellDialog } from './ShellDialog';
import './QuickSettingsMenu.css';

/** The Pyxis accent: the sliders' track (an "on" tile's fill is in QuickSettingsMenu.css). */
const ACCENT = 'var(--color-primary, #21808d)';

/**
 * The panel hangs this far below the status strip, 14 px from the screen's
 * right edge. `alpha5-bridge-deny` places its clicks from those two anchors.
 */
const PANEL_GAP = 8;
const PANEL_RIGHT = 14;

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="switch"]:not([aria-disabled="true"]), [role="slider"]:not([aria-disabled="true"]), [tabindex]:not([tabindex="-1"])';

/**
 * One quick setting as a waterdrop tile, filled with the Pyxis accent while
 * on. `control` (a Switch) is the tile's only interactive part.
 */
const Tile: React.FC<{
  id: string;
  on: boolean;
  icon: React.ReactNode;
  label: string;
  detail: string;
  control?: React.ReactNode;
}> = ({ id, on, icon, label, detail, control }) => (
  <div
    data-qs-tile={id}
    data-on={on ? 'true' : 'false'}
    // The fill is the stylesheet's: it deepens the accent by theme so white
    // text keeps its contrast.
    className="px-qs-tile"
    style={{
      minHeight: 64,
      padding: '9px 10px 8px 11px',
      borderRadius: 'var(--px-corner-40)',
      color: on ? '#ffffff' : 'var(--px-material-ink)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      gap: 6,
      transition: 'background 0.18s ease, color 0.18s ease',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 24 }}>
      <span style={{ display: 'flex', opacity: on ? 1 : 0.8 }}>{icon}</span>
      {control}
    </div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div
        style={{
          fontSize: 11.5,
          opacity: on ? 0.85 : 1,
          color: on ? undefined : 'var(--px-material-ink-quiet)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {detail}
      </div>
    </div>
  </div>
);

/** A Toggle drawn to sit on a tile: light on the accent, quiet ink when off. */
const TileSwitch: React.FC<{
  label: string;
  value: boolean;
  onChange: (next: { value: boolean }) => void;
}> = ({ label, value, onChange }) => (
  <Toggle
    aria-label={label}
    value={value}
    onChange={onChange}
    colorActive="rgba(8, 10, 24, 0.3)"
    colorInactive="var(--px-qs-switch-off)"
    style={{ '--mochi-toggle-knob': '#ffffff' } as React.CSSProperties}
  />
);

/** A sentence-case label over a group, in the material's quiet ink. */
const Caption: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 12, color: 'var(--px-material-ink-quiet)', margin: '2px 0 -2px' }}>{children}</div>
);

interface QuickSettingsMenuProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  contentRef?: React.Ref<HTMLDivElement>;
  onLaunchApp?: (appId: string) => void;
  /** Told whenever the Restart/Shut Down confirmation dialog opens or closes. */
  onConfirmOpenChange?: (open: boolean) => void;
}

/**
 * QuickSettingsMenu — Mochi Quick Settings & System Dashboard.
 *
 * Implements Palm webOS system tray & Enyo Mochi design principles:
 * - Device & Battery identity card with live status
 * - Display & Sound Groupbox with tactile PipeWire sliders
 * - Connectivity & Services Groupbox with native Mochi toggles
 * - Power & Session Tiles with inline confirmation
 */
export const QuickSettingsMenu: React.FC<QuickSettingsMenuProps> = ({
  isOpen,
  onOpenChange,
  contentRef,
  onLaunchApp,
  onConfirmOpenChange,
}) => {
  const { tr, to } = useMotion();
  const echo = useEcho();
  const theme = usePyxisTheme('light');
  const darkMode = theme === 'dark';
  const battery = useBatteryStatus();
  const network = useNetworkStatus();
  const clock = useClock();
  const showBatteryPercent = useSetting(SETTING_KEYS.showBatteryPercent, true, asBoolean);
  const headingId = useId();

  const localPanelRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const setPanelRef = useCallback(
    (node: HTMLDivElement | null) => {
      localPanelRef.current = node;
      if (typeof contentRef === 'function') {
        contentRef(node);
      } else if (contentRef && typeof contentRef === 'object') {
        (contentRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      }
    },
    [contentRef]
  );

  // Output volume from PipeWire via Echo IPC
  const { volume, muted, changeVolume, toggleMute } = useOutputVolume(isOpen);
  // Live from the settings bus. The panel's contents mount when it opens, and
  // remochi's controlled Slider follows external value changes in place.
  const brightness = useSetting(SETTING_KEYS.brightness, 80, asNumber);
  const dnd = useSetting(SETTING_KEYS.dnd, false, asBoolean);
  const [confirmAction, setConfirmActionState] = useState<'shutdown' | 'reboot' | null>(null);
  // The action the dialog last asked about, so its text doesn't change while
  // it fades out after a cancel.
  const [shownAction, setShownAction] = useState<'shutdown' | 'reboot'>('reboot');
  const setConfirmAction = (action: 'shutdown' | 'reboot' | null) => {
    setConfirmActionState(action);
    if (action) setShownAction(action);
  };
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeUser, setActiveUser] = useState<string>('geckouser');

  // If Quick Settings is closed externally, clear any pending confirm state.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (!isOpen && confirmAction !== null) {
      setConfirmActionState(null);
    }
  }

  const confirmOpen = confirmAction !== null;
  useEffect(() => {
    onConfirmOpenChange?.(confirmOpen);
  }, [confirmOpen, onConfirmOpenChange]);
  useEffect(() => {
    return () => {
      onConfirmOpenChange?.(false);
    };
  }, [onConfirmOpenChange]);

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    void Promise.all([listAccounts(), getSessionState()])
      .then(([users, state]) => {
        if (!mounted) return;
        setAccounts(users);
        if (state?.user) setActiveUser(state.user);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  // Initial focus + focus restore on close/unmount.
  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => {
      const panel = localPanelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? panel).focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      const prev = previousFocusRef.current;
      previousFocusRef.current = null;
      if (prev && prev.isConnected) {
        prev.focus();
      }
    };
  }, [isOpen]);

  const handleSwitchUser = async (user: string) => {
    onOpenChange(false);
    try {
      await switchUser(user);
    } catch {
      /* non-fatal: session switch failed or unavailable */
    }
  };

  // Close on Escape key & trap Tab focus inside the panel (while confirm dialog is not active).
  useEffect(() => {
    if (!isOpen || confirmOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onOpenChange(false);
        return;
      }
      if (e.key === 'Tab') {
        const panel = localPanelRef.current;
        if (!panel) return;
        const focusables = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
          (el) => el.offsetParent !== null || el === document.activeElement
        );
        if (focusables.length === 0) {
          e.preventDefault();
          e.stopPropagation();
          panel.focus();
          return;
        }
        const at = focusables.indexOf(document.activeElement as HTMLElement);
        const next = e.shiftKey
          ? at <= 0
            ? focusables.length - 1
            : at - 1
          : at === focusables.length - 1
            ? 0
            : at + 1;
        e.preventDefault();
        e.stopPropagation();
        focusables[next]?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, confirmOpen, onOpenChange]);

  const handleBrightnessChange = (b: number) => {
    void setSetting(SETTING_KEYS.brightness, b).catch(() => {});
    const applyBrightness =
      (echo as { setScreenBrightness?: (level: number) => Promise<unknown> }).setScreenBrightness ??
      setScreenBrightness;
    void applyBrightness(b).catch(() => {});
  };

  const handleDndToggle = () => {
    void setSetting(SETTING_KEYS.dnd, !dnd).catch(() => {});
  };

  const handleConfirmPower = async () => {
    const action = confirmAction;
    setConfirmAction(null);
    onOpenChange(false);
    if (action !== 'shutdown' && action !== 'reboot') return;
    // Best-effort close running non-shell app sessions so open apps can flush
    // state before the kernel halts (echo's PowerService also drains them).
    try {
      const drain = (async () => {
        const res = (await echoClient.callMethod('appHost', 'org.geckoOS.appHost', 'ListRunningApps', {})) as
          | { sessions?: Array<{ sessionId: string; appId: string; state?: string }> }
          | undefined;
        const targets = (res?.sessions ?? []).filter(
          (s) => s.appId !== 'bloom' && s.appId !== 'lock' && (s.state === 'running' || s.state === 'suspended')
        );
        await Promise.allSettled(
          targets.map((s) =>
            echoClient.callMethod('appHost', 'org.geckoOS.appHost', 'CloseApp', { sessionId: s.sessionId })
          )
        );
      })();
      await Promise.race([drain, new Promise<void>((r) => setTimeout(r, 150))]);
    } catch {
      /* non-fatal; kernel poweroff still proceeds */
    }
    try {
      if (action === 'shutdown') {
        await echo.shutdown();
      } else {
        await echo.reboot();
      }
    } catch {
      /* non-fatal: power action failed or refused */
    }
  };

  // Lock now: the session service locks and Evo covers the screen; the lock
  // screen arrives by LockChanged, and closes this panel with the rest.
  const handleLock = async () => {
    onOpenChange(false);
    try {
      await lockSession();
    } catch {
      /* non-fatal */
    }
  };

  const handleSleep = async () => {
    onOpenChange(false);
    try {
      await echo.sleep();
    } catch {
      /* non-fatal */
    }
  };

  const handleLogout = async () => {
    onOpenChange(false);
    try {
      await logoutSession();
    } catch {
      /* non-fatal */
    }
  };

  const hasBattery = battery?.present === true && battery.level !== null;
  const isCharging = battery?.charging ?? false;
  const BatteryGlyph = isCharging
    ? BatteryCharging
    : hasBattery && battery.level! <= 20
    ? BatteryLow
    : Battery;

  const formattedDate = new Date(Date.UTC(clock.year, clock.month - 1, clock.day)).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

  const valueStyle: React.CSSProperties = {
    fontSize: 11.5,
    minWidth: 36,
    textAlign: 'right',
    color: 'var(--px-material-ink-quiet)',
  };
  const powerButton = (danger = false): React.CSSProperties => ({
    // Five actions share the row (Lock, Sleep, Log Out, Restart, Shut Down);
    // allow wrapping cleanly so labels never clip or collide in the 360px panel.
    flex: '1 1 auto',
    minWidth: 'fit-content',
    height: 34,
    padding: '0 10px',
    whiteSpace: 'nowrap',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: waterdrop(34),
    border: danger
      ? '1px solid color-mix(in srgb, var(--px-spinner-red) 55%, transparent)'
      : '1px solid color-mix(in srgb, var(--px-material-ink) 14%, transparent)',
    background: danger
      ? 'color-mix(in srgb, var(--px-spinner-red) 14%, transparent)'
      : 'color-mix(in srgb, var(--px-material-ink) 5%, transparent)',
    color: 'var(--px-material-ink)',
    fontFamily: 'var(--px-font-ui)',
    fontSize: 12,
    cursor: 'pointer',
  });

  return (
    <>
      {/* Click-outside backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            data-qs-scrim=""
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: tr(SCRIM_IN) }}
            exit={{ opacity: 0, transition: tr(SCRIM_OUT) }}
            onClick={isOpen ? () => onOpenChange(false) : undefined}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1299,
              background: 'rgba(8, 10, 24, 0.22)',
              pointerEvents: isOpen ? 'auto' : 'none',
            }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={setPanelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            tabIndex={-1}
            data-quick-settings
            className="px-ui"
            initial={to({ ...PANEL_ENTER, y: -8 })}
            animate={{ ...to(PANEL_REST), transition: tr(TRANSITION.open) }}
            exit={{ ...to({ ...PANEL_ENTER, y: -8 }), transition: tr(TRANSITION.close) }}
            style={{
              position: 'fixed',
              top: STATUS_STRIP_HEIGHT + PANEL_GAP,
              right: PANEL_RIGHT,
              width: 360,
              maxWidth: `calc(100vw - ${2 * PANEL_RIGHT}px)`,
              maxHeight: `calc(100vh - ${STATUS_STRIP_HEIGHT + PANEL_GAP + 72}px)`,
              overflowY: 'auto',
              overflowX: 'visible',
              zIndex: 1300,
              pointerEvents: isOpen ? 'auto' : 'none',
              transformOrigin: 'top right',
              borderRadius: 'var(--px-corner)',
              background: 'var(--px-material-strong)',
              color: 'var(--px-material-ink)',
              boxShadow:
                '0 20px 50px rgba(0, 0, 0, 0.3), inset 0 0 0 1px color-mix(in srgb, var(--px-material-ink) 10%, transparent)',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {/* 1. Head: the title in display type, battery and Settings */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <h2
                  id={headingId}
                  data-qs-heading
                  className="px-display"
                  style={{ margin: 0, fontSize: 14, letterSpacing: '0.16em', lineHeight: '20px' }}
                >
                  Quick settings
                </h2>
                <div data-qs-date="" style={{ fontSize: 11.5, color: 'var(--px-material-ink-quiet)', marginTop: 2 }}>
                  Pyxis OS 0.1.0 · {formattedDate}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {/* Battery Pill */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: 12,
                    height: 26,
                    padding: '0 9px',
                    borderRadius: 'var(--px-corner-20)',
                    background: isCharging
                      ? 'rgba(76, 175, 80, 0.16)'
                      : 'color-mix(in srgb, var(--px-material-ink) 7%, transparent)',
                    color: isCharging
                      ? 'color-mix(in srgb, var(--color-success, #4caf50) 68%, var(--px-material-ink))'
                      : 'var(--px-material-ink)',
                  }}
                >
                  <BatteryGlyph size={14} />
                  <span>{hasBattery ? `${battery!.level}%` : 'AC'}</span>
                </div>

                {/* Settings Launcher */}
                {onLaunchApp && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenChange(false);
                      onLaunchApp('settings');
                    }}
                    title="Open System Settings"
                    aria-label="Open System Settings"
                    style={{
                      background: 'color-mix(in srgb, var(--px-material-ink) 7%, transparent)',
                      border: 'none',
                      borderRadius: waterdrop(28),
                      width: 28,
                      height: 28,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: 'var(--px-material-ink)',
                      transition: 'background 0.12s ease',
                    }}
                  >
                    <Settings size={15} />
                  </button>
                )}
              </div>
            </div>

            {/* 2. Toggles as waterdrop tiles. Do Not Disturb is in the right
                column, so its switch sits at the panel's right edge. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Tile
                id="wifi"
                on={network?.connected === true}
                icon={network?.connected ? <Wifi size={16} /> : <WifiOff size={16} />}
                label="Wi-Fi"
                detail={network?.connected ? network.ssid || 'Connected' : 'Offline'}
              />
              <Tile
                id="dnd"
                on={dnd}
                icon={<BellOff size={16} />}
                label="Do Not Disturb"
                detail={dnd ? 'On' : 'Off'}
                control={<TileSwitch label="Do Not Disturb" value={dnd} onChange={handleDndToggle} />}
              />
              <Tile
                id="theme"
                on={darkMode}
                icon={<Moon size={16} />}
                label="Dark Theme"
                detail={darkMode ? 'On' : 'Off'}
                control={
                  <TileSwitch
                    label="Dark Theme"
                    value={darkMode}
                    onChange={({ value }) => void setSetting(SETTING_KEYS.theme, value ? 'dark' : 'light').catch(() => {})}
                  />
                }
              />
              <Tile
                id="battery-percent"
                on={showBatteryPercent}
                icon={<BatteryGlyph size={16} />}
                label="Battery percent"
                detail="In the status strip"
                control={
                  <TileSwitch
                    label="Battery percent"
                    value={showBatteryPercent}
                    onChange={({ value }) => void setSetting(SETTING_KEYS.showBatteryPercent, value).catch(() => {})}
                  />
                }
              />
            </div>

            {/* 3. Sound and display: the sliders */}
            <div
              className="px-qs-sliders"
              style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'visible', overflowX: 'visible' }}
            >
              <Caption>Volume</Caption>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'visible', overflowX: 'visible' }}>
                <button
                  type="button"
                  className="px-qs-mute"
                  data-muted={muted ? 'true' : 'false'}
                  onClick={toggleMute}
                  disabled={volume === null}
                  title={volume === null ? 'No audio output' : muted ? 'Unmute' : 'Mute'}
                  aria-label={volume === null ? 'No audio output' : muted ? 'Unmute' : 'Mute'}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    cursor: volume === null ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <div
                  data-qs-slider="volume"
                  style={{
                    flex: 1,
                    overflow: 'visible',
                    overflowX: 'visible',
                    opacity: volume === null ? 0.4 : 1,
                    pointerEvents: volume === null ? 'none' : undefined,
                  }}
                >
                  <Slider
                    aria-label="Volume"
                    value={volume ?? 0}
                    min={0}
                    max={100}
                    width="100%"
                    color={ACCENT}
                    onChange={changeVolume}
                  />
                </div>
                <span style={valueStyle}>{volume === null ? '—' : muted ? 'Muted' : `${volume}%`}</span>
              </div>

              <Caption>Brightness</Caption>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'visible', overflowX: 'visible' }}>
                <span style={{ display: 'flex', alignItems: 'center', color: 'var(--px-material-ink-quiet)' }}>
                  <SunMedium size={16} />
                </span>
                <div data-qs-slider="brightness" style={{ flex: 1, overflow: 'visible', overflowX: 'visible' }}>
                  <Slider
                    aria-label="Brightness"
                    value={brightness}
                    min={10}
                    max={100}
                    width="100%"
                    color={ACCENT}
                    onChange={handleBrightnessChange}
                  />
                </div>
                <span style={valueStyle}>{brightness}%</span>
              </div>
            </div>

            {/* 4. Power & Session */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
              <button
                type="button"
                className="px-qs-power"
                data-qs-action="lock"
                style={powerButton()}
                onClick={handleLock}
              >
                <Lock size={14} /> Lock
              </button>
              <button type="button" className="px-qs-power" style={powerButton()} onClick={handleSleep}>
                <Moon size={14} /> Sleep
              </button>
              <button
                type="button"
                className="px-qs-power"
                data-qs-action="logout"
                style={powerButton()}
                onClick={handleLogout}
              >
                <LogOut size={14} /> Log Out
              </button>
              <button
                type="button"
                className="px-qs-power"
                style={powerButton()}
                onClick={() => setConfirmAction('reboot')}
              >
                <RotateCcw size={14} /> Restart
              </button>
              <button
                type="button"
                className="px-qs-power"
                data-danger="true"
                style={powerButton(true)}
                onClick={() => setConfirmAction('shutdown')}
              >
                <Power size={14} /> Shut Down
              </button>
            </div>

            {accounts.length > 1 && (
              <div
                data-qs-users=""
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  paddingTop: 8,
                  borderTop: '1px solid color-mix(in srgb, var(--px-material-ink) 10%, transparent)',
                }}
              >
                <span style={{ fontSize: 12, color: 'var(--px-material-ink-quiet)', flexShrink: 0 }}>
                  Switch user
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', minWidth: 0 }}>
                  {accounts.map((acct) => {
                    const isCurrent = acct.user === activeUser;
                    const label = acct.display_name || acct.user;
                    const initial = [...label][0]?.toUpperCase() ?? '';
                    return (
                      <button
                        key={acct.user}
                        type="button"
                        data-qs-user={acct.user}
                        data-active={isCurrent ? 'true' : 'false'}
                        disabled={isCurrent}
                        title={label}
                        onClick={() => void handleSwitchUser(acct.user)}
                        style={{
                          height: 28,
                          maxWidth: 150,
                          minWidth: 0,
                          padding: '0 10px 0 4px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          borderRadius: waterdrop(28),
                          border: isCurrent
                            ? '1px solid color-mix(in srgb, var(--color-primary, #21808d) 55%, transparent)'
                            : '1px solid color-mix(in srgb, var(--px-material-ink) 14%, transparent)',
                          background: isCurrent
                            ? 'color-mix(in srgb, var(--color-primary, #21808d) 16%, transparent)'
                            : 'color-mix(in srgb, var(--px-material-ink) 5%, transparent)',
                          color: 'var(--px-material-ink)',
                          fontFamily: 'var(--px-font-ui)',
                          fontSize: 12,
                          cursor: isCurrent ? 'default' : 'pointer',
                        }}
                      >
                        <span
                          style={{
                            width: 20,
                            height: 20,
                            flexShrink: 0,
                            borderRadius: waterdrop(20),
                            background: acct.accent || '#7c6cf0',
                            color: '#fff',
                            fontSize: 11,
                            display: 'grid',
                            placeItems: 'center',
                          }}
                        >
                          {initial}
                        </span>
                        <span
                          style={{
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <ShellDialog
        open={confirmAction !== null}
        id={shownAction === 'shutdown' ? 'shutdown' : 'restart'}
        title={shownAction === 'shutdown' ? 'Shut Down Pyxis' : 'Restart Pyxis'}
        confirmLabel={shownAction === 'shutdown' ? 'Shut Down' : 'Restart'}
        confirmKind="destructive"
        cancelLabel="Cancel"
        onConfirm={handleConfirmPower}
        onCancel={() => setConfirmAction(null)}
      >
        Are you sure you want to {shownAction === 'shutdown' ? 'shut down' : 'restart'} your computer?
      </ShellDialog>
    </>
  );
};

export default QuickSettingsMenu;

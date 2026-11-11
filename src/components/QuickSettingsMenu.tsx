import React, { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  FloatingPanel,
  Slider,
  Toggle,
} from 'remochi';
import {
  Battery,
  BatteryCharging,
  BatteryLow,
  BellOff,
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
  SETTING_KEYS,
  usePyxisTheme,
  useEcho,
  useOutputVolume,
} from '@pyxis/app-sdk';
import { useMotion } from '../useMotion';
import { PANEL_ENTER, PANEL_REST, SCRIM_IN, SCRIM_OUT, TRANSITION } from '../motion';

/**
 * remochi's `Toggle`, typed the way it actually behaves (MochiToggle expects `value`).
 */
const Switch = Toggle as unknown as React.FC<{
  value?: boolean;
  onChange?: (next: { value: boolean }) => void;
  disabled?: boolean;
}>;

interface QuickSettingsMenuProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  contentRef?: React.Ref<HTMLDivElement>;
  onLaunchApp?: (appId: string) => void;
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
}) => {
  const { tr, to } = useMotion();
  const echo = useEcho();
  const theme = usePyxisTheme('light');
  const panelStyle = theme === 'dark' ? 'shadow' : 'default';
  const darkMode = theme === 'dark';
  const battery = useBatteryStatus();
  const network = useNetworkStatus();
  const showBatteryPercent = useSetting(SETTING_KEYS.showBatteryPercent, true, asBoolean);

  // Output volume from PipeWire via Echo IPC
  const { volume, muted, revision, changeVolume, toggleMute } = useOutputVolume(isOpen);
  // Live from the settings bus. The panel's contents mount when it opens, by
  // which time the value is known, so remochi's Slider (which reads `value`
  // only at mount) starts in the right place.
  const brightness = useSetting(SETTING_KEYS.brightness, 80, asNumber);
  const dnd = useSetting(SETTING_KEYS.dnd, false, asBoolean);
  const [confirmAction, setConfirmAction] = useState<'shutdown' | 'reboot' | null>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onOpenChange]);

  const handleBrightnessChange = (b: number) => {
    void setSetting(SETTING_KEYS.brightness, b).catch(() => {});
  };

  const handleDndToggle = () => {
    void setSetting(SETTING_KEYS.dnd, !dnd).catch(() => {});
  };

  const handleConfirmPower = async () => {
    const action = confirmAction;
    setConfirmAction(null);
    onOpenChange(false);
    if (action === 'shutdown') {
      await echo.shutdown();
    } else if (action === 'reboot') {
      await echo.reboot();
    }
  };

  const handleSleep = async () => {
    onOpenChange(false);
    await echo.sleep();
  };

  const hasBattery = battery?.present === true && battery.level !== null;
  const isCharging = battery?.charging ?? false;
  const BatteryGlyph = isCharging
    ? BatteryCharging
    : hasBattery && battery.level! <= 20
    ? BatteryLow
    : Battery;

  return (
    <>
      {/* Click-outside backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: tr(SCRIM_IN) }}
            exit={{ opacity: 0, transition: tr(SCRIM_OUT) }}
            onClick={() => onOpenChange(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1299,
              background: 'rgba(0, 0, 0, 0.22)',
              backdropFilter: 'blur(2px)',
            }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={contentRef}
            initial={to({ ...PANEL_ENTER, y: -8 })}
            animate={{ ...to(PANEL_REST), transition: tr(TRANSITION.open) }}
            exit={{ ...to({ ...PANEL_ENTER, y: -8 }), transition: tr(TRANSITION.close) }}
            style={{
              position: 'fixed',
              top: 52,
              right: 14,
              width: 360,
              maxWidth: 'calc(100vw - 28px)',
              maxHeight: 'calc(100vh - 72px)',
              overflowY: 'auto',
              zIndex: 1300,
              transformOrigin: 'top right',
              boxShadow: '0 18px 42px rgba(0, 0, 0, 0.28)',
              borderRadius: 18,
            }}
          >
            <FloatingPanel style={panelStyle}>
              <div
                style={{
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  color: 'var(--color-text)',
                }}
              >
                {/* 1. Device & Battery Header Card */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingBottom: '4px',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        letterSpacing: '-0.01em',
                        color: 'var(--color-text)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span>Pyxis OS</span>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 500,
                          padding: '1px 6px',
                          borderRadius: '10px',
                          background: 'var(--color-primary-light, rgba(59, 130, 246, 0.12))',
                          color: 'var(--color-primary, #3b82f6)',
                        }}
                      >
                        v0.1.0
                      </span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                      {new Date().toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* Battery Pill */}
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        padding: '3px 9px',
                        borderRadius: 12,
                        background: isCharging
                          ? 'rgba(76, 175, 80, 0.12)'
                          : 'var(--mochi-hover, rgba(0, 0, 0, 0.05))',
                        color: isCharging ? 'var(--color-success, #4caf50)' : 'var(--color-text)',
                        border: '1px solid var(--color-border-light, rgba(0, 0, 0, 0.08))',
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
                        style={{
                          background: 'var(--mochi-hover, rgba(0, 0, 0, 0.06))',
                          border: '1px solid var(--color-border-light, rgba(0, 0, 0, 0.08))',
                          borderRadius: '12px 3px 12px 12px',
                          width: 30,
                          height: 30,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          color: 'var(--color-text)',
                          transition: 'background 0.12s ease',
                        }}
                      >
                        <Settings size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Display & Sound Groupbox */}
                <div
                  style={{
                    background: 'var(--color-surface, rgba(255, 255, 255, 0.6))',
                    border: '1px solid var(--color-border-light, rgba(0, 0, 0, 0.08))',
                    borderRadius: 14,
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--color-text-secondary, #6b7280)',
                    }}
                  >
                    Hardware & Sound
                  </div>

                  {/* Volume Slider Row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      type="button"
                      onClick={toggleMute}
                      disabled={volume === null}
                      title={volume === null ? 'No audio output' : muted ? 'Unmute' : 'Mute'}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        cursor: volume === null ? 'default' : 'pointer',
                        color: muted ? 'var(--color-error, #f44336)' : 'var(--color-text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                    <div
                      style={{
                        flex: 1,
                        opacity: volume === null ? 0.4 : 1,
                        pointerEvents: volume === null ? 'none' : undefined,
                      }}
                    >
                      <Slider
                        key={revision}
                        value={volume ?? 0}
                        min={0}
                        max={100}
                        width="100%"
                        color="var(--color-primary, #3b82f6)"
                        onChange={changeVolume}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        minWidth: 32,
                        textAlign: 'right',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      {volume === null ? '—' : muted ? 'Muted' : `${volume}%`}
                    </span>
                  </div>

                  {/* Brightness Slider Row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)' }}>
                      <SunMedium size={16} />
                    </span>
                    <div style={{ flex: 1 }}>
                      <Slider
                        value={brightness}
                        min={10}
                        max={100}
                        width="100%"
                        color="var(--color-primary, #3b82f6)"
                        onChange={handleBrightnessChange}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        minWidth: 32,
                        textAlign: 'right',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      {brightness}%
                    </span>
                  </div>
                </div>

                {/* 3. Connectivity & Services Groupbox */}
                <div
                  style={{
                    background: 'var(--color-surface, rgba(255, 255, 255, 0.6))',
                    border: '1px solid var(--color-border-light, rgba(0, 0, 0, 0.08))',
                    borderRadius: 14,
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: 'var(--color-text-secondary, #6b7280)',
                    }}
                  >
                    Connectivity & Display
                  </div>

                  {/* Wi-Fi Row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.85rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          color: network?.connected
                            ? 'var(--color-success, #4caf50)'
                            : 'var(--color-text-secondary)',
                        }}
                      >
                        {network?.connected ? <Wifi size={16} /> : <WifiOff size={16} />}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500, color: 'var(--color-text)' }}>Wi-Fi</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
                          {network?.connected ? network.ssid || 'Connected' : 'Offline'}
                        </div>
                      </div>
                    </div>
                    <Badge
                      content={network?.connected ? 'Connected' : 'Offline'}
                      background={
                        network?.connected
                          ? 'var(--color-success, #4caf50)'
                          : 'var(--color-text-secondary, #6b7280)'
                      }
                      color="#fff"
                    />
                  </div>

                  {/* Dark Theme Row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.85rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Moon size={16} style={{ color: 'var(--color-text-secondary)' }} />
                      <span style={{ fontWeight: 500, color: 'var(--color-text)' }}>Dark Theme</span>
                    </div>
                    <Switch
                      value={darkMode}
                      onChange={({ value }) => void setSetting(SETTING_KEYS.theme, value ? 'dark' : 'light')}
                    />
                  </div>

                  {/* Do Not Disturb Row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.85rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <BellOff size={16} style={{ color: 'var(--color-text-secondary)' }} />
                      <span style={{ fontWeight: 500, color: 'var(--color-text)' }}>Do Not Disturb</span>
                    </div>
                    <Switch value={dnd} onChange={handleDndToggle} />
                  </div>

                  {/* Battery Top Bar Readout Row */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.82rem',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    <span>Battery percent in top bar</span>
                    <Switch
                      value={showBatteryPercent}
                      onChange={({ value }) => void setSetting(SETTING_KEYS.showBatteryPercent, value)}
                    />
                  </div>
                </div>

                {/* 4. Power & Session Action Tiles */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <Button type="normal" onClick={handleSleep}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          width: '100%',
                          fontSize: '0.8rem',
                        }}
                      >
                        <Moon size={14} /> Sleep
                      </span>
                    </Button>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Button type="normal" onClick={() => setConfirmAction('reboot')}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          width: '100%',
                          fontSize: '0.8rem',
                        }}
                      >
                        <RotateCcw size={14} /> Restart
                      </span>
                    </Button>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Button type="warning" onClick={() => setConfirmAction('shutdown')}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          width: '100%',
                          fontSize: '0.8rem',
                        }}
                      >
                        <Power size={14} /> Shut Down
                      </span>
                    </Button>
                  </div>
                </div>
              </div>
            </FloatingPanel>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog
        isOpen={confirmAction !== null}
        title={confirmAction === 'shutdown' ? 'Shut Down Pyxis' : 'Restart Pyxis'}
        type="confirm"
        confirmText={confirmAction === 'shutdown' ? 'Shut Down' : 'Restart'}
        cancelText="Cancel"
        onConfirm={handleConfirmPower}
        onCancel={() => setConfirmAction(null)}
        onClose={() => setConfirmAction(null)}
      >
        <p style={{ margin: 0, color: 'var(--color-text)' }}>
          Are you sure you want to {confirmAction === 'shutdown' ? 'shut down' : 'restart'} your computer?
        </p>
      </Dialog>
    </>
  );
};

export default QuickSettingsMenu;

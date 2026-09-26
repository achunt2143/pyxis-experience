import React, { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  Divider,
  FloatingPanel,
  Slider,
  Toggle,
} from 'remochi';
import {
  Battery,
  BatteryCharging,
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
  useBooleanSetting,
  getSetting,
  setSetting,
  SETTING_KEYS,
  usePyxisTheme,
  useEcho,
  useOutputVolume,
} from '@pyxis/app-sdk';

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

export const QuickSettingsMenu: React.FC<QuickSettingsMenuProps> = ({
  isOpen,
  onOpenChange,
  contentRef,
  onLaunchApp,
}) => {
  const echo = useEcho();
  const theme = usePyxisTheme('light');
  const panelStyle = theme === 'dark' ? 'shadow' : 'default';
  const darkMode = theme === 'dark';
  const battery = useBatteryStatus();
  const network = useNetworkStatus();
  const showBatteryPercent = useBooleanSetting(SETTING_KEYS.showBatteryPercent, true);

  // The real output volume, from echo's audio service (PipeWire). The
  // slider used to write a `pyxis.volume` setting that nothing read.
  const { volume, muted, changeVolume, toggleMute } = useOutputVolume(isOpen);
  const [brightness, setBrightness] = useState(80);
  const [dnd, setDnd] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'shutdown' | 'reboot' | null>(null);

  useEffect(() => {
    if (isOpen) {
      void getSetting<number>(SETTING_KEYS.brightness).then((b) => {
        if (typeof b === 'number') setBrightness(b);
      });
      void getSetting<boolean>(SETTING_KEYS.dnd).then((d) => {
        if (typeof d === 'boolean') setDnd(d);
      });
    }
  }, [isOpen, echo]);

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
    setBrightness(b);
    void setSetting(SETTING_KEYS.brightness, b);
  };

  const handleDndToggle = () => {
    const next = !dnd;
    setDnd(next);
    void setSetting(SETTING_KEYS.dnd, next);
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

  return (
    <>
      {/* Click-outside backdrop with blur */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
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
            initial={{ opacity: 0, y: '-100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{
              opacity: 0,
              y: '-100%',
              transition: { duration: 0.22, ease: [0.32, 0, 0.24, 1] },
            }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'fixed',
              top: 54,
              right: 16,
              width: 350,
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: 'calc(100vh - 72px)',
              overflowY: 'auto',
              zIndex: 1300,
              boxShadow: '0 16px 38px rgba(0,0,0,0.26)',
              borderRadius: 16,
            }}
          >
            <FloatingPanel style={panelStyle}>
              <div
                style={{
                  padding: '16px 18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  color: 'var(--color-text)',
                }}
              >
                {/* Desktop System Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', letterSpacing: '-0.01em', color: 'var(--color-text)' }}>
                      pyxis <span style={{ fontWeight: 400, fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>• Pyxis OS 0.1.0</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                      {new Date().toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* Battery badge */}
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: 10,
                        background: 'var(--mochi-hover, rgba(0,0,0,0.06))',
                        color: isCharging ? 'var(--color-success, #4caf50)' : 'var(--color-text)',
                      }}
                    >
                      {isCharging ? <BatteryCharging size={13} /> : <Battery size={13} />}
                      <span>{hasBattery ? `${battery!.level}%` : 'AC'}</span>
                    </div>

                    {/* Settings App Launcher */}
                    {onLaunchApp && (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenChange(false);
                          onLaunchApp('settings');
                        }}
                        title="Open System Settings"
                        style={{
                          background: 'var(--mochi-hover, rgba(0,0,0,0.06))',
                          border: 'none',
                          borderRadius: 8,
                          width: 28,
                          height: 28,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          color: 'var(--color-text)',
                        }}
                      >
                        <Settings size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <Divider thickness={1} />

                {/* Hardware Controls (webOS Sliders) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Volume Slider */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      type="button"
                      onClick={toggleMute}
                      disabled={volume === null}
                      title={volume === null ? 'No audio output' : muted ? 'Unmute' : 'Mute'}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        color: 'var(--color-text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {muted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
                    </button>
                    <div
                      style={{
                        flex: 1,
                        opacity: volume === null ? 0.4 : 1,
                        pointerEvents: volume === null ? 'none' : undefined,
                      }}
                    >
                      <Slider
                        value={volume ?? 0}
                        min={0}
                        max={100}
                        width="100%"
                        color="var(--color-primary, #4a8bc2)"
                        onChange={changeVolume}
                      />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, minWidth: 32, textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                      {volume === null ? '—' : muted ? 'Muted' : `${volume}%`}
                    </span>
                  </div>

                  {/* Brightness Slider */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)' }}>
                      <SunMedium size={15} />
                    </span>
                    <div style={{ flex: 1 }}>
                      <Slider
                        value={brightness}
                        min={10}
                        max={100}
                        width="100%"
                        color="var(--color-primary, #4a8bc2)"
                        onChange={handleBrightnessChange}
                      />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, minWidth: 32, textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                      {brightness}%
                    </span>
                  </div>
                </div>

                <Divider thickness={1} />

                {/* Desktop System Services Rows (Palm webOS style) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Wi-Fi Row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ color: network?.connected ? 'var(--color-primary, #4a8bc2)' : 'var(--color-text-secondary)' }}>
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
                      background={network?.connected ? 'var(--color-success, #4caf50)' : 'var(--color-error, #f44336)'}
                      color="#fff"
                    />
                  </div>

                  {/* Dark Theme Row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <BellOff size={16} style={{ color: 'var(--color-text-secondary)' }} />
                      <span style={{ fontWeight: 500, color: 'var(--color-text)' }}>Do Not Disturb</span>
                    </div>
                    <Switch
                      value={dnd}
                      onChange={handleDndToggle}
                    />
                  </div>

                  {/* Battery Top Bar Readout Row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                    <span>Battery percent in top bar</span>
                    <Switch
                      value={showBatteryPercent}
                      onChange={({ value }) => void setSetting(SETTING_KEYS.showBatteryPercent, value)}
                    />
                  </div>
                </div>

                <Divider thickness={1} />

                {/* Power & Session Action Buttons */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                  <div style={{ flex: 1 }}>
                    <Button
                      variant="normal"
                      onClick={handleSleep}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', fontSize: '0.8rem' }}>
                        <Moon size={14} /> Sleep
                      </span>
                    </Button>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Button
                      variant="normal"
                      onClick={() => setConfirmAction('reboot')}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', fontSize: '0.8rem' }}>
                        <RotateCcw size={14} /> Restart
                      </span>
                    </Button>
                  </div>
                  <div style={{ flex: 1 }}>
                    <Button
                      variant="warning"
                      onClick={() => setConfirmAction('shutdown')}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', fontSize: '0.8rem' }}>
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

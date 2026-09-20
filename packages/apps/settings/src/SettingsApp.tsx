import React, { useEffect, useState } from 'react';
import {
  Button,
  Divider,
  Dropdown,
  Header,
  Item,
  List,
  ListHeader,
  Repanel,
  RepanelStack,
  Subheader,
  Toggle,
  Badge,
  Dialog,
  useTheme,
} from 'remochi';
import { Moon, Power, RotateCcw } from 'lucide-react';
import {
  useEcho,
  getSetting,
  setSetting,
  SETTING_KEYS,
  WALLPAPERS,
} from '@pyxis/app-sdk';

/**
 * remochi's `Toggle`, typed the way it actually behaves.
 *
 * The package's `index.d.ts` declares a `checked` prop, but the component it
 * exports is `MochiToggle`, which reads **`value`** and calls
 * `onChange({ value })`. Passing `checked` type-checks cleanly and is then
 * ignored, so this switch rendered a permanent "Off" even with dark mode
 * active. Mirrors the same bridge in the shell's QuickSettingsMenu.tsx.
 */
const Switch = Toggle as unknown as React.FC<{
  value?: boolean;
  onChange?: (next: { value: boolean }) => void;
  disabled?: boolean;
}>;

export interface SettingsAppProps {
  windowId: string;
  onClose?: () => void;
}

const SECTIONS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'network', label: 'Network' },
  { id: 'system', label: 'System' },
  { id: 'about', label: 'About' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

const ABOUT_INFO: [string, string][] = [
  ['Operating System', 'Pyxis OS 0.1.0 (release/alpha2)'],
  ['Desktop Shell', 'Bloom 0.1.0'],
  ['UI Framework', 'Remochi 0.3.0'],
  ['Kernel', 'Linux 6.6.0-gecko'],
  ['Architecture', 'x86_64'],
  ['Compositor', 'Evo (Smithay / Wayland)'],
  ['IPC Bus', 'Echo (geckoOS)'],
];

export const SettingsApp: React.FC<SettingsAppProps> = ({ windowId }) => {
  const [section, setSection] = useState<SectionId>('appearance');
  // Which Repanel is in front: 0 = section rail alone (detail swiped away),
  // 1 = section content (rail stays revealed behind it as its own column).
  const [activeIndex, setActiveIndex] = useState(1);
  const [wallpaper, setWallpaper] = useState<string>(WALLPAPERS[0].id);
  const { theme } = useTheme();
  const echo = useEcho();
  const [network, setNetwork] = useState<{
    connected: boolean;
    ssid: string;
    type: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    echo.getNetworkStatus().then((res) => {
      if (mounted) setNetwork(res);
    });
    getSetting<string>(SETTING_KEYS.wallpaper).then((saved) => {
      if (mounted && saved && WALLPAPERS.some((w) => w.id === saved)) {
        setWallpaper(saved);
      }
    });
    return () => {
      mounted = false;
    };
  }, [echo]);

  const selectSection = (id: SectionId) => {
    setSection(id);
    setActiveIndex(1);
  };

  const applyWallpaper = (id: string) => {
    setWallpaper(id);
    void setSetting(SETTING_KEYS.wallpaper, id);
  };

  const applyTheme = (dark: boolean) => {
    void setSetting(SETTING_KEYS.theme, dark ? 'dark' : 'light');
  };

  const [confirmPower, setConfirmPower] = useState<'sleep' | 'reboot' | 'shutdown' | null>(null);
  const [powerStatus, setPowerStatus] = useState<string | null>(null);

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const handlePowerAction = async () => {
    if (!confirmPower) return;
    const action = confirmPower;
    setConfirmPower(null);
    try {
      if (action === 'sleep') {
        setPowerStatus('Entering sleep mode...');
        await echo.sleep();
      } else if (action === 'reboot') {
        setPowerStatus('Rebooting system...');
        await echo.reboot();
      } else if (action === 'shutdown') {
        setPowerStatus('Shutting down system...');
        await echo.shutdown();
      }
    } catch (err) {
      console.error('Power action failed:', err);
      setPowerStatus('Power command failed.');
      setTimeout(() => setPowerStatus(null), 3000);
    }
  };

  return (
    <div
      data-window-id={windowId}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-background)',
        minHeight: 0,
      }}
    >
      <div style={{ flex: 1, minHeight: 0 }}>
        <RepanelStack
          activeIndex={activeIndex}
          onActiveIndexChange={(index) => setActiveIndex(index)}
        >
          {/* Section rail */}
          <Repanel>
            <div style={{ paddingTop: 8, height: '100%', overflowY: 'auto' }}>
              <List>
                <ListHeader content="Settings" />
                {SECTIONS.map((s) => (
                  <Item
                    key={s.id}
                    title={s.label}
                    selected={section === s.id}
                    hoverable
                    variant="compact"
                    onClick={() => selectSection(s.id)}
                  />
                ))}
              </List>
            </div>
          </Repanel>

          {/* Section content */}
          <Repanel>
            <div style={{ height: '100%', overflowY: 'auto', padding: 20, minWidth: 0 }}>
              {section === 'appearance' && (
          <>
            <Header content="Appearance" />
            <Subheader content="Theme" />
            <Item
              title="Dark mode"
              subtitle="Applies to every Pyxis app and the desktop shell"
              rightContent={
                <Switch value={theme === 'dark'} onChange={({ value }) => applyTheme(value)} />
              }
            />
            <Divider />
            <Subheader content="Wallpaper" />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 12,
                marginTop: 8,
              }}
            >
              {WALLPAPERS.map((wp) => (
                <button
                  key={wp.id}
                  onClick={() => applyWallpaper(wp.id)}
                  aria-pressed={wallpaper === wp.id}
                  style={{
                    borderRadius: 10,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    padding: 0,
                    background: 'var(--color-surface)',
                    border:
                      wallpaper === wp.id
                        ? '2px solid var(--color-primary)'
                        : '2px solid var(--color-border-light)',
                  }}
                >
                  <div style={{ height: 80, background: wp.css }} />
                  <div
                    style={{
                      padding: 6,
                      textAlign: 'center',
                      fontSize: 12,
                      color: 'var(--color-text)',
                      display: 'flex',
                      justifyContent: 'center',
                      gap: 6,
                      alignItems: 'center',
                    }}
                  >
                    {wp.name}
                    {wallpaper === wp.id ? (
                      <Badge content="active" background="var(--color-primary)" color="#fff" />
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {section === 'network' && (
          <>
            <Header content="Network" />
            {network ? (
              <List>
                <Item
                  title="Status"
                  rightContent={
                    <Badge
                      content={network.connected ? 'Connected' : 'Disconnected'}
                      background={
                        network.connected ? 'var(--color-success)' : 'var(--color-error)'
                      }
                      color="#fff"
                    />
                  }
                />
                <Item title="SSID" rightContent={network.ssid} />
                <Item title="Type" rightContent={network.type} />
              </List>
            ) : (
              <Subheader content="Loading network status…" />
            )}
          </>
        )}

        {section === 'system' && (
          <>
            <Header content="System" />
            <List>
              <Item title="Hostname" rightContent="pyxis" />
              <Item title="Timezone" rightContent={timezone} />
            </List>
            <Divider />
            <Subheader content="Locale" />
            <div style={{ maxWidth: 320 }}>
              <Dropdown
                options={[{ value: 'en_US.UTF-8', label: 'English (US) — en_US.UTF-8' }]}
                value="en_US.UTF-8"
                onChange={() => {}}
                disabled
              />
            </div>
            <div style={{ marginTop: 16 }}>
              <Button disabled content="Check for updates" />
            </div>
            <Divider />
            <Subheader content="Power & Session" />
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginBottom: 12 }}>
              Manage system power state and user session.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={() => setConfirmPower('sleep')}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Moon size={15} /> Sleep
                </span>
              </Button>
              <Button onClick={() => setConfirmPower('reboot')}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <RotateCcw size={15} /> Restart
                </span>
              </Button>
              <Button
                variant="warning"
                onClick={() => setConfirmPower('shutdown')}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Power size={15} /> Shut Down
                </span>
              </Button>
            </div>
            {powerStatus && (
              <div style={{ marginTop: 12 }}>
                <Badge content={powerStatus} background="var(--color-primary)" color="#fff" />
              </div>
            )}
          </>
        )}

        {section === 'about' && (
          <>
            <Header content="About" />
            <List>
              {ABOUT_INFO.map(([k, v]) => (
                <Item key={k} title={k} rightContent={v} />
              ))}
            </List>
            <Divider />
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginTop: 12, lineHeight: 1.6 }}>
              Pyxis is an open-source Linux distribution inspired by Palm webOS and FirefoxOS,
              built around modern Wayland compositing (Evo) and the Remochi design system.
              Every app runs as its own process, composited by Evo and talking to the system over
              the Echo IPC bus.
            </p>
          </>
              )}
            </div>
          </Repanel>
        </RepanelStack>
      </div>

      <Dialog
        isOpen={confirmPower !== null}
        title={
          confirmPower === 'shutdown'
            ? 'Shut Down System?'
            : confirmPower === 'reboot'
              ? 'Restart System?'
              : 'Suspend System?'
        }
        type="confirm"
        confirmText={
          confirmPower === 'shutdown'
            ? 'Shut Down'
            : confirmPower === 'reboot'
              ? 'Restart'
              : 'Sleep'
        }
        cancelText="Cancel"
        onConfirm={handlePowerAction}
        onCancel={() => setConfirmPower(null)}
        onClose={() => setConfirmPower(null)}
      >
        <p style={{ margin: 0, color: 'var(--color-text)' }}>
          {confirmPower === 'shutdown'
            ? 'Are you sure you want to shut down Pyxis OS? Any unsaved work will be lost.'
            : confirmPower === 'reboot'
              ? 'Are you sure you want to restart Pyxis OS? Applications will close.'
              : 'Put Pyxis OS into low-power sleep mode?'}
        </p>
      </Dialog>
    </div>
  );
};

export default SettingsApp;

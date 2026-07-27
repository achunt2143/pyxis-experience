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
  useTheme,
} from 'remochi';
import {
  useEcho,
  getSetting,
  setSetting,
  SETTING_KEYS,
  WALLPAPERS,
} from '@pyxis/app-sdk';

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
  ['Operating System', 'GeckoOS 0.1.0'],
  ['Desktop Shell', 'Bloom (Pyxis) 0.1.0'],
  ['UI Kit', 'remochi 0.3.0'],
  ['Kernel', 'Linux 6.6.0-gecko'],
  ['Architecture', 'x86_64'],
  ['Compositor', 'Evo (Smithay / Wayland)'],
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

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

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
                <Toggle checked={theme === 'dark'} onChange={() => applyTheme(theme !== 'dark')} />
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
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginTop: 12 }}>
              GeckoOS is a custom Linux-based operating system focused on Wayland
              compositing and webOS-inspired UI patterns. Every Pyxis app runs as
              its own process, composited by Evo and talking to the system over
              the Echo IPC bus.
            </p>
          </>
              )}
            </div>
          </Repanel>
        </RepanelStack>
      </div>
    </div>
  );
};

export default SettingsApp;

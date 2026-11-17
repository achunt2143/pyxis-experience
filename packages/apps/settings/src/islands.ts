// Settings' adapted kinds, collected into Settings' own pack (registerIsland.ts).
import { adaptIsland } from '@pyxis/app-sdk/duyo';
import {
  AccountRoster,
  AppPermissionsCard,
  DisplayCard,
  NetworkConfigCard,
  PowerBrightnessCard,
  PrivilegedAccessCard,
  Scrubber,
  SystemDiagnosticsCard,
  WallpaperGrid,
  WallpaperPreview,
  ZoneList,
} from './IslandViews';
import { registerIsland } from './registerIsland';

type Props = Record<string, unknown>;

export const wallpaperGridEntry = adaptIsland({
  name: 'Settings.WallpaperGrid',
  component: WallpaperGrid,
  published: { wallpaper: 'daylight', motion: 'flow', pinned: null },
  events: { onPick: '' },
  props: (node): Props => ({
    wallpaper: node.get('wallpaper'),
    motion: node.get('motion'),
    pinned: node.get('pinned'),
    onPick: (id: string) => node['doPick']({ id }),
  }),

});

export const wallpaperPreviewEntry = adaptIsland({
  name: 'Settings.WallpaperPreview',
  component: WallpaperPreview,
  published: { wallpaper: 'daylight', motion: 'flow', time: null, label: '', pill: '' },
  props: (node): Props => ({
    wallpaper: node.get('wallpaper'),
    motion: node.get('motion'),
    time: node.get('time'),
    label: node.get('label'),
    pill: node.get('pill'),
  }),

});

export const scrubberEntry = adaptIsland({
  name: 'Settings.Scrubber',
  component: Scrubber,
  published: { shownMinutes: 0, scrubbing: false, pinned: null, hour24: false },
  events: { onScrub: '' },
  props: (node): Props => ({
    shownMinutes: node.get('shownMinutes'),
    scrubbing: node.get('scrubbing'),
    pinned: node.get('pinned'),
    hour24: node.get('hour24'),
    onScrub: (minutes: number | null) => node['doScrub']({ minutes }),
  }),

});

export const zoneListEntry = adaptIsland({
  name: 'Settings.ZoneList',
  component: ZoneList,
  published: { results: [], loading: true, emptyText: '', grouped: true, currentZone: '', pending: null },
  events: { onChoose: '' },
  props: (node): Props => ({
    results: node.get('results'),
    loading: node.get('loading'),
    emptyText: node.get('emptyText'),
    grouped: node.get('grouped'),
    currentZone: node.get('currentZone'),
    pending: node.get('pending'),
    onChoose: (id: string) => node['doChoose']({ id }),
  }),

});

export const accountRosterEntry = adaptIsland({
  name: 'Settings.AccountRoster',
  component: AccountRoster,
  published: { accounts: [], activeUser: 'geckouser', busyUser: null, confirmingUser: null },
  events: { onSwitch: '', onDelete: '', onAskDelete: '', onCancelDelete: '' },
  props: (node): Props => ({
    accounts: node.get('accounts'),
    activeUser: node.get('activeUser'),
    busyUser: node.get('busyUser'),
    confirmingUser: node.get('confirmingUser'),
    onSwitch: (user: string) => node['doSwitch']({ user }),
    onDelete: (user: string) => node['doDelete']({ user }),
    onAskDelete: (user: string) => node['doAskDelete']({ user }),
    onCancelDelete: () => node['doCancelDelete']({}),
  }),
});

export const privilegedAccessCardEntry = adaptIsland({
  name: 'Settings.PrivilegedAccessCard',
  component: PrivilegedAccessCard,
  published: {},
  props: (): Props => ({}),
});

export const appPermissionsCardEntry = adaptIsland({
  name: 'Settings.AppPermissionsCard',
  component: AppPermissionsCard,
  published: {},
  props: (): Props => ({}),
});

export const displayCardEntry = adaptIsland({
  name: 'Settings.DisplayCard',
  component: DisplayCard,
  published: {},
  props: (): Props => ({}),
});

export const powerBrightnessCardEntry = adaptIsland({
  name: 'Settings.PowerBrightnessCard',
  component: PowerBrightnessCard,
  published: {},
  props: (): Props => ({}),
});

export const networkConfigCardEntry = adaptIsland({
  name: 'Settings.NetworkConfigCard',
  component: NetworkConfigCard,
  published: {},
  props: (): Props => ({}),
});

export const systemDiagnosticsCardEntry = adaptIsland({
  name: 'Settings.SystemDiagnosticsCard',
  component: SystemDiagnosticsCard,
  published: {},
  props: (): Props => ({}),
});

for (const entry of [
  wallpaperGridEntry,
  wallpaperPreviewEntry,
  scrubberEntry,
  zoneListEntry,
  accountRosterEntry,
  privilegedAccessCardEntry,
  appPermissionsCardEntry,
  displayCardEntry,
  powerBrightnessCardEntry,
  networkConfigCardEntry,
  systemDiagnosticsCardEntry,
]) {
  registerIsland(entry);
}

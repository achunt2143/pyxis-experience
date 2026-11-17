import { Accessibility, Clock, Cpu, Info, Palette, UserRound, Volume2, Wifi } from 'lucide-react';
import type { SystemInfo } from './about';

const RAIL_INK = 'var(--mochi-text-muted)';
const RAIL_SURFACE = 'var(--mochi-hover)';

/** The rail's sections, in order. `icon` is the lucide component (for the rail's React glyph), `iconName` its name for pyxis.Icon. */
export const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: Palette, iconName: 'Palette', color: RAIL_INK, bg: RAIL_SURFACE, kind: 'Settings.Appearance' },
  { id: 'sound', label: 'Sound', icon: Volume2, iconName: 'Volume2', color: RAIL_INK, bg: RAIL_SURFACE, kind: 'Settings.Sound' },
  { id: 'accessibility', label: 'Accessibility', icon: Accessibility, iconName: 'Accessibility', color: RAIL_INK, bg: RAIL_SURFACE, kind: 'Settings.Accessibility' },
  { id: 'network', label: 'Network', icon: Wifi, iconName: 'Wifi', color: RAIL_INK, bg: RAIL_SURFACE, kind: 'Settings.Network' },
  { id: 'datetime', label: 'Date & Time', icon: Clock, iconName: 'Clock', color: RAIL_INK, bg: RAIL_SURFACE, kind: 'Settings.DateTime' },
  { id: 'users', label: 'Users & Lock', icon: UserRound, iconName: 'UserRound', color: RAIL_INK, bg: RAIL_SURFACE, kind: 'Settings.Users' },
  { id: 'system', label: 'System', icon: Cpu, iconName: 'Cpu', color: RAIL_INK, bg: RAIL_SURFACE, kind: 'Settings.System' },
  { id: 'about', label: 'About', icon: Info, iconName: 'Info', color: RAIL_INK, bg: RAIL_SURFACE, kind: 'Settings.About' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];
export type SectionDef = (typeof SECTIONS)[number];

export const isSectionId = (value: unknown): value is SectionId => SECTIONS.some((s) => s.id === value);

/** "Pyxis 0.1.0", from `system.getInfo`'s os version when it has one. `info` is undefined while asking, null when the system service didn't answer. */
export function footerText(info: SystemInfo | null | undefined): string {
  const version = info?.os?.version?.trim();
  return version && !/^unknown$/i.test(version) ? `Pyxis OS ${version}` : 'Pyxis OS';
}

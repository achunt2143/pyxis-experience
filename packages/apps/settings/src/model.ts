import { Accessibility, Clock, Cpu, Info, Palette, Volume2, Wifi } from 'lucide-react';
import type { SystemInfo } from './about';

/** The rail's sections, in order. `icon` is the lucide component (for the rail's React glyph), `iconName` its name for pyxis.Icon. */
export const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: Palette, iconName: 'Palette', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', kind: 'Settings.Appearance' },
  { id: 'sound', label: 'Sound', icon: Volume2, iconName: 'Volume2', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', kind: 'Settings.Sound' },
  { id: 'accessibility', label: 'Accessibility', icon: Accessibility, iconName: 'Accessibility', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', kind: 'Settings.Accessibility' },
  { id: 'network', label: 'Network', icon: Wifi, iconName: 'Wifi', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', kind: 'Settings.Network' },
  { id: 'datetime', label: 'Date & Time', icon: Clock, iconName: 'Clock', color: '#0ea5e9', bg: 'rgba(14, 165, 233, 0.15)', kind: 'Settings.DateTime' },
  { id: 'system', label: 'System', icon: Cpu, iconName: 'Cpu', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', kind: 'Settings.System' },
  { id: 'about', label: 'About', icon: Info, iconName: 'Info', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', kind: 'Settings.About' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];
export type SectionDef = (typeof SECTIONS)[number];

export const isSectionId = (value: unknown): value is SectionId => SECTIONS.some((s) => s.id === value);

/** "Pyxis 0.1.0", from `system.getInfo`'s os version when it has one. `info` is undefined while asking, null when the system service didn't answer. */
export function footerText(info: SystemInfo | null | undefined): string {
  const version = info?.os?.version?.trim();
  return version && !/^unknown$/i.test(version) ? `Pyxis OS ${version}` : 'Pyxis OS';
}

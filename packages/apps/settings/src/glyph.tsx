// The section rail's icon badge. remochi's Item takes its `icon` as a React node, which a
// Duyo spec (data) cannot hold, so RailRow's code-behind puts this element in the Item's
// `icon` property (a published property can hold any value).
import type { ComponentType } from 'react';
import {
  Clock,
  Eye,
  EyeOff,
  Hash,
  KeyRound,
  Lock,
  Mic,
  Moon,
  Palette,
  PanelBottom,
  PanelLeft,
  Power,
  Shield,
  Sun,
  SunMoon,
  Sunrise,
  Volume2,
  Waves,
  Wifi,
  WifiOff,
  type LucideProps,
} from 'lucide-react';

const SETTING_ICONS: Record<string, ComponentType<LucideProps>> = {
  Clock,
  Eye,
  EyeOff,
  Hash,
  KeyRound,
  Lock,
  Mic,
  Moon,
  Palette,
  PanelBottom,
  PanelLeft,
  Power,
  Shield,
  Sun,
  SunMoon,
  Sunrise,
  Volume2,
  Waves,
  Wifi,
  WifiOff,
};

export function RailGlyph({
  icon: Icon,
  color,
  bg,
  selected,
}: {
  icon: ComponentType<LucideProps>;
  color: string;
  bg: string;
  selected: boolean;
}) {
  return (
    <div
      style={{
        width: '28px',
        height: '28px',
        borderRadius: '11px 2px 11px 11px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: selected ? 'var(--mochi-primary)' : bg,
        color: selected ? 'var(--mochi-primary-text, #ffffff)' : color,
        boxShadow: selected
          ? 'inset 0 1px 0 rgba(255, 255, 255, 0.25)'
          : 'inset 0 0 0 1px var(--mochi-border)',
        transition: 'all 0.15s ease',
      }}
    >
      <Icon size={15} />
    </div>
  );
}

/** Lucide icon element for Remochi `Item` icon or inline label slots. */
export function SettingGlyph({
  name,
  size = 16,
  selected = false,
  color,
}: {
  name: string;
  size?: number;
  selected?: boolean;
  color?: string;
}) {
  const Icon = SETTING_ICONS[name];
  if (!Icon) return null;
  return (
    <Icon
      size={size}
      style={{
        color: color ?? (selected ? 'var(--mochi-primary)' : 'var(--mochi-text-muted)'),
        flexShrink: 0,
      }}
    />
  );
}

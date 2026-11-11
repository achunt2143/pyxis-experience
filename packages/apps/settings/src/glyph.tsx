// The section rail's icon badge. remochi's Item takes its `icon` as a React node, which a
// Duyo spec (data) cannot hold, so RailRow's code-behind puts this element in the Item's
// `icon` property (a published property can hold any value).
import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';

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
        background: selected ? 'var(--mochi-primary, #2f6fed)' : bg,
        color: selected ? '#ffffff' : color,
        transition: 'all 0.15s ease',
      }}
    >
      <Icon size={15} />
    </div>
  );
}

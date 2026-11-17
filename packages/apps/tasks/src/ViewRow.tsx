import { adaptIsland } from '@pyxis/app-sdk/duyo';
import {
  AlertCircle,
  Briefcase,
  Calendar,
  CheckCircle2,
  Inbox,
  ListTodo,
  ShoppingBag,
  User,
  type LucideIcon,
} from 'lucide-react';
import { Badge, Item } from 'remochi';
import { registerIsland } from './islands';

/** What the lists panel gives a row. */
export interface ViewItem {
  id: string;
  label: string;
  icon: string;
  group: 'smart' | 'custom';
  count: number;
  selected: boolean;
}

const ICONS: Record<string, LucideIcon> = { ListTodo, Calendar, AlertCircle, CheckCircle2, Inbox, Briefcase, User, ShoppingBag };

/** A sidebar entry: remochi's Item with the icon tile and a count badge, as one adapted row. */
export function ViewRowView({ item }: { item: ViewItem | null }) {
  if (!item) return null;
  const Icon = ICONS[item.icon] ?? ListTodo;
  const sel = item.selected;
  return (
    <Item
      title={item.label}
      icon={
        <div
          style={{
            width: '26px',
            height: '26px',
            borderRadius: '11px 2px 11px 11px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: sel ? 'var(--mochi-primary)' : 'var(--mochi-hover)',
            color: sel
              ? 'var(--mochi-primary-text)'
              : item.group === 'smart'
                ? 'var(--mochi-primary)'
                : 'var(--mochi-text-muted)',
            transition: 'all 0.15s ease',
          }}
        >
          <Icon size={14} />
        </div>
      }
      rightContent={<Badge content={item.count} />}
      selected={sel}
      hoverable
      variant="compact"
    />
  );
}

registerIsland(
  adaptIsland({
    name: 'Tasks.ViewRow',
    component: ViewRowView,
    kind: 'pyxis.Row',
    props: (node) => ({ item: node.get('item') as ViewItem | null }),
  })
);

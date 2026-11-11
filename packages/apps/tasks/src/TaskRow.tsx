import { adapt } from '@duyojs/duyo/react';
import { FileText } from 'lucide-react';
import { Checkbox } from 'remochi';
import { PRIORITY_CONFIG, fmtDisplayDate, getTodayString, type Task } from './model';
import { registerIsland } from './islands';

interface RowProps {
  task: Task | null;
  selected: boolean;
  onToggle: (id: string, checked: boolean) => void;
}

/** One task in the stream: a single adapted React row, so a long list costs one node per task. */
export function TaskRowView({ task: t, selected: isSelected, onToggle }: RowProps) {
  if (!t) return null;
  const todayStr = getTodayString();
  const isOverdue = t.dueDate && t.dueDate < todayStr && !t.done;
  const isDueToday = t.dueDate && t.dueDate === todayStr && !t.done;
  const priorityCfg = PRIORITY_CONFIG[t.priority || 'none'];
  return (
    <div
      className="tasks-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 14px',
        borderRadius: '12px',
        background: isSelected
          ? 'var(--mochi-primary-soft, rgba(47, 111, 237, 0.12))'
          : 'var(--color-surface, var(--mochi-surface, #ffffff))',
        border: `1.5px solid ${
          isSelected ? 'var(--mochi-primary, #2f6fed)' : 'var(--color-border, var(--mochi-border, #e5e7eb))'
        }`,
        cursor: 'pointer',
        transition: 'all 0.12s ease',
        opacity: t.done ? 0.65 : 1,
      }}
    >
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={t.done} onChange={({ checked }) => onToggle(t.id, checked)} />
      </div>

      {t.priority && t.priority !== 'none' && (
        <div
          title={`Priority: ${priorityCfg.label}`}
          style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: priorityCfg.color, flexShrink: 0 }}
        />
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span
          className="tasks-row-text"
          style={{
            fontSize: '0.86rem',
            fontWeight: isSelected ? 600 : 500,
            textDecoration: t.done ? 'line-through' : 'none',
            color: isSelected ? 'var(--mochi-primary, #2f6fed)' : 'var(--color-text, var(--mochi-text, #111827))',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {t.text}
        </span>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.74rem',
            color: 'var(--color-text-secondary, #64748b)',
          }}
        >
          {t.dueDate && (
            <span
              style={{
                color: isOverdue ? '#ef4444' : isDueToday ? '#f59e0b' : 'inherit',
                fontWeight: isOverdue || isDueToday ? 600 : 400,
              }}
            >
              {isOverdue ? `Overdue (${fmtDisplayDate(t.dueDate, todayStr)})` : fmtDisplayDate(t.dueDate, todayStr)}
            </span>
          )}
          {t.category && <span>• {t.category}</span>}
          {t.notes && <FileText size={11} style={{ opacity: 0.6 }} />}
        </div>
      </div>
    </div>
  );
}

registerIsland(
  adapt({
    name: 'Tasks.Row',
    component: TaskRowView,
    kind: 'pyxis.Row',
    published: { selected: false },
    events: { onToggle: '' },
    props: (node) => ({
      task: node.get('item') as Task | null,
      selected: node.get('selected') === true,
      onToggle: (id: string, checked: boolean) => node.bubble('onToggle', { id, checked }),
    }),
  })
);

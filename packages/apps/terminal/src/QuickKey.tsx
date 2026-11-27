import React from 'react';
import { Button } from 'remochi';
import type { QuickKeyDef } from './model';

interface QuickKeyButtonProps {
  item: QuickKeyDef | null;
  onSend: (value: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * One key of the keys row: Remochi's caps Button inside a span that cancels `mousedown`,
 * so the xterm view keeps keyboard focus while a key is pressed.
 */
export const QuickKeyButton: React.FC<QuickKeyButtonProps> = ({ item, onSend, className, style, ...rest }) => {
  if (!item) return null;
  return (
    <span
      {...rest}
      className={className}
      style={style}
      onMouseDown={(e) => {
        e.preventDefault();
      }}
    >
      <Button title={item.hint || `Send ${item.label}`} aria-label={item.hint || item.label} onClick={() => onSend(item.value)}>
        {item.label}
      </Button>
    </span>
  );
};

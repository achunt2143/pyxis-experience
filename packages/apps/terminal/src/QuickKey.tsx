import React from 'react';
import type { QuickKeyDef } from './model';

interface QuickKeyButtonProps {
  item: QuickKeyDef | null;
  onSend: (value: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * One key of the helper ribbon: a compact single-button leaf that cancels `onMouseDown`
 * so the xterm view keeps keyboard focus while a quick key is pressed.
 */
export const QuickKeyButton: React.FC<QuickKeyButtonProps> = ({ item, onSend, className, style, ...rest }) => {
  if (!item) return null;
  return (
    <button
      {...rest}
      type="button"
      className={className}
      style={style}
      title={item.hint || `Send ${item.label}`}
      onMouseDown={(e) => {
        e.preventDefault();
      }}
      onClick={() => onSend(item.value)}
    >
      {item.label}
    </button>
  );
};

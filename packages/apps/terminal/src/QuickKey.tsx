import React from 'react';
import type { QuickKeyDef } from './model';

interface QuickKeyButtonProps {
  item: QuickKeyDef | null;
  onSend: (value: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * One key of the helper ribbon. A React button rather than a Duyo node tree because of
 * `onMouseDown`: the old ribbon cancelled it so the xterm view kept the keyboard focus
 * while a key was pressed, and a Duyo control only maps pointer events (cancelling
 * `pointerdown` does not reliably stop the focus change). The same code, the same
 * behaviour, and the row is one node.
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

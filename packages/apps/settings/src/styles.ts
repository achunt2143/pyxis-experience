import type React from 'react';

/** A Mochi panel surface card matching Remochi Item geometry and theme contrast. */
export const mochiCardStyle: React.CSSProperties = {
  background: 'var(--mochi-panel-bg)',
  border: '1px solid var(--mochi-border)',
  borderRadius: 'var(--mochi-corner-sm, 10px)',
  padding: '12px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  boxShadow: 'none',
  width: '100%',
  minWidth: 0,
  maxWidth: '100%',
  boxSizing: 'border-box',
};

export const groupboxStyle: React.CSSProperties = mochiCardStyle;

export const groupboxHeaderStyle: React.CSSProperties = {
  fontFamily: '"Mochi Medium", sans-serif',
  fontSize: '0.92rem',
  fontWeight: 700,
  fontStyle: 'italic',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--mochi-text-muted)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  minWidth: 0,
  maxWidth: '100%',
};

export const secondaryText: React.CSSProperties = {
  fontSize: '0.76rem',
  color: 'var(--mochi-text-muted)',
};

export const fieldLabelStyle: React.CSSProperties = {
  color: 'var(--mochi-text-muted)',
  fontSize: '0.74rem',
  fontWeight: 600,
};

export const PRIMARY = 'var(--mochi-primary)';
export const PRIMARY_SOFT = 'var(--mochi-primary-soft)';
export const BORDER = 'var(--mochi-border)';
export const SURFACE = 'var(--mochi-panel-bg, var(--mochi-surface))';

/** Remochi Item-aligned surface styling for grouped cards in islands. */
export const recessedRowStyle: React.CSSProperties = {
  borderRadius: 'var(--mochi-corner-sm, 10px)',
  border: '1px solid var(--mochi-border)',
  background: 'var(--mochi-panel-bg)',
};

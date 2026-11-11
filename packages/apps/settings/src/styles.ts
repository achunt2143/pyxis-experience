import type React from 'react';

/** A Mochi groupbox: one card of related settings. */
export const groupboxStyle: React.CSSProperties = {
  background: 'var(--color-surface, var(--mochi-surface, #ffffff))',
  border: '1px solid var(--color-border, var(--mochi-border, #e5e7eb))',
  borderRadius: '14px',
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
};

export const groupboxHeaderStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: 'var(--color-text-secondary, #64748b)',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

export const secondaryText: React.CSSProperties = {
  fontSize: '0.76rem',
  color: 'var(--color-text-secondary, #64748b)',
};

export const fieldLabelStyle: React.CSSProperties = {
  color: 'var(--color-text-secondary, #64748b)',
  fontSize: '0.74rem',
  fontWeight: 600,
};

export const PRIMARY = 'var(--mochi-primary, #2f6fed)';
export const BORDER = 'var(--color-border, var(--mochi-border, #e5e7eb))';
export const SURFACE = 'var(--color-surface, var(--mochi-surface, #ffffff))';

export const textInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: '8px',
  border: `1px solid ${BORDER}`,
  background: SURFACE,
  color: 'inherit',
  font: 'inherit',
  fontSize: '0.84rem',
  userSelect: 'text',
};

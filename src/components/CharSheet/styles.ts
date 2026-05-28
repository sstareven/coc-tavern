import type { CSSProperties } from 'react';

export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'rgba(0,0,0,0.25)',
  border: '1px solid rgba(196,168,85,0.2)',
  borderRadius: 4,
  color: 'var(--text-light)',
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  outline: 'none',
  textAlign: 'center',
  transition: 'var(--transition-smooth)',
};

export const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontFamily: 'var(--font-ui)',
  color: 'var(--ink-subtle)',
  letterSpacing: 2,
  marginBottom: 4,
};

export const plusMinusBtn: CSSProperties = {
  width: 32,
  height: 28,
  border: '1px solid var(--brass)',
  borderRadius: 3,
  background: 'rgba(0,0,0,0.3)',
  color: 'var(--ink-subtle)',
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export const editBtn: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: '1px 2px',
  fontSize: 11,
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  color: 'rgba(200,200,200,0.22)',
  cursor: 'pointer',
  lineHeight: 1.2,
};

export const btnBase: CSSProperties = {
  padding: '8px 24px',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'rgba(196,168,85,0.3)',
  borderRadius: 4,
  background: 'rgba(196,168,85,0.08)',
  color: 'var(--gold)',
  fontFamily: 'var(--font-ui)',
  fontSize: 13,
  letterSpacing: 2,
  cursor: 'pointer',
  transition: 'var(--transition-smooth)',
};

export const btnDisabled: CSSProperties = {
  ...btnBase,
  opacity: 0.35,
  cursor: 'not-allowed',
};

export const sectionTitle: CSSProperties = {
  fontSize: 11,
  fontFamily: 'var(--font-ui)',
  color: 'var(--ink-subtle)',
  letterSpacing: 4,
  marginBottom: 12,
  textTransform: 'uppercase' as const,
  borderBottom: '1px solid rgba(196,168,85,0.12)',
  paddingBottom: 8,
};

export const thSmall: CSSProperties = {
  padding: '5px 10px',
  fontSize: 10,
  color: 'var(--ink-subtle)',
  letterSpacing: 1,
  fontFamily: 'var(--font-ui)',
  fontWeight: 600,
};

export const tdSmall: CSSProperties = {
  padding: '5px 10px',
  fontSize: 11,
  color: 'var(--text-light)',
};

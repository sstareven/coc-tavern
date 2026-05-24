interface Props {
  header: string;
  content: string;
  pageNum: string;
  isFlipping?: boolean;
}

export function LeftPage({ header, content, pageNum, isFlipping }: Props) {
  const fadeStyle = {
    opacity: isFlipping ? 0 : 1,
    transition: isFlipping ? 'opacity 0.35s ease-in' : 'opacity 0.6s ease-out 0.6s',
  };
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      padding: '28px 24px 20px 28px',
      background: 'linear-gradient(135deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
      borderTopLeftRadius: 4, borderBottomLeftRadius: 4,
      boxShadow: 'inset -1px 0 2px rgba(0,0,0,0.04)',
      color: 'var(--ink)', fontFamily: 'var(--font-body)',
      fontSize: 15, lineHeight: 1.75, position: 'relative',
    }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ink)', letterSpacing: 4, marginBottom: 16, borderBottom: '1px solid rgba(107,90,58,0.25)', paddingBottom: 10, ...fadeStyle }}>{header}</h3>
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: 6, scrollbarWidth: 'thin', scrollbarColor: 'var(--ink-faded) transparent', ...fadeStyle }}>
        <p style={{ textIndent: '2em', marginBottom: 12 }}>{content}</p>
      </div>
      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)', letterSpacing: 3, paddingTop: 10, borderTop: '1px solid rgba(107,90,58,0.15)', ...fadeStyle }}>{pageNum}</div>
    </div>
  );
}

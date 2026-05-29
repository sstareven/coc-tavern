import { useErrorModalStore } from '../../stores/useErrorModalStore';

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 1100,
  background: 'rgba(0,0,0,0.6)',
  backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const panelStyle: React.CSSProperties = {
  background: 'var(--leather)',
  border: '1px solid var(--brass)',
  borderRadius: 8,
  padding: '28px 32px',
  maxWidth: 420,
  width: '90%',
  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  fontFamily: 'var(--font-ui)',
};

const titleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: '#e8c06a',
  marginBottom: 14,
  letterSpacing: 1,
};

const messageStyle: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--text-light)',
  lineHeight: 1.8,
  whiteSpace: 'pre-line',
  marginBottom: 8,
};

const hintStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--ink-subtle, rgba(255,255,255,0.35))',
  marginBottom: 18,
};

const btnStyle: React.CSSProperties = {
  display: 'block',
  margin: '0 auto',
  padding: '8px 36px',
  border: '1px solid var(--brass)',
  borderRadius: 4,
  background: 'rgba(255,255,255,0.06)',
  color: 'var(--text-light)',
  fontSize: 12,
  fontFamily: 'var(--font-ui)',
  cursor: 'pointer',
  transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
  letterSpacing: 1,
};

export function ErrorModal() {
  const error = useErrorModalStore((s) => s.error);
  const dismiss = useErrorModalStore((s) => s.dismiss);

  if (!error) return null;

  return (
    <div style={overlayStyle} onClick={dismiss}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={titleStyle}>{error.title}</div>
        <div style={messageStyle}>{error.message}</div>
        <div style={hintStyle}>详细信息请查看调试日志</div>
        <button
          style={btnStyle}
          onClick={dismiss}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
            e.currentTarget.style.transform = 'scale(1.04)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = 'scale(0.97)';
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = 'scale(1.04)';
          }}
        >
          确认
        </button>
      </div>
    </div>
  );
}

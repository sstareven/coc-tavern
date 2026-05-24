import { useLorebookStore } from '../../stores/useLorebookStore';

interface Props {
  onClose: () => void;
  onEditBook: (bookId: string) => void;
}

export function WorldbookPanel({ onClose, onEditBook }: Props) {
  const books = useLorebookStore((s) => s.books);
  const addBook = useLorebookStore((s) => s.addBook);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 900,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
          border: '1px solid var(--gold)',
          borderRadius: 8,
          padding: '24px 28px',
          minWidth: 480,
          maxWidth: 600,
          width: '90%',
          boxShadow: '0 0 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Title */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 20, borderBottom: '1px solid rgba(196,168,85,0.18)', paddingBottom: 12,
        }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--gold)', letterSpacing: 4, margin: 0 }}>
            世界书 / WORLDBOOKS
          </h3>
          <button onClick={onClose} style={closeBtnStyle}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--brass)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'transparent'; }}
          >✕</button>
        </div>

        {/* Book list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(books).map(([id, book]) => (
            <div
              key={id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px', border: '1px solid rgba(196,168,85,0.12)',
                borderRadius: 4, background: 'rgba(0,0,0,0.15)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 14, color: 'var(--text-light)', fontFamily: 'var(--font-display)', letterSpacing: 2 }}>
                  {book.name}
                </span>
                <span style={{ fontSize: 10, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)' }}>
                  {Object.keys(book.entries).length} 条词条
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => onEditBook(id)} style={actionBtnStyle}>
                  编辑
                </button>
                <button style={{ ...actionBtnStyle, color: 'var(--blood)', borderColor: 'rgba(139,58,58,0.3)' }}>
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Create new */}
        <button onClick={() => {
          const newId = addBook('新建世界书');
          onEditBook(newId);
        }} style={{
          width: '100%', marginTop: 16, padding: '10px 0',
          border: '1px dashed var(--brass)', borderRadius: 4,
          background: 'transparent', color: 'var(--ink-subtle)',
          fontFamily: 'var(--font-ui)', fontSize: 12, letterSpacing: 3, cursor: 'pointer',
          transition: 'var(--transition-smooth)',
        }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; e.currentTarget.style.color = 'var(--ink-subtle)'; }}
        >
          + 新建世界书
        </button>
      </div>
    </div>
  );
}

const closeBtnStyle: React.CSSProperties = {
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid transparent', borderRadius: 3, background: 'transparent',
  color: 'var(--ink-subtle)', fontSize: 16, cursor: 'pointer', fontFamily: 'var(--font-ui)',
};

const actionBtnStyle: React.CSSProperties = {
  padding: '5px 14px', border: '1px solid rgba(196,168,85,0.2)',
  borderRadius: 3, background: 'transparent', color: 'var(--ink-subtle)',
  fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 1, cursor: 'pointer',
};

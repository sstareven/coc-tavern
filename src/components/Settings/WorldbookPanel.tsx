import { useRef } from 'react';
import { useLorebookStore } from '../../stores/useLorebookStore';
import { exportWorldBookToST, importWorldBookFromST } from '../../sillytavern/format-converter';

interface Props {
  onClose: () => void;
  onEditBook: (bookId: string) => void;
}

export function WorldbookPanel({ onClose, onEditBook }: Props) {
  const books = useLorebookStore((s) => s.books);
  const addBook = useLorebookStore((s) => s.addBook);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = (bookId: string) => {
    const book = books[bookId];
    if (!book) return;
    const json = exportWorldBookToST(book);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${book.name}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const book = importWorldBookFromST(reader.result as string);
      if (book) {
        const id = `wb-${Date.now()}`;
        useLorebookStore.setState((s) => ({ books: { ...s.books, [id]: book } }));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

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
                <button onClick={() => handleExport(id)} style={actionBtnStyle} title="ST格式导出">
                  导出
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Import ST format */}
        <input type="file" accept=".json" ref={fileRef} onChange={handleFileImport} style={{ display: 'none' }} />
        <button onClick={() => fileRef.current?.click()} style={{
          width: '100%', marginTop: 8, padding: '10px 0',
          border: '1px dashed var(--success)', borderRadius: 4,
          background: 'transparent', color: 'var(--success)',
          fontFamily: 'var(--font-ui)', fontSize: 12, letterSpacing: 3, cursor: 'pointer',
          transition: 'var(--transition-smooth)',
        }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--success-bright)'; e.currentTarget.style.color = 'var(--success-bright)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--success)'; e.currentTarget.style.color = 'var(--success)'; }}
        >
          导入 ST 世界书
        </button>

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

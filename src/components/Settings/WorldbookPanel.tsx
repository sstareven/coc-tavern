import { useState, useRef } from 'react';
import { useLorebookStore, AUTO_SUMMARY_BOOK_ID } from '../../stores/useLorebookStore';
import { useTavernHelperStore } from '../../stores/useTavernHelperStore';
import { useChatStore } from '../../stores/useChatStore';
import { exportWorldBookToST, importWorldBookFromST } from '../../sillytavern/format-converter';
import { closeBtnStyle } from '../../styles/panelStyles';

interface Props {
  onClose: () => void;
  onEditBook: (bookId: string) => void;
}

export function WorldbookPanel({ onClose, onEditBook }: Props) {
  const books = useLorebookStore((s) => s.books);
  const addBook = useLorebookStore((s) => s.addBook);
  const toggleBook = useLorebookStore((s) => s.toggleBook);
  const setBookScope = useLorebookStore((s) => s.setBookScope);
  const activeSession = useChatStore((s) => s.sessions.find((c) => c.id === s.activeId));
  const toggleSessionLorebook = useChatStore((s) => s.toggleSessionLorebook);
  const sessionLorebookIds = activeSession?.lorebookIds ?? [];
  const thOptimize = useTavernHelperStore((s) => s.optimize);
  const forceWorldbook = thOptimize.forceWorldbookSettings;
  const fileRef = useRef<HTMLInputElement>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

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
        const fileName = file.name.replace(/\.json$/i, '');
        useLorebookStore.getState().importBook({ ...book, name: book.name !== '导入的世界书' ? book.name : fileName });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDeleteBook = (bookId: string) => {
    const { books } = useLorebookStore.getState();
    const remaining = Object.entries(books).filter(([id]) => id !== bookId);
    if (remaining.length === 0) {
      addBook('默认世界书');
    }
    useLorebookStore.getState().deleteBook(bookId);
    setDeleteConfirm(null);
  };

  const startRename = (bookId: string) => {
    setRenameId(bookId);
    setRenameValue(books[bookId]?.name ?? '');
  };

  const submitRename = () => {
    if (renameId && renameValue.trim()) {
      useLorebookStore.setState((s) => ({
        books: {
          ...s.books,
          [renameId]: { ...s.books[renameId], name: renameValue.trim() },
        },
      }));
    }
    setRenameId(null);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
        border: '1px solid var(--gold)', borderRadius: 8,
        padding: '24px 28px', minWidth: 480, maxWidth: 600, width: '90%',
        boxShadow: '0 0 80px rgba(0,0,0,0.6)',
      }}>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(books).map(([id, book]) => {
            const isAutoSummary = id === AUTO_SUMMARY_BOOK_ID;
            return (
            <div key={id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 16px', border: '1px solid rgba(196,168,85,0.12)',
              borderRadius: 4, background: 'rgba(0,0,0,0.15)',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                {renameId === id && !isAutoSummary ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setRenameId(null); }}
                      autoFocus
                      style={{ ...inputStyle, flex: 1 }}
                    />
                    <button onClick={submitRename} style={miniBtn}>✓</button>
                    <button onClick={() => setRenameId(null)} style={miniBtn}>✕</button>
                  </div>
                ) : (
                  <span style={{ fontSize: 14, color: isAutoSummary ? 'var(--gold)' : 'var(--text-light)', fontFamily: 'var(--font-display)', letterSpacing: 2, cursor: isAutoSummary ? 'default' : 'pointer' }}
                    onClick={() => !isAutoSummary && startRename(id)} title={isAutoSummary ? '自动管理，不可编辑' : '点击修改标题'}>
                    {book.name}
                  </span>
                )}
                <span style={{ fontSize: 10, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)' }}>
                  {Object.keys(book.entries).length} 条词条{isAutoSummary ? ' · 自动生成' : ''}
                </span>
                {!isAutoSummary && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <select value={book.scope ?? 'global'} onChange={(e) => setBookScope(id, e.target.value as 'global' | 'chat')}
                      style={scopeSelectStyle}>
                      <option value="global">全局</option>
                      <option value="chat">会话专属</option>
                    </select>
                    {(book.scope ?? 'global') === 'chat' && (
                      activeSession ? (
                        <label style={{
                          display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, cursor: 'pointer',
                          color: sessionLorebookIds.includes(id) ? 'var(--success)' : 'var(--ink-subtle)',
                          fontFamily: 'var(--font-ui)',
                        }}>
                          <input type="checkbox" checked={sessionLorebookIds.includes(id)} onChange={() => toggleSessionLorebook(id)} style={{ accentColor: 'var(--gold)' }} />
                          绑定当前会话
                        </label>
                      ) : (
                        <span style={{ fontSize: 9, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)' }}>无活动会话</span>
                      )
                    )}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                {!isAutoSummary && <button onClick={() => onEditBook(id)} style={actionBtnStyle}>编辑</button>}
                {!isAutoSummary && <button onClick={() => handleExport(id)} style={actionBtnStyle} title="ST格式导出">导出</button>}
                {!isAutoSummary && (deleteConfirm === id ? (
                  <>
                    <button onClick={() => handleDeleteBook(id)} style={{ ...actionBtnStyle, color: 'var(--blood)', borderColor: 'var(--blood)' }}>确认删除</button>
                    <button onClick={() => setDeleteConfirm(null)} style={actionBtnStyle}>取消</button>
                  </>
                ) : (
                  <button onClick={() => setDeleteConfirm(id)} style={{ ...actionBtnStyle, color: 'var(--blood)' }}>删除</button>
                ))}
                <div style={{ display: 'flex', borderRadius: 3, overflow: 'hidden', border: '1px solid var(--brass)', opacity: forceWorldbook ? 0.6 : 1 }}>
                  <button onClick={() => { if (!forceWorldbook && book.enabled === false) toggleBook(id); }} style={{
                    padding: '4px 8px', border: 'none', cursor: forceWorldbook ? 'default' : book.enabled === false ? 'pointer' : 'default',
                    background: forceWorldbook || book.enabled !== false ? 'var(--success)' : 'transparent',
                    color: forceWorldbook || book.enabled !== false ? '#fff' : 'var(--ink-subtle)',
                    fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 1,
                    transition: 'background 0.15s',
                  }}>开</button>
                  <button onClick={() => { if (!forceWorldbook && book.enabled !== false) toggleBook(id); }} style={{
                    padding: '4px 8px', border: 'none', cursor: forceWorldbook ? 'default' : book.enabled !== false ? 'pointer' : 'default',
                    background: !forceWorldbook && book.enabled === false ? 'var(--blood)' : 'transparent',
                    color: !forceWorldbook && book.enabled === false ? '#fff' : 'var(--ink-subtle)',
                    fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 1,
                    transition: 'background 0.15s',
                  }}>关</button>
                </div>
                {forceWorldbook && <span style={{ fontSize: 9, color: 'var(--gold)', fontFamily: 'var(--font-ui)' }}>已锁定</span>}
              </div>
            </div>
            );
          })}
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

        <button onClick={() => {
          const newId = addBook('新建世界书');
          onEditBook(newId);
        }} style={{
          width: '100%', marginTop: 8, padding: '10px 0',
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

const actionBtnStyle: React.CSSProperties = {
  padding: '4px 10px', border: '1px solid rgba(196,168,85,0.2)',
  borderRadius: 3, background: 'transparent', color: 'var(--ink-subtle)',
  fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 1, cursor: 'pointer',
};

const miniBtn: React.CSSProperties = {
  padding: '3px 8px', border: '1px solid var(--brass)', borderRadius: 3,
  background: 'rgba(0,0,0,0.2)', color: 'var(--text-light)',
  fontFamily: 'var(--font-ui)', fontSize: 11, cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  padding: '4px 8px', borderRadius: 3, border: '1px solid var(--brass)',
  background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)',
  fontFamily: 'var(--font-ui)', fontSize: 12, outline: 'none',
};

const scopeSelectStyle: React.CSSProperties = {
  padding: '1px 4px', borderRadius: 3, border: '1px solid rgba(196,168,85,0.3)',
  background: 'rgba(0,0,0,0.3)', color: 'var(--ink-subtle)',
  fontFamily: 'var(--font-ui)', fontSize: 9, outline: 'none', cursor: 'pointer',
};

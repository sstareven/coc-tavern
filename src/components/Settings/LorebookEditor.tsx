import { useState, useEffect } from 'react';
import { useLorebookStore } from '../../stores/useLorebookStore';
import { usePanelStore } from '../../stores/usePanelStore';
import type { LoreEntry } from '../../types';

interface Props {
  bookId: string;
  onClose: () => void;
}

const EMPTY_ENTRY: LoreEntry = {
  name: '',
  keys: '',
  content: '',
  logic: 'AND',
  priority: 10,
};

export function LorebookEditor({ bookId, onClose }: Props) {
  const books = useLorebookStore((s) => s.books);
  const updateEntry = useLorebookStore((s) => s.updateEntry);
  const deleteEntry = useLorebookStore((s) => s.deleteEntry);
  const addEntry = useLorebookStore((s) => s.addEntry);

  const book = books[bookId];
  const entries = book ? Object.entries(book.entries) : [];
  const [selectedId, setSelectedId] = useState<string | null>(entries[0]?.[0] ?? null);
  const [form, setForm] = useState<LoreEntry>(EMPTY_ENTRY);

  // Load selected entry into form
  useEffect(() => {
    if (selectedId && book?.entries[selectedId]) {
      setForm({ ...book.entries[selectedId] });
    } else {
      setForm(EMPTY_ENTRY);
    }
  }, [selectedId, book]);

  const handleSave = () => {
    if (!selectedId || !form.name.trim()) return;
    updateEntry(bookId, selectedId, form);
  };

  const handleNew = () => {
    addEntry(bookId);
    // Find the new entry
    setTimeout(() => {
      const updatedBooks = useLorebookStore.getState().books;
      const updated = updatedBooks[bookId];
      if (updated) {
        const keys = Object.keys(updated.entries);
        const last = keys[keys.length - 1];
        if (last) setSelectedId(last);
      }
    }, 0);
  };

  const handleDelete = () => {
    if (!selectedId) return;
    deleteEntry(bookId, selectedId);
    setSelectedId(null);
  };

  if (!book) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
          <p style={{ color: 'var(--ink-subtle)', textAlign: 'center', padding: 40 }}>世界书未找到</p>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...panelStyle, minWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        {/* Header with back button + title */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 16, borderBottom: '1px solid rgba(196,168,85,0.18)', paddingBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => { usePanelStore.getState().open('worldbook'); }} style={{
              padding: '4px 12px', border: '1px solid var(--brass)', borderRadius: 3,
              background: 'transparent', color: 'var(--ink-subtle)',
              fontFamily: 'var(--font-ui)', fontSize: 11, cursor: 'pointer',
            }}>← 返回</button>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--gold)', letterSpacing: 3, margin: 0 }}>
              编辑 — {book.name}
            </h3>
          </div>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'row' }}>
        {/* Left: entry list */}
        <div style={{
          width: 200, borderRight: '1px solid rgba(196,168,85,0.12)',
          paddingRight: 16, display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          <div style={{
            fontSize: 10, color: 'var(--ink-subtle)', letterSpacing: 2, fontFamily: 'var(--font-ui)',
            marginBottom: 8, textTransform: 'uppercase',
          }}>
            词条列表
          </div>
          {entries.map(([id, entry]) => (
            <button
              key={id}
              onClick={() => setSelectedId(id)}
              style={{
                width: '100%', textAlign: 'left', padding: '8px 10px',
                border: selectedId === id ? '1px solid var(--gold)' : '1px solid transparent',
                borderRadius: 3, cursor: 'pointer',
                background: selectedId === id ? 'rgba(196,168,85,0.1)' : 'transparent',
                color: selectedId === id ? 'var(--gold)' : 'var(--text-light)',
                fontFamily: 'var(--font-ui)', fontSize: 12, letterSpacing: 1,
                transition: 'var(--transition-smooth)',
              }}
              onMouseEnter={(e) => { if (selectedId !== id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
              onMouseLeave={(e) => { if (selectedId !== id) e.currentTarget.style.background = 'transparent'; }}
            >
              {entry.name || '(未命名)'}
            </button>
          ))}
          <button onClick={handleNew} style={{
            width: '100%', marginTop: 8, padding: '8px 0',
            border: '1px dashed var(--brass)', borderRadius: 3,
            background: 'transparent', color: 'var(--ink-subtle)',
            fontFamily: 'var(--font-ui)', fontSize: 11, cursor: 'pointer',
          }}>
            + 新建词条
          </button>
        </div>

        {/* Right: entry form */}
        <div style={{ flex: 1, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2 }}>
              {book.name}
            </span>
            <button onClick={onClose} style={closeBtnStyle}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--brass)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'transparent'; }}
            >✕</button>
          </div>

          {/* Name */}
          <FieldGroup label="词条名称">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="词条名称" style={fieldInputStyle} />
          </FieldGroup>

          {/* Keys */}
          <FieldGroup label="触发关键词 (逗号分隔)">
            <input value={form.keys} onChange={(e) => setForm({ ...form, keys: e.target.value })}
              placeholder="关键词1, 关键词2" style={fieldInputStyle} />
          </FieldGroup>

          {/* Content */}
          <FieldGroup label="内容">
            <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="词条正文内容..." style={{ ...fieldInputStyle, minHeight: 100, resize: 'vertical', fontFamily: 'var(--font-body)' }} />
          </FieldGroup>

          {/* Logic + Priority row */}
          <div style={{ display: 'flex', gap: 16 }}>
            <FieldGroup label="逻辑">
              <select value={form.logic} onChange={(e) => setForm({ ...form, logic: e.target.value as LoreEntry['logic'] })}
                style={fieldInputStyle}>
                <option value="AND">AND</option>
                <option value="OR">OR</option>
                <option value="NOT">NOT</option>
              </select>
            </FieldGroup>
            <FieldGroup label="优先级">
              <input type="number" min={1} max={100} value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) || 10 })}
                style={{ ...fieldInputStyle, width: 80 }} />
            </FieldGroup>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button onClick={handleSave} style={saveBtnStyle}>保存</button>
            <button onClick={handleDelete} style={{ ...saveBtnStyle, borderColor: 'rgba(139,58,58,0.3)', color: 'var(--blood)', background: 'rgba(139,58,58,0.06)' }}>
              删除
            </button>
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
      <label style={{ fontSize: 10, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>{label}</label>
      {children}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 950,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
};

const panelStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
  border: '1px solid var(--gold)', borderRadius: 8,
  padding: '24px 28px', maxWidth: 720, width: '90%',
  boxShadow: '0 0 80px rgba(0,0,0,0.6)',
};

const closeBtnStyle: React.CSSProperties = {
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid transparent', borderRadius: 3, background: 'transparent',
  color: 'var(--ink-subtle)', fontSize: 16, cursor: 'pointer', fontFamily: 'var(--font-ui)',
};

const fieldInputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid var(--brass)',
  borderRadius: 3, background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)',
  fontFamily: 'var(--font-ui)', fontSize: 12, outline: 'none', caretColor: 'var(--gold)',
};

const saveBtnStyle: React.CSSProperties = {
  padding: '8px 24px', border: '1px solid var(--gold)', borderRadius: 3,
  background: 'rgba(196,168,85,0.1)', color: 'var(--gold)',
  fontFamily: 'var(--font-ui)', fontSize: 12, letterSpacing: 2, cursor: 'pointer',
};

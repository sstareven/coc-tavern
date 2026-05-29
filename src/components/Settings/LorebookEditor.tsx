import { useState, useRef } from 'react';
import { useLorebookStore, isBuiltinEntry } from '../../stores/useLorebookStore';
import { usePanelStore } from '../../stores/usePanelStore';
import type { LoreEntry, InsertPosition } from '../../types';
import { closeBtnStyle } from '../../styles/panelStyles';

// ── ST entry format for import/export ──
interface STEntryLike {
  uid?: number;
  key: string | string[];
  keysecondary?: string[];
  comment: string;
  content: string;
  constant: boolean;
  selective: boolean;
  order: number;
  position: number;
  disable: boolean;
  excludeRecursion: boolean;
  secondaryKeys?: string[];
  logic?: string;
  extensions?: Record<string, unknown>;
  depth?: number;
}

interface Props { bookId: string; onClose: () => void; }

const EMPTY_ENTRY: LoreEntry = {
  name: '', keys: '', content: '', logic: 'AND_ANY', priority: 10,
  disabled: false, constant: false, position: 0, depth: 0, probability: 100,
  secondaryKeys: '', scanDepth: 0, caseSensitive: 0, matchWholeWord: 0,
  groupScoring: 0, automationId: '', inclusionGroup: '', prioritizeInclusion: false,
  groupWeight: 100, sticky: 0, cooldown: 0, delay: 0,
  preventRecursion: false, delayUntilRecursion: false, excludeRecursion: false,
  ignoreReplyLimit: false,
};

const POSITION_LABELS: Record<number, string> = {
  0: '↑Char', 1: '↓Char', 2: '↑EM', 3: '↓EM', 4: '↑AN',
  5: '↓AN', 6: '系统@D', 7: '用户@D', 8: 'AI@D', 9: '锚点',
};

const POSITION_OPTIONS = [
  { label: '角色定义前 ↑Char', value: '0' },
  { label: '角色定义后 ↓Char', value: '1' },
  { label: '示例消息前 ↑EM', value: '2' },
  { label: '示例消息后 ↓EM', value: '3' },
  { label: '作者註释前 ↑AN', value: '4' },
  { label: '作者註释后 ↓AN', value: '5' },
  { label: '[系统] 插入深度@D', value: '6' },
  { label: '[用户] 插入深度@D', value: '7' },
  { label: '[AI] 插入深度@D', value: '8' },
  { label: '锚点', value: '9' },
];

export function LorebookEditor({ bookId, onClose }: Props) {
  const books = useLorebookStore((s) => s.books);
  const updateEntry = useLorebookStore((s) => s.updateEntry);
  const deleteEntry = useLorebookStore((s) => s.deleteEntry);
  const addEntry = useLorebookStore((s) => s.addEntry);

  const book = books[bookId];
  const entries = book ? Object.entries(book.entries) : [];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LoreEntry>(EMPTY_ENTRY);
  const [moveTarget, setMoveTarget] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Entry import ──
  const handleImportEntries = () => {
    const input = fileRef.current;
    if (!input) return;
    input.value = '';
    input.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw: unknown = JSON.parse(reader.result as string);
        let entriesToImport: Record<string, LoreEntry> = {};

        // Support both: single world book {name, entries: {uid: {...}}} and bare entries {uid: {...}}
        if (raw && typeof raw === 'object') {
          const obj = raw as Record<string, unknown>;
          if (obj.entries && typeof obj.entries === 'object') {
            // Full world book format
            const stEntries = obj.entries as Record<string, STEntryLike>;
            for (const val of Object.values(stEntries)) {
              const keysArr = Array.isArray(val.key) ? val.key : (val.key ? [val.key] : []);
              const logicRaw = val.logic as string | undefined;
              const logic = logicRaw?.startsWith('AND') ? 'AND' as const : logicRaw === 'NOT' ? 'NOT' as const : 'OR' as const;
              const newId = `e${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
              entriesToImport[newId] = {
                name: (val.comment as string) || '导入条目',
                keys: keysArr.join(', '),
                content: (val.content as string) || '',
                logic,
                priority: (val.order as number) ?? 10,
                disabled: (val.disable as boolean) ?? false,
                constant: (val.constant as boolean) ?? false,
                position: (typeof val.position === 'number' ? val.position : 0) as InsertPosition,
                depth: (val.depth as number) ?? 0,
                probability: 100,
              };
            }
          } else {
            // Bare entries keyed by uid
            for (const val of Object.values(obj)) {
              if (val && typeof val === 'object' && 'key' in val) {
                const v = val as STEntryLike;
                const keysArr = Array.isArray(v.key) ? v.key : (v.key ? [v.key] : []);
                const logicRaw = v.logic as string | undefined;
                const logic = logicRaw?.startsWith('AND') ? 'AND' as const : logicRaw === 'NOT' ? 'NOT' as const : 'OR' as const;
                const newId = `e${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                entriesToImport[newId] = {
                  name: (v.comment as string) || '导入条目',
                  keys: keysArr.join(', '),
                  content: (v.content as string) || '',
                  logic,
                  priority: (v.order as number) ?? 10,
                  disabled: (v.disable as boolean) ?? false,
                  constant: (v.constant as boolean) ?? false,
                  position: (typeof v.position === 'number' ? v.position : 0) as InsertPosition,
                  depth: (v.depth as number) ?? 0,
                  probability: 100,
                };
              }
            }
          }
        }

        if (Object.keys(entriesToImport).length > 0) {
          useLorebookStore.setState((s) => ({
            books: {
              ...s.books,
              [bookId]: {
                ...s.books[bookId],
                entries: { ...s.books[bookId].entries, ...entriesToImport },
              },
            },
          }));
        }
      } catch {
        // silent — invalid JSON
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Entry export ──
  const handleExportEntries = () => {
    const entriesToExport: Record<string, STEntryLike> = {};
    const idsToExport = selected.size > 0
      ? [...selected].filter((id) => book?.entries[id])
      : Object.keys(book?.entries ?? {});

    let idx = 0;
    for (const id of idsToExport) {
      const entry = book?.entries[id];
      if (!entry) continue;
      const keys = entry.keys.split(/[,，]/).map((k) => k.trim()).filter(Boolean);
      entriesToExport[id] = {
        uid: idx++,
        key: keys.length === 1 ? keys[0] : keys,
        keysecondary: [],
        comment: entry.name,
        content: entry.content,
        constant: entry.constant,
        selective: false,
        order: entry.priority,
        position: entry.position,
        disable: entry.disabled,
        excludeRecursion: false,
        secondaryKeys: [],
        logic: entry.logic === 'AND' ? 'AND_ALL' : entry.logic === 'NOT' ? 'NOT_ANY' : entry.logic === 'AND_ALL' || entry.logic === 'AND_ANY' || entry.logic === 'NOT_ANY' || entry.logic === 'NOT_ALL' ? entry.logic : 'AND_ANY',
        extensions: {},
        depth: entry.depth,
      };
    }

    const json = JSON.stringify({ name: book?.name ?? '导出条目', entries: entriesToExport }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${book?.name ?? 'worldbook'}_entries.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openDetail = (id: string) => {
    const e = book?.entries[id];
    if (e) { setForm({ ...e }); setEditingId(id); }
  };

  const openNew = () => {
    setForm(EMPTY_ENTRY);
    setEditingId('__new__');
  };

  const handleSave = () => {
    if (!editingId || !form.name.trim()) return;
    if (editingId === '__new__') {
      addEntry(bookId);
      setTimeout(() => {
        const b = useLorebookStore.getState().books[bookId];
        const last = Object.keys(b?.entries ?? {}).pop();
        if (last) { updateEntry(bookId, last, form); setEditingId(null); }
      }, 0);
    } else {
      updateEntry(bookId, editingId, form);
      setEditingId(null);
    }
  };

  const handleDelete = () => {
    if (!editingId || editingId === '__new__') return;
    if (isBuiltinEntry(bookId, editingId)) return;
    deleteEntry(bookId, editingId);
    setEditingId(null);
  };

  const handleCopy = () => {
    if (!editingId || editingId === '__new__') return;
    const newId = 'e' + Date.now();
    useLorebookStore.setState((s) => ({
      books: { ...s.books, [bookId]: { ...s.books[bookId], entries: { ...s.books[bookId].entries, [newId]: { ...form, name: form.name + '(副本)' } } } },
    }));
    setEditingId(null);
  };

  const handleToggle = (id: string) => {
    const e = book?.entries[id];
    if (e) updateEntry(bookId, id, { ...e, disabled: !e.disabled });
  };

  if (!book) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
          <p style={{ color: 'var(--ink-subtle)', textAlign: 'center', padding: 40 }}>世界书未找到</p>
        </div>
      </div>
    );
  }

  const entryList = Object.entries(book.entries).sort(([,a], [,b]) => a.priority - b.priority);

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...panelStyle, minWidth: 720, maxWidth: 820 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 16, borderBottom: '1px solid rgba(196,168,85,0.18)', paddingBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => usePanelStore.getState().open('worldbook')} style={backBtn}>← 返回</button>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--gold)', letterSpacing: 3, margin: 0 }}>
              {book.name} — {entries.length} 条
            </h3>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={openNew} style={addBtnStyle}>+ 新建</button>
            <button onClick={handleImportEntries} style={{ ...actionBtnStyle, fontSize: 10 }} title="从 JSON 导入条目">📥 导入</button>
            <button onClick={handleExportEntries} style={{ ...actionBtnStyle, fontSize: 10 }} title="导出选中条目为 JSON">📤 导出</button>
            <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileSelected} />
            <button onClick={onClose} style={closeBtnStyle}>✕</button>
          </div>
        </div>

        {/* Entry table */}
        <div style={{ maxHeight: 380, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.2)' }}>
          <style>{`
            .entry-table-scroll::-webkit-scrollbar { width: 5px; }
            .entry-table-scroll::-webkit-scrollbar-track { background: rgba(0,0,0,0.15); border-radius: 3px; }
            .entry-table-scroll::-webkit-scrollbar-thumb { background: var(--brass); border-radius: 3px; }
            .entry-table-scroll::-webkit-scrollbar-thumb:hover { background: var(--gold); }
            .entry-row-btn { padding: 0; border: none; border-radius: 2px; background: transparent; font-size: 12px; cursor: pointer; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; opacity: 0.45; transition: opacity 0.15s; }
            .entry-row-btn:hover { opacity: 0.85; }
          `}</style>
          <table className="entry-table-scroll" style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-ui)', fontSize: 11 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(196,168,85,0.15)', position: 'sticky', top: 0, background: 'var(--leather)', zIndex: 1 }}>
                <th style={{ ...thStyle, width: 24 }}></th>
                <th style={{ ...thStyle, width: 42 }}>状态</th>
                <th style={thStyle}>名称</th>
                <th style={thStyle}>关键词</th>
                <th style={{ ...thStyle, width: 42 }}>位置</th>
                <th style={{ ...thStyle, width: 38 }}>匹配</th>
                <th style={{ ...thStyle, width: 34 }}>序</th>
                <th style={{ ...thStyle, width: 34 }}>概率</th>
                <th style={{ ...thStyle, width: 72 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {entryList.map(([id, entry]) => (
                <tr key={id} onClick={() => openDetail(id)} style={{
                  cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)',
                  opacity: entry.disabled ? 0.45 : 1,
                  background: editingId === id ? 'rgba(196,168,85,0.06)' : 'transparent',
                  transition: 'background 0.1s',
                }}
                  onMouseEnter={(e) => { if (editingId !== id) e.currentTarget.style.background = 'rgba(196,168,85,0.03)'; }}
                  onMouseLeave={(e) => { if (editingId !== id) e.currentTarget.style.background = 'transparent'; }}
                >
                  <td style={{ ...tdStyle, padding: '7px 4px' }} onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(id)} onChange={() => {
                      setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
                    }} style={{ cursor: 'pointer', accentColor: 'var(--brass)', filter: 'brightness(0.7)', position: 'relative', top: 2 }} />
                  </td>
                  <td style={tdStyle}>
                    <button onClick={(e) => { e.stopPropagation(); handleToggle(id); }} style={{
                      width: 36, padding: '2px 0', borderRadius: 2, border: '1px solid', textAlign: 'center',
                      borderColor: entry.disabled ? 'var(--blood)' : 'var(--success)',
                      background: entry.disabled ? 'rgba(139,58,58,0.1)' : 'rgba(58,107,90,0.1)',
                      color: entry.disabled ? 'var(--blood)' : 'var(--success)',
                      fontFamily: 'var(--font-ui)', fontSize: 9, cursor: 'pointer',
                    }}>{entry.disabled ? 'OFF' : 'ON'}</button>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 'bold', color: 'var(--text-light)' }}>
                    {entry.name || '(未命名)'}
                    <span style={{ color: entry.constant ? '#5b9bd5' : 'var(--success)', marginLeft: 5, fontSize: 11 }}>●</span>
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)', fontSize: 10, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.keys || '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)', fontSize: 9 }}>
                    {POSITION_LABELS[entry.position] ?? '—'}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                    <span style={{ color: entry.logic.startsWith('AND') ? 'var(--gold)' : 'var(--blood)' }}>
                      {entry.logic === 'AND_ANY' ? '与任意' : entry.logic === 'AND_ALL' ? '与所有' : entry.logic === 'NOT_ANY' ? '非任何' : entry.logic === 'NOT_ALL' ? '非所有' : entry.logic}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{entry.priority}</td>
                  <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>{entry.probability}%</td>
                  <td style={tdStyle} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button onClick={() => openDetail(id)} title="编辑" className="entry-row-btn" style={{ color: 'var(--ink-subtle)' }}>✎</button>
                      <button onClick={() => {
                        const newId = 'e' + Date.now();
                        useLorebookStore.setState((s) => ({
                          books: { ...s.books, [bookId]: { ...s.books[bookId], entries: { ...s.books[bookId].entries, [newId]: { ...entry, name: entry.name + '(副)' } } } },
                        }));
                      }} title="复制" className="entry-row-btn" style={{ color: 'var(--ink-subtle)', position: 'relative', top: 3 }}>⧉</button>
                      {!isBuiltinEntry(bookId, id) && (
                        <button onClick={() => deleteEntry(bookId, id)} title="删除" className="entry-row-btn" style={{ color: 'var(--blood)' }}>✕</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {entryList.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-subtle)', fontSize: 12 }}>暂无词条，点击"+ 新建"创建</div>
          )}
        </div>

        {/* Move/Copy between books */}
        <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(196,168,85,0.12)', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap' }}>
            {selected.size > 0 ? `已选 ${selected.size} 条 →` : '勾选条目 →'}
          </span>
          <Dropdown value={moveTarget} onChange={(v) => setMoveTarget(v)}
            options={[{ label: `「${book.name}」(本地)`, value: bookId }, ...Object.entries(books).filter(([id]) => id !== bookId).map(([id, b]) => ({ label: b.name, value: id }))]} />
          <button onClick={() => {
            if (selected.size === 0 || !moveTarget || moveTarget === bookId) return;
            useLorebookStore.setState((s) => {
              const books = { ...s.books };
              const srcEntries = { ...books[bookId].entries };
              const tgtEntries = { ...(books[moveTarget]?.entries ?? {}) };
              selected.forEach((id) => {
                if (srcEntries[id]) { tgtEntries[id] = { ...srcEntries[id] }; delete srcEntries[id]; }
              });
              books[bookId] = { ...books[bookId], entries: srcEntries };
              books[moveTarget] = { ...books[moveTarget], entries: tgtEntries };
              return { books };
            });
            setSelected(new Set()); setMoveTarget('');
          }} disabled={selected.size === 0 || moveTarget === bookId}
            style={{ ...saveBtnStyle, fontSize: 10, padding: '4px 10px', opacity: (selected.size === 0 || moveTarget === bookId) ? 0.4 : 1 }}>移动已选</button>
          <button onClick={() => {
            if (selected.size === 0 || !moveTarget) return;
            useLorebookStore.setState((s) => {
              const books = { ...s.books };
              const tgtEntries = { ...(books[moveTarget]?.entries ?? {}) };
              selected.forEach((id) => {
                if (s.books[bookId]?.entries[id]) {
                  tgtEntries[id + '_copy'] = { ...s.books[bookId].entries[id], name: s.books[bookId].entries[id].name + '(副)' };
                }
              });
              books[moveTarget] = { ...books[moveTarget], entries: tgtEntries };
              return { books };
            });
            setSelected(new Set()); setMoveTarget('');
          }} disabled={selected.size === 0}
            style={{ ...saveBtnStyle, fontSize: 10, padding: '4px 10px', opacity: selected.size === 0 ? 0.4 : 1 }}>复制已选</button>
        </div>
      </div>

      {/* Detail modal */}
      {editingId !== null && (
        <EntryDetail
          form={form}
          onChange={setForm}
          onSave={handleSave}
          onClose={() => setEditingId(null)}
          onDelete={handleDelete}
          onCopy={handleCopy}
          isNew={editingId === '__new__'}
          canDelete={!editingId || editingId === '__new__' || !isBuiltinEntry(bookId, editingId)}
        />
      )}
    </div>
  );
}

// ── Entry Detail Modal ──

function EntryDetail({ form, onChange, onSave, onClose, onDelete, onCopy, isNew, canDelete = true }: {
  form: LoreEntry; onChange: (f: LoreEntry) => void; onSave: () => void; onClose: () => void;
  onDelete: () => void; onCopy: () => void; isNew: boolean; canDelete?: boolean;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
        border: '1px solid var(--gold)', borderRadius: 8, padding: '20px 24px',
        minWidth: 500, maxWidth: 560, width: '90%', maxHeight: '85vh', overflowY: 'auto',
        boxShadow: '0 0 60px rgba(0,0,0,0.7)',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14, borderBottom: '1px solid rgba(196,168,85,0.15)', paddingBottom: 10 }}>
          <h4 style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--gold)', letterSpacing: 2, margin: 0 }}>
            {isNew ? '新建词条' : '编辑词条'}
          </h4>
          <button onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, color: 'var(--gold)', fontFamily: 'var(--font-ui)', fontWeight: 'bold' }}>状态</span>
            <button onClick={() => onChange({ ...form, disabled: !form.disabled })} style={{
              padding: '3px 14px', borderRadius: 2, border: '1px solid',
              borderColor: form.disabled ? 'var(--blood)' : 'var(--success)',
              background: form.disabled ? 'rgba(139,58,58,0.1)' : 'rgba(58,107,90,0.1)',
              color: form.disabled ? 'var(--blood)' : 'var(--success)',
              fontFamily: 'var(--font-ui)', fontSize: 11, cursor: 'pointer',
            }}>{form.disabled ? '禁用' : '激活'}</button>
            <Dropdown value={form.constant ? 'constant' : 'keyword'} onChange={(v) => onChange({ ...form, constant: v === 'constant' })}
              options={[{ label: '关键词匹配', value: 'keyword' }, { label: '永久激活', value: 'constant' }]} />
          </div>

          <FieldGroup label="词条名称">
            <input value={form.name} onChange={(e) => onChange({ ...form, name: e.target.value })} placeholder="词条名称" style={fieldInputStyle} />
          </FieldGroup>

          <FieldGroup label="触发关键词">
            <input value={form.keys} onChange={(e) => onChange({ ...form, keys: e.target.value })} placeholder="关键词1, 关键词2" style={fieldInputStyle} />
          </FieldGroup>

          <FieldGroup label="内容">
            <textarea value={form.content} onChange={(e) => onChange({ ...form, content: e.target.value })} placeholder="词条正文内容..."
              style={{ ...fieldInputStyle, minHeight: 100, resize: 'vertical', fontFamily: 'var(--font-body)' }} />
          </FieldGroup>

          <div style={{ display: 'flex', gap: 12 }}>
            <FieldGroup label="插入位置">
              <Dropdown value={String(form.position)} onChange={(v) => onChange({ ...form, position: Number(v) as InsertPosition })}
                options={POSITION_OPTIONS} />
            </FieldGroup>
            <FieldGroup label="匹配逻辑">
              <Dropdown value={form.logic} onChange={(v) => onChange({ ...form, logic: v as LoreEntry['logic'] })}
                options={[{ label: '与任意', value: 'AND_ANY' }, { label: '与所有', value: 'AND_ALL' }, { label: '非任何', value: 'NOT_ANY' }, { label: '非所有', value: 'NOT_ALL' }]} />
            </FieldGroup>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <FieldGroup label="深度">
              <SpinField value={form.depth} min={0} max={10} onChange={(v) => onChange({ ...form, depth: v })} />
            </FieldGroup>
            <FieldGroup label="顺序">
              <SpinField value={form.priority} min={1} max={999} onChange={(v) => onChange({ ...form, priority: v })} />
            </FieldGroup>
            <FieldGroup label="概率%">
              <SpinField value={form.probability} min={0} max={100} onChange={(v) => onChange({ ...form, probability: v })} />
            </FieldGroup>
          </div>

          {/* Advanced settings collapsible */}
          <details style={{ marginTop: 4, borderTop: '1px solid rgba(196,168,85,0.1)', paddingTop: 8 }}>
            <summary style={{ fontSize: 10, color: 'var(--gold)', fontFamily: 'var(--font-ui)', cursor: 'pointer', letterSpacing: 1 }}>高级设置</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <FieldGroup label="可选过滤器">
                <input value={form.secondaryKeys || ''} onChange={(e) => onChange({ ...form, secondaryKeys: e.target.value })} placeholder="逗号分隔列表，为空则忽略" style={fieldInputStyle} />
              </FieldGroup>
              <div style={{ display: 'flex', gap: 8 }}>
                <FieldGroup label="扫描深度">
                  <SpinField value={form.scanDepth || 0} min={0} max={50} onChange={(v) => onChange({ ...form, scanDepth: v })} />
                </FieldGroup>
                <FieldGroup label="区分大小写">
                  <Dropdown value={String(form.caseSensitive || 0)} onChange={(v) => onChange({ ...form, caseSensitive: Number(v) })}
                    options={[{ label: '全局设置', value: '0' }, { label: '是', value: '1' }, { label: '否', value: '2' }]} />
                </FieldGroup>
                <FieldGroup label="完整单词">
                  <Dropdown value={String(form.matchWholeWord || 0)} onChange={(v) => onChange({ ...form, matchWholeWord: Number(v) })}
                    options={[{ label: '全局设置', value: '0' }, { label: '是', value: '1' }, { label: '否', value: '2' }]} />
                </FieldGroup>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <FieldGroup label="包含组">
                  <input value={form.inclusionGroup || ''} onChange={(e) => onChange({ ...form, inclusionGroup: e.target.value })} placeholder="只有一个带有相同标签的条目将被激活" style={fieldInputStyle} />
                </FieldGroup>
                <FieldGroup label="组权重">
                  <SpinField value={form.groupWeight ?? 100} min={0} max={9999} onChange={(v) => onChange({ ...form, groupWeight: v })} />
                </FieldGroup>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <FieldGroup label="组评分">
                  <Dropdown value={String(form.groupScoring || 0)} onChange={(v) => onChange({ ...form, groupScoring: Number(v) })}
                    options={[{ label: '否', value: '0' }, { label: '是', value: '1' }, { label: '全局设置', value: '2' }]} />
                </FieldGroup>
                <FieldGroup label="自动化 ID">
                  <input value={form.automationId || ''} onChange={(e) => onChange({ ...form, automationId: e.target.value })} placeholder="无" style={fieldInputStyle} />
                </FieldGroup>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <FieldGroup label="粘性 (N条消息)">
                  <SpinField value={form.sticky || 0} min={0} max={99} onChange={(v) => onChange({ ...form, sticky: v })} />
                </FieldGroup>
                <FieldGroup label="冷却 (N条消息)">
                  <SpinField value={form.cooldown || 0} min={0} max={99} onChange={(v) => onChange({ ...form, cooldown: v })} />
                </FieldGroup>
                <FieldGroup label="延迟 (N条消息)">
                  <SpinField value={form.delay || 0} min={0} max={99} onChange={(v) => onChange({ ...form, delay: v })} />
                </FieldGroup>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-light)', fontFamily: 'var(--font-ui)' }}>
                  <input type="checkbox" checked={form.prioritizeInclusion || false} onChange={(e) => onChange({ ...form, prioritizeInclusion: e.target.checked })} style={{ accentColor: 'var(--gold)' }} />确定优先级
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-light)', fontFamily: 'var(--font-ui)' }}>
                  <input type="checkbox" checked={form.preventRecursion || false} onChange={(e) => onChange({ ...form, preventRecursion: e.target.checked })} style={{ accentColor: 'var(--gold)' }} />不可递归
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-light)', fontFamily: 'var(--font-ui)' }}>
                  <input type="checkbox" checked={form.delayUntilRecursion || false} onChange={(e) => onChange({ ...form, delayUntilRecursion: e.target.checked })} style={{ accentColor: 'var(--gold)' }} />延迟到递归
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-light)', fontFamily: 'var(--font-ui)' }}>
                  <input type="checkbox" checked={form.excludeRecursion || false} onChange={(e) => onChange({ ...form, excludeRecursion: e.target.checked })} style={{ accentColor: 'var(--gold)' }} />防止进一步递归
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-light)', fontFamily: 'var(--font-ui)' }}>
                  <input type="checkbox" checked={form.ignoreReplyLimit || false} onChange={(e) => onChange({ ...form, ignoreReplyLimit: e.target.checked })} style={{ accentColor: 'var(--gold)' }} />无视回复限额
                </label>
              </div>
            </div>
          </details>

          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button onClick={onSave} style={saveBtnStyle}>保存</button>
            {!isNew && canDelete && <button onClick={onDelete} style={{ ...saveBtnStyle, borderColor: 'rgba(139,58,58,0.4)', color: 'var(--blood)', background: 'rgba(139,58,58,0.06)' }}>删除</button>}
            {!isNew && <button onClick={onCopy} style={{ ...saveBtnStyle, borderColor: 'rgba(196,168,85,0.3)', color: 'var(--gold)', background: 'rgba(196,168,85,0.06)' }}>复制</button>}
            <div style={{ flex: 1 }} />
            <button onClick={onClose} style={{ ...saveBtnStyle, borderColor: 'rgba(255,255,255,0.1)', color: 'var(--ink-subtle)' }}>取消</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Reusable components ──

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
      <label style={{ fontSize: 10, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 1, fontWeight: 'bold' }}>{label}</label>
      {children}
    </div>
  );
}

function Dropdown({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { label: string; value: string }[] }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value)?.label ?? value;
  return (
    <div style={{ position: 'relative', minWidth: 110 }}>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', padding: '6px 8px', border: '1px solid var(--brass)', borderRadius: 3,
        background: 'rgba(0,0,0,0.3)', color: 'var(--parchment)',
        fontFamily: 'var(--font-ui)', fontSize: 11, cursor: 'pointer',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', outline: 'none',
      }}>
        <span>{selected}</span>
        <span style={{ fontSize: 8, color: 'var(--brass)' }}>▼</span>
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
            background: 'var(--leather)', border: '1px solid var(--gold)', borderRadius: 3,
            marginTop: 2, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
          }}>
            {options.map((opt) => (
              <div key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }} style={{
                padding: '6px 8px', cursor: 'pointer',
                background: opt.value === value ? 'rgba(196,168,85,0.15)' : 'transparent',
                color: opt.value === value ? 'var(--gold)' : 'var(--text-light)',
                fontFamily: 'var(--font-ui)', fontSize: 11,
                borderBottom: '1px solid rgba(196,168,85,0.06)',
              }}
                onMouseEnter={(e) => { if (opt.value !== value) e.currentTarget.style.background = 'rgba(196,168,85,0.06)'; }}
                onMouseLeave={(e) => { if (opt.value !== value) e.currentTarget.style.background = 'transparent'; }}
              >{opt.label}</div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SpinField({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const clamp = (n: number) => Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n));
  const inc = () => onChange(clamp(value + 1));
  const dec = () => onChange(clamp(value - 1));
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', border: '1px solid var(--brass)', borderRadius: 3, overflow: 'hidden', background: 'rgba(0,0,0,0.3)' }}>
      <button onClick={dec} style={{
        border: 'none', background: 'transparent', color: 'var(--gold)',
        fontFamily: 'var(--font-mono)', fontSize: 13, cursor: 'pointer',
        padding: '4px 8px', borderRight: '1px solid var(--brass)',
      }}>−</button>
      <input type="number" value={value}
        onChange={(e) => { const n = Number(e.target.value); if (!isNaN(n)) onChange(clamp(n)); }}
        min={min} max={max}
        style={{
          flex: 1, minWidth: 36, width: 44, border: 'none', background: 'transparent',
          color: 'var(--parchment)', fontFamily: 'var(--font-mono)', fontSize: 12,
          textAlign: 'center', outline: 'none',
          MozAppearance: 'textfield', WebkitAppearance: 'none', margin: 0,
        }} />
      <style>{`input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }`}</style>
      <button onClick={inc} style={{
        border: 'none', background: 'transparent', color: 'var(--gold)',
        fontFamily: 'var(--font-mono)', fontSize: 13, cursor: 'pointer',
        padding: '4px 8px', borderLeft: '1px solid var(--brass)',
      }}>+</button>
    </div>
  );
}

// ── Styles ──

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 950,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
};

const panelStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
  border: '1px solid var(--gold)', borderRadius: 8, padding: '24px 28px',
  maxWidth: 720, width: '90%', boxShadow: '0 0 80px rgba(0,0,0,0.6)',
};

const backBtn: React.CSSProperties = {
  padding: '4px 12px', border: '1px solid var(--brass)', borderRadius: 3,
  background: 'transparent', color: 'var(--ink-subtle)',
  fontFamily: 'var(--font-ui)', fontSize: 11, cursor: 'pointer',
};

const addBtnStyle: React.CSSProperties = {
  padding: '5px 14px', border: '1px solid var(--gold)', borderRadius: 3,
  background: 'rgba(196,168,85,0.1)', color: 'var(--gold)',
  fontFamily: 'var(--font-ui)', fontSize: 11, cursor: 'pointer',
};

const actionBtnStyle: React.CSSProperties = {
  padding: '5px 12px', border: '1px solid var(--brass)', borderRadius: 3,
  background: 'rgba(196,168,85,0.06)', color: 'var(--ink-subtle)',
  fontFamily: 'var(--font-ui)', fontSize: 10, cursor: 'pointer',
  transition: 'var(--transition-smooth)',
};

const thStyle: React.CSSProperties = {
  padding: '8px 8px', textAlign: 'left', fontSize: 9, fontWeight: 'normal',
  color: 'var(--ink-faded)', letterSpacing: 1, fontFamily: 'var(--font-ui)',
};

const tdStyle: React.CSSProperties = {
  padding: '7px 8px', fontSize: 11, color: 'var(--ink-subtle)',
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

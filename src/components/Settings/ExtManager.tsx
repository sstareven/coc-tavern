import { useState, useEffect } from 'react';
import type { Extension } from '../../types';

const STORAGE_KEY = 'coc_extensions';
const DEFAULT_EXTS: Extension[] = [
  { id: 'ext-1', name: 'MVU 变量引擎', version: '1.2.0', author: 'Tavern Team', description: 'MVU 模式游戏状态管理，变量追踪、自动提取与合并。', enabled: true, entryPoint: 'window.__mvu_engine__' },
  { id: 'ext-2', name: '酒馆助手', version: '0.8.1', author: 'COC Tools', description: 'LLM 上下文优化，智能裁剪历史、注入世界书条目。', enabled: false, entryPoint: 'window.__tavern_helper__' },
  { id: 'ext-3', name: '骰子宏脚本', version: '2.0.0', author: 'DiceMaster', description: '复杂骰子表达式、CoC 奖励骰/惩罚骰、/r 快捷指令。', enabled: true, entryPoint: '/r, /roll 命令' },
];

function loadExts(): Extension[] {
  try { const d = localStorage.getItem(STORAGE_KEY); return d ? JSON.parse(d) : DEFAULT_EXTS; } catch { return DEFAULT_EXTS; }
}
function saveExts(exts: Extension[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(exts)); } catch {}
}

interface Props { onClose: () => void; }

export function ExtManager({ onClose }: Props) {
  const [exts, setExts] = useState<Extension[]>(loadExts);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importPath, setImportPath] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => { saveExts(exts); }, [exts]);

  const handleImport = () => {
    if (!importPath.trim()) return;
    const name = importPath.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '新扩展';
    const newExt: Extension = { id: 'ext-' + Date.now(), name, version: '0.1.0', author: '未知', description: '从 ' + importPath.trim() + ' 导入', enabled: false, entryPoint: importPath.trim() };
    setExts((prev) => { const n = [...prev, newExt]; saveExts(n); return n; });
    setImportPath(''); setShowImport(false);
  };

  const toggleExt = (id: string) => {
    setExts((prev) => { const n = prev.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e)); saveExts(n); return n; });
  };

  const deleteExt = (id: string) => {
    setExts((prev) => { const n = prev.filter((e) => e.id !== id); saveExts(n); return n; });
    if (expandedId === id) setExpandedId(null);
    setDeleteConfirm(null);
  };

  const updateExtParam = (id: string, field: keyof Extension, value: string | boolean) => {
    setExts((prev) => { const n = prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)); saveExts(n); return n; });
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
        padding: '24px 28px', minWidth: 500, maxWidth: 640, width: '90%',
        boxShadow: '0 0 80px rgba(0,0,0,0.6)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 20, borderBottom: '1px solid rgba(196,168,85,0.18)', paddingBottom: 12,
        }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--gold)', letterSpacing: 4, margin: 0 }}>
            扩展管理 / EXTENSIONS
          </h3>
          <button onClick={onClose} style={closeBtnStyle}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--brass)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'transparent'; }}
          >✕</button>
        </div>

        {/* Extension list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 360, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'var(--ink-faded) transparent', marginBottom: 14 }}>
          {exts.map((ext) => {
            const expanded = expandedId === ext.id;
            return (
              <div key={ext.id} style={{
                border: expanded ? '1px solid rgba(196,168,85,0.2)' : '1px solid rgba(196,168,85,0.08)',
                borderRadius: 4, background: 'rgba(0,0,0,0.15)', overflow: 'hidden',
                transition: 'var(--transition-smooth)',
              }}>
                {/* Header row */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', cursor: 'pointer',
                }} onClick={() => setExpandedId(expanded ? null : ext.id)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Enable toggle */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleExt(ext.id); }}
                      style={{
                        width: 14, height: 14, borderRadius: '50%', border: ext.enabled ? '2px solid var(--success)' : '2px solid var(--ink-faded)',
                        background: ext.enabled ? 'var(--success)' : 'transparent',
                        cursor: 'pointer', padding: 0, flexShrink: 0,
                        transition: 'var(--transition-smooth)',
                      }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-light)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>
                        {ext.name}
                      </span>
                      <span style={{ fontSize: 9, color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)' }}>
                        v{ext.version} · {ext.author}
                      </span>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 10, color: 'var(--ink-subtle)',
                    transition: 'transform 0.3s',
                    transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}>
                    ▼
                  </span>
                </div>

                {/* Expanded detail */}
                {expanded && (
                  <div style={{ padding: '0 14px 14px', borderTop: '1px solid rgba(196,168,85,0.08)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px', margin: '10px 0' }}>
                      <div>
                        <label style={{ fontSize: 9, color: 'var(--ink-subtle)', letterSpacing: 2, display: 'block', marginBottom: 2 }}>名称</label>
                        <input value={ext.name} onChange={(e) => updateExtParam(ext.id, 'name', e.target.value)}
                          style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--brass)', borderRadius: 3, background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-ui)', fontSize: 10, outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 9, color: 'var(--ink-subtle)', letterSpacing: 2, display: 'block', marginBottom: 2 }}>版本</label>
                        <input value={ext.version} onChange={(e) => updateExtParam(ext.id, 'version', e.target.value)}
                          style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--brass)', borderRadius: 3, background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-mono)', fontSize: 10, outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 9, color: 'var(--ink-subtle)', letterSpacing: 2, display: 'block', marginBottom: 2 }}>作者</label>
                        <input value={ext.author} onChange={(e) => updateExtParam(ext.id, 'author', e.target.value)}
                          style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--brass)', borderRadius: 3, background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-ui)', fontSize: 10, outline: 'none' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 9, color: 'var(--ink-subtle)', letterSpacing: 2, display: 'block', marginBottom: 2 }}>入口文件</label>
                        <input value={ext.entryPoint} onChange={(e) => updateExtParam(ext.id, 'entryPoint', e.target.value)}
                          style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--brass)', borderRadius: 3, background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-mono)', fontSize: 10, outline: 'none' }} />
                      </div>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 9, color: 'var(--ink-subtle)', letterSpacing: 2, display: 'block', marginBottom: 2 }}>描述</label>
                      <textarea value={ext.description} onChange={(e) => updateExtParam(ext.id, 'description', e.target.value)}
                        rows={2} style={{ width: '100%', padding: '4px 6px', border: '1px solid var(--brass)', borderRadius: 3, background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-body)', fontSize: 10, outline: 'none', resize: 'vertical' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 9, color: ext.enabled ? 'var(--success)' : 'var(--ink-faded)', letterSpacing: 1 }}>
                        {ext.enabled ? '已启用' : '已禁用'}
                      </span>
                      {deleteConfirm === ext.id ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 10, color: 'var(--blood)' }}>确认删除？</span>
                          <button onClick={() => deleteExt(ext.id)} style={{ padding: '2px 10px', border: '1px solid var(--blood)', borderRadius: 3, background: 'rgba(139,58,58,0.15)', color: 'var(--blood)', fontFamily: 'var(--font-ui)', fontSize: 10, cursor: 'pointer' }}>确认</button>
                          <button onClick={() => setDeleteConfirm(null)} style={{ padding: '2px 10px', border: '1px solid var(--brass)', borderRadius: 3, background: 'transparent', color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', fontSize: 10, cursor: 'pointer' }}>取消</button>
                        </div>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(ext.id); }}
                          style={{ padding: '2px 10px', border: '1px solid var(--brass)', borderRadius: 3, background: 'transparent', color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', fontSize: 10, cursor: 'pointer' }}
                          onMouseEnter={(e2) => { e2.currentTarget.style.borderColor = 'var(--blood)'; e2.currentTarget.style.color = 'var(--blood)'; }}
                          onMouseLeave={(e2) => { e2.currentTarget.style.borderColor = 'var(--brass)'; e2.currentTarget.style.color = 'var(--ink-subtle)'; }}
                        >删除扩展</button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Import button */}
        <button onClick={() => setShowImport(true)} style={{
          width: '100%', padding: '10px 0',
          border: '1px dashed var(--brass)', borderRadius: 4,
          background: 'transparent', color: 'var(--ink-subtle)',
          fontFamily: 'var(--font-ui)', fontSize: 12, letterSpacing: 3, cursor: 'pointer',
        }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; e.currentTarget.style.color = 'var(--ink-subtle)'; }}
        >
          导入扩展...
        </button>

        {/* Import modal */}
        {showImport && (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
          }} onClick={() => setShowImport(false)}>
            <div style={{
              background: 'var(--leather)', border: '1px solid var(--gold)',
              borderRadius: 6, padding: '20px 24px', maxWidth: 400, width: '90%',
            }} onClick={(e) => e.stopPropagation()}>
              <h4 style={{ fontSize: 14, color: 'var(--gold)', fontFamily: 'var(--font-display)', letterSpacing: 3, margin: '0 0 16px' }}>
                导入扩展
              </h4>
              <input value={importPath} onChange={(e) => setImportPath(e.target.value)}
                placeholder="扩展文件路径或URL..."
                style={{
                  width: '100%', padding: '8px 10px', border: '1px solid var(--brass)', borderRadius: 3,
                  background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)',
                  fontFamily: 'var(--font-ui)', fontSize: 12, outline: 'none', caretColor: 'var(--gold)',
                  marginBottom: 14,
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowImport(false)} style={{
                  padding: '6px 16px', border: '1px solid var(--brass)', borderRadius: 3,
                  background: 'transparent', color: 'var(--ink-subtle)',
                  fontFamily: 'var(--font-ui)', fontSize: 11, cursor: 'pointer',
                }}>取消</button>
                <button onClick={handleImport} style={{
                  padding: '6px 16px', border: '1px solid var(--gold)', borderRadius: 3,
                  background: 'rgba(196,168,85,0.1)', color: 'var(--gold)',
                  fontFamily: 'var(--font-ui)', fontSize: 11, cursor: 'pointer',
                }}>导入</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const closeBtnStyle: React.CSSProperties = {
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid transparent', borderRadius: 3, background: 'transparent',
  color: 'var(--ink-subtle)', fontSize: 16, cursor: 'pointer', fontFamily: 'var(--font-ui)',
};

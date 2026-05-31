import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVariableStore } from '../../stores/useVariableStore';
import { flattenStatData } from '../../sillytavern/mvu-flatten';
import type { GameVariable } from '../../types';

const SOURCE_LABELS: Record<GameVariable['source'], { label: string; color: string }> = {
  system: { label: '系统', color: 'var(--gold)' },
  character: { label: '角色', color: 'var(--success)' },
  llm: { label: 'AI', color: '#7b9fc1' },
  manual: { label: '手动', color: 'var(--ink-subtle)' },
};

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function VariablePanel({ visible, onClose }: Props) {
  const variables = useVariableStore((s) => s.variables);
  const setVariable = useVariableStore((s) => s.setVariable);
  const deleteVariable = useVariableStore((s) => s.deleteVariable);
  const toggleLock = useVariableStore((s) => s.toggleLock);
  const importVariables = useVariableStore((s) => s.importVariables);
  const exportVariables = useVariableStore((s) => s.exportVariables);
  const clearAll = useVariableStore((s) => s.clearAll);
  const statData = useVariableStore((s) => s.statData);

  const [addName, setAddName] = useState('');
  const [addValue, setAddValue] = useState('');
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [filter, setFilter] = useState<GameVariable['source'] | 'all'>('all');
  const [showImport, setShowImport] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [showStat, setShowStat] = useState(true);

  const entries = Object.values(variables);
  const filtered = filter === 'all'
    ? entries
    : entries.filter((v) => v.source === filter);
  // Sort by name
  filtered.sort((a, b) => a.name.localeCompare(b.name));

  // statData 剧情状态树拍平为 点路径=值（复用引擎层 flattenStatData，自动跳过 _/$ 元键、JSON 化数组）
  const flatStat = Object.entries(flattenStatData(statData)).sort((a, b) => a[0].localeCompare(b[0]));

  const handleAdd = () => {
    if (!addName.trim()) return;
    setVariable(addName.trim(), addValue, 'manual');
    setAddName('');
    setAddValue('');
  };

  const handleEdit = (name: string) => {
    if (!editValue && editValue !== '') return;
    setVariable(name, editValue, 'manual');
    setEditingName(null);
    setEditValue('');
  };

  const handleImport = () => {
    if (importVariables(importJson)) {
      setImportJson('');
      setShowImport(false);
    }
  };

  const handleExport = () => {
    const json = exportVariables();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `variables-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!visible) return null;

  return (
    <div className="panel-overlay" onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 920,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
          border: '1px solid var(--gold)', borderRadius: 8,
          padding: '24px 28px', width: 600, maxWidth: '90vw', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 0 80px rgba(0,0,0,0.6)',
          fontFamily: 'var(--font-ui)',
        }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 16, borderBottom: '1px solid rgba(196,168,85,0.18)', paddingBottom: 12,
          flexShrink: 0,
        }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--gold)', letterSpacing: 4, margin: 0 }}>
            MVU 变量引擎
          </h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleExport} title="导出" style={toolBtn}>⤓</button>
            <button onClick={() => setShowImport(!showImport)} title="导入" style={toolBtn}>⤒</button>
            {confirmClear ? (
              <>
                <button onClick={() => { clearAll(); setConfirmClear(false); }} style={{ ...toolBtn, color: 'var(--blood)' }}>确认清空</button>
                <button onClick={() => setConfirmClear(false)} style={toolBtn}>取消</button>
              </>
            ) : (
              <button onClick={() => setConfirmClear(true)} title="清空全部" style={toolBtn}>✕</button>
            )}
            <button onClick={onClose} style={{ ...toolBtn, fontSize: 16 }}>✕</button>
          </div>
        </div>

        {/* Add row */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexShrink: 0 }}>
          <input
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            placeholder="变量名"
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            style={{ ...inputStyle, flex: 1 }}
          />
          <input
            value={addValue}
            onChange={(e) => setAddValue(e.target.value)}
            placeholder="值"
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            style={{ ...inputStyle, flex: 2 }}
          />
          <button onClick={handleAdd} style={addBtnStyle}>+</button>
        </div>

        {/* Filter */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexShrink: 0 }}>
          {(['all', 'system', 'character', 'llm', 'manual'] as const).map((f) => (
            <button key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '2px 10px', borderRadius: 3, border: 'none',
                background: filter === f ? 'rgba(196,168,85,0.15)' : 'transparent',
                color: filter === f ? 'var(--gold)' : 'var(--ink-subtle)',
                fontFamily: 'var(--font-ui)', fontSize: 10, cursor: 'pointer', letterSpacing: 1,
              }}>
              {f === 'all' ? `全部 (${entries.length})` : SOURCE_LABELS[f].label}
            </button>
          ))}
        </div>

        {/* Import */}
        <AnimatePresence>
          {showImport && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ overflow: 'hidden', marginBottom: 10, flexShrink: 0 }}
            >
              <textarea value={importJson} onChange={(e) => setImportJson(e.target.value)}
                placeholder="粘贴 JSON..."
                rows={3}
                style={{ width: '100%', padding: 6, borderRadius: 3, border: '1px solid var(--brass)',
                  background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-mono)',
                  fontSize: 10, resize: 'vertical', outline: 'none',
                }}
              />
              <button onClick={handleImport} style={{ ...addBtnStyle, marginTop: 4, fontSize: 10, padding: '3px 12px' }}>
                导入
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Variable table */}
        <div style={{
          flex: 1, overflowY: 'auto', borderRadius: 4,
          border: '1px solid rgba(196,168,85,0.08)',
        }}>
          <table style={{
            width: '100%', borderCollapse: 'collapse',
            fontSize: 11, fontFamily: 'var(--font-ui)',
          }}>
            <thead>
              <tr style={{
                background: 'rgba(0,0,0,0.2)',
                position: 'sticky', top: 0, zIndex: 1,
              }}>
                <th style={thStyle}>变量名</th>
                <th style={thStyle}>值</th>
                <th style={{ ...thStyle, width: 40 }}>来源</th>
                <th style={{ ...thStyle, width: 32 }}>🔒</th>
                <th style={{ ...thStyle, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.name}
                  style={{
                    borderTop: '1px solid rgba(255,255,255,0.02)',
                    background: v.locked ? 'rgba(139,58,58,0.04)' : 'transparent',
                  }}>
                  <td style={tdStyle}>
                    {editingName === v.name ? (
                      <input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEdit(v.name);
                          if (e.key === 'Escape') setEditingName(null);
                        }}
                        onBlur={() => handleEdit(v.name)}
                        autoFocus
                        style={{ ...inputStyle, width: '100%', padding: '2px 6px', fontSize: 10 }}
                      />
                    ) : (
                      <span
                        style={{ color: 'var(--text-light)', fontWeight: 'bold', cursor: 'pointer' }}
                        onClick={() => { setEditingName(v.name); setEditValue(v.value); }}
                        title="点击编辑值"
                      >
                        {v.name}
                      </span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span style={{
                      color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)', fontSize: 10,
                      wordBreak: 'break-all',
                    }}>
                      {v.value || '(空)'}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <span style={{
                      fontSize: 9,
                      color: SOURCE_LABELS[v.source].color,
                    }}>
                      {SOURCE_LABELS[v.source].label}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <button
                      onClick={() => toggleLock(v.name)}
                      title={v.locked ? '解锁' : '锁定'}
                      style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: v.locked ? 'var(--blood)' : 'var(--ink-faded)',
                        fontSize: 12, padding: 0,
                      }}>
                      {v.locked ? '🔒' : '🔓'}
                    </button>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <button
                      onClick={() => deleteVariable(v.name)}
                      disabled={v.locked}
                      title={v.locked ? '已锁定' : '删除'}
                      style={{
                        background: 'transparent', border: 'none', cursor: v.locked ? 'not-allowed' : 'pointer',
                        color: v.locked ? 'var(--ink-faded)' : 'var(--blood)',
                        fontSize: 12, padding: 0, opacity: v.locked ? 0.3 : 1,
                      }}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--ink-subtle)', fontSize: 11 }}>
              {filter === 'all' ? '暂无变量，在上方添加或通过 AI 自动生成' : `没有来源为"${SOURCE_LABELS[filter].label}"的变量`}
            </div>
          )}
        </div>

        {/* statData 剧情状态树（只读 · 世界/剧情/战斗，由 AI 经 JSONPatch 演化） */}
        <div style={{ marginTop: 14, flexShrink: 0 }}>
          <button
            onClick={() => setShowStat(!showStat)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%',
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)', fontSize: 9,
              letterSpacing: 2, textTransform: 'uppercase', padding: '4px 0',
            }}>
            <span style={{
              display: 'inline-block', transition: 'transform 0.2s cubic-bezier(0.4,0,0.2,1)',
              transform: showStat ? 'rotate(90deg)' : 'none',
            }}>▸</span>
            剧情状态树 · statData（只读 · {flatStat.length}）
          </button>
          <AnimatePresence>
            {showStat && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                style={{ overflow: 'hidden' }}>
                <div style={{
                  maxHeight: 180, overflowY: 'auto', borderRadius: 4,
                  border: '1px solid rgba(196,168,85,0.08)', background: 'rgba(0,0,0,0.15)',
                }}>
                  {flatStat.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 20, color: 'var(--ink-subtle)', fontSize: 10 }}>
                      暂无剧情状态，开始游戏后由 AI 演化（世界 / 剧情 / 战斗）
                    </div>
                  ) : (
                    flatStat.map(([path, val]) => (
                      <div key={path} style={{
                        display: 'flex', gap: 10, padding: '4px 10px',
                        borderTop: '1px solid rgba(255,255,255,0.02)',
                      }}>
                        <span style={{
                          color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontSize: 10,
                          flexShrink: 0, minWidth: 130, wordBreak: 'break-all',
                        }}>{path}</span>
                        <span style={{
                          color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)', fontSize: 10,
                          wordBreak: 'break-all',
                        }}>{val || '(空)'}</span>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '5px 8px', borderRadius: 3, border: '1px solid var(--brass)',
  background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)',
  fontFamily: 'var(--font-mono)', fontSize: 11, outline: 'none',
};

const addBtnStyle: React.CSSProperties = {
  padding: '5px 14px', border: '1px solid var(--gold)', borderRadius: 3,
  background: 'rgba(196,168,85,0.1)', color: 'var(--gold)',
  fontFamily: 'var(--font-mono)', fontSize: 14, cursor: 'pointer',
};

const toolBtn: React.CSSProperties = {
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid transparent', borderRadius: 3, background: 'transparent',
  color: 'var(--ink-subtle)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-ui)',
};

const thStyle: React.CSSProperties = {
  padding: '7px 10px', textAlign: 'left', fontSize: 9,
  color: 'var(--ink-faded)', letterSpacing: 2, textTransform: 'uppercase',
  fontFamily: 'var(--font-ui)', fontWeight: 'normal',
};

const tdStyle: React.CSSProperties = {
  padding: '6px 10px',
};

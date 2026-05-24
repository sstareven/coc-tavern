import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { RegexScript, RegexScriptType, RegexPlacement } from '../../types';
import { useRegexStore } from '../../stores/useRegexStore';

const PLACEMENT_LABELS: Record<RegexPlacement, string> = {
  1: '用户输入',
  2: 'AI输出',
  3: '命令',
  5: '世界信息',
  6: '推理',
};

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function RegexPanel({ visible, onClose }: Props) {
  const globalScripts = useRegexStore((s) => s.globalScripts);
  const presetScripts = useRegexStore((s) => s.presetScripts);
  const openEditor = useRegexStore((s) => s.openEditor);
  const toggleScript = useRegexStore((s) => s.toggleScript);
  const deleteScript = useRegexStore((s) => s.deleteScript);
  const exportScript = useRegexStore((s) => s.exportScript);
  const importScript = useRegexStore((s) => s.importScript);
  const exportAllScripts = useRegexStore((s) => s.exportAllScripts);
  const moveScript = useRegexStore((s) => s.moveScript);
  const bulkToggleAll = useRegexStore((s) => s.bulkToggleAll);
  const bulkDelete = useRegexStore((s) => s.bulkDelete);

  const [activeTab, setActiveTab] = useState<RegexScriptType>('global');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importType, setImportType] = useState<RegexScriptType>('global');
  const [importJson, setImportJson] = useState('');

  const getScripts = (): RegexScript[] => {
    switch (activeTab) {
      case 'global': return globalScripts;
      case 'preset': return presetScripts;
    }
  };

  const scripts = getScripts().filter((s) =>
    !search || s.scriptName.toLowerCase().includes(search.toLowerCase()) ||
    s.findRegex.toLowerCase().includes(search.toLowerCase()));

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = scripts.length > 0 && scripts.every((s) => selected.has(s.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(scripts.map((s) => s.id)));
    }
  };

  const handleExportAll = () => {
    const json = exportAllScripts();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `regex-scripts-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    if (importJson.trim() && importScript(importJson, importType)) {
      setImportJson('');
      setShowImport(false);
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && importScript(reader.result, activeTab)) {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleDeleteSelected = () => {
    if (selected.size === 0) return;
    bulkDelete([...selected], activeTab);
    setSelected(new Set());
  };

  const handleToggleAllScripts = () => {
    const allDisabled = scripts.every((s) => s.disabled);
    bulkToggleAll(activeTab, !allDisabled);
  };

  if (!visible) return null;

  const TABS: { type: RegexScriptType; label: string }[] = [
    { type: 'global', label: `全局 (${globalScripts.length})` },
    { type: 'preset', label: `预设 (${presetScripts.length})` },
  ];

  return (
    <div className="panel-overlay" onClick={onClose}>
      <motion.div
        className="panel regex-panel"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--parchment)',
          color: 'var(--ink)',
          borderRadius: 12,
          padding: 24,
          width: 720,
          maxHeight: '90vh',
          overflowY: 'auto',
          fontFamily: 'var(--font-ui)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, color: 'var(--leather)', fontFamily: 'var(--font-display)' }}>
            正则脚本管理
          </h3>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: 'var(--ink-faded)',
            cursor: 'pointer', fontSize: 20,
          }}>
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: '1px solid var(--brass)', paddingBottom: 8 }}>
          {TABS.map((tab) => (
            <button
              key={tab.type}
              onClick={() => { setActiveTab(tab.type); setSelected(new Set()); }}
              style={{
                padding: '4px 16px',
                borderRadius: '6px 6px 0 0',
                border: 'none',
                background: activeTab === tab.type ? 'var(--leather)' : 'transparent',
                color: activeTab === tab.type ? 'var(--gold)' : 'var(--ink-faded)',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: activeTab === tab.type ? 'bold' : 'normal',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search + Toolbar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索脚本..."
            style={{
              flex: 1, minWidth: 140, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--brass)',
              fontSize: 12, background: 'var(--parchment-deep)', fontFamily: 'var(--font-ui)',
            }}
          />

          <button
            onClick={() => openEditor(null, activeTab)}
            style={{
              background: 'var(--gold)', color: 'var(--abyss)', border: 'none',
              borderRadius: 6, padding: '5px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 'bold',
            }}
          >
            + 新建
          </button>

          <button onClick={handleToggleAllScripts} style={btnStyle}>
            {scripts.every((s) => s.disabled) ? '全部启用' : '全部禁用'}
          </button>

          <label style={{ ...btnStyle, cursor: 'pointer' }}>
            导入文件
            <input type="file" accept=".json" onChange={handleFileImport} style={{ display: 'none' }} />
          </label>

          <button onClick={() => setShowImport(!showImport)} style={btnStyle}>导入JSON</button>
          <button onClick={handleExportAll} style={btnStyle}>导出全部</button>

          {selected.size > 0 && (
            <button onClick={handleDeleteSelected} style={{ ...btnStyle, color: 'var(--blood)' }} title="批量删除">
              删除 ({selected.size})
            </button>
          )}
        </div>

        {/* Import JSON panel */}
        <AnimatePresence>
          {showImport && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ overflow: 'hidden', marginBottom: 12 }}
            >
              <div style={{ padding: 10, background: 'var(--parchment-deep)', borderRadius: 8 }}>
                <select value={importType} onChange={(e) => setImportType(e.target.value as RegexScriptType)}
                  style={{
                    marginBottom: 8, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--brass)',
                    fontSize: 12, background: 'var(--parchment)',
                  }}>
                  <option value="global">导入为全局</option>
                  <option value="preset">导入为预设</option>
                </select>
                <textarea
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                  placeholder="粘贴 JSON..."
                  rows={4}
                  style={{
                    width: '100%', padding: '6px', borderRadius: 4, border: '1px solid var(--brass)',
                    fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--abyss)', color: 'var(--parchment)',
                    resize: 'vertical',
                  }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button onClick={handleImport} style={{
                    background: 'var(--gold)', color: 'var(--abyss)', border: 'none',
                    borderRadius: 4, padding: '4px 16px', cursor: 'pointer', fontSize: 12,
                  }}>
                    导入
                  </button>
                  <button onClick={() => setShowImport(false)} style={{
                    background: 'transparent', color: 'var(--ink-faded)', border: '1px solid var(--ink-faded)',
                    borderRadius: 4, padding: '4px 16px', cursor: 'pointer', fontSize: 12,
                  }}>
                    取消
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Select All */}
        {scripts.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--ink-subtle)', marginBottom: 6, paddingLeft: 2 }}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            全选 {scripts.length} 个脚本
          </label>
        )}

        {/* Script List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <AnimatePresence>
            {scripts.map((script) => (
              <motion.div
                key={script.id}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 8,
                  background: script.disabled ? 'var(--parchment-deep)' : 'var(--parchment-dark)',
                  border: selected.has(script.id) ? '1px solid var(--gold)' : '1px solid transparent',
                  opacity: script.disabled ? 0.6 : 1,
                  fontSize: 12,
                }}
              >
                <input
                  type="checkbox"
                  checked={selected.has(script.id)}
                  onChange={() => toggleSelect(script.id)}
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {script.scriptName}
                  </div>
                  <div style={{
                    fontSize: 10, color: 'var(--ink-subtle)', overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)',
                  }}>
                    {script.findRegex.substring(0, 60)}
                    <span style={{ marginLeft: 6 }}>
                      → {script.replaceString.substring(0, 30)}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--ink-faded)', marginTop: 2 }}>
                    {script.placement.map((p) => PLACEMENT_LABELS[p] ?? '').filter(Boolean).join(' · ')}
                    {script.markdownOnly && ' · 仅显示'}{script.promptOnly && ' · 仅提示词'}
                    {script.disabled === true && ' · 已禁用'}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  <button onClick={() => toggleScript(script.id, activeTab)}
                    title={script.disabled ? '启用' : '禁用'}
                    style={{ ...iconBtnStyle, color: script.disabled ? 'var(--blood)' : 'var(--success)' }}>
                    {script.disabled ? '⊘' : '●'}
                  </button>
                  <button onClick={() => openEditor(script, activeTab)} title="编辑" style={iconBtnStyle}>✎</button>

                  {/* Move button — toggle between global/preset */}
                  {activeTab === 'global' && (
                    <button onClick={() => moveScript(script.id, 'global', 'preset')} title="移至预设" style={iconBtnStyle}>⚙</button>
                  )}
                  {activeTab === 'preset' && (
                    <button onClick={() => moveScript(script.id, 'preset', 'global')} title="移至全局" style={iconBtnStyle}>🌐</button>
                  )}

                  <button onClick={() => {
                    const json = exportScript(script.id, activeTab);
                    if (json) {
                      const blob = new Blob([json], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `regex-${script.scriptName}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }
                  }} title="导出" style={iconBtnStyle}>⤓</button>
                  <button onClick={() => { deleteScript(script.id, activeTab); setSelected((prev) => { const n = new Set(prev); n.delete(script.id); return n; }); }}
                    title="删除" style={{ ...iconBtnStyle, color: 'var(--blood)' }}>✕</button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {scripts.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--ink-subtle)', fontSize: 13 }}>
              {search ? '没有找到匹配的脚本' : `暂无${activeTab === 'global' ? '全局' : '预设'}正则脚本`}
              <br />
              <button onClick={() => openEditor(null, activeTab)} style={{
                marginTop: 12, background: 'var(--gold)', color: 'var(--abyss)', border: 'none',
                borderRadius: 6, padding: '6px 20px', cursor: 'pointer', fontSize: 13,
              }}>
                创建第一个脚本
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  background: 'var(--brass)',
  color: 'var(--parchment)',
  border: 'none',
  borderRadius: 6,
  padding: '5px 12px',
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'var(--font-ui)',
};

const iconBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '2px 6px',
  fontSize: 14,
  color: 'var(--ink-faded)',
  borderRadius: 4,
};

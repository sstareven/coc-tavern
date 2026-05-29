import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { usePanelStore } from '../../stores/usePanelStore';
import { useRegexStore, BUILTIN_REGEX_IDS } from '../../stores/useRegexStore';
import { DarkSelect } from '../Shared/DarkSelect';
import { TavernHelperContent } from './TavernHelperContent';
import { BackgroundSettings } from './BackgroundSettings';
import { PromptTemplateContent } from './PromptTemplateContent';
import type { RegexScript, RegexScriptType, RegexPlacement } from '../../types';

const PP_OPTIONS = [
  { label: '未选择', value: '' },
  { label: 'With Tools', value: '__sep_with_tools' },
  { label: '合并相同角色连续的发言(含工具)', value: 'merge_with_tools' },
  { label: '半严格 (强制对话角色交替) (含工具)', value: 'semi_strict_with_tools' },
  { label: '严格 (强制对话角色交替、用户最先)(含工具)', value: 'strict_with_tools' },
  { label: 'No Tools', value: '__sep_no_tools' },
  { label: '合并相同角色连续的发言', value: 'merge' },
  { label: '半严格 (强制对话角色交替)', value: 'semi_strict' },
  { label: '严格(强制对话角色交替、用户最先)', value: 'strict' },
  { label: '单一用户消息 (无工具)', value: 'single_user' },
];

// ── Section type ──
type SettingsSection = 'general' | 'regex' | 'extensions' | 'tavernHelper' | 'background' | 'promptTemplate';

interface Props {
  visible: boolean;
  onClose: () => void;
  onReturnToMenu: () => void;
}

// ── Regex sub-components ──

const PLACEMENT_LABELS: Record<RegexPlacement, string> = {
  1: '用户输入',
  2: 'AI输出',
  3: '命令',
  5: '世界信息',
  6: '推理',
};

function RegexSettingsContent() {
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

  const TABS: { type: RegexScriptType; label: string }[] = [
    { type: 'global', label: `全局 (${globalScripts.length})` },
    { type: 'preset', label: `预设 (${presetScripts.length})` },
  ];

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--brass)', paddingBottom: 6 }}>
        {TABS.map((tab) => (
          <button key={tab.type} onClick={() => { setActiveTab(tab.type); setSelected(new Set()); }}
            style={{
              padding: '4px 14px', borderRadius: '4px 4px 0 0', border: 'none',
              background: activeTab === tab.type ? 'rgba(196,168,85,0.15)' : 'transparent',
              color: activeTab === tab.type ? 'var(--gold)' : 'var(--ink-faded)',
              cursor: 'pointer', fontSize: 12, fontWeight: activeTab === tab.type ? 'bold' : 'normal',
              fontFamily: 'var(--font-ui)',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search + Toolbar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索脚本..."
          style={{
            flex: 1, minWidth: 100, padding: '5px 8px', borderRadius: 4,
            border: '1px solid rgba(196,168,85,0.2)', fontSize: 11,
            background: 'rgba(0,0,0,0.25)', color: 'var(--text-light)',
            fontFamily: 'var(--font-ui)', outline: 'none',
          }}
        />
        <button onClick={() => openEditor(null, activeTab)} style={miniBtnStyle}>
          + 新建
        </button>
        <button onClick={() => { bulkToggleAll(activeTab, !scripts.every((s) => s.disabled)); }} style={miniBtnStyle}>
          {scripts.every((s) => s.disabled) ? '启用全部' : '禁用全部'}
        </button>
        <label style={{ ...miniBtnStyle, cursor: 'pointer' }}>
          导入
          <input type="file" accept=".json" onChange={handleFileImport} style={{ display: 'none' }} />
        </label>
        <button onClick={() => setShowImport(!showImport)} style={miniBtnStyle}>JSON</button>
        <button onClick={handleExportAll} style={miniBtnStyle}>导出全部</button>
        {selected.size > 0 && (
          <button onClick={() => { bulkDelete([...selected], activeTab); setSelected(new Set()); }}
            style={{ ...miniBtnStyle, color: 'var(--blood)' }}>
            删除({selected.size})
          </button>
        )}
      </div>

      {/* Import JSON */}
      <AnimatePresence>
        {showImport && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden', marginBottom: 10 }}>
            <div style={{ padding: 8, background: 'rgba(0,0,0,0.2)', borderRadius: 6 }}>
              <select value={importType} onChange={(e) => setImportType(e.target.value as RegexScriptType)}
                style={{
                  marginBottom: 6, padding: '3px 6px', borderRadius: 3,
                  border: '1px solid rgba(196,168,85,0.2)', fontSize: 11,
                  background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)',
                }}>
                <option value="global">导入为全局</option>
                <option value="preset">导入为预设</option>
              </select>
              <textarea value={importJson} onChange={(e) => setImportJson(e.target.value)}
                placeholder="粘贴 JSON..."
                rows={3}
                style={{
                  width: '100%', padding: '6px', borderRadius: 3,
                  border: '1px solid rgba(196,168,85,0.2)', fontFamily: 'var(--font-mono)',
                  fontSize: 10, background: 'rgba(0,0,0,0.3)', color: 'var(--parchment)',
                  resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button onClick={handleImport} style={{ ...miniBtnStyle, background: 'var(--gold)', color: 'var(--abyss)' }}>导入</button>
                <button onClick={() => setShowImport(false)} style={miniBtnStyle}>取消</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Select All */}
      {scripts.length > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--ink-subtle)', marginBottom: 4, paddingLeft: 2 }}>
          <input type="checkbox" checked={allSelected} onChange={() => {
            if (allSelected) setSelected(new Set());
            else setSelected(new Set(scripts.map((s) => s.id)));
          }} />
          全选 {scripts.length} 个
        </label>
      )}

      {/* Script List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 340, overflowY: 'auto' }}>
        <AnimatePresence>
          {scripts.map((script) => (
            <motion.div key={script.id} initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 4,
                background: script.disabled ? 'rgba(0,0,0,0.12)' : 'rgba(196,168,85,0.04)',
                border: selected.has(script.id) ? '1px solid rgba(196,168,85,0.3)' : '1px solid transparent',
                opacity: script.disabled ? 0.55 : 1,
                fontSize: 11,
              }}>
              <input type="checkbox" checked={selected.has(script.id)} onChange={() => toggleSelect(script.id)}
                style={{ transform: 'scale(0.9)' }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--text-light)' }}>
                  {script.scriptName}
                  {script.disabled && <span style={{ color: 'var(--blood)', marginLeft: 6, fontSize: 9 }}>已禁用</span>}
                </div>
                <div style={{
                  fontSize: 9, color: 'var(--ink-subtle)', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)',
                }}>
                  {script.findRegex.substring(0, 50)}
                  {script.replaceString && <span style={{ marginLeft: 4 }}>→ {script.replaceString.substring(0, 25)}</span>}
                </div>
                <div style={{ fontSize: 9, color: 'var(--ink-faded)', marginTop: 1 }}>
                  {script.placement.map((p) => PLACEMENT_LABELS[p] ?? '').filter(Boolean).join(' · ')}
                  {script.markdownOnly && ' · 显示'}{script.promptOnly && ' · 提示词'}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                <button onClick={() => toggleScript(script.id, activeTab)} title={script.disabled ? '启用' : '禁用'}
                  style={{ ...iconBtn, color: script.disabled ? 'var(--blood)' : 'var(--success)' }}>
                  {script.disabled ? '⊘' : '●'}
                </button>
                <button onClick={() => openEditor(script, activeTab)} title="编辑" style={iconBtn}>✎</button>
                {!BUILTIN_REGEX_IDS.has(script.id) && (activeTab === 'global'
                  ? <button onClick={() => moveScript(script.id, 'global', 'preset')} title="移至预设" style={iconBtn}>⚙</button>
                  : <button onClick={() => moveScript(script.id, 'preset', 'global')} title="移至全局" style={iconBtn}>🌐</button>
                )}
                <button onClick={() => {
                  const json = exportScript(script.id, activeTab);
                  if (json) {
                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = `regex-${script.scriptName}.json`; a.click();
                    URL.revokeObjectURL(url);
                  }
                }} title="导出" style={iconBtn}>⤓</button>
                {!BUILTIN_REGEX_IDS.has(script.id) && (
                  <button onClick={() => {
                    deleteScript(script.id, activeTab);
                    setSelected((prev) => { const n = new Set(prev); n.delete(script.id); return n; });
                  }} title="删除" style={{ ...iconBtn, color: 'var(--blood)' }}>✕</button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {scripts.length === 0 && (
          <div style={{ textAlign: 'center', padding: 28, color: 'var(--ink-subtle)', fontSize: 11 }}>
            {search ? '没有找到匹配的脚本' : `暂无${activeTab === 'global' ? '全局' : '预设'}正则脚本`}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Extensions section content ──

function ExtensionsSettingsContent() {
  return (
    <div>
      <p style={{ fontSize: 11, color: 'var(--ink-subtle)', marginBottom: 14 }}>
        管理已安装的扩展脚本，启用或禁用功能模块。
      </p>
      <button onClick={() => { usePanelStore.getState().open('extManager'); }} style={{
        width: '100%', padding: '10px 0', border: '1px solid var(--brass)',
        borderRadius: 3, background: 'rgba(0,0,0,0.2)', color: 'var(--text-light)',
        fontFamily: 'var(--font-ui)', fontSize: 12, letterSpacing: 3, cursor: 'pointer',
      }}>
        打开扩展管理器
      </button>
    </div>
  );
}

// ── Sidebar ──

interface SidebarItem {
  key: SettingsSection;
  label: string;
  icon: string;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { key: 'general', label: '基本设置', icon: '⚙' },
  { key: 'regex', label: '正则脚本', icon: '✧' },
  { key: 'extensions', label: '扩展管理', icon: '⊞' },
  { key: 'tavernHelper', label: '酒馆助手', icon: '🍶' },
  { key: 'background', label: '背景设定', icon: '📜' },
  { key: 'promptTemplate', label: '提示词模板', icon: '📝' },
];

// ── Main Settings Panel ──

export function SettingsPanel({ visible, onClose, onReturnToMenu }: Props) {
  const [section, setSection] = useState<SettingsSection>('general');

  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const toggleSound = useSettingsStore((s) => s.toggleSound);
  const tooltipDelay = useSettingsStore((s) => s.tooltipDelay);
  const setTooltipDelay = useSettingsStore((s) => s.setTooltipDelay);
  const musicVolume = useSettingsStore((s) => s.musicVolume);
  const setMusicVolume = useSettingsStore((s) => s.setMusicVolume);
  const autoSubmitChoice = useSettingsStore((s) => s.autoSubmitChoice);
  const setAutoSubmitChoice = useSettingsStore((s) => s.setAutoSubmitChoice);
  const maxSummaryEntries = useSettingsStore((s) => s.maxSummaryEntries);
  const setMaxSummaryEntries = useSettingsStore((s) => s.setMaxSummaryEntries);
  const apiBaseUrl = useSettingsStore((s) => s.apiBaseUrl);
  const apiModel = useSettingsStore((s) => s.apiModel);
  const setApiModel = useSettingsStore((s) => s.setApiModel);
  const setApiBaseUrl = useSettingsStore((s) => s.setApiBaseUrl);
  const promptPostProcessing = useSettingsStore((s) => s.promptPostProcessing);
  const setPromptPostProcessing = useSettingsStore((s) => s.setPromptPostProcessing);
  const apiKey = useSettingsStore((s) => s.apiKey);
  const setApiKey = useSettingsStore((s) => s.setApiKey);
  const availableModels = useSettingsStore((s) => s.availableModels);
  const setAvailableModels = useSettingsStore((s) => s.setAvailableModels);

  const mvuUseIndependentApi = useSettingsStore((s) => s.mvuUseIndependentApi);
  const setMvuUseIndependentApi = useSettingsStore((s) => s.setMvuUseIndependentApi);
  const mvuApiBaseUrl = useSettingsStore((s) => s.mvuApiBaseUrl);
  const setMvuApiBaseUrl = useSettingsStore((s) => s.setMvuApiBaseUrl);
  const mvuApiModel = useSettingsStore((s) => s.mvuApiModel);
  const setMvuApiModel = useSettingsStore((s) => s.setMvuApiModel);
  const mvuApiKey = useSettingsStore((s) => s.mvuApiKey);
  const setMvuApiKey = useSettingsStore((s) => s.setMvuApiKey);
  const mvuTemperature = useSettingsStore((s) => s.mvuTemperature);
  const setMvuTemperature = useSettingsStore((s) => s.setMvuTemperature);
  const mvuRetryCount = useSettingsStore((s) => s.mvuRetryCount);
  const setMvuRetryCount = useSettingsStore((s) => s.setMvuRetryCount);
  const mvuMaxTokens = useSettingsStore((s) => s.mvuMaxTokens);
  const setMvuMaxTokens = useSettingsStore((s) => s.setMvuMaxTokens);

  const [localApiUrl, setLocalApiUrl] = useState(apiBaseUrl);
  const [localApiModel, setLocalApiModel] = useState(apiModel);
  const [localApiKey, setLocalApiKey] = useState(apiKey);
  const [localMvuUrl, setLocalMvuUrl] = useState(mvuApiBaseUrl);
  const [localMvuModel, setLocalMvuModel] = useState(mvuApiModel);
  const [localMvuKey, setLocalMvuKey] = useState(mvuApiKey);
  const mvuAvailableModels = useSettingsStore((s) => s.mvuAvailableModels);
  const setMvuAvailableModels = useSettingsStore((s) => s.setMvuAvailableModels);
  const [connStatus, setConnStatus] = useState<'idle' | 'testing' | 'connected' | 'failed'>('idle');
  const [modelsLoading, setModelsLoading] = useState(false);
  const [mvuConnStatus, setMvuConnStatus] = useState<'idle' | 'testing' | 'connected' | 'failed'>('idle');
  const [mvuModelsLoading, setMvuModelsLoading] = useState(false);
  const [ppDropdownOpen, setPpDropdownOpen] = useState(false);
  const [ppHelpOpen, setPpHelpOpen] = useState(false);
  const [summaryHelpOpen, setSummaryHelpOpen] = useState(false);

  const handleReturnToMenu = () => {
    onClose();
    usePanelStore.getState().closeAll();
    onReturnToMenu();
  };

  const testMvuConnection = () => {
    if (!localMvuUrl.trim()) return;
    setMvuConnStatus('testing');
    setMvuModelsLoading(true);
    const base = localMvuUrl.trim().replace(/\/+$/, '');
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (localMvuKey.trim()) headers['Authorization'] = `Bearer ${localMvuKey.trim()}`;
    fetch(`${base}/models`, { method: 'GET', headers })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const models: string[] = Array.isArray(data?.data)
          ? data.data.map((m: Record<string, string>) => m.id ?? m.name ?? m.model ?? '').filter(Boolean)
          : [];
        setMvuAvailableModels(models);
        setMvuConnStatus('connected');
      })
      .catch(() => {
        setMvuAvailableModels([]);
        setMvuConnStatus('failed');
      })
      .finally(() => setMvuModelsLoading(false));
  };

  const testConnection = () => {
    if (!localApiUrl.trim()) return;
    setConnStatus('testing');
    setModelsLoading(true);
    const base = localApiUrl.trim().replace(/\/+$/, '');
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (localApiKey.trim()) headers['Authorization'] = `Bearer ${localApiKey.trim()}`;
    fetch(`${base}/models`, { method: 'GET', headers })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const models: string[] = Array.isArray(data?.data)
          ? data.data.map((m: Record<string, string>) => m.id ?? m.name ?? m.model ?? '').filter(Boolean)
          : [];
        setAvailableModels(models);
        setConnStatus('connected');
      })
      .catch(() => {
        setAvailableModels([]);
        setConnStatus('failed');
      })
      .finally(() => setModelsLoading(false));
  };

  if (!visible) return null;

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
        display: 'flex',
        width: 820, maxWidth: '95vw', height: 560, maxHeight: '90vh',
        background: 'linear-gradient(135deg, var(--leather) 0%, var(--abyss) 100%)',
        border: '1px solid var(--gold)',
        borderRadius: 8,
        boxShadow: '0 0 80px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}>
        {/* ── Sidebar ── */}
        <div style={{
          width: 180, flexShrink: 0,
          background: 'rgba(0,0,0,0.25)',
          borderRight: '1px solid rgba(196,168,85,0.1)',
          display: 'flex', flexDirection: 'column',
          padding: '16px 0',
        }}>
          <div style={{
            padding: '0 16px 12px', borderBottom: '1px solid rgba(196,168,85,0.12)', marginBottom: 8,
            fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--gold)', letterSpacing: 2,
            textAlign: 'center',
          }}>
            设置
          </div>

          {SIDEBAR_ITEMS.map((item) => (
            <button key={item.key}
              onClick={() => setSection(item.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 16px', margin: '2px 8px',
                border: 'none', borderRadius: 4,
                background: section === item.key ? 'rgba(196,168,85,0.1)' : 'transparent',
                color: section === item.key ? 'var(--gold)' : 'var(--ink-subtle)',
                fontFamily: 'var(--font-ui)', fontSize: 12, letterSpacing: 1,
                cursor: 'pointer', textAlign: 'left',
                transition: 'background 0.2s, color 0.2s',
              }}
              onMouseEnter={(e) => { if (section !== item.key) { e.currentTarget.style.color = 'var(--text-light)'; e.currentTarget.style.background = 'rgba(196,168,85,0.04)'; } }}
              onMouseLeave={(e) => { if (section !== item.key) { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.background = 'transparent'; } }}
            >
              <span style={{ fontSize: 14 }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}

          <div style={{ flex: 1 }} />

          <button onClick={onClose} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 16px', margin: '8px 8px 0',
            border: 'none', borderRadius: 4,
            background: 'transparent', color: 'var(--ink-subtle)',
            fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 1,
            cursor: 'pointer', textAlign: 'left',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; }}
          >
            <span>✕</span>
            <span>关闭</span>
          </button>
        </div>

        {/* ── Content ── */}
        <div style={{
          flex: 1, padding: '24px 28px', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', minWidth: 0,
        }}>
          {/* Section title */}
          <div style={{
            paddingBottom: 12, marginBottom: 16,
            borderBottom: '1px solid rgba(196,168,85,0.12)',
            fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--gold)', letterSpacing: 2,
          }}>
            {SIDEBAR_ITEMS.find((i) => i.key === section)?.label ?? ''}
          </div>

          <AnimatePresence mode="wait">
            {section === 'general' && (
              <motion.div key="general" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
                {/* Sound toggle */}
                <div style={rowStyle}>
                  <span style={labelStyle}>环境音效</span>
                  <button onClick={toggleSound} style={{
                    padding: '5px 18px', border: soundEnabled ? '1px solid var(--success)' : '1px solid var(--ink-faded)',
                    borderRadius: 3, background: soundEnabled ? 'rgba(58,107,90,0.15)' : 'rgba(0,0,0,0.2)',
                    color: soundEnabled ? 'var(--success)' : 'var(--ink-faded)', fontFamily: 'var(--font-ui)',
                    fontSize: 11, letterSpacing: 2, cursor: 'pointer',
                  }}>
                    {soundEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* Music volume */}
                <div style={rowStyle}>
                  <span style={labelStyle}>音乐音量</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="range" min={0} max={100} value={musicVolume}
                      onChange={(e) => setMusicVolume(Number(e.target.value))}
                      style={{ width: 100, accentColor: 'var(--gold)' }}
                    />
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--gold)', width: 28 }}>{musicVolume}%</span>
                  </div>
                </div>

                {/* Tooltip delay */}
                <div style={rowStyle}>
                  <span style={labelStyle}>提示延迟</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="range" min={200} max={2000} step={100} value={tooltipDelay}
                      onChange={(e) => setTooltipDelay(Number(e.target.value))}
                      style={{ width: 100, accentColor: 'var(--gold)' }}
                    />
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--gold)', width: 36 }}>{tooltipDelay}ms</span>
                  </div>
                </div>

                {/* Auto-submit choice */}
                <div style={rowStyle}>
                  <span style={labelStyle}>选项自动推进</span>
                  <button onClick={() => setAutoSubmitChoice(!autoSubmitChoice)} style={{
                    padding: '5px 18px', border: autoSubmitChoice ? '1px solid var(--success)' : '1px solid var(--ink-faded)',
                    borderRadius: 20, background: autoSubmitChoice ? 'rgba(58,107,90,0.18)' : 'rgba(0,0,0,0.15)',
                    color: autoSubmitChoice ? 'var(--success-bright)' : 'var(--ink-subtle)',
                    fontFamily: 'var(--font-ui)', fontSize: 11, cursor: 'pointer', letterSpacing: 1,
                    transition: 'var(--transition-smooth)',
                  }}>{autoSubmitChoice ? 'ON' : 'OFF'}</button>
                </div>

                {/* Max summary entries */}
                <div style={rowStyle}>
                  <span style={{ ...labelStyle, position: 'relative' }}>
                    上下文总结上限
                    <span onClick={() => setSummaryHelpOpen(!summaryHelpOpen)} style={helpIconStyle}>?</span>
                    {summaryHelpOpen && (
                      <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setSummaryHelpOpen(false)} />
                        <div style={{
                          position: 'absolute', top: '120%', left: 0, zIndex: 1000,
                          background: 'var(--leather)', border: '1px solid var(--gold)',
                          borderRadius: 4, padding: 10, minWidth: 300,
                          boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
                          fontSize: 10, color: 'var(--text-light)',
                          lineHeight: 1.8, fontFamily: 'var(--font-ui)', whiteSpace: 'pre-line',
                        }}>
                          {'上下文注意力有限，回顾总结条目过多可能导致LLM注意力分散，\n引发剧情混乱或遗忘近期事件。建议保持在20条以内。\n\n此设置控制每次生成时最多注入多少条「剧情回顾」摘要到LLM上下文中。'}
                        </div>
                      </>
                    )}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="range" min={5} max={50} step={5}
                      value={maxSummaryEntries}
                      onChange={(e) => setMaxSummaryEntries(Number(e.target.value))}
                      style={{ width: 100, accentColor: 'var(--gold)' }}
                    />
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--gold)', width: 30 }}>{maxSummaryEntries}</span>
                  </div>
                </div>

                {/* API section */}
                <div style={{ marginTop: 16, borderTop: '1px solid rgba(196,168,85,0.08)', paddingTop: 14 }}>
                  <div style={{ fontSize: 9, fontFamily: 'var(--font-ui)', color: 'var(--ink-subtle)', letterSpacing: 3, marginBottom: 10, textTransform: 'uppercase' }}>
                    API 配置
                  </div>

                  <div style={rowStyle}>
                    <span style={labelStyle}>API Key</span>
                    <input type="password" value={localApiKey}
                      onChange={(e) => { setLocalApiKey(e.target.value); setApiKey(e.target.value); }}
                      placeholder="sk-..." style={inputStyle}
                      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
                    />
                  </div>

                  <div style={rowStyle}>
                    <span style={labelStyle}>API 地址</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input value={localApiUrl}
                        onChange={(e) => { setLocalApiUrl(e.target.value); setApiBaseUrl(e.target.value); }}
                        style={{ ...inputStyle, width: 160 }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
                      />
                      <button onClick={testConnection} disabled={connStatus === 'testing'}
                        style={{
                          padding: '5px 10px', border: '1px solid var(--brass)', borderRadius: 3,
                          background: 'rgba(0,0,0,0.2)', color: 'var(--text-light)',
                          fontFamily: 'var(--font-ui)', fontSize: 10, letterSpacing: 1, cursor: 'pointer',
                          opacity: connStatus === 'testing' ? 0.5 : 1,
                        }}>
                        {connStatus === 'testing' ? '...' : '测试'}
                      </button>
                      {connStatus === 'connected' && (
                        <span style={{ fontSize: 9, color: 'var(--success)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>已连接</span>
                      )}
                      {connStatus === 'failed' && (
                        <span style={{ fontSize: 9, color: 'var(--blood)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>失败</span>
                      )}
                    </div>
                  </div>

                  <div style={rowStyle}>
                    <span style={labelStyle}>模型</span>
                    <div style={{ width: 200 }}>
                      {availableModels.length > 0 ? (
                        <DarkSelect compact value={localApiModel} onChange={(v) => { setLocalApiModel(v); setApiModel(v); }} options={availableModels.map(m => ({ value: m, label: m }))} />
                      ) : (
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-faded)', padding: '7px 9px' }}>{modelsLoading ? '加载中...' : '请先测试连接'}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Prompt Post-Processing */}
                <div style={rowStyle}>
                  <span style={labelStyle}>
                    提示词后处理
                    <span onClick={() => setPpHelpOpen(!ppHelpOpen)} style={helpIconStyle}>?</span>
                    {ppHelpOpen && (
                      <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setPpHelpOpen(false)} />
                        <div style={{ position: 'absolute', top: '120%', left: 0, zIndex: 1000, background: 'var(--leather)', border: '1px solid var(--gold)', borderRadius: 4, padding: 10, minWidth: 340, boxShadow: '0 4px 16px rgba(0,0,0,0.6)', fontSize: 10, color: 'var(--text-light)', lineHeight: 1.8, fontFamily: 'var(--font-ui)', whiteSpace: 'pre-line' }}>
                          {`None — 不进行显式处理，除非 API 严格要求
合并相同角色连续的发言
半严格 — 合并角色并只允许一条可选系统消息
严格 — 合并角色、只允许一条可选系统消息、要求用户消息在最前
单一用户消息 — 将所有角色的所有消息合并为一条用户消息`}
                        </div>
                      </>
                    )}
                  </span>
                  <div style={{ position: 'relative', width: 240 }}>
                    <button onClick={() => setPpDropdownOpen(!ppDropdownOpen)} style={{
                      width: '100%', padding: '6px 8px', border: '1px solid var(--brass)', borderRadius: 3,
                      background: 'rgba(0,0,0,0.3)', color: 'var(--parchment)',
                      fontFamily: 'var(--font-ui)', fontSize: 10, cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', outline: 'none',
                    }}>
                      <span>{PP_OPTIONS.find((o) => o.value === promptPostProcessing)?.label ?? '未选择'}</span>
                      <span style={{ fontSize: 8, color: 'var(--brass)' }}>▼</span>
                    </button>
                    {ppDropdownOpen && (
                      <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setPpDropdownOpen(false)} />
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000, background: 'var(--leather)', border: '1px solid var(--gold)', borderRadius: 3, marginTop: 2, maxHeight: 320, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.6)', scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.2)' }}>
                          <style>{`.pp-scroll::-webkit-scrollbar{width:5px}.pp-scroll::-webkit-scrollbar-track{background:rgba(0,0,0,0.15);border-radius:3px}.pp-scroll::-webkit-scrollbar-thumb{background:var(--brass);border-radius:3px}.pp-scroll::-webkit-scrollbar-thumb:hover{background:var(--gold)}`}</style>
                          <div className="pp-scroll">
                            {PP_OPTIONS.map((opt) => {
                              if (opt.value.startsWith('__sep')) {
                                return <div key={opt.value} style={{ padding: '5px 10px', fontSize: 9, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 1, borderBottom: '1px solid rgba(196,168,85,0.08)', background: 'rgba(196,168,85,0.06)' }}>{opt.label}</div>;
                              }
                              return (
                                <div key={opt.value} onClick={() => { setPromptPostProcessing(opt.value); setPpDropdownOpen(false); }} style={{
                                  padding: '6px 10px', cursor: 'pointer',
                                  background: opt.value === promptPostProcessing ? 'rgba(196,168,85,0.15)' : 'transparent',
                                  color: opt.value === promptPostProcessing ? 'var(--gold)' : 'var(--text-light)',
                                  fontFamily: 'var(--font-ui)', fontSize: 10,
                                  borderBottom: '1px solid rgba(196,168,85,0.06)',
                                }} onMouseEnter={(e) => { if (opt.value !== promptPostProcessing) e.currentTarget.style.background = 'rgba(196,168,85,0.06)'; }}
                                  onMouseLeave={(e) => { if (opt.value !== promptPostProcessing) e.currentTarget.style.background = 'transparent'; }}
                                >{opt.label}</div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* MVU Variable Engine API */}
                <div style={{ marginTop: 16, borderTop: '1px solid rgba(196,168,85,0.08)', paddingTop: 14 }}>
                  <div style={{ fontSize: 9, fontFamily: 'var(--font-ui)', color: 'var(--ink-subtle)', letterSpacing: 3, marginBottom: 10, textTransform: 'uppercase' }}>
                    MVU 变量引擎 API
                  </div>

                  {/* Toggle independent/global */}
                  <div style={rowStyle}>
                    <span style={labelStyle}>独立通道</span>
                    <button
                      onClick={() => setMvuUseIndependentApi(!mvuUseIndependentApi)}
                      style={{
                        padding: '5px 18px',
                        border: mvuUseIndependentApi ? '1px solid var(--gold)' : '1px solid var(--ink-faded)',
                        borderRadius: 3,
                        background: mvuUseIndependentApi ? 'rgba(196,168,85,0.15)' : 'rgba(0,0,0,0.2)',
                        color: mvuUseIndependentApi ? 'var(--gold)' : 'var(--ink-faded)',
                        fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 2, cursor: 'pointer',
                      }}>
                      {mvuUseIndependentApi ? '独立' : '跟随全局'}
                    </button>
                  </div>

                  {mvuUseIndependentApi && (
                    <>
                      <div style={rowStyle}>
                        <span style={labelStyle}>API Key</span>
                        <input type="password" value={localMvuKey}
                          onChange={(e) => { setLocalMvuKey(e.target.value); setMvuApiKey(e.target.value); }}
                          placeholder="sk-..." style={inputStyle}
                          onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
                          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
                        />
                      </div>

                      <div style={rowStyle}>
                        <span style={labelStyle}>API 地址</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input value={localMvuUrl}
                            onChange={(e) => { setLocalMvuUrl(e.target.value); setMvuApiBaseUrl(e.target.value); }}
                            style={{ ...inputStyle, width: 160 }}
                            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
                          />
                          <button onClick={testMvuConnection} disabled={mvuConnStatus === 'testing'}
                            style={{
                              padding: '5px 10px', border: '1px solid var(--brass)', borderRadius: 3,
                              background: 'rgba(0,0,0,0.2)', color: 'var(--text-light)',
                              fontFamily: 'var(--font-ui)', fontSize: 10, letterSpacing: 1, cursor: 'pointer',
                              opacity: mvuConnStatus === 'testing' ? 0.5 : 1,
                            }}>
                            {mvuConnStatus === 'testing' ? '...' : '测试'}
                          </button>
                          {mvuConnStatus === 'connected' && (
                            <span style={{ fontSize: 9, color: 'var(--success)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>已连接</span>
                          )}
                          {mvuConnStatus === 'failed' && (
                            <span style={{ fontSize: 9, color: 'var(--blood)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>失败</span>
                          )}
                        </div>
                      </div>

                      <div style={rowStyle}>
                        <span style={labelStyle}>模型</span>
                        <div style={{ width: 200 }}>
                          {mvuAvailableModels.length > 0 ? (
                            <DarkSelect compact value={localMvuModel} onChange={(v) => { setLocalMvuModel(v); setMvuApiModel(v); }} options={mvuAvailableModels.map(m => ({ value: m, label: m }))} />
                          ) : (
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-faded)', padding: '7px 9px' }}>{mvuModelsLoading ? '加载中...' : '请先测试连接'}</div>
                          )}
                        </div>
                      </div>

                      <div style={rowStyle}>
                        <span style={labelStyle}>温度</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <input type="range" min={0} max={2} step={0.1} value={mvuTemperature}
                            onChange={(e) => setMvuTemperature(Number(e.target.value))}
                            style={{ width: 100, accentColor: 'var(--gold)' }}
                          />
                          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--gold)', width: 24 }}>{mvuTemperature}</span>
                        </div>
                      </div>

                      <div style={rowStyle}>
                        <span style={labelStyle}>重试次数</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <input type="range" min={1} max={5} step={1} value={mvuRetryCount}
                            onChange={(e) => setMvuRetryCount(Number(e.target.value))}
                            style={{ width: 100, accentColor: 'var(--gold)' }}
                          />
                          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--gold)', width: 16 }}>{mvuRetryCount}</span>
                        </div>
                      </div>

                      <div style={rowStyle}>
                        <span style={labelStyle}>最大回复长度 (Token)</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <input type="range" min={512} max={16384} step={512} value={mvuMaxTokens}
                            onChange={(e) => setMvuMaxTokens(Number(e.target.value))}
                            style={{ width: 100, accentColor: 'var(--gold)' }}
                          />
                          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--gold)', width: 36 }}>{mvuMaxTokens}</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Return to menu */}
                <button onClick={handleReturnToMenu} style={{
                  width: '100%', marginTop: 20, padding: '8px 0',
                  border: '1px solid var(--blood)', borderRadius: 3,
                  background: 'rgba(139,58,58,0.08)', color: 'var(--blood)',
                  fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 4, cursor: 'pointer',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,58,58,0.18)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(139,58,58,0.08)'; }}
                >
                  返回主菜单
                </button>
              </motion.div>
            )}

            {section === 'regex' && (
              <motion.div key="regex" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
                <RegexSettingsContent />
              </motion.div>
            )}

            {section === 'extensions' && (
              <motion.div key="extensions" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
                <ExtensionsSettingsContent />
              </motion.div>
            )}
            {section === 'tavernHelper' && (
              <motion.div key="tavernHelper" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
                <TavernHelperContent />
              </motion.div>
            )}
            {section === 'background' && (
              <motion.div key="background" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
                <BackgroundSettings />
              </motion.div>
            )}
            {section === 'promptTemplate' && (
              <motion.div key="promptTemplate" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
                <PromptTemplateContent />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ── Shared styles ──

const rowStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.02)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-light)', fontFamily: 'var(--font-ui)', letterSpacing: 1,
};

const inputStyle: React.CSSProperties = {
  width: 200, padding: '7px 9px', border: '1px solid var(--brass)', borderRadius: 3,
  background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-mono)',
  fontSize: 11, outline: 'none', caretColor: 'var(--gold)',
};

const miniBtnStyle: React.CSSProperties = {
  background: 'rgba(196,168,85,0.08)',
  color: 'var(--text-light)',
  border: '1px solid rgba(196,168,85,0.15)',
  borderRadius: 4,
  padding: '4px 10px',
  cursor: 'pointer',
  fontSize: 10,
  fontFamily: 'var(--font-ui)',
  letterSpacing: 1,
};

const iconBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '2px 5px',
  fontSize: 12,
  color: 'var(--ink-faded)',
  borderRadius: 3,
};

const helpIconStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--brass)',
  color: 'var(--ink-subtle)', cursor: 'help', fontSize: 9, fontWeight: 'bold',
  fontFamily: 'var(--font-ui)', marginLeft: 4,
};

import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { usePromptViewerStore } from '../../stores/usePromptViewerStore';
import { usePanelStore } from '../../stores/usePanelStore';
import { useRegexStore, BUILTIN_REGEX_IDS } from '../../stores/useRegexStore';
import { DarkSelect } from '../Shared/DarkSelect';
import { type DsThinkingMode } from '../../sillytavern/deepseek-cache';
import { useIsMobile } from '../../hooks/useIsMobile';
import { getUiScale } from '../../hooks/useUiScale';
import { ModelEndpointConfig } from './ModelEndpointConfig';
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
              <div style={{ marginBottom: 6 }}>
                <DarkSelect compact value={importType} onChange={(v) => setImportType(v as RegexScriptType)}
                  options={[{ value: 'global', label: '导入为全局' }, { value: 'preset', label: '导入为预设' }]}
                  style={{ width: 160 }} />
              </div>
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
      <div className="settings-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 340, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.15)' }}>
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
  const isMobile = useIsMobile();
  const [section, setSection] = useState<SettingsSection>('general');

  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const toggleSound = useSettingsStore((s) => s.toggleSound);
  const darkMode = useSettingsStore((s) => s.darkMode);
  const toggleDarkMode = useSettingsStore((s) => s.toggleDarkMode);
  const tooltipDelay = useSettingsStore((s) => s.tooltipDelay);
  const setTooltipDelay = useSettingsStore((s) => s.setTooltipDelay);
  const musicVolume = useSettingsStore((s) => s.musicVolume);
  const setMusicVolume = useSettingsStore((s) => s.setMusicVolume);
  const sfxVolume = useSettingsStore((s) => s.sfxVolume);
  const setSfxVolume = useSettingsStore((s) => s.setSfxVolume);
  const autoSubmitChoice = useSettingsStore((s) => s.autoSubmitChoice);
  const uiScale = useSettingsStore((s) => s.uiScale);
  const setUiScale = useSettingsStore((s) => s.setUiScale);
  const setAutoSubmitChoice = useSettingsStore((s) => s.setAutoSubmitChoice);
  const maxSummaryEntries = useSettingsStore((s) => s.maxSummaryEntries);
  const setMaxSummaryEntries = useSettingsStore((s) => s.setMaxSummaryEntries);
  const contextPageDepth = useSettingsStore((s) => s.contextPageDepth);
  const setContextPageDepth = useSettingsStore((s) => s.setContextPageDepth);
  const npcMemoryKeep = useSettingsStore((s) => s.npcMemoryKeep);
  const setNpcMemoryKeep = useSettingsStore((s) => s.setNpcMemoryKeep);
  const jsonRetryCount = useSettingsStore((s) => s.jsonRetryCount);
  const setJsonRetryCount = useSettingsStore((s) => s.setJsonRetryCount);
  const rpmLimit = useSettingsStore((s) => s.rpmLimit);
  const setRpmLimit = useSettingsStore((s) => s.setRpmLimit);
  const perApiRpmEnabled = useSettingsStore((s) => s.perApiRpmEnabled);
  const setPerApiRpmEnabled = useSettingsStore((s) => s.setPerApiRpmEnabled);
  const mvuRpmLimit = useSettingsStore((s) => s.mvuRpmLimit);
  const setMvuRpmLimit = useSettingsStore((s) => s.setMvuRpmLimit);
  const rewriteRpmLimit = useSettingsStore((s) => s.rewriteRpmLimit);
  const setRewriteRpmLimit = useSettingsStore((s) => s.setRewriteRpmLimit);
  const globalCaseSensitive = useSettingsStore((s) => s.globalCaseSensitive);
  const setGlobalCaseSensitive = useSettingsStore((s) => s.setGlobalCaseSensitive);
  const globalMatchWholeWord = useSettingsStore((s) => s.globalMatchWholeWord);
  const setGlobalMatchWholeWord = useSettingsStore((s) => s.setGlobalMatchWholeWord);
  const maxRecursionSteps = useSettingsStore((s) => s.maxRecursionSteps);
  const setMaxRecursionSteps = useSettingsStore((s) => s.setMaxRecursionSteps);
  const includeNames = useSettingsStore((s) => s.includeNames);
  const setIncludeNames = useSettingsStore((s) => s.setIncludeNames);
  const wiBudget = useSettingsStore((s) => s.wiBudget);
  const setWiBudget = useSettingsStore((s) => s.setWiBudget);
  const alertOnOverflow = useSettingsStore((s) => s.alertOnOverflow);
  const setAlertOnOverflow = useSettingsStore((s) => s.setAlertOnOverflow);
  const worldInfoStrategy = useSettingsStore((s) => s.worldInfoStrategy);
  const setWorldInfoStrategy = useSettingsStore((s) => s.setWorldInfoStrategy);
  const dsCache = useSettingsStore((s) => s.dsCache);
  const setDsCache = useSettingsStore((s) => s.setDsCache);
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
  const mvuForceAlways = useSettingsStore((s) => s.mvuForceAlways);
  const setMvuForceAlways = useSettingsStore((s) => s.setMvuForceAlways);
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
  const mvuSelfCorrectEnabled = useSettingsStore((s) => s.mvuSelfCorrectEnabled);
  const setMvuSelfCorrectEnabled = useSettingsStore((s) => s.setMvuSelfCorrectEnabled);
  const mvuSelfCorrectRetries = useSettingsStore((s) => s.mvuSelfCorrectRetries);
  const setMvuSelfCorrectRetries = useSettingsStore((s) => s.setMvuSelfCorrectRetries);

  const [localApiUrl, setLocalApiUrl] = useState(apiBaseUrl);
  const [localApiModel, setLocalApiModel] = useState(apiModel);
  const [localApiKey, setLocalApiKey] = useState(apiKey);
  const [localMvuUrl, setLocalMvuUrl] = useState(mvuApiBaseUrl);
  const [localMvuModel, setLocalMvuModel] = useState(mvuApiModel);
  const [localMvuKey, setLocalMvuKey] = useState(mvuApiKey);

  const rewriteUseIndependentApi = useSettingsStore((s) => s.rewriteUseIndependentApi);
  const setRewriteUseIndependentApi = useSettingsStore((s) => s.setRewriteUseIndependentApi);
  const rewriteLite = useSettingsStore((s) => s.rewriteLite);
  const setRewriteLite = useSettingsStore((s) => s.setRewriteLite);
  const rewriteLiteIncludeMatchedLore = useSettingsStore((s) => s.rewriteLiteIncludeMatchedLore);
  const setRewriteLiteIncludeMatchedLore = useSettingsStore((s) => s.setRewriteLiteIncludeMatchedLore);
  const lastRewriteSaving = usePromptViewerStore((s) => s.lastRewriteSaving);
  const rewriteApiBaseUrl = useSettingsStore((s) => s.rewriteApiBaseUrl);
  const setRewriteApiBaseUrl = useSettingsStore((s) => s.setRewriteApiBaseUrl);
  const rewriteApiModel = useSettingsStore((s) => s.rewriteApiModel);
  const setRewriteApiModel = useSettingsStore((s) => s.setRewriteApiModel);
  const rewriteApiKey = useSettingsStore((s) => s.rewriteApiKey);
  const setRewriteApiKey = useSettingsStore((s) => s.setRewriteApiKey);
  const [localRewriteUrl, setLocalRewriteUrl] = useState(rewriteApiBaseUrl);
  const [localRewriteModel, setLocalRewriteModel] = useState(rewriteApiModel);
  const [localRewriteKey, setLocalRewriteKey] = useState(rewriteApiKey);
  const mvuAvailableModels = useSettingsStore((s) => s.mvuAvailableModels);
  const setMvuAvailableModels = useSettingsStore((s) => s.setMvuAvailableModels);
  const rewriteAvailableModels = useSettingsStore((s) => s.rewriteAvailableModels);
  const setRewriteAvailableModels = useSettingsStore((s) => s.setRewriteAvailableModels);
  const [ppDropdownOpen, setPpDropdownOpen] = useState(false);

  const handleReturnToMenu = () => {
    onClose();
    usePanelStore.getState().closeAll();
    onReturnToMenu();
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
        flexDirection: isMobile ? 'column' : 'row',
        width: isMobile ? '100vw' : 820, maxWidth: isMobile ? '100vw' : '95vw',
        height: isMobile ? '100dvh' : 560, maxHeight: isMobile ? '100dvh' : '90vh',
        background: 'linear-gradient(135deg, var(--leather) 0%, var(--abyss) 100%)',
        border: isMobile ? 'none' : '1px solid var(--gold)',
        borderRadius: isMobile ? 0 : 8,
        boxShadow: '0 0 80px rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}>
        {/* ── Sidebar (桌面竖栏 / 手机顶部横向 Tab) ── */}
        <div style={{
          width: isMobile ? '100%' : 180, flexShrink: 0,
          background: 'rgba(0,0,0,0.25)',
          borderRight: isMobile ? 'none' : '1px solid rgba(196,168,85,0.1)',
          borderBottom: isMobile ? '1px solid rgba(196,168,85,0.12)' : 'none',
          display: 'flex', flexDirection: isMobile ? 'row' : 'column',
          alignItems: isMobile ? 'center' : 'stretch',
          padding: isMobile ? '6px 8px' : '16px 0',
          overflowX: isMobile ? 'auto' : 'visible',
          whiteSpace: isMobile ? 'nowrap' : 'normal',
        }}>
          {!isMobile && (
            <div style={{
              padding: '0 16px 12px', borderBottom: '1px solid rgba(196,168,85,0.12)', marginBottom: 8,
              fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--gold)', letterSpacing: 2,
              textAlign: 'center',
            }}>
              设置
            </div>
          )}

          {SIDEBAR_ITEMS.map((item) => (
            <button key={item.key}
              onClick={() => setSection(item.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 16px', margin: isMobile ? '0 4px' : '2px 8px',
                flexShrink: 0,
                border: 'none', borderRadius: 4,
                background: section === item.key ? 'rgba(196,168,85,0.1)' : 'transparent',
                boxShadow: isMobile && section === item.key ? 'inset 0 -2px 0 var(--gold)' : 'none',
                color: section === item.key ? 'var(--gold)' : 'var(--ink-subtle)',
                fontFamily: 'var(--font-ui)', fontSize: 12, letterSpacing: 1,
                cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap',
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
            padding: '10px 16px', margin: isMobile ? '0 4px' : '8px 8px 0',
            flexShrink: 0,
            border: 'none', borderRadius: 4,
            background: 'transparent', color: 'var(--ink-subtle)',
            fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 1,
            cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; }}
          >
            <span>✕</span>
            <span>关闭</span>
          </button>
        </div>

        {/* ── Content ── */}
        <style>{`.settings-scroll::-webkit-scrollbar{width:5px}.settings-scroll::-webkit-scrollbar-track{background:rgba(0,0,0,0.15);border-radius:3px}.settings-scroll::-webkit-scrollbar-thumb{background:var(--brass);border-radius:3px}.settings-scroll::-webkit-scrollbar-thumb:hover{background:var(--gold)}`}</style>
        <div className="settings-scroll" style={{
          flex: 1, padding: isMobile ? '16px 14px' : '24px 28px', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', minWidth: 0,
          scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.15)',
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
                <CategoryBar label="界面与音效" first />
                {/* Sound toggle */}
                <div style={rowStyle}>
                  <span style={labelStyle}>环境音效</span>
                  <Toggle on={soundEnabled} onChange={toggleSound} />
                </div>

                {/* Dark mode toggle —— 正文页/背包线索/人物名册 切换深墨羊皮纸黑夜配色 */}
                <div style={rowStyle}>
                  <span style={labelStyle}>
                    黑夜模式
                    <HelpIcon text={'将「正文页 / 背包线索 / 人物名册」的羊皮纸日间配色切换为深墨羊皮纸的黑夜配色。\n\n仅影响这三个内容面的视觉基调，其余界面不变。'} />
                  </span>
                  <Toggle on={darkMode} onChange={toggleDarkMode} onLabel="黑夜" offLabel="羊皮纸" />
                </div>

                {/* Music volume */}
                <div style={rowStyle}>
                  <span style={labelStyle}>音乐音量</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="range" min={0} max={100} value={musicVolume}
                      onChange={(e) => setMusicVolume(Number(e.target.value))}
                      style={{ width: 100, accentColor: 'var(--gold)' }}
                    />
                  </div>
                </div>

                {/* SFX volume */}
                <div style={rowStyle}>
                  <span style={labelStyle}>音效音量</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="range" min={0} max={100} value={sfxVolume}
                      onChange={(e) => setSfxVolume(Number(e.target.value))}
                      style={{ width: 100, accentColor: 'var(--gold)' }}
                    />
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--gold)', width: 28 }}>{sfxVolume}%</span>
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
                  <Toggle on={autoSubmitChoice} onChange={() => setAutoSubmitChoice(!autoSubmitChoice)} />
                </div>

                {/* 界面缩放（整体放大，含字体）—— 仅桌面端显示 */}
                {!isMobile && (
                  <div style={rowStyle}>
                    <span style={labelStyle}>界面缩放</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {[
                        { v: 1, name: '标准' },
                        { v: 1.15, name: '大' },
                        { v: 1.3, name: '特大' },
                        { v: 1.5, name: '超大' },
                      ].map(({ v, name }) => {
                        const active = uiScale === v;
                        return (
                          <button
                            key={v}
                            onClick={() => setUiScale(v)}
                            title={`${name} ${Math.round(v * 100)}%`}
                            style={{
                              padding: '5px 10px',
                              borderRadius: 4,
                              border: active ? '1px solid var(--gold)' : '1px solid var(--brass)',
                              background: active ? 'rgba(196,168,85,0.15)' : 'rgba(0,0,0,0.2)',
                              color: active ? 'var(--gold)' : 'var(--ink-subtle)',
                              fontFamily: 'var(--font-ui)',
                              fontSize: 10,
                              letterSpacing: 1,
                              cursor: 'pointer',
                              transition: 'var(--transition-smooth)',
                            }}
                            onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(196,168,85,0.06)'; }}
                            onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; }}
                          >
                            {name}
                            <span style={{ marginLeft: 4, fontFamily: 'var(--font-mono)', fontSize: 9, opacity: 0.8 }}>{Math.round(v * 100)}%</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <CategoryBar label="上下文" />
                {/* Max summary entries */}
                <div style={rowStyle}>
                  <span style={{ ...labelStyle, position: 'relative' }}>
                    上下文总结上限
                    <HelpIcon text={'上下文注意力有限，回顾总结条目过多可能导致LLM注意力分散，\n引发剧情混乱或遗忘近期事件。建议保持在20条以内。\n\n此设置控制每次生成时最多注入多少条「剧情回顾」摘要到LLM上下文中。'} />
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

                <div style={rowStyle}>
                  <span style={labelStyle}>
                    上下文回顾页数
                    <HelpIcon text={'每次向LLM发送请求时，回顾最近N页的故事内容作为上下文。\n\n数值越大，LLM记住的剧情越多，但消耗的token也越多。\n数值过大可能导致超出模型上下文窗口或注意力分散。\n\n默认3页（推荐），输入0则包含全部页面（谨慎使用）。'} />
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="number" min={0} max={50} step={1}
                      value={contextPageDepth}
                      onChange={(e) => setContextPageDepth(Math.max(0, Number(e.target.value) || 0))}
                      style={numInputStyle}
                    />
                    <span style={{ fontSize: 9, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)' }}>{contextPageDepth === 0 ? '全部页面' : `最近${contextPageDepth}页`}</span>
                  </div>
                </div>

                <div style={rowStyle}>
                  <span style={labelStyle}>
                    NPC 记忆保留条数
                    <HelpIcon text={'每个 NPC 的「互动记忆」在被 AI 折叠成「记忆梗概」后，保留的最近原始记忆条数。\n\n数值越小越紧凑、越省 token；越大保留越多近期逐字细节。\n\n更早的记忆会被浓缩进梗概，不会丢失语义。默认 6 条。'} />
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="range" min={3} max={12} step={1} value={npcMemoryKeep}
                      onChange={(e) => setNpcMemoryKeep(Number(e.target.value))}
                      style={{ width: 100, accentColor: 'var(--gold)' }}
                    />
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--gold)', width: 28 }}>{npcMemoryKeep}</span>
                  </div>
                </div>

                <CategoryBar label="生成与稳定性" />
                <div style={rowStyle}>
                  <span style={labelStyle}>
                    解析失败重试次数
                    <HelpIcon text={'当AI回复不是合法JSON（如返回纯叙事）时，自动追加「只输出JSON」的纠正提示并重试。同样作用于行动补写。\n\n每次重试都是一次额外的API请求。重试仍失败则放弃本回合、不生成书页/补写，原因记入调试日志。\n\n0 = 不重试，最大 5 次。'} />
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="number" min={0} max={5} step={1}
                      value={jsonRetryCount}
                      onChange={(e) => setJsonRetryCount(Number(e.target.value) || 0)}
                      style={numInputStyle}
                    />
                    <span style={{ fontSize: 9, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)' }}>{jsonRetryCount === 0 ? '不重试' : `重试${jsonRetryCount}次`}</span>
                  </div>
                </div>

                <div style={rowStyle}>
                  <span style={labelStyle}>
                    每个 API 独立 RPM
                    <HelpIcon text={'关闭：主API、补写、独立mvuAPI 等所有调用共用一个全局 RPM 上限。\n\n打开：主API / MVU / 行动补写 各自设置 RPM，并各自独立计算每分钟窗口。\n\n注意：若 MVU/补写未启用独立API（实际仍打到主endpoint），开启后三者配额各自计算，同一endpoint的实际请求量可能为三者之和，需自行确保不超服务商真实限制。'} />
                  </span>
                  <Toggle on={perApiRpmEnabled} onChange={() => setPerApiRpmEnabled(!perApiRpmEnabled)} onLabel="独立" offLabel="全局" />
                </div>

                {!perApiRpmEnabled && (
                  <RpmRow
                    label="全局 RPM 上限"
                    help={'每分钟最多向LLM发起的请求数（全局共享，主API、补写、独立mvuAPI等所有调用都计入）。\n\n达到上限时新请求会排队等待，直到一分钟窗口腾出名额，避免触发服务商限流。\n\n0 = 不限制，最大 10。'}
                    value={rpmLimit}
                    onChange={setRpmLimit}
                  />
                )}

                {perApiRpmEnabled && (
                  <>
                    <RpmRow
                      label="主 API RPM"
                      help={'主对话生成（序章、整页生成等）每分钟最多请求数。\n\n0 = 不限制，最大 10。'}
                      value={rpmLimit}
                      onChange={setRpmLimit}
                    />
                    <RpmRow
                      label="MVU RPM"
                      help={'独立 MVU 变量提取 API 每分钟最多请求数（仅当 MVU 启用独立API时单独计窗）。\n\n0 = 不限制，最大 10。'}
                      value={mvuRpmLimit}
                      onChange={setMvuRpmLimit}
                    />
                    <RpmRow
                      label="补写 RPM"
                      help={'行动补写 API 每分钟最多请求数（含解析失败重试的额外请求）。\n\n0 = 不限制，最大 10。'}
                      value={rewriteRpmLimit}
                      onChange={setRewriteRpmLimit}
                    />
                  </>
                )}

                <CategoryBar label="世界书匹配" />
                <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-light)', fontFamily: 'var(--font-ui)' }}>
                    <input type="checkbox" checked={globalCaseSensitive} onChange={(e) => setGlobalCaseSensitive(e.target.checked)} style={{ accentColor: 'var(--gold)' }} />
                    世界书全局区分大小写
                    <HelpIcon text={'全局开关：世界书关键词匹配时是否区分大小写。\n开启后「Arkham」与「arkham」视为不同关键词；关闭则忽略大小写。\n会覆盖各条目自身的大小写设置。'} />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-light)', fontFamily: 'var(--font-ui)' }}>
                    <input type="checkbox" checked={globalMatchWholeWord} onChange={(e) => setGlobalMatchWholeWord(e.target.checked)} style={{ accentColor: 'var(--gold)' }} />
                    世界书全局完整单词匹配
                    <HelpIcon text={'全局开关：关键词是否必须作为「完整单词」才算命中。\n开启后关键词「cat」不会命中「category」里的片段。\n主要影响英文；中文没有单词边界，一般无影响。'} />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-light)', fontFamily: 'var(--font-ui)' }}>
                    <input type="checkbox" checked={includeNames} onChange={(e) => setIncludeNames(e.target.checked)} style={{ accentColor: 'var(--gold)' }} />
                    包含角色名称
                    <HelpIcon text={'组装提示词时，是否在每条消息前标注发言者名称（如 User: / Char:）。\n部分模型或预设需要它来区分角色，部分则不需要。\n如果AI回复里莫名出现名字前缀，可尝试关闭。'} />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-light)', fontFamily: 'var(--font-ui)' }}>
                    <input type="checkbox" checked={alertOnOverflow} onChange={(e) => setAlertOnOverflow(e.target.checked)} style={{ accentColor: 'var(--gold)' }} />
                    溢出警告
                    <HelpIcon text={'当注入的世界书内容超出下方「Token预算」、有条目被裁掉时，弹出提醒。\n方便你察觉部分世界书没能进入上下文。'} />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)' }}>递归步数</span>
                    <HelpIcon text={'世界书条目被激活后，其内容里的关键词可以继续触发别的条目（递归扫描）。\n此值限制递归的层数。\n0 = 不限制（可能连锁激活大量条目、撑大上下文）。'} />
                    <input type="number" min={0} max={20} value={maxRecursionSteps} onChange={(e) => setMaxRecursionSteps(Number(e.target.value) || 0)}
                      style={numInputStyle} />
                    <span style={{ fontSize: 8, color: 'var(--ink-faded)' }}>0=无限</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)' }}>Token预算</span>
                    <HelpIcon text={'单次注入世界书内容的 Token 上限。\n超出预算时，优先级低的条目会被裁掉、不进入上下文。\n0 = 不限制（注入所有匹配到的条目）。'} />
                    <input type="number" min={0} max={99999} step={100} value={wiBudget} onChange={(e) => setWiBudget(Number(e.target.value) || 0)}
                      style={numInputStyle} />
                    <span style={{ fontSize: 8, color: 'var(--ink-faded)' }}>0=无限</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 10, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)' }}>插入策略</span>
                    <HelpIcon text={'多个匹配到的世界书条目注入提示词时的排布方式：\n均匀 — 按顺序均匀分布在上下文中\n全局优先 — 全局世界书排在更靠前的位置\n会话优先 — 当前会话绑定的世界书排在更靠前的位置'} />
                    <DarkSelect compact value={worldInfoStrategy} onChange={(v) => setWorldInfoStrategy(v as 'evenly' | 'global-first' | 'chat-first')}
                      options={[{ value: 'evenly', label: '均匀' }, { value: 'global-first', label: '全局优先' }, { value: 'chat-first', label: '会话优先' }]}
                      style={{ width: 110 }} />
                  </div>
                </div>

                {/* DeepSeek V4 缓存优化：思维模式指令注入（附着到末条用户消息尾部，不动前缀缓存） */}
                <CategoryBar label="DeepSeek V4 缓存优化（思维模式）" />
                <div style={rowStyle}>
                  <span style={labelStyle}>
                    启用
                    <HelpIcon text={'把所选「思维模式指令」附着到发给模型的【最后一条用户消息尾部】(高注意力区)，概率性增强 DeepSeek V4 在 <think> 思考内的风格。\n指令不进 system / 世界书前缀，也不写入正文与历史——因此不破坏 DeepSeek 前缀缓存。\n仅对支持思维链的模型(DeepSeek V4 等)有效，其他模型会忽略；默认模式不注入。'} />
                  </span>
                  <Toggle on={dsCache.enabled} onChange={() => setDsCache({ enabled: !dsCache.enabled })} />
                </div>
                {dsCache.enabled && (
                  <>
                    <div style={rowStyle}>
                      <span style={labelStyle}>
                        思维模式
                        <HelpIcon text={'默认=不注入。\n角色沉浸：思考中以括号包裹角色第一人称内心独白。\n纯分析：思考只做逻辑分析、禁内心独白。\n格式加强：尾部复述「遵从既定格式(含省略规则、不新增字段)」。\n自定义：用你自己的指令。'} />
                      </span>
                      <DarkSelect compact value={dsCache.mode} onChange={(v) => setDsCache({ mode: v as DsThinkingMode })}
                        options={[
                          { value: 'default', label: '不注入（默认）' },
                          { value: 'immersive', label: '角色沉浸' },
                          { value: 'analysis', label: '纯分析' },
                          { value: 'format_enforce', label: '格式加强' },
                          { value: 'custom', label: '自定义' },
                        ]} style={{ width: 150 }} />
                    </div>
                    {dsCache.mode === 'custom' && (
                      <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                        <span style={labelStyle}>自定义指令</span>
                        <textarea rows={3} value={dsCache.customText} onChange={(e) => setDsCache({ customText: e.target.value })}
                          placeholder="自填思维模式指令，将附着到最后一条用户消息尾部（此处不解析 {{宏}}）"
                          style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(196,168,85,0.2)', borderRadius: 4, color: 'inherit', padding: 6, resize: 'vertical', transition: 'var(--transition-smooth)' }} />
                      </div>
                    )}
                  </>
                )}

                {/* DeepSeek 消息三区重组（核心前缀缓存优化，移植自 deepseek-cache-optimizer 插件） */}
                <CategoryBar label="DeepSeek 消息重组（前缀缓存）" />
                <div style={rowStyle}>
                  <span style={labelStyle}>
                    启用消息重组
                    <HelpIcon text={'把发给 API 的 messages 重组成三个区域以最大化 DeepSeek 前缀缓存命中：\n顶部(缓存区) — 所有 system 设定 + 首条 user 合并成一条 user，字节稳定 → 命中缓存\n中间(对话区) — 聊天历史保持原样\n底部(高注意力区) — 内联 system / 绿灯 lore / 作者注塞到最后 user 之前(等效 D1)\n\n本游戏每回合 stateless 重构 prompt(无聊天历史)，重组后通常发送【一条 user 消息】，能让 DeepSeek 前缀缓存命中率从极低跃升到 80%+。\n默认关闭——需自行确认中转站走的是 DeepSeek 通道再开启。'} />
                  </span>
                  <Toggle on={dsCache.restructure === true} onChange={() => setDsCache({ restructure: !(dsCache.restructure === true) })} />
                </div>
                {dsCache.restructure === true && (
                  <>
                    <div style={rowStyle}>
                      <span style={labelStyle}>
                        生效的 API 来源
                        <HelpIcon text={'逗号分隔。当前模型 ID 经启发式推断后命中其中一个才会启用重组：\n• deepseek — modelId 含 deepseek / ds / volc / ep- 等\n• custom — 中转站统一归类（兜底）\n• openai / openrouter — 自填\n填空 / 不命中 → 不重组（零副作用）'} />
                      </span>
                      <input type="text" value={dsCache.targetSources ?? 'deepseek,custom'}
                        onChange={(e) => setDsCache({ targetSources: e.target.value })}
                        placeholder="deepseek,custom"
                        style={{ flex: 1, maxWidth: 220, fontFamily: 'var(--font-mono)', fontSize: 12, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(196,168,85,0.2)', borderRadius: 4, color: 'inherit', padding: '4px 6px', transition: 'var(--transition-smooth)' }} />
                    </div>
                    <div style={rowStyle}>
                      <span style={labelStyle}>
                        添加角色标签
                        <HelpIcon text={'合并 system / user / assistant 时给每组加 <role==X>...</role==X> 标签包裹，避免模型混淆原始角色。\n推荐开启——原插件默认 true。'} />
                      </span>
                      <Toggle on={dsCache.roleTags !== false} onChange={() => setDsCache({ roleTags: !(dsCache.roleTags !== false) })} />
                    </div>
                    <div style={rowStyle}>
                      <span style={labelStyle}>
                        保留尾部 assistant
                        <HelpIcon text={'若 messages 数组末尾(最后 user 之后)有 assistant 消息(伪思维链 prefill)，保留为独立 message，不并入 user。\n本项目通常没有这种结构(每回合 history=[])，对一般场景无影响。'} />
                      </span>
                      <Toggle on={dsCache.keepTailAssistant !== false} onChange={() => setDsCache({ keepTailAssistant: !(dsCache.keepTailAssistant !== false) })} />
                    </div>
                    <div style={rowStyle}>
                      <span style={labelStyle}>
                        自定义预填
                        <HelpIcon text={'重组后在末尾追加一条 assistant 消息，引导模型以特定格式开始输出(如 "{")。\n慎用 —— 与本项目 FORMAT_INSTRUCTION 的 JSON 输出规范可能冲突。'} />
                      </span>
                      <Toggle on={dsCache.customPrefillEnabled === true} onChange={() => setDsCache({ customPrefillEnabled: !(dsCache.customPrefillEnabled === true) })} />
                    </div>
                    {dsCache.customPrefillEnabled === true && (
                      <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                        <span style={labelStyle}>预填内容</span>
                        <textarea rows={2} value={dsCache.customPrefillContent ?? ''}
                          onChange={(e) => setDsCache({ customPrefillContent: e.target.value })}
                          placeholder='例如：{'
                          style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 12, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(196,168,85,0.2)', borderRadius: 4, color: 'inherit', padding: 6, resize: 'vertical', transition: 'var(--transition-smooth)' }} />
                      </div>
                    )}
                    <div style={rowStyle}>
                      <span style={labelStyle}>
                        世界书蓝绿灯分离
                        <HelpIcon text={'实验性：把【非常驻】世界书条目(绿灯)从顶部缓存区移到底部高注意力区(最后 user 之前)，让蓝灯(常驻)条目独享缓存。\n本项目世界书匹配每回合都变(matchedKeyword/anchor/keyword/statSnapshot 等动态桶) → 启用后能让前缀更稳定。\n默认关 —— 与原插件保守一致。'} />
                      </span>
                      <Toggle on={dsCache.separateWiLights === true} onChange={() => setDsCache({ separateWiLights: !(dsCache.separateWiLights === true) })} />
                    </div>
                    <div style={rowStyle}>
                      <span style={labelStyle}>
                        自动检测动态常驻
                        <HelpIcon text={'扫描内置&用户世界书的【常驻(蓝灯)】条目，含 EJS `<%`/`{{getvar}}`/`{{xxx.yyy}}` 等动态宏的自动下沉到动态尾段。\n这是修复"99.3%→48.8%"命中率衰减的关键——coc_lore 内置条目(ejs_hp_state/mvu_var_list 等)虽然 constant=true 但渲染结果随 statData 变。\n默认开。关掉等价旧版行为。'} />
                      </span>
                      <Toggle on={dsCache.autoDetectDynamicConstant !== false} onChange={() => setDsCache({ autoDetectDynamicConstant: !(dsCache.autoDetectDynamicConstant !== false) })} />
                    </div>
                    <div style={rowStyle}>
                      <span style={labelStyle}>
                        常驻条目视为动态
                        <HelpIcon text={'激进选项：把【全部常驻(蓝灯)】世界书条目无差别下沉到动态尾段(不再按 EJS/宏内容自动判定)。\n仅在"自动检测动态常驻"不够用时开。会让静态前缀进一步缩短，但保前缀绝对干净。\n默认关。'} />
                      </span>
                      <Toggle on={dsCache.treatConstantAsDynamic === true} onChange={() => setDsCache({ treatConstantAsDynamic: !(dsCache.treatConstantAsDynamic === true) })} />
                    </div>
                    <div style={rowStyle}>
                      <span style={labelStyle}>
                        调试日志
                        <HelpIcon text={'在浏览器控制台(F12)打印重组前/后的 messages 结构（含 role + 内容首 80 字）。仅排查时开。'} />
                      </span>
                      <Toggle on={dsCache.debugLog === true} onChange={() => setDsCache({ debugLog: !(dsCache.debugLog === true) })} />
                    </div>

                    {/* 实验性 ULTRA 缓存优化：默认全关，进一步压榨命中率（副作用见 HelpIcon） */}
                    <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(196,168,85,0.06)', border: '1px solid rgba(196,168,85,0.2)', borderRadius: 4, transition: 'var(--transition-smooth)' }}>
                      <div style={{ fontSize: 11, color: 'var(--brass)', marginBottom: 6, letterSpacing: 1 }}>
                        实验性 ULTRA 缓存（默认关，自选启用）
                      </div>
                      <div style={rowStyle}>
                        <span style={labelStyle}>
                          statSnapshot 减肥
                          <HelpIcon text={'把发给 LLM 的 statData YAML 过滤为【高频变化字段】：保留 HP/SAN/MP/姿态/状态/战斗/时间/天气/地点/暗线进度/阶段；丢弃 /剧情/已解锁/、/剧情/线索/、/剧情/关键事件/、/剧情/当前章节 等长但低频字段。\n收益：dynamicTail 段缩短 ~500-1500 tokens/回合，整体命中率提升。\n副作用：LLM 看不到"已解锁"等状态字面值，需通过叙事推断——一般不影响输出质量，但可能让 LLM 偶尔重复解锁过的场景细节。'} />
                        </span>
                        <Toggle on={dsCache.experimentalLeanSnapshot === true} onChange={() => setDsCache({ experimentalLeanSnapshot: !(dsCache.experimentalLeanSnapshot === true) })} />
                      </div>
                      <div style={rowStyle}>
                        <span style={labelStyle}>
                          跳过 mvu_var_list
                          <HelpIcon text={'内置 coc_lore.mvu_var_list 条目用 {{调查员.生命值.当前}} 等列出全量变量，与 statSnapshot 内容几乎完全重复。开启后从匹配里过滤掉，省 ~400-800 tokens/回合。\n副作用：基本无——LLM 仍能从 statSnapshot 看到完整状态，mvu_var_list 本就是冗余的回退方案。'} />
                        </span>
                        <Toggle on={dsCache.experimentalSkipMvuVarList === true} onChange={() => setDsCache({ experimentalSkipMvuVarList: !(dsCache.experimentalSkipMvuVarList === true) })} />
                      </div>
                      <div style={rowStyle}>
                        <span style={labelStyle}>
                          前缀漂移诊断
                          <HelpIcon text={'借鉴 claude-code-best 的 PROMPT_CACHE_BREAK_DETECTION：跨回合保存"理论应每回合相等"的静态前缀(systemPrompt+wbBefore+processedFormat+wbAfter)，本回合发送前对比，漂移时在日志面板打 warn：\n• 第一处差异字节位置\n• 前后 80 字符上下文(上回合 vs 本回合)\n• 启发式定位是哪段污染(systemPrompt / wbBefore / processedFormat / wbAfter)\n这能让你自助定位"为何命中率不达预期"——找到那段漂移源后改预设/世界书把它静态化。\n副作用：纯诊断，不改 prompt，对生成质量无影响。'} />
                        </span>
                        <Toggle on={dsCache.experimentalPrefixDiagnostics === true} onChange={() => setDsCache({ experimentalPrefixDiagnostics: !(dsCache.experimentalPrefixDiagnostics === true) })} />
                      </div>
                    </div>
                  </>
                )}

                {/* API section */}
                <div style={{ marginTop: 4 }}>
                  <CategoryBar label="主 API 配置" />

                  <ModelEndpointConfig
                    apiKey={localApiKey}
                    setApiKey={(v) => { setLocalApiKey(v); setApiKey(v); }}
                    url={localApiUrl}
                    setUrl={(v) => { setLocalApiUrl(v); setApiBaseUrl(v); }}
                    model={localApiModel}
                    setModel={(v) => { setLocalApiModel(v); setApiModel(v); }}
                    availableModels={availableModels}
                    setAvailableModels={setAvailableModels}
                  />
                </div>

                {/* Prompt Post-Processing */}
                <div style={rowStyle}>
                  <span style={labelStyle}>
                    提示词后处理
                    <HelpIcon text={`None — 不进行显式处理，除非 API 严格要求
合并相同角色连续的发言
半严格 — 合并角色并只允许一条可选系统消息
严格 — 合并角色、只允许一条可选系统消息、要求用户消息在最前
单一用户消息 — 将所有角色的所有消息合并为一条用户消息`} />
                  </span>
                  <div style={{ position: 'relative', width: 240, maxWidth: '100%' }}>
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
                <div style={{ marginTop: 4 }}>
                  <CategoryBar label="MVU 变量引擎 API" />

                  {/* Toggle independent/global */}
                  <div style={rowStyle}>
                    <span style={labelStyle}>独立通道</span>
                    <Toggle on={mvuUseIndependentApi} onChange={() => setMvuUseIndependentApi(!mvuUseIndependentApi)} onLabel="独立" offLabel="跟随全局" />
                  </div>

                  {/* 始终调用 LLM 提取（关闭则仅在叙事暗示数值变化且无显式标签时才调用，省 token） */}
                  <div style={rowStyle}>
                    <span style={labelStyle}>
                      始终用 LLM 提取
                      <HelpIcon text={'关闭（智能）：仅当回复有「叙事暗示的数值变化」（如「感到眩晕」暗示SAN降）且缺少显式 <var>/{{set:}} 标签时才调用 LLM 提取——纯标签回复由本地正则处理，省下一次 API 调用。\n\n打开（始终）：每回合都调用 LLM 提取，最大化提取保真度（更费 token）。\n\n注意：本开关仅在「独立通道」开启且已配置 API Key 时生效。'} />
                    </span>
                    <Toggle on={mvuForceAlways} onChange={() => setMvuForceAlways(!mvuForceAlways)} onLabel="始终" offLabel="智能" />
                  </div>

                  {/* 失败回灌自纠：变量更新未通过校验(类型/范围/枚举)时，回灌给 AI 让其修正。
                      默认关闭——开启会增加 LLM 调用；走 MVU 桶且受重试预算硬上限约束，绝不超 RPM。 */}
                  <div style={rowStyle}>
                    <span style={labelStyle}>
                      变量更新自纠
                      <HelpIcon text={'关闭（默认）：变量更新若未通过校验（如 HP 跌破 0、天气填了非法值）则丢弃该条并记入调试日志，回合照常推进（零额外 LLM 调用）。\n\n打开：把未通过的更新回灌给 AI，要求其只重输出修正后的合法值。每次修正额外发起一次「MVU 通道」请求——严格走 MVU 的 RPM 桶并受下方重试预算硬上限约束（达上限即排队，绝不超出每分钟限制），失败数不再下降时提前停止。'} />
                    </span>
                    <Toggle on={mvuSelfCorrectEnabled} onChange={() => setMvuSelfCorrectEnabled(!mvuSelfCorrectEnabled)} onLabel="开启" offLabel="关闭" />
                  </div>
                  {mvuSelfCorrectEnabled && (
                    <div style={{ ...rowStyle, paddingLeft: 16 }}>
                      <span style={labelStyle}>
                        ↳ 自纠重试预算
                        <HelpIcon text={'每回合最多向 AI 请求修正变量更新的次数（0–3，默认 1）。这是 RPM 死线的硬上限——无论失败多少项，本回合自纠请求数都不超过此值，且每次都走 MVU 桶排队限流。设为 0 等价于关闭自纠。'} />
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <input type="range" min={0} max={3} step={1} value={mvuSelfCorrectRetries}
                          onChange={(e) => setMvuSelfCorrectRetries(Number(e.target.value))}
                          style={{ width: 100, accentColor: 'var(--gold)' }}
                        />
                        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--gold)', width: 16 }}>{mvuSelfCorrectRetries}</span>
                      </div>
                    </div>
                  )}

                  {mvuUseIndependentApi && (
                    <>
                      <ModelEndpointConfig
                        apiKey={localMvuKey}
                        setApiKey={(v) => { setLocalMvuKey(v); setMvuApiKey(v); }}
                        url={localMvuUrl}
                        setUrl={(v) => { setLocalMvuUrl(v); setMvuApiBaseUrl(v); }}
                        model={localMvuModel}
                        setModel={(v) => { setLocalMvuModel(v); setMvuApiModel(v); }}
                        availableModels={mvuAvailableModels}
                        setAvailableModels={setMvuAvailableModels}
                      />

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

                {/* 行动补写 API */}
                <div style={{ marginTop: 4 }}>
                  <CategoryBar label="行动补写 API" />
                  <div style={rowStyle}>
                    <span style={labelStyle}>独立通道</span>
                    <Toggle on={rewriteUseIndependentApi} onChange={() => setRewriteUseIndependentApi(!rewriteUseIndependentApi)} onLabel="独立" offLabel="跟随全局" />
                  </div>

                  {/* 轻量补写模式：补写仅需当前场景+角色卡+常驻设定即可产 4 选项,无需重发全量世界书/摘要/暗线,省 token */}
                  <div style={rowStyle}>
                    <span style={labelStyle}>
                      轻量补写模式
                      <HelpIcon text={'关闭（完整,默认）：行动补写复用主叙事的完整上下文(系统提示+全量匹配世界书+角色卡+页面+摘要+暗线+注入)生成 4 个候选选项。\n\n打开（轻量）：补写仅发送 当前场景(当前页) + 角色卡(技能/HP/SAN) + 常驻设定(constant 世界书) + 补写指令,跳过摘要/暗线/注入/关键词匹配世界书。大幅省 token,但选项可能略降对「仅靠匹配世界书才知道的设定」的感知。\n\n建议先用 5-10 个真实回合 A/B 验证选项质量不降后再常开。'} />
                    </span>
                    <Toggle on={rewriteLite} onChange={() => setRewriteLite(!rewriteLite)} onLabel="轻量" offLabel="完整" />
                  </div>
                  {rewriteLite && (
                    <>
                      {/* 轻量模式子开关：保留关键词匹配世界书(中间档,牺牲部分节省换取设定感知) */}
                      <div style={{ ...rowStyle, paddingLeft: 16 }}>
                        <span style={labelStyle}>
                          ↳ 保留匹配世界书
                          <HelpIcon text={'轻量补写默认连「关键词匹配世界书」也跳过(最大节省)。\n\n打开此项：保留匹配世界书,仅跳过摘要/暗线/注入——当补写选项需要引用「只有匹配世界书才知道的设定」时使用,在「最大节省」与「设定感知」之间取中间档。'} />
                        </span>
                        <Toggle on={rewriteLiteIncludeMatchedLore} onChange={() => setRewriteLiteIncludeMatchedLore(!rewriteLiteIncludeMatchedLore)} onLabel="保留" offLabel="跳过" />
                      </div>
                      {/* 上次轻量补写节省的 token 量(运行时统计,执行补写后更新) */}
                      <div style={{ ...rowStyle, paddingLeft: 16 }}>
                        <span style={{ ...labelStyle, opacity: 0.75 }}>上次节省</span>
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--gold)' }}>
                          {lastRewriteSaving > 0 ? `~${lastRewriteSaving} tokens` : '— (尚未补写)'}
                        </span>
                      </div>
                    </>
                  )}
                  {rewriteUseIndependentApi && (
                    <ModelEndpointConfig
                      apiKey={localRewriteKey}
                      setApiKey={(v) => { setLocalRewriteKey(v); setRewriteApiKey(v); }}
                      url={localRewriteUrl}
                      setUrl={(v) => { setLocalRewriteUrl(v); setRewriteApiBaseUrl(v); }}
                      model={localRewriteModel}
                      setModel={(v) => { setLocalRewriteModel(v); setRewriteApiModel(v); }}
                      availableModels={rewriteAvailableModels}
                      setAvailableModels={setRewriteAvailableModels}
                    />
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

/** 设置分类分割栏：金色小标题 + 两侧渐隐分割线。 */
function CategoryBar({ label, first }: { label: string; first?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: first ? '2px 0 10px' : '20px 0 10px' }}>
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 3, color: 'var(--gold)',
        fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap', flexShrink: 0,
      }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(196,168,85,0.35), rgba(196,168,85,0.04))' }} />
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 11, color: 'var(--text-light)', fontFamily: 'var(--font-ui)', letterSpacing: 1,
};

/** 统一的数字输入框样式。 */
const numInputStyle: React.CSSProperties = {
  width: 64, padding: '4px 8px', border: '1px solid var(--brass)', borderRadius: 3,
  background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-mono)',
  fontSize: 11, textAlign: 'center', outline: 'none',
};

/** 统一的开关按钮（药丸形，开启时金色高亮）。 */
function Toggle({ on, onChange, onLabel = 'ON', offLabel = 'OFF' }: {
  on: boolean; onChange: () => void; onLabel?: string; offLabel?: string;
}) {
  return (
    <button
      onClick={onChange}
      style={{
        padding: '5px 16px', borderRadius: 20, minWidth: 80, textAlign: 'center',
        border: on ? '1px solid var(--gold)' : '1px solid var(--ink-faded)',
        background: on ? 'rgba(196,168,85,0.18)' : 'rgba(0,0,0,0.18)',
        color: on ? 'var(--gold)' : 'var(--ink-subtle)',
        fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 2, cursor: 'pointer',
        transition: 'var(--transition-smooth)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = on ? 'var(--gold)' : 'var(--ink-faded)'; e.currentTarget.style.color = on ? 'var(--gold)' : 'var(--ink-subtle)'; }}
    >
      {on ? onLabel : offLabel}
    </button>
  );
}

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

/** 悬浮（hover）显示说明的问号图标。提示窗用 portal 渲染到 body、fixed 定位，
 *  脱离面板溢出裁剪、可超出窗口、不会撑出滚动条。 */
function HelpIcon({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean }>({ x: 0, y: 0, below: true });
  const ref = useRef<HTMLSpanElement>(null);

  const onEnter = () => {
    const el = ref.current;
    if (el) {
      // s=界面缩放：tooltip portal 到 body(在 zoom 内)，fixed 坐标需除以 s 换回布局空间，否则被二次缩放错位。
      const s = getUiScale();
      const r = el.getBoundingClientRect();
      const W = 300 * s;
      let x = r.left;
      if (x + W > window.innerWidth - 8) x = window.innerWidth - W - 8;
      x = Math.max(8, x);
      const below = r.bottom < window.innerHeight * 0.55;
      const yRaw = below ? r.bottom + 6 : r.top - 6;
      setPos({ x: x / s, y: yRaw / s, below });
    }
    setShow(true);
  };

  return (
    <span
      ref={ref}
      style={{ display: 'inline-flex', verticalAlign: 'middle' }}
      onMouseEnter={onEnter}
      onMouseLeave={() => setShow(false)}
      onClick={(e) => e.preventDefault()}
    >
      <span style={helpIconStyle}>?</span>
      {show && createPortal(
        <div style={{
          position: 'fixed', left: pos.x, top: pos.y, zIndex: 2000,
          ...(pos.below ? {} : { transform: 'translateY(-100%)' }),
          width: 300, maxWidth: 'calc(100vw - 16px)', padding: '8px 10px',
          background: 'var(--leather)', border: '1px solid var(--gold)', borderRadius: 4,
          boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
          fontSize: 10, color: 'var(--text-light)', lineHeight: 1.8,
          fontFamily: 'var(--font-ui)', whiteSpace: 'pre-line', pointerEvents: 'none',
        }}>
          {text}
        </div>,
        document.body,
      )}
    </span>
  );
}

/** RPM 数字输入行（label + 帮助 + 0–10 number input + 「N 次/分」后缀）。去重 4 处近乎相同的 RPM 设置行。 */
function RpmRow({ label, help, value, onChange }: {
  label: string;
  help: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>
        {label}
        <HelpIcon text={help} />
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="number" min={0} max={10} step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          style={numInputStyle}
        />
        <span style={{ fontSize: 9, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)' }}>{value === 0 ? '不限制' : `${value} 次/分`}</span>
      </div>
    </div>
  );
}

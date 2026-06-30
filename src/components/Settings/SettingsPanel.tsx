import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettingsStore, TEXT_RATIO_MIN, TEXT_RATIO_MAX } from '../../stores/useSettingsStore';
import { useChatStore } from '../../stores/useChatStore';
import { useStatusToastStore } from '../../stores/useStatusToastStore';
import { usePanelStore } from '../../stores/usePanelStore';
import { useRegexStore, BUILTIN_REGEX_IDS } from '../../stores/useRegexStore';
import { DarkSelect } from '../Shared/DarkSelect';
import { type DsThinkingMode } from '../../sillytavern/deepseek-cache';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useViewportHeight } from '../../hooks/useViewportHeight';
import { getAutoZoom } from '../../hooks/useResponsiveZoom';
import { computeMobilePanelHeight } from './settings-scroll-mobile';
import { IconSparkle, IconGear, IconRegex, IconExtension, IconFlask, IconQuill, IconClose } from '../Layout/TabIcons';
import { ApiManagementTab } from './ApiManagementTab';
import { TavernHelperContent } from './TavernHelperContent';
import { PromptTemplateContent } from './PromptTemplateContent';
import { CheatingContent } from './CheatingContent';
import {
  rowStyle, labelStyle, numInputStyle,
  CategoryBar, Toggle, HelpIcon, SliderRow,
} from './_shared';
import type { RegexScript, RegexScriptType, RegexPlacement } from '../../types';

// ── Section type ──
type SettingsSection = 'general' | 'apiManagement' | 'regex' | 'extensions' | 'tavernHelper' | 'promptTemplate' | 'cheating';

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
              cursor: 'pointer', fontSize: 'calc(12px * var(--system-ratio, 1))', fontWeight: activeTab === tab.type ? 'bold' : 'normal',
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
            border: '1px solid rgba(196,168,85,0.2)', fontSize: 'calc(11px * var(--system-ratio, 1))',
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
                  fontSize: 'calc(10px * var(--system-ratio, 1))', background: 'rgba(0,0,0,0.3)', color: 'var(--parchment)',
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'calc(10px * var(--system-ratio, 1))', color: 'var(--ink-subtle)', marginBottom: 4, paddingLeft: 2 }}>
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
                fontSize: 'calc(11px * var(--system-ratio, 1))',
              }}>
              <input type="checkbox" checked={selected.has(script.id)} onChange={() => toggleSelect(script.id)}
                style={{ transform: 'scale(0.9)' }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'calc(11px * var(--system-ratio, 1))', color: 'var(--text-light)' }}>
                  {script.scriptName}
                  {script.disabled && <span style={{ color: 'var(--blood)', marginLeft: 6, fontSize: 'calc(9px * var(--system-ratio, 1))' }}>已禁用</span>}
                </div>
                <div style={{
                  fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--ink-subtle)', overflow: 'hidden',
                  textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)',
                }}>
                  {script.findRegex.substring(0, 50)}
                  {script.replaceString && <span style={{ marginLeft: 4 }}>→ {script.replaceString.substring(0, 25)}</span>}
                </div>
                <div style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--ink-faded)', marginTop: 1 }}>
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
          <div style={{ textAlign: 'center', padding: 28, color: 'var(--ink-subtle)', fontSize: 'calc(11px * var(--system-ratio, 1))' }}>
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
      <p style={{ fontSize: 'calc(11px * var(--system-ratio, 1))', color: 'var(--ink-subtle)', marginBottom: 14 }}>
        管理已安装的扩展脚本，启用或禁用功能模块。
      </p>
      <button onClick={() => { usePanelStore.getState().open('extManager'); }} style={{
        width: '100%', padding: '10px 0', border: '1px solid var(--brass)',
        borderRadius: 3, background: 'rgba(0,0,0,0.2)', color: 'var(--text-light)',
        fontFamily: 'var(--font-ui)', fontSize: 'calc(12px * var(--system-ratio, 1))', letterSpacing: 3, cursor: 'pointer',
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
  icon: ReactNode;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { key: 'general', label: '基本设置', icon: <IconGear size={14} /> },
  { key: 'apiManagement', label: 'API 管理', icon: <IconExtension size={14} /> },
  { key: 'regex', label: '正则脚本', icon: <IconRegex size={14} /> },
  { key: 'extensions', label: '扩展管理', icon: <IconExtension size={14} /> },
  { key: 'tavernHelper', label: '酒馆助手', icon: <IconFlask size={14} /> },
  { key: 'promptTemplate', label: '提示词模板', icon: <IconQuill size={14} /> },
  { key: 'cheating', label: '领受赐福', icon: <IconSparkle size={14} /> },
];

// ── Main Settings Panel ──

export function SettingsPanel({ visible, onClose, onReturnToMenu }: Props) {
  const isMobile = useIsMobile();
  const vvHeight = useViewportHeight();
  const mobilePanelHeight = isMobile ? computeMobilePanelHeight(vvHeight, getAutoZoom()) : undefined;
  const [section, setSection] = useState<SettingsSection>('general');
  const cheatingUnlocked = useSettingsStore((s) => s.cheatingUnlocked);

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
  const textRatio = useSettingsStore((s) => s.textRatio);
  const setTextRatio = useSettingsStore((s) => s.setTextRatio);
  const systemRatio = useSettingsStore((s) => s.systemRatio);
  const setSystemRatio = useSettingsStore((s) => s.setSystemRatio);
  const bookZoom = useSettingsStore((s) => s.bookZoom);
  const setBookZoom = useSettingsStore((s) => s.setBookZoom);
  const setAutoSubmitChoice = useSettingsStore((s) => s.setAutoSubmitChoice);
  const maxSummaryEntries = useSettingsStore((s) => s.maxSummaryEntries);
  const setMaxSummaryEntries = useSettingsStore((s) => s.setMaxSummaryEntries);
  const contextPageDepth = useSettingsStore((s) => s.contextPageDepth);
  const setContextPageDepth = useSettingsStore((s) => s.setContextPageDepth);
  const npcMemoryKeep = useSettingsStore((s) => s.npcMemoryKeep);
  const setNpcMemoryKeep = useSettingsStore((s) => s.setNpcMemoryKeep);
  const jsonRetryCount = useSettingsStore((s) => s.jsonRetryCount);
  const setJsonRetryCount = useSettingsStore((s) => s.setJsonRetryCount);
  const streamingPrintEnabled = useSettingsStore((s) => s.streamingPrintEnabled);
  const setStreamingPrintEnabled = useSettingsStore((s) => s.setStreamingPrintEnabled);
  const clicheCleanerEnabled = useSettingsStore((s) => s.clicheCleanerEnabled);
  const setClicheCleanerEnabled = useSettingsStore((s) => s.setClicheCleanerEnabled);
  const agentMemoryDefault = useSettingsStore((s) => s.agentMemoryDefault);
  const setAgentMemoryDefault = useSettingsStore((s) => s.setAgentMemoryDefault);
  const activeId = useChatStore((s) => s.activeId);
  const activeSessionAme = useChatStore((s) => s.sessions.find((c) => c.id === activeId)?.agentMemoryEnabled);
  const setSessionAgentMemory = (v: boolean | undefined) => {
    if (!activeId) return;
    useChatStore.setState((s) => ({
      sessions: s.sessions.map((c) => (c.id === activeId ? { ...c, agentMemoryEnabled: v } : c)),
    }));
  };
  const rpmLimit = useSettingsStore((s) => s.rpmLimit);
  const setRpmLimit = useSettingsStore((s) => s.setRpmLimit);
  const perApiRpmEnabled = useSettingsStore((s) => s.perApiRpmEnabled);
  const setPerApiRpmEnabled = useSettingsStore((s) => s.setPerApiRpmEnabled);
  const mvuRpmLimit = useSettingsStore((s) => s.mvuRpmLimit);
  const setMvuRpmLimit = useSettingsStore((s) => s.setMvuRpmLimit);
  const rewriteRpmLimit = useSettingsStore((s) => s.rewriteRpmLimit);
  const setRewriteRpmLimit = useSettingsStore((s) => s.setRewriteRpmLimit);
  const rpmMaxQueueAttempts = useSettingsStore((s) => s.rpmMaxQueueAttempts);
  const setRpmMaxQueueAttempts = useSettingsStore((s) => s.setRpmMaxQueueAttempts);
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
  const dsUltraActive = useSettingsStore((s) => s.dsUltraActive);

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
        height: isMobile ? mobilePanelHeight : 560, maxHeight: isMobile ? mobilePanelHeight : '90vh',
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
              fontFamily: 'var(--font-display)', fontSize: 'calc(13px * var(--system-ratio, 1))', color: 'var(--gold)', letterSpacing: 2,
              textAlign: 'center',
            }}>
              设置
            </div>
          )}

          {SIDEBAR_ITEMS.filter((item) => item.key !== 'cheating' || cheatingUnlocked).map((item) => (
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
                fontFamily: 'var(--font-ui)', fontSize: 'calc(12px * var(--system-ratio, 1))', letterSpacing: 1,
                cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap',
                transition: 'background 0.2s, color 0.2s',
              }}
              onMouseEnter={(e) => { if (section !== item.key) { e.currentTarget.style.color = 'var(--text-light)'; e.currentTarget.style.background = 'rgba(196,168,85,0.04)'; } }}
              onMouseLeave={(e) => { if (section !== item.key) { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.background = 'transparent'; } }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, flexShrink: 0 }}>{item.icon}</span>
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
            fontFamily: 'var(--font-ui)', fontSize: 'calc(11px * var(--system-ratio, 1))', letterSpacing: 1,
            cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; }}
          >
            <IconClose size={12} />
            <span>关闭</span>
          </button>
        </div>

        {/* ── Content ── */}
        <style>{`.settings-scroll::-webkit-scrollbar{width:5px}.settings-scroll::-webkit-scrollbar-track{background:rgba(0,0,0,0.15);border-radius:3px}.settings-scroll::-webkit-scrollbar-thumb{background:var(--brass);border-radius:3px}.settings-scroll::-webkit-scrollbar-thumb:hover{background:var(--gold)}`}</style>
        <div className="settings-scroll" style={{
          flex: 1,
          padding: isMobile ? '16px 14px' : '24px 28px',
          paddingBottom: isMobile ? 'calc(16px + env(safe-area-inset-bottom, 0px))' : 28,
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          display: 'flex', flexDirection: 'column',
          minWidth: 0, minHeight: 0,
          scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.15)',
        }}>
          {/* Section title */}
          <div style={{
            paddingBottom: 12, marginBottom: 16,
            borderBottom: '1px solid rgba(196,168,85,0.12)',
            fontFamily: 'var(--font-display)', fontSize: 'calc(15px * var(--system-ratio, 1))', color: 'var(--gold)', letterSpacing: 2,
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
                <SliderRow
                  label="音乐音量"
                  help={'后台 BGM 主音量。BGM 在你与页面发生首次交互(鼠标/键盘)后才会启动,以符合浏览器自动播放策略。'}
                  value={musicVolume} onChange={setMusicVolume}
                  min={0} max={100} unit="%"
                />

                {/* SFX volume */}
                <SliderRow
                  label="音效音量"
                  value={sfxVolume} onChange={setSfxVolume}
                  min={0} max={100} unit="%"
                />

                <SliderRow
                  label="提示延迟"
                  help={'HelpIcon (问号) 悬停后显示说明的延迟时间(毫秒)。0 = 立即显示。'}
                  value={tooltipDelay} onChange={setTooltipDelay}
                  min={0} max={2000} step={100}
                  unit="ms"
                />

                {/* Auto-submit choice */}
                <div style={rowStyle}>
                  <span style={labelStyle}>选项自动推进</span>
                  <Toggle on={autoSubmitChoice} onChange={() => setAutoSubmitChoice(!autoSubmitChoice)} />
                </div>

                <SliderRow
                  label="正文文字大小"
                  help={'调节叙事/对话/线索/关键词等「剧情可读性」文字的字号倍率。\n80% ~ 150%,默认 100%。\n\n几何尺寸(书页/按钮宽高)由响应式 CSS 驱动,会跟随浏览器窗口大小自动调整,不受这里影响。'}
                  value={Math.round(textRatio * 100)}
                  onChange={(v) => setTextRatio(v / 100)}
                  min={Math.round(TEXT_RATIO_MIN * 100)} max={Math.round(TEXT_RATIO_MAX * 100)} step={5}
                  unit="%" rangeWidth={140}
                />

                <SliderRow
                  label="系统文字大小"
                  help={'调节按钮/菜单/设置面板/状态栏等「系统 UI」文字的字号倍率。\n80% ~ 150%,默认 100%。\n\n与正文文字独立——可以正文调大方便沉浸阅读、系统保持 100% 紧凑显示。'}
                  value={Math.round(systemRatio * 100)}
                  onChange={(v) => setSystemRatio(v / 100)}
                  min={Math.round(TEXT_RATIO_MIN * 100)} max={Math.round(TEXT_RATIO_MAX * 100)} step={5}
                  unit="%" rangeWidth={140}
                />

                <SliderRow
                  label="书本界面尺寸"
                  help={'调节桌面端书本的最大横向宽度比例。\n50% ~ 200%，默认 100% (880px)。\n\n开启此项可充分利用带宽显示器的横向空间。移动端自动忽略此设置。'}
                  value={Math.round(bookZoom * 100)}
                  onChange={(v) => setBookZoom(v / 100)}
                  min={50} max={200} step={5}
                  unit="%" rangeWidth={140}
                />

                <CategoryBar label="上下文" />
                {/* Max summary entries */}
                <SliderRow
                  label="上下文总结上限"
                  help={'上下文注意力有限，回顾总结条目过多可能导致LLM注意力分散，\n引发剧情混乱或遗忘近期事件。建议保持在20条以内。\n\n此设置控制每次生成时最多注入多少条「剧情回顾」摘要到LLM上下文中。'}
                  value={maxSummaryEntries} onChange={setMaxSummaryEntries}
                  min={5} max={50} step={5}
                />

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
                    <span style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)' }}>{contextPageDepth === 0 ? '全部页面' : `最近${contextPageDepth}页`}</span>
                  </div>
                </div>

                <SliderRow
                  label="NPC 记忆保留条数"
                  help={'每个 NPC 的「互动记忆」在被 AI 折叠成「记忆梗概」后，保留的最近原始记忆条数。\n\n数值越小越紧凑、越省 token；越大保留越多近期逐字细节。\n\n更早的记忆会被浓缩进梗概，不会丢失语义。默认 6 条。'}
                  value={npcMemoryKeep} onChange={setNpcMemoryKeep}
                  min={3} max={12}
                />

                <CategoryBar label="生成与稳定性" />
                <div style={rowStyle}>
                  <span style={labelStyle}>
                    流式刻印
                    <HelpIcon text={'主推进生成时启用 SSE 真流式：拿到首个字节就翻页，左页正文按汉字逐字"高光→黑字"刻印出场。\n\n标签字符（kw/san/thinking）不可见，仅刻印实际叙事文字。\n\n右页（引导文/选项）与顶部状态栏仍等本回合完整结算后一起出现，避免数值跳变。\n\n中转站不支持 SSE 时自动静默降级为非流式，无需手动关闭。\n\n默认关。'} />
                  </span>
                  <Toggle on={streamingPrintEnabled} onChange={() => setStreamingPrintEnabled(!streamingPrintEnabled)} />
                </div>

                <div style={rowStyle}>
                  <span style={labelStyle}>
                    八股净化
                    <HelpIcon text={'对 AI 输出的叙事正文和选项文字做规则替换，自动消除模板化措辞。\n\n例：「嘴角勾起一抹玩味的弧度」→「笑了一下」、「几不可查的」→ 删除、「头颅」→「头」、重复标点折叠等。\n\n仅作用于叙事文字，不影响技能名、JSON 结构等功能字段。\n\n默认开。'} />
                  </span>
                  <Toggle on={clicheCleanerEnabled} onChange={() => setClicheCleanerEnabled(!clicheCleanerEnabled)} />
                </div>

                <div style={rowStyle}>
                  <span style={labelStyle}>
                    Agent 心智档案（默认）
                    <HelpIcon text={'开启后，重要 NPC 和世界本身将各自拥有「心智档案」：硬字段（目标 / 下一步 / 对调查员的信任与情绪 / 秘密 / 与其他 NPC 的关系）+ 自由散文心思。\n\nLLM 会把这些心智档案作为独立通路注入主回合 prompt，让 NPC 像有自主意图的 Agent 而不是被动数值。\n\n核心 NPC 升级时会触发一次独立立卡子调用；世界 Memory 每回合 fire-and-forget 子调用，目标 3 RPM。\n\n这是新建会话的默认值；每个存档下面可单独覆盖。默认关。'} />
                  </span>
                  <Toggle on={agentMemoryDefault} onChange={() => setAgentMemoryDefault(!agentMemoryDefault)} />
                </div>

                {activeId && (
                  <div style={rowStyle}>
                    <span style={labelStyle}>
                      本会话覆盖
                      <HelpIcon text={'当前会话独立设置：跟随全局默认 / 强制开启 / 强制关闭。\n\n切换为强制开后，本会话立即获得 Agent 心智档案能力；切换为强制关则关闭该能力。\n\n选择「跟随默认」则恢复跟随上面的全局开关。'} />
                    </span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        onClick={() => setSessionAgentMemory(undefined)}
                        style={{
                          padding: '2px 8px',
                          fontSize: 'calc(11px * var(--system-ratio, 1))',
                          fontFamily: 'var(--font-ui)',
                          border: '1px solid var(--ink-faded)',
                          background: activeSessionAme === undefined ? 'var(--ink-ledger)' : 'transparent',
                          color: activeSessionAme === undefined ? 'var(--paper)' : 'var(--ink)',
                          cursor: 'pointer',
                        }}
                      >跟随默认</button>
                      <button
                        type="button"
                        onClick={() => setSessionAgentMemory(true)}
                        style={{
                          padding: '2px 8px',
                          fontSize: 'calc(11px * var(--system-ratio, 1))',
                          fontFamily: 'var(--font-ui)',
                          border: '1px solid var(--ink-faded)',
                          background: activeSessionAme === true ? 'var(--ink-ledger)' : 'transparent',
                          color: activeSessionAme === true ? 'var(--paper)' : 'var(--ink)',
                          cursor: 'pointer',
                        }}
                      >强制开</button>
                      <button
                        type="button"
                        onClick={() => setSessionAgentMemory(false)}
                        style={{
                          padding: '2px 8px',
                          fontSize: 'calc(11px * var(--system-ratio, 1))',
                          fontFamily: 'var(--font-ui)',
                          border: '1px solid var(--ink-faded)',
                          background: activeSessionAme === false ? 'var(--ink-ledger)' : 'transparent',
                          color: activeSessionAme === false ? 'var(--paper)' : 'var(--ink)',
                          cursor: 'pointer',
                        }}
                      >强制关</button>
                    </div>
                  </div>
                )}

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
                    <span style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)' }}>{jsonRetryCount === 0 ? '不重试' : `重试${jsonRetryCount}次`}</span>
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

                <div style={rowStyle}>
                  <span style={labelStyle}>
                    排队上限（单次调用最多等待轮次）
                    <HelpIcon text={'单次 API 调用在排队等 RPM 窗口腾位时最多等待的轮次（每轮 ≤5s）。\n\n达到此次数即抛 RpmQueueExhaustedError，由调用方 fail-open（静默降级丢这次请求），防 setTimeout 死循环卡住整条管线。\n\n硬上限 10，最低 0（=不排队，撞限即抛）。默认 10。'} />
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="number" min={0} max={10} step={1}
                      value={rpmMaxQueueAttempts}
                      onChange={(e) => setRpmMaxQueueAttempts(Number(e.target.value) || 0)}
                      style={numInputStyle}
                    />
                    <span style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)' }}>{rpmMaxQueueAttempts === 0 ? '不排队' : `最多 ${rpmMaxQueueAttempts} 轮`}</span>
                  </div>
                </div>

                <CategoryBar label="世界书匹配" />
                <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'calc(10px * var(--system-ratio, 1))', color: 'var(--text-light)', fontFamily: 'var(--font-ui)' }}>
                    <input type="checkbox" checked={globalCaseSensitive} onChange={(e) => setGlobalCaseSensitive(e.target.checked)} style={{ accentColor: 'var(--gold)' }} />
                    世界书全局区分大小写
                    <HelpIcon text={'全局开关：世界书关键词匹配时是否区分大小写。\n开启后「Arkham」与「arkham」视为不同关键词；关闭则忽略大小写。\n会覆盖各条目自身的大小写设置。'} />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'calc(10px * var(--system-ratio, 1))', color: 'var(--text-light)', fontFamily: 'var(--font-ui)' }}>
                    <input type="checkbox" checked={globalMatchWholeWord} onChange={(e) => setGlobalMatchWholeWord(e.target.checked)} style={{ accentColor: 'var(--gold)' }} />
                    世界书全局完整单词匹配
                    <HelpIcon text={'全局开关：关键词是否必须作为「完整单词」才算命中。\n开启后关键词「cat」不会命中「category」里的片段。\n主要影响英文；中文没有单词边界，一般无影响。'} />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'calc(10px * var(--system-ratio, 1))', color: 'var(--text-light)', fontFamily: 'var(--font-ui)' }}>
                    <input type="checkbox" checked={includeNames} onChange={(e) => setIncludeNames(e.target.checked)} style={{ accentColor: 'var(--gold)' }} />
                    包含角色名称
                    <HelpIcon text={'组装提示词时，是否在每条消息前标注发言者名称（如 User: / Char:）。\n部分模型或预设需要它来区分角色，部分则不需要。\n如果AI回复里莫名出现名字前缀，可尝试关闭。'} />
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'calc(10px * var(--system-ratio, 1))', color: 'var(--text-light)', fontFamily: 'var(--font-ui)' }}>
                    <input type="checkbox" checked={alertOnOverflow} onChange={(e) => setAlertOnOverflow(e.target.checked)} style={{ accentColor: 'var(--gold)' }} />
                    溢出警告
                    <HelpIcon text={'当注入的世界书内容超出下方「Token预算」、有条目被裁掉时，弹出提醒。\n方便你察觉部分世界书没能进入上下文。'} />
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 'calc(10px * var(--system-ratio, 1))', color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)' }}>递归步数</span>
                    <HelpIcon text={'世界书条目被激活后，其内容里的关键词可以继续触发别的条目（递归扫描）。\n此值限制递归的层数。\n0 = 不限制（可能连锁激活大量条目、撑大上下文）。'} />
                    <input type="number" min={0} max={20} value={maxRecursionSteps} onChange={(e) => setMaxRecursionSteps(Number(e.target.value) || 0)}
                      style={numInputStyle} />
                    <span style={{ fontSize: 'calc(8px * var(--system-ratio, 1))', color: 'var(--ink-faded)' }}>0=无限</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 'calc(10px * var(--system-ratio, 1))', color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)' }}>Token预算</span>
                    <HelpIcon text={'单次注入世界书内容的 Token 上限。\n超出预算时，优先级低的条目会被裁掉、不进入上下文。\n0 = 不限制（注入所有匹配到的条目）。'} />
                    <input type="number" min={0} max={99999} step={100} value={wiBudget} onChange={(e) => setWiBudget(Number(e.target.value) || 0)}
                      style={numInputStyle} />
                    <span style={{ fontSize: 'calc(8px * var(--system-ratio, 1))', color: 'var(--ink-faded)' }}>0=无限</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 'calc(10px * var(--system-ratio, 1))', color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)' }}>插入策略</span>
                    <HelpIcon text={'多个匹配到的世界书条目注入提示词时的排布方式：\n均匀 — 按顺序均匀分布在上下文中\n全局优先 — 全局世界书排在更靠前的位置\n会话优先 — 当前会话绑定的世界书排在更靠前的位置'} />
                    <DarkSelect compact value={worldInfoStrategy} onChange={(v) => setWorldInfoStrategy(v as 'evenly' | 'global-first' | 'chat-first')}
                      options={[{ value: 'evenly', label: '均匀' }, { value: 'global-first', label: '全局优先' }, { value: 'chat-first', label: '会话优先' }]}
                      style={{ width: 110 }} />
                  </div>
                </div>

                {/* 缓存优化（通用 API）—— 跨 API 通用的子调用共享前缀，独立于 DeepSeek 重组 */}
                <CategoryBar label="缓存优化（通用 API）" />
                <div style={rowStyle}>
                  <span style={labelStyle}>
                    子调用共享前缀
                    <HelpIcon text={'让所有 LLM 子调用(坏结局/起始物品/地点元素抽取/地图自检/线索整合/剧情锚点/暗线生成/战斗检测/MVU 提取/关键线索评估/地点元素整合 共 11 个)共用同一段 KP 助手定位文案；原各自 system 内容下沉到 user 头部 + [子任务: xxx] 标签。\n收益：子调用之间 messages[0] 字节完全相同 → 任意 API 的 prefix cache(DS 隐式 / Anthropic ephemeral / OpenAI auto-prefix)都能跨子调用复用，开局/战斗等多子调用回合省 ~600-1000 tokens cache write。\n跨 API 通用：DeepSeek / Claude / GPT / Gemini 等任何 OpenAI 兼容端点都受益。\n副作用：原 system 通用化，LLM 任务理解能力可能略下降——任务说明置于 user 头部 + [子任务: xxx] 标签部分抵消。\n默认开启。'} />
                  </span>
                  <Toggle on={dsCache.experimentalSubagentSharedSystem !== false} onChange={() => setDsCache({ experimentalSubagentSharedSystem: !(dsCache.experimentalSubagentSharedSystem !== false) })} />
                </div>

                {/* DeepSeek 消息三区重组（前缀缓存）—— 合并思维模式 + 漂移诊断（升正式） */}
                <CategoryBar label="DeepSeek 消息重组（前缀缓存）" />
                {/* v1.11.8 重构: 一键 DeepSeek 终极适配 = runtime override 切换式按钮（基于 dsUltraActive）：
                    apply / revert 都【不动】 dsCache / forceJsonObject 等字段本身的 Toggle 状态;
                    实际生效的字段通过 getEffectiveDsCache/getEffectiveSetting 在 active 时返回 ULTRA 值。
                    用户底下 Toggle 显示的永远是原 dsCache,撤销后 Toggle 状态也不会动。
                    注意：dsUltraActive 订阅在组件顶层(行 383)——React hooks 不能放在 IIFE/条件内。 */}
                {(() => {
                  const isApplied = dsUltraActive;
                  const apply = useSettingsStore.getState().applyDeepSeekUltraPreset;
                  const revert = useSettingsStore.getState().revertDeepSeekUltraPreset;
                  return (
                    <div style={{ ...rowStyle, marginBottom: 10 }}>
                      <button
                        onClick={() => {
                          if (isApplied) {
                            revert();
                            useStatusToastStore.getState().markDone('已撤销 DeepSeek 终极适配，所有设置恢复到应用前状态');
                          } else {
                            apply();
                            useStatusToastStore.getState().markDone('已应用 DeepSeek 终极适配（缓存最大化 + 无限长上下文 + MVU 保健）');
                          }
                        }}
                        title={isApplied
                          ? [
                            '当前已应用 DeepSeek 终极适配。',
                            '',
                            '点击「撤销」会把以下字段恢复到应用前的原值：',
                            '• DS 缓存配置全段（含思维模式以外的所有子项）',
                            '• forceJsonObject / maxSummaryEntries',
                            '• mvuSelfCorrectEnabled / mvuSelfCorrectRetries / mvuForceAlways',
                            '• tavernHelper.optimizeMessageLoad',
                          ].join('\n')
                          : [
                            '一键覆盖所有与缓存命中相关的设置：',
                            '• DS 缓存重组 + 所有自动下沉机制全开（最大化前缀缓存）',
                            '• 静态前缀稳定 + statSnapshot 减肥 + 跳过重复条目',
                            '• 子调用共享前缀 + 漂移诊断',
                            '• 上下文：剧情回顾上限拉满 50 + 关闭历史 page 裁剪（无限长）',
                            '• MVU 保健：自纠开启 + 重试 2 次 + 强制始终提取 + 严格 JSON 模式',
                            '',
                            '应用前会 snapshot 所有被覆盖字段的原值，随时可一键撤销。',
                            '不动：API 凭证 / 思维模式偏好 / UI 缩放/音量 / MVU 独立 API 凭证。',
                          ].join('\n')}
                        style={{
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: 6,
                          border: isApplied ? '1px solid rgba(196,168,85,0.4)' : '1px solid var(--gold)',
                          background: isApplied
                            ? 'linear-gradient(180deg, rgba(60,40,20,0.5) 0%, rgba(30,20,10,0.3) 100%)'
                            : 'linear-gradient(180deg, rgba(196,168,85,0.25) 0%, rgba(196,168,85,0.12) 100%)',
                          color: isApplied ? 'var(--ink-subtle)' : 'var(--gold-bright)',
                          fontFamily: 'var(--font-display)',
                          fontSize: 'calc(12px * var(--system-ratio, 1))',
                          letterSpacing: 2,
                          cursor: 'pointer',
                          transition: 'var(--transition-smooth)',
                          boxShadow: isApplied
                            ? '0 0 0 1px rgba(196,168,85,0.05) inset, 0 1px 3px rgba(0,0,0,0.3)'
                            : '0 0 0 1px rgba(196,168,85,0.1) inset, 0 2px 6px rgba(0,0,0,0.4)',
                        }}
                        onMouseEnter={(e) => {
                          if (isApplied) {
                            e.currentTarget.style.background = 'linear-gradient(180deg, rgba(80,55,30,0.6) 0%, rgba(40,28,15,0.4) 100%)';
                            e.currentTarget.style.color = 'var(--gold)';
                            e.currentTarget.style.borderColor = 'var(--gold)';
                          } else {
                            e.currentTarget.style.background = 'linear-gradient(180deg, rgba(196,168,85,0.4) 0%, rgba(196,168,85,0.2) 100%)';
                          }
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 0 0 1px rgba(196,168,85,0.2) inset, 0 4px 10px rgba(0,0,0,0.5)';
                        }}
                        onMouseLeave={(e) => {
                          if (isApplied) {
                            e.currentTarget.style.background = 'linear-gradient(180deg, rgba(60,40,20,0.5) 0%, rgba(30,20,10,0.3) 100%)';
                            e.currentTarget.style.color = 'var(--ink-subtle)';
                            e.currentTarget.style.borderColor = 'rgba(196,168,85,0.4)';
                            e.currentTarget.style.boxShadow = '0 0 0 1px rgba(196,168,85,0.05) inset, 0 1px 3px rgba(0,0,0,0.3)';
                          } else {
                            e.currentTarget.style.background = 'linear-gradient(180deg, rgba(196,168,85,0.25) 0%, rgba(196,168,85,0.12) 100%)';
                            e.currentTarget.style.boxShadow = '0 0 0 1px rgba(196,168,85,0.1) inset, 0 2px 6px rgba(0,0,0,0.4)';
                          }
                          e.currentTarget.style.transform = 'translateY(0)';
                        }}
                        onMouseDown={(e) => { e.currentTarget.style.transform = 'translateY(0)'; }}
                      >
                        {isApplied ? '↩ 撤销 DeepSeek 终极适配' : '★ 一键 DeepSeek 终极适配'}
                        <span style={{ display: 'block', fontSize: 'calc(9px * var(--system-ratio, 1))', letterSpacing: 1, fontFamily: 'var(--font-ui)', color: 'var(--ink-subtle)', marginTop: 3, fontWeight: 400 }}>
                          {isApplied
                            ? '当前已生效 · 点击恢复到应用前的所有设置'
                            : '缓存最大化 · 无限长上下文 · MVU 保健（不动凭证 / UI / 思维模式）'}
                        </span>
                      </button>
                    </div>
                  );
                })()}
                <div style={rowStyle}>
                  <span style={labelStyle}>
                    启用消息重组
                    <HelpIcon text={'把发给 API 的 messages 重组成三个区域以最大化 DeepSeek 前缀缓存命中：\n顶部(缓存区) — 所有 system 设定 + 首条 user 合并成一条 user，字节稳定 → 命中缓存\n中间(对话区) — 聊天历史保持原样\n底部(高注意力区) — 内联 system / 绿灯 lore / 作者注塞到最后 user 之前(等效 D1)\n\n本游戏每回合 stateless 重构 prompt(无聊天历史)，重组后通常发送【一条 user 消息】，能让 DeepSeek 前缀缓存命中率从极低跃升到 80%+。\n默认开启。需自行确认中转站走的是 DeepSeek 通道。'} />
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
                        style={{ flex: 1, maxWidth: 220, fontFamily: 'var(--font-mono)', fontSize: 'calc(12px * var(--system-ratio, 1))', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(196,168,85,0.2)', borderRadius: 4, color: 'inherit', padding: '4px 6px', transition: 'var(--transition-smooth)' }} />
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
                          style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 'calc(12px * var(--system-ratio, 1))', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(196,168,85,0.2)', borderRadius: 4, color: 'inherit', padding: 6, resize: 'vertical', transition: 'var(--transition-smooth)' }} />
                      </div>
                    )}
                    <div style={rowStyle}>
                      <span style={labelStyle}>
                        世界书蓝绿灯分离
                        <HelpIcon text={'把【非常驻】世界书条目(绿灯)从顶部缓存区移到底部高注意力区(最后 user 之前)，让蓝灯(常驻)条目独享缓存。\n本项目世界书匹配每回合都变(matchedKeyword/anchor/keyword/statSnapshot 等动态桶) → 启用后能让前缀更稳定。'} />
                      </span>
                      <Toggle on={dsCache.separateWiLights === true} onChange={() => setDsCache({ separateWiLights: !(dsCache.separateWiLights === true) })} />
                    </div>
                    <div style={rowStyle}>
                      <span style={labelStyle}>
                        自动检测动态常驻
                        <HelpIcon text={'扫描内置&用户世界书的【常驻(蓝灯)】条目，含 EJS `<%`/`{{getvar}}`/`{{xxx.yyy}}` 等动态宏的自动下沉到动态尾段。\n这是修复"99.3%→48.8%"命中率衰减的关键——coc_lore 内置条目(ejs_hp_state/mvu_var_list 等)虽然 constant=true 但渲染结果随 statData 变。\n默认开。'} />
                      </span>
                      <Toggle on={dsCache.autoDetectDynamicConstant !== false} onChange={() => setDsCache({ autoDetectDynamicConstant: !(dsCache.autoDetectDynamicConstant !== false) })} />
                    </div>
                    <div style={rowStyle}>
                      <span style={labelStyle}>
                        自动下沉动态预设条目
                        <HelpIcon text={'扫描预设里所有 role="system" 的 promptItem,含 {{setvar}}/{{getvar}}/{{lastusermessage}} 等 ST 宏的自动从主前缀剥离、追加到动态尾段(dynamicTail)。\n\n这是修复"双人成行 / 杀八股"类重型预设把 Pro 缓存命中率压到 5% 的关键——这类预设的 promptItem 大量含动态宏,渲染结果每回合都变,毫无缓存可言。下沉后渲染顺序不变(走同一 macro batch,setvar/getvar 跨段链不破坏),只是 LLM 看到的注意力位置从中间区移到末尾区,实测对生成质量无明显影响。\n\n仅作用于 role="system" 类。user/assistant 类是对话结构(预设里的 mock 对话),不能下沉,会在日志里另行提示需要手动改。\n\n默认开。如果你发现某个特定预设下沉后行为变怪,可临时关掉。'} />
                      </span>
                      <Toggle on={dsCache.autoSinkDynamicPromptItem !== false} onChange={() => setDsCache({ autoSinkDynamicPromptItem: !(dsCache.autoSinkDynamicPromptItem !== false) })} />
                    </div>
                    <div style={rowStyle}>
                      <span style={labelStyle}>
                        前缀漂移诊断
                        <HelpIcon text={'借鉴 claude-code-best 的 PROMPT_CACHE_BREAK_DETECTION：跨回合保存"理论应每回合相等"的静态前缀(systemPrompt+wbBefore+processedFormat+wbAfter)，本回合发送前对比，漂移时在日志面板打 warn：\n• 第一处差异字节位置\n• 前后 80 字符上下文(上回合 vs 本回合)\n• 启发式定位是哪段污染(systemPrompt / wbBefore / processedFormat / wbAfter)\n让你自助定位"为何命中率不达预期"——找到漂移源后改预设/世界书把它静态化。\n纯诊断，不改 prompt，对生成质量无影响。默认开启。'} />
                      </span>
                      <Toggle on={dsCache.experimentalPrefixDiagnostics !== false} onChange={() => setDsCache({ experimentalPrefixDiagnostics: !(dsCache.experimentalPrefixDiagnostics !== false) })} />
                    </div>
                    <div style={rowStyle}>
                      <span style={labelStyle}>
                        调试日志
                        <HelpIcon text={'在浏览器控制台(F12)打印重组前/后的 messages 结构（含 role + 内容首 80 字）。仅排查时开。'} />
                      </span>
                      <Toggle on={dsCache.debugLog === true} onChange={() => setDsCache({ debugLog: !(dsCache.debugLog === true) })} />
                    </div>

                    {/* 思维模式注入：合并自原"DeepSeek V4 缓存优化（思维模式）"分组 */}
                    <div style={rowStyle}>
                      <span style={labelStyle}>
                        思维模式注入
                        <HelpIcon text={'把所选「思维模式指令」附着到发给模型的【最后一条用户消息尾部】(高注意力区)，概率性增强 DeepSeek V4 在 <think> 思考内的风格。\n• 不注入（默认）：零副作用\n• 角色沉浸：思考中以括号包裹角色第一人称内心独白\n• 纯分析：思考只做逻辑分析、禁内心独白\n• 格式加强：尾部复述「遵从既定格式(含省略规则、不新增字段)」\n• 自定义：用你自己的指令\n指令不进 system / 世界书前缀，也不写入正文与历史——不破坏 DeepSeek 前缀缓存。仅对支持思维链的模型(DS V4 等)有效。'} />
                      </span>
                      <DarkSelect compact value={dsCache.mode} onChange={(v) => setDsCache({ mode: v as DsThinkingMode, enabled: true })}
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
                          style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 'calc(12px * var(--system-ratio, 1))', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(196,168,85,0.2)', borderRadius: 4, color: 'inherit', padding: 6, resize: 'vertical', transition: 'var(--transition-smooth)' }} />
                      </div>
                    )}

                    {/* 实验性 ULTRA 缓存——标题强化为带橙色标签的 sub-bar，明显区别 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0 12px' }}>
                      <span style={{
                        fontSize: 'calc(11px * var(--system-ratio, 1))', fontWeight: 700, letterSpacing: 2, color: '#d47830',
                        fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap', flexShrink: 0,
                        padding: '3px 10px', background: 'rgba(212,120,48,0.15)',
                        border: '1px solid rgba(212,120,48,0.5)', borderRadius: 3,
                        textTransform: 'uppercase',
                      }}>⚗ 实验性 · ULTRA 缓存优化</span>
                      <span style={{ fontSize: 'calc(10px * var(--system-ratio, 1))', color: 'rgba(212,120,48,0.75)', letterSpacing: 1 }}>副作用较大 · 自选启用</span>
                      <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, rgba(212,120,48,0.5), rgba(212,120,48,0.04))' }} />
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
                        常驻条目视为动态
                        <HelpIcon text={'激进选项：把【全部常驻(蓝灯)】世界书条目无差别下沉到动态尾段(不再按 EJS/宏内容自动判定)。\n仅在"自动检测动态常驻"不够用时开。会让静态前缀进一步缩短，但保前缀绝对干净。'} />
                      </span>
                      <Toggle on={dsCache.treatConstantAsDynamic === true} onChange={() => setDsCache({ treatConstantAsDynamic: !(dsCache.treatConstantAsDynamic === true) })} />
                    </div>
                  </>
                )}

                {/* v1.14.1:三段 API 配置(主/MVU/补写)整段搬到「API 管理」tab。这里仅留跳转入口。 */}
                <div style={{ marginTop: 4 }}>
                  <CategoryBar label="API 与模型" />
                  <div style={{ ...rowStyle, justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ ...labelStyle, color: 'var(--ink-subtle)' }}>主 API / MVU / 行动补写的配置与模型选择已迁移至</span>
                    <button onClick={() => setSection('apiManagement')} style={{
                      background: 'rgba(196,168,85,0.08)', border: '1px solid var(--brass)', borderRadius: 3,
                      padding: '4px 10px', color: 'var(--gold)',
                      fontFamily: 'var(--font-ui)', fontSize: 'calc(11px * var(--system-ratio,1))',
                      letterSpacing: 1.5, cursor: 'pointer',
                      transition: 'var(--transition-smooth, all 200ms cubic-bezier(0.4,0,0.2,1))',
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.background = 'rgba(196,168,85,0.18)'; e.currentTarget.style.transform = 'scale(1.04)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; e.currentTarget.style.background = 'rgba(196,168,85,0.08)'; e.currentTarget.style.transform = 'scale(1)'; }}
                      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.04)'; }}
                    >→ API 管理</button>
                  </div>
                </div>

                {/* Return to menu */}
                <button onClick={handleReturnToMenu} style={{
                  width: '100%', marginTop: 20, padding: '8px 0',
                  border: '1px solid var(--blood)', borderRadius: 3,
                  background: 'rgba(139,58,58,0.08)', color: 'var(--blood)',
                  fontFamily: 'var(--font-ui)', fontSize: 'calc(11px * var(--system-ratio, 1))', letterSpacing: 4, cursor: 'pointer',
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(139,58,58,0.18)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(139,58,58,0.08)'; }}
                >
                  返回主菜单
                </button>
              </motion.div>
            )}

            {section === 'apiManagement' && (
              <motion.div key="apiManagement" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
                <ApiManagementTab />
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
            {section === 'promptTemplate' && (
              <motion.div key="promptTemplate" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
                <PromptTemplateContent />
              </motion.div>
            )}
            {section === 'cheating' && (
              <motion.div key="cheating" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
                <CheatingContent />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ── Shared styles ──

const miniBtnStyle: React.CSSProperties = {
  background: 'rgba(196,168,85,0.08)',
  color: 'var(--text-light)',
  border: '1px solid rgba(196,168,85,0.15)',
  borderRadius: 4,
  padding: '4px 10px',
  cursor: 'pointer',
  fontSize: 'calc(10px * var(--system-ratio, 1))',
  fontFamily: 'var(--font-ui)',
  letterSpacing: 1,
};

const iconBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  padding: '2px 5px',
  fontSize: 'calc(12px * var(--system-ratio, 1))',
  color: 'var(--ink-faded)',
  borderRadius: 3,
};

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
        <span style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)' }}>{value === 0 ? '不限制' : `${value} 次/分`}</span>
      </div>
    </div>
  );
}

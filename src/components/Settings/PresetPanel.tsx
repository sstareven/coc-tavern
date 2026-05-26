import { useState, useRef } from 'react';
import { useChatStore } from '../../stores/useChatStore';
import { useRegexStore } from '../../stores/useRegexStore';
import { useTavernHelperStore } from '../../stores/useTavernHelperStore';
import { exportPresetToST, importPresetFromST } from '../../sillytavern/format-converter';
import type { ChatPreset } from '../../types';

const DEFAULT_PRESETS: Record<string, ChatPreset> = {
  p1: {
    id: 'p1', name: '默认预设',
    temperature: 1.00, frequencyPenalty: 0.00, presencePenalty: 0.00, repetitionPenalty: 1.00,
    topP: 1.00, topK: 40, minP: 0, topA: 0, maxTokens: 2048,
    systemPrompt: '你是一个TRPG游戏主持人，负责运行克苏鲁的呼唤7版模组。',
    userPrefix: '玩家: ', assistantPrefix: '守秘人: ',
    unlockContext: false, contextLength: 65536, maxResponseTokens: 2048, alternativeReplies: 1,
    streamEnabled: false, reasoningEffort: 'auto', showThoughts: false,
    responseLength: 'auto', seed: -1,
    charNameBehavior: 'none', continueSuffix: 'none', continuePrefill: false, assistantPrefill: '',
    mainPrompt: '', auxiliaryPrompt: '', postHistoryPrompt: '',
    aiAssistPrompt: '根据上文内容，写出{{char}}的下一句对话或行动',
    worldBookTemplate: '[世界书: {0}]',
    scenarioTemplate: '场景: {{scenario}}',
    personalityTemplate: '性格: {{personality}}',
    groupChatPrompt: '请以{{char}}的身份回复。',
    newChatPrompt: '[新的聊天即将开始]',
    newGroupChatPrompt: '[新的群聊即将开始]',
    newExampleChatPrompt: '[新的示例聊天即将开始]',
    continuePrompt: '[继续推进]',
    emptyMessagePrompt: '',
    promptItems: [],
    tavernHelperScripts: [],
    regexScripts: [],
  },
};

interface Props {
  onClose: () => void;
  onEditPreset: (preset: ChatPreset, onSave: (p: ChatPreset) => void) => void;
}

const PRESET_STORAGE_KEY = 'coc_presets_v1';

function loadPresets(): Record<string, ChatPreset> {
  try { const raw = localStorage.getItem(PRESET_STORAGE_KEY); return raw ? { ...DEFAULT_PRESETS, ...JSON.parse(raw) } : { ...DEFAULT_PRESETS }; } catch { return { ...DEFAULT_PRESETS }; }
}
function savePresets(p: Record<string, ChatPreset>) {
  const extra: Record<string, ChatPreset> = {};
  for (const [k, v] of Object.entries(p)) { if (!DEFAULT_PRESETS[k]) extra[k] = v; }
  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(extra));
}

export function PresetPanel({ onClose, onEditPreset }: Props) {
  const [presets, setPresets] = useState(loadPresets);
  const activeSessionId = useChatStore((s) => s.activeId);
  const sessionPresetId = useChatStore((s) => {
    const session = s.sessions.find((c) => c.id === s.activeId);
    return session?.presetId;
  });
  const [selectedId, setSelectedId] = useState<string>(() => {
    if (sessionPresetId) return sessionPresetId;
    return localStorage.getItem('coc_last_preset') || 'p1';
  });
  const setPreset = useChatStore((s) => s.setPreset);
  const fileRef = useRef<HTMLInputElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleRename = (id: string) => {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    const updated = { ...presets };
    if (updated[id]) {
      updated[id] = { ...updated[id], name: renameValue.trim() };
      setPresets(updated);
      savePresets(updated);
    }
    setRenamingId(null);
  };

  const handleExport = (id: string) => {
    const preset = presets[id];
    if (!preset) return;
    const json = exportPresetToST(preset, preset.regexScripts);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${preset.name}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const fileName = file.name.replace(/\.json$/i, '');
      const result = importPresetFromST(reader.result as string, fileName);
      if (result) {
        const { preset, regexScripts } = result;
        // Store regex scripts and tavern helper scripts on the preset object for per-preset scoping
        const finalPreset = {
          ...preset,
          regexScripts: regexScripts.length > 0 ? regexScripts.map((s) => ({ ...s, id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` })) : undefined,
        };
        const updated = { ...presets, [finalPreset.id]: finalPreset };
        setPresets(updated);
        savePresets(updated);
        setSelectedId(finalPreset.id);
        localStorage.setItem('coc_last_preset', finalPreset.id);
        // Load scripts into active stores
        if (finalPreset.regexScripts) {
          useRegexStore.setState({ presetScripts: finalPreset.regexScripts });
        }
        if (finalPreset.tavernHelperScripts && finalPreset.tavernHelperScripts.length > 0) {
          useTavernHelperStore.getState().setPresetScripts(finalPreset.tavernHelperScripts);
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    localStorage.setItem('coc_last_preset', id);
    if (activeSessionId) {
      setPreset(id);
    }
    // Load the selected preset's regex scripts and tavern helper scripts into stores
    const selected = presets[id];
    useRegexStore.setState({ presetScripts: selected?.regexScripts || [] });
    useTavernHelperStore.getState().setPresetScripts(selected?.tavernHelperScripts || []);
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
            预设管理 / PRESETS
          </h3>
          <button onClick={onClose} style={closeBtnStyle}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--brass)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'transparent'; }}
          >✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Object.entries(presets).map(([id, preset]) => {
            const isActive = selectedId === id;
            return (
              <div key={id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px',
                border: isActive ? '1px solid var(--gold)' : '1px solid rgba(196,168,85,0.12)',
                borderRadius: 4,
                background: isActive ? 'rgba(196,168,85,0.12)' : 'rgba(0,0,0,0.15)',
                cursor: 'pointer',
                transition: 'var(--transition-smooth)',
              }} onClick={() => handleSelect(id)}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {renamingId === id ? (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <input value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleRename(id); if (e.key === 'Escape') setRenamingId(null); }}
                        autoFocus style={{ fontSize: 13, fontFamily: 'var(--font-display)', letterSpacing: 2, padding: '3px 6px', border: '1px solid var(--gold)', borderRadius: 3, background: 'rgba(0,0,0,0.3)', color: 'var(--gold)', width: 180, outline: 'none' }} />
                      <button onClick={() => handleRename(id)} style={{ ...actionBtnStyle, color: 'var(--success)', padding: '2px 8px', fontSize: 11 }}>✓</button>
                      <button onClick={() => setRenamingId(null)} style={{ ...actionBtnStyle, color: 'var(--ink-subtle)', padding: '2px 8px', fontSize: 11 }}>✕</button>
                    </div>
                  ) : (
                    <span style={{ fontSize: 14, color: isActive ? 'var(--gold)' : 'var(--text-light)', fontFamily: 'var(--font-display)', letterSpacing: 2, cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); setRenamingId(id); setRenameValue(preset.name); }}
                      title="点击重命名">
                      {preset.name}
                      {isActive && <span style={{ fontSize: 10, color: 'var(--success)', marginLeft: 8 }}>当前</span>}
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)' }}>
                    T={preset.temperature} · P={preset.topP} · max={preset.maxTokens}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={(e) => { e.stopPropagation(); onEditPreset(preset, (updated) => { const next = { ...presets, [updated.id]: updated }; setPresets(next); savePresets(next); if (activeSessionId) setPreset(updated.id); if (updated.regexScripts) useRegexStore.setState({ presetScripts: updated.regexScripts }); if (updated.tavernHelperScripts) useTavernHelperStore.getState().setPresetScripts(updated.tavernHelperScripts); }); }} style={actionBtnStyle}>编辑</button>
                  <button onClick={(e) => { e.stopPropagation(); handleExport(id); }} style={actionBtnStyle} title="ST格式导出">导出</button>
                  {id !== 'p1' && (
                    <button onClick={(e) => { e.stopPropagation();
                      const updated = { ...presets }; delete updated[id];
                      setPresets(updated); savePresets(updated);
                      if (selectedId === id) {
                        setSelectedId('p1');
                        localStorage.setItem('coc_last_preset', 'p1');
                        useRegexStore.setState({ presetScripts: [] });
                        useTavernHelperStore.getState().setPresetScripts([]);
                      }
                    }} style={{ ...actionBtnStyle, color: 'var(--blood)' }}>删除</button>
                  )}
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
          导入 ST 预设
        </button>

        <button onClick={() => {
          const newId = `preset-${Date.now()}`;
          const newPreset: ChatPreset = {
            ...DEFAULT_PRESETS.p1,
            id: newId,
            name: '新建预设',
          };
          const updated = { ...presets, [newId]: newPreset };
          setPresets(updated);
          savePresets(updated);
          setSelectedId(newId);
          localStorage.setItem('coc_last_preset', newId);
          useRegexStore.setState({ presetScripts: [] });
          useTavernHelperStore.getState().setPresetScripts([]);
        }} style={{
          width: '100%', marginTop: 16, padding: '10px 0',
          border: '1px dashed var(--brass)', borderRadius: 4,
          background: 'transparent', color: 'var(--ink-subtle)',
          fontFamily: 'var(--font-ui)', fontSize: 12, letterSpacing: 3, cursor: 'pointer',
        }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; e.currentTarget.style.color = 'var(--ink-subtle)'; }}
        >
          + 新建预设
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

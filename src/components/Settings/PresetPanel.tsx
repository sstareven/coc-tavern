import { useState, useRef } from 'react';
import { useChatStore } from '../../stores/useChatStore';
import { useRegexStore } from '../../stores/useRegexStore';
import { useTavernHelperStore } from '../../stores/useTavernHelperStore';
import { exportPresetToST, importPresetFromST } from '../../sillytavern/format-converter';
import { DEFAULT_PRESETS, BUILTIN_PRESET_IDS } from '../../constants/presets';
import type { ChatPreset } from '../../types';
import { closeBtnStyle } from '../../styles/panelStyles';

interface Props {
  onClose: () => void;
  onEditPreset: (preset: ChatPreset, onSave: (p: ChatPreset) => void) => void;
}

const PRESET_STORAGE_KEY = 'coc_presets_v1';
const PRESET_MIGRATION_KEY = 'coc_presets_migrated_v2';

function loadPresets(): Record<string, ChatPreset> {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PRESETS };
    const saved = JSON.parse(raw) as Record<string, ChatPreset>;
    const merged = { ...DEFAULT_PRESETS, ...saved };

    // One-time migration: backfill promptItems for builtin presets that were saved before promptItems existed
    if (!localStorage.getItem(PRESET_MIGRATION_KEY)) {
      for (const id of BUILTIN_PRESET_IDS) {
        if (saved[id] && (!saved[id].promptItems || saved[id].promptItems.length === 0)) {
          merged[id] = { ...merged[id], promptItems: DEFAULT_PRESETS[id].promptItems };
        }
      }
      localStorage.setItem(PRESET_MIGRATION_KEY, '1');
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(
        Object.fromEntries(Object.entries(merged).filter(([k]) => {
          const builtin = DEFAULT_PRESETS[k];
          return !builtin || JSON.stringify(merged[k]) !== JSON.stringify(builtin);
        }))
      ));
    }

    return merged;
  } catch { return { ...DEFAULT_PRESETS }; }
}
function savePresets(p: Record<string, ChatPreset>) {
  const toSave: Record<string, ChatPreset> = {};
  for (const [k, v] of Object.entries(p)) {
    const builtin = DEFAULT_PRESETS[k];
    if (!builtin || JSON.stringify(v) !== JSON.stringify(builtin)) {
      toSave[k] = v;
    }
  }
  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(toSave));
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
    return localStorage.getItem('coc_last_preset') || 'p2';
  });
  const setPreset = useChatStore((s) => s.setPreset);
  const fileRef = useRef<HTMLInputElement>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleRename = (id: string) => {
    if (!renameValue.trim() || BUILTIN_PRESET_IDS.has(id)) { setRenamingId(null); return; }
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
        const uid = Math.random().toString(36).slice(2, 6).toUpperCase();
        const finalPreset = {
          ...preset,
          name: preset.name ? `${preset.name} #${uid}` : `导入预设 #${uid}`,
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
                    <span style={{ fontSize: 14, color: isActive ? 'var(--gold)' : 'var(--text-light)', fontFamily: 'var(--font-display)', letterSpacing: 2, cursor: BUILTIN_PRESET_IDS.has(id) ? 'default' : 'pointer' }}
                      onClick={(e) => { if (BUILTIN_PRESET_IDS.has(id)) return; e.stopPropagation(); setRenamingId(id); setRenameValue(preset.name); }}
                      title="点击重命名">
                      {preset.name}
                      {isActive && <span style={{ fontSize: 10, color: 'var(--success)', marginLeft: 8 }}>当前</span>}
                    </span>
                  )}
                  <span style={{ fontSize: 10, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)' }}>
                    T={preset.temperature} · P={preset.topP} · max={preset.maxTokens}
                    {!BUILTIN_PRESET_IDS.has(id) && <span style={{ marginLeft: 6, fontSize: 8, color: 'var(--ink-faded)', fontFamily: 'var(--font-mono)' }}>{id.slice(-8)}</span>}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={(e) => { e.stopPropagation(); onEditPreset(preset, (updated) => { const next = { ...presets, [updated.id]: updated }; setPresets(next); savePresets(next); if (activeSessionId) setPreset(updated.id); if (updated.regexScripts) useRegexStore.setState({ presetScripts: updated.regexScripts }); if (updated.tavernHelperScripts) useTavernHelperStore.getState().setPresetScripts(updated.tavernHelperScripts); }); }} style={actionBtnStyle}>编辑</button>
                  <button onClick={(e) => { e.stopPropagation(); handleExport(id); }} style={actionBtnStyle} title="ST格式导出">导出</button>
                  {!BUILTIN_PRESET_IDS.has(id) && (
                    <button onClick={(e) => { e.stopPropagation();
                      const updated = { ...presets }; delete updated[id];
                      setPresets(updated); savePresets(updated);
                      if (selectedId === id) {
                        setSelectedId('p2');
                        localStorage.setItem('coc_last_preset', 'p2');
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
          const uid = Math.random().toString(36).slice(2, 6).toUpperCase();
          const newId = `preset-${Date.now()}`;
          const newPreset: ChatPreset = {
            ...DEFAULT_PRESETS.p2,
            id: newId,
            name: `新建预设 #${uid}`,
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

const actionBtnStyle: React.CSSProperties = {
  padding: '5px 14px', border: '1px solid rgba(196,168,85,0.2)',
  borderRadius: 3, background: 'transparent', color: 'var(--ink-subtle)',
  fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 1, cursor: 'pointer',
};

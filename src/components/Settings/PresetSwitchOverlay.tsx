import { useEffect, useMemo, useState } from 'react';
import { usePanelStore } from '../../stores/usePanelStore';
import { useChatStore } from '../../stores/useChatStore';
import { kvGet, kvSet } from '../../db/kv';
import { DEFAULT_PRESETS } from '../../constants/presets';
import { FUSION_PRESET_ID, FUSION_DS_ID, FUSION_XY_ID, FUSION_DS_NAME, FUSION_XY_NAME, buildFusionPreset } from '../../sillytavern/fusion-preset';
import { FUSION_MENU, type FusionOption } from '../../sillytavern/fusion-menu';
import type { ChatPreset, PromptItem } from '../../types';

const PRESET_KEY = 'coc_presets_v1';
const LAST_PRESET_KEY = 'coc_last_preset';
const COLLAPSE_KEY = 'coc_fusion_collapsed';

const origId = (id: string) => id.replace(/^(pi_|lib_)/, '');
void FUSION_PRESET_ID;

// 核心驱动模型栏：切换最适配该模型的预设（DeepSeek→DS专用版；哈基米/克/GLM→向斜阳版并开对应思维链）。
const CHAIN_IDS = ['95e1424e', '197ddde7', '5fa21984']; // Gemini / GLM / Claude 思维链（向斜阳版）
const PRESET_BAR: { label: string; presetId: string; chain: string | null }[] = [
  { label: 'DeepSeek🐳', presetId: FUSION_DS_ID, chain: null },
  { label: '哈基米', presetId: FUSION_XY_ID, chain: '95e1424e' },
  { label: '克(Claude)', presetId: FUSION_XY_ID, chain: '5fa21984' },
  { label: 'GLM', presetId: FUSION_XY_ID, chain: '197ddde7' },
];

function loadCollapsed(): Set<string> | null {
  const raw = kvGet(COLLAPSE_KEY);
  if (!raw) return null;
  try { return new Set(JSON.parse(raw) as string[]); } catch { return null; }
}
function saveCollapsed(s: Set<string>): void { kvSet(COLLAPSE_KEY, JSON.stringify([...s])); }

function resolveActivePreset(): { id: string; preset: ChatPreset } | null {
  const cs = useChatStore.getState();
  const sessionPid = cs.sessions.find((s) => s.id === cs.activeId)?.presetId;
  const id = sessionPid || kvGet(LAST_PRESET_KEY) || FUSION_PRESET_ID;
  let saved: Record<string, ChatPreset> = {};
  try { saved = JSON.parse(kvGet(PRESET_KEY) || '{}') as Record<string, ChatPreset>; } catch { saved = {}; }
  const builtin = DEFAULT_PRESETS[id];
  const preset = saved[id] ? { ...(builtin || {}), ...saved[id] } as ChatPreset : (builtin || saved[FUSION_PRESET_ID]);
  if (!preset) return null;
  return { id: saved[id] ? id : (builtin ? id : FUSION_PRESET_ID), preset };
}

function persistEnabled(id: string, items: PromptItem[]): void {
  let saved: Record<string, ChatPreset> = {};
  try { saved = JSON.parse(kvGet(PRESET_KEY) || '{}') as Record<string, ChatPreset>; } catch { saved = {}; }
  const base = saved[id] || DEFAULT_PRESETS[id];
  if (!base) return;
  saved[id] = { ...base, promptItems: items };
  kvSet(PRESET_KEY, JSON.stringify(saved));
}

export function PresetSwitchOverlay() {
  const open = usePanelStore((s) => s.openPanel === 'presetSwitch');
  const closeAll = usePanelStore((s) => s.closeAll);

  const [presetId, setPresetId] = useState('');
  const [presetName, setPresetName] = useState('');
  const [items, setItems] = useState<PromptItem[]>([]);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    const r = resolveActivePreset();
    if (!r) { setItems([]); setPresetName('（无可用预设）'); return; }
    setPresetId(r.id);
    setPresetName(r.preset.name);
    setItems(r.preset.promptItems || []);
    setSearch('');
    const remembered = loadCollapsed();
    setCollapsed(remembered ?? new Set(FUSION_MENU.map((g) => g.title))); // 默认全折叠
  }, [open]);

  const itemByOrig = useMemo(() => {
    const m = new Map<string, PromptItem>();
    for (const it of items) m.set(origId(it.id), it);
    return m;
  }, [items]);

  const isOn = (id: string) => { const it = itemByOrig.get(id); return !!it && it.enabled !== false; };
  const exists = (id: string) => itemByOrig.has(id);

  const setEnabledByOrig = (origIds: Set<string>, decide: (oid: string) => boolean) => {
    setItems((prev) => {
      const next = prev.map((it) => (origIds.has(origId(it.id)) ? { ...it, enabled: decide(origId(it.id)) } : it));
      persistEnabled(presetId, next);
      return next;
    });
  };
  const toggleOpt = (id: string) => setEnabledByOrig(new Set([id]), () => !isOn(id));
  const selectInSub = (subOptIds: string[], id: string) => setEnabledByOrig(new Set(subOptIds), (oid) => oid === id);

  // 切换核心驱动模型 = 切到最适配该模型的预设（并在向斜阳版里开对应思维链、关其他思维链）。
  const switchPreset = async (targetPresetId: string, chain: string | null) => {
    // 确保目标预设已在存储——seed 未跑/失败时现场按需种入，避免 resolveActivePreset 回退导致「无反应」。
    let saved: Record<string, ChatPreset> = {};
    try { saved = JSON.parse(kvGet(PRESET_KEY) || '{}') as Record<string, ChatPreset>; } catch { saved = {}; }
    if (!saved[targetPresetId]) {
      const file = targetPresetId === FUSION_DS_ID ? 'shuangren-ds.json' : 'shuangren-v6.json';
      const name = targetPresetId === FUSION_DS_ID ? FUSION_DS_NAME : FUSION_XY_NAME;
      try {
        const resp = await fetch((import.meta.env.BASE_URL || '/') + 'presets/' + file);
        if (resp.ok) {
          const p = buildFusionPreset(await resp.text(), targetPresetId, name);
          if (p) { saved[targetPresetId] = p; kvSet(PRESET_KEY, JSON.stringify(saved)); }
        }
      } catch { /* 拉取失败则尽力而为 */ }
    }
    const cs = useChatStore.getState();
    if (cs.activeId) cs.setPreset(targetPresetId);
    kvSet(LAST_PRESET_KEY, targetPresetId);
    const r = resolveActivePreset();
    if (!r) return;
    setPresetId(r.id);
    setPresetName(r.preset.name);
    let next = r.preset.promptItems || [];
    if (chain) {
      next = next.map((it) => (CHAIN_IDS.includes(origId(it.id)) ? { ...it, enabled: origId(it.id) === chain } : it));
      persistEnabled(r.id, next);
    }
    setItems(next);
    setCollapsed(loadCollapsed() ?? new Set(FUSION_MENU.map((g) => g.title)));
  };

  if (!open) return null;

  const q = search.trim().toLowerCase();
  const match = (o: FusionOption) => exists(o.id) && (!q || o.name.toLowerCase().includes(q));

  // 非模型组，按搜索过滤后保留有内容的子块/组。
  const visibleGroups = FUSION_MENU
    .filter((g) => !g.isModel)
    .map((g) => ({ g, subs: g.subs.map((s) => ({ s, opts: s.options.filter(match) })).filter((x) => x.opts.length > 0) }))
    .filter((x) => x.subs.length > 0);

  const allOpts = FUSION_MENU.flatMap((g) => g.subs).flatMap((s) => s.options);
  const totalOn = allOpts.filter((o) => isOn(o.id)).length;
  const totalExist = allOpts.filter((o) => exists(o.id)).length;

  const pill = (opt: FusionOption, onClick: () => void, on: boolean) => (
    <button key={opt.id} onClick={onClick} aria-pressed={on} title={opt.name}
      style={{
        fontSize: 11, padding: '4px 10px', borderRadius: 12, cursor: 'pointer',
        maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        border: '1px solid ' + (on ? 'var(--gold)' : 'rgba(196,168,85,0.22)'),
        background: on ? 'rgba(196,168,85,0.28)' : 'rgba(0,0,0,0.22)',
        color: on ? 'var(--gold)' : 'var(--ink-subtle)',
        fontFamily: 'var(--font-body)', transition: 'var(--transition-smooth)',
      }}
      onMouseEnter={(ev) => { ev.currentTarget.style.filter = 'brightness(1.25)'; }}
      onMouseLeave={(ev) => { ev.currentTarget.style.filter = 'brightness(1)'; }}
    >{opt.name}</button>
  );

  return (
    <div onClick={closeAll} style={{
      position: 'fixed', inset: 0, zIndex: 1500, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 'min(560px, 92vw)', maxHeight: '86vh', display: 'flex', flexDirection: 'column',
        background: 'radial-gradient(ellipse at top, #1d160e 0%, var(--void) 95%)',
        border: '1px solid var(--gold)', borderRadius: 8,
        boxShadow: '0 18px 60px rgba(0,0,0,0.6)', fontFamily: 'var(--font-ui)',
      }}>
        {/* 头部 */}
        <div style={{ padding: '16px 18px 10px', borderBottom: '1px solid rgba(196,168,85,0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <div style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)', fontSize: 16, letterSpacing: 2 }}>双人成行</div>
              <div style={{ color: 'var(--ink-subtle)', fontSize: 10.5, marginTop: 3 }}>{presetName} · 已开 {totalOn}/{totalExist}</div>
            </div>
            <button onClick={closeAll} aria-label="关闭" style={{
              background: 'transparent', border: '1px solid var(--brass)', color: 'var(--gold)',
              borderRadius: 4, width: 30, height: 30, fontSize: 15, cursor: 'pointer', lineHeight: 1,
            }}>✕</button>
          </div>

          {/* 核心驱动模型栏：切到最适配该模型的预设 */}
          {!q && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10.5, color: 'var(--ink-subtle)', marginBottom: 5 }}>核心驱动模型 · 切到该模型最适配的预设</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PRESET_BAR.map((m) => {
                  const on = m.chain ? (presetId === FUSION_XY_ID && isOn(m.chain)) : (presetId === FUSION_DS_ID);
                  return (
                    <button key={m.label} onClick={() => void switchPreset(m.presetId, m.chain)} aria-pressed={on}
                      style={{
                        fontSize: 11, padding: '5px 12px', borderRadius: 14, cursor: 'pointer',
                        border: '1px solid ' + (on ? 'var(--gold)' : 'rgba(196,168,85,0.22)'),
                        background: on ? 'rgba(196,168,85,0.3)' : 'rgba(0,0,0,0.22)',
                        color: on ? 'var(--gold)' : 'var(--ink-subtle)',
                        fontFamily: 'var(--font-body)', transition: 'var(--transition-smooth)',
                      }}
                      onMouseEnter={(ev) => { ev.currentTarget.style.filter = 'brightness(1.25)'; }}
                      onMouseLeave={(ev) => { ev.currentTarget.style.filter = 'brightness(1)'; }}
                    >{m.label}</button>
                  );
                })}
              </div>
            </div>
          )}

          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索功能…"
            style={{
              marginTop: 10, width: '100%', boxSizing: 'border-box', padding: '7px 10px',
              background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(196,168,85,0.25)', borderRadius: 4,
              color: 'var(--parchment)', fontSize: 12, fontFamily: 'var(--font-body)', outline: 'none',
            }}
          />
        </div>

        {/* 菜单 */}
        <div style={{ overflowY: 'auto', padding: '8px 12px 14px' }}>
          {visibleGroups.length === 0 && (
            <div style={{ color: 'var(--ink-subtle)', fontSize: 12, textAlign: 'center', padding: 24 }}>无匹配项</div>
          )}
          {visibleGroups.map(({ g, subs }) => {
            const isCollapsed = !q && collapsed.has(g.title);
            const onCount = subs.flatMap((x) => x.opts).filter((o) => isOn(o.id)).length;
            const total = subs.flatMap((x) => x.opts).length;
            return (
              <div key={g.title} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => { if (q) return; setCollapsed((prev) => { const n = new Set(prev); n.has(g.title) ? n.delete(g.title) : n.add(g.title); saveCollapsed(n); return n; }); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: q ? 'default' : 'pointer',
                    padding: '7px 8px', marginTop: 8, color: 'var(--gold)', fontSize: 12, letterSpacing: 1,
                    background: 'rgba(196,168,85,0.06)', borderRadius: 4, userSelect: 'none',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 9.5, color: 'var(--ink-subtle)' }}>{onCount}/{total}</span>
                    {!q && <span style={{ fontSize: 10, transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)', transform: isCollapsed ? 'rotate(-90deg)' : 'none' }}>▼</span>}
                  </span>
                </div>
                {!isCollapsed && (
                  <div style={{ padding: '2px 4px 4px' }}>
                    {g.desc && <div style={{ fontSize: 10, color: 'var(--ink-subtle)', lineHeight: 1.6, margin: '4px 2px 8px', fontFamily: 'var(--font-body)' }}>{g.desc}</div>}
                    {subs.map(({ s, opts }, si) => (
                      <div key={si} style={{ marginBottom: 8 }}>
                        {s.title && (
                          <div style={{ fontSize: 10.5, color: 'var(--brass)', margin: '2px 2px 5px', fontFamily: 'var(--font-body)' }}>
                            {s.title}{s.single && <span style={{ fontSize: 9, marginLeft: 5 }}>（单选）</span>}
                          </div>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {opts.map((o) => pill(o, s.single ? () => selectInSub(s.options.map((x) => x.id), o.id) : () => toggleOpt(o.id), isOn(o.id)))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(196,168,85,0.12)', color: 'var(--ink-subtle)', fontSize: 10, fontFamily: 'var(--font-body)' }}>
          开关即时生效并保存，下一回合起作用。单选项互斥。
        </div>
      </div>
    </div>
  );
}

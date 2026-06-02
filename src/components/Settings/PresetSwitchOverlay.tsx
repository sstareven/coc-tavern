import { useEffect, useMemo, useState } from 'react';
import { usePanelStore } from '../../stores/usePanelStore';
import { useChatStore } from '../../stores/useChatStore';
import { kvGet, kvSet } from '../../db/kv';
import { DEFAULT_PRESETS } from '../../constants/presets';
import { FUSION_PRESET_ID } from '../../sillytavern/fusion-preset';
import { FUSION_MENU } from '../../sillytavern/fusion-menu';
import type { ChatPreset, PromptItem } from '../../types';

const PRESET_KEY = 'coc_presets_v1';
const LAST_PRESET_KEY = 'coc_last_preset';
const COLLAPSE_KEY = 'coc_fusion_collapsed'; // 折叠/展开记忆（按组标题）

/** importPresetFromST 给自定义条目加 pi_/lib_ 前缀；还原回双人成行原 identifier。 */
const origId = (id: string) => id.replace(/^(pi_|lib_)/, '');

const MODEL_GROUP = FUSION_MENU.find((g) => g.isModel);

function loadCollapsed(): Set<string> | null {
  const raw = kvGet(COLLAPSE_KEY);
  if (!raw) return null;
  try { return new Set(JSON.parse(raw) as string[]); } catch { return null; }
}
function saveCollapsed(s: Set<string>): void { kvSet(COLLAPSE_KEY, JSON.stringify([...s])); }

/** 当前会话正在使用的预设（与 useChatPipeline 取预设逻辑一致）。 */
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
    // 默认全部折叠；若有持久化记忆则恢复。
    const remembered = loadCollapsed();
    setCollapsed(remembered ?? new Set(FUSION_MENU.map((g) => g.title)));
  }, [open]);

  // 双人成行原 identifier → 当前预设条目（提供 enabled 状态）。
  const itemByOrig = useMemo(() => {
    const m = new Map<string, PromptItem>();
    for (const it of items) m.set(origId(it.id), it);
    return m;
  }, [items]);

  const isOn = (optId: string) => { const it = itemByOrig.get(optId); return !!it && it.enabled !== false; };
  const exists = (optId: string) => itemByOrig.has(optId);

  // 按 双人成行原 id 集合批量设置 enabled。
  const setEnabledByOrig = (origIds: Set<string>, decide: (oid: string) => boolean) => {
    setItems((prev) => {
      const next = prev.map((it) => (origIds.has(origId(it.id)) ? { ...it, enabled: decide(origId(it.id)) } : it));
      persistEnabled(presetId, next);
      return next;
    });
  };
  const toggleOpt = (optId: string) => setEnabledByOrig(new Set([optId]), () => !isOn(optId));
  const selectInGroup = (optIds: string[], optId: string) => setEnabledByOrig(new Set(optIds), (oid) => oid === optId);
  const toggleGroupAll = (optIds: string[]) => {
    const present = optIds.filter(exists);
    const allOn = present.every(isOn);
    setEnabledByOrig(new Set(present), () => !allOn);
  };

  // 顶部模型栏（模型组的存在选项）。
  const modelOptions = useMemo(
    () => (MODEL_GROUP?.options ?? []).filter((o) => exists(o.id)),
    [items],
  );

  if (!open) return null;

  const q = search.trim().toLowerCase();
  // 非模型组（模型组提到顶部），按搜索过滤选项。
  const visibleGroups = FUSION_MENU
    .filter((g) => !g.isModel)
    .map((g) => ({ g, opts: g.options.filter((o) => exists(o.id) && (!q || o.name.toLowerCase().includes(q))) }))
    .filter((x) => x.opts.length > 0);

  const totalOn = FUSION_MENU.flatMap((g) => g.options).filter((o) => isOn(o.id)).length;
  const totalExist = FUSION_MENU.flatMap((g) => g.options).filter((o) => exists(o.id)).length;

  const pill = (opt: { id: string; name: string }, onClick: () => void, on: boolean) => (
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

          {/* 模型栏（单选） */}
          {MODEL_GROUP && modelOptions.length > 0 && !q && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <span style={{ fontSize: 10.5, color: 'var(--ink-subtle)', flexShrink: 0 }}>模型</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {modelOptions.map((o) => pill(o, () => selectInGroup(MODEL_GROUP.options.map((x) => x.id), o.id), isOn(o.id)))}
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

        {/* 菜单（双人成行固定结构） */}
        <div style={{ overflowY: 'auto', padding: '8px 12px 14px' }}>
          {visibleGroups.length === 0 && (
            <div style={{ color: 'var(--ink-subtle)', fontSize: 12, textAlign: 'center', padding: 24 }}>无匹配项</div>
          )}
          {visibleGroups.map(({ g, opts }) => {
            const ids = g.options.map((o) => o.id);
            const isCollapsed = !q && collapsed.has(g.title);
            const onCount = opts.filter((o) => isOn(o.id)).length;
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
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {g.title}{g.single && <span style={{ fontSize: 9, color: 'var(--brass)', marginLeft: 6 }}>单选</span>}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 9.5, color: 'var(--ink-subtle)' }}>{onCount}/{opts.length}</span>
                    {!g.single && (
                      <button onClick={(e) => { e.stopPropagation(); toggleGroupAll(ids); }}
                        style={{
                          fontSize: 10, padding: '3px 9px', borderRadius: 3, cursor: 'pointer',
                          border: '1px solid var(--brass)', background: 'rgba(196,168,85,0.08)', color: 'var(--gold)',
                          fontFamily: 'var(--font-ui)', letterSpacing: 1, transition: 'var(--transition-smooth)',
                        }}
                        onMouseEnter={(ev) => { ev.currentTarget.style.background = 'rgba(196,168,85,0.2)'; }}
                        onMouseLeave={(ev) => { ev.currentTarget.style.background = 'rgba(196,168,85,0.08)'; }}
                      >{opts.every((o) => isOn(o.id)) ? '全关' : '全开'}</button>
                    )}
                    {!q && <span style={{ fontSize: 10, transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)', transform: isCollapsed ? 'rotate(-90deg)' : 'none' }}>▼</span>}
                  </span>
                </div>
                {!isCollapsed && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 2px 4px' }}>
                    {opts.map((o) => pill(
                      o,
                      g.single ? () => selectInGroup(ids, o.id) : () => toggleOpt(o.id),
                      isOn(o.id),
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(196,168,85,0.12)', color: 'var(--ink-subtle)', fontSize: 10, fontFamily: 'var(--font-body)' }}>
          开关即时生效并保存，下一回合起作用。模型/单选组互斥。
        </div>
      </div>
    </div>
  );
}

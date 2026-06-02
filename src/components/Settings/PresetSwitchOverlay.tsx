import { useEffect, useMemo, useState } from 'react';
import { usePanelStore } from '../../stores/usePanelStore';
import { useChatStore } from '../../stores/useChatStore';
import { kvGet, kvSet } from '../../db/kv';
import { DEFAULT_PRESETS } from '../../constants/presets';
import { FUSION_PRESET_ID } from '../../sillytavern/fusion-preset';
import { FUSION_GROUPS } from '../../sillytavern/fusion-groups';
import type { ChatPreset, PromptItem } from '../../types';

const PRESET_KEY = 'coc_presets_v1';
const LAST_PRESET_KEY = 'coc_last_preset';
const COLLAPSE_KEY = 'coc_fusion_collapsed'; // 折叠/展开记忆（按组标题）
const SEP_RE = /^[\s]*[🔽⬇️⤵️▼]/u; // 分组分隔符前缀

/** 读取持久化的折叠记忆（折叠组标题集）；无记忆返回 null（首次默认全折叠）。 */
function loadCollapsed(): Set<string> | null {
  const raw = kvGet(COLLAPSE_KEY);
  if (!raw) return null;
  try { return new Set(JSON.parse(raw) as string[]); } catch { return null; }
}
function saveCollapsed(s: Set<string>): void {
  kvSet(COLLAPSE_KEY, JSON.stringify([...s]));
}

/** importPresetFromST 给自定义条目加 pi_/lib_ 前缀；还原回双人成行原 identifier 以匹配 fusion-groups。 */
const origId = (id: string) => id.replace(/^(pi_|lib_)/, '');

// 模型组（顶部模型栏）与单选组（radio）的元数据。
const MODEL_GROUP = FUSION_GROUPS.find((g) => g.isModelGroup);
const MODEL_MEMBERS = MODEL_GROUP?.members ?? [];
const MODEL_MEMBER_IDS = new Set(MODEL_MEMBERS.map((m) => m.id));
const SINGLE_SELECT_TITLES = new Set(FUSION_GROUPS.filter((g) => g.isSingleSelect).map((g) => g.title));
// 顶部模型 label 美化。
const MODEL_LABEL: Record<string, string> = { Gemini: '哈基米', 'DeepSeek鲸鱼': 'DeepSeek🐳', Claude: 'Claude' };

/** 解析当前会话正在使用的预设（与 useChatPipeline 取预设逻辑一致）。 */
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

/** 把开关状态写回预设存储。不触碰任何会话/存档表。 */
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
    const sorted = [...(r.preset.promptItems || [])].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
    setItems(sorted);
    setSearch('');
    // 默认全部折叠；若有持久化的折叠/展开记忆则恢复。
    const sepTitles = sorted.filter((p) => SEP_RE.test(p.name) && !(p.content || '').trim()).map((p) => p.name);
    const remembered = loadCollapsed();
    setCollapsed(remembered ?? new Set(sepTitles));
  }, [open]);

  const toggle = (itemId: string) => {
    setItems((prev) => {
      const next = prev.map((p) => (p.id === itemId ? { ...p, enabled: p.enabled === false } : p));
      persistEnabled(presetId, next);
      return next;
    });
  };

  // 整组全开/全关（多选组）。
  const toggleGroup = (groupItems: PromptItem[]) => {
    const ids = new Set(groupItems.map((p) => p.id));
    const allOn = groupItems.every((p) => p.enabled !== false);
    setItems((prev) => {
      const next = prev.map((p) => (ids.has(p.id) ? { ...p, enabled: !allOn } : p));
      persistEnabled(presetId, next);
      return next;
    });
  };

  // 单选：开 selectId，关同组其他（用于 radio 单选组与模型栏）。
  const selectOne = (groupItemIds: Set<string>, selectId: string) => {
    setItems((prev) => {
      const next = prev.map((p) => (groupItemIds.has(p.id) ? { ...p, enabled: p.id === selectId } : p));
      persistEnabled(presetId, next);
      return next;
    });
  };

  // 模型栏：在所有 model-member 条目里单选一个。
  const selectModel = (memberOrig: string) => {
    setItems((prev) => {
      const next = prev.map((p) => (MODEL_MEMBER_IDS.has(origId(p.id)) ? { ...p, enabled: origId(p.id) === memberOrig } : p));
      persistEnabled(presetId, next);
      return next;
    });
  };

  // 当前模型栏的条目（按 fusion 模型组成员顺序）。
  const modelBar = useMemo(() => MODEL_MEMBERS.map((m) => {
    const it = items.find((p) => origId(p.id) === m.id);
    return it ? { item: it, label: MODEL_LABEL[m.label] ?? m.label, orig: m.id } : null;
  }).filter(Boolean) as { item: PromptItem; label: string; orig: string }[], [items]);

  // 分组：分隔符条目作为组标题。搜索时平铺。模型组在列表里跳过（已提到顶部模型栏）。
  const groups = useMemo(() => {
    const q = search.trim();
    if (q) {
      const filtered = items.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
      return [{ title: '', key: '__flat__', sep: null as PromptItem | null, single: false, items: filtered }];
    }
    const out: { title: string; key: string; sep: PromptItem | null; single: boolean; items: PromptItem[] }[] = [];
    let cur = { title: '未分组', key: '__top__', sep: null as PromptItem | null, single: false, items: [] as PromptItem[] };
    out.push(cur);
    for (const p of items) {
      const isSep = SEP_RE.test(p.name) && !(p.content || '').trim();
      if (isSep) {
        cur = { title: p.name, key: p.id, sep: p, single: SINGLE_SELECT_TITLES.has(p.name), items: [] };
        out.push(cur);
      } else {
        cur.items.push(p);
      }
    }
    // 跳过模型组（顶部已展示）与空组。
    return out.filter((g) => g.items.length > 0 && g.title !== MODEL_GROUP?.title);
  }, [items, search]);

  if (!open) return null;

  const enabledCount = items.filter((p) => p.enabled !== false).length;

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
              <div style={{ color: 'var(--ink-subtle)', fontSize: 10.5, marginTop: 3 }}>
                {presetName} · 已开 {enabledCount}/{items.length}
              </div>
            </div>
            <button onClick={closeAll} aria-label="关闭" style={{
              background: 'transparent', border: '1px solid var(--brass)', color: 'var(--gold)',
              borderRadius: 4, width: 30, height: 30, fontSize: 15, cursor: 'pointer', lineHeight: 1,
            }}>✕</button>
          </div>

          {/* 模型栏（单选） */}
          {modelBar.length > 0 && !search.trim() && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <span style={{ fontSize: 10.5, color: 'var(--ink-subtle)', flexShrink: 0 }}>模型</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {modelBar.map(({ item, label, orig }) => {
                  const on = item.enabled !== false;
                  return (
                    <button key={item.id} onClick={() => selectModel(orig)}
                      style={{
                        fontSize: 11, padding: '5px 12px', borderRadius: 14, cursor: 'pointer',
                        border: '1px solid ' + (on ? 'var(--gold)' : 'var(--brass)'),
                        background: on ? 'rgba(196,168,85,0.28)' : 'rgba(0,0,0,0.25)',
                        color: on ? 'var(--gold)' : 'var(--ink-subtle)',
                        fontFamily: 'var(--font-ui)', letterSpacing: 1, transition: 'var(--transition-smooth)',
                      }}
                    >{label}</button>
                  );
                })}
              </div>
            </div>
          )}

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索功能…"
            style={{
              marginTop: 10, width: '100%', boxSizing: 'border-box', padding: '7px 10px',
              background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(196,168,85,0.25)', borderRadius: 4,
              color: 'var(--parchment)', fontSize: 12, fontFamily: 'var(--font-body)', outline: 'none',
            }}
          />
        </div>

        {/* 列表 */}
        <div style={{ overflowY: 'auto', padding: '8px 12px 14px' }}>
          {items.length === 0 && (
            <div style={{ color: 'var(--ink-subtle)', fontSize: 12, textAlign: 'center', padding: 24 }}>没有可切换的功能条目</div>
          )}
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.title);
            const groupIds = new Set(g.items.map((p) => p.id));
            return (
              <div key={g.key} style={{ marginBottom: 6 }}>
                {g.sep && (
                  <div
                    onClick={() => setCollapsed((prev) => { const n = new Set(prev); n.has(g.title) ? n.delete(g.title) : n.add(g.title); saveCollapsed(n); return n; })}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                      padding: '7px 8px', marginTop: 8, color: 'var(--gold)', fontSize: 12, letterSpacing: 1,
                      background: 'rgba(196,168,85,0.06)', borderRadius: 4, userSelect: 'none',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.title}{g.single && <span style={{ fontSize: 9, color: 'var(--brass)', marginLeft: 6 }}>单选</span>}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 9.5, color: 'var(--ink-subtle)' }}>{g.items.filter((p) => p.enabled !== false).length}/{g.items.length}</span>
                      {!g.single && (
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleGroup(g.items); }}
                          style={{
                            fontSize: 10, padding: '3px 9px', borderRadius: 3, cursor: 'pointer',
                            border: '1px solid var(--brass)', background: 'rgba(196,168,85,0.08)', color: 'var(--gold)',
                            fontFamily: 'var(--font-ui)', letterSpacing: 1, transition: 'var(--transition-smooth)',
                          }}
                          onMouseEnter={(ev) => { ev.currentTarget.style.background = 'rgba(196,168,85,0.2)'; ev.currentTarget.style.borderColor = 'var(--gold)'; }}
                          onMouseLeave={(ev) => { ev.currentTarget.style.background = 'rgba(196,168,85,0.08)'; ev.currentTarget.style.borderColor = 'var(--brass)'; }}
                        >{g.items.every((p) => p.enabled !== false) ? '全关' : '全开'}</button>
                      )}
                      <span style={{ fontSize: 10, transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)', transform: isCollapsed ? 'rotate(-90deg)' : 'none' }}>▼</span>
                    </span>
                  </div>
                )}
                {!isCollapsed && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '4px 2px 4px' }}>
                    {g.items.map((p) => {
                      const on = p.enabled !== false;
                      const click = g.single ? () => selectOne(groupIds, p.id) : () => toggle(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={click}
                          aria-pressed={on}
                          title={p.name}
                          style={{
                            fontSize: 11, padding: '4px 10px', borderRadius: 12, cursor: 'pointer',
                            maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            border: '1px solid ' + (on ? 'var(--gold)' : 'rgba(196,168,85,0.22)'),
                            background: on ? 'rgba(196,168,85,0.28)' : 'rgba(0,0,0,0.22)',
                            color: on ? 'var(--gold)' : 'var(--ink-subtle)',
                            fontFamily: 'var(--font-body)', transition: 'var(--transition-smooth)',
                          }}
                          onMouseEnter={(ev) => { ev.currentTarget.style.filter = 'brightness(1.25)'; }}
                          onMouseLeave={(ev) => { ev.currentTarget.style.filter = 'brightness(1)'; }}
                        >
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(196,168,85,0.12)', color: 'var(--ink-subtle)', fontSize: 10, fontFamily: 'var(--font-body)' }}>
          开关即时生效并保存，下一回合起作用。模型/单选组互斥，结构项请谨慎关闭。
        </div>
      </div>
    </div>
  );
}

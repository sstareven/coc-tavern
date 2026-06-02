import { useEffect, useMemo, useState } from 'react';
import { usePanelStore } from '../../stores/usePanelStore';
import { useChatStore } from '../../stores/useChatStore';
import { kvGet, kvSet } from '../../db/kv';
import { DEFAULT_PRESETS } from '../../constants/presets';
import { FUSION_PRESET_ID } from '../../sillytavern/fusion-preset';
import type { ChatPreset, PromptItem } from '../../types';

const PRESET_KEY = 'coc_presets_v1';
const LAST_PRESET_KEY = 'coc_last_preset';
const SEP_RE = /^[\s]*[🔽⬇️⤵️▼]/u; // 分组分隔符前缀

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

/** 把开关状态写回预设存储（内置预设首次改动会落盘为副本）。不触碰任何会话/存档表。 */
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
    setItems([...(r.preset.promptItems || [])].sort((a, b) => (a.order ?? 100) - (b.order ?? 100)));
    setSearch('');
    setCollapsed(new Set());
  }, [open]);

  const toggle = (itemId: string) => {
    setItems((prev) => {
      const next = prev.map((p) => (p.id === itemId ? { ...p, enabled: p.enabled === false } : p));
      persistEnabled(presetId, next);
      return next;
    });
  };

  // 一键调整：整组全开/全关（组内有任一关则全开，否则全关）。
  const toggleGroup = (groupItems: PromptItem[]) => {
    const ids = new Set(groupItems.map((p) => p.id));
    const allOn = groupItems.every((p) => p.enabled !== false);
    setItems((prev) => {
      const next = prev.map((p) => (ids.has(p.id) ? { ...p, enabled: !allOn } : p));
      persistEnabled(presetId, next);
      return next;
    });
  };

  // 分组：分隔符条目作为组标题，其后条目归入该组。搜索时平铺、不分组。
  const groups = useMemo(() => {
    const q = search.trim();
    const filtered = q ? items.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())) : items;
    if (q) return [{ title: '', key: '__flat__', sep: null as PromptItem | null, items: filtered }];
    const out: { title: string; key: string; sep: PromptItem | null; items: PromptItem[] }[] = [];
    let cur = { title: '未分组', key: '__top__', sep: null as PromptItem | null, items: [] as PromptItem[] };
    out.push(cur);
    for (const p of items) {
      const isSep = SEP_RE.test(p.name) && !(p.content || '').trim();
      if (isSep) {
        cur = { title: p.name, key: p.id, sep: p, items: [] };
        out.push(cur);
      } else {
        cur.items.push(p);
      }
    }
    return out.filter((g) => g.items.length > 0);
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
            const isCollapsed = collapsed.has(g.key);
            return (
              <div key={g.key} style={{ marginBottom: 6 }}>
                {g.sep && (
                  <div
                    onClick={() => setCollapsed((prev) => { const n = new Set(prev); n.has(g.key) ? n.delete(g.key) : n.add(g.key); return n; })}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                      padding: '7px 8px', marginTop: 8, color: 'var(--gold)', fontSize: 12, letterSpacing: 1,
                      background: 'rgba(196,168,85,0.06)', borderRadius: 4, userSelect: 'none',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 9.5, color: 'var(--ink-subtle)' }}>{g.items.filter((p) => p.enabled !== false).length}/{g.items.length}</span>
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
                      <span style={{ fontSize: 10, transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)', transform: isCollapsed ? 'rotate(-90deg)' : 'none' }}>▼</span>
                    </span>
                  </div>
                )}
                {!isCollapsed && g.items.map((p) => {
                  const on = p.enabled !== false;
                  const isMarker = p.kind === 'marker';
                  return (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      padding: '7px 8px', borderRadius: 4,
                      borderBottom: '1px solid rgba(196,168,85,0.06)',
                    }}>
                      <span style={{
                        fontSize: 12, color: isMarker ? 'var(--ink-subtle)' : 'var(--parchment)',
                        fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                      }}>
                        {p.name}
                        {isMarker && <span style={{ fontSize: 9, color: 'var(--brass)', marginLeft: 6 }}>结构项</span>}
                      </span>
                      <button
                        onClick={() => toggle(p.id)}
                        aria-pressed={on}
                        style={{
                          flexShrink: 0, width: 42, height: 22, borderRadius: 11, cursor: 'pointer',
                          border: '1px solid ' + (on ? 'var(--gold)' : 'var(--brass)'),
                          background: on ? 'rgba(196,168,85,0.35)' : 'rgba(0,0,0,0.3)',
                          position: 'relative', transition: 'var(--transition-smooth)',
                        }}
                      >
                        <span style={{
                          position: 'absolute', top: 2, left: on ? 22 : 2, width: 16, height: 16, borderRadius: '50%',
                          background: on ? 'var(--gold)' : 'var(--ink-subtle)', transition: 'left 0.2s cubic-bezier(0.4,0,0.2,1)',
                        }} />
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(196,168,85,0.12)', color: 'var(--ink-subtle)', fontSize: 10, fontFamily: 'var(--font-body)' }}>
          开关即时生效并保存，下一回合起作用。结构项请谨慎关闭。
        </div>
      </div>
    </div>
  );
}

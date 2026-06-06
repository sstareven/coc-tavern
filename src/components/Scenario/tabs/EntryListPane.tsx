// 共享条目列表面板 — 见 docs/specs/2026-06-06-scenario-system-design.md §5.1 / §E2
// 6 类 category tab 共用; 左列表+右编辑+顶部工具栏(搜索/新增/自动分类/优化缓存);
// LLM 命令通过 props 透传给 ScenarioEditor 主控统一调用 + applyScenarioPatch。
import { useMemo, useState } from 'react';
import type {
  ScenarioCategory,
  ScenarioDoc,
  ScenarioEntry,
  ScenarioCachePolicy,
} from '../../../types/scenario';
import { applyScenarioPatch } from '../../../scenario/scenario-patch';
import {
  autoCategorize,
  decideCachePolicy,
  rewriteEntry,
  injectEjsUnlock,
} from '../../../scenario/scenario-llm';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface Props {
  category: ScenarioCategory;
  scn: ScenarioDoc;
  onChange: (next: ScenarioDoc) => void;
  onToast?: (msg: string) => void;
}

// 动态 marker 检测 — 与 scenario-llm hasDynamicMarker 同语义,本地复制避免再 export 一次
function hasDynamicMarker(content: string): boolean {
  return /(<%|getvar\(|parseInt\(|<%\s*if)/.test(content);
}

// 缓存策略灯: 绿=静态命中 / 黄=动态尾置 / 灰=默认 auto
function policyLightColor(p: ScenarioCachePolicy): string {
  if (p === 'static_prefix') return '#7cae5a';
  if (p === 'dynamic_suffix') return '#d4a64a';
  return '#7a7062';
}
function policyLightLabel(p: ScenarioCachePolicy): string {
  if (p === 'static_prefix') return '静态命中';
  if (p === 'dynamic_suffix') return '动态尾置';
  return '默认';
}

function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'ent_' + Math.random().toString(36).slice(2);
}

// 新条目骨架 — 类别带入,其余给保守默认
function makeBlankEntry(category: ScenarioCategory): ScenarioEntry {
  return {
    id: uuid(),
    category,
    comment: '新条目',
    keys: '',
    content: '',
    constant: false,
    position: 0,
    priority: 50,
    cachePolicy: 'auto',
  };
}

export function EntryListPane({ category, scn, onChange, onToast }: Props) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [rewriteText, setRewriteText] = useState('');
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockText, setUnlockText] = useState('');

  const filtered = useMemo<ScenarioEntry[]>(() => {
    const q = search.trim().toLowerCase();
    return scn.entries
      .filter((e) => e.category === category)
      .filter((e) => {
        if (!q) return true;
        return (
          e.comment.toLowerCase().includes(q) ||
          e.keys.toLowerCase().includes(q) ||
          e.content.toLowerCase().includes(q)
        );
      });
  }, [scn.entries, category, search]);

  const selected = selectedId ? scn.entries.find((e) => e.id === selectedId) ?? null : null;

  const reportError = (msg: string): void => {
    if (onToast) onToast(msg);
    else console.error('[EntryListPane]', msg);
  };

  const patchAndCommit = (entry: ScenarioEntry): void => {
    const next = applyScenarioPatch(scn, { upsertEntries: [entry] });
    onChange(next);
  };

  const handleNew = (): void => {
    const e = makeBlankEntry(category);
    patchAndCommit(e);
    setSelectedId(e.id);
  };

  const handleAutoCategorize = async (): Promise<void> => {
    if (scn.entries.length === 0) return;
    setBusy('autoCategorize');
    try {
      const r = await autoCategorize(scn.entries);
      const next = applyScenarioPatch(scn, r);
      onChange(next);
      onToast?.(`已重新分类 ${r.recategorize?.length ?? 0} 条`);
    } catch (err) {
      reportError(`自动分类失败: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const handleOptimizeCache = async (): Promise<void> => {
    if (scn.entries.length === 0) return;
    setBusy('decideCachePolicy');
    try {
      const r = await decideCachePolicy(scn.entries);
      const next = applyScenarioPatch(scn, r);
      onChange(next);
      onToast?.(`已优化 ${r.setCachePolicies?.length ?? 0} 条缓存策略`);
    } catch (err) {
      reportError(`优化失败: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const handleRewriteSubmit = async (): Promise<void> => {
    if (!selected) return;
    const instr = rewriteText.trim();
    if (!instr) return;
    setRewriteOpen(false);
    setBusy('rewriteEntry');
    try {
      const r = await rewriteEntry(selected, instr);
      const next = applyScenarioPatch(scn, r);
      onChange(next);
      setRewriteText('');
      onToast?.('已重写正文');
    } catch (err) {
      reportError(`重写失败: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const handleUnlockSubmit = async (): Promise<void> => {
    if (!selected) return;
    const keys = unlockText.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);
    setUnlockOpen(false);
    setBusy('injectEjsUnlock');
    try {
      const r = await injectEjsUnlock(selected, keys.length > 0 ? keys : undefined);
      const next = applyScenarioPatch(scn, r);
      onChange(next);
      setUnlockText('');
      onToast?.('已套解锁条件');
    } catch (err) {
      reportError(`套解锁失败: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const handleField = <K extends keyof ScenarioEntry>(key: K, val: ScenarioEntry[K]): void => {
    if (!selected) return;
    patchAndCommit({ ...selected, [key]: val });
  };

  const handleDelete = (): void => {
    if (!selected) return;
    const next = applyScenarioPatch(scn, { removeEntryIds: [selected.id] });
    onChange(next);
    setSelectedId(null);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'rgba(10,7,4,0.45)', minHeight: 0,
    }}>
      {/* 顶部工具栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px',
        borderBottom: '1px solid rgba(196,168,85,0.18)',
        flexWrap: 'wrap',
      }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索条目…"
          style={{
            flex: '1 1 160px', minWidth: 0,
            padding: '7px 10px',
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid rgba(196,168,85,0.3)',
            borderRadius: 2,
            color: 'var(--text-light, #d0c2a0)',
            fontFamily: 'var(--font-ui)', fontSize: 12,
          }}
        />
        <ToolBtn onClick={handleNew} label="新条目" busy={false} accent />
        <ToolBtn onClick={() => { void handleAutoCategorize(); }} label="自动分类" busy={busy === 'autoCategorize'} />
        <ToolBtn onClick={() => { void handleOptimizeCache(); }} label="优化缓存" busy={busy === 'decideCachePolicy'} />
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 左列表 */}
        <div style={{
          width: 260, flexShrink: 0,
          overflowY: 'auto',
          borderRight: '1px solid rgba(196,168,85,0.18)',
        }}>
          {filtered.length === 0 ? (
            <div style={{
              padding: '24px 14px', textAlign: 'center',
              color: 'var(--ink, #8a7a52)', fontSize: 12, fontFamily: 'var(--font-ui)',
            }}>暂无「{category}」条目</div>
          ) : (
            filtered.map((e) => {
              const active = e.id === selectedId;
              const dyn = hasDynamicMarker(e.content);
              return (
                <button
                  key={e.id}
                  onClick={() => setSelectedId(e.id)}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 4,
                    width: '100%', textAlign: 'left',
                    padding: '10px 12px',
                    background: active ? 'rgba(196,168,85,0.14)' : 'transparent',
                    border: 'none',
                    borderLeft: active ? '2px solid var(--brass)' : '2px solid transparent',
                    color: 'var(--text-light, #d0c2a0)',
                    fontFamily: 'var(--font-ui)',
                    cursor: 'pointer',
                    transition: `background 180ms ${EASE}, border-color 180ms ${EASE}`,
                  }}
                  onMouseEnter={(ev) => { if (!active) ev.currentTarget.style.background = 'rgba(196,168,85,0.06)'; }}
                  onMouseLeave={(ev) => { if (!active) ev.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{
                    fontSize: 13, color: active ? 'var(--gold)' : 'var(--text-light)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{e.comment || '(无标题)'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, opacity: 0.8 }}>
                    <span title={policyLightLabel(e.cachePolicy)} style={{
                      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                      background: policyLightColor(e.cachePolicy),
                    }} />
                    <span style={{ color: 'var(--ink, #8a7a52)' }}>{e.constant ? '常驻' : '触发'}</span>
                    {dyn && <span style={{ color: '#d4a64a' }}>· 动态</span>}
                    {e.hidden && <span style={{ color: '#8a7a52' }}>· 隐藏</span>}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* 右编辑 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16, minWidth: 0 }}>
          {!selected ? (
            <div style={{
              padding: '36px 12px', textAlign: 'center',
              color: 'var(--ink, #8a7a52)', fontSize: 12, fontFamily: 'var(--font-ui)',
            }}>从左侧选择条目以编辑</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <FormRow label="标题">
                <input
                  value={selected.comment}
                  onChange={(e) => handleField('comment', e.target.value)}
                  style={inputStyle}
                />
              </FormRow>
              <FormRow label="关键词">
                <input
                  value={selected.keys}
                  onChange={(e) => handleField('keys', e.target.value)}
                  placeholder="逗号分隔"
                  style={inputStyle}
                />
              </FormRow>
              <FormRow label="内容">
                <textarea
                  value={selected.content}
                  onChange={(e) => handleField('content', e.target.value)}
                  rows={6}
                  style={{
                    ...inputStyle,
                    fontFamily: 'var(--font-mono)',
                    lineHeight: 1.5,
                    resize: 'vertical',
                  }}
                />
              </FormRow>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <FormRow label="position" compact>
                  <select
                    value={selected.position}
                    onChange={(e) => handleField('position', Number(e.target.value) as 0 | 1 | 2 | 3 | 4)}
                    style={inputStyle}
                  >
                    {[0, 1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </FormRow>
                <FormRow label="priority" compact>
                  <input
                    type="number"
                    value={selected.priority}
                    onChange={(e) => handleField('priority', Number(e.target.value) || 0)}
                    style={inputStyle}
                  />
                </FormRow>
                <FormRow label="缓存策略" compact>
                  <select
                    value={selected.cachePolicy}
                    onChange={(e) => handleField('cachePolicy', e.target.value as ScenarioCachePolicy)}
                    style={inputStyle}
                  >
                    <option value="auto">默认</option>
                    <option value="static_prefix">静态前置</option>
                    <option value="dynamic_suffix">动态尾置</option>
                  </select>
                </FormRow>
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                <Toggle
                  label="常驻"
                  checked={selected.constant}
                  onChange={(v) => handleField('constant', v)}
                />
                <Toggle
                  label="隐藏"
                  checked={selected.hidden ?? false}
                  onChange={(v) => handleField('hidden', v)}
                />
              </div>

              {/* 操作行 */}
              <div style={{
                display: 'flex', gap: 8, flexWrap: 'wrap',
                marginTop: 4, paddingTop: 12,
                borderTop: '1px solid rgba(196,168,85,0.15)',
              }}>
                <ToolBtn onClick={() => setRewriteOpen(true)} label="重写文案" busy={busy === 'rewriteEntry'} />
                <ToolBtn onClick={() => setUnlockOpen(true)} label="加解锁条件" busy={busy === 'injectEjsUnlock'} />
                <div style={{ flex: 1 }} />
                <ToolBtn onClick={handleDelete} label="删除" busy={false} danger />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 重写小窗 */}
      {rewriteOpen && (
        <MiniModal
          title="重写文案"
          placeholder="例:更阴森 / 改第三人称 / 加一个 SAN check 提示"
          value={rewriteText}
          onChange={setRewriteText}
          onCancel={() => { setRewriteOpen(false); setRewriteText(''); }}
          onSubmit={() => { void handleRewriteSubmit(); }}
        />
      )}
      {unlockOpen && (
        <MiniModal
          title="加解锁条件"
          placeholder="解锁 key,留空让 LLM 自动决策。多个用逗号或空格"
          value={unlockText}
          onChange={setUnlockText}
          onCancel={() => { setUnlockOpen(false); setUnlockText(''); }}
          onSubmit={() => { void handleUnlockSubmit(); }}
        />
      )}
    </div>
  );
}

// ── 小组件 ──

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  background: 'rgba(0,0,0,0.4)',
  border: '1px solid rgba(196,168,85,0.3)',
  borderRadius: 2,
  color: 'var(--text-light, #d0c2a0)',
  fontFamily: 'var(--font-ui)', fontSize: 12,
  boxSizing: 'border-box',
};

function FormRow({ label, children, compact }: { label: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <label style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      minWidth: compact ? 110 : undefined, flex: compact ? '0 0 auto' : undefined,
    }}>
      <span style={{
        fontSize: 10.5, color: 'var(--ink, #8a7a52)', letterSpacing: 1.2,
        fontFamily: 'var(--font-ui)',
      }}>{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 12, color: 'var(--text-light)', fontFamily: 'var(--font-ui)',
      cursor: 'pointer',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: 'var(--brass)' }}
      />
      {label}
    </label>
  );
}

function ToolBtn({ onClick, label, busy, danger, accent }: {
  onClick: () => void; label: string; busy: boolean; danger?: boolean; accent?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const baseColor = danger ? '#b14a4a' : accent ? 'var(--gold)' : 'var(--text-light, #d0c2a0)';
  const border = danger ? '#b14a4a' : 'rgba(196,168,85,0.4)';
  const scale = pressed ? 0.96 : hover ? 1.04 : 1;
  return (
    <button
      onClick={onClick}
      disabled={busy}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        padding: '6px 12px',
        background: hover && !busy ? 'rgba(196,168,85,0.15)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${border}`,
        borderRadius: 2,
        color: baseColor,
        fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 1,
        cursor: busy ? 'wait' : 'pointer',
        transform: `scale(${scale})`,
        opacity: busy ? 0.6 : 1,
        transition: `transform 180ms ${EASE}, background 180ms ${EASE}, opacity 180ms ${EASE}`,
      }}
    >{busy ? '…' : label}</button>
  );
}

function MiniModal({
  title, placeholder, value, onChange, onCancel, onSubmit,
}: {
  title: string; placeholder: string;
  value: string; onChange: (v: string) => void;
  onCancel: () => void; onSubmit: () => void;
}) {
  return (
    <div
      role="dialog" aria-modal="true"
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 250,
        background: 'rgba(8,5,2,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 'min(420px, 100%)',
        maxHeight: '80dvh',
        minHeight: 0,
        overflowY: 'auto',
        background: 'linear-gradient(180deg, #1e1610, #110c07)',
        border: '1px solid var(--brass)',
        borderRadius: 4,
        boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
        padding: 18,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{
          fontSize: 13, letterSpacing: 2, color: 'var(--gold)',
          fontFamily: 'var(--font-ui)',
        }}>{title}</div>
        <textarea
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          style={{ ...inputStyle, fontFamily: 'var(--font-ui)', resize: 'vertical' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <ToolBtn onClick={onCancel} label="取消" busy={false} />
          <ToolBtn onClick={onSubmit} label="确定" busy={false} accent />
        </div>
      </div>
    </div>
  );
}

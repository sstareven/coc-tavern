// 职业 tab — 见 docs/specs/2026-06-06-scenario-section-1-design.md §5.4
// 时代化职业池编辑;双区(左 220 列表 + 右编辑);8 技能槽 grid 2x4(搜索 + 下拉);
// AI 一键生成走 scenario-llm.generateCustomOccupations,patch 直接 applyScenarioPatch 收口。
//
// 关键不变量(spec §6 / §G):
//  - 同 name 覆盖,异 name 追加(applyScenarioPatch 已实现)
//  - skills 长度严格 = 8(UI 限制不允许加/减,只允许替换槽位内容)
//  - crMin <= crMax(UI 限制并 toast 警告)
//  - 删除前 window.confirm
import { useCallback, useMemo, useRef, useState } from 'react';
import type { Occupation } from '../../../sillytavern/coc-data';
import type { ScenarioDoc } from '../../../types/scenario';
import { getScenarioSkillPool } from '../../../scenario/scenario-pools';
import { applyScenarioPatch } from '../../../scenario/scenario-patch';
import { generateCustomOccupations } from '../../../scenario/scenario-llm';
import {
  MAX_OCCUPATIONS,
  FORMULA_OPTIONS,
  makeBlankOccupation,
  normalizeSkills,
  upsertByName,
} from './OccupationsTab.helpers';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface Props {
  scn: ScenarioDoc;
  onChange: (next: ScenarioDoc) => void;
  onToast?: (msg: string) => void;
}

export function OccupationsTab({ scn, onChange, onToast }: Props) {
  const list = scn.customOccupations;
  const [selectedIdx, setSelectedIdx] = useState<number | null>(list.length > 0 ? 0 : null);
  const [busy, setBusy] = useState(false);
  // 编辑器内 8 个技能槽 — 哪一槽展开搜索下拉
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  const [slotQuery, setSlotQuery] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const selected = selectedIdx !== null && selectedIdx < list.length ? list[selectedIdx] : null;
  const selectedName = selected?.name ?? '';

  // 技能候选 — 当前剧本可见池(已剔除黑名单,合并 customSkills);仅取 name
  const skillCandidates = useMemo(
    () => getScenarioSkillPool(scn).map((s) => s.name),
    [scn],
  );

  const commitOccupations = useCallback((nextList: Occupation[]): void => {
    onChange({ ...scn, customOccupations: nextList, updatedAt: Date.now() });
  }, [scn, onChange]);

  const handleAdd = (): void => {
    if (list.length >= MAX_OCCUPATIONS) {
      onToast?.(`职业上限 ${MAX_OCCUPATIONS},无法继续新增`);
      return;
    }
    const blank = makeBlankOccupation();
    // 重名兜底:若已有"新职业",追加序号
    let name = blank.name;
    let i = 2;
    const existedNames = new Set(list.map((o) => o.name));
    while (existedNames.has(name)) { name = `新职业 ${i++}`; }
    const next = { ...blank, name };
    commitOccupations([...list, next]);
    setSelectedIdx(list.length);
  };

  const handleDelete = (): void => {
    if (!selected) return;
    const ok = typeof window !== 'undefined' && window.confirm
      ? window.confirm(`确定删除职业「${selected.name}」?`)
      : true;
    if (!ok) return;
    const nextList = list.filter((o) => o.name !== selected.name);
    commitOccupations(nextList);
    setSelectedIdx(nextList.length > 0 ? 0 : null);
  };

  const handleDuplicate = (): void => {
    if (!selected) return;
    if (list.length >= MAX_OCCUPATIONS) {
      onToast?.(`职业上限 ${MAX_OCCUPATIONS},无法复制`);
      return;
    }
    let copyName = `${selected.name} 副本`;
    let i = 2;
    const existedNames = new Set(list.map((o) => o.name));
    while (existedNames.has(copyName)) { copyName = `${selected.name} 副本 ${i++}`; }
    const dup: Occupation = {
      name: copyName,
      crMin: selected.crMin,
      crMax: selected.crMax,
      skills: [...normalizeSkills(selected.skills)],
      ...(selected.formula ? { formula: selected.formula } : {}),
    };
    commitOccupations([...list, dup]);
    setSelectedIdx(list.length);
  };

  // 任何字段变更走这里:同 name 覆盖、异 name(改名)替换
  const patchSelected = (patch: Partial<Occupation>): void => {
    if (!selected) return;
    const prevName = selected.name;
    const merged: Occupation = {
      name: patch.name !== undefined ? patch.name : selected.name,
      crMin: patch.crMin !== undefined ? patch.crMin : selected.crMin,
      crMax: patch.crMax !== undefined ? patch.crMax : selected.crMax,
      skills: patch.skills !== undefined ? normalizeSkills(patch.skills) : normalizeSkills(selected.skills),
      ...(patch.formula !== undefined ? { formula: patch.formula || undefined } : selected.formula ? { formula: selected.formula } : {}),
    };
    const nextList = upsertByName(list, merged, prevName);
    commitOccupations(nextList);
    // 新名可能改变索引;按 name 重定位
    const nextIdx = nextList.findIndex((o) => o.name === merged.name);
    if (nextIdx >= 0) setSelectedIdx(nextIdx);
  };

  const handleNameChange = (raw: string): void => {
    const name = raw.trim() || '未命名职业';
    // 检测重名(排除自己)
    if (selected && name !== selected.name && list.some((o) => o.name === name)) {
      onToast?.(`已存在同名职业「${name}」,改名时同名会被合并覆盖`);
    }
    patchSelected({ name });
  };

  const handleCrMin = (raw: number): void => {
    if (!selected) return;
    const v = Math.max(0, Math.min(99, Math.floor(raw)));
    if (v > selected.crMax) {
      onToast?.(`信用下限不能大于上限(当前上限 ${selected.crMax})`);
      patchSelected({ crMin: selected.crMax });
      return;
    }
    patchSelected({ crMin: v });
  };

  const handleCrMax = (raw: number): void => {
    if (!selected) return;
    const v = Math.max(0, Math.min(99, Math.floor(raw)));
    if (v < selected.crMin) {
      onToast?.(`信用上限不能小于下限(当前下限 ${selected.crMin})`);
      patchSelected({ crMax: selected.crMin });
      return;
    }
    patchSelected({ crMax: v });
  };

  const handleSlotChange = (slotIdx: number, skillName: string): void => {
    if (!selected) return;
    const next = normalizeSkills(selected.skills);
    next[slotIdx] = skillName;
    patchSelected({ skills: next });
    setOpenSlot(null);
    setSlotQuery('');
  };

  // AI 一键生成 — applyScenarioPatch 直接合入 customOccupations
  // signal 透传到 scenario-llm,abort 时能真正中断 fetch (审查 #17/22 修复)
  // ups.slice 裁剪保护 MAX_OCCUPATIONS 上限 (审查 #3 修复)
  const handleAiGenerate = async (): Promise<void> => {
    if (busy) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    try {
      const remaining = Math.max(0, MAX_OCCUPATIONS - list.length);
      if (remaining === 0) {
        onToast?.(`职业上限 ${MAX_OCCUPATIONS},无法继续 AI 生成`);
        return;
      }
      const target = Math.min(10, remaining);
      const patch = await generateCustomOccupations(scn.meta, list, target, controller.signal);
      const rawUps = patch.upsertOccupations ?? [];
      if (rawUps.length === 0) {
        onToast?.('AI 生成返回空,未变更');
        return;
      }
      // 硬上限保护:LLM 可能返回超过 target 的条数,在 apply 前裁剪
      const ups = rawUps.slice(0, remaining);
      const truncated = rawUps.length - ups.length;
      const nextDoc = applyScenarioPatch(scn, { upsertOccupations: ups });
      onChange(nextDoc);
      const tail = truncated > 0 ? `(LLM 超额 ${truncated} 条已截断)` : '';
      onToast?.(`已生成 ${ups.length} 个职业${tail}`);
      if (patch.suggestedNewSkills && patch.suggestedNewSkills.length > 0) {
        onToast?.(`AI 同时建议新增 ${patch.suggestedNewSkills.length} 个时代技能,可到「技能」tab 一键加入`);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.warn('[OccupationsTab] AI 一键生成失败', err);
      onToast?.('AI 一键生成失败,请稍后重试');
    } finally {
      setBusy(false);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
      background: 'rgba(10,7,4,0.35)',
    }}>
      {/* 顶栏:标题 + 计数 + AI / 新建 */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px',
        borderBottom: '1px solid rgba(196,168,85,0.18)',
      }}>
        <h4 style={{
          margin: 0, fontSize: 12, color: 'var(--gold)',
          fontFamily: 'var(--font-ui)', letterSpacing: 2, fontWeight: 500,
        }}>
          职业 {list.length}/{MAX_OCCUPATIONS}
        </h4>
        <div style={{ flex: 1 }} />
        <SmallBtn onClick={handleAiGenerate} label={busy ? '生成中…' : 'AI 一键生成'} accent disabled={busy || list.length >= MAX_OCCUPATIONS} />
        <SmallBtn onClick={handleAdd} label="+ 新职业" accent disabled={list.length >= MAX_OCCUPATIONS} />
      </header>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 左:列表 */}
        <div style={{
          width: 220, flexShrink: 0,
          overflowY: 'auto',
          borderRight: '1px solid rgba(196,168,85,0.18)',
        }}>
          {list.length === 0 ? (
            <div style={{
              padding: 18, textAlign: 'center',
              color: 'rgba(196,168,85,0.55)', fontSize: 12, fontFamily: 'var(--font-ui)',
            }}>
              暂无时代化职业
              <div style={{ marginTop: 6, fontSize: 10.5 }}>
                ※ 留空则玩家可见全部 COC_OCCUPATIONS
              </div>
            </div>
          ) : (
            list.map((o, idx) => {
              const active = idx === selectedIdx;
              return (
                <button
                  key={`${o.name}__${idx}`}
                  onClick={() => { setSelectedIdx(idx); setOpenSlot(null); }}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 3,
                    width: '100%', textAlign: 'left',
                    padding: '8px 12px',
                    background: active ? 'rgba(196,168,85,0.14)' : 'transparent',
                    border: 'none',
                    borderLeft: active ? '2px solid var(--brass)' : '2px solid transparent',
                    color: 'var(--text-light, #d0c2a0)',
                    fontFamily: 'var(--font-ui)',
                    cursor: 'pointer',
                    transition: `background 180ms ${EASE}`,
                  }}
                  onMouseEnter={(ev) => { if (!active) ev.currentTarget.style.background = 'rgba(196,168,85,0.06)'; }}
                  onMouseLeave={(ev) => { if (!active) ev.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ fontSize: 12.5, color: active ? 'var(--gold)' : 'var(--text-light)', display: 'flex', gap: 4 }}>
                    {active && <span aria-hidden="true" style={{ color: 'var(--gold)' }}>★</span>}
                    <span>{o.name || '未命名职业'}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(196,168,85,0.55)' }}>
                    信用 {o.crMin}–{o.crMax}%
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* 右:编辑 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, minWidth: 0 }}>
          {!selected ? (
            <div style={{
              padding: 24, textAlign: 'center',
              color: 'rgba(196,168,85,0.55)', fontSize: 12, fontFamily: 'var(--font-ui)',
            }}>从左侧选择职业编辑,或新建一项</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Row label="名称">
                  <input
                    style={inputStyle}
                    value={selectedName}
                    maxLength={40}
                    onChange={(e) => handleNameChange(e.target.value)}
                  />
                </Row>
              </div>
              {/* Occupation 类型当前无 desc 字段;扩 desc 与 AI 重写按钮属 Section 1 范围外,
                  spec § 10 明确"职业-技能交叉业务校验"不做,这里也按最小落地处理。 */}

              <Row label={`信用评级 ${selected.crMin} — ${selected.crMax}`}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'rgba(196,168,85,0.55)', minWidth: 24, textAlign: 'right' }}>{selected.crMin}</span>
                  <input
                    type="range"
                    min={0}
                    max={99}
                    step={1}
                    value={selected.crMin}
                    onChange={(e) => handleCrMin(Number(e.target.value))}
                    aria-label="信用评级下限"
                    style={{ flex: 1, accentColor: 'var(--brass)' }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={99}
                    step={1}
                    value={selected.crMax}
                    onChange={(e) => handleCrMax(Number(e.target.value))}
                    aria-label="信用评级上限"
                    style={{ flex: 1, accentColor: 'var(--gold)' }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--gold)', minWidth: 24, textAlign: 'left' }}>{selected.crMax}</span>
                </div>
              </Row>

              <Row label="技能点公式">
                <select
                  value={selected.formula ?? ''}
                  onChange={(e) => patchSelected({ formula: e.target.value })}
                  style={{
                    ...inputStyle,
                    cursor: 'pointer',
                  }}
                >
                  {FORMULA_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </Row>

              <div style={{ marginTop: 4 }}>
                <span style={{
                  fontSize: 10.5, color: 'rgba(196,168,85,0.55)', letterSpacing: 1.2,
                  fontFamily: 'var(--font-ui)',
                }}>8 个职业技能(从当前剧本可见池中选)</span>
                <div style={{
                  marginTop: 6,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                }}>
                  {normalizeSkills(selected.skills).map((skillName, slotIdx) => (
                    <SkillSlot
                      key={slotIdx}
                      slotIdx={slotIdx}
                      value={skillName}
                      open={openSlot === slotIdx}
                      query={openSlot === slotIdx ? slotQuery : ''}
                      candidates={skillCandidates}
                      onOpen={() => { setOpenSlot(slotIdx); setSlotQuery(''); }}
                      onClose={() => { setOpenSlot(null); setSlotQuery(''); }}
                      onQuery={setSlotQuery}
                      onPick={(name) => handleSlotChange(slotIdx, name)}
                    />
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                <SmallBtn onClick={handleDelete} label="删除职业" danger />
                <div style={{ flex: 1 }} />
                <SmallBtn onClick={handleDuplicate} label="复制到新" disabled={list.length >= MAX_OCCUPATIONS} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 子组件 ──

interface SkillSlotProps {
  slotIdx: number;
  value: string;
  open: boolean;
  query: string;
  candidates: string[];
  onOpen: () => void;
  onClose: () => void;
  onQuery: (q: string) => void;
  onPick: (name: string) => void;
}

function SkillSlot({ slotIdx, value, open, query, candidates, onOpen, onClose, onQuery, onPick }: SkillSlotProps) {
  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return candidates.slice(0, 30);
    const lower = q.toLowerCase();
    return candidates.filter((s) => s.toLowerCase().includes(lower)).slice(0, 30);
  }, [candidates, query]);

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={open ? onClose : onOpen}
        aria-label={`职业技能槽 ${slotIdx + 1}`}
        style={{
          width: '100%',
          padding: '6px 10px',
          background: open ? 'rgba(196,168,85,0.14)' : 'rgba(0,0,0,0.4)',
          border: `1px solid ${open ? 'var(--brass)' : 'rgba(196,168,85,0.3)'}`,
          borderRadius: 2,
          color: value ? 'var(--text-light, #d0c2a0)' : 'rgba(196,168,85,0.55)',
          fontFamily: 'var(--font-ui)', fontSize: 11.5,
          textAlign: 'left',
          cursor: 'pointer',
          transition: `background 180ms ${EASE}, border-color 180ms ${EASE}`,
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value || '(空)'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--ink-faded, #6b5a3a)' }}>点击换</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0,
          background: 'rgba(20,14,8,0.98)',
          border: '1px solid var(--brass)', borderRadius: 2,
          boxShadow: '0 10px 28px rgba(0,0,0,0.6)',
          zIndex: 10,
          padding: 6,
          maxHeight: 260, overflowY: 'auto',
        }}>
          <input
            autoFocus
            placeholder="搜索技能…"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            style={{ ...inputStyle, marginBottom: 6 }}
          />
          {filtered.length === 0 ? (
            <div style={{ padding: 10, fontSize: 11, color: 'rgba(196,168,85,0.55)', textAlign: 'center' }}>无匹配技能</div>
          ) : (
            filtered.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onPick(name)}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '5px 8px',
                  background: 'transparent', border: 'none',
                  color: 'var(--text-light, #d0c2a0)', fontFamily: 'var(--font-ui)', fontSize: 11.5,
                  cursor: 'pointer', borderRadius: 2,
                  transition: `background 140ms ${EASE}`,
                }}
                onMouseEnter={(ev) => { ev.currentTarget.style.background = 'rgba(196,168,85,0.1)'; }}
                onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; }}
              >{name}</button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      flex: 1,
    }}>
      <span style={{ fontSize: 10.5, color: 'rgba(196,168,85,0.55)', letterSpacing: 1.2, fontFamily: 'var(--font-ui)' }}>{label}</span>
      {children}
    </label>
  );
}

function SmallBtn({ onClick, label, accent, danger, disabled }: { onClick: () => void; label: string; accent?: boolean; danger?: boolean; disabled?: boolean }) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const color = disabled ? 'var(--ink-faded, #6b5a3a)' : danger ? '#b14a4a' : accent ? 'var(--gold)' : 'var(--text-light)';
  const border = disabled ? 'rgba(196,168,85,0.2)' : danger ? '#b14a4a' : 'rgba(196,168,85,0.4)';
  const scale = disabled ? 1 : pressed ? 0.96 : hover ? 1.04 : 1;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => { if (!disabled) onClick(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        padding: '6px 12px',
        background: !disabled && hover ? 'rgba(196,168,85,0.15)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${border}`, borderRadius: 2,
        color, fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        transform: `scale(${scale})`,
        transition: `transform 180ms ${EASE}, background 180ms ${EASE}`,
      }}
    >{label}</button>
  );
}

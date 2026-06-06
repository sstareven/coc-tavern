// 技能 tab — 见 docs/specs/2026-06-06-scenario-section-1-design.md §5.5
// 双栏:左=自定义技能(并入池) / 右=标准技能黑名单(从池中剔除)
// 顶栏 summary bar 实时 derive:原 56 - 黑名单 + 自定义 = 当前 K
import { useState, useMemo } from 'react';
import type { ScenarioDoc, ScenarioCustomSkill } from '../../../types/scenario';
import { ALL_SKILLS, type SkillCat } from '../../../sillytavern/coc-data';
import { generateCustomSkills, proposeSkillBlacklist } from '../../../scenario/scenario-llm';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface Props {
  scn: ScenarioDoc;
  onChange: (next: ScenarioDoc) => void;
  onToast?: (msg: string) => void;
}

// 6 类固定顺序(与 coc-data SkillCat 一致)
const SKILL_CATS: SkillCat[] = ['侦查系', '护理系', '运动系', '战斗系', '交涉系', '生活系'];

// base 三态(数字 / DEX_HALF / EDU) UI 用
type BaseMode = 'num' | 'DEX_HALF' | 'EDU';

function classifyBase(b: ScenarioCustomSkill['base']): BaseMode {
  if (b === 'DEX_HALF') return 'DEX_HALF';
  if (b === 'EDU') return 'EDU';
  return 'num';
}

// ── 纯逻辑导出(给测试与 UI 复用) ──

/** 顶栏统计:原 ALL_SKILLS - 黑名单 + 自定义 = 当前 */
export function computeSkillStats(
  blacklist: string[],
  customSkills: ScenarioCustomSkill[],
): { orig: number; bl: number; custom: number; current: number } {
  const orig = ALL_SKILLS.length;
  const bl = blacklist.length;
  const custom = customSkills.length;
  return { orig, bl, custom, current: orig - bl + custom };
}

/** 自定义技能同名去重(后入覆盖前) */
export function dedupCustomSkillsByName(list: ScenarioCustomSkill[]): ScenarioCustomSkill[] {
  const map = new Map<string, ScenarioCustomSkill>();
  for (const s of list) map.set(s.name, s);
  return Array.from(map.values());
}

/** 黑名单清洗:Set 去重 + 仅保留 ALL_SKILLS 中实际存在的技能名 */
export function cleanBlacklist(list: string[]): string[] {
  const allNames = new Set(ALL_SKILLS.map((s) => s.name));
  return Array.from(new Set(list)).filter((n) => allNames.has(n));
}

/** 合并 AI 生成的自定义技能(同名以新值覆盖,异名追加) */
export function mergeAiCustomSkills(
  existing: ScenarioCustomSkill[],
  incoming: ScenarioCustomSkill[],
): ScenarioCustomSkill[] {
  const map = new Map<string, ScenarioCustomSkill>();
  for (const s of existing) map.set(s.name, s);
  for (const s of incoming) map.set(s.name, s);
  return Array.from(map.values());
}

/** 合并 AI 推荐的黑名单 +/- 增量(过滤非 ALL_SKILLS 名) */
export function applyAiBlacklistProposal(
  existing: string[],
  adds: string[],
  removes: string[],
): string[] {
  const allNames = new Set(ALL_SKILLS.map((s) => s.name));
  const set = new Set<string>(existing);
  for (const n of adds) if (allNames.has(n)) set.add(n);
  for (const n of removes) set.delete(n);
  return Array.from(set).filter((n) => allNames.has(n));
}

/** 按搜索词过滤 ALL_SKILLS,按 cat 分组(空 term 等价于全集) */
export function filterSkillsByCat(
  searchTerm: string,
): Record<SkillCat, typeof ALL_SKILLS> {
  const term = searchTerm.trim().toLowerCase();
  const out: Record<SkillCat, typeof ALL_SKILLS> = {
    '侦查系': [], '护理系': [], '运动系': [], '战斗系': [], '交涉系': [], '生活系': [],
  };
  for (const s of ALL_SKILLS) {
    if (term && !s.name.toLowerCase().includes(term)) continue;
    out[s.cat].push(s);
  }
  return out;
}

export function SkillsTab({ scn, onChange, onToast }: Props) {
  const [selectedSkillName, setSelectedSkillName] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [reasonMap, setReasonMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<null | 'gen' | 'bl'>(null);

  const selectedSkill = selectedSkillName
    ? scn.customSkills.find((s) => s.name === selectedSkillName) ?? null
    : null;

  // 实时统计:原 56 - 黑名单 + 自定义 = 当前
  const stats = useMemo(
    () => computeSkillStats(scn.skillBlacklist, scn.customSkills),
    [scn.skillBlacklist, scn.customSkills],
  );

  // 黑名单 Set(快速命中查询)
  const blacklistSet = useMemo(() => new Set(scn.skillBlacklist), [scn.skillBlacklist]);

  // 按 cat 分组 + 搜索过滤
  const groupedSkills = useMemo(() => filterSkillsByCat(searchTerm), [searchTerm]);

  const commitCustom = (next: ScenarioCustomSkill[]): void => {
    onChange({ ...scn, customSkills: dedupCustomSkillsByName(next), updatedAt: Date.now() });
  };

  const commitBlacklist = (next: string[]): void => {
    onChange({ ...scn, skillBlacklist: cleanBlacklist(next), updatedAt: Date.now() });
  };

  const handleAddCustom = (): void => {
    // 取一个唯一名字
    const existing = new Set(scn.customSkills.map((s) => s.name));
    let i = 1;
    let name = '新技能';
    while (existing.has(name)) {
      i += 1;
      name = `新技能 ${i}`;
    }
    const skill: ScenarioCustomSkill = { name, base: 5, cat: '生活系', desc: '' };
    commitCustom([...scn.customSkills, skill]);
    setSelectedSkillName(name);
  };

  const handleRemoveCustom = (name: string): void => {
    commitCustom(scn.customSkills.filter((s) => s.name !== name));
    if (selectedSkillName === name) setSelectedSkillName(null);
  };

  const patchSelected = (patch: Partial<ScenarioCustomSkill>): void => {
    if (!selectedSkill) return;
    const oldName = selectedSkill.name;
    // 重命名落到已存在的同名 entry 上时,dedupCustomSkillsByName 用 Map 后入覆盖前
    // 会静默丢弃原 B 的 base/cat/desc。与 OccupationsTab.handleNameChange 行为对齐:
    // 先 toast 警告,再走 commit(覆盖动作仍执行,但作者已知情)。
    if (patch.name && patch.name !== oldName && scn.customSkills.some((s) => s.name === patch.name)) {
      onToast?.(`已存在同名技能「${patch.name}」,改名时同名会被合并覆盖`);
    }
    const next = scn.customSkills.map((s) => (s.name === oldName ? { ...s, ...patch } : s));
    commitCustom(next);
    if (patch.name && patch.name !== oldName) setSelectedSkillName(patch.name);
  };

  const handleToggleBlacklist = (skillName: string, checked: boolean): void => {
    if (checked) {
      commitBlacklist([...scn.skillBlacklist, skillName]);
    } else {
      commitBlacklist(scn.skillBlacklist.filter((n) => n !== skillName));
    }
  };

  const handleAiGenerateSkills = async (): Promise<void> => {
    if (busy) return;
    setBusy('gen');
    try {
      const out = await generateCustomSkills(scn.meta, scn.customSkills);
      if (out.upsertCustomSkills && out.upsertCustomSkills.length > 0) {
        const merged = mergeAiCustomSkills(scn.customSkills, out.upsertCustomSkills);
        onChange({ ...scn, customSkills: merged, updatedAt: Date.now() });
        onToast?.(`已生成 ${out.upsertCustomSkills.length} 个时代技能`);
      } else {
        onToast?.('AI 未返回新技能');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      onToast?.('生成失败:' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setBusy(null);
    }
  };

  const handleAiProposeBlacklist = async (): Promise<void> => {
    if (busy) return;
    setBusy('bl');
    try {
      const out = await proposeSkillBlacklist(scn.meta, scn.skillBlacklist);
      const adds = out.addToBlacklist ?? [];
      const rms = out.removeFromBlacklist ?? [];
      const next = applyAiBlacklistProposal(scn.skillBlacklist, adds, rms);
      onChange({ ...scn, skillBlacklist: next, updatedAt: Date.now() });
      if (out.reasonMap) setReasonMap((prev) => ({ ...prev, ...out.reasonMap }));
      onToast?.(`已应用 +${adds.length} -${rms.length} 项黑名单变更`);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      onToast?.('推荐失败:' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
      background: 'rgba(10,7,4,0.35)',
    }}>
      {/* 顶栏 summary bar */}
      <header style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10,
        padding: '10px 14px',
        borderBottom: '1px solid rgba(196,168,85,0.25)',
        fontFamily: 'var(--font-ui)', fontSize: 12,
      }}>
        <span data-testid="skills-summary" style={{ color: 'var(--text-light, #d0c2a0)', letterSpacing: 0.5 }}>
          原 <strong style={{ color: 'var(--gold)' }}>{stats.orig}</strong>
          {' '}- 黑名单 <strong style={{ color: '#c4a855' }}>{stats.bl}</strong>
          {' '}+ 自定义 <strong style={{ color: '#c4a855' }}>{stats.custom}</strong>
          {' '}= 当前 <strong style={{ color: 'var(--gold-bright, #f0d27a)' }}>{stats.current}</strong>
        </span>
        <div style={{ flex: 1 }} />
        <SmallBtn
          onClick={handleAiGenerateSkills}
          label={busy === 'gen' ? '生成中…' : 'AI 一键生成时代技能'}
          accent
          disabled={busy !== null}
        />
        <SmallBtn
          onClick={handleAiProposeBlacklist}
          label={busy === 'bl' ? '推荐中…' : 'AI 推荐黑名单'}
          accent
          disabled={busy !== null}
        />
      </header>

      {/* 双栏 */}
      <div style={{
        flex: 1, minHeight: 0,
        display: 'grid', gridTemplateColumns: '1fr 1fr',
      }}>

        {/* 左栏 自定义技能 */}
        <section style={{
          display: 'flex', flexDirection: 'column',
          borderRight: '1px solid rgba(196,168,85,0.18)',
          minWidth: 0,
        }}>
          <PaneHeader title="自定义技能">
            <SmallBtn onClick={handleAddCustom} label="+ 新" accent />
          </PaneHeader>
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, minHeight: 0 }}>
            {/* tag 行 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
              {scn.customSkills.length === 0 ? (
                <span style={{
                  color: 'var(--ink, #8a7a52)', fontSize: 11, fontFamily: 'var(--font-ui)',
                }}>暂无自定义技能</span>
              ) : (
                scn.customSkills.map((s) => {
                  const sel = s.name === selectedSkillName;
                  return (
                    <CustomTag
                      key={s.name}
                      label={s.name}
                      selected={sel}
                      onClick={() => setSelectedSkillName(s.name)}
                    />
                  );
                })
              )}
            </div>

            {/* 选中编辑 */}
            {selectedSkill ? (
              <div style={{
                borderTop: '1px dashed rgba(196,168,85,0.2)',
                paddingTop: 12,
                display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                <span style={{
                  fontSize: 10.5, color: 'var(--gold)', letterSpacing: 1.2,
                  fontFamily: 'var(--font-ui)',
                }}>编辑选中:{selectedSkill.name}</span>

                <Row label="名称">
                  <input
                    style={inputStyle}
                    value={selectedSkill.name}
                    onChange={(e) => patchSelected({ name: e.target.value })}
                  />
                </Row>

                <Row label="分类">
                  <select
                    style={inputStyle}
                    value={selectedSkill.cat}
                    onChange={(e) => patchSelected({ cat: e.target.value as SkillCat })}
                  >
                    {SKILL_CATS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Row>

                <Row label="基础值">
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      type="number"
                      style={{ ...inputStyle, width: 90 }}
                      value={typeof selectedSkill.base === 'number' ? selectedSkill.base : 0}
                      disabled={typeof selectedSkill.base !== 'number'}
                      onChange={(e) => patchSelected({ base: Math.max(0, Math.min(99, Number(e.target.value) || 0)) })}
                    />
                    <BaseModeBtn
                      label="DEX/2"
                      active={classifyBase(selectedSkill.base) === 'DEX_HALF'}
                      onClick={() => patchSelected({ base: 'DEX_HALF' })}
                    />
                    <BaseModeBtn
                      label="EDU"
                      active={classifyBase(selectedSkill.base) === 'EDU'}
                      onClick={() => patchSelected({ base: 'EDU' })}
                    />
                    <BaseModeBtn
                      label="数字"
                      active={classifyBase(selectedSkill.base) === 'num'}
                      onClick={() => patchSelected({
                        // 已是数字保持原值;从 DEX_HALF/EDU 切回时 fallback 5
                        base: typeof selectedSkill.base === 'number' ? selectedSkill.base : 5,
                      })}
                    />
                  </div>
                </Row>

                <Row label="描述">
                  <textarea
                    style={{ ...inputStyle, resize: 'vertical' }}
                    rows={2}
                    maxLength={500}
                    value={selectedSkill.desc ?? ''}
                    onChange={(e) => patchSelected({ desc: e.target.value })}
                  />
                </Row>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <SmallBtn
                    onClick={() => handleRemoveCustom(selectedSkill.name)}
                    label="删除技能"
                    danger
                  />
                </div>
              </div>
            ) : (
              <div style={{
                padding: 16, textAlign: 'center',
                color: 'var(--ink, #8a7a52)', fontSize: 11.5, fontFamily: 'var(--font-ui)',
              }}>选择上方 tag 编辑,或点「+ 新」新增</div>
            )}
          </div>
        </section>

        {/* 右栏 黑名单 */}
        <section style={{
          display: 'flex', flexDirection: 'column', minWidth: 0,
        }}>
          <PaneHeader title="标准技能黑名单">
            <input
              type="search"
              placeholder="搜索…"
              data-testid="skills-search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                ...inputStyle,
                width: 140, padding: '4px 8px', fontSize: 11,
              }}
            />
          </PaneHeader>

          <div style={{ flex: 1, overflowY: 'auto', padding: 14, minHeight: 0 }}>
            {SKILL_CATS.map((cat) => {
              const list = groupedSkills[cat];
              if (list.length === 0) return null;
              return (
                <div key={cat} style={{ marginBottom: 14 }}>
                  <div style={{
                    fontSize: 10.5, color: 'var(--ink, #8a7a52)',
                    letterSpacing: 1.2, fontFamily: 'var(--font-ui)',
                    marginBottom: 6,
                    paddingBottom: 4,
                    borderBottom: '1px solid rgba(196,168,85,0.12)',
                  }}>{cat}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {list.map((s) => {
                      const checked = blacklistSet.has(s.name);
                      const reason = reasonMap[s.name];
                      const id = `bl_${s.name}`;
                      return (
                        <label
                          key={s.name}
                          htmlFor={id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '3px 6px',
                            cursor: 'pointer',
                            fontFamily: 'var(--font-ui)', fontSize: 12,
                            color: checked ? '#c4a855' : 'var(--text-light, #d0c2a0)',
                            borderRadius: 2,
                            transition: `background 160ms ${EASE}, color 160ms ${EASE}`,
                          }}
                        >
                          <input
                            id={id}
                            type="checkbox"
                            data-testid={`bl-checkbox-${s.name}`}
                            checked={checked}
                            onChange={(e) => handleToggleBlacklist(s.name, e.target.checked)}
                            style={{ cursor: 'pointer' }}
                          />
                          <span>{s.name}</span>
                          {checked && reason ? (
                            <span style={{
                              fontSize: 10.5, color: 'var(--ink-faded, #6b5a3a)',
                              fontFamily: 'var(--font-ui)',
                              fontStyle: 'italic',
                            }}>← {reason}</span>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

      </div>
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
  fontFamily: 'var(--font-ui)',
  fontSize: 12,
  boxSizing: 'border-box',
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontSize: 10.5, color: 'var(--ink, #8a7a52)',
        letterSpacing: 1.2, fontFamily: 'var(--font-ui)',
      }}>{label}</span>
      {children}
    </label>
  );
}

function PaneHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px',
      borderBottom: '1px solid rgba(196,168,85,0.18)',
    }}>
      <h5 style={{
        margin: 0, fontSize: 12, color: 'var(--gold)',
        fontFamily: 'var(--font-ui)', letterSpacing: 2, fontWeight: 500,
      }}>{title}</h5>
      <div style={{ flex: 1 }} />
      {children}
    </header>
  );
}

function CustomTag({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const scale = pressed ? 0.96 : hover ? 1.04 : 1;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '4px 10px',
        background: selected ? 'rgba(196,168,85,0.18)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${selected ? 'var(--brass, #c4a855)' : 'rgba(196,168,85,0.3)'}`,
        borderRadius: 12,
        color: selected ? 'var(--gold-bright, #f0d27a)' : 'var(--text-light, #d0c2a0)',
        fontFamily: 'var(--font-ui)', fontSize: 11,
        cursor: 'pointer',
        transform: `scale(${scale})`,
        transition: `transform 180ms ${EASE}, background 180ms ${EASE}`,
      }}
    >
      <span style={{ color: 'var(--brass, #c4a855)', fontSize: 10 }}>★</span>
      {label}
    </button>
  );
}

function BaseModeBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const scale = pressed ? 0.96 : hover ? 1.04 : 1;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        padding: '4px 8px',
        background: active ? 'rgba(196,168,85,0.18)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${active ? 'var(--brass, #c4a855)' : 'rgba(196,168,85,0.3)'}`,
        borderRadius: 2,
        color: active ? 'var(--gold-bright, #f0d27a)' : 'var(--text-light, #d0c2a0)',
        fontFamily: 'var(--font-ui)', fontSize: 11,
        cursor: 'pointer',
        transform: `scale(${scale})`,
        transition: `transform 180ms ${EASE}, background 180ms ${EASE}`,
      }}
    >{label}</button>
  );
}

function SmallBtn({
  onClick, label, accent, danger, disabled,
}: {
  onClick: () => void; label: string; accent?: boolean; danger?: boolean; disabled?: boolean;
}) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const color = disabled
    ? 'var(--ink-faded, #6b5a3a)'
    : danger ? '#b14a4a'
    : accent ? 'var(--gold)' : 'var(--text-light)';
  const border = disabled
    ? 'rgba(196,168,85,0.15)'
    : danger ? '#b14a4a'
    : 'rgba(196,168,85,0.4)';
  const scale = disabled ? 1 : (pressed ? 0.96 : hover ? 1.04 : 1);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        padding: '6px 12px',
        background: hover && !disabled ? 'rgba(196,168,85,0.15)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${border}`,
        borderRadius: 2,
        color,
        fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transform: `scale(${scale})`,
        transition: `transform 180ms ${EASE}, background 180ms ${EASE}`,
      }}
    >{label}</button>
  );
}

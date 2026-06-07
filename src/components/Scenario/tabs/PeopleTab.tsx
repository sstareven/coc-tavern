// 人物 tab — 见 docs/specs/2026-06-06-scenario-system-design.md §5.1 / §E5
// 双视图: 上半区 ScenarioCharacter 名册编辑(增删/编辑 sheet 关键字段+npcAttrs);
//         下半区 EntryListPane category='人物'
import { useState } from 'react';
import type { ScenarioDoc, ScenarioCharacter } from '../../../types/scenario';
import { defaultSheet } from '../../../stores/useCharSheetStore';
import { useScenarioStore } from '../../../stores/useScenarioStore';
import { buildCharSheetDescription } from '../../../data/scenarios/_npc-helpers';
import { EntryListPane } from './EntryListPane';
import { RelationEditor } from '../../CharSheet/RelationEditor';
import { ExpandableSection } from '../../common/ExpandableSection';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface Props {
  scn: ScenarioDoc;
  onChange: (next: ScenarioDoc) => void;
  onToast?: (msg: string) => void;
}

function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'sc_' + Math.random().toString(36).slice(2);
}

function makeBlankCharacter(): ScenarioCharacter {
  return {
    id: uuid(),
    role: 'protagonist',
    sheet: JSON.parse(JSON.stringify(defaultSheet)),
    npcAttrs: {
      identityTag: '',
      attitudeDefault: 0,
      relationshipDefault: '',
      locationDefault: '',
      publicBio: '',
      hiddenBio: '',
    },
  };
}

// role 四档显示标签
const ROLE_LABELS: Record<ScenarioCharacter['role'], string> = {
  protagonist: '推荐视角',
  optional: '配角可玩',
  locked_npc: '钉死 NPC',
  player_created: '玩家创建',
};

export function PeopleTab({ scn, onChange, onToast }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bgExpanded, setBgExpanded] = useState(false);
  const [relExpanded, setRelExpanded] = useState(false);
  const selected = selectedId ? scn.characters.find((c) => c.id === selectedId) ?? null : null;

  const commitChars = (next: ScenarioCharacter[]): void => {
    onChange({ ...scn, characters: next, updatedAt: Date.now() });
  };

  const handleAdd = (): void => {
    const c = makeBlankCharacter();
    commitChars([...scn.characters, c]);
    setSelectedId(c.id);
  };

  const handleRemove = (id: string): void => {
    commitChars(scn.characters.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const patchSelected = (patch: Partial<ScenarioCharacter>): void => {
    if (!selected) return;
    commitChars(scn.characters.map((c) => (c.id === selected.id ? { ...c, ...patch } : c)));
  };

  const patchSheetName = (name: string): void => {
    if (!selected) return;
    const sheet = { ...selected.sheet, identity: { ...selected.sheet.identity, name } };
    patchSelected({ sheet });
  };

  const patchSheetOccupation = (occ: string): void => {
    if (!selected) return;
    const sheet = { ...selected.sheet, identity: { ...selected.sheet.identity, occupation: occ } };
    patchSelected({ sheet });
  };

  /** 编辑 8 段背景的任一独立字段 → 更新 npcAttrs.X + 重建 sheet.description(让 LLM 看到拼接版) */
  const patchBgField = (field: keyof ScenarioCharacter['npcAttrs'], value: string): void => {
    if (!selected) return;
    const newNpcAttrs = { ...selected.npcAttrs, [field]: value };
    const sheet = {
      ...selected.sheet,
      description: buildCharSheetDescription({
        description: newNpcAttrs.description,
        beliefs: newNpcAttrs.beliefs,
        significantPeople: newNpcAttrs.significantPeople,
        meaningfulLocations: newNpcAttrs.meaningfulLocations,
        treasuredPossessions: newNpcAttrs.treasuredPossessions,
        traits: newNpcAttrs.traits,
        injuries: newNpcAttrs.injuries,
        backgroundFears: newNpcAttrs.backgroundFears,
      }),
      // 同步 initialItemsRaw 到 sheet(scenarioCharacterToNpc 从 sheet 拆 possessions)
      ...(field === 'initialItemsRaw' ? { initialItemsRaw: value } : {}),
    };
    patchSelected({ npcAttrs: newNpcAttrs, sheet });
  };

  const patchNpc = (patch: Partial<ScenarioCharacter['npcAttrs']>): void => {
    if (!selected) return;
    patchSelected({ npcAttrs: { ...selected.npcAttrs, ...patch } });
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0,
    }}>
      {/* 上半:角色名册 */}
      <section style={{
        flex: '0 0 auto', maxHeight: '50%',
        display: 'flex', flexDirection: 'column',
        borderBottom: '1px solid rgba(196,168,85,0.25)',
        background: 'rgba(10,7,4,0.35)',
        minHeight: 240,
      }}>
        <header style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px',
          borderBottom: '1px solid rgba(196,168,85,0.18)',
        }}>
          <h4 style={{
            margin: 0, fontSize: 12, color: 'var(--gold)',
            fontFamily: 'var(--font-ui)', letterSpacing: 2, fontWeight: 500,
          }}>角色名册</h4>
          <div style={{ flex: 1 }} />
          <SmallBtn onClick={handleAdd} label="新角色" accent />
        </header>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* 左:列表 */}
          <div style={{
            width: 220, flexShrink: 0,
            overflowY: 'auto',
            borderRight: '1px solid rgba(196,168,85,0.18)',
          }}>
            {scn.characters.length === 0 ? (
              <div style={{
                padding: 18, textAlign: 'center',
                color: 'rgba(196,168,85,0.55)', fontSize: 12, fontFamily: 'var(--font-ui)',
              }}>暂无角色</div>
            ) : (
              <>
                {/* 玩家位占位:始终首位,disabled+tooltip,关系由 CharCreator 步骤 5 编辑 */}
                <button
                  key="__player_placeholder"
                  type="button"
                  disabled
                  title="玩家关系由 CharCreator 步骤 5 编辑,此处不可改"
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 3,
                    width: '100%', textAlign: 'left',
                    padding: '8px 12px',
                    background: 'transparent',
                    border: 'none',
                    borderLeft: '2px solid transparent',
                    color: 'rgba(196,168,85,0.4)',
                    fontFamily: 'var(--font-ui)',
                    cursor: 'not-allowed',
                    opacity: 0.7,
                  }}
                >
                  <div style={{ fontSize: 12.5 }}>@创建调查员</div>
                  <div style={{ fontSize: 10, color: 'rgba(196,168,85,0.4)' }}>玩家位</div>
                </button>
                {scn.characters.map((c) => {
                  const active = c.id === selectedId;
                  const name = c.sheet?.identity?.name || c.npcAttrs.identityTag || '未命名';
                  const isPlayerCreated = c.role === 'player_created';
                  return (
                    <div key={c.id} style={{ position: 'relative' }}>
                      <button
                        onClick={() => setSelectedId(c.id)}
                        style={{
                          display: 'flex', flexDirection: 'column', gap: 3,
                          width: '100%', textAlign: 'left',
                          padding: isPlayerCreated ? '8px 32px 8px 12px' : '8px 12px',
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
                        <div style={{ fontSize: 12.5, color: active ? 'var(--gold)' : 'var(--text-light)' }}>{name}</div>
                        <div style={{ fontSize: 10, color: 'rgba(196,168,85,0.55)' }}>
                          {ROLE_LABELS[c.role]}
                        </div>
                      </button>
                      {isPlayerCreated && (
                        <DeletePlayerCreatedBtn
                          name={name}
                          onConfirm={() => {
                            useScenarioStore.getState().applyPatch(scn.id, { removeCharacterIds: [c.id] });
                            if (selectedId === c.id) setSelectedId(null);
                            onToast?.(`已删除自创卡 ${name}`);
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {/* 右:编辑 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, minWidth: 0 }}>
            {!selected ? (
              <div style={{
                padding: 24, textAlign: 'center',
                color: 'rgba(196,168,85,0.55)', fontSize: 12, fontFamily: 'var(--font-ui)',
              }}>从左侧选择角色编辑</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Row label="姓名" compact>
                    <input style={inputStyle} value={selected.sheet?.identity?.name ?? ''} onChange={(e) => patchSheetName(e.target.value)} />
                  </Row>
                  <Row label="职业" compact>
                    <input style={inputStyle} value={selected.sheet?.identity?.occupation ?? ''} onChange={(e) => patchSheetOccupation(e.target.value)} />
                  </Row>
                  <Row label="角色定位" compact>
                    <select
                      style={inputStyle}
                      value={selected.role}
                      onChange={(e) => patchSelected({ role: e.target.value as ScenarioCharacter['role'] })}
                    >
                      <option value="protagonist">推荐视角</option>
                      <option value="optional">配角可玩</option>
                      <option value="locked_npc">钉死 NPC(玩家不可选)</option>
                    </select>
                  </Row>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <Row label="身份标签" compact>
                    <input style={inputStyle} value={selected.npcAttrs.identityTag} onChange={(e) => patchNpc({ identityTag: e.target.value })} />
                  </Row>
                  <Row label="默认态度 -100~100" compact>
                    <input
                      type="number" min={-100} max={100} style={inputStyle}
                      value={selected.npcAttrs.attitudeDefault}
                      onChange={(e) => patchNpc({ attitudeDefault: Math.max(-100, Math.min(100, Number(e.target.value) || 0)) })}
                    />
                  </Row>
                  <Row label="默认关系" compact>
                    <input style={inputStyle} value={selected.npcAttrs.relationshipDefault} onChange={(e) => patchNpc({ relationshipDefault: e.target.value })} />
                  </Row>
                  <Row label="默认位置" compact>
                    <input style={inputStyle} value={selected.npcAttrs.locationDefault} onChange={(e) => patchNpc({ locationDefault: e.target.value })} />
                  </Row>
                </div>
                <Row label="公开简历(玩家可见)">
                  <textarea
                    style={{ ...inputStyle, resize: 'vertical' }}
                    rows={2}
                    maxLength={4000}
                    value={selected.npcAttrs.publicBio}
                    onChange={(e) => patchNpc({ publicBio: e.target.value })}
                  />
                  <CharCounter value={selected.npcAttrs.publicBio} max={4000} />
                </Row>
                <Row label="隐藏简历(仅作者可见)">
                  <textarea
                    style={{ ...inputStyle, resize: 'vertical' }}
                    rows={2}
                    maxLength={4000}
                    value={selected.npcAttrs.hiddenBio}
                    onChange={(e) => patchNpc({ hiddenBio: e.target.value })}
                  />
                  <CharCounter value={selected.npcAttrs.hiddenBio} max={4000} />
                </Row>

                {/* 折叠区: 9 个独立背景字段 + 随身物品 */}
                <ExpandableSection
                  title="角色背景档案"
                  hint="8 段(个人描述/思想信念/...) 与玩家调查员卡同款 — 改后自动同步 sheet.description"
                  expanded={bgExpanded}
                  onToggle={() => setBgExpanded((v) => !v)}
                >
                  <Row label="个人描述/外观">
                    <textarea
                      style={{ ...inputStyle, resize: 'vertical' }}
                      rows={2} maxLength={1500}
                      placeholder="如:中年贵族,身材中等略胖,发色已斑白..."
                      value={selected.npcAttrs.description ?? ''}
                      onChange={(e) => patchBgField('description', e.target.value)}
                    />
                  </Row>
                  <Row label="思想/信念">
                    <textarea
                      style={{ ...inputStyle, resize: 'vertical' }}
                      rows={2} maxLength={1500}
                      placeholder="如:罗马的秩序高于一切,但真正支撑秩序的不是元老院的法令..."
                      value={selected.npcAttrs.beliefs ?? ''}
                      onChange={(e) => patchBgField('beliefs', e.target.value)}
                    />
                  </Row>
                  <Row label="重要之人">
                    <textarea
                      style={{ ...inputStyle, resize: 'vertical' }}
                      rows={2} maxLength={1500}
                      placeholder="1-2 个名字 + 关系,可以是已亡/离散/盟友"
                      value={selected.npcAttrs.significantPeople ?? ''}
                      onChange={(e) => patchBgField('significantPeople', e.target.value)}
                    />
                  </Row>
                  <Row label="重要场所">
                    <textarea
                      style={{ ...inputStyle, resize: 'vertical' }}
                      rows={2} maxLength={1500}
                      placeholder="具体地点 + 情感联系"
                      value={selected.npcAttrs.meaningfulLocations ?? ''}
                      onChange={(e) => patchBgField('meaningfulLocations', e.target.value)}
                    />
                  </Row>
                  <Row label="珍贵之物">
                    <textarea
                      style={{ ...inputStyle, resize: 'vertical' }}
                      rows={2} maxLength={1500}
                      placeholder="1-2 件珍藏物,可与随身物品不同"
                      value={selected.npcAttrs.treasuredPossessions ?? ''}
                      onChange={(e) => patchBgField('treasuredPossessions', e.target.value)}
                    />
                  </Row>
                  <Row label="特质(性格/行为模式)">
                    <textarea
                      style={{ ...inputStyle, resize: 'vertical' }}
                      rows={2} maxLength={1500}
                      placeholder="2-3 个短句,深化或扩展行为模式"
                      value={selected.npcAttrs.traits ?? ''}
                      onChange={(e) => patchBgField('traits', e.target.value)}
                    />
                  </Row>
                  <Row label="伤口/伤痕">
                    <textarea
                      style={{ ...inputStyle, resize: 'vertical' }}
                      rows={2} maxLength={1500}
                      placeholder="可见或隐藏的伤痕/旧伤,或'无显著旧伤'"
                      value={selected.npcAttrs.injuries ?? ''}
                      onChange={(e) => patchBgField('injuries', e.target.value)}
                    />
                  </Row>
                  <Row label="恐惧症/狂躁症">
                    <textarea
                      style={{ ...inputStyle, resize: 'vertical' }}
                      rows={2} maxLength={1500}
                      placeholder="1-2 个具象化的恐惧或强迫行为,与时代/经历相关"
                      value={selected.npcAttrs.backgroundFears ?? ''}
                      onChange={(e) => patchBgField('backgroundFears', e.target.value)}
                    />
                  </Row>
                  <Row label="随身物品(逗号/顿号/分号/换行分隔)">
                    <textarea
                      style={{ ...inputStyle, resize: 'vertical' }}
                      rows={2} maxLength={500}
                      placeholder="例:罗马军用短剑、皮质护臂、军团徽章、军囊(含口粮与火石)"
                      value={selected.npcAttrs.initialItemsRaw ?? ''}
                      onChange={(e) => patchBgField('initialItemsRaw', e.target.value)}
                    />
                  </Row>
                </ExpandableSection>

                {/* 折叠区: 该角色对剧本其它角色的关系出边 */}
                <ExpandableSection
                  title="人际关系"
                  hint="该角色对剧本其它角色的关系出边 — 双向语义由 relation-graph 自动补全"
                  expanded={relExpanded}
                  onToggle={() => setRelExpanded((v) => !v)}
                >
                  <RelationEditor
                    scenarioDoc={scn}
                    currentCharId={selected.id}
                    relations={selected.relations ?? []}
                    presentAtStart={
                      scn.characters
                        .filter((c) => c.presentAtStart === true)
                        .map((c) => c.id)
                    }
                    onChange={(nextRelations, nextPresent) => {
                      const updatedSelected: ScenarioCharacter = { ...selected, relations: nextRelations };
                      const presentSet = new Set(nextPresent);
                      const newCharacters = scn.characters.map((c) => {
                        if (c.id === selected.id) return updatedSelected;
                        const shouldBePresent = presentSet.has(c.id);
                        if (c.presentAtStart === true && !shouldBePresent) return { ...c, presentAtStart: false };
                        if (c.presentAtStart !== true && shouldBePresent) return { ...c, presentAtStart: true };
                        return c;
                      });
                      commitChars(newCharacters);
                    }}
                  />
                </ExpandableSection>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <SmallBtn onClick={() => handleRemove(selected.id)} label="删除角色" danger />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 下半:人物条目 */}
      <section style={{ flex: 1, minHeight: 0 }}>
        <EntryListPane category="人物" scn={scn} onChange={onChange} onToast={onToast} />
      </section>
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
  // 编辑器输入文本直接用 #e8d8b4 暖羊皮黄(不走 var(--text-light) 默认 #d4c4a0 偏暗),
  // 在编辑器深背景上对比度提升一档(WCAG 9:1+),阅读不再昏暗。
  color: '#e8d8b4',
  fontFamily: 'var(--font-ui)', fontSize: 12,
  boxSizing: 'border-box',
};

function Row({ label, children, compact }: { label: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <label style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      minWidth: compact ? 130 : undefined, flex: compact ? '0 0 auto' : 1,
    }}>
      <span style={{ fontSize: 10.5, color: 'rgba(196,168,85,0.55)', letterSpacing: 1.2, fontFamily: 'var(--font-ui)' }}>{label}</span>
      {children}
    </label>
  );
}

function CharCounter({ value, max }: { value: string; max: number }) {
  const len = value.length;
  const ratio = len / max;
  return (
    <div style={{
      textAlign: 'right', fontSize: 10,
      color: ratio > 0.8 ? '#c4a855' : 'var(--ink-faded, #6b5a3a)',
      fontFamily: 'var(--font-ui)',
    }}>{len}/{max}</div>
  );
}

function SmallBtn({ onClick, label, accent, danger }: { onClick: () => void; label: string; accent?: boolean; danger?: boolean }) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const color = danger ? '#b14a4a' : accent ? 'var(--gold)' : 'var(--text-light)';
  const border = danger ? '#b14a4a' : 'rgba(196,168,85,0.4)';
  const scale = pressed ? 0.96 : hover ? 1.04 : 1;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        padding: '6px 12px',
        background: hover ? 'rgba(196,168,85,0.15)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${border}`, borderRadius: 2,
        color, fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 1,
        cursor: 'pointer',
        transform: `scale(${scale})`,
        transition: `transform 180ms ${EASE}, background 180ms ${EASE}`,
      }}
    >{label}</button>
  );
}

/** player_created 角色行右上角的小型删除按钮 — hover 红边 + 二次确认 */
function DeletePlayerCreatedBtn({ name, onConfirm }: { name: string; onConfirm: () => void }) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);
  const scale = pressed ? 0.92 : hover ? 1.1 : 1;
  return (
    <button
      type="button"
      aria-label="删除自创卡"
      title={`删除自创卡 ${name}`}
      onClick={(e) => {
        e.stopPropagation();
        if (window.confirm(`确定删除自创卡「${name}」?此操作不可撤销。`)) onConfirm();
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        position: 'absolute', right: 6, top: 8,
        width: 20, height: 20, padding: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: hover ? 'rgba(177,74,74,0.18)' : 'transparent',
        border: `1px solid ${hover ? '#b14a4a' : 'rgba(196,168,85,0.25)'}`,
        borderRadius: 2,
        color: hover ? '#d97676' : 'rgba(196,168,85,0.6)',
        fontFamily: 'var(--font-ui)', fontSize: 11, lineHeight: 1,
        cursor: 'pointer',
        transform: `scale(${scale})`,
        transition: `transform 160ms ${EASE}, background 160ms ${EASE}, color 160ms ${EASE}, border-color 160ms ${EASE}`,
      }}
    >×</button>
  );
}

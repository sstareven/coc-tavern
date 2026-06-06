// 人物 tab — 见 docs/specs/2026-06-06-scenario-system-design.md §5.1 / §E5
// 双视图: 上半区 ScenarioCharacter 名册编辑(增删/编辑 sheet 关键字段+npcAttrs);
//         下半区 EntryListPane category='人物'
import { useState } from 'react';
import type { ScenarioDoc, ScenarioCharacter } from '../../../types/scenario';
import { defaultSheet } from '../../../stores/useCharSheetStore';
import { EntryListPane } from './EntryListPane';

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

// role 三档显示标签
const ROLE_LABELS: Record<ScenarioCharacter['role'], string> = {
  protagonist: '推荐视角',
  optional: '配角可玩',
  locked_npc: '钉死 NPC',
};

export function PeopleTab({ scn, onChange, onToast }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  const patchSheetDescription = (desc: string): void => {
    if (!selected) return;
    patchSelected({ sheet: { ...selected.sheet, description: desc } });
  };

  const patchSheetItemsRaw = (raw: string): void => {
    if (!selected) return;
    patchSelected({ sheet: { ...selected.sheet, initialItemsRaw: raw } });
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
                color: 'var(--ink, #8a7a52)', fontSize: 12, fontFamily: 'var(--font-ui)',
              }}>暂无角色</div>
            ) : (
              scn.characters.map((c) => {
                const active = c.id === selectedId;
                const name = c.sheet?.identity?.name || c.npcAttrs.identityTag || '未命名';
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
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
                    <div style={{ fontSize: 12.5, color: active ? 'var(--gold)' : 'var(--text-light)' }}>{name}</div>
                    <div style={{ fontSize: 10, color: 'var(--ink, #8a7a52)' }}>
                      {ROLE_LABELS[c.role]}
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
                color: 'var(--ink, #8a7a52)', fontSize: 12, fontFamily: 'var(--font-ui)',
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
                <Row label="个人档案(8 段格式 - 个人描述/思想信念/重要之人/重要场所/珍贵之物/特质/伤口伤痕/恐惧症狂躁症)">
                  <textarea
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.55 }}
                    rows={12}
                    maxLength={8000}
                    placeholder={'【个人描述】\n...\n\n【思想/信念】\n...\n\n【重要之人】\n...'}
                    value={selected.sheet?.description ?? ''}
                    onChange={(e) => patchSheetDescription(e.target.value)}
                  />
                  <CharCounter value={selected.sheet?.description ?? ''} max={8000} />
                </Row>
                <Row label="随身物品(逗号/顿号/分号/换行分隔,进游戏拆为 possessions 数组)">
                  <textarea
                    style={{ ...inputStyle, resize: 'vertical' }}
                    rows={2}
                    maxLength={500}
                    placeholder="例:罗马军用短剑、皮质护臂、军团徽章、军囊（含口粮与火石）"
                    value={selected.sheet?.initialItemsRaw ?? ''}
                    onChange={(e) => patchSheetItemsRaw(e.target.value)}
                  />
                  <CharCounter value={selected.sheet?.initialItemsRaw ?? ''} max={500} />
                </Row>
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
  color: 'var(--text-light, #d0c2a0)',
  fontFamily: 'var(--font-ui)', fontSize: 12,
  boxSizing: 'border-box',
};

function Row({ label, children, compact }: { label: string; children: React.ReactNode; compact?: boolean }) {
  return (
    <label style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      minWidth: compact ? 130 : undefined, flex: compact ? '0 0 auto' : 1,
    }}>
      <span style={{ fontSize: 10.5, color: 'var(--ink, #8a7a52)', letterSpacing: 1.2, fontFamily: 'var(--font-ui)' }}>{label}</span>
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

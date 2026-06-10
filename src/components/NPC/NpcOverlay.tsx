import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNpcStore } from '../../stores/useNpcStore';
import { useNpcMemoryStore } from '../../stores/useNpcMemoryStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useChatStore } from '../../stores/useChatStore';
import { runNpcMemoryCard } from '../../sillytavern/npc-memory-extractor';
import { buildImportantNpcMemoryTemplate } from '../../types/npc-world-memory';
import { useBookStore } from '../../stores/useBookStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { MobilePageToggle, type Side } from '../Book/MobilePageToggle';
import { parseNpcDerived } from '../../sillytavern/npc-derived';
import { enterCombat } from '../../sillytavern/combat-entry';
import { dispatchNpcAction, isHelplessNpc, buildExecutionNarrative, dispatchNpcNarrative } from '../../sillytavern/choice-action';
import { NPC_QUICK_ACTIONS, NPC_ACTION_GROUPS, npcActionsByGroup, type NpcAction } from '../../sillytavern/npc-actions';
import type { NpcProfile, COC7Characteristic } from '../../types';

/** 据名册 NPC 即时开战：交 enterCombat 经 LLM 建场（算对手倾向 + 在场其他 NPC 是否参战/旁观），失败回退本地 1v1；并关闭名册浮层。 */
function startCombatWithNpc(npc: NpcProfile) {
  const recent = useBookStore.getState().pages.slice(-2).map((p) => p.leftContent).filter(Boolean).join('\n');
  const present = useNpcStore.getState().getPresent()
    .map((n) => `${n.name}（${n.identity || '身份不明'}，对调查员好感${n.favorability}${n.id === npc.id ? '，被攻击目标' : ''}）`).join('；');
  void enterCombat({
    contextText: `${recent}\n调查员对 ${npc.name} 发起攻击。\n在场NPC：${present}\n（请把 ${npc.name} 列为敌方；其余在场 NPC 据其立场/好感度判断是否参战及站哪边，敌对者列为 enemy、护着调查员者列为 ally、未表态者列为旁观 bystander。）`,
    opener: `（对 ${npc.name} 发起攻击）`,
    npcTarget: npc,
  });
  useNpcStore.getState().close();
}

function FavBar({ value }: { value: number }) {
  // -100..100 → 0..100% ；负=血红，正=金绿
  const pct = (value + 100) / 2;
  const color = value > 30 ? 'var(--success)' : value < -30 ? 'var(--blood)' : 'var(--gold)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)', flexShrink: 0 }}>好感</span>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(var(--ink-faded-rgb),0.18)', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: color, transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1)' }} />
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(var(--ink-faded-rgb),0.4)' }} />
      </div>
      <span style={{ fontSize: 'calc(10px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', color, flexShrink: 0, width: 30, textAlign: 'right' }}>{value > 0 ? '+' : ''}{value}</span>
    </div>
  );
}

/** 折叠版 Section — title 一行可点击，body 跟着 expanded 显隐。
 *  parchment 主题（米色羊皮纸背景），与 NpcCard 一致；与公共深色 ExpandableSection 区分。 */
function FoldedSection({ title, body, expanded, onToggle }: { title: string; body: string; expanded: boolean; onToggle: () => void }) {
  if (!body?.trim()) return null;
  return (
    <div style={{ marginTop: 6 }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          width: '100%', padding: '4px 0',
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: 'calc(10px * var(--system-ratio, 1))',
          fontFamily: 'var(--font-ui)', color: 'var(--gold)',
          letterSpacing: 1.2, textAlign: 'left',
          borderBottom: '1px dashed rgba(var(--ink-faded-rgb), 0.2)',
        }}
      >
        <span style={{
          display: 'inline-block', width: 10, textAlign: 'center',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)',
          color: 'var(--ink-faded)',
        }}>▶</span>
        <span style={{ fontWeight: 500 }}>{title}</span>
      </button>
      {expanded && (
        <div style={{
          padding: '6px 0 4px 16px',
          fontSize: 'calc(12px * var(--system-ratio, 1))',
          fontFamily: 'var(--font-body)', color: 'var(--ink)',
          lineHeight: 1.65, whiteSpace: 'pre-wrap',
        }}>{body}</div>
      )}
    </div>
  );
}

const CHAR_KEYS: { k: COC7Characteristic; label: string }[] = [
  { k: 'STR', label: '力量' }, { k: 'CON', label: '体质' }, { k: 'SIZ', label: '体型' }, { k: 'DEX', label: '敏捷' },
  { k: 'APP', label: '外貌' }, { k: 'INT', label: '智力' }, { k: 'POW', label: '意志' }, { k: 'EDU', label: '教育' },
];

function StatCell({ label, sub, value }: { label: string; sub?: string; value: string | number }) {
  return (
    <div style={{ border: '1px solid rgba(var(--ink-faded-rgb),0.18)', borderRadius: 4, padding: '4px 6px', textAlign: 'center', background: 'rgba(0,0,0,0.015)' }}>
      <div style={{ fontSize: 'calc(8px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', color: 'var(--ink-faded)', letterSpacing: 1 }}>{label}{sub ? ` ${sub}` : ''}</div>
      <div style={{ fontSize: 'calc(14px * var(--system-ratio, 1))', fontFamily: 'var(--font-display)', color: 'var(--ink)' }}>{value}</div>
    </div>
  );
}

/** NPC 记录面板：基础属性 8 格 + 衍生属性 6 格（贴主角 CharSheet 风），缺字段显「—」/「未知」。 */
function NpcRecordSheet({ npc }: { npc: NpcProfile }) {
  const ch = npc.characteristics ?? {};
  const d = parseNpcDerived(npc);
  // HP/SAN/MP 显示「当前/最大」：当前缺省=最大值(parseNpcDerived 现算)；战斗结算/npcUpdates 的 delta 会更新当前值。
  const cm = (cur: number | undefined, max: number | undefined): string => (max == null ? '未知' : `${cur ?? max}/${max}`);
  const derived: { label: string; value: string | number | undefined }[] = [
    { label: 'HP', value: cm(npc.hpCurrent, d.hp) }, { label: 'SAN', value: cm(npc.sanCurrent, d.san) }, { label: 'MP', value: cm(npc.mpCurrent, d.mp) },
    { label: 'DB', value: d.db }, { label: 'MOV', value: d.mov }, { label: '体格', value: d.build },
  ];
  return (
    <>
      <div style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', fontFamily: 'var(--font-ui)', color: 'var(--gold)', letterSpacing: 1, marginBottom: 4 }}>基础属性</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 8 }}>
        {CHAR_KEYS.map(({ k, label }) => <StatCell key={k} label={k} sub={label} value={ch[k] ?? '—'} />)}
      </div>
      <div style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', fontFamily: 'var(--font-ui)', color: 'var(--gold)', letterSpacing: 1, marginBottom: 4 }}>衍生属性</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
        {derived.map((it) => <StatCell key={it.label} label={it.label} value={it.value ?? '未知'} />)}
      </div>
    </>
  );
}

/** 互动动作小药丸（战技/攻击=血红，检定=金）。带 hover 放大 + active 按压反馈。 */
function NpcActionChip({ action, onClick }: { action: { label: string; kind?: string; skill?: string; difficulty?: string }; onClick: () => void }) {
  const [h, setH] = useState(false);
  const combat = action.kind === 'combat';
  return (
    <button onClick={onClick}
      title={action.skill ? `进行${action.skill}检定${action.difficulty && action.difficulty !== '普通' ? `(${action.difficulty})` : ''}` : undefined}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(0.94)'; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
      style={{
        fontSize: 'calc(11px * var(--system-ratio, 1))', fontFamily: 'var(--font-ui)', letterSpacing: 1, padding: '4px 10px', borderRadius: 3, cursor: 'pointer',
        border: `1px solid ${combat ? 'rgba(176,58,46,0.5)' : 'rgba(196,168,85,0.5)'}`,
        background: h ? (combat ? 'rgba(176,58,46,0.16)' : 'rgba(196,168,85,0.18)') : (combat ? 'rgba(176,58,46,0.06)' : 'rgba(196,168,85,0.06)'),
        color: combat ? 'var(--blood)' : 'var(--ink)',
        transform: h ? 'scale(1.05)' : 'scale(1)', transition: 'var(--transition-smooth)',
      }}
    >{action.label}</button>
  );
}

/** 在场 NPC 互动菜单（卡内，非全屏）：快捷行 + 更多▾ 展开 COC7e 全套对人行动。 */
function InteractionMenu({ npc }: { npc: NpcProfile }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const run = (a: NpcAction) => {
    if (a.kind === 'combat') {
      // 已失能(重伤/昏迷/濒死)的 NPC 再被攻击不开战斗面板(否则按最大HP满血重建、还要逐回合对抗,违和)，
      // 改走「处决/制伏」纯叙事：塞进输入栏 → 玩家推进 → 主管线出正文+选项。
      if (isHelplessNpc(npc)) {
        dispatchNpcNarrative(buildExecutionNarrative(npc.name, npc.status ?? '', a));
        useNpcStore.getState().close();
      } else {
        startCombatWithNpc(npc);                                              // 攻击/战技 → 进战斗
      }
    } else { dispatchNpcAction(npc.name, a); useNpcStore.getState().close(); } // 检定 → 走选项掷骰提交管线
  };
  return (
    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed rgba(var(--ink-faded-rgb),0.2)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {NPC_QUICK_ACTIONS.map((a) => <NpcActionChip key={a.id} action={a} onClick={() => run(a)} />)}
        <NpcActionChip action={{ label: moreOpen ? '更多▴' : '更多▾' }} onClick={() => setMoreOpen((o) => !o)} />
      </div>
      {moreOpen && NPC_ACTION_GROUPS.map((g) => (
        <div key={g} style={{ marginTop: 7 }}>
          <div style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', fontFamily: 'var(--font-ui)', color: 'var(--gold)', letterSpacing: 1, marginBottom: 3 }}>{g}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {npcActionsByGroup(g).map((a) => <NpcActionChip key={a.id} action={a} onClick={() => run(a)} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function NpcCard({ npc }: { npc: NpcProfile }) {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [memOpen, setMemOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(npc.name);
  // Agent Memory 摘要带——只在开关开启 + importance ∈ {核心,重要} 时显示。
  const ame = useChatStore((s) => {
    const ses = s.sessions.find((c) => c.id === s.activeId);
    return ses?.agentMemoryEnabled;
  });
  const ameDefault = useSettingsStore((s) => s.agentMemoryDefault);
  const ameActive = (ame ?? ameDefault) === true;
  const showMemory = ameActive && (npc.importance === '核心' || npc.importance === '重要');
  const memory = useNpcMemoryStore((s) => s.memories[npc.id]);
  const pending = useNpcMemoryStore((s) => s.pendingCardIds.includes(npc.id));
  const recardNpc = () => {
    if (pending) return;
    useNpcMemoryStore.getState().addPending(npc.id);
    const digest = `${npc.name}|${npc.identity ?? ''}|位置:${npc.locationName ?? '未知'}|状态:${npc.status ?? ''}`;
    const recent = useBookStore.getState().pages.slice(-2).map((p) => p.leftContent).filter(Boolean).join('\n').slice(0, 1200);
    void runNpcMemoryCard({
      npcId: npc.id,
      npcName: npc.name,
      npcDigest: digest,
      scenarioCtx: recent,
    })
      .then((card) => {
        useNpcMemoryStore.getState().removePending(npc.id);
        const turn = useBookStore.getState().pages.length;
        if (card) {
          useNpcMemoryStore.getState().setMemory(npc.id, { ...card, updatedAt: turn });
        } else {
          // fail-open: 若已有非空 prose 心智, 保留原值; 只有从未立卡时才写空模板兜底.
          // 旧版会一律覆盖空模板 → 一次 429/网络抖动 + 玩家点重立卡就把现有心思清零.
          const cur = useNpcMemoryStore.getState().memories[npc.id];
          if (!cur || !cur.prose || !cur.prose.trim()) {
            useNpcMemoryStore.getState().setMemory(npc.id, buildImportantNpcMemoryTemplate(turn));
          }
        }
      })
      .catch(() => useNpcMemoryStore.getState().removePending(npc.id));
  };
  // 6 段背景独立折叠态，默认全收起；玩家点哪段展开哪段
  const [foldedOpen, setFoldedOpen] = useState<Set<string>>(new Set());
  const toggleFolded = (key: string) => {
    setFoldedOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const skillStr = npc.skills ? Object.entries(npc.skills).map(([n, v]) => `${n}${v}`).join('、') : '';
  return (
    <div className="cv-row" style={{ border: '1px solid rgba(var(--ink-faded-rgb),0.2)', borderRadius: 5, padding: '10px 12px', marginBottom: 10, background: 'rgba(196,168,85,0.04)' }}>
      <div onClick={() => setOpen(!open)} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          {editing ? (
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => {
                const trimmed = editName.trim();
                if (trimmed && trimmed !== npc.name) useNpcStore.getState().renameNpc(npc.id, trimmed);
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') { setEditName(npc.name); setEditing(false); }
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                fontFamily: 'var(--font-display)', fontSize: 'calc(16px * var(--system-ratio, 1))',
                color: 'var(--ink)', letterSpacing: 1,
                background: 'rgba(196,168,85,0.08)', border: '1px solid rgba(196,168,85,0.4)',
                borderRadius: 3, padding: '1px 6px', outline: 'none', width: 160,
              }}
            />
          ) : (
            <span
              onDoubleClick={(e) => { e.stopPropagation(); setEditName(npc.name); setEditing(true); }}
              title="双击改名"
              style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(16px * var(--system-ratio, 1))', color: 'var(--ink)', letterSpacing: 1, cursor: 'text' }}
            >{npc.name}</span>
          )}
          <span style={{ fontSize: 'calc(11px * var(--system-ratio, 1))', color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)' }}>{npc.identity || '身份不明'}</span>
          {npc.status && <span style={{ marginLeft: 'auto', fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--blood)', border: '1px solid rgba(139,58,58,0.4)', borderRadius: 8, padding: '1px 7px' }}>{npc.status}</span>}
          {npc.isPresent && (
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen((m) => !m); }}
              style={{
                marginLeft: npc.status ? 8 : 'auto', fontSize: 'calc(10px * var(--system-ratio, 1))', fontFamily: 'var(--font-ui)', letterSpacing: 1,
                color: 'var(--gold)', background: menuOpen ? 'rgba(196,168,85,0.18)' : 'transparent',
                border: '1px solid rgba(196,168,85,0.5)', borderRadius: 3, padding: '2px 9px', cursor: 'pointer',
                transition: 'var(--transition-smooth)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.2)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = menuOpen ? 'rgba(196,168,85,0.18)' : 'transparent'; }}
            >{menuOpen ? '收起' : '互动'}</button>
          )}
          <span style={{ fontSize: 'calc(10px * var(--system-ratio, 1))', color: 'var(--ink-faded)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', marginLeft: (npc.status || npc.isPresent) ? 0 : 'auto' }}>▸</span>
        </div>
        {npc.appearance && <div style={{ fontSize: 'calc(11.5px * var(--system-ratio, 1))', color: 'var(--ink-subtle)', fontStyle: 'italic', marginTop: 4, lineHeight: 1.5, ...(open ? {} : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }) }}>{npc.appearance}</div>}
        <div style={{ marginTop: 7 }}><FavBar value={npc.favorability} /></div>
      </div>
      {showMemory && (
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px dashed rgba(var(--ink-faded-rgb),0.18)' }}>
          {pending ? (
            <div style={{ fontSize: 'calc(11px * var(--system-ratio, 1))', color: 'var(--ink-subtle)', fontStyle: 'italic', fontFamily: 'var(--font-body)' }}>
              心思浮现中……
            </div>
          ) : memory ? (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 'calc(11px * var(--system-ratio, 1))', color: 'var(--ink)', fontFamily: 'var(--font-body)' }}>
                <span><span style={{ color: 'var(--gold)' }}>目标：</span>{memory.goal || '（未浮现）'}</span>
                <span><span style={{ color: 'var(--gold)' }}>下一步：</span>{memory.nextMove || '（未浮现）'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 'calc(10px * var(--system-ratio, 1))', color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)' }}>
                <span style={{ border: '1px solid rgba(var(--ink-faded-rgb),0.35)', borderRadius: 3, padding: '1px 6px' }}>{memory.emotionToPC}</span>
                <span style={{ width: 80, height: 4, background: 'rgba(var(--ink-faded-rgb),0.15)', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                  <span style={{
                    position: 'absolute',
                    left: '50%',
                    top: 0,
                    height: '100%',
                    width: `${Math.abs(memory.trustOnPC) * 50}%`,
                    transform: memory.trustOnPC >= 0 ? 'none' : 'translateX(-100%)',
                    background: memory.trustOnPC >= 0 ? 'var(--gold)' : 'var(--blood)',
                  }} />
                </span>
                <span>{memory.trustOnPC.toFixed(2)}</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setMemOpen((v) => !v); }}
                  style={{
                    marginLeft: 'auto', fontSize: 'calc(10px * var(--system-ratio, 1))', fontFamily: 'var(--font-ui)',
                    border: '1px solid rgba(var(--ink-faded-rgb),0.35)', background: 'transparent',
                    color: 'var(--ink-subtle)', cursor: 'pointer', borderRadius: 3, padding: '1px 6px',
                  }}
                >{memOpen ? '收起心思' : '展开心思'}</button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); recardNpc(); }}
                  style={{
                    fontSize: 'calc(10px * var(--system-ratio, 1))', fontFamily: 'var(--font-ui)',
                    border: '1px solid rgba(var(--ink-faded-rgb),0.35)', background: 'transparent',
                    color: 'var(--ink-subtle)', cursor: 'pointer', borderRadius: 3, padding: '1px 6px',
                  }}
                >重立心智</button>
              </div>
              {memOpen && (
                <div style={{ marginTop: 6, fontSize: 'calc(11px * var(--system-ratio, 1))', fontFamily: 'var(--font-body)', color: 'var(--ink)', lineHeight: 1.6 }}>
                  {memory.secrets.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: 'var(--gold)' }}>秘密：</span>{memory.secrets.join('；')}
                    </div>
                  )}
                  {memory.relationships.length > 0 && (
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: 'var(--gold)' }}>关系：</span>
                      <ul style={{ margin: '2px 0 0 16px', padding: 0 }}>
                        {memory.relationships.map((r, i) => (
                          <li key={`${r.target}-${i}`} style={{ marginBottom: 2 }}>
                            对 {r.target}（{r.emotion}）：{r.note}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {memory.prose && (
                    <div style={{ fontStyle: 'italic', color: 'var(--ink-subtle)', whiteSpace: 'pre-wrap' }}>
                      {memory.prose}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 'calc(11px * var(--system-ratio, 1))', color: 'var(--ink-subtle)', fontStyle: 'italic', fontFamily: 'var(--font-body)' }}>
                心思未浮现
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); recardNpc(); }}
                style={{
                  fontSize: 'calc(10px * var(--system-ratio, 1))', fontFamily: 'var(--font-ui)',
                  border: '1px solid rgba(var(--ink-faded-rgb),0.35)', background: 'transparent',
                  color: 'var(--ink-subtle)', cursor: 'pointer', borderRadius: 3, padding: '1px 6px',
                }}
              >立即立卡</button>
            </div>
          )}
        </div>
      )}
      {npc.isPresent && menuOpen && <InteractionMenu npc={npc} />}
      {open && (
        <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px dashed rgba(var(--ink-faded-rgb),0.2)' }}>
          <NpcRecordSheet npc={npc} />
          <FoldedSection title="性格" body={npc.personality} expanded={foldedOpen.has('personality')} onToggle={() => toggleFolded('personality')} />
          <FoldedSection title="动机/秘密（KP视角）" body={npc.innerThoughts} expanded={foldedOpen.has('inner')} onToggle={() => toggleFolded('inner')} />
          <FoldedSection title="背景故事" body={npc.backstory} expanded={foldedOpen.has('backstory')} onToggle={() => toggleFolded('backstory')} />
          <FoldedSection title="人物经历" body={npc.experience} expanded={foldedOpen.has('experience')} onToggle={() => toggleFolded('experience')} />
          {skillStr && <FoldedSection title="技能" body={skillStr} expanded={foldedOpen.has('skills')} onToggle={() => toggleFolded('skills')} />}
          {npc.possessions.length > 0 && <FoldedSection title="随身物品" body={npc.possessions.join('、')} expanded={foldedOpen.has('possessions')} onToggle={() => toggleFolded('possessions')} />}
          {(npc.memorySummary || npc.memories.length > 0) && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', fontFamily: 'var(--font-ui)', color: 'var(--gold)', letterSpacing: 1, marginBottom: 2 }}>互动记忆</div>
              {npc.memorySummary && (
                <div style={{ fontSize: 'calc(11.5px * var(--system-ratio, 1))', fontFamily: 'var(--font-body)', color: 'var(--ink-subtle)', fontStyle: 'italic', lineHeight: 1.6, marginBottom: 4, paddingBottom: 4, borderBottom: '1px dashed rgba(var(--ink-faded-rgb),0.2)' }}>
                  梗概：{npc.memorySummary}
                </div>
              )}
              {npc.memories.length > 0 && (
                <div style={{ fontSize: 'calc(12px * var(--system-ratio, 1))', fontFamily: 'var(--font-body)', color: 'var(--ink)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                  {npc.memories.join('\n')}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NpcColumn({ npcs, emptyText, header, sub }: { npcs: NpcProfile[]; emptyText: string; header: string; sub: string }) {
  return (
    <>
      <div style={{ borderBottom: '1px solid rgba(var(--ink-faded-rgb),0.25)', paddingBottom: 8, marginBottom: 10 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(18px * var(--system-ratio, 1))', color: 'var(--ink)', letterSpacing: 4, margin: 0 }}>{header}</h3>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'calc(8px * var(--system-ratio, 1))', color: 'var(--ink-faded)', letterSpacing: 2 }}>{sub}</span>
      </div>
      <div className="inv-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0, scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.06)' }}>
        {npcs.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 'calc(12px * var(--system-ratio, 1))', fontFamily: 'var(--font-body)', color: 'var(--ink-faded)', fontStyle: 'italic' }}>{emptyText}</div>
        ) : (
          npcs.map((n) => <NpcCard key={n.id} npc={n} />)
        )}
      </div>
    </>
  );
}

export function NpcOverlay() {
  const profiles = useNpcStore((s) => s.profiles);
  const isMobile = useIsMobile();
  const [side, setSide] = useState<Side>('left');

  const all = Object.values(profiles);
  const present = all.filter((p) => p.isPresent).sort((a, b) => b.updatedAt - a.updatedAt);
  const absent = all.filter((p) => !p.isPresent).sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <motion.div
      initial="enter" animate="visible" exit="exit"
      variants={{ enter: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } }}
      transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
      style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: isMobile ? 'column' : 'row', borderRadius: 4 }}
    >
      {isMobile && <MobilePageToggle left="在场" right="离场" side={side} onSide={setSide} />}

      <motion.div style={{
        flex: '1 1 0', display: isMobile && side !== 'left' ? 'none' : 'flex', flexDirection: 'column',
        background: 'linear-gradient(135deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
        borderRadius: '3px 0 0 3px', boxShadow: 'inset -1px 0 2px rgba(0,0,0,0.04)', padding: '28px 20px 20px 28px', overflow: 'hidden',
      }}>
        <NpcColumn npcs={present} header="在场" sub="PRESENT" emptyText="当前没有在场的人物" />
      </motion.div>

      <div style={{ width: 2, flexShrink: 0, display: isMobile ? 'none' : 'block', background: 'linear-gradient(to right, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.03) 50%, rgba(0,0,0,0.06) 100%)' }} />

      <motion.div
        variants={isMobile ? undefined : { exit: { rotateY: -180 } }}
        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        style={{
          flex: '1 1 0', display: isMobile && side !== 'right' ? 'none' : 'flex', flexDirection: 'column',
          background: 'linear-gradient(225deg, var(--parchment) 0%, var(--parchment-deep) 100%)',
          borderRadius: '0 3px 3px 0', boxShadow: 'inset 1px 0 2px rgba(0,0,0,0.04)',
          padding: '28px 28px 20px 20px', transformOrigin: '0% 50%', backfaceVisibility: 'hidden', overflow: 'hidden',
        }}>
        <NpcColumn npcs={absent} header="离场" sub="ABSENT" emptyText="没有已离场的人物" />
      </motion.div>
    </motion.div>
  );
}

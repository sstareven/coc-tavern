import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNpcStore } from '../../stores/useNpcStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { MobilePageToggle, type Side } from '../Book/MobilePageToggle';
import type { NpcProfile } from '../../types';

function FavBar({ value }: { value: number }) {
  // -100..100 → 0..100% ；负=血红，正=金绿
  const pct = (value + 100) / 2;
  const color = value > 30 ? 'var(--success)' : value < -30 ? 'var(--blood)' : 'var(--gold)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)', flexShrink: 0 }}>好感</span>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(var(--ink-faded-rgb),0.18)', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: color, transition: 'width 0.4s cubic-bezier(0.4,0,0.2,1)' }} />
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'rgba(var(--ink-faded-rgb),0.4)' }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color, flexShrink: 0, width: 30, textAlign: 'right' }}>{value > 0 ? '+' : ''}{value}</span>
    </div>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  if (!body?.trim()) return null;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 9, fontFamily: 'var(--font-ui)', color: 'var(--gold)', letterSpacing: 1, marginBottom: 2 }}>{title}</div>
      <div style={{ fontSize: 12, fontFamily: 'var(--font-body)', color: 'var(--ink)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{body}</div>
    </div>
  );
}

function NpcCard({ npc }: { npc: NpcProfile }) {
  const [open, setOpen] = useState(false);
  const skillStr = npc.skills ? Object.entries(npc.skills).map(([n, v]) => `${n}${v}`).join('、') : '';
  const charStr = npc.characteristics ? Object.entries(npc.characteristics).map(([k, v]) => `${k}${v}`).join(' ') : '';
  return (
    <div className="cv-row" style={{ border: '1px solid rgba(var(--ink-faded-rgb),0.2)', borderRadius: 5, padding: '10px 12px', marginBottom: 10, background: 'rgba(196,168,85,0.04)' }}>
      <div onClick={() => setOpen(!open)} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--ink)', letterSpacing: 1 }}>{npc.name}</span>
          <span style={{ fontSize: 11, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)' }}>{npc.identity || '身份不明'}</span>
          {npc.status && <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--blood)', border: '1px solid rgba(139,58,58,0.4)', borderRadius: 8, padding: '1px 7px' }}>{npc.status}</span>}
          <span style={{ fontSize: 10, color: 'var(--ink-faded)', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', marginLeft: npc.status ? 0 : 'auto' }}>▸</span>
        </div>
        {npc.appearance && <div style={{ fontSize: 11.5, color: 'var(--ink-subtle)', fontStyle: 'italic', marginTop: 4, lineHeight: 1.5, ...(open ? {} : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }) }}>{npc.appearance}</div>}
        <div style={{ marginTop: 7 }}><FavBar value={npc.favorability} /></div>
      </div>
      {open && (
        <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px dashed rgba(var(--ink-faded-rgb),0.2)' }}>
          {(charStr || npc.derived) && (
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)', marginBottom: 4 }}>
              {charStr}{charStr && npc.derived ? ' · ' : ''}{npc.derived}
            </div>
          )}
          <Section title="性格" body={npc.personality} />
          <Section title="动机/秘密（KP视角）" body={npc.innerThoughts} />
          <Section title="背景故事" body={npc.backstory} />
          <Section title="人物经历" body={npc.experience} />
          {skillStr && <Section title="技能" body={skillStr} />}
          {npc.possessions.length > 0 && <Section title="随身物品" body={npc.possessions.join('、')} />}
          {(npc.memorySummary || npc.memories.length > 0) && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-ui)', color: 'var(--gold)', letterSpacing: 1, marginBottom: 2 }}>互动记忆</div>
              {npc.memorySummary && (
                <div style={{ fontSize: 11.5, fontFamily: 'var(--font-body)', color: 'var(--ink-subtle)', fontStyle: 'italic', lineHeight: 1.6, marginBottom: 4, paddingBottom: 4, borderBottom: '1px dashed rgba(var(--ink-faded-rgb),0.2)' }}>
                  梗概：{npc.memorySummary}
                </div>
              )}
              {npc.memories.length > 0 && (
                <div style={{ fontSize: 12, fontFamily: 'var(--font-body)', color: 'var(--ink)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
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
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ink)', letterSpacing: 4, margin: 0 }}>{header}</h3>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--ink-faded)', letterSpacing: 2 }}>{sub}</span>
      </div>
      <div className="inv-scroll" style={{ flex: 1, overflowY: 'auto', minHeight: 0, scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.06)' }}>
        {npcs.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 12, fontFamily: 'var(--font-body)', color: 'var(--ink-faded)', fontStyle: 'italic' }}>{emptyText}</div>
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

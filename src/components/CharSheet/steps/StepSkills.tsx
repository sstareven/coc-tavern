import type { CSSProperties } from 'react';
import type { COC7Characteristic } from '../../../types';
import { DarkSelect } from '../../Shared/DarkSelect';
import { sectionTitle, inputStyle, editBtn } from '../styles';
import {
  type SkillCat,
  CAT_COLORS,
  ALL_SKILLS,
  SKILL_DESC,
  COC_OCCUPATIONS,
} from '../../../sillytavern/coc-data';

interface Props {
  occupation: string;
  onSetOccupation: (v: string) => void;
  customOccupation: string;
  onSetCustomOccupation: (v: string) => void;
  occSkills: string[];
  interestSkills: string[];
  occPoints: Record<string, number>;
  interestPoints: Record<string, number>;
  creditRating: number;
  onSetCreditRating: (v: number) => void;
  filterCat: SkillCat | null;
  onSetFilterCat: (v: SkillCat | null) => void;
  editingSkill: string | null;
  editingType: 'occ' | 'int' | null;
  charValues: Record<COC7Characteristic, number>;
  occRemaining: number;
  intRemaining: number;
  occPointPool: number;
  intPointPool: number;
  onToggleOccSkill: (skillName: string) => void;
  onToggleInterestSkill: (skillName: string) => void;
  onReEnterEdit: (skillName: string, type: 'occ' | 'int') => void;
  onAdjOccPoint: (skillName: string, delta: number) => void;
  onAdjIntPoint: (skillName: string, delta: number) => void;
  onClearOccSkill: (skillName: string) => void;
  onClearIntSkill: (skillName: string) => void;
  onSaveAndExit: () => void;
}

function getBase(sk: typeof ALL_SKILLS[number], charValues: Record<COC7Characteristic, number>): number {
  if (typeof sk.base === 'number') return sk.base;
  if (sk.base === 'DEX_HALF') return Math.floor((charValues.DEX ?? 50) / 2);
  return charValues.EDU ?? 50;
}

export function StepSkills({
  occupation,
  onSetOccupation,
  customOccupation,
  onSetCustomOccupation,
  occSkills,
  interestSkills,
  occPoints,
  interestPoints,
  creditRating,
  onSetCreditRating,
  filterCat,
  onSetFilterCat,
  editingSkill,
  editingType,
  charValues,
  occRemaining,
  intRemaining,
  occPointPool,
  intPointPool,
  onToggleOccSkill,
  onToggleInterestSkill,
  onReEnterEdit,
  onAdjOccPoint,
  onAdjIntPoint,
  onClearOccSkill,
  onClearIntSkill,
  onSaveAndExit,
}: Props) {
  const occValue = occupation || '__custom__';
  const isCustomOcc = occValue === '__custom__';
  const selectedOcc = !isCustomOcc ? COC_OCCUPATIONS.find((o) => o.name === occValue) : null;
  const suggestedSkills = selectedOcc?.skills || [];
  const crMin = selectedOcc?.crMin ?? 0;
  const crMax = selectedOcc?.crMax ?? 99;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={sectionTitle}>职业与技能 OCCUPATION & SKILLS</div>

      {/* Occupation selector */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
          <span style={{ fontSize: 10, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>职业 OCCUPATION</span>
          <DarkSelect value={occValue} onChange={onSetOccupation}
            options={[
              ...COC_OCCUPATIONS.map((o) => ({ value: o.name, label: `${o.name}`, sub: `${o.en} · 信用 ${o.crMin}–${o.crMax}%` })),
              { value: '__custom__', label: '自定义职业...', sub: '' },
            ]} />
        </div>
        {isCustomOcc && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
            <span style={{ fontSize: 10, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>自定义职业名称</span>
            <input type="text" value={customOccupation} onChange={(e) => onSetCustomOccupation(e.target.value)}
              style={{ ...inputStyle, height: 30 }} placeholder="输入职业名称" />
          </div>
        )}
      </div>

      {/* Info bar */}
      <div style={{
        padding: '8px 12px', border: '1px solid rgba(196,168,85,0.12)', borderRadius: 4,
        background: 'rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 4,
        fontSize: 11, fontFamily: 'var(--font-mono)',
      }}>
        {selectedOcc && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{selectedOcc.name} ({selectedOcc.en})</span>
            <span style={{ color: 'var(--ink-subtle)' }}>信用 {crMin}–{crMax}%</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
           <span style={{ color: 'var(--ink-subtle)', fontWeight: 600 }}>职业技能池 (EDU × 4 = {occPointPool})</span>
          <span style={{ color: occRemaining > 0 ? 'var(--gold)' : 'rgba(196,168,85,0.4)', fontWeight: occRemaining > 0 ? 700 : 400, opacity: occRemaining > 0 ? 1 : 0.8, transition: 'color 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.35s cubic-bezier(0.4,0,0.2,1)' }}>
            剩余 {occRemaining}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
           <span style={{ color: 'var(--ink-subtle)', fontWeight: 600 }}>兴趣技能池 (INT × 2 = {intPointPool})</span>
          <span style={{ color: intRemaining > 0 ? '#78afdc' : 'rgba(120,175,220,0.4)', fontWeight: intRemaining > 0 ? 700 : 400, opacity: intRemaining > 0 ? 1 : 0.8, transition: 'color 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.35s cubic-bezier(0.4,0,0.2,1)' }}>
            剩余 {intRemaining}
          </span>
        </div>
      </div>

      {/* Credit Rating slider */}
      <div style={{ padding: '8px 12px', border: '1px solid rgba(196,168,85,0.12)', borderRadius: 4, background: 'rgba(0,0,0,0.06)', position: 'relative' }}>
        <span style={{ fontSize: 12, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 1, fontWeight: 700 }}>信用评级</span>
        <span style={{
          position: 'absolute', right: 8, top: '50%', zIndex: 1,
          transform: 'translateY(calc(-50% - 10px))',
          fontSize: 14 + (creditRating - crMin) / Math.max(1, crMax - crMin) * 6,
          fontFamily: 'var(--font-display)', fontWeight: 900, color: 'rgba(255,255,255,0.30)',
          transition: 'font-size 0.25s cubic-bezier(0.4,0,0.2,1)',
          lineHeight: 1, pointerEvents: 'none', userSelect: 'none',
        }}>{creditRating}</span>
        <input type="range" min={crMin} max={crMax}
          value={creditRating} onChange={(e) => onSetCreditRating(Math.min(creditRating + occRemaining, Number(e.target.value)))}
          style={{ width: '100%', accentColor: 'var(--gold)', marginTop: 2,
            background: `linear-gradient(to right, var(--gold) 0%, var(--gold) ${(Math.min(crMax, creditRating + occRemaining) - crMin) / Math.max(1, crMax - crMin) * 100}%, rgba(255,255,255,0.08) ${(Math.min(crMax, creditRating + occRemaining) - crMin) / Math.max(1, crMax - crMin) * 100}%, rgba(255,255,255,0.08) 100%)`,
          }} />
      </div>

      {/* Skill category filter bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {((['全部','侦查系','护理系','运动系','战斗系','交涉系','生活系'] as const)).map((cat) => {
          const active = (filterCat ?? '全部') === cat;
          const c = cat === '全部' ? '#c4a855' : CAT_COLORS[cat as SkillCat];
          return (
            <button key={cat} onClick={() => onSetFilterCat(cat === '全部' ? null : cat as SkillCat)}
              className="sk-btn"
              style={{
                padding: '3px 10px', borderRadius: 3, fontSize: 10, fontWeight: 700,
                fontFamily: 'var(--font-display)', letterSpacing: 1,
                border: active ? `1px solid ${c}` : `1px solid ${c}44`,
                color: active ? c : `${c}88`,
                background: active ? `${c}18` : 'transparent',
              }}
            >{cat}</button>
          );
        })}
      </div>

      {/* All skills grid */}
      <div style={{ height: 320, overflowY: 'scroll', overflowX: 'hidden', scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, alignItems: 'start' }}>
          {ALL_SKILLS
            .filter((sk) => !filterCat || sk.cat === filterCat)
            .sort((a, b) => {
              const aStar = suggestedSkills.includes(a.name) ? 0 : 1;
              const bStar = suggestedSkills.includes(b.name) ? 0 : 1;
              if (aStar !== bStar) return aStar - bStar;
              if (filterCat) return 0;
              return a.cat.localeCompare(b.cat);
            })
            .map((sk) => {
            const isOcc = occSkills.includes(sk.name);
            const isInt = interestSkills.includes(sk.name);
            const suggested = suggestedSkills.includes(sk.name);
            const canUseOcc = isCustomOcc || suggested;
            const occPts = occPoints[sk.name] ?? 0;
            const intPts = interestPoints[sk.name] ?? 0;
            const base = getBase(sk, charValues);
            const total = base + occPts + intPts;
            const catColor = CAT_COLORS[sk.cat];
            const occFull = occSkills.length >= 8 && !isOcc;
            const intFull = intRemaining <= 0 && !isInt;
            const highlighted = isOcc || isInt;
            const editing = editingSkill === sk.name;
            const desc = SKILL_DESC[sk.name] || '';

            return (
              <div key={sk.name} onClick={() => { if (highlighted && !editing) onReEnterEdit(sk.name, editingType || 'occ'); }} style={{ cursor: highlighted && !editing ? 'pointer' : 'default',
                padding: '8px 28px 8px 6px',
                minWidth: 0, minHeight: 44,
                borderLeft: `2px solid ${catColor}44`,
                borderBottom: '1px solid rgba(255,255,255,0.03)',
                borderRight: suggested ? '2px solid rgba(196,168,85,0.4)' : 'none',
                borderTop: suggested ? '1px solid rgba(196,168,85,0.2)' : 'none',
                borderRadius: 2,
                background: suggested ? 'rgba(196,168,85,0.04)' : highlighted ? `${catColor}0a` : 'rgba(0,0,0,0.03)',
                opacity: (occFull && intFull) ? 0.35 : 1,
                position: 'relative', overflow: 'hidden',
              }}>
                {/* Header row — skill name */}
                <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-start' }}>
                  <span style={{
                    fontSize: 10, fontFamily: 'var(--font-body)', paddingLeft: 4, paddingRight: 32,
                    color: suggested ? '#ffd54f' : (isOcc || isInt) ? catColor : `${catColor}88`,
                    fontWeight: suggested ? 700 : 400, flexShrink: 0,
                  }}>
                    {suggested && '\u2605 '}{sk.name}
                  </span>
                </div>
                {/* Both buttons on right side, stacked — transparent button row */}
                {!highlighted ? (
                  <div style={{ position: 'absolute', right: 1, top: 0, bottom: 0, zIndex: 2,
                    display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4,
                    borderRadius: 2, padding: '0 2px',
                  }}>
                    {canUseOcc && (
                      <button onClick={(e) => { e.stopPropagation(); onToggleOccSkill(sk.name); }}
                        className="sk-btn"
                        style={{ background: 'none', border: 'none', padding: '1px 2px',
                          fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
                          color: 'rgba(196,168,85,0.18)', cursor: 'pointer',
                          whiteSpace: 'pre', lineHeight: 1.1, textAlign: 'center',
                        }}>{'\u804c\n\u4e1a'}</button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); onToggleInterestSkill(sk.name); }}
                      className="sk-btn"
                      style={{ background: 'none', border: 'none', padding: '1px 2px',
                        fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
                        color: 'rgba(120,175,220,0.15)', cursor: 'pointer',
                        whiteSpace: 'pre', lineHeight: 1.1, textAlign: 'center',
                      }}>{'\u5174\n\u8da3'}</button>
                  </div>
                ) : editing ? (
                  <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, zIndex: 3,
                    display: 'flex', alignItems: 'center', gap: 3, paddingRight: 2,
                    borderRadius: 2, padding: '0 4px',
                  }}>
                    {/* +/- row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <button onClick={(e) => { e.stopPropagation(); editingType === 'occ' ? onAdjOccPoint(sk.name, 5) : onAdjIntPoint(sk.name, 5); }}
                        className="sk-btn" style={editBtn}>+5</button>
                      <button onClick={(e) => { e.stopPropagation(); editingType === 'occ' ? onAdjOccPoint(sk.name, 1) : onAdjIntPoint(sk.name, 1); }}
                        className="sk-btn" style={editBtn}>+1</button>
                      <button onClick={(e) => { e.stopPropagation(); editingType === 'occ' ? onAdjOccPoint(sk.name, -1) : onAdjIntPoint(sk.name, -1); }}
                        className="sk-btn" style={editBtn}>-1</button>
                      <button onClick={(e) => { e.stopPropagation(); editingType === 'occ' ? onAdjOccPoint(sk.name, -5) : onAdjIntPoint(sk.name, -5); }}
                        className="sk-btn" style={editBtn}>-5</button>
                    </div>
                    {/* Vertical confirm / cancel */}
                    <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); const pts = editingType === 'occ' ? (occPoints[sk.name] ?? 0) : (interestPoints[sk.name] ?? 0); if (pts === 0) { editingType === 'occ' ? (onClearOccSkill(sk.name), onSaveAndExit()) : (onClearIntSkill(sk.name), onSaveAndExit()); } else { onSaveAndExit(); } }}
                      className="sk-btn" style={{ ...editBtn, whiteSpace: 'pre', color: 'rgba(130,200,130,0.35)' }}>{'\u786e\n\u5b9a'}</button>
                    <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); editingType === 'occ' ? (onClearOccSkill(sk.name), onSaveAndExit()) : (onClearIntSkill(sk.name), onSaveAndExit()); }}
                      className="sk-btn" style={{ ...editBtn, whiteSpace: 'pre', color: 'rgba(200,130,130,0.32)' }}>{'\u53d6\n\u6d88'}</button>
                  </div>
                ) : (
                  <div style={{ position: 'absolute', right: 1, top: 0, bottom: 0, zIndex: 2,
                    display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4,
                    borderRadius: 2, padding: '0 2px',
                  }}>
                    {canUseOcc && (occSkills.length < 8 || isOcc) && (
                      <button onClick={(e) => { e.stopPropagation(); if (!isOcc) onToggleOccSkill(sk.name); else onReEnterEdit(sk.name, 'occ'); }}
                        className={isOcc ? 'sk-btn sk-btn-occ' : 'sk-btn'}
                        style={{ background: 'none', border: 'none', padding: '1px 2px',
                          fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
                          color: isOcc ? 'rgba(196,168,85,0.32)' : 'rgba(196,168,85,0.18)',
                          cursor: 'pointer', whiteSpace: 'pre', lineHeight: 1.1, textAlign: 'center',
                        }}>{'\u804c\n\u4e1a'}</button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); if (!isInt) onToggleInterestSkill(sk.name); else onReEnterEdit(sk.name, 'int'); }}
                      className={isInt ? 'sk-btn sk-btn-int' : 'sk-btn'}
                      style={{ background: 'none', border: 'none', padding: '1px 2px',
                        fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
                        color: isInt ? 'rgba(120,175,220,0.28)' : 'rgba(120,175,220,0.15)',
                        cursor: 'pointer', whiteSpace: 'pre', lineHeight: 1.1, textAlign: 'center',
                      }}>{'\u5174\n\u8da3'}</button>
                  </div>
                )}
                {/* Description — absolute overlay, fade-in/out with bezier, marquee scroll */}
                <div style={{ fontSize: 8, color: 'var(--ink-subtle)', fontFamily: 'var(--font-body)',
                  position: 'absolute', left: 6, right: 4, bottom: 2, zIndex: 1,
                  mixBlendMode: 'difference', lineHeight: 1.3, overflow: 'hidden',
                  maskImage: 'linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)',
                  WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)',
                  opacity: (highlighted && desc) ? 1 : 0,
                  pointerEvents: (highlighted && desc) ? 'auto' : 'none',
                  transition: 'opacity 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
                }}>
                  <div className="sk-desc-inner" style={{ '--tkr-dur': `${Math.max(4, (desc || '').length * 0.22 + 1.5)}s` } as CSSProperties}>
                    <span>{desc || ''}</span>
                    <span>{desc || ''}</span>
                  </div>
                </div>
                {/* Watermark number — left side, below name */}
                <div style={{
                  position: 'absolute', left: 2, top: 0, bottom: 0,
                  display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start',
                  padding: '0 4px 2px 2px',
                  zIndex: 1,
                  fontSize: highlighted ? 38 : 34, fontFamily: 'var(--font-display)', fontWeight: 900,
                  color: highlighted
                    ? (isOcc ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.08)')
                    : 'rgba(255,255,255,0.05)',
                  lineHeight: 1, pointerEvents: 'none', userSelect: 'none',
                }}>
                  {highlighted ? total : base}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

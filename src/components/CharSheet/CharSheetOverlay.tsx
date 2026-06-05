import { useState } from 'react';
import { motion } from 'framer-motion';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { CHAR_ORDER, DEFAULT_CHARS, SECONDARY_STATS } from '../../sillytavern/coc-data';
import { useIsMobile } from '../../hooks/useIsMobile';
import { MobilePageToggle, type Side } from '../Book/MobilePageToggle';
import { DevelopmentPhaseModal } from './DevelopmentPhaseModal';
import { hasTickedDevelopmentSkill } from '../../sillytavern/skill-improvement';

/** 状态条件严重度配色（金→血红渐进）。 */
const SEVERITY_TONE: Record<string, { color: string; bg: string }> = {
  minor: { color: '#8b7a4a', bg: 'rgba(139,122,74,0.12)' },
  moderate: { color: 'var(--gold)', bg: 'rgba(196,168,85,0.12)' },
  severe: { color: '#c06a3a', bg: 'rgba(192,106,58,0.14)' },
  critical: { color: '#d45050', bg: 'rgba(212,80,80,0.16)' },
};

/** Parse description into 【section】 blocks, or null if no sections found */
function parseSections(text: string): { title: string; body: string }[] | null {
  const parts = text.split(/【(.+?)】/);
  if (parts.length <= 2) return null;
  const sections: { title: string; body: string }[] = [];
  if (parts[0].trim()) sections.push({ title: '简介', body: parts[0].trim() });
  for (let i = 1; i < parts.length; i += 2) {
    const title = parts[i];
    const body = (parts[i + 1] || '').trim();
    if (body) sections.push({ title, body });
  }
  return sections.length > 0 ? sections : null;
}

const DOSSIER_FIELDS = [
  { key: 'description' as const, label: '个人描述' },
  { key: 'personality' as const, label: '性格特征' },
  { key: 'scenario' as const, label: '场景设定' },
  { key: 'personaDescription' as const, label: '角色设定' },
];

const sectionLabel: React.CSSProperties = {
  fontSize: 'calc(9px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)',
  letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8,
};

export function CharSheetOverlay() {
  const sheet = useCharSheetStore((s) => s.sheet);
  const chars = sheet.characteristics;
  const hf = sheet.halfFifth;
  const sec = sheet.secondary;
  const identity = sheet.identity;
  const skillEntries = Object.entries(sheet.skills);

  const [dossierOpen, setDossierOpen] = useState<Record<string, boolean>>({});
  const [subOpen, setSubOpen] = useState<Record<string, boolean>>({});
  const [devOpen, setDevOpen] = useState(false);
  const hasTicked = hasTickedDevelopmentSkill(sheet);
  const isMobile = useIsMobile();
  const [side, setSide] = useState<Side>('left');
  const toggleDossier = (k: string) => setDossierOpen((p) => ({ ...p, [k]: !p[k] }));
  const toggleSub = (k: string) => setSubOpen((p) => ({ ...p, [k]: !p[k] }));

  const renderSecValue = (key: string): string => {
    switch (key) {
      case 'hp': return `${sec.hp.current} / ${sec.hp.max}`;
      case 'san': return `${sec.san.current} / ${sec.san.max}`;
      case 'mp': return `${sec.mp.current} / ${sec.mp.max}`;
      case 'luck': return String(sec.luck);
      case 'mov': return String(sec.mov);
      case 'db': return sec.db;
      case 'build': return (sec.build > 0 ? '+' : '') + String(sec.build);
      default: return '';
    }
  };

  function renderDossierContent(content: string, parentKey: string) {
    const sections = parseSections(content);
    if (!sections) return <>{content}</>;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {sections.map((sectionItem, si) => {
          const subKey = `${parentKey}_${si}`;
          const open = !!subOpen[subKey];
          return (
            <div key={subKey} style={{ borderBottom: si < sections.length - 1 ? '1px solid rgba(196,168,85,0.08)' : 'none' }}>
              <div
                onClick={() => toggleSub(subKey)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', padding: '5px 0', userSelect: 'none' }}
              >
                <span style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', color: 'var(--brass)', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>▸</span>
                <span style={{ fontSize: 'calc(11px * var(--system-ratio, 1))', fontFamily: 'var(--font-ui)', color: open ? 'var(--gold)' : 'var(--ink-subtle)', fontWeight: 600, letterSpacing: 1, transition: 'color 0.2s' }}>{sectionItem.title}</span>
              </div>
              <div style={{
                overflow: 'hidden',
                maxHeight: open ? '800px' : '0px',
                opacity: open ? 1 : 0,
                transition: 'max-height 0.35s ease, opacity 0.25s ease, padding 0.35s ease',
                paddingLeft: 18,
                paddingTop: open ? 4 : 0,
                paddingBottom: open ? 6 : 0,
              }}>
                <div style={{ fontSize: 'calc(12px * var(--system-ratio, 1))', fontFamily: 'var(--font-body)', color: 'var(--text-light)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                  {sectionItem.body}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <motion.div
      initial="enter"
      animate="visible"
      exit="exit"
      variants={{ enter: { opacity: 0 }, visible: { opacity: 1 }, exit: { opacity: 0 } }}
      transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
      style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', flexDirection: isMobile ? 'column' : 'row', borderRadius: 4 }}
    >
      {isMobile && <MobilePageToggle left="属性·记录" right="技能·档案" side={side} onSide={setSide} />}
      {/* Left page — Characteristics + Secondary + Identity */}
      <motion.div style={{
        flex: '1 1 0', display: isMobile && side !== 'left' ? 'none' : 'flex', flexDirection: 'column',
        background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
        borderRadius: '3px 0 0 3px',
        boxShadow: 'inset -1px 0 2px rgba(0,0,0,0.2)',
        padding: '28px 20px 20px 28px',
        overflow: 'hidden',
      }}>
        <div style={{ borderBottom: '1px solid rgba(196,168,85,0.25)', paddingBottom: 8, marginBottom: 12 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(18px * var(--system-ratio, 1))', color: 'var(--gold)', letterSpacing: 4, margin: 0 }}>
            调查员记录
          </h3>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'calc(8px * var(--system-ratio, 1))', color: 'var(--ink-faded)', letterSpacing: 2 }}>
            INVESTIGATOR RECORD
          </span>
        </div>

        <div className="inv-scroll" style={{
          flex: 1, overflowY: 'auto', minHeight: 0,
          scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.2)',
        }}>
          {/* Identity header */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            <div style={{
              width: 44, height: 56, border: '1px solid rgba(196,168,85,0.3)', borderRadius: 3,
              background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span style={{ fontSize: 'calc(16px * var(--system-ratio, 1))', color: 'var(--gold)' }}>&#9733;</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 'calc(16px * var(--system-ratio, 1))', fontFamily: 'var(--font-display)', color: 'var(--gold)', letterSpacing: 2 }}>
                {identity.name || '未命名'}
              </div>
              <div style={{ fontSize: 'calc(11px * var(--system-ratio, 1))', fontFamily: 'var(--font-ui)', color: 'var(--ink-subtle)', letterSpacing: 1 }}>
                {identity.occupation}
              </div>
              <div style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', color: 'var(--brass)', letterSpacing: 1, marginTop: 2 }}>
                {[identity.age ? `${identity.age}岁` : '', identity.gender, identity.residence].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>

          {/* Characteristics */}
          <div style={sectionLabel}>基础属性 · CHARACTERISTICS</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            {CHAR_ORDER.map(({ key, zh, en }) => {
              const val = chars[key] ?? DEFAULT_CHARS[key];
              const half = hf[key]?.half ?? Math.floor(val / 2);
              const fifth = hf[key]?.fifth ?? Math.floor(val / 5);
              return (
                <div key={key} style={{
                  padding: '8px 10px', border: '1px solid rgba(196,168,85,0.15)', borderRadius: 4,
                  background: 'rgba(196,168,85,0.06)', display: 'flex', flexDirection: 'column', gap: 3,
                }}>
                  <div style={{ fontSize: 'calc(10px * var(--system-ratio, 1))', color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>{zh}</div>
                  <div style={{ fontSize: 'calc(22px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold)', lineHeight: 1 }}>{val}</div>
                  <div style={{ display: 'flex', gap: 6, fontSize: 'calc(9px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)' }}>
                    <span>1/2 {half}</span>
                    <span>1/5 {fifth}</span>
                  </div>
                  <div style={{ fontSize: 'calc(8px * var(--system-ratio, 1))', color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>{en}</div>
                </div>
              );
            })}
          </div>

          {/* Secondary stats */}
          <div style={sectionLabel}>衍生属性 · SECONDARY</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
            {SECONDARY_STATS.map((s) => (
              <div key={s.key} title={s.tip} style={{
                padding: '8px 6px', border: '1px solid rgba(196,168,85,0.15)', borderRadius: 3,
                background: 'rgba(196,168,85,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                cursor: s.tip ? 'help' : 'default',
              }}>
                <div style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>{s.zh}</div>
                <div style={{ fontSize: 'calc(16px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', fontWeight: 700, color: s.color }}>{renderSecValue(s.key)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 当前姿态 + 状态条件 */}
        <div style={{ marginBottom: 14 }}>
          <div style={sectionLabel}>状态 · CONDITION</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 'calc(11px * var(--system-ratio, 1))', color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>当前姿态</span>
            <span style={{
              fontSize: 'calc(13px * var(--system-ratio, 1))', fontFamily: 'var(--font-display)', color: 'var(--gold)', letterSpacing: 2,
              padding: '2px 10px', borderRadius: 3, border: '1px solid rgba(196,168,85,0.3)', background: 'rgba(196,168,85,0.08)',
            }}>{sheet.posture || '站立'}</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sheet.statusConditions.length === 0 ? (
              <span style={{ fontSize: 'calc(11px * var(--system-ratio, 1))', color: 'var(--ink-faded)', fontStyle: 'italic', fontFamily: 'var(--font-body)' }}>无异常状态</span>
            ) : (
              sheet.statusConditions.map((c, i) => {
                const tone = SEVERITY_TONE[c.severity] || SEVERITY_TONE.moderate;
                return (
                  <span key={i} title={c.description} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 'calc(11px * var(--system-ratio, 1))', fontFamily: 'var(--font-ui)', letterSpacing: 0.5, whiteSpace: 'nowrap',
                    padding: '3px 9px', borderRadius: 10,
                    color: tone.color, background: tone.bg, border: `1px solid ${tone.color}`,
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: tone.color }} />
                    {c.name}
                  </span>
                );
              })
            )}
          </div>
        </div>

        <div style={{
          borderTop: '1px solid rgba(196,168,85,0.15)', paddingTop: 8, marginTop: 6,
          display: 'flex', justifyContent: 'space-between',
          fontSize: 'calc(9px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', color: 'var(--ink-faded)', letterSpacing: 1,
        }}>
          <span>{identity.id || '—'}</span>
          <span>COC 7th Edition</span>
        </div>
      </motion.div>

      {/* Spine */}
      <div style={{
        width: 2, flexShrink: 0, display: isMobile ? 'none' : 'block',
        background: 'linear-gradient(to right, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.4) 100%)',
      }} />

      {/* Right page — Skills + Dossier */}
      <motion.div
        variants={isMobile ? undefined : { exit: { rotateY: -180 } }}
        transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
        style={{
          flex: '1 1 0', display: isMobile && side !== 'right' ? 'none' : 'flex', flexDirection: 'column',
          background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
          borderRadius: '0 3px 3px 0',
          boxShadow: 'inset 1px 0 2px rgba(0,0,0,0.2)',
          padding: '28px 28px 20px 20px',
          transformOrigin: '0% 50%',
          backfaceVisibility: 'hidden',
          overflow: 'hidden',
        }}>
        <div style={{ borderBottom: '1px solid rgba(196,168,85,0.25)', paddingBottom: 8, marginBottom: 8 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'calc(18px * var(--system-ratio, 1))', color: 'var(--gold)', letterSpacing: 4, margin: 0 }}>
            技能 · 档案
          </h3>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'calc(8px * var(--system-ratio, 1))', color: 'var(--ink-faded)', letterSpacing: 2 }}>
            SKILLS · DOSSIER
          </span>
        </div>

        <div className="inv-scroll" style={{
          flex: 1, overflowY: 'auto', minHeight: 0,
          scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.2)',
        }}>
          {/* Skills */}
          <div style={sectionLabel}>已习得技能 · SKILLS ({skillEntries.length})</div>
          {skillEntries.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 'calc(12px * var(--system-ratio, 1))', fontFamily: 'var(--font-body)', color: 'var(--ink-faded)', fontStyle: 'italic' }}>
              暂无已习得技能
            </div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              {/* column header */}
              <div style={{ display: 'flex', alignItems: 'center', paddingBottom: 4, borderBottom: '1px solid rgba(196,168,85,0.12)', marginBottom: 2 }}>
                <span style={{ flex: 1, fontSize: 'calc(9px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', color: 'var(--ink-faded)', letterSpacing: 1 }}>名称</span>
                <span style={{ width: 40, textAlign: 'center', fontSize: 'calc(9px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', color: 'var(--ink-faded)' }}>基础</span>
                <span style={{ width: 44, textAlign: 'center', fontSize: 'calc(9px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', color: 'var(--ink-faded)' }}>当前</span>
                <span style={{ width: 56, textAlign: 'center', fontSize: 'calc(9px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', color: 'var(--ink-faded)' }}>半/五</span>
              </div>
              {skillEntries.map(([name, skill]) => {
                const half = Math.floor(skill.current / 2);
                const fifth = Math.floor(skill.current / 5);
                return (
                  <div key={name} className="cv-row" style={{ display: 'flex', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid rgba(196,168,85,0.08)' }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 'calc(12px * var(--system-ratio, 1))', fontFamily: 'var(--font-body)', color: 'var(--text-light)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    <span style={{ width: 40, textAlign: 'center', fontSize: 'calc(11px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)' }}>{skill.base}</span>
                    <span style={{ width: 44, textAlign: 'center', fontSize: 'calc(12px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', color: 'var(--gold)', fontWeight: 700 }}>{skill.current}</span>
                    <span style={{ width: 56, textAlign: 'center', fontSize: 'calc(10px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)' }}>{half}/{fifth}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Dossier */}
          <div style={sectionLabel}>个人档案 · DOSSIER</div>
          <div style={{ border: '1px solid rgba(196,168,85,0.15)', borderRadius: 3, overflow: 'hidden' }}>
            {DOSSIER_FIELDS.every(({ key }) => !(sheet[key] as string)?.trim()) ? (
              <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 'calc(12px * var(--system-ratio, 1))', fontFamily: 'var(--font-body)', color: 'var(--ink-faded)', fontStyle: 'italic' }}>
                暂无档案记录
              </div>
            ) : (
              DOSSIER_FIELDS.map(({ key, label }, i) => {
                const content = (sheet[key] as string)?.trim();
                if (!content) return null;
                const open = !!dossierOpen[key];
                return (
                  <div key={key} style={{ borderBottom: i < DOSSIER_FIELDS.length - 1 ? '1px solid rgba(196,168,85,0.08)' : 'none' }}>
                    <div
                      onClick={() => toggleDossier(key)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', userSelect: 'none' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.04)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', color: 'var(--gold)', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', width: 12, textAlign: 'center', flexShrink: 0 }}>▸</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 'calc(12px * var(--system-ratio, 1))', fontFamily: 'var(--font-ui)', color: 'var(--gold)', fontWeight: 600, letterSpacing: 1 }}>{label}</div>
                      </div>
                      <span style={{ fontSize: 'calc(9px * var(--system-ratio, 1))', fontFamily: 'var(--font-mono)', color: 'var(--ink-faded)', letterSpacing: 1 }}>{open ? '收起' : '展开'}</span>
                    </div>
                    <div style={{
                      overflow: 'hidden',
                      maxHeight: open ? '3000px' : '0px',
                      opacity: open ? 1 : 0,
                      transition: 'max-height 0.4s ease, opacity 0.3s ease',
                      borderTop: open ? '1px dashed rgba(196,168,85,0.12)' : 'none',
                    }}>
                      <div style={{ padding: '4px 14px 14px 34px', fontSize: 'calc(12px * var(--system-ratio, 1))', fontFamily: 'var(--font-body)', color: 'var(--text-light)', lineHeight: 1.9, whiteSpace: 'pre-wrap' }}>
                        {renderDossierContent(content, key)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div style={{
          borderTop: '1px solid rgba(196,168,85,0.15)', paddingTop: 8, marginTop: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          fontSize: 'calc(11px * var(--system-ratio, 1))', fontFamily: 'var(--font-ui)', color: 'var(--ink-faded)', letterSpacing: 2,
        }}>
          <span>技能 {skillEntries.length} 项</span>
          <button
            type="button"
            onClick={() => hasTicked && setDevOpen(true)}
            disabled={!hasTicked}
            title={hasTicked ? '本章结算技能成长' : '尚无触发成长检定的技能'}
            style={{
              padding: '5px 14px',
              border: `1px solid ${hasTicked ? 'var(--brass)' : 'rgba(196,168,85,0.25)'}`,
              borderRadius: 4,
              background: hasTicked ? 'rgba(196,168,85,0.10)' : 'transparent',
              color: hasTicked ? 'var(--gold)' : 'var(--ink-faded)',
              fontSize: 'calc(11px * var(--system-ratio, 1))', fontFamily: 'var(--font-ui)',
              cursor: hasTicked ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
              letterSpacing: 2,
            }}
            onMouseEnter={(e) => {
              if (!hasTicked) return;
              e.currentTarget.style.background = 'rgba(196,168,85,0.22)';
              e.currentTarget.style.transform = 'scale(1.04)';
            }}
            onMouseLeave={(e) => {
              if (!hasTicked) return;
              e.currentTarget.style.background = 'rgba(196,168,85,0.10)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
            onMouseDown={(e) => { if (hasTicked) e.currentTarget.style.transform = 'scale(0.97)'; }}
            onMouseUp={(e) => { if (hasTicked) e.currentTarget.style.transform = 'scale(1.04)'; }}
          >
            结束本章·发展期
          </button>
        </div>
      </motion.div>
      <DevelopmentPhaseModal open={devOpen} onClose={() => setDevOpen(false)} />
    </motion.div>
  );
}

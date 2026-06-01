import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { sectionTitle, btnBase, inputStyle } from '../styles';

interface Props {
  description: string;
  onSetDescription: (v: string) => void;
  beliefs: string;
  onSetBeliefs: (v: string) => void;
  significantPeople: string;
  onSetSignificantPeople: (v: string) => void;
  meaningfulLocations: string;
  onSetMeaningfulLocations: (v: string) => void;
  treasuredPossessions: string;
  onSetTreasuredPossessions: (v: string) => void;
  traits: string;
  onSetTraits: (v: string) => void;
  injuries: string;
  onSetInjuries: (v: string) => void;
  phobias: string;
  onSetPhobias: (v: string) => void;
  quickFilling: boolean;
  quickFillError: string;
  onQuickFill: () => void;
  openField: string | null;
  onSetOpenField: (v: string | null) => void;
}

interface FieldDef {
  label: string;
  value: string;
  set: (v: string) => void;
  hint: string;
}

export function StepBackground({
  description, onSetDescription,
  beliefs, onSetBeliefs,
  significantPeople, onSetSignificantPeople,
  meaningfulLocations, onSetMeaningfulLocations,
  treasuredPossessions, onSetTreasuredPossessions,
  traits, onSetTraits,
  injuries, onSetInjuries,
  phobias, onSetPhobias,
  quickFilling,
  quickFillError,
  onQuickFill,
  openField, onSetOpenField,
}: Props) {
  const accordionRef = useRef<HTMLDivElement>(null);

  // Scroll expanded field to viewport top
  useEffect(() => {
    if (openField && accordionRef.current) {
      const timer = setTimeout(() => {
        accordionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [openField]);

  const fields: FieldDef[] = [
    { label: '个人描述 Description', value: description, set: onSetDescription, hint: '例如：身材高瘦，戴圆框眼镜，右手有烧伤疤痕' },
    { label: '思想/信念 Beliefs', value: beliefs, set: onSetBeliefs, hint: '例如：相信科学能解释一切，但近来开始怀疑' },
    { label: '重要之人 Significant People', value: significantPeople, set: onSetSignificantPeople, hint: '例如：大学导师亨利·阿米蒂奇教授' },
    { label: '重要场所 Meaningful Locations', value: meaningfulLocations, set: onSetMeaningfulLocations, hint: '例如：密斯卡塔尼克大学图书馆地下室' },
    { label: '珍贵之物 Treasured Possessions', value: treasuredPossessions, set: onSetTreasuredPossessions, hint: '例如：父亲留下的银怀表' },
    { label: '特质 Traits', value: traits, set: onSetTraits, hint: '例如：缄默、固执、好奇心强' },
    { label: '伤口/伤痕 Injuries', value: injuries, set: onSetInjuries, hint: '例如：右膝旧伤，雨天会隐隐作痛' },
    { label: '恐惧症/狂躁症 Phobias', value: phobias, set: onSetPhobias, hint: '例如：幽闭恐惧症，无法忍受狭小封闭空间' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
      <div style={sectionTitle}>背景故事 BACKGROUND</div>

      {/* Quick Fill */}
      <div style={{
        padding: '10px 12px', border: '1px solid rgba(196,168,85,0.15)', borderRadius: 4,
        background: 'rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: 10,
        flexShrink: 0,
      }}>
        <button onClick={onQuickFill} disabled={quickFilling} className="sk-btn"
          style={{
            ...btnBase, fontSize: 11, padding: '6px 16px',
            opacity: quickFilling ? 0.5 : 1, cursor: quickFilling ? 'wait' : 'pointer',
          }}>
          {quickFilling ? '生成中...' : '\u2728 快速填充'}
        </button>
        <span style={{ fontSize: 10, color: 'var(--ink-subtle)', fontFamily: 'var(--font-body)' }}>
          由 AI 根据身份和属性自动生成背景故事
        </span>
      </div>
      {quickFillError && (
        <div style={{
          padding: '8px 12px', border: '1px solid rgba(255,82,82,0.3)', borderRadius: 4,
          background: 'rgba(139,58,58,0.1)', color: 'var(--blood)', fontSize: 11,
          fontFamily: 'var(--font-body)', flexShrink: 0,
          whiteSpace: 'pre-line', lineHeight: 1.6,
        }}>
          {quickFillError}
        </div>
      )}

      {/* Accordion — fills remaining height */}
      <div ref={accordionRef} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header tabs at top — no gap, marginBottom per item for smooth collapse */}
        <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          {fields.map((f) => {
            const isOpen = openField === f.label;
            const isHidden = openField !== null && openField !== f.label;
            const hasContent = !!f.value;
            return (
              <div
                key={f.label}
                onClick={() => onSetOpenField(isOpen ? null : f.label)}
                onMouseEnter={(e) => {
                  if (isHidden) return;
                  e.currentTarget.style.background = isOpen ? 'rgba(196,168,85,0.12)' : 'rgba(196,168,85,0.07)';
                  e.currentTarget.style.borderColor = 'rgba(196,168,85,0.50)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isOpen ? 'rgba(196,168,85,0.06)' : hasContent ? 'rgba(196,168,85,0.03)' : 'rgba(0,0,0,0.04)';
                  e.currentTarget.style.borderColor = isOpen ? 'rgba(196,168,85,0.35)' : hasContent ? 'rgba(196,168,85,0.22)' : 'rgba(196,168,85,0.1)';
                }}
                onMouseDown={(e) => {
                  if (isHidden) return;
                  e.currentTarget.style.transform = 'scale(0.97)';
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: isHidden ? '0 10px' : '4px 10px',
                  cursor: 'pointer', userSelect: 'none',
                  borderStyle: 'solid',
                  borderColor: isOpen ? 'rgba(196,168,85,0.35)' : hasContent ? 'rgba(196,168,85,0.22)' : 'rgba(196,168,85,0.1)',
                  borderWidth: isHidden ? '0px' : '1px',
                  borderRadius: 4,
                  background: isOpen ? 'rgba(196,168,85,0.06)' : hasContent ? 'rgba(196,168,85,0.03)' : 'rgba(0,0,0,0.04)',
                  overflow: 'hidden',
                  maxHeight: isHidden ? '0px' : '30px',
                  opacity: isHidden ? 0 : 1,
                  minHeight: isHidden ? '0px' : '30px',
                  marginBottom: isHidden ? '0px' : '4px',
                  transform: 'scale(1)',
                  transition: 'max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.35s cubic-bezier(0.4,0,0.2,1), margin-bottom 0.4s cubic-bezier(0.4,0,0.2,1), padding 0.4s cubic-bezier(0.4,0,0.2,1), min-height 0.4s cubic-bezier(0.4,0,0.2,1), border-width 0.4s cubic-bezier(0.4,0,0.2,1), transform 0.15s cubic-bezier(0.4,0,0.2,1), background 0.2s cubic-bezier(0.4,0,0.2,1), border-color 0.2s cubic-bezier(0.4,0,0.2,1)',
                }}
              >
                <span style={{ fontSize: 11, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', letterSpacing: 2 }}>{f.label}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {hasContent ? (
                    <span style={{ fontSize: 10, color: 'var(--text-light)', fontFamily: 'var(--font-body)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.value}</span>
                  ) : null}
                  <span style={{ color: 'var(--gold)', fontSize: 10, transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)', transform: isOpen ? 'rotate(180deg)' : 'none' }}>{'\u25bc'}</span>
                </span>
              </div>
            );
          })}
        </div>
        {/* Input panel — AnimatePresence for smooth bezier expand/collapse */}
        <AnimatePresence>
          {openField && (
            <motion.div
              key={openField}
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: 'auto', opacity: 1, marginTop: 6 }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
              style={{
                flex: 1, overflow: 'hidden',
                display: 'flex', flexDirection: 'column', minHeight: 0,
              }}
            >
              {(() => {
                const f = fields.find((x) => x.label === openField)!;
                return (
                  <textarea
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    className="bg-input"
                    style={{ ...inputStyle, flex: 1, resize: 'none', textAlign: 'left', overflowY: 'auto' }}
                    placeholder={f.hint}
                  />
                );
              })()}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

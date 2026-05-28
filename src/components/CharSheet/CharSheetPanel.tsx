import { useEffect, useCallback, useState } from 'react';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { CharGrid } from './CharGrid';
import { SecStats } from './SecStats';
import { SkillsTable } from './SkillsTable';
import { InvestigatorCard } from './InvestigatorCard';

export function CharSheetPanel() {
  const isOpen = useCharSheetStore((s) => s.isOpen);
  const close = useCharSheetStore((s) => s.close);
  const sheet = useCharSheetStore((s) => s.sheet);

  const [dossierOpen, setDossierOpen] = useState<Record<string, boolean>>({});
  const [subOpen, setSubOpen] = useState<Record<string, boolean>>({});
  const toggleDossier = (k: string) => setDossierOpen((p) => ({ ...p, [k]: !p[k] }));
  const toggleSub = (k: string) => setSubOpen((p) => ({ ...p, [k]: !p[k] }));

  /** Parse description into 【section】 blocks, or null if no sections found */
  function parseSections(text: string): { title: string; body: string }[] | null {
    const parts = text.split(/【(.+?)】/);
    if (parts.length <= 2) return null; // no 【】 markers
    // parts[0] = prefix text before first 【, parts[1] = title1, parts[2] = body1, parts[3] = title2, ...
    const sections: { title: string; body: string }[] = [];
    if (parts[0].trim()) {
      sections.push({ title: '简介', body: parts[0].trim() });
    }
    for (let i = 1; i < parts.length; i += 2) {
      const title = parts[i];
      const body = (parts[i + 1] || '').trim();
      if (body) sections.push({ title, body });
    }
    return sections.length > 0 ? sections : null;
  }

  /** Render content — if it has 【】sections, show as nested accordion */
  function renderDossierContent(content: string, parentKey: string) {
    const sections = parseSections(content);
    if (!sections) return <>{content}</>;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {sections.map((sec, si) => {
          const subKey = `${parentKey}_${si}`;
          const open = !!subOpen[subKey];
          return (
            <div key={subKey} style={{ borderBottom: si < sections.length - 1 ? '1px solid rgba(196,168,85,0.04)' : 'none', paddingBottom: si < sections.length - 1 ? 4 : 0, marginBottom: si < sections.length - 1 ? 4 : 0 }}>
              <div
                onClick={() => toggleSub(subKey)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                  padding: '3px 0', userSelect: 'none',
                }}
              >
                <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--brass)', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▸</span>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-ui)', color: 'var(--gold)', fontWeight: 600, letterSpacing: 1 }}>{sec.title}</span>
              </div>
              {open && (
                <div style={{ padding: '4px 0 4px 18px', fontSize: 12, fontFamily: 'var(--font-body)', color: 'var(--text-light)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                  {sec.body}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const DOSSIER_FIELDS = [
    { key: 'description' as const, label: '个人描述', en: 'Physical Description' },
    { key: 'personality' as const, label: '性格特征', en: 'Personality Profile' },
    { key: 'scenario' as const, label: '场景设定', en: 'Case File / Scenario' },
    { key: 'personaDescription' as const, label: '角色设定', en: 'Persona Directive' },
  ];

  const handleEsc = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    },
    [close],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, handleEsc]);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={close}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 700,
            background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(2px)',
          }}
        />
      )}

      {/* Slide-out panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: 400,
          maxWidth: '92vw',
          zIndex: 750,
          transform: isOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
          borderRight: '1px solid rgba(196,168,85,0.2)',
          boxShadow: '4px 0 40px rgba(0,0,0,0.5)',
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--ink-faded) transparent',
        }}
      >
        {/* Title */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px 14px',
            borderBottom: '1px solid rgba(196,168,85,0.18)',
            background: 'rgba(13,10,7,0.5)',
            flexShrink: 0,
            position: 'sticky',
            top: 0,
            zIndex: 2,
            backdropFilter: 'blur(8px)',
          }}
        >
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 18,
              color: 'var(--gold)',
              letterSpacing: 4,
              margin: 0,
            }}
          >
            调查员记录卡
          </h3>
          <button
            onClick={close}
            style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid transparent',
              borderRadius: 3,
              background: 'transparent',
              color: 'var(--ink-subtle)',
              fontSize: 16,
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--gold)';
              e.currentTarget.style.borderColor = 'var(--brass)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--ink-subtle)';
              e.currentTarget.style.borderColor = 'transparent';
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            padding: '16px 20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {/* Section: Characteristics */}
          <div>
            <div
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-ui)',
                color: 'var(--ink-subtle)',
                letterSpacing: 3,
                marginBottom: 10,
                textTransform: 'uppercase',
              }}
            >
              基础属性 · CHARACTERISTICS
            </div>
            <CharGrid />
          </div>

          {/* Section: Secondary stats */}
          <div>
            <div
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-ui)',
                color: 'var(--ink-subtle)',
                letterSpacing: 3,
                marginBottom: 10,
                textTransform: 'uppercase',
              }}
            >
              衍生属性 · SECONDARY
            </div>
            <SecStats />
          </div>

          {/* Section: Skills */}
          <SkillsTable />

          {/* Section: Identity card */}
          <div>
            <div
              style={{
                fontSize: 10,
                fontFamily: 'var(--font-ui)',
                color: 'var(--ink-subtle)',
                letterSpacing: 3,
                marginBottom: 10,
                textTransform: 'uppercase',
              }}
            >
              身份信息 · IDENTITY
            </div>
            <InvestigatorCard />
          </div>

          {/* Section: Personal Dossier — archive file style */}
          <div>
            <div style={{
              fontSize: 10, fontFamily: 'var(--font-ui)', color: 'var(--ink-subtle)',
              letterSpacing: 3, marginBottom: 10, textTransform: 'uppercase',
            }}>
              个人档案 · DOSSIER
            </div>
            <div style={{
              border: '1px solid rgba(196,168,85,0.15)',
              borderRadius: 3,
              background: 'linear-gradient(180deg, rgba(26,22,16,0.6) 0%, rgba(18,14,10,0.4) 100%)',
              overflow: 'hidden',
              boxShadow: 'inset 0 1px 0 rgba(196,168,85,0.05)',
            }}>
              {DOSSIER_FIELDS.map(({ key, label, en }, i) => {
                const content = (sheet[key] as string)?.trim();
                if (!content) return null;
                const open = !!dossierOpen[key];
                return (
                  <div key={key} style={{ borderBottom: i < DOSSIER_FIELDS.length - 1 ? '1px solid rgba(196,168,85,0.06)' : 'none' }}>
                    <div
                      onClick={() => toggleDossier(key)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 16px', cursor: 'pointer',
                        transition: 'background 0.25s',
                        userSelect: 'none',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.03)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span style={{
                        fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--gold)',
                        transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s',
                        width: 14, textAlign: 'center', flexShrink: 0,
                      }}>▸</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontFamily: 'var(--font-ui)', color: 'var(--gold)', fontWeight: 600, letterSpacing: 1 }}>{label}</div>
                        <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--ink-faded)', letterSpacing: 2, textTransform: 'uppercase', marginTop: 2 }}>{en}</div>
                      </div>
                      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--ink-faded)', letterSpacing: 1 }}>
                        {open ? '— 收起' : '— 展开'}
                      </span>
                    </div>
                    {open && (
                      <div style={{
                        padding: '4px 16px 16px 40px',
                        fontSize: 12, fontFamily: 'var(--font-body)',
                        color: 'var(--text-light)', lineHeight: 1.9, whiteSpace: 'pre-wrap',
                        borderTop: '1px dashed rgba(196,168,85,0.08)',
                      }}>
                        {renderDossierContent(content, key)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

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
  const toggleDossier = (k: string) => setDossierOpen((p) => ({ ...p, [k]: !p[k] }));

  const DOSSIER_FIELDS = [
    { key: 'description' as const, label: '个人描述', icon: '📋' },
    { key: 'personality' as const, label: '性格特征', icon: '🧠' },
    { key: 'scenario' as const, label: '场景设定', icon: '🎭' },
    { key: 'personaDescription' as const, label: '角色设定', icon: '🎭' },
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

          {/* Section: Personal Dossier */}
          <div>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-ui)', color: 'var(--ink-subtle)', letterSpacing: 3, marginBottom: 10, textTransform: 'uppercase' }}>
              个人信息档案 · DOSSIER
            </div>
            <div style={{ border: '1px solid rgba(196,168,85,0.12)', borderRadius: 4, background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              {DOSSIER_FIELDS.map(({ key, label, icon }, i) => {
                const content = (sheet[key] as string)?.trim();
                if (!content) return null;
                const open = !!dossierOpen[key];
                return (
                  <div key={key}>
                    <div
                      onClick={() => toggleDossier(key)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 14px', cursor: 'pointer',
                        borderBottom: open ? '1px solid rgba(196,168,85,0.08)' : 'none',
                        fontSize: 12, fontFamily: 'var(--font-ui)', color: 'var(--gold)',
                        fontWeight: 600, letterSpacing: 1, userSelect: 'none',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.04)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span>{icon} {label}</span>
                      <span style={{ fontSize: 10, color: 'var(--ink-faded)', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▶</span>
                    </div>
                    {open && (
                      <div style={{
                        padding: '12px 14px', fontSize: 12, fontFamily: 'var(--font-body)',
                        color: 'var(--text-light)', lineHeight: 1.8, whiteSpace: 'pre-wrap',
                        borderBottom: i < DOSSIER_FIELDS.length - 1 ? '1px solid rgba(196,168,85,0.06)' : 'none',
                      }}>
                        {content}
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

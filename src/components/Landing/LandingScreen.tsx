import { useState } from 'react';
import { SettingsPanel } from '../Settings/SettingsPanel';
import { LoadGameModal } from './LoadGameModal';

interface Props { onStart: () => void; onLoadGame: () => void }

export function LandingScreen({ onStart, onLoadGame }: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const [showLoad, setShowLoad] = useState(false);

  return (
    <>
      <div style={{
        position: 'fixed', inset: 0, zIndex: 500,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(ellipse at center, #1f1810 0%, var(--void) 70%)',
      }}>
        <div style={{ textAlign: 'center', maxWidth: 520 }}>
          <div style={{
            width: 100, height: 100, margin: '0 auto 32px',
            border: '2px solid var(--gold)', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 40px rgba(196,168,85,0.12)'
          }}>
            <span style={{ fontSize: 36, color: 'var(--gold)' }}>&#9733;</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36, color: 'var(--gold)', letterSpacing: 12, marginBottom: 8 }}>深渊档案馆</h1>
          <p style={{ fontSize: 12, color: 'var(--ink-subtle)', letterSpacing: 6, marginBottom: 48 }}>ABYSSAL ARCHIVE</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
            <button onClick={onStart} style={{
              width: 280, padding: '14px 0', border: '1px solid var(--gold)', background: 'rgba(196,168,85,0.1)', color: 'var(--gold)',
              fontFamily: 'var(--font-ui)', fontSize: 15, letterSpacing: 6, borderRadius: 3, cursor: 'pointer',
              transition: 'var(--transition-smooth)', transform: 'scale(1)', filter: 'brightness(1)',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.4)'; e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(196,168,85,0.15)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)'; e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}
              onMouseDown={(e) => { e.currentTarget.style.filter = 'brightness(0.9)'; e.currentTarget.style.transform = 'scale(0.97)'; }}
              onMouseUp={(e) => { e.currentTarget.style.filter = 'brightness(1.4)'; e.currentTarget.style.transform = 'scale(1.04)'; }}
            >开 始 游 戏</button>
            <button onClick={() => setShowLoad(true)} style={{
              width: 280, padding: '14px 0', border: '1px solid var(--brass)', background: 'rgba(42,31,20,0.5)', color: 'var(--text-light)',
              fontFamily: 'var(--font-ui)', fontSize: 15, letterSpacing: 6, borderRadius: 3, cursor: 'pointer',
              transition: 'var(--transition-smooth)', transform: 'scale(1)', filter: 'brightness(1)',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.3)'; e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)'; e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'var(--brass)'; e.currentTarget.style.color = 'var(--text-light)'; }}
              onMouseDown={(e) => { e.currentTarget.style.filter = 'brightness(0.9)'; e.currentTarget.style.transform = 'scale(0.97)'; }}
              onMouseUp={(e) => { e.currentTarget.style.filter = 'brightness(1.3)'; e.currentTarget.style.transform = 'scale(1.03)'; }}
            >读 取 游 戏</button>
            <button onClick={() => setShowSettings(true)} style={{
              width: 280, padding: '14px 0', border: '1px solid var(--brass)', background: 'rgba(42,31,20,0.5)', color: 'var(--text-light)',
              fontFamily: 'var(--font-ui)', fontSize: 15, letterSpacing: 6, borderRadius: 3, cursor: 'pointer',
              transition: 'var(--transition-smooth)', transform: 'scale(1)', filter: 'brightness(1)',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.3)'; e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gold)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(1)'; e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'var(--brass)'; e.currentTarget.style.color = 'var(--text-light)'; }}
              onMouseDown={(e) => { e.currentTarget.style.filter = 'brightness(0.9)'; e.currentTarget.style.transform = 'scale(0.97)'; }}
              onMouseUp={(e) => { e.currentTarget.style.filter = 'brightness(1.3)'; e.currentTarget.style.transform = 'scale(1.03)'; }}
            >设 置</button>
          </div>
          <p style={{ marginTop: 64, fontSize: 10, color: 'var(--ink-subtle)', letterSpacing: 3, opacity: 0.5 }}>
            v1.0.0 · COC 7th Edition · <span onClick={() => document.dispatchEvent(new CustomEvent('show-changelog'))} style={{ cursor: 'pointer', borderBottom: '1px dotted var(--ink-subtle)' }}>更新日志</span>
          </p>
        </div>
      </div>

      {/* Load game modal */}
      {showLoad && <LoadGameModal onLoad={onLoadGame} onClose={() => setShowLoad(false)} />}

      {/* Settings panel with higher z-index than landing */}
      <SettingsPanel
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        onReturnToMenu={() => setShowSettings(false)}
      />
    </>
  );
}

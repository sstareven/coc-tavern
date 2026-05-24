import { useState } from 'react';
import { useBookStore } from '../../stores/useBookStore';
import { usePanelStore } from '../../stores/usePanelStore';

export function InputBar() {
  const [input, setInput] = useState('');

  const submit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    console.log('[InputBar]', trimmed);
    useBookStore.getState().nextPage();
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const toggleDiceHistory = () => {
    const panelStore = usePanelStore.getState();
    if (panelStore.openPanel === 'diceHistory') {
      panelStore.closeAll();
    } else {
      panelStore.open('diceHistory');
    }
  };

  return (
    <footer style={{
      display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      padding: '10px 24px', borderTop: '1px solid rgba(196,168,85,0.15)',
      background: 'rgba(13,10,7,0.85)', backdropFilter: 'blur(8px)',
    }}>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入行动或对话..."
        style={{
          flex: 1, padding: '10px 16px',
          border: '1px solid var(--brass)', borderRadius: 3,
          background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)',
          fontFamily: 'var(--font-ui)', fontSize: 14, letterSpacing: 1,
          outline: 'none', caretColor: 'var(--gold)',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
      />
      <button onClick={toggleDiceHistory} title="检定记录" style={{
        padding: '10px 12px', border: '1px solid var(--brass)',
        background: 'rgba(0,0,0,0.2)', color: 'var(--ink-subtle)',
        fontFamily: 'var(--font-display)', fontSize: 14,
        borderRadius: 3, cursor: 'pointer', transition: 'var(--transition-smooth)',
      }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--gold)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'var(--brass)'; }}
      >
        &#9861;
      </button>
      <button onClick={submit} style={{
        padding: '10px 28px', border: '1px solid var(--gold)',
        background: 'rgba(196,168,85,0.1)', color: 'var(--gold)',
        fontFamily: 'var(--font-ui)', fontSize: 14, letterSpacing: 4,
        borderRadius: 3, cursor: 'pointer', whiteSpace: 'nowrap',
        transition: 'var(--transition-smooth)',
      }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.2)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.1)'; }}
      >
        推 进
      </button>
    </footer>
  );
}

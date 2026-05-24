import type { ChoiceItem } from '../../types';

interface Props {
  header: string;
  content: string;
  choices: ChoiceItem[];
  isFlipping?: boolean;
}

function fillInputBar(text: string) {
  const input = document.querySelector<HTMLInputElement>('footer input[type="text"]');
  if (!input) return;
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  nativeInputValueSetter?.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.focus();
}

export function RightPage({ header, content, choices, isFlipping }: Props) {
  const fadeStyle = {
    opacity: isFlipping ? 0 : 1,
    transition: isFlipping ? 'opacity 0.35s ease-in' : 'opacity 0.6s ease-out 0.6s',
  };
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '28px 28px 20px 24px', background: 'linear-gradient(225deg, var(--parchment) 0%, var(--parchment-deep) 100%)', borderTopRightRadius: 4, borderBottomRightRadius: 4, boxShadow: 'inset 1px 0 2px rgba(0,0,0,0.04)', color: 'var(--ink)', fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.75, position: 'relative' }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ink)', letterSpacing: 4, marginBottom: 16, borderBottom: '1px solid rgba(107,90,58,0.25)', paddingBottom: 10, ...fadeStyle }}>{header}</h3>
      <p style={{ textIndent: '2em', marginBottom: 18, color: 'var(--ink)', ...fadeStyle }}>{content}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflowY: 'auto', paddingRight: 4, scrollbarWidth: 'thin', scrollbarColor: 'var(--ink-faded) transparent', ...fadeStyle }}>
        {choices.map((ch) => (
          <button
            key={ch.num}
            onClick={() => fillInputBar(ch.action)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 14px',
              border: '1px solid rgba(107,90,58,0.2)',
              borderRadius: 3,
              background: 'rgba(196,168,85,0.06)',
              color: 'var(--ink)',
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'var(--transition-smooth)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(196,168,85,0.15)';
              e.currentTarget.style.borderColor = 'var(--gold)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(196,168,85,0.06)';
              e.currentTarget.style.borderColor = 'rgba(107,90,58,0.2)';
            }}
          >
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 24,
              height: 24,
              borderRadius: '50%',
              border: '1px solid var(--gold)',
              color: 'var(--gold)',
              fontSize: 11,
              fontFamily: 'var(--font-ui)',
              fontWeight: 600,
              flexShrink: 0,
            }}>
              {ch.num}
            </span>
            <span>{ch.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

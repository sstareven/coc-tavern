import { useTavernHelperStore } from '../../stores/useTavernHelperStore';
import { renderContentWithCodeBlocks } from '../Shared/CodeBlockRenderer';
import { beautifyText } from '../Shared/TextBeautifier';
import type { ChoiceItem } from '../../types';

interface Props {
  header: string;
  content: string;
  choices: ChoiceItem[];
  isFlipping?: boolean;
}

// Parse check params from action text: "进行侦查检定(目标值:60, 极难目标值:12)" or "[检定:侦查 普通]"
function parseCheckAction(text: string): { skillName: string; target: number; difficulty: string } | null {
  // Format 1: "进行XX检定(目标值:NN)"
  const m1 = text.match(/进行(.+?)检定\s*\(目标值\s*[:：]\s*(\d+)/);
  if (m1) {
    return { skillName: m1[1].trim(), target: parseInt(m1[2]), difficulty: '普通' };
  }
  // Format 2: "[检定:XX 难度]"
  const m2 = text.match(/\[检定\s*[:：]\s*(.+?)\s+(普通|困难|极难)\s*\]/);
  if (m2) {
    // Difficulties halve/divide the target (handled by the caller)
    const diff = m2[2];
    const multiplier = diff === '极难' ? 5 : diff === '困难' ? 2 : 1;
    return { skillName: m2[1].trim(), target: 0, difficulty: diff };
  }
  return null;
}

// Result labels
const RESULT_LABELS: Record<string, string> = {
  'crit-success': '大成功！',
  'extreme-success': '极难成功',
  'hard-success': '困难成功',
  'success': '成功',
  'failure': '失败',
  'crit-failure': '大失败！',
};

function rollAndGetResult(skillName: string, target: number): { raw: number; resultType: string; label: string } {
  const d10 = () => Math.floor(Math.random() * 10);
  const t = d10(), o = d10();
  const raw = (t === 0 && o === 0) ? 100 : t * 10 + o;
  let resultType = 'failure';
  const fifth = Math.floor(target / 5);
  const half = Math.floor(target / 2);
  if (raw === 100 || (target < 50 && raw >= 96)) resultType = 'crit-failure';
  else if (raw === 1) resultType = 'crit-success';
  else if (raw <= fifth) resultType = 'extreme-success';
  else if (raw <= half) resultType = 'hard-success';
  else if (raw <= target) resultType = 'success';
  const labels: Record<string, string> = {
    'crit-success': '大成功！', 'extreme-success': '极难成功', 'hard-success': '困难成功',
    'success': '成功', 'failure': '失败', 'crit-failure': '大失败！',
  };
  return { raw, resultType, label: labels[resultType] || resultType };
}

function fillInputBar(text: string) {
  const input = document.querySelector<HTMLTextAreaElement>('footer textarea');
  if (!input) return;
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value',
  )?.set;

  const parsed = parseCheckAction(text);

  if (parsed && parsed.target > 0) {
    const result = rollAndGetResult(parsed.skillName, parsed.target);
    const rollStr = String(result.raw).padStart(2, '0');
    const resultLine = `[${parsed.skillName} d100=${rollStr}/${parsed.target} ${result.label}]\n`;

    // Dispatch custom event for dice animation overlay
    document.dispatchEvent(new CustomEvent('dice-roll-animate', {
      detail: { skillName: parsed.skillName, target: parsed.target, roll: result.raw, resultType: result.resultType, inputText: resultLine + text },
    }));
  } else if (parsed && parsed.target === 0) {
    const d10 = () => Math.floor(Math.random() * 10);
    const raw = (d10() * 10 + d10()) || 100;
    const rollStr = String(raw).padStart(2, '0');
    const resultLine = `[${parsed.skillName} d100=${rollStr} ${parsed.difficulty}]\n`;
    nativeInputValueSetter?.call(input, resultLine + text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  } else {
    nativeInputValueSetter?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }
}

export function RightPage({ header, content, choices, isFlipping }: Props) {
  const thRender = useTavernHelperStore((s) => s.render);
  const pt = useTavernHelperStore((s) => s.promptTemplate);
  const fadeStyle = {
    opacity: isFlipping ? 0 : 1,
    transition: isFlipping ? 'opacity 0.35s ease-in' : 'opacity 0.6s ease-out 0.6s',
  };
  const renderedContent = renderContentWithCodeBlocks(content, {
    enabled: thRender.renderEnabled,
    collapse: thRender.codeCollapse,
    noHighlight: thRender.disableCodeHighlight,
    codeBlocks: pt.enabled ? pt.codeBlocksEnabled : true,
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '28px 28px 20px 24px', minHeight: 0, background: 'linear-gradient(225deg, var(--parchment) 0%, var(--parchment-deep) 100%)', borderTopRightRadius: 4, borderBottomRightRadius: 4, boxShadow: 'inset 1px 0 2px rgba(0,0,0,0.04)', color: 'var(--ink)', fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.75, position: 'relative' }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ink)', letterSpacing: 4, marginBottom: 16, borderBottom: '1px solid rgba(107,90,58,0.25)', paddingBottom: 10, flexShrink: 0, ...fadeStyle }}>{header}</h3>
      <div className="rp-scroll" style={{ flex: 1, overflowY: 'auto', paddingRight: 4, scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.1)', minHeight: 0, ...fadeStyle }}>
        {renderedContent.length === 1 && typeof renderedContent[0] === 'string' ? (
          <p style={{ textIndent: '2em', marginBottom: 18, color: 'var(--ink)' }}>{beautifyText(renderedContent[0])}</p>
        ) : (
          renderedContent.map((node, i) => typeof node === 'string'
            ? <p key={i} style={{ textIndent: '2em', marginBottom: 8, color: 'var(--ink)' }}>{beautifyText(node)}</p>
            : <span key={i}>{node}</span>)
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {choices.map((ch) => {
            const isCheck = parseCheckAction(ch.action) !== null;
            return (
              <button key={ch.num} onClick={() => fillInputBar(ch.action)} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', border: isCheck ? '1px solid rgba(196,168,85,0.4)' : '1px solid rgba(107,90,58,0.2)',
                borderRadius: 3, background: isCheck ? 'rgba(196,168,85,0.1)' : 'rgba(196,168,85,0.06)',
                color: 'var(--ink)', fontFamily: 'var(--font-body)', fontSize: 14,
                textAlign: 'left', cursor: 'pointer', transition: 'var(--transition-smooth)',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.background = isCheck ? 'rgba(196,168,85,0.2)' : 'rgba(196,168,85,0.15)'; e.currentTarget.style.borderColor = 'var(--gold)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isCheck ? 'rgba(196,168,85,0.1)' : 'rgba(196,168,85,0.06)'; e.currentTarget.style.borderColor = isCheck ? 'rgba(196,168,85,0.4)' : 'rgba(107,90,58,0.2)'; }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: '50%', border: isCheck ? '1px solid var(--gold)' : '1px solid var(--gold)', color: 'var(--gold)', fontSize: 11, fontFamily: 'var(--font-ui)', fontWeight: 600, flexShrink: 0 }}>{ch.num}</span>
                <span>{ch.text}</span>
                {isCheck && <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--gold)', fontFamily: 'var(--font-mono)', opacity: 0.7 }}>🎲</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

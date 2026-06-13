// 6 档赐福结果选择器（纯展示）— DicePanel + OptionResolutionOverlay 共享。
// 只渲染「标题 + 3×2 grid」；外层 caller 自管底部按钮（两边交互模式不同：
// DicePanel 两步式带「确认」按钮，OptionResolutionOverlay 一步式点选立刻落账）。
import { motion } from 'framer-motion';
import type { DiceResultType } from '../../types';
import { CHEATING_RESULT_TYPES } from '../../sillytavern/cheating-helpers';
import { DICE_RESULT_LABEL, DICE_RESULT_COLOR } from '../../constants/diceResults';

interface Props {
  /** 当前选中的档位（两步式用；undefined/null = 未选中） */
  selectedType?: DiceResultType | null;
  /** 点击某档位回调（caller 决定是 set pending state 还是立刻 onConfirm） */
  onSelect: (type: DiceResultType) => void;
  /** 字号变量名 — DicePanel 用 --system-ratio，OptionResolutionOverlay 用 --text-ratio */
  ratioVar?: '--system-ratio' | '--text-ratio';
  /** 顶部副标题 — 缺省「赐福刻印」 */
  caption?: string;
  /** 是否带 motion.button 动画（DicePanel 用，Overlay 不用） */
  animated?: boolean;
  /** 不可用的档位（当前 target 下无法生成合法点数） */
  disabledTypes?: Set<DiceResultType>;
}

export function CheatingGrid({
  selectedType, onSelect, ratioVar = '--system-ratio', caption = '赐福刻印', animated = false, disabledTypes,
}: Props) {
  return (
    <div>
      <div style={{
        color: 'var(--gold)', fontFamily: 'var(--font-ui)',
        fontSize: `calc(10px * var(${ratioVar}, 1))`,
        letterSpacing: 3, marginBottom: 6, opacity: 0.7,
      }}>
        {caption}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {CHEATING_RESULT_TYPES.map((type, i) => {
          const disabled = disabledTypes?.has(type) ?? false;
          const selected = selectedType === type;
          const color = DICE_RESULT_COLOR[type];
          const baseStyle: React.CSSProperties = {
            padding: '8px 4px', borderRadius: 4,
            border: `1px solid ${selected ? color : 'var(--brass)'}`,
            background: selected ? `${color}18` : disabled ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.15)',
            color: disabled ? 'rgba(128,128,128,0.35)' : (selected ? color : 'var(--ink-subtle)'),
            fontFamily: 'var(--font-ui)',
            fontSize: `calc(11px * var(${ratioVar}, 1))`,
            letterSpacing: 1, cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'center',
            transition: 'var(--transition-smooth)',
            boxShadow: selected ? `0 0 10px ${color}40` : 'none',
            opacity: disabled ? 0.5 : 1,
          };
          const handleEnter = (el: HTMLButtonElement) => {
            if (disabled) return;
            if (!selected) {
              el.style.background = `${color}20`;
              el.style.borderColor = color;
            }
            el.style.transform = 'scale(1.04)';
          };
          const handleLeave = (el: HTMLButtonElement) => {
            if (disabled) {
              el.style.background = 'rgba(0,0,0,0.06)';
              return;
            }
            el.style.background = selected ? `${color}18` : 'rgba(0,0,0,0.15)';
            el.style.borderColor = selected ? color : 'var(--brass)';
            el.style.transform = 'scale(1)';
          };

          if (animated) {
            return (
              <motion.button
                key={type}
                disabled={disabled}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: disabled ? 0.5 : 1, y: 0 }}
                transition={{ delay: i * 0.04, type: 'spring', stiffness: 250, damping: 20 }}
                onClick={() => { if (!disabled) onSelect(type); }}
                style={baseStyle}
                onMouseEnter={(e) => handleEnter(e.currentTarget)}
                onMouseLeave={(e) => handleLeave(e.currentTarget)}
                onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(0.97)'; }}
                onMouseUp={(e) => { if (!disabled) e.currentTarget.style.transform = 'scale(1.04)'; }}
              >
                {DICE_RESULT_LABEL[type]}
              </motion.button>
            );
          }
          return (
            <button
              key={type}
              disabled={disabled}
              onClick={() => { if (!disabled) onSelect(type); }}
              style={baseStyle}
              onMouseEnter={(e) => handleEnter(e.currentTarget)}
              onMouseLeave={(e) => handleLeave(e.currentTarget)}
            >
              {DICE_RESULT_LABEL[type]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

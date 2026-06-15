// 6 档赐福结果选择器（纯展示）— OptionResolutionOverlay 单点使用。
// 只渲染「标题 + 3×2 grid」；外层 caller 自管点击后的落账动作。
import { motion } from 'framer-motion';
import type { DiceResultType } from '../../types';
import { CHEATING_RESULT_TYPES } from '../../sillytavern/cheating-helpers';
import { DICE_RESULT_LABEL, DICE_RESULT_COLOR } from '../../constants/diceResults';

interface Props {
  /** 点击某档位回调（caller 决定落账模式） */
  onSelect: (type: DiceResultType) => void;
  /** 字号变量名 — 默认 --text-ratio */
  ratioVar?: '--text-ratio' | '--system-ratio';
  /** 不可用的档位（当前 target 下无法生成合法点数，UI 应禁用） */
  disabledTypes?: Set<DiceResultType>;
}

export function CheatingGrid({
  onSelect, ratioVar = '--text-ratio', disabledTypes,
}: Props) {
  return (
    <div>
      <div style={{
        color: 'var(--gold)', fontFamily: 'var(--font-ui)',
        fontSize: `calc(10px * var(${ratioVar}, 1))`,
        letterSpacing: 3, marginBottom: 6, opacity: 0.7,
      }}>
        赐福刻印
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {CHEATING_RESULT_TYPES.map((type, i) => {
          const disabled = disabledTypes?.has(type) ?? false;
          const color = DICE_RESULT_COLOR[type];
          const baseStyle: React.CSSProperties = {
            padding: '8px 4px', borderRadius: 4,
            border: `1px solid ${disabled ? 'var(--brass)' : color}`,
            background: disabled ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.15)',
            color: disabled ? 'rgba(128,128,128,0.35)' : 'var(--ink-subtle)',
            fontFamily: 'var(--font-ui)',
            fontSize: `calc(11px * var(${ratioVar}, 1))`,
            letterSpacing: 1, cursor: disabled ? 'not-allowed' : 'pointer', textAlign: 'center',
            transition: 'var(--transition-smooth)',
            opacity: disabled ? 0.5 : 1,
          };
          const handleEnter = (el: HTMLButtonElement) => {
            if (!disabled) {
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
            el.style.background = 'rgba(0,0,0,0.15)';
            el.style.borderColor = 'var(--brass)';
            el.style.transform = 'scale(1)';
          };

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
        })}
      </div>
    </div>
  );
}

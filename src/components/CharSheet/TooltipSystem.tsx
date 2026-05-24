import { useState, useRef, useEffect, useCallback } from 'react';
import { useSettingsStore } from '../../stores/useSettingsStore';

// Keyword database for nested tooltips
const KEYWORD_DB: Record<string, string> = {
  '理智值': '理智值（SAN）是调查员精神健康的量化指标。SAN 归零将导致永久疯狂。受到克苏鲁神话冲击时会损失 SAN 值。',
  '克苏鲁': '克苏鲁（Cthulhu）是旧日支配者之一，沉睡于海底城市拉莱耶。其存在本身就会导致目睹者丧失理智值。',
  'COC': 'Call of Cthulhu（克苏鲁的呼唤）是基于 H.P. 洛夫克拉夫特作品的桌面角色扮演游戏，由 Chaosium 公司出版。',
  '克苏鲁神话': '克苏鲁神话技能是调查员对旧日支配者等超自然存在的了解程度。初始值为 0，增长越高，理智值上限越低。',
  'STR': '力量（Strength）：衡量角色的体力与肌肉力量。决定近战伤害加成和力量对抗检定的能力。',
  'CON': '体质（Constitution）：代表角色的健康与耐力。直接影响 HP 生命值上限和中毒/疾病抗性。',
  'POW': '意志（Power）：代表精神力量与魔法潜力。决定 SAN 上限、MP 上限和幸运值。',
  'DEX': '敏捷（Dexterity）：衡量反应速度与身体协调性。影响先攻顺序和闪避能力。',
  'APP': '外貌（Appearance）：代表角色的外表魅力。影响社交技能和第一印象。',
  'SIZ': '体型（Size）：决定角色的身高体格。与 STR 共同决定 DB 伤害加值和体格等级。',
  'INT': '智力（Intelligence）：代表学习与推理能力。决定初始个人兴趣技能点数。',
  'EDU': '教育（Education）：代表正式学识水平。决定初始职业技能点数。',
  'HP': '生命值（Hit Points）= (CON + SIZ) / 10。归零时角色处于濒死状态，需要进行体质检定。',
  'SAN': '理智值（Sanity）= POW。遭遇超自然恐怖时会损失 SAN，短暂疯狂或不定疯狂状态随之触发。',
  'MP': '魔法值（Magic Points）= POW / 5。用于施放法术和激活魔法物品。',
  'DB': '伤害加值（Damage Bonus）根据 STR + SIZ 查表决定。用于近战攻击的额外伤害骰。',
  '奖励骰': '奖励骰（Bonus Die）：掷出额外一个十面骰，取两者中较小值作为十位数字，提高成功率。',
  '惩罚骰': '惩罚骰（Penalty Die）：掷出额外一个十面骰，取两者中较大值作为十位数字，降低成功率。',
  '困难成功': '困难成功：检定结果小于等于技能值的一半（1/2）。金色高亮显示。',
  '极难成功': '极难成功：检定结果小于等于技能值的五分之一（1/5）。金色闪烁显示。',
  '大成功': '大成功（Critical Success）：检定结果为 01。必定成功且效果极佳。',
  '大失败': '大失败（Fumble）：检定结果为 96-100（技能 < 50 时）。必定失败且后果严重。',
};

const TOOLTIP_WIDTH = 280;
const HIGHLIGHT_COLOR = 'var(--gold-bright)';

interface Props {
  text: string;
  children: React.ReactNode;
  keyword?: string;
}

function HighlightedText({ text }: { text: string }) {
  const keywords = Object.keys(KEYWORD_DB);
  if (keywords.length === 0) return <span>{text}</span>;

  // Build regex from keyword DB keys, sorted by length descending to match longest first
  const sorted = [...keywords].sort((a, b) => b.length - a.length);
  const regex = new RegExp(`(${sorted.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  const parts = text.split(regex);

  return (
    <span>
      {parts.map((part, i) => {
        if (sorted.includes(part)) {
          return <TooltipTrigger key={i} keyword={part} />;
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

function TooltipTrigger({ keyword }: { keyword: string }) {
  const tooltipText = KEYWORD_DB[keyword];
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(false);
  const tooltipDelay = useSettingsStore((s) => s.tooltipDelay);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ringRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [progress, setProgress] = useState(0);

  const startHover = useCallback(() => {
    setHovered(true);
    setProgress(0);
    const start = Date.now();
    ringRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(elapsed / tooltipDelay, 1));
    }, 16);
    timerRef.current = setTimeout(() => {
      setVisible(true);
      if (ringRef.current) clearInterval(ringRef.current);
      setProgress(1);
    }, tooltipDelay);
  }, [tooltipDelay]);

  const endHover = useCallback(() => {
    setHovered(false);
    setVisible(false);
    setProgress(0);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (ringRef.current) clearInterval(ringRef.current);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (ringRef.current) clearInterval(ringRef.current);
    };
  }, []);

  const ringSize = 14;
  const strokeWidth = 2;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <span
      style={{
        position: 'relative',
        display: 'inline',
        cursor: 'help',
        color: HIGHLIGHT_COLOR,
        borderBottom: '1px dotted var(--gold)',
      }}
      onMouseEnter={startHover}
      onMouseLeave={endHover}
    >
      {keyword}
      {/* Progress ring */}
      {hovered && !visible && progress > 0 && (
        <span
          style={{
            position: 'absolute',
            top: -ringSize - 2,
            left: '50%',
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
          }}
        >
          <svg width={ringSize} height={ringSize}>
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke="rgba(196,168,85,0.2)"
              strokeWidth={strokeWidth}
            />
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke="var(--gold)"
              strokeWidth={strokeWidth}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
            />
          </svg>
        </span>
      )}
      {/* Tooltip popup */}
      {visible && tooltipText && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: 8,
            width: TOOLTIP_WIDTH,
            padding: '14px 16px',
            border: '1px solid var(--gold)',
            borderRadius: 6,
            background: 'rgba(26,20,16,0.96)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 12px rgba(196,168,85,0.1)',
            zIndex: 1200,
            fontSize: 12,
            fontFamily: 'var(--font-body)',
            color: 'var(--text-light)',
            lineHeight: 1.7,
            letterSpacing: 0.5,
            cursor: 'default',
            pointerEvents: 'auto',
            backdropFilter: 'blur(12px)',
          }}
        >
          <HighlightedText text={tooltipText} />
        </div>
      )}
    </span>
  );
}

export function TooltipSystem({ children, text }: Props) {
  return <TooltipTrigger keyword={text}>{children}</TooltipTrigger>;
}

export { KEYWORD_DB };

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';

import { useKeywordStore } from '../../stores/useKeywordStore';

interface Props {
  keyword: string;
  children: React.ReactNode;
}

const KEYWORD_MEANINGS: Record<string, string> = {
  '调查员': 'Investigator — 玩家扮演的角色，探索克苏鲁神话的秘密',
  '守秘人': 'Keeper of Arcane Lore (KP) — 游戏主持人',
  '克苏鲁神话': 'Cthulhu Mythos — 禁忌的知识体系，接触会损耗理智',
  '大成功': 'd100=01 — 检定自动成功，标记技能可成长',
  '大失败': 'd100=96~100 — 检定自动失败，可能带来灾难后果',
  '生命值': 'HP = (CON + SIZ) / 10，归零时濒死',
  '理智值': 'SAN = POW，遭遇恐怖事物时降低，归零时永久疯狂',
  '魔法值': 'MP = POW / 5，施放法术消耗',
  '幸运': 'Luck — 可消耗以改变检定结果，使用后自然衰减',
  '信用评级': 'Credit Rating — 反映社会地位和经济水平',
  '阿卡姆': 'Arkham — 马萨诸塞州北部的古老城镇，密斯卡塔尼克大学所在地',
  '密斯卡塔尼克大学': 'Miskatonic University — 始建于1690年，以神秘学研究闻名',
  '密斯卡托尼河': 'Miskatonic River — 流经阿卡姆的河流，常发生无法解释的事件',
  '印斯茅斯': 'Innsmouth — 马萨诸塞州海岸的没落渔港，深潜者的据点',
  '邓里奇': 'Dunwich — 马萨诸塞州北部荒村，发生过著名的恐怖事件',
  '波士顿': 'Boston — 马萨诸塞州首府，新英格兰的文化中心',
  '佛蒙特': 'Vermont — 美国东北部山区，人烟稀少，多神秘事件',
  '马萨诸塞': 'Massachusetts — 新英格兰核心州，COC 古典时代的主要舞台',
  '新英格兰': 'New England — 美国东北部地区，洛夫克拉夫特的故事主要发生地',
  '死灵之书': 'Necronomicon — 阿拉伯疯子阿卜杜拉所著的禁忌之书，记载了旧日支配者的秘密',
  '克苏鲁': 'Cthulhu — 旧日支配者，沉睡在南太平洋的拉莱耶城中',
  '深潜者': 'Deep One — 侍奉大衮的两栖类人生物，栖息于海洋深处',
  '修格斯': 'Shoggoth — 古老者创造的原生质仆从，已失控',
  '旧日支配者': 'Great Old One — 远古的外神，超越人类理解的存在',
  '幕间成长': '冒险结束后，调查员可进行技能成长检定（d100 > 当前值 → +1D10）和 SAN 恢复',
  '临时疯狂': '单次 SAN 损失 ≥ 5 时触发，持续数轮至数小时',
  '不定性疯狂': '一天内 SAN 损失 ≥ 1/5 时触发，持续数月',
  '永久性疯狂': 'SAN 归零时触发，调查员永久失控',
  '梦': '梦境在 COC 中常承载预兆、神话感召或跨维度信息',
  '命运': '调查员的命运由骰子和选择共同书写',
  '线索': '调查的关键，可透过侦查、聆听、心理学等技能获取',
  '低语': '不可名状存在的呼唤，常出现于疯狂边缘之人的耳际',
  '黑暗': '宇宙的本质是冰冷黑暗的，人类只是微小的存在',
};

const dynamicKeywords: Record<string, string> = {};

export function addKeywordMeanings(entries: Record<string, string>) {
  for (const [k, v] of Object.entries(entries)) {
    if (k && v && !KEYWORD_MEANINGS[k]) {
      dynamicKeywords[k] = v;
    }
  }
}

function getMeaning(keyword: string): string | undefined {
  return KEYWORD_MEANINGS[keyword] ?? dynamicKeywords[keyword] ?? useKeywordStore.getState().keywords[keyword];
}

export function KeywordTooltip({ keyword, children }: Props) {
  const [show, setShow] = useState(false);
  const [tpPos, setTpPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLSpanElement>(null);
  const meaning = getMeaning(keyword);

  const TOOLTIP_W = 340; // max-width of tooltip

  const calcPos = useCallback((clientX: number, clientY: number) => {
    const gap = 14;
    const vw = window.innerWidth;
    // Default: right of cursor. If too close to right edge, flip to left
    const x = clientX + gap + TOOLTIP_W > vw ? clientX - TOOLTIP_W - gap : clientX + gap;
    // Clamp y: don't go above viewport, fall below cursor if needed
    const y = Math.max(4, clientY - 10);
    setTpPos({ x: Math.max(0, x), y });
  }, []);

  const onEnter = useCallback((e: React.MouseEvent) => {
    calcPos(e.clientX, e.clientY);
    setShow(true);
  }, [calcPos]);

  const onMove = useCallback((e: React.MouseEvent) => {
    calcPos(e.clientX, e.clientY);
  }, [calcPos]);

  const onLeave = useCallback(() => setShow(false), []);

  useEffect(() => { return () => setShow(false); }, []);

  if (!meaning) {
    return <b style={{ color: 'inherit' }}>{children}</b>;
  }

  return (
    <>
      <span
        ref={ref}
        style={{ display: 'inline', position: 'relative' }}
        onMouseEnter={onEnter}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        <motion.b
          animate={show ? {
            color: ['var(--ink)', 'var(--gold)', 'var(--ink)'],
            textShadow: ['none', '0 0 10px rgba(196,168,85,0.55)', 'none'],
          } : {
            color: 'inherit',
            textShadow: 'none',
          }}
          transition={show ? {
            duration: 1.6,
            repeat: Infinity,
            repeatType: 'reverse' as const,
            ease: [0.42, 0, 0.58, 1], // ease-in-out bezier
          } : { duration: 0.3 }}
          style={{ borderBottom: '1px dotted var(--gold)' }}
        >
          {children}
        </motion.b>

      </span>

      {show &&
        createPortal(
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.16, ease: [0.4, 0, 0.2, 1] }}
            style={{
              position: 'fixed',
              left: tpPos.x,
              top: tpPos.y,
              zIndex: 9999,
              pointerEvents: 'none',
              maxWidth: 340,
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                background: 'linear-gradient(180deg, rgba(26,20,14,0.98) 0%, rgba(18,14,10,0.98) 100%)',
                border: '1px solid rgba(196,168,85,0.4)',
                borderRadius: 6,
                boxShadow: '0 6px 24px rgba(0,0,0,0.7), 0 0 0 1px rgba(196,168,85,0.08)',
                backdropFilter: 'blur(4px)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-ui)', color: 'var(--gold)', letterSpacing: 0.5, marginBottom: 4 }}>
                {keyword}
              </div>
              <div style={{ fontSize: 12, fontFamily: 'var(--font-body)', color: 'var(--text-light)', lineHeight: 1.6 }}>
                {meaning}
              </div>
            </div>
          </motion.div>,
          document.body,
        )
      }
    </>
  );
}

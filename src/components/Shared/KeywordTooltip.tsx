import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';

import { useKeywordStore } from '../../stores/useKeywordStore';

interface Props {
  keyword: string;
  children: React.ReactNode;
  /** 'red' = 常驻红色高亮（用于对话内部关键词，在深色对话与米色背景上突出）。 */
  tone?: 'default' | 'red';
}

// 红色变体：醒目的红 + 极细暗边（保证米色背景上可读）。已去除外发光辉光。
const RED_COLOR = '#cf2b25';
const RED_GLOW = '0 0 1px rgba(0,0,0,0.55)';
const RED_GLOW_BRIGHT = '0 0 1px rgba(0,0,0,0.55)';

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
  '密斯卡塔尼克河': 'Miskatonic River — 流经阿卡姆的河流，常发生无法解释的事件',
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

/**
 * 字面归一化关键词键：用于「相似词合并」的模糊查找。
 * 处理：全角字母数字→半角、去除标点/空白、剥离常见中文后缀（们/的/之/啊/呀/吧）。
 * 例：「调查员们」→「调查员」、「密斯卡塔尼克　大学」→「密斯卡塔尼克大学」。
 * 不做繁简转换/语义匹配，保持纯字面、快速、可预测。
 */
function normalizeKeyword(s: string): string {
  return s
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .replace(/(们|的|之|啊|呀|吧|呢|了)+$/u, '')
    .toLowerCase();
}

/** 在一个 key→meaning 表里按归一化键反查，命中返回释义。 */
function findNormalized(table: Record<string, string>, target: string): string | undefined {
  if (!target) return undefined;
  for (const [k, v] of Object.entries(table)) {
    if (v && normalizeKeyword(k) === target) return v;
  }
  return undefined;
}

/** Levenshtein 编辑距离（小串，用于音译拼写变体容错）。 */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * 在多个 key→meaning 表中解析关键词释义，容忍 LLM 音译拼写变体。
 * 三级匹配（按表顺序，先全表精确、再全表归一化、最后全表模糊）：
 *  1) 精确键匹配；2) 归一化（去标点/后缀）精确匹配；
 *  3) 归一化后编辑距离 ≤1 的模糊匹配——仅对 ≥4 字的长词，避免短词误配
 *     （如「密斯卡托尼克河」↔「密斯卡塔尼克河」托/塔一字之差）。
 * 纯函数，便于单测；KEYWORD_MEANINGS 优先于会话 store 由调用方传入顺序决定。
 */
export function resolveMeaning(keyword: string, tables: Record<string, string>[]): string | undefined {
  for (const t of tables) {
    const v = t[keyword];
    if (v) return v;
  }
  const norm = normalizeKeyword(keyword);
  if (!norm) return undefined;
  for (const t of tables) {
    const v = findNormalized(t, norm);
    if (v) return v;
  }
  // 模糊兜底：长词的音译变体（编辑距离 ≤1）。短词跳过以免「梦↔门」之类误配。
  if (norm.length < 4) return undefined;
  for (const t of tables) {
    for (const [k, v] of Object.entries(t)) {
      if (!v) continue;
      const nk = normalizeKeyword(k);
      if (nk.length >= 4 && editDistance(nk, norm) <= 1) return v;
    }
  }
  return undefined;
}

function getMeaning(keyword: string): string | undefined {
  // 释义来源：(1) KEYWORD_MEANINGS 通用 COC 术语（跨会话共享）；
  //          (2) useKeywordStore 当前会话的 LLM 释义（按会话隔离，不会跨对话混用）。
  // 容忍音译拼写变体：见 resolveMeaning。
  return resolveMeaning(keyword, [KEYWORD_MEANINGS, useKeywordStore.getState().keywords]);
}

export function KeywordTooltip({ keyword, children, tone = 'default' }: Props) {
  const [show, setShow] = useState(false);
  const [tpPos, setTpPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLSpanElement>(null);
  const meaning = getMeaning(keyword);
  const red = tone === 'red';

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
    return (
      <b style={red ? { color: RED_COLOR, textShadow: RED_GLOW } : { color: 'inherit' }}>
        {children}
      </b>
    );
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
          animate={show ? (red ? {
            color: [RED_COLOR, '#ff5a50', RED_COLOR],
            textShadow: [RED_GLOW, RED_GLOW_BRIGHT, RED_GLOW],
          } : {
            color: ['var(--ink)', 'var(--gold)', 'var(--ink)'],
            textShadow: ['none', 'none', 'none'],
          }) : (red ? {
            color: RED_COLOR,
            textShadow: RED_GLOW,
          } : {
            color: 'inherit',
            textShadow: 'none',
          })}
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

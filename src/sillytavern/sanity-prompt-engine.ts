/**
 * A2 重设 — sanity-prompt-engine: 纯函数, 无副作用, 供 SanityBubble UI / SanityCheckPanel / 测试共用。
 *
 * 职责:
 *  - parseSanInlineTags: 在叙事正文中找所有 <san id="N"/> 标签的字符 offset + id
 *  - rollSanCheck:       根据 checkType+difficulty 计算 d100 vs target → passed / d100 值
 *  - rollSanLoss:        解骰子表达式("1D6"/"0"/"2D4+1" 等)返回累计骰值
 *  - buildSanityOps:     把单次 SAN loss 转成 MvuOp 数组(走 ctx.applyCorrectiveOps 通路)
 *
 * RNG 全部注入(默认 Math.random),便于测试确定性。
 *
 * 设计注记:
 *  - 这是【面板内】的检定;面板触发器 (boutEvaluator) 在 SAN loss 真实落账后才决定要不要起 Bout。
 *  - 本引擎不写 statData 也不读 store,纯计算。落账由 SanityCheckPanel 调 applyCorrectiveOps。
 */

import type { CharacterSheet, SanityCheckPrompt } from '../types';

// ─── 一. 解析叙事中的 <san id="N"/> 内联标签 ───

export interface SanInlineTag {
  id: string;
  /** 标签起始字符偏移(整段 text 中); 渲染层据此把 [start,end) 替换为 SanityBubble 组件。 */
  start: number;
  /** 标签结束字符偏移(exclusive)。 */
  end: number;
}

/**
 * 找出文本中所有 <san id="N"/> 自闭合标签的位置 + id。
 * 容忍单/双引号、属性间多余空白、标签内大小写;不处理嵌套(不可能出现)。
 *
 * 顺序: 按 start 升序; 同 id 出现多次都返回(虽然规范上 id 应唯一,但解析层不强校验)。
 */
export function parseSanInlineTags(text: string): SanInlineTag[] {
  if (!text) return [];
  const tags: SanInlineTag[] = [];
  const re = /<san\s+id\s*=\s*['"]([^'"]+)['"]\s*\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tags.push({ id: m[1], start: m.index, end: m.index + m[0].length });
  }
  return tags;
}

/** 正则元字符转义——把 id 字面化进 RegExp 避免 . / * / ? 等被当成元字符。 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 文本末尾「句末标点 + 闭引号 + 破折号/省略号 + 空白」段的正则——用来定位
 * 「叙事正文」与「收尾标点」的边界，把 `<san id>` 气泡嵌进收尾标点之前。
 *   - 中文句末：。！？，；：、
 *   - 中文闭引号/括号：」』）》〉〕】
 *   - 西文句末：.!?,;:
 *   - 西文闭括号/引号：)]}'"
 *   - 破折号 — / 省略号 …
 *   - 末尾空白（防 stripMvu 漏 trim）
 * 不包含开引号（「『（《）——它们出现在末尾通常表示语句被截断，不该被视为可剥离的尾段。
 */
const TRAILING_PUNCT_RE = /[。！？，；：、」』）》〉〕】.,!?;:)\]}'"…—\s—…]+$/;

/**
 * 孤儿 SAN prompt 自动补标签：每条 prompt 的 id 必须在 leftContent 或 rightContent
 * 里有对应的 `<san id="N"/>` 内联标签；缺失则在 leftContent 末尾的「叙事正文与
 * 收尾标点的边界」之前追加，让气泡嵌进句末标点 / 闭引号之内（视觉自然）。
 *
 * 设计动机（见 2026-06-05 真实失败现场）：
 *   1) 模型偶发把 sanityCheckPrompts 写进顶层 JSON 但忘了在叙事里插内联标签。
 *      `useSanityBubbleEffect` 把全部 prompt id 喂给 setPending → `ChoiceButton`
 *      的 sanityBlocked 永远 true → 选项被锁；而 SanityBubble 因找不到内联标签
 *      永远渲染不出来 → 玩家无气泡可点解锁 → 死锁。
 *   2) 早期版本直接 append 到 leftContent 末尾——若末尾是 `「来。」` 这种引号收尾，
 *      气泡会被甩在 `」` 后面像个"挂在外面的尾巴"。改进版用 TRAILING_PUNCT_RE 把
 *      尾标点段剥开，气泡插在叙事正文之后、收尾标点之前。
 *
 * 取「补标签」而非「丢弃 prompt」：丢弃会让 SAN 检定无声蒸发；补标签至少保住
 * SAN 机制完整性，玩家点击 → SanityCheckPanel → SAN loss 落账，与 LLM 本意一致。
 */
export function patchOrphanSanityTags(
  leftContent: string,
  rightContent: string,
  prompts: SanityCheckPrompt[],
): { leftContent: string; rightContent: string; orphanIds: string[] } {
  if (prompts.length === 0) return { leftContent, rightContent, orphanIds: [] };
  const hasTag = (id: string, text: string): boolean => {
    if (!text) return false;
    const re = new RegExp(`<san\\s+id\\s*=\\s*['"]${escapeRegExp(id)}['"]\\s*/?>`, 'i');
    return re.test(text);
  };
  // 把 tag 插入文本末尾「叙事正文 / 收尾标点段」的边界之前。
  // 末尾无标点段：直接 append（行为兼容原版）。
  const insertBeforeTrailingPunct = (text: string, tag: string): string => {
    const m = text.match(TRAILING_PUNCT_RE);
    if (!m || m.index === undefined) return text + tag;
    return text.substring(0, m.index) + tag + text.substring(m.index);
  };
  const orphanIds: string[] = [];
  let newLeft = leftContent;
  for (const p of prompts) {
    if (hasTag(p.id, leftContent) || hasTag(p.id, rightContent)) continue;
    orphanIds.push(p.id);
    newLeft = insertBeforeTrailingPunct(newLeft, `<san id="${p.id}"/>`);
  }
  return { leftContent: newLeft, rightContent, orphanIds };
}

// ─── 二. d100 SAN check (POW / INT / skill) ───

export type RollD100 = () => number;
const defaultRollD100: RollD100 = () => Math.floor(Math.random() * 100) + 1;

/** 角色卡里取技能/属性当前值; 未知技能返回 0(检定必败)。 */
export function readCheckTarget(sheet: CharacterSheet, prompt: SanityCheckPrompt): number {
  if (prompt.checkType === 'POW') return sheet.characteristics.POW ?? 0;
  if (prompt.checkType === 'INT') return sheet.characteristics.INT ?? 0;
  // skill: 需 checkSkill 字段
  if (!prompt.checkSkill) return 0;
  const sk = sheet.skills[prompt.checkSkill];
  return sk?.current ?? 0;
}

/** 把基础目标值按难度衰减: normal=原值 / hard=/2 / extreme=/5。 */
export function applyDifficulty(base: number, difficulty: SanityCheckPrompt['difficulty']): number {
  if (difficulty === 'hard') return Math.floor(base / 2);
  if (difficulty === 'extreme') return Math.floor(base / 5);
  return base;
}

export interface SanCheckResult {
  passed: boolean;
  d100: number;
  /** 实际比对的目标值(已应用 difficulty)。 */
  effectiveTarget: number;
}

/**
 * 跑一次 SAN check d100。规则: roll ≤ effectiveTarget 视为通过。
 * 不区分 success/extreme/etc 等级——SAN check 仅二分(通过 → sanLossSuccess; 失败 → sanLossFail)。
 *
 * @param sheet     角色卡(读 POW/INT/skill 当前值)
 * @param prompt    LLM 输出的检定条目(decides checkType+difficulty)
 * @param rollD100  RNG 注入; 测试可固定返回特定值。
 */
export function rollSanCheck(
  sheet: CharacterSheet,
  prompt: SanityCheckPrompt,
  rollD100: RollD100 = defaultRollD100,
): SanCheckResult {
  const baseTarget = readCheckTarget(sheet, prompt);
  const effectiveTarget = applyDifficulty(baseTarget, prompt.difficulty);
  const d100 = rollD100();
  return {
    passed: d100 <= effectiveTarget,
    d100,
    effectiveTarget,
  };
}

// ─── 三. 骰子表达式 — SAN loss ("1D6"/"0"/"2D4+1") ───

export type RollDice = (sides: number) => number;
const defaultRollDice: RollDice = (sides) => (sides <= 0 ? 0 : Math.floor(Math.random() * sides) + 1);

/**
 * 解 SAN loss 骰子表达式并掷骰累加。
 * 支持:
 *  - "0" / "1" / "5" 等纯整数 → 直接返回
 *  - "1D6" / "2D4" / "1d10" 等单骰 → 掷 N 次 sides 面
 *  - "1D6+2" / "2D4+1" 等加常数 → 掷骰 + 常数
 *  - "1D6+1D4" 等多骰相加 → 全部累加
 *  - 空串 / 无法解析 → 返回 0
 *
 * 不支持除法/减法/括号/最大值约束(规范里 SAN loss 不会用)。
 *
 * @param expr   骰子表达式
 * @param rollDice  RNG 注入(默认 1..sides 均匀)
 */
export function rollSanLoss(expr: string, rollDice: RollDice = defaultRollDice): number {
  if (!expr) return 0;
  const cleaned = expr.replace(/\s+/g, '').toUpperCase();
  if (!cleaned) return 0;

  // 直接整数
  if (/^\d+$/.test(cleaned)) return parseInt(cleaned, 10);

  // 拆 + 号分项, 每项可为整数或 NDM
  const parts = cleaned.split('+').filter(Boolean);
  if (parts.length === 0) return 0;

  let total = 0;
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      total += parseInt(part, 10);
      continue;
    }
    const m = part.match(/^(\d+)D(\d+)$/);
    if (!m) {
      // 无法解析的项 → 跳过(fail-open, 不让恶意/畸形表达式炸开)
      continue;
    }
    const count = parseInt(m[1], 10);
    const sides = parseInt(m[2], 10);
    for (let i = 0; i < count; i++) total += rollDice(sides);
  }
  return total;
}

// ─── 四. 把单次 SAN loss 编排成 MvuOp 列表 ───

export interface MvuOp {
  op: 'replace' | 'delta' | 'insert' | 'remove';
  path: string;
  value?: unknown;
}

/**
 * 把单次 SAN loss 转 corrective ops(走 useVariableStore.applyCorrectiveOps 通路)。
 * 路径与 LLM 输出 SAN delta 时用的一致: /调查员/理智值/当前。
 * loss=0 返回空数组(不浪费 corrective 一轮)。
 *
 * 注: 不在此追加临时疯狂/Bout 判定的 ops——那由 boutEvaluator 在 settleVariables 后续相位
 * 读 sanDelta 自动接管(与 LLM 写 SAN delta 同通路)。
 */
export function buildSanityOps(loss: number): MvuOp[] {
  if (loss <= 0) return [];
  return [{ op: 'delta', path: '/调查员/理智值/当前', value: -loss }];
}

// src/components/Book/choice-input-builder.ts
//
// 选项 → 喂给 LLM 的 input 字符串的拼接逻辑（纯函数，与 React 解耦，便于测试）。
// 与 RightPage 共用 — 抽出动因见 2026-06-05 用户反馈：
//   选项 text 末尾 ? + action 含「进行XX检定(...)」时 buildChoiceInput 旧实现拼成
//   "...呼吸声吗？。进行聆听检定(普通)，侧耳倾听屋内动静" — 双标点 + 与顶部
//   [skill d100=NN/T 结果] 检定标记冗余。本模块修复两点：
//     1) 检定选项 input 只用 text（骰子判定走前端 parseCheckAction(ch.action)，
//        与 input 拼接无关）
//     2) 非检定选项 text 末尾若已含句末标点 / 引号 / 破折号 / 省略号，不再加 "。"
//
// 接 [decoupling-modularity-required] memory：纯字符串逻辑独立成模块，React 只渲染。

import type { ChoiceItem } from '../../types';

/**
 * 显示用：剥除选项 text 里的检定标记 / 难度提示 / var 标签残留。
 * 与原 RightPage.cleanChoiceText 行为完全等价。
 */
export function cleanChoiceText(text: string): string {
  return text
    .replace(/\[检定\s*[:：][^\]]*\]\s*/g, '')
    .replace(/\[对抗\s*[:：][^\]]*\]\s*/g, '')
    .replace(/<\s*var[A-Za-z]*\b[^<>]*?\/?>/gi, '')
    .replace(/[(（]\s*(?:普通|困难|极难)难度\s*[)）]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * 轻量判断 action 字段是否含「进行XX检定 / 进行XX对抗 / [检定:XX 难度]」标记。
 *
 * 不调 parseCheckAction —— 后者依赖 useCharSheetStore + 技能名白名单校验，是给
 * 前端 ChoiceButton 决定是否触发骰子用的；input 拼接层只需判断「这条 action 在
 * 描述检定语义吗？」纯字符串即可。覆盖 parseCheckAction 的 Format 1/2/3 + 兜底 4。
 */
export function hasCheckMarker(text: string): boolean {
  if (!text) return false;
  // Format A: 对抗 — 「进行XX对抗(对手目标值:NN)」
  if (/进行[^()（）]+?对抗\s*[(（]/.test(text)) return true;
  // Format B: 检定带括号 — 「进行XX检定(普通)」/「进行XX检定(目标值:NN)」等
  if (/进行[^()（）]+?检定\s*[(（]/.test(text)) return true;
  // Format C: 方括号标记 — 「[检定:XX 难度]」
  if (/\[检定\s*[:：]/.test(text)) return true;
  // Format D 兜底: 无括号检定 — 「进行XX检定」(不在「对抗」上下文)
  if (/进行(?:(?:普通|困难|极难))?[^()（）对]+?(?:的(?:普通|困难|极难))?检定(?![(（])/.test(text)) return true;
  return false;
}

/** 选项 text 末尾是否已含「句末标点 / 引号收尾 / 破折号 / 省略号」——决定衔接 action 时要不要加 "。"。 */
const TEXT_TAIL_PUNCT_RE = /[。！？，；：、」』）》〉〕】.,!?;:)\]}'"…—…—\s]$/;

/**
 * 选中选项时提交给 LLM 的内容：把玩家可见的叙事文字(text)与机制动作(action)合并，
 * 让 LLM 拿到完整意图与上下文，而不只是 action。
 *
 * 拼接规则（2026-06-05 后）：
 *   - 检定选项（action 含检定 / 对抗标记）：input **只用 text**。
 *     掷骰结果已经以 [skill d100=NN/T 结果] 顶行注入 input，action 里的
 *     「进行XX检定(难度)」是给前端 parseCheckAction 用的机制标记，重复进 input
 *     反而造成双标点 + 描述冗余。
 *     若 text 为空（罕见）则回退用 action，避免 LLM 拿到空串。
 *   - 非检定选项：
 *     - action 已含 text → 只用 action（避免「A。AB」式冗余）
 *     - text 末尾已是句末标点 / 引号 / 破折号 / 省略号 → 「ta」不加双标点
 *     - 否则 → 「t。a」加句号衔接
 */
export function buildChoiceInput(ch: ChoiceItem): string {
  const t = cleanChoiceText(ch.text || '').trim();
  const a = (ch.action || '').trim();
  if (!t && !a) return '';
  if (!t) return a;
  if (!a) return t;
  // 检定选项：input 只用 text（不影响骰子判定 — 那由 parseCheckAction(ch.action) 决定）
  if (hasCheckMarker(a)) return t;
  // 非检定 — action 已含 text，避免 "翻找抽屉。翻找抽屉里的旧信件"
  if (a.includes(t)) return a;
  // 非检定 — 看 text 末尾是否需要补 "。"
  return TEXT_TAIL_PUNCT_RE.test(t) ? `${t}${a}` : `${t}。${a}`;
}

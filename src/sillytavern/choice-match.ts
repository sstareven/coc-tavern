import type { ChoiceItem } from '../types';

/** 规范化：剥离 <var> 标记、去标点与空白、全角字母数字转半角、统一小写。用于强相关相等比对。 */
export function normalizeChoiceText(s: string): string {
  return s
    .replace(/<var\s+[^>]*\/>/gi, '')
    .replace(/[，。！？、；：,.!?;:「」『』“”‘’()（）\[\]【】\s]/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toLowerCase();
}

/** 输入是否与任一选项的 text 或 action 规范化后严格相等。 */
export function matchesExistingChoice(input: string, choices: ChoiceItem[]): boolean {
  const n = normalizeChoiceText(input);
  if (!n) return false;
  return choices.some(
    (c) => normalizeChoiceText(c.text) === n || normalizeChoiceText(c.action) === n,
  );
}

/** 推进按钮模式：空/指令/匹配选项 → advance；选项外自定义 → rewrite。 */
export function resolveButtonMode(input: string, choices: ChoiceItem[]): 'advance' | 'rewrite' {
  const t = input.trim();
  if (t === '') return 'advance';
  if (t.startsWith('/')) return 'advance';
  if (matchesExistingChoice(t, choices)) return 'advance';
  return 'rewrite';
}

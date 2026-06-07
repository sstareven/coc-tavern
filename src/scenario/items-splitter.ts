// 把 initialItemsRaw 自由文本拆成物品数组。
// 关键约束：括号内的分隔符不切（典型例「皮质药囊(含药草、亚麻绷带、小铜针、放血用细刀)」
// 应当是一项而不是 4 项；切碎后 TeamSidebar 武器列 regex /刀/ 会兜底匹配「放血用细刀)」
// 把右括号当武器名尾巴显示）。
//
// 分隔符：中文顿号、ASCII 逗号、全角逗号、ASCII/全角分号、换行
// 括号对：英文 () 与中文（）；不识 《》/[]/〔〕（这些通常没分隔符在内）
// 容错：未关括号到字符串末尾时降级为不识括号（避免作者漏一个右括号让整个背包变一项）

const SPLIT_CHARS = new Set(['、', ',', '，', ';', '；', '\n']);
const OPEN_BRACKETS: Record<string, string> = { '(': ')', '（': '）' };
const CLOSE_BRACKETS = new Set([')', '）']);

function splitWithBracketAwareness(raw: string): string[] {
  const out: string[] = [];
  let buf = '';
  // 栈式深度：栈顶记录期望的闭括号字符
  const stack: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch in OPEN_BRACKETS) {
      stack.push(OPEN_BRACKETS[ch]);
      buf += ch;
    } else if (CLOSE_BRACKETS.has(ch)) {
      // 不强校验栈顶必须匹配；只要栈非空就 pop（容忍「(...）」混用）
      if (stack.length > 0) stack.pop();
      buf += ch;
    } else if (stack.length === 0 && SPLIT_CHARS.has(ch)) {
      out.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  out.push(buf);
  return out;
}

function naiveSplit(raw: string): string[] {
  return raw.split(/[、,，;；\n]/);
}

/**
 * 把自由文本随身物品拆成 string[]。
 * 括号内的分隔符不切；未关括号则降级为朴素切分。
 * 空白/空项自动去除。
 */
export function splitInitialItems(raw: string): string[] {
  if (!raw || !raw.trim()) return [];

  // 先看括号配平：栈最终非空 = 未关，降级到朴素切分
  const stack: string[] = [];
  for (const ch of raw) {
    if (ch in OPEN_BRACKETS) stack.push(OPEN_BRACKETS[ch]);
    else if (CLOSE_BRACKETS.has(ch) && stack.length > 0) stack.pop();
  }
  const balanced = stack.length === 0;

  const parts = balanced ? splitWithBracketAwareness(raw) : naiveSplit(raw);
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

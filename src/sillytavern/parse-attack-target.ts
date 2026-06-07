/**
 * M8 攻击保护 —— 主线选项攻击意图解析器。
 *
 * 任务：识别玩家选项 text/action 是否在「攻击 / 格斗 / 射击 / 推打 ... <队友名>」类动作。
 * 仅当目标名命中 partyNames 时返回意图；非队友目标返回 null（让正常攻击通过）。
 *
 * 与 parseCheckAction 的关系：parseCheckAction 解析「进行XX检定/对抗」走掷骰流水线；
 * 本函数解析的是更宽泛的"语义攻击"，只用于 UI 灰显，不影响掷骰。
 */

export interface AttackIntent {
  kind: 'attack';
  /** 命中 partyNames 中的精确名字（如 "以利亚·霍尔姆斯"） */
  targetName: string;
}

/** 表示"攻击意图"的关键词（不含目标名）。覆盖现实选项常见写法。 */
const ATTACK_KEYWORDS = [
  '攻击', '格斗', '袭击', '殴打', '攻杀',
  '射击', '射杀', '开枪', '射',
  '推开', '推搡', '推倒', '推打', '推',
  '砍', '刺', '捅', '勒住', '掐',
];

/** 把字符串里所有正则元字符转义掉，防止队友名里的 · ( ) 等被当成元字符。 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 解析选项文本，识别是否是"攻击某个队友"的动作。
 *
 * @param text 选项 text 或 action 字段（合并的也行）
 * @param partyNames 当前队友名字列表（从 useNpcStore.getParty().map(p=>p.name) 得到）
 * @returns 命中队友 → AttackIntent；否则 null
 */
export function parseAttackTarget(text: string, partyNames: readonly string[]): AttackIntent | null {
  if (!text || partyNames.length === 0) return null;

  // 必须先包含攻击关键词，否则不算攻击意图（「与<队友>交谈」不会误命中）
  const hasAttackKeyword = ATTACK_KEYWORDS.some((kw) => text.includes(kw));
  if (!hasAttackKeyword) return null;

  // 优先匹配更长的队友名（防"约翰"短前缀吃掉"约翰·肯特"）
  const sortedNames = [...partyNames].sort((a, b) => b.length - a.length);

  for (const name of sortedNames) {
    if (!name) continue;
    // 名字在文本里出现即算命中（中文无单词边界，不用 \b）
    if (text.includes(name)) {
      // 二次校验：攻击关键词与名字"足够接近"——同一句话内出现即可。
      // 中文选项一般是一句话，不强校验距离；只要包含攻击词 + 名字就算意图。
      return { kind: 'attack', targetName: name };
    }
  }
  return null;
}

// escapeRegex 当前未直接用于核心路径，留作未来"边界匹配"扩展（不删，导出供测试覆盖）。
export { escapeRegex as __escapeRegexForTest };

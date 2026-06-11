/**
 * COC7e 常见法术目录。供世界书注入 LLM 上下文，使施法时能查到准确的 MP/SAN 消耗。
 * 纯数据 + 纯函数，不依赖 React / Zustand。
 */

export interface CocSpell {
  /** 法术名称 */
  name: string;
  /** 魔法值消耗 */
  mpCost: number;
  /** 理智值消耗 */
  sanCost: number;
  /** 施法时间（中文描述） */
  castingTime: string;
  /** 法术简述 */
  description: string;
}

export const COC_SPELLS: readonly CocSpell[] = [
  { name: '远古之眼', mpCost: 3, sanCost: 2, castingTime: '1轮', description: '透过时间的薄纱窥见过去或未来的片段，视野模糊且短暂' },
  { name: '纳塞恩之歌', mpCost: 4, sanCost: 3, castingTime: '3轮', description: '吟唱异界旋律，使周围生物陷入恍惚或恐惧' },
  { name: '灵魂附着', mpCost: 8, sanCost: 5, castingTime: '10分钟', description: '将意识暂时附着于一个物体或尸体上，感知其周围环境' },
  { name: '意志之门', mpCost: 5, sanCost: 3, castingTime: '1轮', description: '在施法者与目标之间建立短暂的心灵链接，可传递思维或情感' },
  { name: '痛苦蛊咒', mpCost: 6, sanCost: 4, castingTime: '2轮', description: '对目标施加剧烈的幻觉痛苦，迫使其行动受阻' },
  { name: '黄衣召唤', mpCost: 10, sanCost: 8, castingTime: '1小时', description: '召唤黄衣之王的注意——极度危险，可能招来不可控的后果' },
  { name: '暗影遮蔽', mpCost: 2, sanCost: 1, castingTime: '1轮', description: '操纵周围的阴影包裹自身，短暂隐匿行踪' },
  { name: '尤格索特斯之钥', mpCost: 12, sanCost: 10, castingTime: '30分钟', description: '打开通往异次元的门径——代价极高，失败可能撕裂现实' },
  { name: '精神屏障', mpCost: 5, sanCost: 2, castingTime: '1轮', description: '在心灵周围筑起临时屏障，抵御精神攻击或心灵感应' },
  { name: '命运之线', mpCost: 3, sanCost: 1, castingTime: '5分钟', description: '短暂感知命运的走向，获得模糊的预兆或警示' },
  { name: '旧印封缄', mpCost: 8, sanCost: 4, castingTime: '10分钟', description: '刻画旧神印记封锁一个区域，阻止神话生物通过' },
  { name: '死者之语', mpCost: 6, sanCost: 5, castingTime: '15分钟', description: '与近期死去之人的残留意识短暂交流，获取只言片语的信息' },
] as const;

/** 按名称查找法术（精确匹配）。 */
export function findSpell(name: string): CocSpell | undefined {
  return COC_SPELLS.find((s) => s.name === name);
}

/**
 * 将已知法术列表格式化为成本摘要字符串，用于注入 LLM 上下文。
 * 若 knownSpells 为空返回空字符串。
 */
export function buildSpellCostSummary(knownSpells: string[]): string {
  if (!knownSpells.length) return '';
  const lines: string[] = ['【已知法术消耗表】'];
  for (const name of knownSpells) {
    const spell = findSpell(name);
    if (spell) {
      lines.push(`- ${spell.name}: MP${spell.mpCost} / SAN${spell.sanCost} / ${spell.castingTime} — ${spell.description}`);
    }
  }
  if (lines.length === 1) return ''; // no matching spells found
  return lines.join('\n');
}

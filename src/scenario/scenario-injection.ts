// 剧本系统 · 注入纯函数 — 参见 spec §4.2 第 4 步
// 把 ScenarioEntry[] → LoreEntry record；构造 statData 种子；把 ScenarioCharacter → NpcProfile
// 纯函数,不引 zustand store,可单测
import type { LoreEntry } from '../types';
import type { ScenarioEntry, ScenarioCharacter, ScenarioDoc } from '../types/scenario';
import type { NpcProfile } from '../types';

// 与 LorebookEditor EMPTY_ENTRY 同字段默认；只列「非显然 WHY」必要的注释
const EMPTY_LORE_ENTRY: LoreEntry = {
  name: '', keys: '', content: '', logic: 'AND_ANY', priority: 10,
  disabled: false, constant: false, position: 0, depth: 0, probability: 100,
  secondaryKeys: '', scanDepth: 0, caseSensitive: 0, matchWholeWord: 0,
  groupScoring: 0, automationId: '', inclusionGroup: '', prioritizeInclusion: false,
  groupWeight: 100, sticky: 0, cooldown: 0, delay: 0,
  preventRecursion: false, delayUntilRecursion: false, excludeRecursion: false,
  ignoreReplyLimit: false,
  characterFilter: { isExclude: false, names: [], tags: [] },
  triggers: [],
  matchPersonaDescription: false, matchCharacterDescription: false,
  matchCharacterPersonality: false, matchCharacterDepthPrompt: false,
  matchScenario: false, matchCreatorNotes: false,
};

/**
 * 把剧本条目转换为 lorebook 条目映射；键名加 'scn_' 前缀避免与 coc_lore 撞键，
 * priority 加 offset 让剧本特化条目盖通用条目（spec §10 第 1 行风险对策）。
 */
export function scenarioEntriesToLoreEntries(
  entries: ScenarioEntry[],
  priorityOffset = 1000,
): Record<string, LoreEntry> {
  const out: Record<string, LoreEntry> = {};
  for (const e of entries) {
    const key = `scn_${e.id}`;
    out[key] = {
      ...EMPTY_LORE_ENTRY,
      name: e.comment,
      keys: e.keys,
      content: e.content,
      constant: e.constant,
      position: e.position,
      priority: e.priority + priorityOffset,
      // hidden 条目 → 玩家模式视为禁用（spec §3 ScenarioEntry.hidden 注释）
      disabled: e.hidden === true,
      // 用 inclusionGroup 承载分类，便于后续按类筛选/排他
      inclusionGroup: `category:${e.category}`,
    };
  }
  return out;
}

/**
 * 剧本特有 statData 种子：暗线起始(取 darkTimeline[0] 的导演词)、结局类型空、已解锁空字典。
 * 不返回完整 statData;由 createInitialStatData 先建树,这里只 patch 剧本枝。
 */
export function buildScenarioStatDataSeed(scn: ScenarioDoc): Record<string, unknown> {
  // 项目 statData 走嵌套树（getTreePath 按点分路径读取），平铺 key 会读不到。
  // 已解锁返回 {} 仅作为「该枝缺失时建空字典」的占位，deepMerge 时不能覆盖已有子树。
  return {
    剧情: {
      暗线: {
        描述: scn.darkTimeline[0]?.directorNote ?? '',
        进度: 0,
        威胁等级: '潜伏',
      },
      结局类型: '',
      已解锁: {},
    },
  };
}

/**
 * 剧本角色 → NPC 名册条目。
 * 走 useNpcStore.upsert(profile) 路径,需要完整 NpcProfile;
 * sheet 中的技能/属性挂到 characteristics/skills,身份/态度/位置/简历挂到对应字段。
 */
export function scenarioCharacterToNpc(c: ScenarioCharacter): NpcProfile {
  const now = Date.now();
  // CharacterSheet 字段较多且互不耦合,只挑映射需要的;其它 sheet 字段交由名册外的渠道呈现
  const sheet = c.sheet as unknown as Record<string, unknown>;
  const name = typeof sheet.name === 'string' && sheet.name.trim() ? sheet.name.trim() : c.npcAttrs.identityTag || c.id;
  const characteristics = (sheet.characteristics as NpcProfile['characteristics']) ?? undefined;
  // sheet.skills 形如 {技能名: {base,current,...}};名册的 skills 字段是 Record<name, number>,取 current
  const skillsRaw = sheet.skills as Record<string, { current?: number; base?: number }> | undefined;
  const skills: Record<string, number> | undefined = skillsRaw
    ? Object.fromEntries(
        Object.entries(skillsRaw)
          .map(([k, v]) => [k, typeof v?.current === 'number' ? v.current : (typeof v?.base === 'number' ? v.base : NaN)] as const)
          .filter(([, v]) => Number.isFinite(v)),
      )
    : undefined;

  return {
    id: c.id,
    name,
    identity: c.npcAttrs.identityTag,
    favorability: c.npcAttrs.attitudeDefault,
    appearance: '',
    personality: '',
    innerThoughts: c.npcAttrs.hiddenBio, // 隐藏简历 = KP 视角动机/秘密
    memories: [],
    experience: '',
    backstory: c.npcAttrs.publicBio, // 公开简历 = 背景故事(玩家可知)
    possessions: [],
    isPresent: false, // 剧本载入时默认离场;由剧情把人物拉到当前地点
    faction: c.npcAttrs.relationshipDefault || undefined,
    characteristics,
    skills,
    // 锚点：applyUpdates 据 isScenarioPreset 跳过 backstory/innerThoughts，
    // 保护剧本预设 NPC 的 KP 暗线核心(hiddenBio/publicBio)不被 LLM 主回合 npcUpdate 覆盖；
    // scenarioHiddenBio 留作 hiddenBio 的锁定副本，便于必要时回滚校验。
    isScenarioPreset: true,
    scenarioHiddenBio: c.npcAttrs.hiddenBio,
    createdAt: now,
    updatedAt: now,
  };
}

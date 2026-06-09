// 剧本系统 · 注入纯函数 — 参见 spec §4.2 第 4 步
// 把 ScenarioEntry[] → LoreEntry record；构造 statData 种子；把 ScenarioCharacter → NpcProfile
// 纯函数,不引 zustand store,可单测
import type { LoreEntry } from '../types';
import type { ScenarioEntry, ScenarioCharacter, ScenarioDoc } from '../types/scenario';
import type { NpcProfile } from '../types';
import { splitInitialItems } from './items-splitter';

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
  const 剧情: Record<string, unknown> = {
    暗线: {
      描述: scn.darkTimeline[0]?.directorNote ?? '',
      进度: 0,
      威胁等级: '潜伏',
    },
    结局类型: '',
    已解锁: {},
  };

  // 拯救路径:按 rescueEndings[].name 种入 路径.<name> 空进度桶 + 全局状态/胜出路径占位。
  // 无 rescueEndings → 整个 救援 枝省略(等 createInitialStatData 兜底)。
  // 用 ending.name 作 key:LLM 在 JSONPatch 路径里写 /剧情/救援/路径/封印古神/进度 时直观。
  const endings = scn.rescueEndings ?? [];
  if (endings.length > 0) {
    const 路径: Record<string, unknown> = {};
    for (const e of endings) {
      const key = (e.name ?? '').trim();
      if (!key) continue;
      路径[key] = { 已解锁: false, 进度: 0, 已达里程碑: [], 最近: '' };
    }
    剧情['救援'] = { 全局状态: '潜伏', 胜出路径: '', 路径 };
  }

  return { 剧情 };
}

/**
 * 构造常驻 lore entry「拯救路径状态」。
 * 与 useDarkThreadStore.buildContextInjection 的 darkThreadBucket 同形:
 * 由 useChatPipeline 在 buildContextFromPages 阶段读 useRescueStore.buildContextInjection()
 * 并包装到独立 LoreEntry。本函数仅生成"剧本固化的解锁/里程碑提示"部分(运行态由 store 拼接)。
 */
export function buildScenarioRescueLoreEntry(scn: ScenarioDoc): LoreEntry | null {
  const endings = scn.rescueEndings ?? [];
  if (endings.length === 0) return null;
  const lines: string[] = ['【拯救路径预设(剧本作者标注,玩家不可见)】'];
  for (const e of endings) {
    lines.push(`- 「${e.name}」(id: ${e.id})`);
    if (e.description) lines.push(`  结局:${e.description}`);
    if (e.unlockHint) lines.push(`  解锁条件:${e.unlockHint}`);
    if (e.milestones.length > 0) {
      lines.push('  里程碑:');
      for (const m of e.milestones) {
        const hintTxt = m.hint ? ` (${m.hint})` : '';
        lines.push(`    · ${m.name} +${m.delta}${hintTxt}`);
      }
    }
  }
  return {
    ...EMPTY_LORE_ENTRY,
    name: '拯救路径预设',
    keys: '拯救, 救援, rescue',
    content: lines.join('\n'),
    constant: true,
    position: 0,
    priority: 920,
    disabled: false,
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
  const identity = (sheet.identity as { name?: unknown } | undefined) ?? undefined;
  const rawName = identity && typeof identity.name === 'string' ? identity.name : '';
  const name = rawName.trim() ? rawName.trim() : c.npcAttrs.identityTag || c.id;
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

  // 解析 NPC 随身物品: sheet.initialItemsRaw 是顿号/逗号/换行/分号分隔的自由文本。
  // 括号内的分隔符保留（防「皮质药囊(含药草、亚麻绷带)」被切成 2 项导致 TeamSidebar
  // 武器列 regex 误把「亚麻绷带)」当武器名）。详见 src/scenario/items-splitter.ts。
  const itemsRaw = (sheet.initialItemsRaw as string | undefined) ?? '';
  const possessions = splitInitialItems(itemsRaw);

  return {
    id: c.id,
    name,
    identity: c.npcAttrs.identityTag,
    favorability: c.npcAttrs.attitudeDefault,
    // 外观快览: 公开身份说明(剧本作者写的一句话),NpcOverlay 顶部显示
    appearance: c.npcAttrs.publicBio,
    personality: c.npcAttrs.traits ?? '',
    innerThoughts: c.npcAttrs.hiddenBio, // 隐藏简历 = KP 视角动机/秘密
    memories: [],
    experience: '',
    // 背景故事: sheet.description 已被 _npc-helpers 拼成 8 段 markdown 格式
    //   (个人描述/思想信念/重要之人/重要场所/珍贵之物/特质/伤口伤痕/恐惧症狂躁症),
    //   与玩家角色卡的「制作方案」一致,NpcOverlay「背景故事」段直接显示。
    backstory: typeof sheet.description === 'string' && sheet.description.trim().length > 0
      ? sheet.description
      : c.npcAttrs.publicBio,
    possessions,
    // 开局在场:protagonist (推荐主角候选,玩家选一个其余作队友) + optional (配角可玩,默认同行)
    // 都在场;locked_npc (反派/已死者/俘虏) 不在场,由剧情后续引入。
    // 这样玩家进游戏就有 1-3 名 NPC 队友,与剧本「2-4 调查员」头计相吻合。
    isPresent: c.role !== 'locked_npc',
    faction: c.npcAttrs.relationshipDefault || undefined,
    characteristics,
    skills,
    // 锚点：applyUpdates 据 isScenarioPreset 跳过 backstory/innerThoughts，
    // 保护剧本预设 NPC 的 KP 暗线核心(hiddenBio/publicBio)不被 LLM 主回合 npcUpdate 覆盖；
    // scenarioHiddenBio 留作 hiddenBio 的锁定副本，便于必要时回滚校验。
    isScenarioPreset: true,
    scenarioHiddenBio: c.npcAttrs.hiddenBio,
    // 剧本注入 NPC 的位置默认沿用剧本中的 locationDefault(若有);importance 剧本预设 NPC 默认 '重要'。
    locationName: (c.npcAttrs.locationDefault ?? '').trim(),
    importance: '重要',
    createdAt: now,
    updatedAt: now,
  };
}

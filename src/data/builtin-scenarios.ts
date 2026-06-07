// 内置剧本常量（首装幂等种入）—— 参见 spec §7
import type { ScenarioDoc } from '../types/scenario';
import { SCENARIO_ROME_CTHULHU } from './scenarios/rome-cthulhu';
import { SCENARIO_DARK_AGES } from './scenarios/dark-ages';
import { SCENARIO_MYSTIC_ICELAND } from './scenarios/mystic-iceland';
import { SCENARIO_BLADE_AND_ARROW } from './scenarios/blade-and-arrow';
import { SCENARIO_GASLIGHT } from './scenarios/gaslight';
import { SCENARIO_DREAMLANDS } from './scenarios/dreamlands';
import { SCENARIO_ICARUS } from './scenarios/icarus';
import { SCENARIO_HARVEST } from './scenarios/harvest';

// 自由探索:1920 马萨诸塞氛围,无预设角色/条目/暗线,纯兜底
export const FREE_EXPLORATION_SCENARIO: ScenarioDoc = {
  id: '__free',
  builtin: true,
  meta: {
    name: '自由探索',
    type: '调查',
    durationHint: '长期连载',
    difficulty: 2,
    headcountHint: '1 人',
    sanLossHint: '中',
    blurb: '1920 年代马萨诸塞,雾色未散,故事从你自己写下的第一行开始。',
  },
  // 给 LLM 扩写 page[0] 的种子文本(冷开场,留白足供玩家任意切入)
  prologueSeed: [
    '1920 年深秋,马萨诸塞州。',
    '清晨的雾贴着结霜的草地缓慢滑动,空气里有锈铁、湿木与遥远咸海的味道。',
    '调查员从一段不甚踏实的睡眠中醒来,枕边放着一封昨夜读到一半的信、一只走慢了两分钟的怀表,',
    '以及一个尚未说出口、却已经悬在心头的疑问 —— 接下来,要从哪里开始?',
  ].join('\n'),
  recommendedSkills: [], // 空数组 → UI 自动回退 POPULAR_SKILLS
  recommendedOccupations: [],
  characters: [],
  customOccupations: [],
  customSkills: [],
  skillBlacklist: [],
  entries: [],
  darkTimeline: [],
  badEndings: [],
  authorNotes: '兜底剧本:无固定条目/暗线/坏结局,完全交给玩家与 LLM 即兴。',
  schemaVersion: 1,
  createdAt: 0, // 运行时首次 upsert 由主控更新
  updatedAt: 0,
};

// PDF 抽取的剧本：8 个时代设定（克苏鲁不败 / 黑暗时代 / 神秘冰岛 / 剑见箭 / 煤气灯 / 幻梦境 / 伊卡洛斯 / 收割）
// 源：COCExtends.pdf (Cthulhu Through the Ages)
export const PDF_EXTRACTED_SCENARIOS: ScenarioDoc[] = [
  SCENARIO_ROME_CTHULHU,
  SCENARIO_DARK_AGES,
  SCENARIO_MYSTIC_ICELAND,
  SCENARIO_BLADE_AND_ARROW,
  SCENARIO_GASLIGHT,
  SCENARIO_DREAMLANDS,
  SCENARIO_ICARUS,
  SCENARIO_HARVEST,
];

export const BUILTIN_SCENARIOS: ScenarioDoc[] = [FREE_EXPLORATION_SCENARIO, ...PDF_EXTRACTED_SCENARIOS];

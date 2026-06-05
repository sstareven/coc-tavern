// 内置剧本常量（首装幂等种入）—— 参见 spec §7
import type { ScenarioDoc } from '../types/scenario';

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
  entries: [],
  darkTimeline: [],
  badEndings: [],
  authorNotes: '兜底剧本:无固定条目/暗线/坏结局,完全交给玩家与 LLM 即兴。',
  schemaVersion: 1,
  createdAt: 0, // 运行时首次 upsert 由主控更新
  updatedAt: 0,
};

// PDF 抽取的剧本占位 —— 由并行 PDF 工作流回填(spec §7.2 / §11 桶 J)
export const PDF_EXTRACTED_SCENARIOS: ScenarioDoc[] = [];

export const BUILTIN_SCENARIOS: ScenarioDoc[] = [FREE_EXPLORATION_SCENARIO, ...PDF_EXTRACTED_SCENARIOS];

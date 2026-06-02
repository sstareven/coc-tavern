// AUTO-GENERATED 双人成行「当前效果预览」配置：每组→效果维度标签/模式/一句说明/优先级。
export interface EffectDim { groupTitle: string; label: string; mode: "single" | "multi"; effect: string; priority: number; }
export const EFFECT_DIMS: EffectDim[] = [
  {
    "groupTitle": "人称与话语权调度",
    "label": "人称视角",
    "mode": "single",
    "effect": "决定叙述是从你视角、角色视角还是群像视角展开，影响对白比例和你的代入感",
    "priority": 1
  },
  {
    "groupTitle": "情感基调",
    "label": "故事情感",
    "mode": "single",
    "effect": "设定故事的情感走向（治愈/伤感/积极/消极），会显著影响剧情发展和人物行为",
    "priority": 2
  },
  {
    "groupTitle": "特色文风滤镜库",
    "label": "写作文风",
    "mode": "single",
    "effect": "选择正文的叙述风格（轻小说/古风/NSFW等），决定文字呈现的整体气质和语言特色",
    "priority": 3
  },
  {
    "groupTitle": "思考功能",
    "label": "思考强化",
    "mode": "multi",
    "effect": "开启更多思考模块会让AI在生成剧情、处理冲突、丰富细节时更深入，但不建议超过4个",
    "priority": 7
  },
  {
    "groupTitle": "常规功能",
    "label": "核心功能",
    "mode": "multi",
    "effect": "基础设置如上帝模式(写小说)/思维链/字数等，决定故事的生成逻辑和输出形式",
    "priority": 4
  },
  {
    "groupTitle": "正文优化",
    "label": "表现修正",
    "mode": "multi",
    "effect": "针对正文的细节优化，如防重复、反绝望等，改善输出质量但需避免选项冲突",
    "priority": 6
  },
  {
    "groupTitle": "杀八股",
    "label": "套路清除",
    "mode": "multi",
    "effect": "清除陈词滥调和套路化表现，仅在正文严重套路化时开启，解决后立即关闭",
    "priority": 8
  },
  {
    "groupTitle": "补丁与扩展",
    "label": "功能扩展",
    "mode": "multi",
    "effect": "模块化扩展功能如IF番外线、第四面墙彩蛋等，增加故事的多样性和趣味性",
    "priority": 5
  },
  {
    "groupTitle": "附加选项",
    "label": "输出辅助",
    "mode": "multi",
    "effect": "防打断/防复述等辅助选项，改善与用户输入的衔接方式和正文呈现方式",
    "priority": 6
  },
  {
    "groupTitle": "深度优化",
    "label": "深度强化",
    "mode": "multi",
    "effect": "字数/写作优化/深度等高级选项，提升正文的思想深度和表现力",
    "priority": 7
  },
  {
    "groupTitle": "NPC与对白增强",
    "label": "互动感提升",
    "mode": "multi",
    "effect": "增加故事中的NPC活跃度和对白比例，让世界感受更立体和互动感更强",
    "priority": 5
  }
];
export const OVERALL_HINT = "以下是当前开启的泡泡实时归纳成「最终会输出什么样」的人话，让玩家一眼明白现在这套开关组合的效果。";

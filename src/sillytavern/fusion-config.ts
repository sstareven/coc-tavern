// 双人成行融合预设的采样参数（DS / 向斜阳两版共用）。
//
// 历史说明：早期这里还有一张 200+ 行的 FUSION_DEFAULT_ENABLED（按条目 id 的默认开关表）
// 和 FUSION_DISABLE_IDS（模型专属强制关列表）。但 buildFusionPreset 实际从未引用它们——
// 条目开关完全由「ST JSON 自带的 prompt_order.enabled + by-name/by-id 规则」决定
// （见 fusion-preset.ts 的 enabled 逻辑：lib_/使用指南/KILL_NAME/NSFW/文风库/main/推剧情）。
// 这两张死表已移除，避免被误当作生效配置。
export const FUSION_SAMPLERS = { temperature: 0.95, topP: 0.92, topK: 60, frequencyPenalty: 0, presencePenalty: 0, maxTokens: 18000 } as const;

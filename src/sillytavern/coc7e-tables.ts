/**
 * COC7e 理智/疯狂相关受控表项（Table VII/VIII 与 PHOBIA/MANIA 种子表）。
 *
 * 来源：COC7th2002c.pdf 第 8 章理智（Sanity）与附录 mania/phobia 表；
 * 种子先取常见 30 项，后续可按规则书扩到 100 项。供 sanity-engine / A2.4 evaluator /
 * A2.5 triggerBout、A2.6 timeJumpGenerator 与 UI 状态条统一引用，避免硬编码散落。
 */

/** 单条表项：1D10 / 1D100 命中的 roll 值；label 是简称；description 是给 LLM 与 UI 的简短解释。 */
export interface CocTableEntry {
  roll: number;
  label: string;
  description: string;
}

/** Table VII — 实时疯狂发作（10 项）。 */
export const BOUT_BEHAVIOR_TABLE: CocTableEntry[] = [
  { roll: 1, label: '失忆', description: '调查员失去过去 1D10 小时记忆，醒来不知身在何处。' },
  { roll: 2, label: '身体症状', description: '出现颤抖、抽搐、晕厥等生理反应，1D10 轮内无法行动。' },
  { roll: 3, label: '逃跑', description: '不计后果地逃离恐惧源，1D10 轮内只想着逃。' },
  { roll: 4, label: '战栗木僵', description: '原地僵立 1D10 轮，对外界刺激无反应。' },
  { roll: 5, label: '勃然大怒', description: '攻击眼前任何活物，1D10 轮持续怒袭，分不清敌友。' },
  { roll: 6, label: '极度恐惧', description: '获得一项新恐惧症（投 PHOBIA_TABLE）。' },
  { roll: 7, label: '强迫行为', description: '获得一项新狂躁症（投 MANIA_TABLE）。' },
  { roll: 8, label: '昏厥', description: '当场昏倒 1D10 轮。' },
  { roll: 9, label: '歇斯底里', description: '尖叫、大笑或痛哭 1D10 轮，无法采取理性行动。' },
  { roll: 10, label: '幻觉错乱', description: '出现 1D10 轮逼真幻觉，行动基于错误感知。' },
];

/** Table VIII — 总结型疯狂发作（独行/无清醒同伴时使用，10 项）。 */
export const BOUT_SUMMARY_TABLE: CocTableEntry[] = [
  { roll: 1, label: '失忆', description: '醒来时丢失 1D10 小时记忆，重要物品可能遗落。' },
  { roll: 2, label: '抢劫遇害', description: '神智恍惚被劫，财物损失大半，半数物品丢失。' },
  { roll: 3, label: '挨打受伤', description: '不知所踪后受到肉体袭击，HP 损失 1D10。' },
  { roll: 4, label: '滥用药物或酒精', description: '醒来宿醉或药物反应，1D6 天内技能受罚。' },
  { roll: 5, label: '远离原地', description: '醒来时已身处 1D10×10 公里外，需想办法返回。' },
  { roll: 6, label: '获得恐惧症', description: '袭来一种新恐惧症（投 PHOBIA_TABLE）。' },
  { roll: 7, label: '获得狂躁症', description: '袭来一种新狂躁症（投 MANIA_TABLE）。' },
  { roll: 8, label: '伤害他人', description: '醒来发现伤害了无关者，可能引发执法/复仇。' },
  { roll: 9, label: '加入邪教', description: '在恍惚中加入邪教或秘密团体，事后困惑且被关注。' },
  { roll: 10, label: '严重创伤', description: '深度精神冲击，永久 SAN 上限减 1D6。' },
];

/** PHOBIA — 1D100 受控库（30 项种子，后续可扩到 100）。roll 表示触发该项的最低 d100。 */
export const PHOBIA_TABLE: CocTableEntry[] = [
  { roll: 1, label: '深渊恐惧症', description: '害怕深井、悬崖、深渊与一切深不见底之处。' },
  { roll: 2, label: '黑暗恐惧症', description: '害怕黑暗与无光环境。' },
  { roll: 3, label: '广场恐惧症', description: '害怕空旷或拥挤的公共空间。' },
  { roll: 4, label: '飞行恐惧症', description: '害怕一切离地飞行与高空。' },
  { roll: 5, label: '蜘蛛恐惧症', description: '害怕蜘蛛与多足节肢动物。' },
  { roll: 6, label: '密闭恐惧症', description: '害怕狭小密闭空间。' },
  { roll: 7, label: '尸体恐惧症', description: '害怕尸体、坟墓与死亡相关之物。' },
  { roll: 8, label: '雷电恐惧症', description: '害怕雷暴、闪电与雷鸣。' },
  { roll: 9, label: '血液恐惧症', description: '见到血液即昏厥或惊恐。' },
  { roll: 10, label: '海洋恐惧症', description: '害怕大海、深水与未知的水下。' },
  { roll: 11, label: '尖物恐惧症', description: '害怕针、刀、尖锐物体。' },
  { roll: 12, label: '蛇类恐惧症', description: '害怕蛇与蛇形生物。' },
  { roll: 13, label: '陌生人恐惧症', description: '对陌生人产生强烈恐惧与回避。' },
  { roll: 14, label: '镜子恐惧症', description: '害怕镜子与自己的倒影。' },
  { roll: 15, label: '人偶恐惧症', description: '害怕娃娃、人偶与拟人玩具。' },
  { roll: 16, label: '细菌恐惧症', description: '害怕病菌污染，反复清洁。' },
  { roll: 17, label: '高处恐惧症', description: '害怕高处与坠落。' },
  { roll: 18, label: '夜晚恐惧症', description: '害怕入夜后的一切活动。' },
  { roll: 19, label: '火焰恐惧症', description: '害怕火与燃烧之物。' },
  { roll: 20, label: '溺水恐惧症', description: '害怕溺水与被水覆盖。' },
  { roll: 21, label: '人群恐惧症', description: '害怕大量人群聚集的场合。' },
  { roll: 22, label: '触手恐惧症', description: '害怕触手与软体扭曲生物。' },
  { roll: 23, label: '低语恐惧症', description: '害怕无源低语与窃窃私语。' },
  { roll: 24, label: '书籍恐惧症', description: '害怕古籍与未知文字的书。' },
  { roll: 25, label: '神像恐惧症', description: '害怕雕像、神像与拟人造像。' },
  { roll: 26, label: '宗教恐惧症', description: '害怕宗教仪式与祭祀场所。' },
  { roll: 27, label: '巨物恐惧症', description: '害怕一切体积庞大的事物。' },
  { roll: 28, label: '微小物恐惧症', description: '害怕微小生物或极细之物。' },
  { roll: 29, label: '机械恐惧症', description: '害怕机械装置与齿轮。' },
  { roll: 30, label: '电恐惧症', description: '害怕通电之物与电流。' },
];

/** MANIA — 1D100 受控库（30 项种子）。 */
export const MANIA_TABLE: CocTableEntry[] = [
  { roll: 1, label: '收集癖', description: '强迫性收集特定物品，无法割舍。' },
  { roll: 2, label: '洁癖', description: '反复清洁自身与环境。' },
  { roll: 3, label: '纵火癖', description: '冲动性想点燃事物。' },
  { roll: 4, label: '盗窃癖', description: '冲动性想拿走他人物品。' },
  { roll: 5, label: '杀人癖', description: '反复出现伤害他人的冲动。' },
  { roll: 6, label: '自残癖', description: '反复出现伤害自己的冲动。' },
  { roll: 7, label: '巨大狂', description: '坚信自己拥有非凡力量或地位。' },
  { roll: 8, label: '迫害狂', description: '坚信有人在监视、追害自己。' },
  { roll: 9, label: '阅读狂', description: '强迫性阅读一切文字。' },
  { roll: 10, label: '书写狂', description: '强迫性反复书写同一文字或符号。' },
  { roll: 11, label: '言谈狂', description: '强迫性持续讲话，难以停止。' },
  { roll: 12, label: '沉默症', description: '强迫性长时间不开口。' },
  { roll: 13, label: '工作狂', description: '强迫性持续工作至力竭。' },
  { roll: 14, label: '赌博癖', description: '强迫性赌博。' },
  { roll: 15, label: '酗酒癖', description: '强迫性饮酒。' },
  { roll: 16, label: '暴食症', description: '强迫性进食。' },
  { roll: 17, label: '厌食症', description: '强迫性拒食。' },
  { roll: 18, label: '色情狂', description: '强迫性追求色情刺激。' },
  { roll: 19, label: '宗教狂', description: '极端宗教狂热，强迫性礼拜。' },
  { roll: 20, label: '英雄狂', description: '强迫性把自己置于救援者位置。' },
  { roll: 21, label: '怀疑癖', description: '怀疑一切真相。' },
  { roll: 22, label: '虚言癖', description: '强迫性编造虚假故事。' },
  { roll: 23, label: '崇拜狂', description: '对特定人物盲目崇拜并模仿。' },
  { roll: 24, label: '占有欲', description: '强迫性把人或物据为己有。' },
  { roll: 25, label: '旅游癖', description: '强迫性想要不断迁徙。' },
  { roll: 26, label: '隐居癖', description: '强迫性回避一切社交。' },
  { roll: 27, label: '反对癖', description: '本能反对任何意见。' },
  { roll: 28, label: '献身狂', description: '强迫性自我牺牲。' },
  { roll: 29, label: '吹毛求疵', description: '强迫性纠错与挑剔细节。' },
  { roll: 30, label: '完美主义', description: '强迫性追求完美，无法收手。' },
];

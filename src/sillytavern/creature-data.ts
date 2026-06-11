/**
 * COC7e Ch14 (p240-313) 克苏鲁神话生物模板库。
 * 20 种常见生物的标准属性块（取典型/平均值），供战斗检测器
 * 在构建 Encounter 时以模板覆盖 LLM 输出，确保数值一致性。
 */

export interface CreatureAttack {
  name: string;
  skill: number;
  damage: string;
  attacksPerRound: number;
}

export interface CreatureTemplate {
  name: string;
  aliases: string[];
  str: number;
  con: number;
  siz: number;
  pow: number;
  dex: number;
  int: number;
  hp: number;
  armor: number;
  mov: number;
  db: string;
  build: number;
  attacks: CreatureAttack[];
  sanLoss: { success: string; fail: string };
}

export const CREATURE_TEMPLATES: CreatureTemplate[] = [
  // 1. 深潜者
  {
    name: '深潜者',
    aliases: ['Deep One', 'deep one', '深海怪'],
    str: 80, con: 65, siz: 75, pow: 55, dex: 50, int: 65,
    hp: 14, armor: 1, mov: 8, db: '1D4', build: 1,
    attacks: [{ name: '爪击', skill: 45, damage: '1D6+1D4', attacksPerRound: 1 }],
    sanLoss: { success: '0', fail: '1D6' },
  },
  // 2. 修格斯
  {
    name: '修格斯',
    aliases: ['Shoggoth', 'shoggoth'],
    str: 350, con: 200, siz: 450, pow: 55, dex: 40, int: 10,
    hp: 65, armor: 8, mov: 10, db: '9D6', build: 10,
    attacks: [{ name: '碾压', skill: 70, damage: '9D6', attacksPerRound: 1 }],
    sanLoss: { success: '1D6', fail: '1D20' },
  },
  // 3. 食尸鬼
  {
    name: '食尸鬼',
    aliases: ['Ghoul', 'ghoul'],
    str: 80, con: 80, siz: 65, pow: 60, dex: 65, int: 40,
    hp: 14, armor: 0, mov: 9, db: '1D4', build: 1,
    attacks: [
      { name: '爪击', skill: 40, damage: '1D6+1D4', attacksPerRound: 1 },
      { name: '咬', skill: 25, damage: '1D6', attacksPerRound: 1 },
    ],
    sanLoss: { success: '0', fail: '1D6' },
  },
  // 4. 米·戈
  {
    name: '米·戈',
    aliases: ['Mi-Go', 'mi-go', '米戈', '真菌人'],
    str: 55, con: 55, siz: 50, pow: 65, dex: 80, int: 75,
    hp: 10, armor: 0, mov: 7, db: '0', build: 0,
    attacks: [{ name: '钳击', skill: 40, damage: '1D6', attacksPerRound: 1 }],
    sanLoss: { success: '0', fail: '1D6' },
  },
  // 5. 暗黑幼体
  {
    name: '暗黑幼体',
    aliases: ['Dark Young', 'dark young', '暗黑幼仔'],
    str: 280, con: 180, siz: 320, pow: 100, dex: 60, int: 55,
    hp: 50, armor: 5, mov: 8, db: '6D6', build: 7,
    attacks: [{ name: '触手', skill: 80, damage: '6D6', attacksPerRound: 1 }],
    sanLoss: { success: '1D6', fail: '1D20' },
  },
  // 6. 廷达罗斯猎犬
  {
    name: '廷达罗斯猎犬',
    aliases: ['Hound of Tindalos', 'hound of tindalos', '廷达洛斯猎犬'],
    str: 105, con: 100, siz: 85, pow: 85, dex: 75, int: 90,
    hp: 18, armor: 2, mov: 12, db: '1D6', build: 2,
    attacks: [{ name: '舌刺', skill: 90, damage: '1D6+1D6', attacksPerRound: 1 }],
    sanLoss: { success: '1D3', fail: '1D20' },
  },
  // 7. 夜魇
  {
    name: '夜魇',
    aliases: ['Nightgaunt', 'nightgaunt', '夜鬼'],
    str: 80, con: 60, siz: 70, pow: 35, dex: 100, int: 45,
    hp: 13, armor: 0, mov: 6, db: '1D4', build: 1,
    attacks: [{ name: '擒抱', skill: 65, damage: '0', attacksPerRound: 1 }],
    sanLoss: { success: '0', fail: '1D6' },
  },
  // 8. 星之精
  {
    name: '星之精',
    aliases: ['Star Vampire', 'star vampire', '星际吸血鬼'],
    str: 140, con: 100, siz: 105, pow: 55, dex: 55, int: 45,
    hp: 20, armor: 0, mov: 10, db: '2D6', build: 3,
    attacks: [{ name: '吸血', skill: 80, damage: '1D6', attacksPerRound: 1 }],
    sanLoss: { success: '1', fail: '1D10' },
  },
  // 9. 蛇人
  {
    name: '蛇人',
    aliases: ['Serpent People', 'serpent people', '蛇人族'],
    str: 65, con: 55, siz: 65, pow: 80, dex: 70, int: 90,
    hp: 12, armor: 1, mov: 8, db: '0', build: 0,
    attacks: [{ name: '咬', skill: 50, damage: '1D8', attacksPerRound: 1 }],
    sanLoss: { success: '0', fail: '1D6' },
  },
  // 10. 飞水螅
  {
    name: '飞水螅',
    aliases: ['Flying Polyp', 'flying polyp'],
    str: 250, con: 150, siz: 300, pow: 100, dex: 75, int: 85,
    hp: 45, armor: 4, mov: 8, db: '5D6', build: 6,
    attacks: [{ name: '风暴', skill: 70, damage: '5D6', attacksPerRound: 1 }],
    sanLoss: { success: '1D6', fail: '1D20' },
  },
  // 11. 猎杀恐怖
  {
    name: '猎杀恐怖',
    aliases: ['Hunting Horror', 'hunting horror'],
    str: 210, con: 140, siz: 200, pow: 60, dex: 80, int: 25,
    hp: 34, armor: 5, mov: 7, db: '4D6', build: 5,
    attacks: [{ name: '咬', skill: 60, damage: '4D6', attacksPerRound: 1 }],
    sanLoss: { success: '0', fail: '1D10' },
  },
  // 12. 炎之精
  {
    name: '炎之精',
    aliases: ['Fire Vampire', 'fire vampire'],
    str: 1, con: 25, siz: 1, pow: 75, dex: 100, int: 50,
    hp: 2, armor: 0, mov: 15, db: '-2', build: -2,
    attacks: [{ name: '触碰', skill: 70, damage: '1D6', attacksPerRound: 1 }],
    sanLoss: { success: '0', fail: '1D6' },
  },
  // 13. 狂信徒
  {
    name: '狂信徒',
    aliases: ['Cultist', 'cultist', '邪教徒', '信徒'],
    str: 55, con: 55, siz: 60, pow: 50, dex: 50, int: 50,
    hp: 11, armor: 0, mov: 8, db: '0', build: 0,
    attacks: [{ name: '匕首', skill: 35, damage: '1D4', attacksPerRound: 1 }],
    sanLoss: { success: '0', fail: '0' },
  },
  // 14. 僵尸
  {
    name: '僵尸',
    aliases: ['Zombie', 'zombie', '丧尸', '活死人'],
    str: 80, con: 80, siz: 65, pow: 5, dex: 35, int: 10,
    hp: 14, armor: 0, mov: 6, db: '1D4', build: 1,
    attacks: [{ name: '爪抓', skill: 40, damage: '1D6+1D4', attacksPerRound: 1 }],
    sanLoss: { success: '0', fail: '1D8' },
  },
  // 15. 骷髅
  {
    name: '骷髅',
    aliases: ['Skeleton', 'skeleton', '白骨'],
    str: 55, con: 25, siz: 50, pow: 5, dex: 45, int: 10,
    hp: 7, armor: 0, mov: 7, db: '0', build: 0,
    attacks: [{ name: '爪抓', skill: 35, damage: '1D4', attacksPerRound: 1 }],
    sanLoss: { success: '0', fail: '1D6' },
  },
  // 16. 蜘蛛精
  {
    name: '蜘蛛精',
    aliases: ['Leng Spider', 'leng spider', '冷原蜘蛛'],
    str: 130, con: 110, siz: 150, pow: 85, dex: 60, int: 80,
    hp: 26, armor: 3, mov: 10, db: '2D6', build: 3,
    attacks: [{ name: '咬', skill: 60, damage: '1D6', attacksPerRound: 1 }],
    sanLoss: { success: '1', fail: '1D10' },
  },
  // 17. 无面怪
  {
    name: '无面怪',
    aliases: ['Dimensional Shambler', 'dimensional shambler', '次元行者'],
    str: 120, con: 90, siz: 95, pow: 65, dex: 70, int: 55,
    hp: 18, armor: 2, mov: 9, db: '2D6', build: 3,
    attacks: [{ name: '爪击', skill: 55, damage: '2D6', attacksPerRound: 1 }],
    sanLoss: { success: '0', fail: '1D10' },
  },
  // 18. 拜亚基
  {
    name: '拜亚基',
    aliases: ['Byakhee', 'byakhee'],
    str: 100, con: 85, siz: 95, pow: 55, dex: 85, int: 35,
    hp: 18, armor: 2, mov: 5, db: '1D6', build: 2,
    attacks: [{ name: '爪击', skill: 55, damage: '1D6+1D6', attacksPerRound: 1 }],
    sanLoss: { success: '1', fail: '1D6' },
  },
  // 19. 沙尼宫人
  {
    name: '沙尼宫人',
    aliases: ['Shan', 'shan', '昆虫来客'],
    str: 5, con: 15, siz: 1, pow: 75, dex: 75, int: 80,
    hp: 1, armor: 0, mov: 3, db: '-2', build: -2,
    attacks: [{ name: '寄生', skill: 75, damage: '0', attacksPerRound: 1 }],
    sanLoss: { success: '0', fail: '1D10' },
  },
  // 20. 伊斯之伟大种族
  {
    name: '伊斯之伟大种族',
    aliases: ['Great Race of Yith', 'great race of yith', '伊斯大种族', '大种族'],
    str: 150, con: 100, siz: 200, pow: 100, dex: 55, int: 120,
    hp: 30, armor: 5, mov: 7, db: '3D6', build: 4,
    attacks: [{ name: '钳击', skill: 30, damage: '3D6', attacksPerRound: 1 }],
    sanLoss: { success: '0', fail: '1D6' },
  },
];

/**
 * 按名称/别名模糊匹配生物模板。
 * 支持中文名、英文名、大小写不敏感、子串匹配（如"一只食尸鬼"能匹配"食尸鬼"）。
 */
export function matchCreature(name: string): CreatureTemplate | null {
  const lower = name.toLowerCase();
  return CREATURE_TEMPLATES.find((t) => {
    if (lower.includes(t.name.toLowerCase())) return true;
    return t.aliases.some((a) => lower.includes(a.toLowerCase()));
  }) ?? null;
}

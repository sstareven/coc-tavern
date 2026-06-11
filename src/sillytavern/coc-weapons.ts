/**
 * COC7e 常见武器映射表（1920s）。把随身物品名匹配到正确的「治理技能 / 伤害 / 射程 / 弹量」，
 * 使战斗用【特定武器】的真实命中(技能)与伤害，而非笼统的 1D6/1D10。数据参考规则书表 XVII。
 *
 * damage 只含【武器伤害】(不含 DB)——近战的伤害加值由引擎据 damageBonus 另加；火器不加 DB。
 * skillKeys 按「专精在前、通用在后」排列，调用方据角色卡逐个查（查不到再用兜底默认值）。
 */
export interface WeaponTemplate {
  test: RegExp;
  skillKeys: string[];
  damage: string;
  impaling: boolean;
  ranged: boolean;
  baseRange?: number;
  attacksPerRound: number;
  magazine?: number;
}

const HANDGUN = ['射击(手枪)'];
const RIFLE = ['射击(步枪)'];
const SHOTGUN = ['射击(霰弹枪)'];
const SMG = ['射击(冲锋枪)'];
const BOW = ['射击(弓)'];
const BRAWL = ['格斗(斗殴)'];

/** 顺序敏感：specific → generic（先匹配到的胜出）。 */
const TABLE: WeaponTemplate[] = [
  // —— 火器（先具体口径/类型，后通用）——
  { test: /霰弹|散弹|猎枪/, skillKeys: SHOTGUN, damage: '4D6', impaling: false, ranged: true, baseRange: 10, attacksPerRound: 1, magazine: 2 },
  { test: /冲锋枪|汤普森|汤姆逊|斯登/, skillKeys: SMG, damage: '1D10+2', impaling: true, ranged: true, baseRange: 20, attacksPerRound: 1, magazine: 20 },
  { test: /步枪|来福|马枪|卡宾/, skillKeys: RIFLE, damage: '2D6+4', impaling: true, ranged: true, baseRange: 110, attacksPerRound: 1, magazine: 5 },
  { test: /弓箭|长弓|短弓|弓/, skillKeys: BOW, damage: '1D6', impaling: true, ranged: true, baseRange: 30, attacksPerRound: 1, magazine: 1 },
  { test: /\.?45|点四五|柯尔特|马格南|马革南/, skillKeys: HANDGUN, damage: '1D10+2', impaling: true, ranged: true, baseRange: 15, attacksPerRound: 2, magazine: 7 },
  { test: /\.?38|点三八/, skillKeys: HANDGUN, damage: '1D10', impaling: true, ranged: true, baseRange: 15, attacksPerRound: 2, magazine: 6 },
  { test: /\.?32|点三二/, skillKeys: HANDGUN, damage: '1D8', impaling: true, ranged: true, baseRange: 15, attacksPerRound: 2, magazine: 6 },
  { test: /\.?22|点二二/, skillKeys: HANDGUN, damage: '1D6', impaling: true, ranged: true, baseRange: 10, attacksPerRound: 2, magazine: 6 },
  { test: /左轮|转轮/, skillKeys: HANDGUN, damage: '1D10', impaling: true, ranged: true, baseRange: 15, attacksPerRound: 1, magazine: 6 },
  { test: /手枪|手铳|手炮|自动手枪/, skillKeys: HANDGUN, damage: '1D10', impaling: true, ranged: true, baseRange: 15, attacksPerRound: 2, magazine: 7 },
  { test: /枪/, skillKeys: HANDGUN, damage: '1D8', impaling: true, ranged: true, baseRange: 15, attacksPerRound: 1, magazine: 6 }, // 兜底火器

  // —— 近战 ——
  { test: /链锯/, skillKeys: ['格斗(链锯)', ...BRAWL], damage: '2D8', impaling: true, ranged: false, attacksPerRound: 1 },
  { test: /指虎|拳套/, skillKeys: BRAWL, damage: '1D3+1', impaling: false, ranged: false, attacksPerRound: 1 },
  { test: /伐木斧|大斧|战斧/, skillKeys: ['格斗(斧)', ...BRAWL], damage: '1D8+2', impaling: true, ranged: false, attacksPerRound: 1 },
  { test: /斧|镰/, skillKeys: ['格斗(斧)', ...BRAWL], damage: '1D6+1', impaling: true, ranged: false, attacksPerRound: 1 },
  { test: /武士刀|军刀|马刀|大刀|弯刀|砍刀/, skillKeys: ['格斗(剑)', ...BRAWL], damage: '1D8', impaling: true, ranged: false, attacksPerRound: 1 },
  { test: /长剑|重剑|花剑|剑杖|剑/, skillKeys: ['格斗(剑)', ...BRAWL], damage: '1D6+1', impaling: true, ranged: false, attacksPerRound: 1 },
  { test: /矛|标枪|长枪/, skillKeys: ['格斗(矛)', ...BRAWL], damage: '1D8+1', impaling: true, ranged: false, attacksPerRound: 1 },
  { test: /鞭/, skillKeys: ['格斗(鞭)', ...BRAWL], damage: '1D3', impaling: false, ranged: false, attacksPerRound: 1 },
  { test: /切肉刀|菜刀/, skillKeys: BRAWL, damage: '1D4+2', impaling: true, ranged: false, attacksPerRound: 1 },
  { test: /匕首|短刀|折叠刀|弹簧刀|小刀|猎刀|刀/, skillKeys: BRAWL, damage: '1D4', impaling: true, ranged: false, attacksPerRound: 1 },
  { test: /棒球棒|球棒|拨火棍|警棍|铁棍|木棒|短棍|长棍|棍|棒|锤|榔头/, skillKeys: BRAWL, damage: '1D8', impaling: false, ranged: false, attacksPerRound: 1 },
  { test: /火把|火炬/, skillKeys: BRAWL, damage: '1D6', impaling: false, ranged: false, attacksPerRound: 1 },
];

/** 据武器名匹配 COC7e 模板；无匹配返回 null（调用方回落粗略启发式）。 */
export function matchWeaponTemplate(name: string): WeaponTemplate | null {
  return TABLE.find((t) => t.test.test(name)) ?? null;
}

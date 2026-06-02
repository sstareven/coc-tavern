import type { COC7Characteristic } from '../types';

/* ============================== Constants ============================== */

export const STEPS = ['身份信息', '基础属性', '衍生属性', '职业与技能', '背景故事', '确认创建'];

export const CHAR_ORDER: { key: COC7Characteristic; zh: string; en: string }[] = [
  { key: 'STR', zh: '力量', en: 'STR' },
  { key: 'CON', zh: '体质', en: 'CON' },
  { key: 'POW', zh: '意志', en: 'POW' },
  { key: 'DEX', zh: '敏捷', en: 'DEX' },
  { key: 'APP', zh: '外貌', en: 'APP' },
  { key: 'SIZ', zh: '体型', en: 'SIZ' },
  { key: 'INT', zh: '智力', en: 'INT' },
  { key: 'EDU', zh: '教育', en: 'EDU' },
];

export type SkillCat = '侦查系' | '护理系' | '运动系' | '战斗系' | '交涉系' | '生活系';
export const CAT_COLORS: Record<SkillCat, string> = {
  '侦查系': '#69f0ae', '护理系': '#ef5350', '运动系': '#ffab40',
  '战斗系': '#42a5f5', '交涉系': '#ffd740', '生活系': '#b0bec5',
};
export const ALL_SKILLS: { name: string; en: string; base: number | 'DEX_HALF' | 'EDU'; cat: SkillCat }[] = [
  // ── 侦查系 (Investigation) ──
  { name: '会计学', en: 'Accounting', base: 5, cat: '侦查系' },
  { name: '乔装', en: 'Disguise', base: 5, cat: '侦查系' },
  { name: '图书馆使用', en: 'Library Use', base: 20, cat: '侦查系' },
  { name: '聆听', en: 'Listen', base: 20, cat: '侦查系' },
  { name: '锁匠', en: 'Locksmith', base: 1, cat: '侦查系' },
  { name: '妙手', en: 'Sleight of Hand', base: 10, cat: '侦查系' },
  { name: '侦查', en: 'Spot Hidden', base: 25, cat: '侦查系' },
  { name: '潜行', en: 'Stealth', base: 20, cat: '侦查系' },
  { name: '追踪', en: 'Track', base: 10, cat: '侦查系' },
  { name: '摄影', en: 'Photography', base: 5, cat: '侦查系' },
  { name: '藏匿', en: 'Conceal', base: 15, cat: '侦查系' },
  // ── 护理系 (Medical) ──
  { name: '急救', en: 'First Aid', base: 30, cat: '护理系' },
  { name: '医学', en: 'Medicine', base: 1, cat: '护理系' },
  { name: '精神分析', en: 'Psychoanalysis', base: 1, cat: '护理系' },
  // ── 运动系 (Athletic) ──
  { name: '攀爬', en: 'Climb', base: 20, cat: '运动系' },
  { name: '躲闪', en: 'Dodge', base: 'DEX_HALF', cat: '运动系' },
  { name: '跳跃', en: 'Jump', base: 20, cat: '运动系' },
  { name: '骑术', en: 'Ride', base: 5, cat: '运动系' },
  { name: '游泳', en: 'Swim', base: 20, cat: '运动系' },
  { name: '投掷', en: 'Throw', base: 20, cat: '运动系' },
  // ── 战斗系 (Combat) ──
  { name: '格斗(斗殴)', en: 'Fighting(Brawl)', base: 25, cat: '战斗系' },
  { name: '枪械(手枪)', en: 'Firearms(Handgun)', base: 20, cat: '战斗系' },
  { name: '枪械(步枪/霰弹枪)', en: 'Firearms(Rifle/Shotgun)', base: 25, cat: '战斗系' },
  // ── 交涉系 (Social) ──
  { name: '取悦', en: 'Charm', base: 15, cat: '交涉系' },
  { name: '话术', en: 'Fast Talk', base: 5, cat: '交涉系' },
  { name: '恐吓', en: 'Intimidate', base: 15, cat: '交涉系' },
  { name: '说服', en: 'Persuade', base: 10, cat: '交涉系' },
  { name: '心理学', en: 'Psychology', base: 10, cat: '交涉系' },
  // ── 生活系 (General / Knowledge / Practical) ──
  { name: '人类学', en: 'Anthropology', base: 1, cat: '生活系' },
  { name: '估价', en: 'Appraise', base: 5, cat: '生活系' },
  { name: '考古学', en: 'Archaeology', base: 1, cat: '生活系' },
  { name: '艺术与手艺', en: 'Art/Craft', base: 5, cat: '生活系' },
  { name: '计算机使用', en: 'Computer Use', base: 5, cat: '生活系' },
  { name: '汽车驾驶', en: 'Drive Auto', base: 20, cat: '生活系' },
  { name: '电气维修', en: 'Electrical Repair', base: 10, cat: '生活系' },
  { name: '电子学', en: 'Electronics', base: 1, cat: '生活系' },
  { name: '历史', en: 'History', base: 5, cat: '生活系' },
  { name: '语言(母语)', en: 'Language(Own)', base: 'EDU', cat: '生活系' },
  { name: '语言(其他)', en: 'Language(Other)', base: 1, cat: '生活系' },
  { name: '法律', en: 'Law', base: 5, cat: '生活系' },
  { name: '机械维修', en: 'Mechanical Repair', base: 10, cat: '生活系' },
  { name: '博物学', en: 'Natural World', base: 10, cat: '生活系' },
  { name: '导航', en: 'Navigate', base: 10, cat: '生活系' },
  { name: '神秘学', en: 'Occult', base: 5, cat: '生活系' },
  { name: '操作重型机械', en: 'Operate Heavy Machinery', base: 1, cat: '生活系' },
  { name: '驾驶', en: 'Pilot', base: 1, cat: '生活系' },
  { name: '生存', en: 'Survival', base: 10, cat: '生活系' },
  { name: '爆破', en: 'Demolitions', base: 1, cat: '生活系' },
  { name: '克苏鲁神话', en: 'Cthulhu Mythos', base: 0, cat: '生活系' },
  // ── 科学分支 (Science specializations) ──
  { name: '科学(生物学)', en: 'Science(Biology)', base: 1, cat: '生活系' },
  { name: '科学(化学)', en: 'Science(Chemistry)', base: 1, cat: '生活系' },
  { name: '科学(工程学)', en: 'Science(Engineering)', base: 1, cat: '生活系' },
  { name: '科学(地质学)', en: 'Science(Geology)', base: 1, cat: '生活系' },
  { name: '科学(数学)', en: 'Science(Mathematics)', base: 10, cat: '生活系' },
  { name: '科学(气象学)', en: 'Science(Meteorology)', base: 1, cat: '生活系' },
  { name: '科学(物理学)', en: 'Science(Physics)', base: 1, cat: '生活系' },
];

export const SKILL_DESC: Record<string, string> = {
  // 侦查系
  '会计学': '审查账目发现财务违规与秘密交易',
  '乔装': '改变外貌以隐藏身份',
  '图书馆使用': '在图书馆快速查找资料与信息',
  '聆听': '察觉细微声音、对话与异常动静',
  '锁匠': '开锁与解除机械机关',
  '妙手': '灵妙手指操作、藏匿小物件与戏法',
  '侦查': '发现隐藏的线索、细节与异常',
  '潜行': '安静移动不被发现',
  '追踪': '追踪足迹与痕迹',
  '摄影': '拍摄清晰照片,捕捉细节证据,辨别照片真伪',
  '藏匿': '隐藏物品不被他人发现',
  // 护理系
  '急救': '紧急医疗处理、止血与稳定伤势',
  '医学': '诊断疾病、进行外科手术与治疗',
  '精神分析': '心理治疗,恢复理智值,缓解恐惧症状',
  // 运动系
  '攀爬': '攀爬墙壁、树木或岩石表面',
  '躲闪': '闪避攻击与危险',
  '跳跃': '跳跃跨越障碍',
  '骑术': '骑马与操控坐骑',
  '游泳': '在水中游泳、漂浮与潜水',
  '投掷': '投掷物品或武器',
  // 战斗系
  '格斗(斗殴)': '徒手近战攻击',
  '枪械(手枪)': '使用手枪射击',
  '枪械(步枪/霰弹枪)': '使用步枪或霰弹枪射击',
  // 交涉系
  '取悦': '通过魅力、诱惑或奉承影响他人',
  '话术': '用快速言辞混淆或欺骗对方',
  '恐吓': '通过威胁与暴力震慑他人',
  '说服': '用逻辑论证与理性辩论说服对方',
  '心理学': '分析他人情绪、动机与判断谎言',
  // 生活系
  '人类学': '观察理解不同文化的生活方式与信仰',
  '估价': '判断物品年代、真伪与市场价值',
  '考古学': '识别古迹、解读铭文与文物',
  '艺术与手艺': '创作艺术作品或精通某种手工艺',
  '计算机使用': '操作计算机与编写程序Ω',
  '汽车驾驶': '驾驶汽车与轻型车辆',
  '电气维修': '修理电气设备与线路',
  '电子学': '理解与修理电子设备Ω',
  '历史': '回忆历史事件、人物与年代',
  '语言(母语)': '母语的读写与表达能力',
  '语言(其他)': '外语的读写与会话能力',
  '法律': '理解法律条文与司法程序',
  '机械维修': '修理机械设备与引擎',
  '博物学': '识别动植物与自然现象',
  '导航': '判断方向、使用地图与仪器定位',
  '神秘学': '识别超自然现象与神秘学知识',
  '操作重型机械': '操作起重机、推土机等重型设备',
  '驾驶': '驾驶飞机、船只等专精交通工具',
  '生存': '在荒野中寻找食物、水源与住所',
  '爆破': '安全使用炸药,拆除或破坏结构',
  '克苏鲁神话': '理解克苏鲁神话的恐怖真相(会降低理智值上限)',
  // 科学分支
  '科学(生物学)': '研究生命体、植物与生态系统',
  '科学(化学)': '分析物质成分与化学反应',
  '科学(工程学)': '设计建造结构与机械',
  '科学(地质学)': '研究地球构造、矿物与地质活动',
  '科学(数学)': '数学计算与逻辑推理',
  '科学(气象学)': '观测与预测天气与气候',
  '科学(物理学)': '理解物理定律与现象',
};

/**
 * 技能别名归一化：把 LLM 常用的口语/简称（检定或 MVU 变量写入时）归一到 ALL_SKILLS / 角色卡的精确名，
 * 避免不精确匹配落到 fallback，或在角色卡里写出与读取键不一致的「孤儿技能」。
 * key 不得与任何精确技能名/属性名冲突。
 * 注意：「驾驶」是合法精确名(Pilot 飞机/船)，故不作别名 key；「汽车/开车」单独归到「汽车驾驶」。
 */
export const SKILL_ALIASES: Record<string, string> = {
  '闪避': '躲闪',
  '母语': '语言(母语)',
  '外语': '语言(其他)', '其他语言': '语言(其他)',
  '格斗': '格斗(斗殴)', '斗殴': '格斗(斗殴)', '近战': '格斗(斗殴)',
  '手枪': '枪械(手枪)',
  '步枪': '枪械(步枪/霰弹枪)', '霰弹枪': '枪械(步枪/霰弹枪)', '猎枪': '枪械(步枪/霰弹枪)',
  '计算机': '计算机使用', '电脑': '计算机使用',
  '图书馆': '图书馆使用',
  '信用': '信用评级', '信誉': '信用评级',
  '侦察': '侦查',
  '快速交谈': '话术', '急智': '话术',
  '汽车': '汽车驾驶', '开车': '汽车驾驶', '驾车': '汽车驾驶',
  '克苏鲁': '克苏鲁神话', '神话': '克苏鲁神话',
};

/** 把技能名归一到精确键：全角括号→半角 + 别名归一（不含依赖角色卡的专精模糊匹配）。 */
export function normalizeSkillKey(raw: string): string {
  const t = raw.trim().replace(/（/g, '(').replace(/）/g, ')');
  return SKILL_ALIASES[t] ?? t;
}

/* ============================== CoC 7th Occupations ============================== */

export interface Occupation {
  name: string; en: string;
  crMin: number; crMax: number;
  skills: string[]; // suggested occupation skills (8 recommended)
}
export const COC_OCCUPATIONS: Occupation[] = [
  { name: '会计', en: 'Accountant', crMin: 30, crMax: 70, skills: ['会计学','法律','图书馆使用','聆听','说服','侦查','语言(其他)','科学(数学)'] },
  { name: '演员', en: 'Actor', crMin: 9, crMax: 40, skills: ['艺术与手艺','乔装','话术','取悦','心理学','侦查','语言(其他)','历史'] },
  { name: '特工', en: 'Agency Detective', crMin: 20, crMax: 45, skills: ['侦查','乔装','心理学','法律','潜行','图书馆使用','话术','枪械(手枪)'] },
  { name: '人类学家', en: 'Anthropologist', crMin: 9, crMax: 30, skills: ['人类学','历史','图书馆使用','聆听','说服','神秘学','考古学','科学'] },
  { name: '古物学家', en: 'Antiquarian', crMin: 30, crMax: 70, skills: ['估价','考古学','历史','图书馆使用','神秘学','说服','侦查','语言(其他)'] },
  { name: '考古学家', en: 'Archaeologist', crMin: 10, crMax: 40, skills: ['考古学','历史','图书馆使用','神秘学','科学','侦查','摄影','导航'] },
  { name: '建筑师', en: 'Architect', crMin: 30, crMax: 70, skills: ['艺术与手艺','科学(数学)','图书馆使用','说服','科学','侦查','机械维修','电气维修'] },
  { name: '艺术家', en: 'Artist', crMin: 9, crMax: 50, skills: ['艺术与手艺','历史','心理学','侦查','取悦','博物学','摄影','科学'] },
  { name: '运动员', en: 'Athlete', crMin: 9, crMax: 70, skills: ['攀爬','跳跃','格斗(斗殴)','游泳','投掷','躲闪','急救','骑术'] },
  { name: '作家', en: 'Author', crMin: 9, crMax: 50, skills: ['艺术与手艺','历史','图书馆使用','神秘学','心理学','说服','侦查','语言(其他)'] },
  { name: '酒保', en: 'Bartender', crMin: 9, crMax: 40, skills: ['话术','取悦','聆听','心理学','侦查','格斗(斗殴)','语言(其他)','急救'] },
  { name: '拳击手', en: 'Boxer', crMin: 9, crMax: 30, skills: ['格斗(斗殴)','躲闪','攀爬','跳跃','恐吓','急救','心理学','侦查'] },
  { name: '窃贼', en: 'Burglar', crMin: 5, crMax: 40, skills: ['锁匠','妙手','潜行','侦查','估价','攀爬','话术','心理学'] },
  { name: '管家/女仆', en: 'Butler/Maid', crMin: 9, crMax: 40, skills: ['会计学','急救','聆听','心理学','侦查','潜行','艺术与手艺','取悦'] },
  { name: '神职人员', en: 'Clergy', crMin: 9, crMax: 60, skills: ['会计学','历史','图书馆使用','聆听','说服','心理学','神秘学','急救'] },
  { name: '罪犯', en: 'Criminal', crMin: 5, crMax: 65, skills: ['妙手','潜行','锁匠','侦查','话术','心理学','格斗(斗殴)','驾驶'] },
  { name: '设计师', en: 'Designer', crMin: 20, crMax: 60, skills: ['艺术与手艺','会计学','说服','心理学','侦查','图书馆使用','摄影','语言(其他)'] },
  { name: '医生', en: 'Doctor of Medicine', crMin: 30, crMax: 80, skills: ['急救','医学','心理学','科学','说服','图书馆使用','语言(其他)','科学(生物学)'] },
  { name: '流浪者', en: 'Drifter', crMin: 0, crMax: 5, skills: ['攀爬','跳跃','聆听','侦查','潜行','妙手','急救','博物学'] },
  { name: '编辑', en: 'Editor', crMin: 10, crMax: 40, skills: ['艺术与手艺','历史','图书馆使用','说服','心理学','侦查','语言(其他)','科学'] },
  { name: '工程师', en: 'Engineer', crMin: 20, crMax: 50, skills: ['机械维修','电气维修','科学','图书馆使用','科学(数学)','操作重型机械','科学(物理学)','导航'] },
  { name: '艺人', en: 'Entertainer', crMin: 9, crMax: 40, skills: ['艺术与手艺','乔装','话术','取悦','聆听','心理学','侦查','语言(其他)'] },
  { name: '探险家', en: 'Explorer', crMin: 20, crMax: 55, skills: ['导航','生存','博物学','攀爬','游泳','侦查','急救','摄影'] },
  { name: '农民', en: 'Farmer', crMin: 9, crMax: 30, skills: ['操作重型机械','机械维修','博物学','电气维修','急救','汽车驾驶','科学','投掷'] },
  { name: '消防员', en: 'Firefighter', crMin: 9, crMax: 30, skills: ['攀爬','跳跃','操作重型机械','急救','机械维修','汽车驾驶','科学','侦查'] },
  { name: '赌徒', en: 'Gambler', crMin: 4, crMax: 45, skills: ['妙手','话术','心理学','会计学','侦查','取悦','聆听','语言(其他)'] },
  { name: '黑帮', en: 'Gangster', crMin: 10, crMax: 60, skills: ['格斗(斗殴)','枪械(手枪)','话术','恐吓','心理学','汽车驾驶','侦查','妙手'] },
  { name: '记者', en: 'Journalist', crMin: 9, crMax: 50, skills: ['话术','聆听','图书馆使用','心理学','侦查','说服','摄影','语言(其他)'] },
  { name: '律师', en: 'Lawyer', crMin: 30, crMax: 80, skills: ['法律','说服','话术','心理学','图书馆使用','会计学','取悦','语言(其他)'] },
  { name: '图书馆员', en: 'Librarian', crMin: 9, crMax: 35, skills: ['图书馆使用','会计学','历史','神秘学','心理学','说服','侦查','语言(其他)'] },
  { name: '机械师', en: 'Mechanic', crMin: 10, crMax: 40, skills: ['机械维修','电气维修','操作重型机械','科学','汽车驾驶','科学(物理学)','科学(工程学)','估价'] },
  { name: '军官', en: 'Military Officer', crMin: 20, crMax: 70, skills: ['会计学','格斗(斗殴)','枪械(手枪)','导航','心理学','侦查','汽车驾驶','急救'] },
  { name: '矿工', en: 'Miner', crMin: 9, crMax: 30, skills: ['攀爬','操作重型机械','机械维修','科学','博物学','潜行','侦查','电气维修'] },
  { name: '音乐家', en: 'Musician', crMin: 9, crMax: 40, skills: ['艺术与手艺','聆听','心理学','取悦','话术','侦查','语言(其他)','历史'] },
  { name: '护士', en: 'Nurse', crMin: 9, crMax: 40, skills: ['急救','医学','心理学','科学','说服','聆听','侦查','人类学'] },
  { name: '神秘学家', en: 'Occultist', crMin: 9, crMax: 65, skills: ['神秘学','历史','图书馆使用','人类学','心理学','说服','侦查','科学'] },
  { name: '摄影师', en: 'Photographer', crMin: 9, crMax: 30, skills: ['摄影','乔装','科学','侦查','艺术与手艺','心理学','汽车驾驶','科学(化学)'] },
  { name: '飞行员', en: 'Pilot', crMin: 20, crMax: 70, skills: ['驾驶','导航','机械维修','电气维修','科学','侦查','科学(气象学)','急救'] },
  { name: '警察', en: 'Police Detective', crMin: 20, crMax: 50, skills: ['侦查','心理学','格斗(斗殴)','枪械(手枪)','法律','话术','汽车驾驶','潜行'] },
  { name: '私家侦探', en: 'Private Investigator', crMin: 9, crMax: 50, skills: ['侦查','心理学','法律','潜行','锁匠','图书馆使用','摄影','格斗(斗殴)'] },
  { name: '教授', en: 'Professor', crMin: 20, crMax: 70, skills: ['图书馆使用','心理学','说服','历史','科学','语言(其他)','会计学','聆听'] },
  { name: '精神分析师', en: 'Psychoanalyst', crMin: 30, crMax: 80, skills: ['精神分析','心理学','医学','说服','图书馆使用','历史','科学','聆听'] },
  { name: '水手', en: 'Sailor', crMin: 9, crMax: 30, skills: ['导航','游泳','攀爬','生存','机械维修','急救','会计学','电气维修'] },
  { name: '科学家', en: 'Scientist', crMin: 10, crMax: 50, skills: ['科学','图书馆使用','科学(数学)','电气维修','科学(化学)','科学(生物学)','科学(物理学)','摄影'] },
  { name: '士兵', en: 'Soldier/Marine', crMin: 10, crMax: 50, skills: ['格斗(斗殴)','枪械(手枪)','躲闪','潜行','急救','导航','汽车驾驶','侦查'] },
  { name: '学生', en: 'Student', crMin: 5, crMax: 30, skills: ['图书馆使用','历史','科学','语言(其他)','说服','心理学','侦查','藏匿'] },
  { name: '出租车司机', en: 'Taxi Driver', crMin: 9, crMax: 30, skills: ['汽车驾驶','导航','话术','聆听','侦查','机械维修','急救','心理学'] },
  { name: '教师', en: 'Teacher', crMin: 9, crMax: 50, skills: ['说服','心理学','图书馆使用','历史','科学','语言(其他)','聆听','急救'] },
  { name: '殡葬师', en: 'Undertaker', crMin: 20, crMax: 60, skills: ['会计学','乔装','话术','心理学','聆听','潜行','科学','急救'] },
  { name: '服务员', en: 'Waitress/Waiter', crMin: 5, crMax: 30, skills: ['聆听','话术','取悦','侦查','急救','会计学','语言(其他)','心理学'] },
  { name: '动物学家', en: 'Zoologist', crMin: 10, crMax: 50, skills: ['科学','博物学','医学','追踪','生存','摄影','攀爬','急救'] },
];

export const DEFAULT_CHARS: Record<COC7Characteristic, number> = { STR: 50, CON: 50, POW: 50, DEX: 50, APP: 50, SIZ: 50, INT: 50, EDU: 50 };

export const POOL_VALUES = [40, 50, 50, 50, 60, 60, 70, 80];

export const DB_TABLE: { range: string; db: string; build: number }[] = [
  { range: '2 – 64', db: '-2', build: -2 },
  { range: '65 – 84', db: '-1', build: -1 },
  { range: '85 – 124', db: '0', build: 0 },
  { range: '125 – 164', db: '+1D4', build: 1 },
  { range: '165 – 204', db: '+1D6', build: 2 },
];

export const SECONDARY_STATS: { key: string; zh: string; color: string }[] = [
  { key: 'hp', zh: 'HP 生命', color: 'var(--success)' },
  { key: 'san', zh: 'SAN 理智', color: 'var(--blood)' },
  { key: 'mp', zh: 'MP 魔法', color: 'var(--gold)' },
  { key: 'luck', zh: 'LUCK 幸运', color: 'var(--gold-bright)' },
  { key: 'mov', zh: 'MOV 移动', color: 'var(--ink-subtle)' },
  { key: 'db', zh: 'DB 伤害', color: 'var(--ink-subtle)' },
];

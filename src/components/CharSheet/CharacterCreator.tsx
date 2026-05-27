import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { sendChatCompletion } from '../../sillytavern/api-router';
import type { CharacterSheet, COC7Characteristic } from '../../types';

/* ============================== Constants ============================== */

const STEPS = ['身份信息', '基础属性', '衍生属性', '职业与技能', '背景故事', '确认创建'];

function roll3D6() { return Math.floor(Math.random()*6)+1 + Math.floor(Math.random()*6)+1 + Math.floor(Math.random()*6)+1; }
function roll2D6() { return Math.floor(Math.random()*6)+1 + Math.floor(Math.random()*6)+1; }

const CHAR_ROLL: Record<string, () => number> = {
  STR: () => roll3D6()*5, CON: () => roll3D6()*5, POW: () => roll3D6()*5, DEX: () => roll3D6()*5,
  APP: () => roll3D6()*5, SIZ: () => (roll2D6()+6)*5, INT: () => (roll2D6()+6)*5, EDU: () => Math.min(99, (roll3D6()+3)*5),
};

const CHAR_ORDER: { key: COC7Characteristic; zh: string }[] = [
  { key: 'STR', zh: '力量' },
  { key: 'CON', zh: '体质' },
  { key: 'POW', zh: '意志' },
  { key: 'DEX', zh: '敏捷' },
  { key: 'APP', zh: '外貌' },
  { key: 'SIZ', zh: '体型' },
  { key: 'INT', zh: '智力' },
  { key: 'EDU', zh: '教育' },
];

type SkillCat = '侦查系' | '护理系' | '运动系' | '战斗系' | '交涉系' | '生活系';
const CAT_COLORS: Record<SkillCat, string> = {
  '侦查系': '#69f0ae', '护理系': '#ef5350', '运动系': '#ffab40',
  '战斗系': '#42a5f5', '交涉系': '#ffd740', '生活系': '#b0bec5',
};
const ALL_SKILLS: { name: string; en: string; base: number | 'DEX_HALF' | 'EDU'; cat: SkillCat }[] = [
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

const SKILL_DESC: Record<string, string> = {
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

/* ============================== CoC 7th Occupations ============================== */

interface Occupation {
  name: string; en: string;
  crMin: number; crMax: number;
  skills: string[]; // suggested occupation skills (8 recommended)
}
const COC_OCCUPATIONS: Occupation[] = [
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

/* ============================== Helpers ============================== */



function getDBBuild(strPlusSiz: number): { db: string; build: number } {
  if (strPlusSiz >= 2 && strPlusSiz <= 64) return { db: '-2', build: -2 };
  if (strPlusSiz <= 84) return { db: '-1', build: -1 };
  if (strPlusSiz <= 124) return { db: '0', build: 0 };
  if (strPlusSiz <= 164) return { db: '+1D4', build: 1 };
  if (strPlusSiz <= 204) return { db: '+1D6', build: 2 };
  return { db: '+1D6', build: 2 };
}

function resolveSkillBase(
  spec: number | 'DEX_HALF' | 'EDU',
  chars: Partial<Record<COC7Characteristic, number>>,
): number {
  if (spec === 'DEX_HALF') return Math.floor((chars.DEX ?? 50) / 2);
  if (spec === 'EDU') return chars.EDU ?? 50;
  return spec;
}

const DEFAULT_CHARS: Record<COC7Characteristic, number> = { STR: 50, CON: 50, POW: 50, DEX: 50, APP: 50, SIZ: 50, INT: 50, EDU: 50 };

/* ============================== Styles ============================== */

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  background: 'rgba(0,0,0,0.25)',
  border: '1px solid rgba(196,168,85,0.2)',
  borderRadius: 4,
  color: 'var(--text-light)',
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  outline: 'none',
  textAlign: 'center',
  transition: 'var(--transition-smooth)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontFamily: 'var(--font-ui)',
  color: 'var(--ink-subtle)',
  letterSpacing: 2,
  marginBottom: 4,
};

const selectTriggerStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
  position: 'relative',
  userSelect: 'none' as any,
};
  const plusMinusBtn: React.CSSProperties = { width: 32, height: 28, border: "1px solid var(--brass)", borderRadius: 3, background: "rgba(0,0,0,0.3)", color: "var(--ink-subtle)", fontFamily: "var(--font-mono)", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };
  const miniBtn: React.CSSProperties = { padding: '1px 5px', border: '1px solid var(--brass)', borderRadius: 2, background: 'transparent', color: 'var(--ink-subtle)', fontSize: 9, cursor: 'pointer', fontFamily: 'var(--font-mono)' };
  const ptnBtn: React.CSSProperties = { padding: '2px 5px', border: '1px solid rgba(196,168,85,0.18)', borderRadius: 2, background: 'transparent', color: 'var(--ink-subtle)', fontSize: 9, cursor: 'pointer', fontFamily: 'var(--font-mono)', lineHeight: '16px' };
const editBtn: React.CSSProperties = { background: 'none', border: 'none', padding: '1px 2px', fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'rgba(200,200,200,0.22)', cursor: 'pointer', lineHeight: 1.2 };

const btnBase: React.CSSProperties = {
  padding: '8px 24px',
  border: '1px solid rgba(196,168,85,0.3)',
  borderRadius: 4,
  background: 'rgba(196,168,85,0.08)',
  color: 'var(--gold)',
  fontFamily: 'var(--font-ui)',
  fontSize: 13,
  letterSpacing: 2,
  cursor: 'pointer',
  transition: 'var(--transition-smooth)',
};

const btnDisabled: React.CSSProperties = {
  ...btnBase,
  opacity: 0.35,
  cursor: 'not-allowed',
};

const sectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontFamily: 'var(--font-ui)',
  color: 'var(--ink-subtle)',
  letterSpacing: 4,
  marginBottom: 12,
  textTransform: 'uppercase' as const,
  borderBottom: '1px solid rgba(196,168,85,0.12)',
  paddingBottom: 8,
};

/* ============================== DarkSelect ============================== */

function DarkSelect({ value, onChange, options, style }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string; sub?: string }[];
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  const toggle = () => {
    if (!open && ref.current) setRect(ref.current.getBoundingClientRect());
    setOpen(!open);
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t?.closest) return;
      // Keep open if click is on trigger OR inside portal menu
      if (ref.current?.contains(t) || t.closest('.darkselect-menu')) return;
      setOpen(false);
    };
    const r = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target?.closest) return;
      // Only close if scroll happened outside the DarkSelect trigger or menu
      if (ref.current && !ref.current.contains(target) && !target.closest('.darkselect-menu')) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    window.addEventListener('scroll', r, true);
    return () => { document.removeEventListener('mousedown', h); window.removeEventListener('scroll', r, true); };
  }, [open]);

  const menu = open && rect && createPortal(
    <div className="darkselect-menu" style={{
      position: 'fixed', left: rect.left, top: rect.bottom + 2, minWidth: rect.width, zIndex: 9999,
      background: 'linear-gradient(180deg, rgba(26,20,14,0.99) 0%, rgba(18,14,10,0.99) 100%)',
      border: '1px solid var(--gold)', borderRadius: 4,
      boxShadow: '0 6px 24px rgba(0,0,0,0.7)',
      maxHeight: 240, overflowY: 'auto',
      scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.3)',
    }}>
      {options.map((o) => (
        <div key={o.value}
          onClick={() => { onChange(o.value); setOpen(false); }}
          style={{
            padding: '8px 12px', cursor: 'pointer', fontSize: 12, textAlign: 'center',
            color: o.value === value ? 'var(--gold)' : 'var(--text-light)',
            fontFamily: 'var(--font-body)', borderBottom: '1px solid rgba(255,255,255,0.03)',
            background: o.value === value ? 'rgba(196,168,85,0.1)' : 'transparent',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.12)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = o.value === value ? 'rgba(196,168,85,0.1)' : 'transparent'; }}
        >
          <div>{o.label}</div>
          {o.sub && <div style={{ fontSize: 9, color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)' }}>{o.sub}</div>}
        </div>
      ))}
    </div>,
    document.body,
  );

  return (
    <div ref={ref} style={{ ...style }}>
      <div onClick={toggle} style={{ ...selectTriggerStyle, position: 'relative' }}>
        <span style={{ color: value ? 'var(--text-light)' : 'var(--ink-subtle)' }}>
          {selected ? selected.label : '选择…'}
        </span>
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--gold)', fontSize: 10, transition: '0.2s' }}>{open ? '▲' : '▼'}</span>
      </div>
      {menu}
    </div>
  );
}

/* ============================== Component ============================== */

interface Props {
  onComplete: () => void;
  onClose: () => void;
}

export function CharacterCreator({ onComplete, onClose }: Props) {
  const setSheet = useCharSheetStore((s) => s.setSheet);
  const [step, setStep] = useState(0);

  /* ---- Step 1: Identity ---- */
  const [name, setName] = useState('');
  const [player, setPlayer] = useState('');
  const [occupation, setOccupation] = useState('');
  const [customOccupation, setCustomOccupation] = useState('');
  const [age, setAge] = useState(25);
  const [sex, setSex] = useState('男');
  const [residence, setResidence] = useState('');
  const [birthplace, setBirthplace] = useState('');

  /* ---- Step 2: Characteristics ---- */
  const [charValues, setCharValues] = useState<Record<COC7Characteristic, number>>(DEFAULT_CHARS);

  const POOL_VALUES = [40, 50, 50, 50, 60, 60, 70, 80];
  const [poolMode, setPoolMode] = useState(true);
  const [poolAssignments, setPoolAssignments] = useState<Record<COC7Characteristic, number | null>>(() => {
    const init = {} as Record<COC7Characteristic, number | null>;
    CHAR_ORDER.forEach((c) => { init[c.key] = null; });
    return init;
  });

  const availablePoolValues = useMemo(() => {
    const remaining = [...POOL_VALUES];
    const assigned = (Object.values(poolAssignments) as (number | null)[]).filter((v): v is number => v != null);
    for (const v of assigned) {
      const idx = remaining.indexOf(v);
      if (idx >= 0) remaining.splice(idx, 1);
    }
    return remaining;
  }, [poolAssignments]);

  const allCharsAssigned = poolMode
    ? CHAR_ORDER.every((c) => poolAssignments[c.key] != null)
    : CHAR_ORDER.every((c) => typeof charValues[c.key] === 'number');

  const [luckValue, setLuckValue] = useState<number | null>(null);

  /* ---- Step 3: Derived (auto-calc) ---- */
  const derived = useMemo(() => {
    const c = (k: COC7Characteristic) => charValues[k] ?? 0;
    const siz = c('SIZ');
    const con = c('CON');
    const pow = c('POW');
    const str = c('STR');
    const hpMax = Math.floor((siz + con) / 10);
    const sanMax = pow;
    const mpMax = Math.floor(pow / 5);
    const { db, build } = getDBBuild(str + siz);
    return { hpMax, sanMax, mpMax, db, build };
  }, [charValues]);

  /* ---- Step 4: Skills ---- */
  const [creditRating, setCreditRating] = useState(0);
  const crRef = useRef(creditRating);
  useEffect(() => { crRef.current = creditRating; }, [creditRating]);
  const [occSkills, setOccSkills] = useState<string[]>([]);
  const [occPoints, setOccPoints] = useState<Record<string, number>>({});
  const [interestSkills, setInterestSkills] = useState<string[]>([]);
  const [interestPoints, setInterestPoints] = useState<Record<string, number>>({});
  const [filterCat, setFilterCat] = useState<SkillCat | null>(null);
  const [openField, setOpenField] = useState<string | null>(null);
  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<'occ' | 'int' | null>(null);

  const saveAndExit= () => { setEditingSkill(null); setEditingType(null); };

  const reEnterEdit = (skillName: string, type: 'occ' | 'int') => {
    setEditingSkill(skillName);
    setEditingType(type);
  };

  const eduVal = charValues.EDU ?? 0;
  const intVal = charValues.INT ?? 0;
  const occPointPool = eduVal * 4;
  const intPointPool = intVal * 2;
  const intRef = useRef(0);
  useEffect(() => { intRef.current = intPointPool; }, [intPointPool]);

  const toggleOccSkill = useCallback((skillName: string) => {
    setOccSkills((prev) => {
      if (prev.includes(skillName)) return prev;
      if (prev.length >= 8) return prev;
      return [...prev, skillName];
    });
    reEnterEdit(skillName, 'occ');
  }, []);

  const toggleInterestSkill = useCallback((skillName: string) => {
    setInterestSkills((prev) => {
      if (prev.includes(skillName)) return prev;
      return [...prev, skillName];
    });
    reEnterEdit(skillName, 'int');
  }, []);

  const occTotalAllocated = Object.values(occPoints).reduce((a, b) => a + b, 0) + creditRating;
  const intTotalAllocated = Object.values(interestPoints).reduce((a, b) => a + b, 0);
  const occRemaining = occPointPool - occTotalAllocated;
  const intRemaining = intPointPool - intTotalAllocated;
  const canProceedStep4 = occRemaining === 0 && intRemaining === 0 && occSkills.length > 0;

  /* ---- Step 5: Background ---- */
  const [description, setDescription] = useState('');
  const [beliefs, setBeliefs] = useState('');
  const [significantPeople, setSignificantPeople] = useState('');
  const [meaningfulLocations, setMeaningfulLocations] = useState('');
  const [treasuredPossessions, setTreasuredPossessions] = useState('');
  const [traits, setTraits] = useState('');
  const [injuries, setInjuries] = useState('');
  const [phobias, setPhobias] = useState('');
  const [quickFilling, setQuickFilling] = useState(false);
  const [quickFillError, setQuickFillError] = useState('');

  /* ---- Presets ---- */
  const [presets, setPresets] = useState<{ name: string; data: any }[]>(() => {
    try { const raw = localStorage.getItem('coc_char_presets'); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [showPresetLoad, setShowPresetLoad] = useState(false);

  const savePreset = useCallback(() => {
    const pn = (typeof prompt === 'function' ? prompt('请输入预设名称:') : '')?.trim();
    if (!pn) return;
    const data = { name, player, occupation, customOccupation, age, sex, residence, birthplace, charValues, luckValue, creditRating, occSkills, occPoints, interestSkills, interestPoints, description, beliefs, significantPeople, meaningfulLocations, treasuredPossessions, traits, injuries, phobias };
    const filtered = presets.filter((p: any) => p.name !== pn);
    const np = [...filtered, { name: pn, data }].slice(-10);
    setPresets(np);
    try { localStorage.setItem('coc_char_presets', JSON.stringify(np)); } catch {}
  }, [presets, name, player, occupation, customOccupation, age, sex, residence, birthplace, charValues, luckValue, creditRating, occSkills, occPoints, interestSkills, interestPoints, description, beliefs, significantPeople, meaningfulLocations, treasuredPossessions, traits, injuries, phobias]);

  const loadPreset = useCallback((preset: { name: string; data: any }) => {
    const d = preset.data;
    setName(d.name||''); setPlayer(d.player||''); setOccupation(d.occupation||''); setCustomOccupation(d.customOccupation||''); setAge(d.age??25); setSex(d.sex||'男'); setResidence(d.residence||''); setBirthplace(d.birthplace||'');
    setCharValues(d.charValues||DEFAULT_CHARS); setLuckValue(d.luckValue??null); setCreditRating(d.creditRating??0); setOccSkills(d.occSkills||[]); setOccPoints(d.occPoints||{}); setInterestSkills(d.interestSkills||[]); setInterestPoints(d.interestPoints||{});
    setDescription(d.description||''); setBeliefs(d.beliefs||''); setSignificantPeople(d.significantPeople||''); setMeaningfulLocations(d.meaningfulLocations||''); setTreasuredPossessions(d.treasuredPossessions||''); setTraits(d.traits||''); setInjuries(d.injuries||''); setPhobias(d.phobias||'');
    setPoolMode(false); setShowPresetLoad(false);
  }, [DEFAULT_CHARS]);

  const deletePreset = useCallback((pn: string) => {
    const np = presets.filter((p:any) => p.name !== pn);
    setPresets(np);
    try { localStorage.setItem('coc_char_presets', JSON.stringify(np)); } catch {}
  }, [presets]);

  /* ---- Step 3: Luck roll ---- */

  const rollLuck = useCallback(() => {
    const d1 = Math.ceil(Math.random() * 6);
    const d2 = Math.ceil(Math.random() * 6);
    const d3 = Math.ceil(Math.random() * 6);
    setLuckValue((d1 + d2 + d3) * 5);
  }, []);

  /* ---- Confirm ---- */
  const handleConfirm = useCallback(() => {
    const chars = Object.fromEntries(
      CHAR_ORDER.map((c) => [c.key, charValues[c.key] ?? 50]),
    ) as Record<COC7Characteristic, number>;

    const siz = chars.SIZ;
    const con = chars.CON;
    const pow = chars.POW;
    const str = chars.STR;
    const dex = chars.DEX;
    const edu = chars.EDU;
    const hpMax = Math.floor((siz + con) / 10);
    const sanMax = pow;
    const mpMax = Math.floor(pow / 5);
    const { db, build } = getDBBuild(str + siz);

    const halfFifth = Object.fromEntries(
      CHAR_ORDER.map((c) => {
        const val = chars[c.key];
        return [c.key, { half: Math.floor(val / 2), fifth: Math.floor(val / 5) }];
      }),
    ) as Record<COC7Characteristic, { half: number; fifth: number }>;

    const luck = luckValue ?? 50;

    // Build skills record
    const skills: Record<string, { base: number; current: number }> = {};

    // Credit Rating
    skills['信用评级'] = { base: 0, current: creditRating };

    // Cthulhu Mythos — always 0, never increases through creation
    skills['克苏鲁神话'] = { base: 0, current: 0 };

    // Occupation skills
    for (const skillName of occSkills) {
      const spec = ALL_SKILLS.find((s) => s.name === skillName);
      const base = spec ? resolveSkillBase(spec.base, chars) : 0;
      const occAlloc = occPoints[skillName] ?? 0;
      const intAlloc = interestPoints[skillName] ?? 0;
      skills[skillName] = { base, current: Math.min(99, base + occAlloc + intAlloc) };
    }

    // Personal interest skills
    for (const skillName of interestSkills) {
      if (occSkills.includes(skillName)) continue; // already added above
      const spec = ALL_SKILLS.find((s) => s.name === skillName);
      const base = spec ? resolveSkillBase(spec.base, chars) : 0;
      const intAlloc = interestPoints[skillName] ?? 0;
      skills[skillName] = { base, current: Math.min(99, base + intAlloc) };
    }

    const charId = `INV-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0')}`;

    const finalOccupation = occupation === '__custom__' ? (customOccupation || '调查员') : (occupation || '调查员');

    const sheet: CharacterSheet = {
      characteristics: chars,
      halfFifth,
      secondary: {
        hp: { current: hpMax, max: hpMax },
        san: { current: sanMax, max: sanMax },
        mp: { current: mpMax, max: mpMax },
        luck,
        mov: 8,
        db,
        build,
      },
      skills,
      identity: {
        name: name || '未命名调查员',
        occupation: finalOccupation,
        age,
        gender: sex,
        birthplace,
        residence,
        id: charId,
      },
    };

    // Persist background separately for completeness
    try {
      const bg = {
        player,
        description,
        beliefs,
        significantPeople,
        meaningfulLocations,
        treasuredPossessions,
        traits,
        injuries,
        phobias,
      };
      localStorage.setItem('coc_character_bg', JSON.stringify(bg));
    } catch {
      /* quota exceeded */
    }

    setSheet(sheet);
    onComplete();
  }, [
    charValues, creditRating, occSkills, occPoints, interestSkills, interestPoints,
    luckValue, name, player, occupation, customOccupation, age, sex, residence, birthplace,
    description, beliefs, significantPeople, meaningfulLocations,
    treasuredPossessions, traits, injuries, phobias,
    setSheet, onComplete,
  ]);

  /* ---- Nav ---- */
  const canGoNext = () => {
    switch (step) {
      case 0: return name.trim().length > 0;
      case 1: return allCharsAssigned;
      case 2: return luckValue !== null;
      case 3: return canProceedStep4;
      case 4: return true;
      default: return true;
    }
  };

  const randomAllocate = () => {
    // Reset all
    setOccSkills([]); setOccPoints({});
    setInterestSkills([]); setInterestPoints({});
    setCreditRating(0);
    // Get suggested skills from current occupation
    const selectedOcc = occupation && occupation !== '__custom__' ? COC_OCCUPATIONS.find((o) => o.name === occupation) : null;
    const suggested = selectedOcc?.skills || [];
    const crMin = selectedOcc?.crMin ?? 0;
    const crMax = selectedOcc?.crMax ?? 99;
    const getBaseVal = (name: string) => {
      const sk = ALL_SKILLS.find((x) => x.name === name);
      if (!sk) return 0;
      if (typeof sk.base === 'number') return sk.base;
      if (sk.base === 'DEX_HALF') return Math.floor((charValues.DEX ?? 50) / 2);
      return charValues.EDU ?? 50;
    };
    const allocLoop = (points: Record<string, number>, names: string[], pool: number) => {
      const alloc = { ...points };
      let rem = pool;
      const eligible = names.filter((s) => (alloc[s] ?? 0) + getBaseVal(s) < 99);
      let safety = 0;
      while (rem > 0 && eligible.length > 0 && safety++ < 10000) {
        const i = Math.floor(Math.random() * eligible.length);
        const cur = alloc[eligible[i]] ?? 0;
        const cap = 99 - getBaseVal(eligible[i]);
        if (cur >= cap) { eligible.splice(i, 1); continue; }
        const add = Math.max(1, Math.min(rem, Math.ceil(Math.random() * Math.min(8, rem)), cap - cur));
        alloc[eligible[i]] = cur + add;
        rem -= add;
      }
      return alloc;
    };
    const shuffled = (arr: string[]) => arr.sort(() => Math.random() - 0.5);
    const isCustomOcc = occupation === '__custom__';
    if (!isCustomOcc && suggested.length > 0) {
      // Credit rating: random within occupation range
      const cr = Math.floor(Math.random() * (Math.min(crMax, occPointPool) - crMin + 1)) + crMin;
      setCreditRating(cr);
      // Allocate occ points to the 8 suggested skills
      setOccSkills([...suggested]);
      const occPoolForSkills = occPointPool - cr;
      if (occPoolForSkills > 0) {
        setOccPoints((prev) => allocLoop(prev, suggested, occPoolForSkills));
      }
    } else {
      // Custom occupation: no occ skills/pool, just allocate int points to random skills
      setCreditRating(0);
    }
    // Pick and allocate int skills from remaining (excl. Cthulhu Mythos and occ skills)
    const usedNames = new Set(isCustomOcc ? [] : suggested);
    const intPool = ALL_SKILLS.filter((s) => !usedNames.has(s.name) && s.name !== '克苏鲁神话');
    const pickInt = shuffled(intPool.map((x) => x.name)).slice(0, 4);
    setInterestSkills(pickInt);
    if (pickInt.length > 0 && intPointPool > 0) {
      setInterestPoints((prev) => allocLoop(prev, pickInt, intPointPool));
    }
  };

  const nextStep = () => { if (canGoNext() && step < STEPS.length - 1) setStep(step + 1); };
  const prevStep = () => { if (step > 0) setStep(step - 1); };
  // Track occupation changes: clear skill allocations when occupation changes
  const prevOccRef = useRef(occupation);
  useEffect(() => {
    if (occupation && prevOccRef.current && occupation !== prevOccRef.current) {
      setOccSkills([]); setOccPoints({});
      setInterestSkills([]); setInterestPoints({});
      setCreditRating(0);
    }
    prevOccRef.current = occupation;
  }, [occupation]);

  /* ---- Render step content ---- */
  const renderStepContent = () => {
    switch (step) {
      case 0: return renderIdentity();
      case 1: return renderCharacteristics();
      case 2: return renderDerived();
      case 3: return renderSkills();
      case 4: return renderBackground();
      case 5: return renderReview();
      default: return null;
    }
  };

  /* ===== Step 1: Identity ===== */
  function renderIdentity() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Preset load */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowPresetLoad(!showPresetLoad)}
              style={{
                padding: '4px 12px', border: '1px solid rgba(196,168,85,0.25)',
                borderRadius: 3, background: 'rgba(196,168,85,0.08)',
                color: 'var(--gold)', fontFamily: 'var(--font-ui)',
                fontSize: 10, cursor: 'pointer', letterSpacing: 1,
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >加载预设 {presets.length > 0 ? `(${presets.length})` : ''}</button>
            {showPresetLoad && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 4,
                background: 'var(--abyss)', border: '1px solid rgba(196,168,85,0.25)',
                borderRadius: 4, padding: 4, zIndex: 900,
                minWidth: 180, maxHeight: 200, overflowY: 'auto',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              }}>
                {presets.length === 0 ? (
                  <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--ink-subtle)', fontFamily: 'var(--font-body)' }}>
                    暂无预设
                  </div>
                ) : (
                  presets.map((p) => (
                    <div key={p.name} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 10px', cursor: 'pointer', borderRadius: 3,
                      transition: 'var(--transition-smooth)',
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.06)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span
                        onClick={() => { loadPreset(p); setStep(5); }}
                        style={{
                          flex: 1, fontSize: 11, color: 'var(--text-light)',
                          fontFamily: 'var(--font-body)',
                        }}
                      >{p.name}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); deletePreset(p.name); }}
                        style={{
                          width: 18, height: 18, display: 'flex', alignItems: 'center',
                          justifyContent: 'center', border: 'none', borderRadius: 2,
                          background: 'transparent', color: 'var(--ink-subtle)',
                          fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-ui)',
                        }}
                      >x</button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
        <div style={sectionTitle}>身份信息 IDENTITY</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {/* Name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={labelStyle}>姓名 Name</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="调查员姓名" />
          </div>
          {/* Player */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={labelStyle}>玩家 Player</span>
            <input type="text" value={player} onChange={(e) => setPlayer(e.target.value)} style={inputStyle} placeholder="玩家名称" />
          </div>
          {/* Age */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={labelStyle}>年龄 Age</span>
            <input type="number" value={age} onChange={(e) => setAge(Number(e.target.value) || 0)}
              style={inputStyle} min={15} max={99} placeholder="25" />
          </div>
          {/* Sex */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={labelStyle}>性别 Sex</span>
            <DarkSelect value={sex} onChange={setSex}
              options={[{ value: '男', label: '男' }, { value: '女', label: '女' }, { value: '其他', label: '其他' }]} />
          </div>
          {/* Residence */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={labelStyle}>居住地 Residence</span>
            <input type="text" value={residence} onChange={(e) => setResidence(e.target.value)} style={inputStyle} placeholder="例如：阿卡姆" />
          </div>
          {/* Birthplace */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={labelStyle}>出生地 Birthplace</span>
            <input type="text" value={birthplace} onChange={(e) => setBirthplace(e.target.value)} style={inputStyle} placeholder="例如：马萨诸塞州" />
          </div>
        </div>
      </div>
    );
  }

  /* ===== Step 2: Characteristics ===== */
  function renderCharacteristics() {
    const adjChar = (key: COC7Characteristic, delta: number) => {
      setCharValues(prev => {
        const v = (prev[key] || 50) + delta;
        return { ...prev, [key]: Math.max(1, Math.min(99, v)) };
      });
    };
    const rollChar = (key: COC7Characteristic) => {
      const fn = CHAR_ROLL[key];
      const val = fn ? fn() : 50;
      setCharValues(prev => ({ ...prev, [key]: val }));
    };
    const randomAll = () => {
      const newVals: Record<string, number> = {};
      CHAR_ORDER.forEach(({key}) => { const fn = CHAR_ROLL[key]; newVals[key] = fn ? fn() : 50; });
      setCharValues(prev => ({ ...prev, ...newVals }));
    };

    const handlePoolAssign = (key: COC7Characteristic, value: number | null) => {
      setPoolAssignments((prev) => {
        const next = { ...prev, [key]: value };
        if (value != null) {
          setCharValues((cv) => ({ ...cv, [key]: value }));
        }
        return next;
      });
    };

    const switchToFreeMode = () => {
      const newChars = { ...charValues };
      CHAR_ORDER.forEach(({ key }) => {
        if (poolAssignments[key] != null) {
          newChars[key] = poolAssignments[key]!;
        }
      });
      setCharValues(newChars);
      setPoolMode(false);
    };

    const switchToPoolMode = () => {
      const newAssignments = {} as Record<COC7Characteristic, number | null>;
      const remaining = [...POOL_VALUES];
      CHAR_ORDER.forEach(({ key }) => {
        const val = charValues[key] ?? 50;
        const idx = remaining.indexOf(val);
        if (idx >= 0) {
          newAssignments[key] = val;
          remaining.splice(idx, 1);
        } else {
          newAssignments[key] = null;
        }
      });
      setPoolAssignments(newAssignments);
      setPoolMode(true);
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={sectionTitle}>基础属性 CHARACTERISTICS</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Mode toggle */}
            <div style={{
              display: 'flex', border: '1px solid rgba(196,168,85,0.25)', borderRadius: 4,
              overflow: 'hidden',
            }}>
              <button onClick={switchToPoolMode} style={{
                padding: '5px 12px', border: 'none',
                background: poolMode ? 'rgba(196,168,85,0.18)' : 'transparent',
                color: poolMode ? 'var(--gold)' : 'var(--ink-subtle)',
                fontFamily: 'var(--font-ui)', fontSize: 10, cursor: 'pointer',
                letterSpacing: 1, transition: 'var(--transition-smooth)',
              }}>点数池分配</button>
              <button onClick={switchToFreeMode} style={{
                padding: '5px 12px', border: 'none',
                background: !poolMode ? 'rgba(196,168,85,0.18)' : 'transparent',
                color: !poolMode ? 'var(--gold)' : 'var(--ink-subtle)',
                fontFamily: 'var(--font-ui)', fontSize: 10, cursor: 'pointer',
                letterSpacing: 1, transition: 'var(--transition-smooth)',
              }}>自由调整</button>
            </div>
            {!poolMode && (
              <button onClick={randomAll} style={{
                padding: '6px 16px', border: '1px solid var(--gold)', borderRadius: 4,
                background: 'rgba(196,168,85,0.1)', color: 'var(--gold)',
                fontFamily: 'var(--font-ui)', fontSize: 11, cursor: 'pointer', letterSpacing: 2,
              }}>全随机</button>
            )}
          </div>
        </div>

        {poolMode && (
          <div style={{
            padding: '8px 12px', border: '1px solid rgba(196,168,85,0.12)',
            borderRadius: 4, background: 'rgba(196,168,85,0.04)',
            fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)',
            display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
          }}>
            <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>
              剩余数值:
            </span>
            {availablePoolValues.length > 0 ? availablePoolValues.map((v, i) => (
              <span key={i} style={{
                padding: '2px 8px', border: '1px solid rgba(196,168,85,0.2)',
                borderRadius: 3, color: 'var(--gold)', fontWeight: 600,
              }}>{v}</span>
            )) : (
              <span style={{ color: 'var(--success)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>
                全部已分配
              </span>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {CHAR_ORDER.map(({ key, zh }) => {
            const val = charValues[key] || 50;
            const half = Math.floor(val / 2);
            const fifth = Math.floor(val / 5);
            const assignedPool = poolAssignments[key];

            if (poolMode) {
              const options = assignedPool != null
                ? [assignedPool, ...availablePoolValues]
                : availablePoolValues;
              return (
                <div key={key} style={{ padding: '10px 12px', border: '1px solid rgba(196,168,85,0.15)', borderRadius: 4, background: 'rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, fontWeight: 600 }}>{zh} ({key})</span>
                    <button onClick={() => handlePoolAssign(key, null)} style={{
                      padding: '2px 8px', border: '1px solid var(--brass)', borderRadius: 3,
                      background: 'transparent', color: 'var(--ink-subtle)',
                      fontFamily: 'var(--font-ui)', fontSize: 9, cursor: 'pointer',
                    }}>清除</button>
                  </div>
                  <DarkSelect
                    value={assignedPool != null ? String(assignedPool) : ''}
                    onChange={(v) => handlePoolAssign(key, v ? Number(v) : null)}
                    options={[
                      { value: '', label: '-- 选择数值 --' },
                      ...options.map((v) => ({ value: String(v), label: String(v) })),
                    ]}
                  />
                  {assignedPool != null && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)' }}>
                      <span>1/2: {half}</span><span>1/5: {fifth}</span>
                    </div>
                  )}
                </div>
              );
            }

            // Free mode
            return (
              <div key={key} style={{ padding: '10px 12px', border: '1px solid rgba(196,168,85,0.15)', borderRadius: 4, background: 'rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, fontWeight: 600 }}>{zh} ({key})</span>
                  <button onClick={() => rollChar(key)} style={{ padding: '2px 8px', border: '1px solid var(--brass)', borderRadius: 3, background: 'transparent', color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', fontSize: 9, cursor: 'pointer' }}>ROLL</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <button onClick={() => adjChar(key, -5)} style={plusMinusBtn}>-5</button>
                  <button onClick={() => adjChar(key, -1)} style={plusMinusBtn}>-1</button>
                  <span style={{ fontSize: 22, fontFamily: 'var(--font-mono)', color: 'var(--text-light)', fontWeight: 700, minWidth: 40, textAlign: 'center' }}>{val}</span>
                  <button onClick={() => adjChar(key, +1)} style={plusMinusBtn}>+1</button>
                  <button onClick={() => adjChar(key, +5)} style={plusMinusBtn}>+5</button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--ink-subtle)' }}>
                  <span>1/2: {half}</span><span>1/5: {fifth}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ===== Step 3: Derived Stats ===== */
  function renderDerived() {
    const c = (k: COC7Characteristic) => charValues[k] ?? 0;
    const str = c('STR');
    const siz = c('SIZ');
    const strPlusSiz = str + siz;

    const stats = [
      { label: 'HP 生命值', value: `${derived.hpMax} / ${derived.hpMax}`, color: 'var(--success)' },
      { label: 'SAN 理智值', value: `${derived.sanMax} / ${derived.sanMax}`, color: 'var(--blood)' },
      { label: 'MP 魔法值', value: `${derived.mpMax} / ${derived.mpMax}`, color: 'var(--gold)' },
      { label: 'LUCK 幸运', value: luckValue != null ? String(luckValue) : '未投掷', color: 'var(--gold-bright)' },
      { label: 'MOV 移动', value: '8', color: 'var(--ink-subtle)' },
      { label: 'DB / Build', value: `${derived.db} / ${derived.build >= 0 ? '+' : ''}${derived.build}`, color: 'var(--ink-subtle)' },
    ];

    const dbTable = [
      { range: '2 – 64', db: '-2', build: -2 },
      { range: '65 – 84', db: '-1', build: -1 },
      { range: '85 – 124', db: '0', build: 0 },
      { range: '125 – 164', db: '+1D4', build: 1 },
      { range: '165 – 204', db: '+1D6', build: 2 },
    ];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={sectionTitle}>衍生属性 SECONDARY STATS</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {stats.map((s) => (
            <div key={s.label} style={{
              padding: '10px 12px',
              border: `1px solid ${s.color}22`,
              borderRadius: 4,
              background: 'rgba(0,0,0,0.15)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
            }}>
              <div style={{ fontSize: 9, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', letterSpacing: 2 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 20, fontFamily: 'var(--font-mono)', fontWeight: 700, color: s.color }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Luck roller */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 14px',
          border: '1px solid rgba(196,168,85,0.15)',
          borderRadius: 4,
          background: 'rgba(0,0,0,0.1)',
        }}>
          <span style={{ fontSize: 12, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>
            幸运值 (3D6 x 5):
          </span>
          {luckValue != null ? (
            <span style={{ fontSize: 18, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--gold-bright)' }}>
              {luckValue}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--ink-subtle)' }}>--</span>
          )}
          <button onClick={rollLuck} style={btnBase}>
            投掷
          </button>
          {luckValue != null && (
            <input
              type="number"
              value={luckValue}
              onChange={(e) => setLuckValue(Number(e.target.value) || 0)}
              style={{ ...inputStyle, width: 80, padding: '4px 8px' }}
              min={0}
              max={99}
            />
          )}
        </div>

        {/* DB / Build lookup */}
        <div style={{
          border: '1px solid rgba(196,168,85,0.12)',
          borderRadius: 4,
          overflow: 'hidden',
          background: 'rgba(0,0,0,0.1)',
        }}>
          <div style={{
            padding: '8px 12px',
            background: 'rgba(196,168,85,0.06)',
            fontSize: 11,
            color: 'var(--ink-subtle)',
            fontFamily: 'var(--font-ui)',
            letterSpacing: 2,
          }}>
            DB / Build 对照表 (STR + SIZ = {strPlusSiz})
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.12)' }}>
                <th style={{ ...thSmall, textAlign: 'left' }}>STR+SIZ</th>
                <th style={{ ...thSmall, textAlign: 'center' }}>DB</th>
                <th style={{ ...thSmall, textAlign: 'center' }}>Build</th>
              </tr>
            </thead>
            <tbody>
              {dbTable.map((row) => {
                const active = strPlusSiz >= parseInt(row.range.split('–')[0].trim()) &&
                  strPlusSiz <= parseInt(row.range.split('–')[1]?.trim() ?? '999');
                return (
                  <tr key={row.range} style={{
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    background: active ? 'rgba(196,168,85,0.08)' : 'transparent',
                  }}>
                    <td style={{ ...tdSmall, color: active ? 'var(--gold)' : 'var(--text-light)' }}>{row.range}</td>
                    <td style={{ ...tdSmall, textAlign: 'center', color: active ? 'var(--gold)' : 'var(--text-light)' }}>{row.db}</td>
                    <td style={{ ...tdSmall, textAlign: 'center', color: active ? 'var(--gold)' : 'var(--text-light)' }}>{row.build >= 0 ? `+${row.build}` : row.build}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* ===== Step 4: Occupation & Skills ===== */
  function renderSkills() {
    const occValue = occupation || '__custom__';
    const isCustomOcc = occValue === '__custom__';
    const selectedOcc = !isCustomOcc ? COC_OCCUPATIONS.find((o) => o.name === occValue) : null;
    const suggestedSkills = selectedOcc?.skills || [];
    const crMin = selectedOcc?.crMin ?? 0;
    const crMax = selectedOcc?.crMax ?? 99;

    const getBase = (sk: typeof ALL_SKILLS[number]) =>
      typeof sk.base === 'number' ? sk.base
        : sk.base === 'DEX_HALF' ? Math.floor((charValues.DEX ?? 50) / 2)
        : (charValues.EDU ?? 50);

    const adjOccPoint = (skillName: string, delta: number) => {
      setOccPoints((p) => {
        const cur = p[skillName] ?? 0;
        const used = Object.values(p).reduce((a, b) => a + b, 0) + crRef.current;
        const remaining = occPointPool - used;
        const sk = ALL_SKILLS.find((s) => s.name === skillName);
        const base = sk ? getBase(sk) : 0;
        const maxBySkill = 99 - base;
        const target = cur + delta;
        const newVal = Math.max(0, Math.min(Math.min(cur + remaining, maxBySkill), target));
        return { ...p, [skillName]: newVal };
      });
    };

    const adjIntPoint = (skillName: string, delta: number) => {
      setInterestPoints((p) => {
        const cur = p[skillName] ?? 0;
        const used = Object.values(p).reduce((a, b) => a + b, 0);
        const remaining = intPointPool - used;
        const sk = ALL_SKILLS.find((s) => s.name === skillName);
        const base = sk ? getBase(sk) : 0;
        const maxBySkill = 99 - base;
        const target = cur + delta;
        const newVal = Math.max(0, Math.min(Math.min(cur + remaining, maxBySkill), target));
        return { ...p, [skillName]: newVal };
      });
    };

    const clearOccSkill = (skillName: string) => {
      setOccSkills((prev) => prev.filter((s) => s !== skillName));
      setOccPoints((p) => { const n = { ...p }; delete n[skillName]; return n; });
    };
    const clearIntSkill = (skillName: string) => {
      setInterestSkills((prev) => prev.filter((s) => s !== skillName));
      setInterestPoints((p) => { const n = { ...p }; delete n[skillName]; return n; });
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={sectionTitle}>职业与技能 OCCUPATION & SKILLS</div>

        {/* Occupation selector */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
            <span style={{ fontSize: 10, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>职业 OCCUPATION</span>
            <DarkSelect value={occValue} onChange={setOccupation}
              options={[
                ...COC_OCCUPATIONS.map((o) => ({ value: o.name, label: `${o.name}`, sub: `${o.en} · 信用 ${o.crMin}–${o.crMax}%` })),
                { value: '__custom__', label: '自定义职业...', sub: '' },
              ]} />
          </div>
          {isCustomOcc && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
              <span style={{ fontSize: 10, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>自定义职业名称</span>
              <input type="text" value={customOccupation} onChange={(e) => setCustomOccupation(e.target.value)}
                style={{ ...inputStyle, height: 30 }} placeholder="输入职业名称" />
            </div>
          )}
        </div>

        {/* Info bar */}
        <div style={{
          padding: '8px 12px', border: '1px solid rgba(196,168,85,0.12)', borderRadius: 4,
          background: 'rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 4,
          fontSize: 11, fontFamily: 'var(--font-mono)',
        }}>
          {selectedOcc && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{selectedOcc.name} ({selectedOcc.en})</span>
              <span style={{ color: 'var(--ink-subtle)' }}>信用 {crMin}–{crMax}%</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--ink-subtle)', fontWeight: 600 }}>职业技能池 (EDU × 4 = {occPointPool})</span>
            <span style={{ color: occRemaining > 0 ? 'var(--gold)' : 'rgba(196,168,85,0.4)', fontWeight: occRemaining > 0 ? 700 : 400, opacity: occRemaining > 0 ? 1 : 0.8, transition: 'color 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.35s cubic-bezier(0.4,0,0.2,1)' }}>
              剩余 {occRemaining}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--ink-subtle)', fontWeight: 600 }}>兴趣技能池 (INT × 2 = {intPointPool})</span>
            <span style={{ color: intRemaining > 0 ? '#78afdc' : 'rgba(120,175,220,0.4)', fontWeight: intRemaining > 0 ? 700 : 400, opacity: intRemaining > 0 ? 1 : 0.8, transition: 'color 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.35s cubic-bezier(0.4,0,0.2,1)' }}>
              剩余 {intRemaining}
            </span>
          </div>
        </div>

        {/* Credit Rating slider */}
        <div style={{ padding: '8px 12px', border: '1px solid rgba(196,168,85,0.12)', borderRadius: 4, background: 'rgba(0,0,0,0.06)', position: 'relative' }}>
          <span style={{ fontSize: 12, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 1, fontWeight: 700 }}>信用评级</span>
          <span style={{
            position: 'absolute', right: 8, top: '50%', zIndex: 1,
            transform: 'translateY(calc(-50% - 10px))',
            fontSize: 14 + (creditRating - crMin) / Math.max(1, crMax - crMin) * 6,
            fontFamily: 'var(--font-display)', fontWeight: 900, color: 'rgba(255,255,255,0.30)',
            transition: 'font-size 0.25s cubic-bezier(0.4,0,0.2,1)',
            lineHeight: 1, pointerEvents: 'none', userSelect: 'none',
          }}>{creditRating}</span>
          <input type="range" min={crMin} max={crMax}
            value={creditRating} onChange={(e) => setCreditRating(Math.min(creditRating + occRemaining, Number(e.target.value)))}
            style={{ width: '100%', accentColor: 'var(--gold)', marginTop: 2,
              background: `linear-gradient(to right, var(--gold) 0%, var(--gold) ${(Math.min(crMax, creditRating + occRemaining) - crMin) / Math.max(1, crMax - crMin) * 100}%, rgba(255,255,255,0.08) ${(Math.min(crMax, creditRating + occRemaining) - crMin) / Math.max(1, crMax - crMin) * 100}%, rgba(255,255,255,0.08) 100%)`,
            }} />
        </div>

        {/* Skill category filter bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {(['全部','侦查系','护理系','运动系','战斗系','交涉系','生活系'] as const).map((cat) => {
            const active = (filterCat ?? '全部') === cat;
            const c = cat === '全部' ? '#c4a855' : CAT_COLORS[cat as SkillCat];
            return (
              <button key={cat} onClick={() => setFilterCat(cat === '全部' ? null : cat as SkillCat)}
                className="sk-btn"
                style={{
                  padding: '3px 10px', borderRadius: 3, fontSize: 10, fontWeight: 700,
                  fontFamily: 'var(--font-display)', letterSpacing: 1,
                  border: active ? `1px solid ${c}` : `1px solid ${c}44`,
                  color: active ? c : `${c}88`,
                  background: active ? `${c}18` : 'transparent',
                }}
              >{cat}</button>
            );
          })}
        </div>

        {/* All skills grid */}
        <div style={{ height: 320, overflowY: 'scroll', overflowX: 'hidden', scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.2)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, alignItems: 'start' }}>
            {ALL_SKILLS
              .filter((sk) => !filterCat || sk.cat === filterCat)
              .sort((a, b) => {
                const aStar = suggestedSkills.includes(a.name) ? 0 : 1;
                const bStar = suggestedSkills.includes(b.name) ? 0 : 1;
                if (aStar !== bStar) return aStar - bStar;
                if (filterCat) return 0;
                return a.cat.localeCompare(b.cat);
              })
              .map((sk) => {
              const isOcc = occSkills.includes(sk.name);
              const isInt = interestSkills.includes(sk.name);
              const suggested = suggestedSkills.includes(sk.name);
              const canUseOcc = isCustomOcc || suggested;
              const occPts = occPoints[sk.name] ?? 0;
              const intPts = interestPoints[sk.name] ?? 0;
              const base = getBase(sk);
              const total = base + occPts + intPts;
              const baseDisplay = typeof sk.base === 'number' ? String(sk.base) : (sk.base === 'DEX_HALF' ? 'DEX/2' : 'EDU');
              const catColor = CAT_COLORS[sk.cat];
              const occFull = occSkills.length >= 8 && !isOcc;
              const intFull = intRemaining <= 0 && !isInt;
              const highlighted = isOcc || isInt;
              const editing = editingSkill === sk.name;
              const desc = SKILL_DESC[sk.name] || '';

              return (
                <div key={sk.name} onClick={() => { if (highlighted && !editing) reEnterEdit(sk.name, editingType || 'occ'); }} style={{ cursor: highlighted && !editing ? 'pointer' : 'default',
                  padding: '8px 28px 8px 6px',
                  minWidth: 0, minHeight: 44,
                  borderLeft: `2px solid ${catColor}44`,
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                  borderRight: suggested ? '2px solid rgba(196,168,85,0.4)' : 'none',
                  borderTop: suggested ? '1px solid rgba(196,168,85,0.2)' : 'none',
                  borderRadius: 2,
                  background: suggested ? 'rgba(196,168,85,0.04)' : highlighted ? `${catColor}0a` : 'rgba(0,0,0,0.03)',
                  opacity: (occFull && intFull) ? 0.35 : 1,
                  position: 'relative', overflow: 'hidden',
                }}>
                  {/* Header row — skill name */}
                  <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-start' }}>
                    <span style={{
                      fontSize: 10, fontFamily: 'var(--font-body)', paddingLeft: 4, paddingRight: 32,
                      color: suggested ? '#ffd54f' : (isOcc || isInt) ? catColor : `${catColor}88`,
                      fontWeight: suggested ? 700 : 400, flexShrink: 0,
                    }}>
                      {suggested && '★ '}{sk.name}
                    </span>
                  </div>
                  {/* Both buttons on right side, stacked — transparent button row */}
                  {!highlighted ? (
                    <div style={{ position: 'absolute', right: 1, top: 0, bottom: 0, zIndex: 2,
                      display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4,
                      borderRadius: 2, padding: '0 2px',
                    }}>
                      {canUseOcc && (
                        <button onClick={(e) => { e.stopPropagation(); toggleOccSkill(sk.name); }}
                          className="sk-btn"
                          style={{ background: 'none', border: 'none', padding: '1px 2px',
                            fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
                            color: 'rgba(196,168,85,0.18)', cursor: 'pointer',
                            whiteSpace: 'pre', lineHeight: 1.1, textAlign: 'center',
                          }}>{'职\n业'}</button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); toggleInterestSkill(sk.name); }}
                        className="sk-btn"
                        style={{ background: 'none', border: 'none', padding: '1px 2px',
                          fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
                          color: 'rgba(120,175,220,0.15)', cursor: 'pointer',
                          whiteSpace: 'pre', lineHeight: 1.1, textAlign: 'center',
                        }}>{'兴\n趣'}</button>
                    </div>
                  ) : editing ? (
                    <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, zIndex: 3,
                      display: 'flex', alignItems: 'center', gap: 3, paddingRight: 2,
                      borderRadius: 2, padding: '0 4px',
                    }}>
                      {/* +/- row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <button onClick={(e) => { e.stopPropagation(); editingType === 'occ' ? adjOccPoint(sk.name, 5) : adjIntPoint(sk.name, 5); }}
                          className="sk-btn" style={editBtn}>+5</button>
                        <button onClick={(e) => { e.stopPropagation(); editingType === 'occ' ? adjOccPoint(sk.name, 1) : adjIntPoint(sk.name, 1); }}
                          className="sk-btn" style={editBtn}>+1</button>
                        <button onClick={(e) => { e.stopPropagation(); editingType === 'occ' ? adjOccPoint(sk.name, -1) : adjIntPoint(sk.name, -1); }}
                          className="sk-btn" style={editBtn}>-1</button>
                        <button onClick={(e) => { e.stopPropagation(); editingType === 'occ' ? adjOccPoint(sk.name, -5) : adjIntPoint(sk.name, -5); }}
                          className="sk-btn" style={editBtn}>-5</button>
                      </div>
                      {/* Vertical confirm / cancel */}
                      <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); const pts = editingType === 'occ' ? (occPoints[sk.name] ?? 0) : (interestPoints[sk.name] ?? 0); if (pts === 0) { editingType === 'occ' ? clearOccSkill(sk.name) : clearIntSkill(sk.name); setEditingSkill(null); } else { saveAndExit(); } }}
                        className="sk-btn" style={{ ...editBtn, whiteSpace: 'pre', color: 'rgba(130,200,130,0.35)' }}>{'确\n定'}</button>
                      <button onClick={(e) => { e.stopPropagation(); e.preventDefault(); editingType === 'occ' ? (clearOccSkill(sk.name), setEditingSkill(null)) : (clearIntSkill(sk.name), setEditingSkill(null)); }}
                        className="sk-btn" style={{ ...editBtn, whiteSpace: 'pre', color: 'rgba(200,130,130,0.32)' }}>{'取\n消'}</button>
                    </div>
                  ) : (
                    <div style={{ position: 'absolute', right: 1, top: 0, bottom: 0, zIndex: 2,
                      display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4,
                      borderRadius: 2, padding: '0 2px',
                    }}>
                      {canUseOcc && (occSkills.length < 8 || isOcc) && (
                        <button onClick={(e) => { e.stopPropagation(); if (!isOcc) toggleOccSkill(sk.name); else reEnterEdit(sk.name, 'occ'); }}
                          className={isOcc ? 'sk-btn sk-btn-occ' : 'sk-btn'}
                          style={{ background: 'none', border: 'none', padding: '1px 2px',
                            fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
                            color: isOcc ? 'rgba(196,168,85,0.32)' : 'rgba(196,168,85,0.18)',
                            cursor: 'pointer', whiteSpace: 'pre', lineHeight: 1.1, textAlign: 'center',
                          }}>{'职\n业'}</button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); if (!isInt) toggleInterestSkill(sk.name); else reEnterEdit(sk.name, 'int'); }}
                        className={isInt ? 'sk-btn sk-btn-int' : 'sk-btn'}
                        style={{ background: 'none', border: 'none', padding: '1px 2px',
                          fontSize: 11, fontFamily: 'var(--font-display)', fontWeight: 700,
                          color: isInt ? 'rgba(120,175,220,0.28)' : 'rgba(120,175,220,0.15)',
                          cursor: 'pointer', whiteSpace: 'pre', lineHeight: 1.1, textAlign: 'center',
                        }}>{'兴\n趣'}</button>
                    </div>
                  )}
                  {/* Description — absolute overlay, fade-in/out with bezier, marquee scroll */}
                  <div style={{ fontSize: 8, color: 'var(--ink-subtle)', fontFamily: 'var(--font-body)',
                    position: 'absolute', left: 6, right: 4, bottom: 2, zIndex: 1,
                    mixBlendMode: 'difference', lineHeight: 1.3, overflow: 'hidden',
                    maskImage: 'linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)',
                    WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)',
                    opacity: (highlighted && desc) ? 1 : 0,
                    pointerEvents: (highlighted && desc) ? 'auto' : 'none',
                    transition: 'opacity 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}>
                    <div className="sk-desc-inner" style={{ '--tkr-dur': `${Math.max(4, (desc || '').length * 0.22 + 1.5)}s` } as React.CSSProperties}>
                      <span>{desc || ''}</span>
                      <span>{desc || ''}</span>
                    </div>
                  </div>
                  {/* Watermark number — left side, below name */}
                  <div style={{
                    position: 'absolute', left: 2, top: 0, bottom: 0,
                    display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start',
                    padding: '0 4px 2px 2px',
                    zIndex: 1,
                    fontSize: highlighted ? 38 : 34, fontFamily: 'var(--font-display)', fontWeight: 900,
                    color: highlighted
                      ? (isOcc ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.08)')
                      : 'rgba(255,255,255,0.05)',
                    lineHeight: 1, pointerEvents: 'none', userSelect: 'none',
                  }}>
                    {highlighted ? total : base}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /* ===== Quick Fill ===== */
  const quickFill = async () => {
    const settings = useSettingsStore.getState();
    if (!settings.apiKey) {
      setQuickFillError('请先在设置中配置API密钥后再使用快速填充功能。');
      return;
    }
    setQuickFillError('');
    setQuickFilling(true);
    try {
      const occText = occupation === '__custom__' ? customOccupation : occupation;
      const charSummary = CHAR_ORDER.map(({ key, zh }) => `${zh} ${charValues[key] ?? 50}`).join(', ');
      // Build skill summary with point allocations
      const skillSummary: string[] = [];
      for (const s of occSkills) {
        const sk = ALL_SKILLS.find((x) => x.name === s);
        const base = sk ? (typeof sk.base === 'number' ? sk.base : sk.base === 'DEX_HALF' ? Math.floor((charValues.DEX ?? 50) / 2) : (charValues.EDU ?? 50)) : 0;
        const pts = (occPoints[s] ?? 0) + (interestPoints[s] ?? 0);
        const total = base + pts;
        if (pts > 0) skillSummary.push(`${s}(${total}%, +${pts})`);
      }
      for (const s of interestSkills) {
        if (occSkills.includes(s)) continue;
        const sk = ALL_SKILLS.find((x) => x.name === s);
        const base = sk ? (typeof sk.base === 'number' ? sk.base : sk.base === 'DEX_HALF' ? Math.floor((charValues.DEX ?? 50) / 2) : (charValues.EDU ?? 50)) : 0;
        const pts = interestPoints[s] ?? 0;
        if (pts > 0) skillSummary.push(`${s}(${base + pts}%, +${pts})`);
      }
      const prompt = `你是一位COC 7版调查员的背景故事生成器。请根据以下信息生成完整的调查员背景故事（1920年代美国）。\n\n` +
        `姓名: ${name || '未知'}\n职业: ${occText || '调查员'}\n年龄: ${age}\n性别: ${sex}\n` +
        `${residence ? `居住地: ${residence}\n` : ''}` +
        `${birthplace ? `出生地: ${birthplace}\n` : ''}` +
        `属性: ${charSummary}\n` +
        `${creditRating > 0 ? `信用评级: ${creditRating}%\n` : ''}` +
        `${skillSummary.length > 0 ? `已投入点数的技能(当前值, 投入点数):\n${skillSummary.join('\n')}\n` +
          `注：加点越高的技能代表该角色在这方面的专精程度或人生经历越丰富，请据此塑造背景故事。\n` : ''}` +
        `\n请以JSON格式回复，所有值用中文：\n{\n` +
        `  "description": "个人外貌、气质描述（1-2句）",\n` +
        `  "beliefs": "思想信念、价值观（1-2句）",\n` +
        `  "significantPeople": "生命中重要的人（1句）",\n` +
        `  "meaningfulLocations": "有意义的场所（1句）",\n` +
        `  "treasuredPossessions": "珍贵的物品（1句）",\n` +
        `  "traits": "性格特质关键词",\n` +
        `  "injuries": "旧伤或伤痕（无则留空）",\n` +
        `  "phobias": "恐惧症或狂躁症（无则留空）"\n}`;
      const response = await sendChatCompletion(
        [{ role: 'user', content: prompt }],
        { temperature: 0.8, maxTokens: 800 } as any,
        settings.apiBaseUrl, settings.apiKey, settings.apiModel,
      );
      // Parse JSON from response
      let jsonStr = response.content || '';
      const cbMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (cbMatch) jsonStr = cbMatch[1].trim();
      const braceStart = jsonStr.indexOf('{');
      const braceEnd = jsonStr.lastIndexOf('}');
      if (braceStart >= 0 && braceEnd > braceStart) jsonStr = jsonStr.substring(braceStart, braceEnd + 1);
      // Fix common LLM JSON issues: unescaped newlines inside strings, trailing commas, Chinese punctuation
      jsonStr = jsonStr
        .replace(/\n/g, ' ')                                 // newlines → space (safest JSON fix)
        .replace(/,\s*}/g, '}')                               // trailing comma before }
        .replace(/,\s*]/g, ']')                               // trailing comma before ]
        .replace(/[，、]/g, ',')                              // Chinese commas → ASCII
        .replace(/[：]/g, ':');                               // Chinese colon → ASCII
      const parsed = JSON.parse(jsonStr);
      if (parsed.description) setDescription(parsed.description);
      if (parsed.beliefs) setBeliefs(parsed.beliefs);
      if (parsed.significantPeople) setSignificantPeople(parsed.significantPeople);
      if (parsed.meaningfulLocations) setMeaningfulLocations(parsed.meaningfulLocations);
      if (parsed.treasuredPossessions) setTreasuredPossessions(parsed.treasuredPossessions);
      if (parsed.traits) setTraits(parsed.traits);
      if (parsed.injuries) setInjuries(parsed.injuries);
      if (parsed.phobias) setPhobias(parsed.phobias);
    } catch (err: any) {
      setQuickFillError(`生成失败: ${err.message || '未知错误'}`);
    } finally {
      setQuickFilling(false);
    }
  };

  /* ===== Step 5: Background ===== */
  function renderBackground() {
    const fields: { label: string; value: string; set: (v: string) => void; rows?: number; hint: string }[] = [
      { label: '个人描述 Description', value: description, set: setDescription, rows: 2, hint: '例如：身材高瘦，戴圆框眼镜，右手有烧伤疤痕' },
      { label: '思想/信念 Beliefs', value: beliefs, set: setBeliefs, hint: '例如：相信科学能解释一切，但近来开始怀疑' },
      { label: '重要之人 Significant People', value: significantPeople, set: setSignificantPeople, hint: '例如：大学导师亨利·阿米蒂奇教授' },
      { label: '重要场所 Meaningful Locations', value: meaningfulLocations, set: setMeaningfulLocations, hint: '例如：密斯卡塔尼克大学图书馆地下室' },
      { label: '珍贵之物 Treasured Possessions', value: treasuredPossessions, set: setTreasuredPossessions, hint: '例如：父亲留下的银怀表' },
      { label: '特质 Traits', value: traits, set: setTraits, hint: '例如：缄默、固执、好奇心强' },
      { label: '伤口/伤痕 Injuries', value: injuries, set: setInjuries, hint: '例如：右膝旧伤，雨天会隐隐作痛' },
      { label: '恐惧症/狂躁症 Phobias', value: phobias, set: setPhobias, hint: '例如：幽闭恐惧症，无法忍受狭小封闭空间' },
    ];

    const accordionRef = useRef<HTMLDivElement>(null);

    // Scroll expanded field to viewport top when opening
    useEffect(() => {
      if (openField && accordionRef.current) {
        const timer = setTimeout(() => {
          accordionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 120);
        return () => clearTimeout(timer);
      }
    }, [openField]);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
        <div style={sectionTitle}>背景故事 BACKGROUND</div>

        {/* Quick Fill */}
        <div style={{
          padding: '10px 12px', border: '1px solid rgba(196,168,85,0.15)', borderRadius: 4,
          background: 'rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0,
        }}>
          <button onClick={quickFill} disabled={quickFilling} className="sk-btn"
            style={{
              ...btnBase, fontSize: 11, padding: '6px 16px',
              opacity: quickFilling ? 0.5 : 1, cursor: quickFilling ? 'wait' : 'pointer',
            }}>
            {quickFilling ? '生成中...' : '✨ 快速填充'}
          </button>
          <span style={{ fontSize: 10, color: 'var(--ink-subtle)', fontFamily: 'var(--font-body)' }}>
            由 AI 根据身份和属性自动生成背景故事
          </span>
        </div>
        {quickFillError && (
          <div style={{
            padding: '8px 12px', border: '1px solid rgba(255,82,82,0.3)', borderRadius: 4,
            background: 'rgba(139,58,58,0.1)', color: 'var(--blood)', fontSize: 11,
            fontFamily: 'var(--font-body)', flexShrink: 0,
          }}>
            {quickFillError}
          </div>
        )}

        {/* Accordion — fills remaining height */}
        <div ref={accordionRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          {/* Header tabs at top — no gap, marginBottom per item for smooth collapse */}
          <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            {fields.map((f) => {
              const isOpen = openField === f.label;
              const isHidden = openField !== null && openField !== f.label;
              const hasContent = !!f.value;
              return (
                <div
                  key={f.label}
                  onClick={() => setOpenField(isOpen ? null : f.label)}
                  onMouseEnter={(e) => {
                    if (isHidden) return;
                    e.currentTarget.style.background = isOpen ? 'rgba(196,168,85,0.12)' : 'rgba(196,168,85,0.07)';
                    e.currentTarget.style.borderColor = 'rgba(196,168,85,0.50)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = isOpen ? 'rgba(196,168,85,0.06)' : hasContent ? 'rgba(196,168,85,0.03)' : 'rgba(0,0,0,0.04)';
                    e.currentTarget.style.borderColor = isOpen ? 'rgba(196,168,85,0.35)' : hasContent ? 'rgba(196,168,85,0.22)' : 'rgba(196,168,85,0.1)';
                  }}
                  onMouseDown={(e) => {
                    if (isHidden) return;
                    e.currentTarget.style.transform = 'scale(0.97)';
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: isHidden ? '0 10px' : '4px 10px',
                    cursor: 'pointer', userSelect: 'none',
                    borderStyle: 'solid',
                    borderColor: isOpen ? 'rgba(196,168,85,0.35)' : hasContent ? 'rgba(196,168,85,0.22)' : 'rgba(196,168,85,0.1)',
                    borderWidth: isHidden ? '0px' : '1px',
                    borderRadius: 4,
                    background: isOpen ? 'rgba(196,168,85,0.06)' : hasContent ? 'rgba(196,168,85,0.03)' : 'rgba(0,0,0,0.04)',
                    overflow: 'hidden',
                    maxHeight: isHidden ? '0px' : '30px',
                    opacity: isHidden ? 0 : 1,
                    minHeight: isHidden ? '0px' : '30px',
                    marginBottom: isHidden ? '0px' : '4px',
                    transform: 'scale(1)',
                    transition: 'max-height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.35s cubic-bezier(0.4,0,0.2,1), margin-bottom 0.4s cubic-bezier(0.4,0,0.2,1), padding 0.4s cubic-bezier(0.4,0,0.2,1), min-height 0.4s cubic-bezier(0.4,0,0.2,1), border-width 0.4s cubic-bezier(0.4,0,0.2,1), transform 0.15s cubic-bezier(0.4,0,0.2,1), background 0.2s cubic-bezier(0.4,0,0.2,1), border-color 0.2s cubic-bezier(0.4,0,0.2,1)',
                  }}
                >
                  <span style={{ fontSize: 11, color: 'var(--ink-subtle)', fontFamily: 'var(--font-ui)', letterSpacing: 2 }}>{f.label}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {hasContent ? (
                      <span style={{ fontSize: 10, color: 'var(--text-light)', fontFamily: 'var(--font-body)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.value}</span>
                    ) : null}
                    <span style={{ color: 'var(--gold)', fontSize: 10, transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)', transform: isOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
                  </span>
                </div>
              );
            })}
          </div>
          {/* Input panel — AnimatePresence for smooth bezier expand/collapse */}
          <AnimatePresence>
            {openField && (
              <motion.div
                initial={{ height: 0, opacity: 0, marginTop: 0 }}
                animate={{ height: 'auto', opacity: 1, marginTop: 6 }}
                exit={{ height: 0, opacity: 0, marginTop: 0 }}
                transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
                style={{
                  flex: 1, overflow: 'hidden',
                  display: 'flex', flexDirection: 'column', minHeight: 0,
                }}
              >
                {(() => {
                  const f = fields.find((x) => x.label === openField)!;
                  return f.rows ? (
                    <textarea
                      value={f.value}
                      onChange={(e) => f.set(e.target.value)}
                      style={{ ...inputStyle, flex: 1, resize: 'none', textAlign: 'left' }}
                      placeholder={f.hint}
                    />
                  ) : (
                    <input
                      type="text"
                      value={f.value}
                      onChange={(e) => f.set(e.target.value)}
                      style={inputStyle}
                      placeholder={f.hint}
                    />
                  );
                })()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  }

  /* ===== Step 6: Review ===== */
  function renderReview() {
    const c = (k: COC7Characteristic) => charValues[k] ?? 0;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={sectionTitle}>确认创建 REVIEW</div>

        {/* Preset save */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button onClick={savePreset} style={{ padding: '4px 12px', border: '1px solid var(--gold)', borderRadius: 3, background: 'rgba(196,168,85,0.1)', color: 'var(--gold)', fontFamily: 'var(--font-ui)', fontSize: 10, cursor: 'pointer', letterSpacing: 2 }}>保存为预设</button>
        </div>

        {/* Identity summary */}
        <div style={{
          border: '1px solid rgba(196,168,85,0.15)',
          borderRadius: 4,
          background: 'rgba(0,0,0,0.1)',
          padding: 12,
        }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 8 }}>
            身份信息
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 12 }}>
            <Row label="姓名" value={name || '--'} />
            <Row label="玩家" value={player || '--'} />
            <Row label="职业" value={occupation === '__custom__' ? (customOccupation || '--') : (occupation || '--')} />
            <Row label="年龄" value={String(age)} />
            <Row label="性别" value={sex || '--'} />
            <Row label="居住地" value={residence || '--'} />
            <Row label="出生地" value={birthplace || '--'} />
          </div>
        </div>

        {/* Characteristics summary */}
        <div style={{
          border: '1px solid rgba(196,168,85,0.15)',
          borderRadius: 4,
          background: 'rgba(0,0,0,0.1)',
          padding: 12,
        }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 8 }}>
            基础属性
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '4px 12px', fontSize: 12 }}>
            {CHAR_ORDER.map(({ key, zh }) => {
              const val = c(key);
              return (
                <div key={key} style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-light)' }}>
                  <span style={{ color: 'var(--ink-subtle)', fontSize: 10 }}>{zh} </span>
                  <span style={{ color: 'var(--gold)' }}>{val}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Derived summary */}
        <div style={{
          border: '1px solid rgba(196,168,85,0.15)',
          borderRadius: 4,
          background: 'rgba(0,0,0,0.1)',
          padding: 12,
        }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 8 }}>
            衍生属性
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '4px 12px', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            <div>HP: <span style={{ color: 'var(--success)' }}>{derived.hpMax}/{derived.hpMax}</span></div>
            <div>SAN: <span style={{ color: 'var(--blood)' }}>{derived.sanMax}/{derived.sanMax}</span></div>
            <div>MP: <span style={{ color: 'var(--gold)' }}>{derived.mpMax}/{derived.mpMax}</span></div>
            <div>LUCK: <span style={{ color: 'var(--gold-bright)' }}>{luckValue ?? '--'}</span></div>
            <div>MOV: 8</div>
            <div>DB: {derived.db} (Build {derived.build >= 0 ? '+' : ''}{derived.build})</div>
          </div>
        </div>

        {/* Skills summary */}
        <div style={{
          border: '1px solid rgba(196,168,85,0.15)',
          borderRadius: 4,
          background: 'rgba(0,0,0,0.1)',
          padding: 12,
        }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 8 }}>
            技能 ({occSkills.length + interestSkills.length + 1} 项)
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-subtle)', marginBottom: 6 }}>
            信用评级: <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-mono)' }}>{creditRating}%</span>
          </div>
          {occSkills.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--ink-subtle)', marginBottom: 4 }}>职业技能:</div>
              {occSkills.map((sn) => {
                const spec = ALL_SKILLS.find((s) => s.name === sn);
                const base = spec ? resolveSkillBase(spec.base, charValues as Record<COC7Characteristic, number>) : 0;
                const occA = occPoints[sn] ?? 0;
                const intA = interestPoints[sn] ?? 0;
                return (
                  <div key={sn} style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-light)', marginLeft: 8 }}>
                    {sn}: {base}% {occA > 0 ? `+${occA}%` : ''}{intA > 0 ? ` +${intA}%` : ''} = <span style={{ color: 'var(--gold)' }}>{Math.min(99, base + occA + intA)}%</span>
                  </div>
                );
              })}
            </div>
          )}
          {interestSkills.filter((sn) => !occSkills.includes(sn)).length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--ink-subtle)', marginBottom: 4 }}>兴趣技能:</div>
              {interestSkills.filter((sn) => !occSkills.includes(sn)).map((sn) => {
                const spec = ALL_SKILLS.find((s) => s.name === sn);
                const base = spec ? resolveSkillBase(spec.base, charValues as Record<COC7Characteristic, number>) : 0;
                const intA = interestPoints[sn] ?? 0;
                return (
                  <div key={sn} style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-light)', marginLeft: 8 }}>
                    {sn}: {base}% {intA > 0 ? `+${intA}%` : ''} = <span style={{ color: 'var(--gold)' }}>{Math.min(99, base + intA)}%</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Background summary */}
        <div style={{
          border: '1px solid rgba(196,168,85,0.15)',
          borderRadius: 4,
          background: 'rgba(0,0,0,0.1)',
          padding: 12,
        }}>
          <div style={{ fontSize: 11, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginBottom: 8 }}>
            背景故事
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
            {description && <Row label="个人描述" value={description} />}
            {beliefs && <Row label="思想/信念" value={beliefs} />}
            {significantPeople && <Row label="重要之人" value={significantPeople} />}
            {meaningfulLocations && <Row label="重要场所" value={meaningfulLocations} />}
            {treasuredPossessions && <Row label="珍贵之物" value={treasuredPossessions} />}
            {traits && <Row label="特质" value={traits} />}
            {injuries && <Row label="伤口/伤痕" value={injuries} />}
            {phobias && <Row label="恐惧症/狂躁症" value={phobias} />}
          </div>
        </div>
      </div>
    );
  }

  /* ===== Main render ===== */
  return (
    <>
      <style>{`input[type=number]::-webkit-outer-spin-button,input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}input[type=number]{-moz-appearance:textfield;text-align:center}
.sk-btn{transition:filter 0.15s,transform 0.15s,text-shadow 0.15s;cursor:pointer;transform:translateZ(0)}
.sk-btn:hover{filter:brightness(2.3);transform:translateZ(0) scale(1.08)}
.sk-btn:active{filter:brightness(1.6);transform:translateZ(0) scale(0.95)}
.sk-btn-occ{text-shadow:0 0 5px rgba(196,168,85,0.7),0 0 10px rgba(196,168,85,0.3)}
.sk-btn-int{text-shadow:0 0 5px rgba(120,175,220,0.7),0 0 10px rgba(120,175,220,0.3)}
@keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
.sk-desc-inner{display:flex;width:max-content;animation:ticker var(--tkr-dur,6s) linear infinite}
.sk-desc-inner span{flex-shrink:0;padding-right:120px}
input::placeholder,textarea::placeholder{color:rgba(255,255,255,0.18)!important}
input[type=range]::-webkit-slider-thumb{transition:filter 0.15s,transform 0.15s cubic-bezier(0.4,0,0.2,1);cursor:pointer}
input[type=range]::-webkit-slider-thumb:hover{filter:brightness(1.3);transform:scale(1.25)}
input[type=range]::-webkit-slider-thumb:active{filter:brightness(0.85);transform:scale(0.85)}
`}</style>
      {/* Backdrop */}
      <div
        onClick={() => {}}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 800,
          background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(4px)',
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 850,
        width: 560,
        maxWidth: '94vw',
        maxHeight: '88vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)',
        border: '1px solid rgba(196,168,85,0.25)',
        borderRadius: 6,
        boxShadow: '0 8px 60px rgba(0,0,0,0.7)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          padding: '18px 24px 14px',
          borderBottom: '1px solid rgba(196,168,85,0.18)',
          background: 'rgba(13,10,7,0.6)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                color: 'var(--gold)',
                letterSpacing: 4,
                margin: 0,
                lineHeight: 1.3,
              }}>
                创建调查员角色
              </h2>
              <div style={{
                fontFamily: 'var(--font-ui)',
                fontSize: 11,
                color: 'var(--ink-subtle)',
                letterSpacing: 3,
                marginTop: 2,
              }}>
                INVESTIGATOR CREATOR
              </div>
            </div>
            <button onClick={onClose} className="sk-btn" style={{
              width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid transparent', borderRadius: 3,
              background: 'transparent', color: 'var(--ink-subtle)', fontSize: 16,
              fontFamily: 'var(--font-ui)',
            }}>
              ✕
            </button>
          </div>

          {/* Step indicator */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14,
          }}>
            {STEPS.map((label, i) => {
              const active = i === step;
              const done = i < step;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {i > 0 && (
                    <div style={{
                      width: 20, height: 1,
                      background: i <= step ? 'var(--gold)' : 'rgba(255,255,255,0.1)',
                      transition: 'var(--transition-smooth)',
                    }} />
                  )}
                  <button
                    onClick={() => { if (done) setStep(i); }}
                    className={done ? 'sk-btn' : undefined}
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      border: active ? '1px solid var(--gold)' : done ? '1px solid rgba(196,168,85,0.35)' : '1px solid rgba(255,255,255,0.1)',
                      background: active ? 'var(--gold)' : done ? 'rgba(196,168,85,0.15)' : 'transparent',
                      color: active ? 'var(--void)' : done ? 'var(--gold)' : 'var(--ink-subtle)',
                      fontSize: 12, fontFamily: 'var(--font-mono)', fontWeight: 700,
                      cursor: done ? 'pointer' : 'default',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {done ? '✓' : i + 1}
                  </button>
                  {active && (
                    <span style={{ fontSize: 9, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 1, whiteSpace: 'nowrap' }}>
                      {label}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

        </div>

        {/* Content */}
        <div style={{
          flex: 1,
          padding: '20px 24px',
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--ink-faded) transparent',
          display: 'flex', flexDirection: 'column',
        }}>
            {renderStepContent()}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '14px 24px',
          borderTop: '1px solid rgba(196,168,85,0.15)',
          background: 'rgba(13,10,7,0.5)',
          flexShrink: 0,
        }}>
          <button
            onClick={prevStep}
            disabled={step === 0}
            className={step > 0 ? 'sk-btn' : undefined}
            style={step === 0 ? btnDisabled : btnBase}
          >
            ← 上一步
          </button>

          {step === 3 && (
            <button onClick={(e) => { e.stopPropagation(); randomAllocate(); }}
              className="sk-btn"
              style={{ ...btnBase, background: 'rgba(196,168,85,0.08)', borderColor: 'rgba(196,168,85,0.25)', color: 'var(--gold)' }}
            >⚄ 随机分配</button>
          )}

          {step < STEPS.length - 1 ? (
            <button
              onClick={nextStep}
              disabled={!canGoNext()}
              className={canGoNext() ? 'sk-btn' : undefined}
              style={canGoNext() ? { ...btnBase, background: 'rgba(196,168,85,0.15)', borderColor: 'rgba(196,168,85,0.5)' } : btnDisabled}
            >
              下一步 →
            </button>
          ) : (
            <button
              onClick={handleConfirm}
              className="sk-btn"
              style={{ ...btnBase, background: 'rgba(139,58,58,0.25)', borderColor: 'rgba(204,51,51,0.4)', color: 'var(--blood-bright)' }}
            >
              确认创建
            </button>
          )}
        </div>
      </div>
    </>
  );
}

/* ===== Tiny helpers ===== */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 4, fontSize: 12 }}>
      <span style={{ color: 'var(--ink-subtle)', flexShrink: 0 }}>{label}:</span>
      <span style={{ color: 'var(--text-light)' }}>{value}</span>
    </div>
  );
}

const thSmall: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: 10,
  color: 'var(--ink-subtle)',
  letterSpacing: 1,
  fontFamily: 'var(--font-ui)',
  fontWeight: 600,
};

const tdSmall: React.CSSProperties = {
  padding: '5px 10px',
  fontSize: 11,
  color: 'var(--text-light)',
};

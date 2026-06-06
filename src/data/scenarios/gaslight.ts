// 克苏鲁煤气灯 · 雾都阴影 — 维多利亚伦敦背景下的神话调查
// 源: COCExtends.pdf 第 5 章「克苏鲁煤气灯」
import type { ScenarioDoc } from '../../types/scenario';

export const SCENARIO_GASLIGHT: ScenarioDoc = {
  id: 'sc-gaslight',
  builtin: true,
  meta: {
    name: '克苏鲁煤气灯 · 雾都阴影',
    type: '调查',
    durationHint: '3-5h',
    difficulty: 3,
    headcountHint: '2-4 调查员',
    sanLossHint: '高',
    blurb: '一连三名通灵者在白教堂区死状奇特。报纸把它当作下一桩开膛手案，但请你来的并不是警察——是一位戴黑面纱、要价昂贵的赞助人。',
    coverEmoji: '🕯',
  },
  prologueSeed: `泰晤士河上飘着雾，煤气灯在街角晕开蜡黄的光圈。马蹄声从背后哒哒而过，溅起的水把你的呢绒大衣下摆又淋湿一截。约定的茶馆在第二条小巷子里，门口铜牌上的小字几乎被烟熏黑。

进门时铃铛响了一下。包间里坐着一位穿黑色长袍、戴黑面纱的女士；她没起身，只示意你坐下。

「最近三周内，白教堂区死了三位通灵者。三个人不彼此相识，死法各有不同——一个在浴缸里自溺，一个咬碎了舌头，一个跳下楼梯。但他们死前最后一次出席的降神会，都是同一位主持人。」

她推过来一只小皮匣，里头是一份名单、几张报纸剪报，还有一枚已经发黑的小银坠子。「请你别去警察那儿。雾里的事，雾里办。明日傍晚我会再来。」`,
  recommendedSkills: [
    '心理学',
    '侦查',
    '聆听',
    '话术',
    '克苏鲁神话',
    '神秘学',
    '医学',
    '历史',
    '急救',
  ],
  recommendedOccupations: ['医师', '警探', '记者', '学者', '牧师', '通灵者', '绅士侦探', '律师'],
  characters: [],
  entries: [
    {
      id: 'e_gl_london',
      category: '地点',
      comment: '维多利亚伦敦',
      keys: '伦敦, 雾都, 煤气灯, London',
      content:
        '工业鼎盛、阶级分明的世界都市。富人住在西区高楼大宅，穷人挤在东区污水四溢的廉租公寓。雾几乎每天都有，混着煤烟与河水气味。报纸、电报、新发明的公共马车贯通城市，警力却跟不上案件增速。',
      constant: true,
      position: 0,
      priority: 10,
      cachePolicy: 'static_prefix',
    },
    {
      id: 'e_gl_whitechapel',
      category: '地点',
      comment: '白教堂区',
      keys: '白教堂, Whitechapel, 东区',
      content:
        '伦敦东区贫民窟。妓女、移民、码头工、流浪汉混杂。多条小巷在夜里几乎无法靠煤气灯辨别方向。三起通灵者死亡案都发生在此区半英里范围内。本区居民对外人有天然戒心。',
      constant: false,
      position: 0,
      priority: 30,
      cachePolicy: 'auto',
    },
    {
      id: 'e_gl_seance_room',
      category: '地点',
      comment: '降神会沙龙',
      keys: '降神会, 沙龙, 灵媒',
      content:
        '位于一位退休女演员家中的小客厅，桌上摆水晶球，墙上挂相册。每周三、周六两次降神会。三位死者都在死前最后一次降神会上出席过。\n<% if (getvar(\'剧情.已解锁.降神真相\') === \'true\') { %>\n主持人本人是一名娴熟的精神病医师而非真正的通灵者。他在降神会上用化学手法引导参与者短暂进入催眠状态，借此植入暗示；但他植入的对象不是普通暗示——是某种「召请词」，每一位参与者都被植入了一段会在 21 天内自动播放的精神模式。\n<% } %>',
      constant: false,
      position: 0,
      priority: 35,
      cachePolicy: 'dynamic_suffix',
    },
    {
      id: 'e_gl_lady',
      category: '人物',
      comment: '黑面纱女士',
      keys: '黑面纱, 委托人, 女士',
      content:
        '委托你调查此案的女子。气质极佳，言辞克制，价钱不菲。她不肯透露真实姓名，只说你可以叫她「夫人」。\n<% if (getvar(\'剧情.已解锁.夫人身份\') === \'true\') { %>\n她是第三位死者的遗孀。她坚持私下调查而非诉诸警察是因为：她的丈夫并不是死者三人中唯一的通灵者，她的家族世代为「真正能听到声音的人」服务，而最近这场事件已经威胁到他们家族的延续。\n<% } %>',
      constant: false,
      position: 0,
      priority: 40,
      cachePolicy: 'dynamic_suffix',
    },
    {
      id: 'e_gl_inquirer',
      category: '势力',
      comment: '伦敦灵研学会',
      keys: '灵研学会, 灵学会, SPR',
      content:
        '当时新成立不久的「灵学研究学会」，由几位剑桥学者牵头，研究通灵、招魂等超自然现象。表面上是科学社团，实际成员立场分化——有人真信，有人想揭穿，有人只想用研究求名。',
      constant: false,
      position: 0,
      priority: 25,
      cachePolicy: 'auto',
    },
    {
      id: 'e_gl_locket',
      category: '物品线索',
      comment: '发黑的小银坠',
      keys: '银坠, 项链, 黑',
      content:
        '夫人交给你的小银坠子，吊坠中藏着一束发丝。坠子已经发黑，化学上属于硫化银——但夫人坚称死者每周打理它，不可能这么快变黑。',
      constant: false,
      position: 0,
      priority: 50,
      cachePolicy: 'static_prefix',
    },
    {
      id: 'e_gl_dark_thread',
      category: '暗线',
      comment: '召请词的传播',
      keys: '召请词, 传播, 21 天',
      content:
        '降神会主持人是某个跨大陆密教的潜伏成员。他选择伦敦是因为这里通灵热潮极盛、参与者众，是用「精神植入」批量召请某尊旧神化身的最佳土壤。每位参与降神会的人会在 21 天内自杀或杀人，死法不重要，关键是死亡瞬间发出的「精神波纹」。',
      constant: false,
      position: 0,
      priority: 60,
      cachePolicy: 'auto',
      hidden: true,
    },
    {
      id: 'e_gl_unlock_seance',
      category: '秘密与解锁',
      comment: '深层秘密 · 降神真相',
      keys: '降神真相',
      content: '玩家若亲自参加一次降神会并通过心理学检定，解锁此键。',
      constant: false,
      position: 0,
      priority: 5,
      cachePolicy: 'static_prefix',
      hidden: true,
    },
  ],
  darkTimeline: [
    {
      id: 'dp_gl_1',
      threshold: 0,
      title: '雾中开局',
      triggers: ['白教堂区新闻骤增', '马匹夜里拒绝过某条街', '报纸的小广告里出现奇怪暗语', '调查员发现自己被人跟踪'],
      directorNote: '初期氛围以伦敦风情为主，让玩家熟悉环境与角色。',
      autoUnlockKeys: [],
    },
    {
      id: 'dp_gl_2',
      threshold: 25,
      title: '第四位死者',
      triggers: ['名单上某位通灵者突然死亡', '报纸标题升级为开膛手新案', '警察介入', '夫人变得焦虑'],
      directorNote: '威胁开始追上节奏。玩家若进度过慢，名单上的人会按周接连死亡。',
      autoUnlockKeys: ['夫人身份'],
    },
    {
      id: 'dp_gl_3',
      threshold: 50,
      title: '降神会扩散',
      triggers: ['多家沙龙开始模仿这种降神会', '同样的「召请词」出现在其他城市报纸', '调查员收到匿名警告', '夜雾持久不散'],
      directorNote: '密教正利用伦敦的通灵热潮扩大规模。仅停留在白教堂区已经不够。',
      autoUnlockKeys: ['降神真相'],
    },
    {
      id: 'dp_gl_4',
      threshold: 75,
      title: '城市同步',
      triggers: ['同夜伦敦发生上百起怪异自杀', '泰晤士河水夜间发黑', '议会有议员行为反常', '夫人失踪'],
      directorNote: '召请词已经传开。最后阻止机会窗口非常窄——必须找到主持人本体并毁掉他的「主谱」。',
      autoUnlockKeys: ['城市同步'],
    },
  ],
  badEndings: [
    {
      id: 'be_gl_avatar_in_london',
      condition: '暗线 ≥75 且主持人未被阻止',
      narrative:
        '某个雾深的夜晚，伦敦突然安静了一刻钟——所有钟表停摆，所有煤气灯同时熄灭。泰晤士河面浮上一段无法描述的轮廓，看了一眼这座城市，又沉了下去。第二天，伦敦表面一切如常，但每一个看过那一眼的人，余生都会在某一刻想起那个轮廓，并失去说话能力。报纸把这一夜称为「煤气灯熄灯日」，但什么也解释不清。',
      accelerators: ['未识破主持人身份', '与灵学会成员透露过多', '让夫人独自调查'],
    },
    {
      id: 'be_gl_personal_seance',
      condition: '调查员亲自参加降神会超过两次而未做精神分析',
      narrative:
        '案件结束后调查员看似无恙地回归日常生活。某夜，他/她在自己的书房里独坐良久，然后用毛笔在纸上写下一行不属于任何已知语言的字。第二天早晨家人发现他/她已死，姿势安详。书桌上那行字被传抄到几份小报上，二十一天内，伦敦多发了一连串近似的死亡。',
      accelerators: ['长时间研究小银坠', '反复阅读降神会笔记', '独自前往降神会沙龙'],
    },
  ],
  authorNotes:
    '基调：「雾里的事，雾里办」。维多利亚伦敦本身就是个完美的克苏鲁舞台——阶级、雾、煤气灯、新闻、新兴科学与古老迷信并存。调查节奏可以慢，氛围必须细。建议守秘人多用气味与声音作意象。',
  schemaVersion: 1,
  createdAt: 0,
  updatedAt: 0,
};

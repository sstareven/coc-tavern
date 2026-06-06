// 克苏鲁末日之收割 · 灰烬之原 — 后启示录幸存者
// 源: COCExtends.pdf 第 8 章「克苏鲁末日之收割」
import type { ScenarioDoc } from '../../types/scenario';

export const SCENARIO_HARVEST: ScenarioDoc = {
  id: 'sc-harvest',
  builtin: true,
  meta: {
    name: '克苏鲁末日之收割 · 灰烬之原',
    type: '混合',
    durationHint: '3-5h',
    difficulty: 4,
    headcountHint: '3-5 调查员',
    sanLossHint: '极高',
    blurb: '旧神已经苏醒，世界正在被「收割」。你们部落收到来自北方废弃城市的烟雾信号——那是约定的「最后求救」。一行 22 人正在被等。',
    coverEmoji: '☣',
  },
  prologueSeed: `灰烬已经下了七天，把太阳压成一只苍白的圆盘。部落的火塘晚饭后总是围满人，今晚多了一个老妇——她拄着木杖，从南面荒原走了两天才到。她说北方那座旧城里点起了三柱黑烟。

这是你父亲那代人就定好的暗号——「黑烟三柱，最后一次求救」。如果不去看，那群人就死了；如果去看，去的人不一定回得来。

部落长老围着她坐了一整夜，第二天清晨决定：派一队人去，但不能多。你被点了名。

集结时只有 22 人——猎人、医师、一位疯狂先知、一名还在练习的少年。你们带着仅有的子弹与防毒面罩，骑着改良过的脚踏车，沿着灰烬覆盖的旧公路向北。你不知道你们最终会不会回到部落，也不知道部落是否还能撑到你们回来。`,
  recommendedSkills: [
    '生存',
    '急救',
    '格斗(冷兵器)',
    '射击(步枪/霰弹枪)',
    '克苏鲁神话',
    '侦查',
    '电气维修',
    '医学',
    '聆听',
  ],
  recommendedOccupations: ['幸存者首领', '废土学者', '拾荒者', '医师', '猎人', '疯狂先知', '机械师'],
  characters: [],
  entries: [
    {
      id: 'e_hv_tribe',
      category: '地点',
      comment: '部落',
      keys: '部落, 据点, 火塘',
      content:
        '建在废弃高速公路一段桥下的小型据点，约 60 人。火塘居中，居住舱由报废货车厢拼接。资源紧张：水靠收集冰晶，食物靠菌田与偶尔的猎物。所有重要决定由长老议事决定，不靠票数。',
      constant: true,
      position: 0,
      priority: 10,
      cachePolicy: 'static_prefix',
    },
    {
      id: 'e_hv_city',
      category: '地点',
      comment: '北方旧城',
      keys: '旧城, 废城, 黑烟',
      content:
        '一座末日前曾有数百万人的旧城。市中心高楼塌成倾斜锥形，街上常有变异生物游荡。三柱黑烟来自市政厅广场。\n<% if (getvar(\'剧情.已解锁.城中真相\') === \'true\') { %>\n那三柱黑烟不是绝望中的求救——是一种召请用的化学物质。点火者并非幸存者，而是某个新崛起的「收割教派」，他们想引来旧神化身的注意。任何来到广场的部落都会被自动卷入仪式。\n<% } %>',
      constant: false,
      position: 0,
      priority: 35,
      cachePolicy: 'dynamic_suffix',
    },
    {
      id: 'e_hv_prophet',
      category: '人物',
      comment: '疯狂先知·克拉',
      keys: '克拉, 先知, 疯狂',
      content:
        '部落里那位长年说胡话的女人，年龄不详。她的话十有八九没人理解，但偶尔会精准说出未发生的事。她坚持要跟队北上，长老破例同意了。\n<% if (getvar(\'剧情.已解锁.先知本相\') === \'true\') { %>\n她并非疯狂——她是部落中唯一仍能「听见旧神」的人，她的胡话其实是一种对抗。她活到现在已经超出常态太多，部落里没人知道她最初是什么时候出现的。\n<% } %>',
      constant: false,
      position: 0,
      priority: 40,
      cachePolicy: 'dynamic_suffix',
    },
    {
      id: 'e_hv_cult',
      category: '势力',
      comment: '收割教派',
      keys: '收割教派, 教派, 旧神信徒',
      content:
        '旧神苏醒之后，大量幸存者出于绝望或贪心而加入的新兴宗教。他们崇拜「收割者」——一种把废墟中的痛苦与死亡视为养分的旧神化身。教派遍布全球，但各地教区彼此独立、互不统属。',
      constant: false,
      position: 0,
      priority: 30,
      cachePolicy: 'auto',
    },
    {
      id: 'e_hv_relic',
      category: '物品线索',
      comment: '部落传家黑曜匕',
      keys: '黑曜匕, 匕首, 传家',
      content:
        '部落长老在出发前递给你们的一柄末日前打磨的黑曜石匕首。看起来不锋利，但能切开多数变异生物的护甲。匕柄绑着一缕白发，据说是「上一代守护者」的。',
      constant: false,
      position: 0,
      priority: 50,
      cachePolicy: 'static_prefix',
    },
    {
      id: 'e_hv_dark_thread',
      category: '暗线',
      comment: '收割之歌',
      keys: '收割之歌, 旧神化身',
      content:
        '旧神化身「收割者」正在巡视各废墟。它不需要主动出击——只要某地发出足够强度的「绝望波纹」（祭祀+死亡+集体信仰），它就会驻足，把那一片地区变成自己的「收割田」。北方旧城的三柱黑烟就是召请它驻足的开关。',
      constant: false,
      position: 0,
      priority: 60,
      cachePolicy: 'auto',
      hidden: true,
    },
    {
      id: 'e_hv_unlock_city',
      category: '秘密与解锁',
      comment: '深层秘密 · 城中真相',
      keys: '城中真相',
      content: '玩家若靠近黑烟源头并通过相应检定，解锁此键。',
      constant: false,
      position: 0,
      priority: 5,
      cachePolicy: 'static_prefix',
      hidden: true,
    },
  ],
  darkTimeline: [
    {
      id: 'dp_hv_1',
      threshold: 0,
      title: '北上路途',
      triggers: ['脚踏车爆胎', '夜间遇见变异狼群', '路边的废车里发现新鲜血迹', '远处地平线上偶尔有黑色烟柱'],
      directorNote: '让玩家熟悉队伍各成员、消耗有限资源、做出小决策。',
      autoUnlockKeys: [],
    },
    {
      id: 'dp_hv_2',
      threshold: 25,
      title: '前哨遭遇',
      triggers: ['遇见自称同盟部落的小队', '发现教派标记', '克拉开始反常说话', '队伍中有人失踪'],
      directorNote: '威胁开始具体化。玩家须判断同盟可信度。失踪人员的归来形态值得谨慎对待。',
      autoUnlockKeys: ['前哨遭遇'],
    },
    {
      id: 'dp_hv_3',
      threshold: 50,
      title: '进入旧城',
      triggers: ['空气变得粘稠', '高楼之间能看见非鸟非云的影', '广场附近有不明吟唱', '克拉指出三个具体方向'],
      directorNote: '玩家进入仪式半径。每停留 1 小时损失少量 SAN。克拉的指示是阻止仪式的关键。',
      autoUnlockKeys: ['城中真相', '先知本相'],
    },
    {
      id: 'dp_hv_4',
      threshold: 75,
      title: '广场对峙',
      triggers: ['三柱黑烟合为一柱', '广场上空出现「收割者」轮廓', '教派祭司公开露面', '同行队伍只剩一半'],
      directorNote: '正面冲突或潜伏破坏的最后窗口。建议守秘人允许牺牲与替代——队伍中谁愿留下、谁愿点火灭烟，决定结局。',
      autoUnlockKeys: ['化身降临'],
    },
  ],
  badEndings: [
    {
      id: 'be_hv_field',
      condition: '暗线 ≥75 且仪式未被中断',
      narrative:
        '「收割者」在广场上空驻足。它没有声音，没有形状的具体定义，但它的「注意」覆盖了方圆 50 公里。从那一刻起，这片区域成为它的收割田——所有活着的人余生不过是为它生产「绝望波纹」。包括你们部落。',
      accelerators: ['未识破前哨同盟的伪装', '在广场停留过久未行动', '射杀克拉'],
    },
    {
      id: 'be_hv_personal_listen',
      condition: '调查员长期接触收割之歌且未做精神分析',
      narrative:
        '调查员在回部落的路上独自一夜未眠。次日他/她对其他人说要去前面探路。再没回来。三个月后部落里偶尔有人在地平线上看见他/她——独自一人，慢慢朝旧城方向走。',
      accelerators: ['反复倾听吟唱', '独自前往广场', '与教派祭司单独对话'],
    },
  ],
  authorNotes:
    '基调：「绝境之中还有更深的绝望」。这是 8 个剧本里 SAN 损耗最重的，请守秘人配合调整生命与精神状态。建议突出资源匮乏、人际信任、克制的英雄主义。',
  schemaVersion: 1,
  createdAt: 0,
  updatedAt: 0,
};

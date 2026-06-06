// 神秘冰岛 · 萨迦低语 — 北欧维京时代背景下的神话调查
// 源: COCExtends.pdf 第 3 章「神秘冰岛」
import type { ScenarioDoc } from '../../types/scenario';

export const SCENARIO_MYSTIC_ICELAND: ScenarioDoc = {
  id: 'sc-mystic-iceland',
  builtin: true,
  meta: {
    name: '神秘冰岛 · 萨迦低语',
    type: '混合',
    durationHint: '3-5h',
    difficulty: 3,
    headcountHint: '2-4 调查员',
    sanLossHint: '高',
    blurb: '一艘从东方返航的长船带回了奇怪的货物：一只锁着锁、刻满符文的木箱，以及一名再也无法发声的水手。萨迦里写过的怪物开始在峡湾边的农庄出现。',
    coverEmoji: '⛯',
  },
  prologueSeed: `北风从开阔的大海上吹来，把炊烟和咸味一起灌进峡湾。你站在码头上，看那艘刚靠岸的长船——它从东方贸易回来，按理说应该热闹欢腾，但船员都沉着脸，几乎不发一言。船长把一只木箱搬下船时，胳膊在颤抖。

那位曾在出航前最爱吹嘘自己的少年水手，现在被两个同伴搀扶着下船。他不说话，只是不停地张嘴又合上，像是要发音却怎样都发不出来。他的眼睛盯着峡湾对岸的山脊，眼神空洞。

家中老人告诉你萨迦里曾写过一种「被海带走声音的东西」。族中长老不愿置评，但她那晚拒绝吃晚餐，反复擦拭家门口的卢恩石。三天后，村东头的山羊夜里全部消失，只留下一地黏液。你被推举为该去问问那艘船究竟带回了什么的人。`,
  recommendedSkills: [
    '古诺尔斯语',
    '萨迦传说',
    '神秘学',
    '克苏鲁神话',
    '航海',
    '生存',
    '格斗(战斧/阔剑)',
    '聆听',
    '弓术',
  ],
  recommendedOccupations: ['维京战士', '族长', '萨满(Galdrakona)', '吟游诗人(Skald)', '船长', '猎人', '铁匠'],
  characters: [],
  entries: [
    {
      id: 'e_mi_fjord',
      category: '地点',
      comment: '峡湾农庄',
      keys: '峡湾, 农庄, 长屋, 冰岛',
      content:
        '依山傍海的小聚落，由数座长屋组成，主屋有火塘、长凳与悬挂的腌肉。男人下海贸易或猎海豹，女人织羊毛布、酿艾尔酒、管理山羊。卢恩石立在屋外，刻着保护图样。冬季漫长，夏季短促；天空在夏日几乎不全黑。',
      constant: true,
      position: 0,
      priority: 10,
      cachePolicy: 'static_prefix',
    },
    {
      id: 'e_mi_seerstone',
      category: '地点',
      comment: '占卜女祭司之屋',
      keys: '女祭司, Galdrakona, 占卜, 卢恩',
      content:
        '位于聚落外围、半埋于山坡的草顶屋。女祭司年逾七十，目盲但能听到风的话语。她门口的卢恩石与众不同——一种比诺尔斯卢恩文更古老的符号。\n<% if (getvar(\'剧情.已解锁.女祭司知情\') === \'true\') { %>\n她知道那只木箱里装的是什么，因为她年轻时曾随族人去过东方那片土地。她保留着一卷牛皮卷，上面记载着用萨迦语写就的「封箱咒」——但她不会主动给任何人看。\n<% } %>',
      constant: false,
      position: 0,
      priority: 30,
      cachePolicy: 'dynamic_suffix',
    },
    {
      id: 'e_mi_captain',
      category: '人物',
      comment: '长船船长·赫拉夫尔',
      keys: '赫拉夫尔, Hrafnr, 船长, 长船',
      content:
        '四十出头的壮年男子，左眼有刀疤。曾跟你父亲一起出过几次海。带回这只木箱时，他的态度是少见的躲闪。他声称：「我们从东边一座荒废的小岛上找到的，本想留给祭司看。」',
      constant: false,
      position: 0,
      priority: 40,
      cachePolicy: 'auto',
    },
    {
      id: 'e_mi_thingmen',
      category: '势力',
      comment: '议会·辛格',
      keys: '辛格, Thing, 议会',
      content:
        '冰岛各聚落每年一度在阿尔辛格集会议事，无王无中央政权，所有重大事情靠议会调解。议会对「带不洁之物入岛」的处罚很重——从罚牲畜到流放都有可能。',
      constant: false,
      position: 0,
      priority: 25,
      cachePolicy: 'auto',
    },
    {
      id: 'e_mi_runebox',
      category: '物品线索',
      comment: '符文木箱',
      keys: '木箱, 符文, 锁',
      content:
        '一只与人头同高、用未知木材制成的方箱。表面雕刻五圈互相缠绕的符文，最外圈是诺尔斯卢恩，往内每一圈语言越来越古老，最里圈完全无法辨认。箱口用一根长链锁住，锁的样式不属于任何已知工匠。靠近时能感到指尖发麻。',
      constant: false,
      position: 0,
      priority: 50,
      cachePolicy: 'static_prefix',
    },
    {
      id: 'e_mi_dark_thread',
      category: '暗线',
      comment: '海中之物',
      keys: '海中之物, 沉睡, 深海',
      content:
        '木箱里封住的，是一只来自海底某处「死城」的小型仆从。它本身并不强大，但它能将自己周围的水域、土地、生物缓慢转化为它母神所喜欢的状态。它不需要破箱而出——只要在箱内继续待下去，半径会一天天扩大。',
      constant: false,
      position: 0,
      priority: 60,
      cachePolicy: 'auto',
      hidden: true,
    },
    {
      id: 'e_mi_unlock_seer',
      category: '秘密与解锁',
      comment: '深层秘密 · 女祭司知情',
      keys: '女祭司知情',
      content:
        '玩家若通过萨迦传说检定或与女祭司深入交谈了解她年轻时的经历，解锁此键。',
      constant: false,
      position: 0,
      priority: 5,
      cachePolicy: 'static_prefix',
      hidden: true,
    },
  ],
  darkTimeline: [
    {
      id: 'dp_mi_1',
      threshold: 0,
      title: '黏液与无声',
      triggers: ['山羊夜里失踪', '腌肉变黏', '少年水手仍无法发声', '风向反常'],
      directorNote: '威胁尚停留在「物」的层面，对人尚未直接出手。鼓励玩家注意环境细节。',
      autoUnlockKeys: [],
    },
    {
      id: 'dp_mi_2',
      threshold: 25,
      title: '峡湾水变',
      triggers: ['峡湾水位夜间反涨', '海面起雾时间反常', '海豹尸体浮上岸', '远海传来低吟'],
      directorNote: '威胁延伸到海。出海捕鱼的人开始出现幻觉。',
      autoUnlockKeys: ['女祭司知情'],
    },
    {
      id: 'dp_mi_3',
      threshold: 50,
      title: '聚落分裂',
      triggers: ['有家庭夜间集体消失', '议会被要求介入', '船长行为更加躲闪', '女祭司的卢恩石裂开'],
      directorNote: '族中开始有人主张把箱子扔回大海，有人主张销毁，有人秘密崇拜。冲突公开化。',
      autoUnlockKeys: ['聚落分裂'],
    },
    {
      id: 'dp_mi_4',
      threshold: 75,
      title: '海底之眼浮现',
      triggers: ['峡湾水位整日不退', '海面下看见庞大轮廓', '夜里整个聚落同做相同的梦', '婴儿出生畸形'],
      directorNote: '母神的注意力已经聚焦到此处。结束阶段在即。封箱仪式必须在 1d4 日内完成，否则母神的化身将上岸。',
      autoUnlockKeys: ['海底之眼浮现'],
    },
  ],
  badEndings: [
    {
      id: 'be_mi_fjord_gone',
      condition: '暗线 ≥75 且未在女祭司指导下完成封箱仪式',
      narrative:
        '某天清晨，相邻峡湾的人驾船过来，发现你们的整座聚落不见了——长屋还在，火塘的灰尚温，但所有人不在了。海面平静，没有打斗的痕迹。卢恩石全数倒下，朝向大海。萨迦从此多了一段。',
      accelerators: ['未尊重女祭司的建议', '私下尝试开箱', '试图把箱子献祭给传统神祇'],
    },
    {
      id: 'be_mi_skald_legacy',
      condition: '调查员目睹峡湾水变后未做精神分析',
      narrative:
        '调查员活了下来，被族人当作英雄。他/她余生都生活在岸边，每年夏至独自驾船出海一日。某年，他/她没回来。十年后，某个年轻吟游诗人在远方的酒馆里听到一段从未听过的萨迦，主人公的名字正是你的调查员。萨迦的结尾说：「他没有死，他只是去了能见到那位母亲的地方。」',
      accelerators: ['长时间凝视峡湾水面', '独自抚摸符文木箱', '在出海时哼唱东方旋律'],
    },
  ],
  authorNotes:
    '基调：「萨迦时代的人面对神话不是惊讶，而是熟悉。」氛围应该是冷峻、克制、宿命的。NPC 的台词可参考古诺尔斯萨迦——直白、简短、带格律感。',
  schemaVersion: 1,
  createdAt: 0,
  updatedAt: 0,
};

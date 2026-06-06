// 克苏鲁伊卡洛斯 · 木卫二静默 — 近未来太空殖民
// 源: COCExtends.pdf 第 7 章「克苏鲁伊卡洛斯」
import type { ScenarioDoc } from '../../types/scenario';

export const SCENARIO_ICARUS: ScenarioDoc = {
  id: 'sc-icarus',
  builtin: true,
  meta: {
    name: '克苏鲁伊卡洛斯 · 木卫二静默',
    type: '调查',
    durationHint: '3-5h',
    difficulty: 4,
    headcountHint: '3-5 调查员',
    sanLossHint: '极高',
    blurb: '远在木卫二冰下的「伊卡洛斯」科研站突然中止了所有通讯。地球派出的最近一艘船需要七十八天抵达，你们是该船的全部船员。',
    coverEmoji: '☄',
  },
  prologueSeed: `飞船「珀耳塞福涅」号已经在木星轨道运行了三天，所有引擎熄火，只剩下温和的人工重力嗡鸣。伊卡洛斯站位于木卫二冰壳之下约 2 公里，是 21 世纪末人类向太阳系外行星生命搜索的旗舰项目——直到 78 天前它停止了所有上行通讯。

最后一份完整下行数据是一段 17 秒的录音，主要内容是冷却泵的运行噪声，但在录音第 12 秒处，有一声非机械、非人声、非任何已知动物的低吟。AI 反复扫描后将该段标记为「可能为录音器故障」。

地球总部把这次救援交给你们。临行前，项目首席科学家把一只保险盒交给你们的船长，封条上写着：「只有在站内全员视为已死的情况下，方可打开。」

「珀耳塞福涅」号的减速曲线已经开始。木卫二在舱窗外是一颗结冰的、布满纹理的橙白色珍珠。十二小时后，你们将进入站内气闸。`,
  recommendedSkills: [
    '操作重型机械',
    '电子学',
    '计算机使用',
    '科学(天体物理/生物)',
    '驾驶(航天器)',
    '医学',
    '克苏鲁神话',
    '聆听',
    '急救',
  ],
  recommendedOccupations: ['太空船长', '工程师', '科学家', '医师', '安全官', 'AI 专家', '星际海军'],
  characters: [],
  entries: [
    {
      id: 'e_ic_station',
      category: '地点',
      comment: '伊卡洛斯站',
      keys: '伊卡洛斯, 木卫二, 冰下基地',
      content:
        '位于木卫二冰壳下 2 公里、模块化结构的科研基地。主要包括气闸 / 实验室 / 居住舱 / 反应堆室 / AI 节点 / 冰下采样井。全员定员 24 人，电力来自小型聚变堆，水循环来自冰层取样。',
      constant: true,
      position: 0,
      priority: 10,
      cachePolicy: 'static_prefix',
    },
    {
      id: 'e_ic_well',
      category: '地点',
      comment: '冰下采样井',
      keys: '采样井, 井道, 海',
      content:
        '基地中央向下钻入冰层 1.8 公里的圆形通道，井底通向木卫二地下液态海。井道内壁结有奇异的菱形冰晶，光线在其中折射成多重影子。\n<% if (getvar(\'剧情.已解锁.井下之物\') === \'true\') { %>\n井底海水中并非「没有生命」——它有一种远比鲸类大的智慧体存在，且这种存在与地球神话记载中某尊「水中的旧神」的描述完全一致。基地的探针在数月前已经被它「注意到」。\n<% } %>',
      constant: false,
      position: 0,
      priority: 35,
      cachePolicy: 'dynamic_suffix',
    },
    {
      id: 'e_ic_ai',
      category: '人物',
      comment: 'AI 「赫斯提亚」',
      keys: 'AI, 赫斯提亚, Hestia',
      content:
        '负责伊卡洛斯站的人工智能。语音温和、女性化、礼貌。设计初衷是助理与系统管理；权限受限，无法主动结束人类生命。事件发生后，她仍在运作，但回答某些问题时会进入一种「缓存式重复」状态。',
      constant: false,
      position: 0,
      priority: 40,
      cachePolicy: 'auto',
    },
    {
      id: 'e_ic_cult',
      category: '势力',
      comment: '深井研究组',
      keys: '研究组, 深井派, 内部',
      content:
        '基地内 24 人中有 6 位组成的非官方小组，长期主张「应当向井底主动发送信号」。他们的研究论文里反复出现一些在公开数据库里找不到的引用——一些 18-19 世纪海上失踪船只的航海日志，以及一份未公开的洛夫克拉夫特书信。',
      constant: false,
      position: 0,
      priority: 30,
      cachePolicy: 'auto',
    },
    {
      id: 'e_ic_recording',
      category: '物品线索',
      comment: '最后 17 秒录音',
      keys: '录音, 17 秒, 低吟',
      content:
        '基地最后下行的完整数据。前 11 秒为冷却泵噪声，第 12 秒出现一声非机械低吟，持续约 1.4 秒，频率覆盖 18Hz 至 220Hz。AI 标记为「可能录音故障」。在飞行途中放慢倍速听，能听出低吟其实是一段「短句」，但语种不可识别。',
      constant: false,
      position: 0,
      priority: 50,
      cachePolicy: 'static_prefix',
    },
    {
      id: 'e_ic_dark_thread',
      category: '暗线',
      comment: '井底之物的注意力',
      keys: '井底, 注意力, 旧神',
      content:
        '基地的钻探已经持续了三年；最近一年它的探针频率与地球海洋数千年来吟唱克苏鲁神话的某些祭祀节奏接近。井下之物长期听到这种「呼喊」，最近终于回应。它的回应方式不是上浮——是把整个基地慢慢「拉」入它的精神视野，让基地内的人逐一被「指认」。被指认者的最终结局是：成为它在地球以外的第一个传教站。',
      constant: false,
      position: 0,
      priority: 60,
      cachePolicy: 'auto',
      hidden: true,
    },
    {
      id: 'e_ic_unlock_well',
      category: '秘密与解锁',
      comment: '深层秘密 · 井下之物',
      keys: '井下之物',
      content: '玩家若亲自下到采样井 1 公里以下，或获取深井研究组的真正档案，解锁此键。',
      constant: false,
      position: 0,
      priority: 5,
      cachePolicy: 'static_prefix',
      hidden: true,
    },
  ],
  darkTimeline: [
    {
      id: 'dp_ic_1',
      threshold: 0,
      title: '初入基地',
      triggers: ['气闸内仍有充足氧气', '广播系统持续播放古典乐', '生命迹象传感器显示部分舱内有人', '光照不规则闪烁'],
      directorNote: '基地表面正常但「不对」。让玩家慢慢拼出真相。',
      autoUnlockKeys: [],
    },
    {
      id: 'dp_ic_2',
      threshold: 25,
      title: '失语的活人',
      triggers: ['发现活着的科学家但他/她不开口', '冷藏舱里整齐摆放着不可解释的物品', 'AI 赫斯提亚开始进入缓存式回答', '冰下传来低频震动'],
      directorNote: '基地内还有活人，但他/她已经不能说话。这是关键 NPC 与玩家的第一次正式接触。',
      autoUnlockKeys: ['失语者已存'],
    },
    {
      id: 'dp_ic_3',
      threshold: 50,
      title: '井下的呼唤',
      triggers: ['玩家的视听设备开始出现 17 秒录音的同段重播', '井道菱形冰晶在玩家路过时同步变换', '同行船员中开始有人「沉默」', '赫斯提亚的语音出现性别错乱'],
      directorNote: '威胁开始作用于玩家自己。每个玩家都会在某个时间收到「指认」——一种非言语的提示，告诉他/她「你已被注意到」。',
      autoUnlockKeys: ['井下之物'],
    },
    {
      id: 'dp_ic_4',
      threshold: 75,
      title: '基地的同步',
      triggers: ['通讯系统所有电波都被同一段低吟覆盖', '冰下海面上隆起一道阴影', '反应堆开始无故运作', '玩家中有人开始下意识唱出 17 秒录音'],
      directorNote: '基地正在被改造为「神龛」。最后阻止方式：要么核爆反应堆把整个基地连同井送回冰下，要么找到「保险盒」里的方案。',
      autoUnlockKeys: ['基地同步'],
    },
  ],
  badEndings: [
    {
      id: 'be_ic_outpost',
      condition: '暗线 ≥75 且基地未被销毁',
      narrative:
        '「珀耳塞福涅」号按计划返航。返航过程中，船上的人逐一停止说话——他们没有死，他们仍能正常工作，只是不再发声。78 天后船抵达地球。海关检疫无法判定异常。半年内，地球海洋开始出现一些过去从未出现的「不可见船只」与冰下低频回声。地球的第一个「外星教区」开张了，传教士是你们。',
      accelerators: ['未触发反应堆自毁', '与深井研究组达成妥协', '下井超过 1.5 公里且未做精神分析'],
    },
    {
      id: 'be_ic_personal_outpost',
      condition: '调查员长期接触 17 秒录音且未做精神分析',
      narrative:
        '调查员在返航途中开始夜夜哼唱那 17 秒中的某段。其他船员请医师介入，医师无能为力。回到地球后，调查员被安置在一处偏远的疗养院。某天夜里，疗养院附近的小池塘里出现了一段他/她从未见过的菱形冰晶。',
      accelerators: ['反复回放录音', '独自下井', '与赫斯提亚私下长谈'],
    },
  ],
  authorNotes:
    '基调：「太空中的孤立 + 旧神 = 无处可逃」。建议守秘人多用 AI 缓存式语言、低频音、菱形冰晶的反复出现来制造迫近感。本剧本可作单场高强度奔袭，也可拆作连载。',
  schemaVersion: 1,
  createdAt: 0,
  updatedAt: 0,
};

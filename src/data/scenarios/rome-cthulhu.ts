// 克苏鲁不败 · 罗马阴影 — 古罗马时代背景下的神话调查
// 源: COCExtends.pdf 第 1 章「克苏鲁不败」(原 Chaosium《Cthulhu Invictus》设定集摘要)
import type { ScenarioDoc } from '../../types/scenario';

export const SCENARIO_ROME_CTHULHU: ScenarioDoc = {
  id: 'sc-rome-cthulhu',
  builtin: true,
  meta: {
    name: '克苏鲁不败 · 罗马阴影',
    type: '混合',
    durationHint: '3-5h',
    difficulty: 3,
    headcountHint: '2-4 调查员',
    sanLossHint: '高',
    blurb: '军团之鹰所及之处，旧神残骸仍在沙土与海水之下蠕动。一段被史官删去的远征报告，可能是帝国陨落的前奏。',
    coverEmoji: '🏛',
  },
  prologueSeed: `沿着维亚·阿庇亚大道一路向南，泥土与马蹄声从城外铺到城内。你的肩上挂着一卷被火漆封住的羊皮，这是元老院某位评议员递到你手中的差事——查一桩发生在新征服外省的怪事：一支驻防的军团一夜之间集体疯狂，幸存者写下的报告里全是不可名状的低语与黑色海水。

罗马城内的酒馆里，水手谈论着海面之下蜷曲伸出的爪子；学者们围着一卷据说来自非洲的卷轴争论不休；灶神殿外，年长的维斯塔圣女悄悄叮嘱新到的少女——你们守护的不只是火焰，更是某种不能让它走出阴影的东西。

夜半时分，远处神庙的铜铃自鸣，街角的影子在油灯尚未点燃时已经移动起来。元老院的密令、市井的流言、神庙的禁忌——它们指向同一处。你必须决定从哪里开始。`,
  recommendedSkills: [
    '拉丁语',
    '希腊语',
    '历史',
    '克苏鲁神话',
    '侦查',
    '聆听',
    '格斗(短剑)',
    '神秘学',
    '说服',
  ],
  recommendedOccupations: ['百夫长', '军团士兵', '学者', '元老院评议员', '神官', '角斗士', '医师'],
  characters: [],
  entries: [
    {
      id: 'e_rome_city',
      category: '地点',
      comment: '罗马城',
      keys: '罗马, 罗马城, 七丘, Rome',
      content:
        '罗马城——七丘环抱、台伯河横贯的帝国心脏。元老院、神庙群、广场与角斗场在白日里光彩耀人，夜晚则被无数神祇的低声呢喃覆盖。城中阶级分明：贵族在帕拉蒂尼山的别墅里议事，平民拥挤在苏布拉的廉租楼里，奴隶在公共浴场与厨房间穿行。各种宗教在此并存，从主神朱庇特到密斯神祭、奥利西斯、巴尔等异邦神，外乡崇拜的暗流一直在涌动。',
      constant: true,
      position: 0,
      priority: 10,
      cachePolicy: 'static_prefix',
    },
    {
      id: 'e_rome_vesta',
      category: '地点',
      comment: '灶神维斯塔神殿',
      keys: '维斯塔, 灶神, 圣火, 圣女, Vesta',
      content:
        '罗马广场北侧的圆形小神殿，殿内圣火由维斯塔圣女轮班看守，永不熄灭。罗马人相信只要圣火不灭，城市便不会陷落。圣女由六位贵族少女担任，必须守身三十年；任何违例都将被活埋于地下。\n<% if (getvar(\'剧情.已解锁.维斯塔真相\') === \'true\') { %>\n圣火并非象征意义上的国运护符——它实际封印着深埋于神殿地基下的一只「沉睡之物」。每代圣女轮班实质上是一种维持封印的仪式；圣女的纯洁是封印的条件之一，违例不仅是宗教罪，更会让封印松动。\n<% } %>',
      constant: false,
      position: 0,
      priority: 30,
      cachePolicy: 'dynamic_suffix',
    },
    {
      id: 'e_rome_senate_envoy',
      category: '人物',
      comment: '元老院评议员·提图斯',
      keys: '提图斯, Titus, 评议员, 元老院',
      content:
        '中年贵族，举止从容，谈吐温和，对你颇为礼遇。他是这次差事的委托人，自称只是「为元老院打听一桩边境怪事」。袍下挂着一只刻有古老符号的护身铜符，与他的家族纹章并不相符。\n<% if (getvar(\'剧情.已解锁.提图斯真面目\') === \'true\') { %>\n他是某个跨代相传的密教成员，家族世代为某尊「未被罗马诸神收编的旧神」服务。他派出调查员表面上是查清边境怪事，实际是想确认那只在外省苏醒的东西是否能为他所用。\n<% } %>',
      constant: false,
      position: 0,
      priority: 40,
      cachePolicy: 'dynamic_suffix',
    },
    {
      id: 'e_rome_cult_bacchus',
      category: '势力',
      comment: '巴克斯密仪会',
      keys: '巴克斯, 密仪, 酒神, Bacchanalia',
      content:
        '在罗马已被官方限制多年的酒神密仪，至今仍在城外洞穴与贵族别墅中秘密举行。表面上是醉酒狂欢，实际涉及更古老的祭祀传统。会内成员遍布罗马上下层，互相以暗号相认。',
      constant: false,
      position: 0,
      priority: 25,
      cachePolicy: 'auto',
    },
    {
      id: 'e_rome_legion_report',
      category: '物品线索',
      comment: '边境军团失事报告',
      keys: '军团报告, 边境, 失事, 羊皮',
      content:
        '一卷被火漆封住的羊皮，火漆纹章属于第九「西班牙」军团。展开后是用粗糙拉丁文写就的紧急报告：「夜半第三更，沙下涌出影。先饮人血，后入人心。同袍以剑刺之，剑过如水。求救于诸神，诸神缄默。我等仅存十二人，写此后即走山道返。」附图：一种螺旋状黑色印记，状如缠绕的触手。',
      constant: false,
      position: 0,
      priority: 50,
      cachePolicy: 'static_prefix',
    },
    {
      id: 'e_rome_dark_thread',
      category: '暗线',
      comment: '沙下的旧神',
      keys: '旧神, 沙下, 沉睡',
      content:
        '在罗马征服的过程中，军团踏过了不少远古文明的废墟与坟茔。某个被埋葬在帕提亚边境沙漠下的存在，已经被无意中惊扰；它正缓慢地把意识向西延伸，沿着罗马的道路渗回罗马城本身。它的目标不是毁灭帝国，而是借帝国的秩序复活自己的祭祀网络。',
      constant: false,
      position: 0,
      priority: 60,
      cachePolicy: 'auto',
      hidden: true,
    },
    {
      id: 'e_rome_unlock_temple',
      category: '秘密与解锁',
      comment: '深层秘密 · 维斯塔封印',
      keys: '维斯塔真相, 圣火封印',
      content:
        '在地下三层、众多甬道之中，有一处常年阴冷的小室，墙上刻着比罗马本身更古老的符号。这里就是封印实物所在。无论谁亲自下到此处，应立即解锁「维斯塔真相」。',
      constant: false,
      position: 0,
      priority: 5,
      cachePolicy: 'static_prefix',
      hidden: true,
    },
  ],
  darkTimeline: [
    {
      id: 'dp_rome_1',
      threshold: 0,
      title: '边境流言',
      triggers: ['军营内饮酒过量', '城外农户报失牲畜', '商队晚归', '神殿铜铃自鸣一次'],
      directorNote:
        '阶段早期，威胁停留在边境的传闻里。罗马城内秩序依旧，但敏感的人物已经在悄悄做准备。流言可以包装为军团情报、商队怪谈、神官夜间不安。',
      autoUnlockKeys: [],
    },
    {
      id: 'dp_rome_2',
      threshold: 25,
      title: '阴影抵罗马',
      triggers: ['台伯河水夜间发黑', '夜间在罗马城内闻到海腥味', 'NPC 做同一个噩梦', '维斯塔圣女中有人焦躁不安'],
      directorNote:
        '阴影沿道路抵达罗马城。常人开始感到不适，敏锐者察觉异常。此阶段建议在叙事中插入身体性的诡异——皮肤忽冷、影子比身体迟一拍、镜面反射延迟等。',
      autoUnlockKeys: ['罗马阴影抵城'],
    },
    {
      id: 'dp_rome_3',
      threshold: 50,
      title: '密教浮现',
      triggers: ['元老院成员行为反常', '巴克斯密仪规模扩大', '街市出现外来祭品', '官员公开声援异教崇拜'],
      directorNote:
        '城内秘密崇拜的网络开始浮上水面。原本互不相识的旧神信徒在罗马上层悄悄串联，准备一场公开化的仪式。守秘人可让 NPC 对调查员暗中招揽或公开威胁。',
      autoUnlockKeys: ['密教浮现'],
    },
    {
      id: 'dp_rome_4',
      threshold: 75,
      title: '圣火动摇',
      triggers: ['维斯塔神殿圣火忽明忽暗', '地震', '罗马城上空持续阴霾', '神官集体噤声'],
      directorNote:
        '封印开始松动。调查员若未阻止前阶段，城市本身将开始为旧神所用。可以在此阶段安排关键 NPC 暴露身份、被夺舍或殉道。',
      autoUnlockKeys: ['圣火动摇'],
    },
    {
      id: 'dp_rome_5',
      threshold: 95,
      title: '旧神临世',
      triggers: ['圣火熄灭', '罗马城七座神殿同时倒塌', '元老院所有议员行为同步化', '太阳被遮蔽数日'],
      directorNote:
        '封印破解，旧神意志彻底覆盖罗马城。此阶段是结局回合，调查员的所有选择只决定如何死、为谁死。',
      autoUnlockKeys: ['旧神临世'],
    },
  ],
  badEndings: [
    {
      id: 'be_rome_empire_falls',
      condition: '暗线进度 ≥95 且玩家未阻止圣火熄灭',
      narrative:
        '圣火熄灭的当夜，罗马城笼罩在前所未有的死寂之中。元老院议事厅的座椅上，七十名议员同时睁开眼，眼神空洞且整齐如刻——他们已不再属于自己。第二天，元老院通过了一道前所未有的法令：将所有外省的神祇并入帝国主神，罗马诸神改名归位。帝国的疆界继续扩大，但每一座征服的城市都成为某尊不可言说之物的祭坛。调查员的名字被史官从档案中抹去——他们死于一场「不曾发生的瘟疫」。',
      accelerators: ['公开揭发未准备充分', '与提图斯达成妥协', '亲手熄灭圣火以求秩序', '阅读边境军团失事报告而未做检定'],
    },
    {
      id: 'be_rome_personal_doom',
      condition: '调查员 SAN ≤10 或永久疯狂',
      narrative:
        '调查员在某个深夜独自走回元老院广场。维斯塔神殿前的圣火静静燃烧，但调查员看见的不是火——是黑色的潮水。他/她平静地脱下袍子，走入圣火之中。次日，神殿地砖上多了一道盘绕的螺旋焦痕，与边境军团羊皮上画的那一种一模一样。',
      accelerators: ['多次直面神话生物未做精神分析', '反复阅读异教典籍', '与提图斯单独会面超过两次'],
    },
  ],
  authorNotes:
    '基调：「文明的秩序与远古的混沌正面相撞，但秩序未必能赢」。建议守秘人多用罗马式的庄重词汇与拉丁短句作氛围。NPC 的死亡可以是优雅的、合礼的——这与他们所面对的恐怖形成强烈反差。',
  schemaVersion: 1,
  createdAt: 0,
  updatedAt: 0,
};

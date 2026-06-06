// 幻梦境 · 失语者的梦 — 洛夫克拉夫特梦之国度
// 源: COCExtends.pdf 第 6 章「幻梦境」
import type { ScenarioDoc } from '../../types/scenario';

export const SCENARIO_DREAMLANDS: ScenarioDoc = {
  id: 'sc-dreamlands',
  builtin: true,
  meta: {
    name: '幻梦境 · 失语者的梦',
    type: '剧本',
    durationHint: '3-5h',
    difficulty: 3,
    headcountHint: '1-3 调查员',
    sanLossHint: '中',
    blurb: '你认识的一位老朋友陷入了无法唤醒的梦。医生束手无策，但他枕边的纸条上写着一句你认得的诗——出自洛夫克拉夫特从未出版的一封信。',
    coverEmoji: '☾',
  },
  prologueSeed: `你的朋友躺在床上，呼吸均匀，眼睛偶尔在眼皮下转动。家属请来的医生说不出是什么病：他/她没有外伤，没有中毒，没有脑部异常的可见迹象，只是不能被唤醒。整整七十二小时。

枕边的小纸条已经皱巴巴了。你认得那行字——它出自一封从未公开发表的旧信里，写信人用一种轻巧的口吻提到「七十层石阶之下的国度」。你最后一次听人引用这行字，是十年前一位上吊死去的诗人。

你坐在床边，握住朋友的手。他/她的指甲缝里夹着一点细白沙——可你们这附近没有沙滩。

你决定试一试一种旧方法：用毛巾蒙住眼，专注于一首被传抄了上百年的童谣，去他/她梦里把他/她带回来。`,
  recommendedSkills: [
    '梦境知识',
    '克苏鲁神话',
    '神秘学',
    '导航',
    '航海',
    '语言(古东方语)',
    '聆听',
    '说服',
    '心理学',
  ],
  recommendedOccupations: ['梦行者', '学者', '诗人', '猫语者', '水手', '神秘学家'],
  characters: [],
  entries: [
    {
      id: 'e_dr_seventysteps',
      category: '地点',
      comment: '深眠七十石阶',
      keys: '七十石阶, 深眠, 入口',
      content:
        '入梦者从这里开始下降。石阶共七十级，每一级都比上一级更冷。阶旁可能出现你这辈子去过又遗忘的地方的影子。下到最后一级时，你已经在「幻梦境」。',
      constant: true,
      position: 0,
      priority: 10,
      cachePolicy: 'static_prefix',
    },
    {
      id: 'e_dr_ulthar',
      category: '地点',
      comment: '乌尔塔尔的猫',
      keys: '乌尔塔尔, Ulthar, 猫',
      content:
        '幻梦境著名小镇，有一条古老法律——任何人都不得伤害猫。猫在此地拥有较高的智慧与社会地位，是连接幻梦境与人间最可靠的引路者。\n<% if (getvar(\'剧情.已解锁.猫语\') === \'true\') { %>\n猫不止「能听懂」，它们还能精确告诉入梦者哪一些路径已经被「东方的某物」污染。一只乌尔塔尔的猫若愿意带路，胜过你自己读十本旅行家手记。\n<% } %>',
      constant: false,
      position: 0,
      priority: 30,
      cachePolicy: 'dynamic_suffix',
    },
    {
      id: 'e_dr_dreamer',
      category: '人物',
      comment: '老朋友(梦中)',
      keys: '朋友, 失语者, 梦中',
      content:
        '在现实里他/她无法被唤醒；在幻梦境里他/她出现在你看到他/她最后一次开口的地方，但一句话也不说。神情平静，眼神空洞。他/她身边总会有一只非乌尔塔尔的猫——颜色不对，眼神不对。',
      constant: false,
      position: 0,
      priority: 40,
      cachePolicy: 'auto',
    },
    {
      id: 'e_dr_cat_court',
      category: '势力',
      comment: '幻梦境猫之公议',
      keys: '猫, 公议, 法庭',
      content:
        '幻梦境的猫有自己的「公议」，在月相合适的时候召开。任何入梦者只要尊重它们，可以申请陪听。公议讨论的是「梦境的常态」是否被破坏；近来它们的议题一直是同一个：东方有不该属于这里的存在在做某种事情。',
      constant: false,
      position: 0,
      priority: 25,
      cachePolicy: 'auto',
    },
    {
      id: 'e_dr_sand',
      category: '物品线索',
      comment: '指甲缝的白沙',
      keys: '白沙, 指甲',
      content:
        '你朋友指甲缝里的细白沙，化学上是普通石英砂，但在幻梦境里能用来「定位」他/她最后停留之处——把沙倒在水面上，沙不会沉，而是缓慢漂向你应该前往的方向。',
      constant: false,
      position: 0,
      priority: 50,
      cachePolicy: 'static_prefix',
    },
    {
      id: 'e_dr_dark_thread',
      category: '暗线',
      comment: '梦的吞噬',
      keys: '梦的吞噬, 东方',
      content:
        '幻梦境的东方边境，正在被一种「无形之物」缓慢吞噬。它本身不属于幻梦境的体系，是从更外侧的「外宇宙梦境」渗透进来的。它选择以普通入梦者为食——那些恰好做了一个不太普通的梦的人。你的朋友只是它最近的一位「食物」。',
      constant: false,
      position: 0,
      priority: 60,
      cachePolicy: 'auto',
      hidden: true,
    },
    {
      id: 'e_dr_unlock_cats',
      category: '秘密与解锁',
      comment: '深层秘密 · 猫语',
      keys: '猫语',
      content: '玩家若在乌尔塔尔通过「话术」或「神秘学」检定与猫交流成功，解锁此键。',
      constant: false,
      position: 0,
      priority: 5,
      cachePolicy: 'static_prefix',
      hidden: true,
    },
  ],
  darkTimeline: [
    {
      id: 'dp_dr_1',
      threshold: 0,
      title: '入梦初期',
      triggers: ['梦境逻辑还接近现实', '感官部分迟缓', '能看到自己年少时的影子', '风向永远朝东'],
      directorNote: '让玩家适应幻梦境的规则——记忆比物理重要，诗意比逻辑可靠。',
      autoUnlockKeys: [],
    },
    {
      id: 'dp_dr_2',
      threshold: 25,
      title: '猫之公议',
      triggers: ['乌尔塔尔出现集体警觉', '夜里猫成群盯着同一方向', '调查员收到来自猫的「口讯」', '月亮位置错乱'],
      directorNote: '幻梦境的常态居民开始正式接触玩家。这是获得情报与盟友的最佳窗口。',
      autoUnlockKeys: ['猫语'],
    },
    {
      id: 'dp_dr_3',
      threshold: 50,
      title: '东方边境',
      triggers: ['白沙走得越来越急', '路上其他入梦者不再回应', '空气出现「咸」味', '同行的猫开始紧张'],
      directorNote: '调查员接近事件中心。每一步都伴随小幅 SAN 损失。',
      autoUnlockKeys: ['东方边境'],
    },
    {
      id: 'dp_dr_4',
      threshold: 75,
      title: '失语者之处',
      triggers: ['白沙水面不再有波纹', '听见「同步的呼吸声」', '朋友出现在你面前但不说话', '幻梦境的天空开始裂开'],
      directorNote: '最终对话场景。带朋友回家的代价可能不是没有的——是否愿意自己留下来换他/她出去，是这一剧本的核心抉择。',
      autoUnlockKeys: ['失语者之处'],
    },
  ],
  badEndings: [
    {
      id: 'be_dr_devoured',
      condition: '暗线 ≥75 且玩家未发现可替代品',
      narrative:
        '调查员既未能把朋友救回，也未能自己脱身。他/她的肉身在现实里仍然睡着；幻梦境里他/她和那位朋友坐在白沙边，并排沉默。后世的入梦者偶尔会在那里看见他们两位，相视一笑，仍不说话。',
      accelerators: ['冒进东方边境', '拒绝猫的劝阻', '执意单独行动'],
    },
    {
      id: 'be_dr_word_loss',
      condition: '调查员在幻梦境累计 SAN 损失 >25 且回到现实',
      narrative:
        '调查员从梦里醒来，朋友也醒了。两个人都平安，但有一件事不再相同——调查员从此再也无法说出某些词。哪些词不一定，每天都在变。最后他/她在一本日记里写道：「最近发现自己再也不能说出一种花的名字了。我并不难过，但希望以后也能想起它。」',
      accelerators: ['硬扛 SAN 检定', '尝试反复进入幻梦境', '与「无形之物」对话'],
    },
  ],
  authorNotes:
    '基调：「幻梦境是一种宽广而温柔的恐怖」。建议守秘人在叙事里大量使用诗化语言，不要太怕逻辑断裂；剧本可作单人或小队入梦使用。猫是玩家最可靠的盟友，请慷慨地让它们帮忙。',
  schemaVersion: 1,
  createdAt: 0,
  updatedAt: 0,
};

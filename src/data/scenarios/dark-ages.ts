// 克苏鲁黑暗时代 · 修道院的低语 — 中世纪欧洲背景下的神话调查
// 源: COCExtends.pdf 第 2 章「克苏鲁黑暗时代」
import type { ScenarioDoc } from '../../types/scenario';

export const SCENARIO_DARK_AGES: ScenarioDoc = {
  id: 'sc-dark-ages',
  builtin: true,
  meta: {
    name: '克苏鲁黑暗时代 · 修道院的低语',
    type: '调查',
    durationHint: '3-5h',
    difficulty: 3,
    headcountHint: '2-4 调查员',
    sanLossHint: '高',
    blurb: '森林里的小修道院抄写着一卷不属于任何已知传统的羊皮书。当抄写室里的烛火日复一日比前一天矮一截时，主教终于下令派人调查。',
    coverEmoji: '✠',
  },
  prologueSeed: `远离任何大城市，浓雾笼罩的山谷深处，圣安博修道院已经在抄写一卷「来自南方」的羊皮书三个月了。主教派你来，并不是因为他懂得那卷书是什么，而是因为修道院抄写室里的死人逐渐多了起来——昨日那位老修士的尸体被发现伏在书案上，手中还握着鹅毛笔，墨水画出的最后一行字，没有任何认识拉丁文或希腊文的人能读懂。

修道院长是个上了年纪、目光浑浊的本笃会修士，他对你的到来既不欢迎也不抗拒。他给你看的房间，墙壁渗着水汽。窗外的森林安静得令人不安——没有夜鸟，没有狼嚎，只有偶尔像金属互磨的低响。

农民们传言森林里有一座旧异教祭坛，传言归传言；但你下榻第一夜便被同一段梦反复惊醒：你站在一卷羊皮书前，自己的手在不受控制地抄写一行不认识的字。`,
  recommendedSkills: [
    '拉丁语',
    '神秘学',
    '医学',
    '克苏鲁神话',
    '聆听',
    '侦查',
    '急救',
    '格斗(剑/斧)',
    '说服',
  ],
  recommendedOccupations: ['修士', '骑士', '吟游诗人', '猎人', '医者', '巫医', '游侠'],
  characters: [],
  entries: [
    {
      id: 'e_da_monastery',
      category: '地点',
      comment: '圣安博修道院',
      keys: '修道院, 圣安博, Sankt Ambrosius',
      content:
        '由石与木建造的小型本笃会修道院，孤立于山谷深处。主体建筑包括小教堂、抄写室、食堂、回廊与修士寝舍；地下有酒窖、储藏室与早已尘封的「老地下室」。修道院依靠村民的捐赠和自给自足的菜园维持。',
      constant: true,
      position: 0,
      priority: 10,
      cachePolicy: 'static_prefix',
    },
    {
      id: 'e_da_scriptorium',
      category: '地点',
      comment: '抄写室',
      keys: '抄写室, 羊皮书, 鹅毛笔',
      content:
        '修道院二楼最大的房间，长桌一字排开，烛台林立。墙边架上摆放着各种墨水瓶、羽毛笔、刮刀。空气中长年弥漫羊皮、墨水与蜡的气味。\n<% if (getvar(\'剧情.已解锁.抄写室真相\') === \'true\') { %>\n这间屋子的木地板在多年的抄写中被墨水浸透，木纹间渗出隐约的图案——如果在月光下俯视，能辨认出与那卷被抄写的「南方羊皮」相同的螺旋符号。抄写室自身已经被那卷书改造为一个低强度的祭坛。\n<% } %>',
      constant: false,
      position: 0,
      priority: 30,
      cachePolicy: 'dynamic_suffix',
    },
    {
      id: 'e_da_abbot',
      category: '人物',
      comment: '修道院长·赫尔曼',
      keys: '赫尔曼, Hermann, 修道院长',
      content:
        '本笃会老修士，年逾六十，背微驼，目光浑浊。说话用带浓重萨克森口音的低地拉丁语。对调查员的态度礼貌而疏远，回答问题时常常顿一顿，像是从遥远的地方把思绪拽回来。\n<% if (getvar(\'剧情.已解锁.赫尔曼真面目\') === \'true\') { %>\n他已经被那卷羊皮书的内容侵蚀，意识与「书中所记之物」共存。表面的疏远是因为他正在挣扎——他知道事情不对，却既舍不得停止抄写，也无力主动求救。\n<% } %>',
      constant: false,
      position: 0,
      priority: 40,
      cachePolicy: 'dynamic_suffix',
    },
    {
      id: 'e_da_pagans',
      category: '势力',
      comment: '森林异教残党',
      keys: '异教, 森林祭坛, 老信仰',
      content:
        '基督教化之前的「老信仰」并未完全消亡，零星残党仍在森林深处维护着祖先的祭坛。他们对修道院心情复杂——既敌对（因被压制），又同情（因目睹同一种威胁）。某些异教长老知道羊皮书里写的是什么，但他们不会主动告诉教会的人。',
      constant: false,
      position: 0,
      priority: 25,
      cachePolicy: 'auto',
    },
    {
      id: 'e_da_palimpsest',
      category: '物品线索',
      comment: '「南方羊皮」',
      keys: '南方羊皮, 羊皮书, 卷轴',
      content:
        '一卷用未知文字写就的厚实羊皮卷，宽逾常规一倍。每一页的边缘都画着同一种螺旋符号。卷轴的来源被记为「自南方修道院辗转送来」，但当被追问送来者的姓名时，主教档案里只有一行被涂改的字。\n<% if (getvar(\'剧情.已解锁.羊皮书源头\') === \'true\') { %>\n这卷羊皮的原本来自更东方——某个征战中被掩埋的远古图书馆，由一队拜占庭商队转运至意大利，再被某种方式辗转至本修道院。沿途多个抄写所都因抄写它而出事，被悄悄关闭。\n<% } %>',
      constant: false,
      position: 0,
      priority: 50,
      cachePolicy: 'dynamic_suffix',
    },
    {
      id: 'e_da_dark_thread',
      category: '暗线',
      comment: '羊皮书的复制意志',
      keys: '羊皮书, 复制, 意志',
      content:
        '那卷羊皮书并非单纯的文献。它是一种用文字形式存在的「神话存在」——每被抄写一次，存在就增加一份现实重量。它的目标是让自己被尽可能多地抄写出去，最终通过文字网络在人间显形。修道院只是它的第一个宿主。',
      constant: false,
      position: 0,
      priority: 60,
      cachePolicy: 'auto',
      hidden: true,
    },
    {
      id: 'e_da_unlock_origin',
      category: '秘密与解锁',
      comment: '深层秘密 · 羊皮书源头',
      keys: '羊皮书源头, 拜占庭, 商队',
      content:
        '若调查员通过教会档案、商队信件或异教长老口述发现那卷羊皮的真实来源（拜占庭东方商队，可追溯至某座被埋没的图书馆），立刻解锁此键。',
      constant: false,
      position: 0,
      priority: 5,
      cachePolicy: 'static_prefix',
      hidden: true,
    },
  ],
  darkTimeline: [
    {
      id: 'dp_da_1',
      threshold: 0,
      title: '抄写室的烛',
      triggers: ['抄写室烛火日渐变矮', '修士在睡梦中喃喃听不懂的字', '夜间能听见远处森林中有金属互磨声', '修道院厨房牛奶变酸更快'],
      directorNote: '让玩家感到环境正在变小、变冷、变安静。怪事尚未对人造成直接伤害，但累积起来令人神经紧绷。',
      autoUnlockKeys: [],
    },
    {
      id: 'dp_da_2',
      threshold: 25,
      title: '抄写者的疯',
      triggers: ['有抄写修士反复写同一个符号', '抄写室出现第二具尸体', '主教方面派来询问进度', '森林边缘出现猎人不解的兽迹'],
      directorNote: '威胁开始作用于人。抄写过羊皮书原文超过三日的修士将在 1d4 日内出现幻视、失语或自残倾向。',
      autoUnlockKeys: ['抄写室真相'],
    },
    {
      id: 'dp_da_3',
      threshold: 50,
      title: '复本流出',
      triggers: ['有一份不完整的副本被信使运走', '相邻村庄出现集体噩梦', '森林里异教祭坛重新出现新鲜祭品', '院长行为越来越异常'],
      directorNote: '羊皮书的副本开始传播。即使原本被销毁，复本仍能让事情继续。这是「点不灭」的拐点。',
      autoUnlockKeys: ['赫尔曼真面目'],
    },
    {
      id: 'dp_da_4',
      threshold: 75,
      title: '修道院倒塌',
      triggers: ['抄写室地板的符号已显形', '院长公开宣讲新的「主」', '修道院钟楼自鸣', '夜间能听见地下传来低吟'],
      directorNote: '修道院本身已经成为祭坛。此阶段是反扑窗口——焚毁原本与所有副本是仅剩的胜算之路。',
      autoUnlockKeys: ['修道院倒塌'],
    },
  ],
  badEndings: [
    {
      id: 'be_da_copies_spread',
      condition: '暗线 ≥75 且至少一份完整副本流出修道院',
      narrative:
        '修道院在大火中烧成废墟。教会派来调查的人都说火是「神的清算」。但一年之后，三个相隔千里的修道院开始抄写一卷同样的羊皮书；五年之后，是十二个；十年之后，主教座堂的图书馆里也安静地多出了一份副本。文字一旦被写下，便不再属于写它的人。',
      accelerators: ['让任何副本带出修道院', '与主教汇报时附上抄录片段', '允许信使按计划离开'],
    },
    {
      id: 'be_da_personal_corruption',
      condition: '调查员长期在抄写室停留且 SAN <30',
      narrative:
        '某天清晨，调查员被同伴发现独坐于抄写室，手握鹅毛笔，眼神平静地誊写着那卷书。他/她的字迹与院长晚年留下的相同。',
      accelerators: ['夜间独自留在抄写室', '反复阅读羊皮书原文未做精神分析', '私下临摹页边的螺旋符号'],
    },
  ],
  authorNotes:
    '基调：「信仰庇护不了一切，但有时是仅剩的工具」。建议在叙事中常用钟声、烛影、抄写声作为氛围意象。修道院的清规与混乱的恐怖之间，应保持一种压抑的对比。',
  schemaVersion: 1,
  createdAt: 0,
  updatedAt: 0,
};

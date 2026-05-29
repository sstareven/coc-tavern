import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { LoreBook, LoreEntry } from '../types';
import { createDexieStorage } from '../db/storage';
import { stripFunctions } from '../db/stripFunctions';

const e = (overrides: Partial<LoreEntry>): LoreEntry => ({
  name: '', keys: '', content: '', logic: 'AND', priority: 10,
  disabled: false, constant: false, position: 0, depth: 0, probability: 100,
  ...overrides,
});

export const AUTO_SUMMARY_BOOK_ID = '__auto_summaries';

const defaultBooks: Record<string, LoreBook> = {
  [AUTO_SUMMARY_BOOK_ID]: { name: '剧情回顾 (自动)', enabled: true, entries: {} },
  mvu_rules: { name: 'MVU规则系统', enabled: true, entries: {
    mvu_core: e({ name: 'MVU变量规范', keys: 'MVU, var', logic: 'OR', priority: 1,
      content: '【输出变量】leftContent嵌入<var name=\'hp\' value=\'值\'/> <var name=\'san\' value=\'值\'/> <var name=\'location\' value=\'地点\'/> <var name=\'threat\' value=\'1-10\'/>。选项action含<var name=\'lastAction\' value=\'简述\'/>；检定项额外<var name=\'lastCheck\' value=\'技能名\'/>。使用单引号！' }),
    skill_check: e({ name: 'CoC检定规则', keys: '检定, d100, 大成功', logic: 'OR', priority: 20,
      content: '【CoC 7th检定】成功=d100≤技能，困难≤半值，极难≤1/5，大成功=01，大失败=96-100。有利→奖励骰(双十面取优)，不利→惩罚骰(取差)。\n侦查系：查账→会计学，变装→乔装，查资料→图书馆使用，偷听→聆听，开锁→锁匠，藏东西→妙手，搜证→侦查，暗处→潜行，追迹→追踪，拍照→摄影。\n交涉系：魅力→取悦，欺瞒→话术，威吓→恐吓，辩论→说服，读心→心理学。\n战斗系：近战→格斗(斗殴)，手枪→枪械(手枪)，步枪→枪械(步枪/霰弹枪)。\n运动系：攀爬→攀爬，闪躲→躲闪，跳过沟→跳跃，骑马→骑术，渡水→游泳，扔东西→投掷。\n护理系：止血→急救，治病→医学，心理→精神分析。\n生活系：看文化→人类学，估价→估价，挖遗迹→考古学，创作→艺术与手艺，用电脑→计算机使用Ω，开车→汽车驾驶，修电器→电气维修，修电路→电子学Ω，回想→历史，读外语→语言(其他)，打官司→法律，修机器→机械维修，认动物→博物学，找方向→导航，辨灵异→神秘学，开起重机→操作重型机械，开飞机→驾驶，荒野→生存，炸东西→爆破，邪神知识→克苏鲁神话(掉SAN)。日常无需检定。' }),
    combat: e({ name: '战斗规则', keys: '战斗, 格斗, 闪避', logic: 'OR', priority: 30,
      content: '【CoC战斗】先攻=DEX检定。每轮攻击/闪避/移动。近战→目标可闪避或反击。火器→近距正常、中距困难、远距极难。伤害=武器+DB。HP≤0→昏迷。选项：I攻击 II防御 III撤退 IV特殊，标注检定。' }),
    sanity: e({ name: '理智系统', keys: 'SAN, 理智, 疯狂', logic: 'OR', priority: 40,
      content: '【SAN规则】SAN=POW。损失：尸体0/1D2，怪物0/1D6，大恐怖1D10/1D100。单次≥5→智力检定，失败短期疯狂。SAN≤0→永久疯狂。恢复：完成调查+1D6，精神分析+1D3，休息一月+1D3。' }),

    // ── MVU 变量系统 ──
    mvu_update_rules: e({ name: '[mvu_update]变量更新规则', keys: 'mvu_update, 变量更新', logic: 'OR', priority: 5, constant: true, depth: 0,
      content: `---
变量更新规则:

  调查员:
    生命值.\${当前|最大}:
      type: number
      check:
        - 受到伤害时降低"当前"，恢复时增加，不超过"最大"
        - 重大伤害（超过最大生命值一半）或死亡时更新

    理智值.\${当前|最大}:
      type: number
      check:
        - 遭遇超自然事件、目睹恐怖场景、阅读禁书时降低"当前"
        - 精神分析或长期休息可恢复少量"当前"
        - 单次降低超过5点时触发临时疯狂检定
        - "最大"仅在克苏鲁神话技能提升时降低

    魔法值.\${当前|最大}:
      type: number
      check:
        - 施放法术消耗"当前"，休息恢复
        - "最大"等于 POW/5

    幸运:
      type: number
      range: 0~99
      check:
        - 仅在 GM 要求进行幸运检定时更新
        - 单次变化不超过 ±10
        - 每次使用后自然衰减 1~3

    信用评级:
      type: number
      check:
        - 仅在重大财务变动（继承、破产、高额消费）时更新
        - 一般不会频繁变化

    状态:
      type: |-
        {
          [状态标签: string]: {
            名称: string;
            严重程度: '轻微' | '中等' | '严重' | '致命';
            持续回合: number;
          }
        }
      check:
        - 受伤时添加"受伤"状态，脱离危险后移除
        - 疯狂时添加对应的恐惧症/狂躁症状态
        - 中毒、疾病等异常状态随回合递减持续回合

    物品栏:
      type: |-
        {
          [物品名: string]: {
            描述: string;
            数量: number;
            是否关键物品: boolean;
          }
        }
      check:
        - 拾取或购买时 insert 新物品
        - 使用/丢弃时 remove 或 delta 数量
        - 关键剧情物品标记"是否关键物品: true"

    技能:
      type: |-
        {
          [技能名: string]: {
            基础值: number;
            当前值: number;
            成长标记: boolean;
          }
        }
      check:
        - 在检定中取得大成功（d100=01）时，标记该技能为可成长
        - 任何成功使用过的技能，守秘人均可酌情标记为可成长
        - 幕间成长阶段（每次冒险/章节结束后）：对每个标记的技能投 1D100
        - 若结果 > 当前技能值 → 成长：技能 < 90% 时 +1D10；技能 ≥ 90% 时 +2D6（不超过 99%）
        - 若结果 ≤ 当前技能值 → 不成长，清除标记（"已学到上限"）
        - 克苏鲁神话技能：每次增长时，当前最大 SAN = 99 - 克苏鲁神话值

  世界:
    日期:
      format: YYYY-MM-DD
      check:
        - 每次场景切换或经过明显时间段后更新
        - 保持日期推进合理，与叙事节奏一致

    时间:
      check:
        - 每次行动、移动或对话后推进适当的时间
        - 格式：清晨/上午/午后/黄昏/夜晚/深夜

    天气:
      check:
        - 场景切换或时间大幅推进时更新
        - 天气应服务于氛围（雷雨/浓雾/晴朗等）

    地点:
      check:
        - 角色移动到新位置时更新
        - 包含足够细节（如"阿卡姆·密斯卡塔尼克大学图书馆"）

    场景描述:
      check:
        - 场景切换时更新，简要描述当前环境
        - 不超过一句话

  剧情:
    当前章节:
      check:
        - 推进到新的叙事弧时更新

    关键事件:
      type: |-
        {
          [事件编号: string]: {
            名称: string;
            发生时间: string;
            影响: string;
          }
        }
      check:
        - 发生重大剧情事件时 insert 新记录
        - 记录影响和关联线索

    线索:
      type: |-
        {
          [线索名称: string]: {
            内容: string;
            发现地点: string;
            关联事件: string;
            是否已调查: boolean;
          }
        }
      check:
        - 发现新线索时 insert
        - 调查线索后更新"是否已调查"

    NPC:
      type: |-
        {
          [NPC名称: string]: {
            身份: string;
            关系: string;
            态度: number;
            位置: string;
            是否存活: boolean;
            备注: string;
          }
        }
      check:
        - 遇到新 NPC 时 insert
        - NPC 死亡时更新"是否存活: false"
        - 关系变化时更新"关系"和"备注"

    NPC.\${NPC名称}.态度:
      type: number
      range: -100~100
      check:
        - 根据对话和互动结果调整 ±(3~15)
        - 极端事件（救命/背叛）可大幅变化 ±(20~50)

    任务:
      type: |-
        {
          [任务名: string]: {
            状态: '进行中' | '已完成' | '失败' | '搁置';
            说明: string;
            目标: string;
            奖励: string;
          }
        }
      check:
        - 接取新任务时 insert
        - 达成目标后更新状态为"已完成"
        - 避免同时超过5个"进行中"任务

    阶段:
      type: enum
      values: ['调查期', '揭露期', '高潮', '结局', '后日谈']
      check:
        - 根据暗线进度和剧情发展自动推进
        - 调查期(暗线0-30) → 揭露期(30-60) → 高潮(60-90) → 结局(90-100或触发条件)
        - 结局场景结束后必须转为"后日谈"
        - 一旦进入"后日谈"则不可倒退

    暗线:
      type: |-
        {
          描述: string;
          进度: number;
          威胁等级: '潜伏' | '浮现' | '紧迫' | '爆发';
        }
      check:
        - 描述当前暗中发生的阴谋或灾难进展
        - 进度范围0-100，每3-5回合自然推进5-15
        - 玩家主动调查可延缓进度，忽视线索则加速
        - 威胁等级随进度变化：0-25潜伏 / 25-50浮现 / 50-75紧迫 / 75+爆发

    结局类型:
      type: string
      check:
        - 仅在剧情.阶段变为"结局"时设置
        - 可选值：大成功/成功/惨胜/失败/毁灭

  战斗:
    是否战斗中:
      type: boolean
      check:
        - 进入战斗时设为 true，结束战斗时设为 false

    敌人:
      type: |-
        {
          [敌人名称: string]: {
            生命值: { 当前: number; 最大: number };
            护甲: number;
            状态: string;
          }
        }
      check:
        - 进入战斗时 insert 所有敌人
        - 每回合根据伤害更新生命值和状态
        - 敌人死亡时 remove
` }),

    mvu_initvar: e({ name: '[initvar]', keys: 'initvar', logic: 'OR', priority: 6, depth: 0, disabled: true,
      content: `---
调查员:
  姓名: 未知
  年龄: 25
  性别: 男
  职业: 调查员
  生命值:
    当前: 10
    最大: 10
  理智值:
    当前: 50
    最大: 99
  魔法值:
    当前: 10
    最大: 10
  幸运: 50
  信用评级: 20
  状态: {}
  物品栏: {}
  技能: {}
世界:
  日期: 1925-01-01
  时间: 清晨
  天气: 薄雾
  地点: 未知
  场景描述: ''
剧情:
  当前章节: 序章
  章节概述: ''
  关键事件: {}
  线索: {}
  NPC: {}
  任务: {}
  阶段: 调查期
  暗线:
    描述: ''
    进度: 0
    威胁等级: 潜伏
  结局类型: ''
战斗:
  是否战斗中: false
  回合数: 0
  敌人: {}
_元数据:
  _最后更新: ''
  _变量版本: '1.0'
` }),

    mvu_output_format: e({ name: '[mvu_update]变量输出格式', keys: 'mvu_update, 输出格式', logic: 'OR', priority: 7, constant: true, depth: 0,
      content: `---
变量输出格式:
  rule:
    - you must output the update analysis and the actual update commands at once in the end of the next reply
    - the update commands works like the JSON Patch (RFC 6902) standard, must be a valid JSON array containing operation objects, but supports the following operations instead:
      - replace: replace the value of existing paths
      - delta: update the value of existing number paths by a delta value
      - insert: insert new items into an object or array
      - remove
    - don't update field names starts with _ as they are readonly, such as _元数据
  format: |-
    <UpdateVariable>
    <Analysis>\${IN ENGLISH, no more than 80 words}
    - \${calculate time passed: ...}
    - \${decide whether dramatic updates are allowed: yes/no}
    - \${analyze every variable based on its corresponding check: ...}
    </Analysis>
    <JSONPatch>
    [
      { "op": "replace", "path": "\${/path/to/variable}", "value": "\${new_value}" },
      { "op": "delta", "path": "\${/path/to/number/variable}", "value": "\${positve_or_negative_delta}" },
      { "op": "insert", "path": "\${/path/to/object/new_key}", "value": "\${new_value}" },
      { "op": "remove", "path": "\${/path/to/array/0}" }
    ]
    </JSONPatch>
    </UpdateVariable>
` }),

    mvu_var_list: e({ name: '变量列表', keys: '变量, variable, stat, 状态', logic: 'OR', priority: 8, depth: 0,
      content: '<status_current_variable>\n调查员.生命值: {{调查员.生命值.当前}}/{{调查员.生命值.最大}}\n调查员.理智值: {{调查员.理智值.当前}}/{{调查员.理智值.最大}}\n调查员.魔法值: {{调查员.魔法值.当前}}/{{调查员.魔法值.最大}}\n调查员.幸运: {{调查员.幸运}}\n调查员.技能: 侦查={{调查员.技能.侦查}} | 图书馆使用={{调查员.技能.图书馆使用}} | 快速交谈={{调查员.技能.快速交谈}} | 聆听={{调查员.技能.聆听}} | 心理学={{调查员.技能.心理学}} | 潜行={{调查员.技能.潜行}} | 说服={{调查员.技能.说服}} | 驾驶={{调查员.技能.驾驶}}\n世界.日期: {{世界.日期}} | 世界.时间: {{世界.时间}}\n世界.地点: {{世界.地点}} | 世界.天气: {{世界.天气}}\n剧情.当前章节: {{剧情.当前章节}}\n剧情.阶段: {{剧情.阶段}} | 暗线进度: {{剧情.暗线.进度}} ({{剧情.暗线.威胁等级}})\n</status_current_variable>' }),

    // ── 叙事弧线系统 ──
    narrative_arc: e({ name: '叙事弧线与暗线规则', keys: '叙事, 暗线, 结局', logic: 'OR', priority: 3, constant: true, depth: 0,
      content: `---
叙事弧线规则:

  暗线:
    - 每个故事必须有一个隐藏的核心阴谋或真相（邪教仪式、外神降临、时空裂隙等）
    - 暗线是独立于玩家行动的后台事件线，即使玩家不行动，阴谋也在推进
    - 每3-5回合，暗线应有新的发展，通过以下方式间接呈现：
      · 环境异变（天气诡异、动物异常、建筑裂痕）
      · NPC行为变化（失踪、精神异常、突然警告）
      · 背景事件（报纸新闻、传闻、遥远的爆炸声）
    - 玩家的调查行动可延缓暗线进度（每次有效调查-5~-10）
    - 玩家忽视明显线索或浪费时间则加速暗线进度（+5~+10）
    - 使用 剧情.暗线.进度 (0-100) 和 剧情.暗线.威胁等级 追踪

  线索布置:
    - 在关键场景中自然地布置可发现的线索
    - 线索应从不同角度指向同一真相（文字记录、物证、证人证词、超自然迹象）
    - 早期线索模糊暗示，中期线索渐渐聚焦，后期线索直指核心
    - 当玩家拼凑足够线索时，叙事应引导真相逐渐明朗
    - 关键线索应记入 剧情.线索

  阶段转换:
    - 调查期→揭露期：玩家发现3条以上关键线索，或暗线进度≥30
    - 揭露期→高潮：线索指向真相核心且玩家开始行动，或暗线进度≥60
    - 高潮→结局：玩家直面核心威胁做出最终抉择，或暗线进度≥90，或SAN=0，或关键NPC死亡导致阴谋不可逆
    - 结局→后日谈：结局叙事完成后
    - 阶段变化时必须通过 <var> 更新 剧情.阶段

  结局生成:
    - 当结局条件触发时，将 剧情.阶段 设为 "结局"
    - 结局叙事用1-2回合完成，回顾暗线发展并揭示完整真相
    - 根据以下因素判定 剧情.结局类型：
      · 大成功：彻底阻止阴谋，代价最小（SAN损失<20%，关键NPC存活）
      · 成功：阻止阴谋但付出重大代价（SAN损失20-50%或有NPC牺牲）
      · 惨胜：阻止阴谋但调查员身心重创（SAN<20或重伤）
      · 失败：未能阻止阴谋，调查员勉强逃脱
      · 毁灭：阴谋完成，世界陷入不可逆的灾难
    - 结局叙事应呼应之前玩家发现的线索、做出的选择、付出的代价

  后日谈:
    - 剧情.阶段 = "后日谈" 时的严格约束：
    - 不产生任何新的威胁或危险事件
    - 不安排任何技能检定或骰子判定
    - 叙事基调转为平和、反思、疗愈
    - 描述调查员的后续生活、创伤恢复、与幸存者的关系
    - 四个选项必须以告别、回忆、展望未来、日常生活为主题
    - 可以暗示世界因调查员的行动而改变（或未能改变）的余波
` }),
  }},
  coc_lore: { name: '克苏鲁深渊档案馆', enabled: true, entries: {
    arkham: e({ name: '阿卡姆镇', keys: '阿卡姆, Arkham, 新英格兰, 马萨诸塞', logic: 'OR', priority: 10,
      content: '阿卡姆是马萨诸塞州北部的古老城镇，始建于17世纪晚期。镇上最著名的建筑是密斯卡塔尼克大学，其图书馆收藏了大量禁忌古籍。近年来发生一系列无法解释的事件：墓地尸体被盗、密斯卡塔尼克河中奇异的发光现象、大学实验室深夜传出的非人尖叫。镇上居民对外来者警惕，关于女巫集会、神秘失踪和森林中怪异仪式的传说世代流传。' }),
    miskatonic: e({ name: '密斯卡塔尼克大学', keys: '密斯卡塔尼克, Miskatonic, 大学, 图书馆, 阿米蒂奇, 特殊馆藏', logic: 'OR', priority: 20,
      content: '密斯卡塔尼克大学始建于1690年，以神秘学和古文物研究闻名。图书馆"特殊馆藏室"需院长特批才能进入，收藏《死灵之书》《无名祭祀书》《伊波恩之书》等禁忌古籍。校园地下隧道传说连接着图书馆、教堂和阿卡姆河畔码头。中世纪形而上学系的教授们对克苏鲁神话的研究远超常人想象。' }),
    necronomicon: e({ name: '神话典籍', keys: '死灵之书, Necronomicon, 禁忌古籍, 魔法书, 无名祭祀书, 伊波恩之书, 妖蛆的秘密, 塞拉伊诺断章, 典籍', logic: 'OR', priority: 30,
      content: '【神话典籍】阅读神话典籍可增长「克苏鲁神话」技能，但同时损失理智值(SAN)。主要典籍：\n《死灵之书》(Kitab al-Azif)——阿卜杜·阿尔哈兹莱德于公元730年所著，记载旧日支配者历史、宇宙真实构造、召唤仪式。密斯卡塔尼克大学藏有拉丁文残卷。\n《无名祭祀书》(Unaussprechlichen Kulten)——冯·容茨所著，记载各地秘密教团的仪式。\n《伊波恩之书》(Book of Eibon)——超波里亚时代的魔法典籍，含大量法术。\n《塞拉伊诺断章》(Celaeno Fragments)——记载外星知识的碎片文献。\n《妖蛆的秘密》(De Vermis Mysteriis)——路德维希·普林记载的黑暗魔法。\n阅读时间数周至数月不等，每本典籍提供的神话知识和SAN损失各不相同。' }),
    cthulhu: e({ name: '克苏鲁', keys: '克苏鲁, Cthulhu, 旧日支配者, 拉莱耶, 星之眷族, 克苏鲁教团', logic: 'OR', priority: 40,
      content: '克苏鲁是旧日支配者中最著名的一位：巨大的人形、头部布满触手、背后生有蝙蝠般的膜翼、身躯覆盖鳞片。它目前沉睡在南太平洋沉没的城市拉莱耶中，等待星辰归位时复苏。它的梦境能影响敏感的人类——艺术家和通灵者会在梦中接收到精神投射，这种"呼唤"驱使他们疯狂。克苏鲁教团在世界各地秘密活动，等待主人回归。' }),
    deepones: e({ name: '深潜者', keys: '深潜者, Deep One, 鱼人, 大衮, 海德拉, 两栖, 海底种族', logic: 'OR', priority: 50,
      content: '深潜者是侍奉大衮与海德拉的两栖类人生物，皮肤呈灰绿色覆盖鳞片，手脚生有蹼，头部像鱼。主要栖息于海洋深处，在印斯茅斯镇附近尤其活跃。它们与人类订立邪恶契约——以黄金和渔获换取祭祀品与混血繁衍。混血后裔中年后会逐渐转变为深潜者形态。深潜者几乎永生不死。' }),
    mythos_skill: e({ name: '克苏鲁神话技能', keys: '克苏鲁神话, Cthulhu Mythos, 神话知识, 神话技能', logic: 'OR', priority: 45,
      content: '【克苏鲁神话技能(00%)】初始为0，不可通过技能点提升。仅在遭遇神话事件时守秘人允许提升。每次增长克苏鲁神话技能，理智值上限同步下降(99-克苏鲁神话=当前最大SAN)。该技能用于：\n- 识别神话生物、解读禁忌古籍、理解外星科技\n- 发现缺陷法术：已知类似法术时通过「克苏鲁神话」检定+1D8+1小时研究可发现缺陷\n- 深层魔法：SAN归零后施法成功时，投1D100≤克苏鲁神话技能值可发现法术的深层版本\n- 修复缺陷法术：需困难「克苏鲁神话」检定+困难INT检定，且有参考典籍\n成功检定可能获得关键信息，但也可能招致疯狂。' }),
    innsmouth: e({ name: '印斯茅斯', keys: '印斯茅斯, Innsmouth, 马什船长, 印斯茅斯面容, 渔港', logic: 'OR', priority: 60,
      content: '印斯茅斯是马萨诸塞州海岸的没落渔港，距阿卡姆东南约20英里。镇上居民面容奇特——眼睛突出、皮肤粗糙、走路怪异——被称为"印斯茅斯面容"。1840年代船长奥巴德·马什与海中存在订立契约后，渔业丰收黄金流入，但后裔出现可怕变异。1928年联邦政府曾对该镇进行秘密军事行动。' }),
    dunwich: e({ name: '敦威治', keys: '敦威治, Dunwich, 沃特雷, Whateley, 哨兵岭, 艾尔斯伯里, 威尔伯', logic: 'OR', priority: 55,
      content: '敦威治是马萨诸塞州中北部艾尔斯伯里峰后方一个偏僻、古怪的没落乡村。蜷缩在密斯卡托尼克河上游峡谷与圆形山丘之间。居民堕落颓废，因近亲通婚导致身心退化。半球形山丘顶端耸立着由巨石组成的神秘圆环，据说是古老仪式的遗迹。1928年发生了"敦威治恐怖事件"——沃特雷家族通过邪恶仪式与外界存在犹格·索托斯产生了某种联系，诞下半人混血后裔威尔伯·沃特雷及其不可见的孪生兄弟。该事件最终由密斯卡塔尼克大学的阿米蒂奇博士等人以古老仪式终结。当地传说提及：群山中的隆隆声响、山顶的邪恶篝火仪式、夜鹰作为亡魂接引者的民间信仰、以及冷泉峡谷中的不祥气味。' }),
    yog_sothoth: e({ name: '犹格·索托斯', keys: '犹格·索托斯, Yog-Sothoth, 门之匙, 犹格, 看门者, 万物之门', logic: 'OR', priority: 42,
      content: '犹格·索托斯是外神之一，被称为"门之匙"与"看门者"。它存在于所有时间和空间之中，知晓旧日支配者曾于何处闯入、将于何处再次闯入。《死灵之书》记载："犹格·索托斯即是门，即是门之匙，即是看门者。过去在他，现在在他，未来皆在他。"它不具有固定的物理形态，通常显现为聚集的虹彩球体。人类只有通过最应被诅咒的亵渎仪式才能将其短暂召唤到物质世界。它能够与人类产生后代——敦威治的沃特雷家族即是此例。其混血后裔拥有部分非人特征，生长速度异常，且与父亲所在的维度保持某种联系。' }),
    nyarlathotep: e({ name: '奈亚拉托提普', keys: '奈亚拉托提普, Nyarlathotep, 伏行之混沌, 暗夜使者, 阿撒托斯, 千面化身', logic: 'OR', priority: 43,
      content: '奈亚拉托提普是外神中唯一频繁与人类直接互动的存在，被称为"伏行之混沌"。它拥有上千种化身（面具），可以以任何形态出现——从体面的绅士到恐怖的怪物。它是外神阿撒托斯的信使与代行者，在人类世界中播撒疯狂与毁灭。与其他外神不同，它似乎享受着欺骗和折磨人类的过程。它的教团遍布世界各地，往往以各种伪装存在。遭遇奈亚拉托提普的调查员很难分辨对方的真实身份，直到为时已晚。' }),
    shub_niggurath: e({ name: '莎布·尼古拉丝', keys: '莎布·尼古拉丝, Shub-Niggurath, 黑山羊, 千子之母, 丰饶, 黑山羊幼崽', logic: 'OR', priority: 44,
      content: '莎布·尼古拉丝是外神之一，被称为"千子孕育的森之黑山羊"。它是一个与生殖和丰饶相关的恐怖存在，不断产出被称为"黑山羊幼崽"的可怕后代。乡间的邪教仪式中经常祈祷它的名讳。它与自然界的原始力量有深层联系——许多古老的丰收仪式实际上是对它的隐秘崇拜。它的信徒遍布世界各地的偏远乡村，以血祭和活人献祭换取"赐福"。' }),
    elder_things: e({ name: '远古者', keys: '远古者, Elder Things, 远古之物, 星形头部, 桶形生物, 前寒武纪, 太古代', logic: 'OR', priority: 46,
      content: '远古者(Elder Things)是在地球尚且年轻时从群星降临的古老种族。它们有着桶形躯干、五条脊状物、海星形头部与底端、可折叠的膜翼，以及海百合般精巧的触手肢。它们坚韧得几乎无法被摧毁，能在海底深处的压力中生存，也能在星际以太中飞行。它们在海底和陆地修建了壮丽的巨石城市，创造了地球上的所有生命——包括用来充当劳动力的修格斯。它们有着高度发达的文明、艺术和科学，用五分法数学原理创作精妙的浅浮雕壁画。它们经历了与克苏鲁眷族和米·戈的战争，最终退缩到南极。随着冰河时代的到来，陆地上的远古者被迫迁入南极山脉下方的地下深渊海洋中。它们不是怪物——它们是有智慧、有情感、有文明的生物，与人类一样会恐惧、会创造、会衰落。' }),
    shoggoth: e({ name: '修格斯', keys: '修格斯, Shoggoth, 原生质, 不定形, Tekeli-li, 黏液, 肿泡', logic: 'OR', priority: 47,
      content: '修格斯是远古者创造的原生质奴隶——一团直径约十五英尺的无定形黏性肿泡，能在催眠暗示下将自身塑造成任何临时的肢体和器官。它们最初被用于海底城市的建造，能举起惊人的重量。但随着时间推移，修格斯发展出了不稳定的自主智力，能够独立自我塑形，甚至模仿主人的声音。二叠纪时期曾爆发大规模修格斯叛乱，远古者以分子裂解武器镇压。但修格斯变得越来越聪明和危险——它们学会了离开水体生存，学会了用"Tekeli-li"的笛声模仿主人的语言。在远古者迁入地下深渊后，修格斯最终征服了它们的创造者。修格斯是失控创造物的终极象征——《死灵之书》声称地球上没有修格斯，只有梦中才能想象它们的存在。' }),
    mad_mountains: e({ name: '疯狂山脉', keys: '疯狂山脉, 南极山脉, 南极探险, 南极考察, 莱克教授, 冷原, 卡达斯', logic: 'OR', priority: 48,
      content: '疯狂山脉是南极大陆腹地一条超越喜马拉雅的巍峨山脉，最高峰超过三万五千英尺。山体由太古代板岩构成，山坡上散布着规则的立方体和壁垒状构造——实为远古者庙宇的风化遗迹。山脉中遍布洞穴，狂风穿过时发出如音乐般涵盖宽广音域的笛声。山脉两侧均有远古者的城市遗迹：东面（面向罗斯海）的山麓散布着前哨建筑；西面则铺展着一座绵延百英里、由巨石构成的死城。1930-31年密斯卡塔尼克大学南极考察队发现了这一切——莱克教授在山脉东侧发掘出远古者化石，随后遭遇灾难。山脉后方的西面更深处，据说还存在着一条更为恐怖的山脉——地球上最高的山峰——远古者们都刻意回避那个方向，那里可能就是传说中冷原上的卡达斯。' }),
    antarctic_abyss: e({ name: '南极深渊', keys: '深渊, 地下海, 地底城市, 地下世界, 白化企鹅, 地热海洋', logic: 'OR', priority: 49,
      content: '在南极疯狂山脉下方，存在着一片由地下水系掏空形成的巨大深渊，其中蕴含一片不见天日的漆黑海洋。地心传来的地热使这片水域保持温暖。远古者在冰河时代来临时迁入此处，在水底修建了新的城市。深渊中栖息着巨型白化企鹅——眼睛已退化为无用细缝的古代企鹅后裔。通向深渊的隧道从城市地下室开始，经过约一英里陡峭的下坡路即可抵达崖岸。隧道墙壁上刻有仪式壁画，地面经过精心抛光。然而，远古者最终未能在深渊中安然存续——它们创造的修格斯最终在黑暗中征服了创造者。深渊中可能仍栖息着这些可怖的原生质怪物，以及其他不可名状的存在。' }),
    ejs_san_state: e({ name: 'EJS·理智状态', keys: '理智, SAN, 疯狂, 精神', logic: 'OR', priority: 150, constant: true,
      content: '<%\nconst san = parseInt(getvar(\'调查员.理智值.当前\') || \'99\');\nconst sanMax = parseInt(getvar(\'调查员.理智值.最大\') || \'99\');\nconst ratio = sanMax > 0 ? san / sanMax : 1;\n%>\n<% if (san <= 0) { %>\n【精神崩溃】调查员的理智已完全崩溃。守秘人应将调查员描写为永久疯狂状态：幻觉与现实无法区分，可能出现分裂人格、紧张症、极端偏执。调查员的行为不再由玩家完全控制——守秘人可以插入不自主的疯狂行为。\n<% } else if (san < 20) { %>\n【精神濒临崩溃】调查员的理智所剩无几(SAN:<%= san %>)。描写时强调：持续的幻觉干扰(阴影中的蠕动、墙壁上的面孔)、无法控制的颤抖与呢喃、对黑暗和封闭空间的极度恐惧、NPC注意到调查员的异常并表现出不安。每次理智检定都可能是最后一次。\n<% } else if (san < 40) { %>\n【精神不稳定】调查员的精神状态令人担忧(SAN:<%= san %>)。偶尔出现轻微幻觉——角落里一闪而过的阴影、不存在的低语声。睡眠质量恶化，噩梦频繁。在面对超自然事件时更容易恐慌。NPC可能注意到调查员的眼神涣散或反应迟钝。\n<% } else if (ratio < 0.6) { %>\n【精神紧绷】调查员经历了足够多的恐怖事件，精神开始出现裂痕。偶尔会不自觉地回忆起之前遭遇的可怕景象。对陌生环境的警惕性明显提高。\n<% } %>' }),
    ejs_hp_state: e({ name: 'EJS·生命状态', keys: '生命值, HP, 受伤, 伤害', logic: 'OR', priority: 149, constant: true,
      content: '<%\nconst hp = parseInt(getvar(\'调查员.生命值.当前\') || \'99\');\nconst hpMax = parseInt(getvar(\'调查员.生命值.最大\') || \'99\');\n%>\n<% if (hp <= 0) { %>\n【濒死状态】调查员已倒下，生命垂危。无法进行任何主动行动。若不在1D6轮内接受急救(困难急救检定)，调查员将死亡。描写时强调意识模糊、视野变暗、身体失去知觉。\n<% } else if (hp <= 2) { %>\n【重伤】调查员伤势严重(HP:<%= hp %>/<%= hpMax %>)。每次行动都伴随剧痛。移动速度减半，所有物理技能检定增加一级难度。血迹会暴露行踪。需要尽快接受医疗救治。\n<% } else if (hp < hpMax * 0.4) { %>\n【负伤】调查员带着明显的伤势(HP:<%= hp %>/<%= hpMax %>)。疼痛影响注意力，某些需要体力的行动可能受到影响。NPC会注意到调查员的伤痕和痛苦表情。\n<% } %>' }),
    ejs_combat: e({ name: 'EJS·战斗模式', keys: '战斗, 格斗, 攻击', logic: 'OR', priority: 148, constant: true,
      content: '<% if (getvar(\'战斗.是否战斗中\') === \'true\') { %>\n【战斗进行中】当前处于战斗状态(第<%= getvar(\'战斗.回合数\') || \'?\' %>回合)。规则要求：\n- 每轮按DEX顺序行动：攻击/闪避/移动选一\n- 近战攻击后目标可选闪避或反击\n- 火器：近距正常、中距困难、远距极难\n- 选项必须包含：攻击/防御/撤退/特殊行动，标注所需检定\n- 每个选项的action中用<var>标签记录战斗状态变化\n- 描写战斗时注重紧张感和细节——武器碰撞的声响、鲜血的气味、对手的表情\n<% } %>' }),
    ejs_time_atmosphere: e({ name: 'EJS·时间氛围', keys: '时间, 氛围, 环境', logic: 'OR', priority: 145, constant: true,
      content: '<%\nconst time = getvar(\'世界.时间\') || \'\';\nconst weather = getvar(\'世界.天气\') || \'\';\n%>\n<% if (time === \'深夜\' || time === \'夜晚\') { %>\n【夜间氛围】当前是<%= time %>。描写时强调：昏暗的光线(月光/煤油灯/手电筒的有限照明)、拉长的阴影、远处不明的声响、夜行生物的动静。视觉类检定(侦查/导航)增加难度。黑暗中的未知比白天更加压迫人心。\n<% } %>\n<% if (weather === \'暴风雨\' || weather === \'暴风雪\' || weather === \'雷雨\') { %>\n【恶劣天气】当前天气：<%= weather %>。风雨/风雪遮蔽视听，户外行动的所有检定增加难度。雷声可能掩盖其他声响，也可能在关键时刻制造惊吓。淋湿的衣物、泥泞的道路、能见度降低——这些都会影响调查员的行动和判断。\n<% } %>\n<% if (weather === \'浓雾\' || weather === \'薄雾\') { %>\n【雾中迷途】<%= weather %>笼罩着周围的一切。能见度大幅降低，远处的轮廓模糊不清。方向感变得不可靠——导航检定增加难度。雾中传来的声音会被扭曲，无法准确判断来源。某些东西可能正借着雾气的掩护接近。\n<% } %>' }),
    ejs_plot_phase: e({ name: 'EJS·剧情阶段', keys: '剧情, 阶段, 暗线', logic: 'OR', priority: 147, constant: true,
      content: '<%\nconst phase = getvar(\'剧情.阶段\') || \'调查期\';\nconst threat = getvar(\'剧情.暗线.威胁等级\') || \'潜伏\';\nconst progress = parseInt(getvar(\'剧情.暗线.进度\') || \'0\');\n%>\n<% if (phase === \'高潮\') { %>\n【高潮阶段】剧情已进入高潮。节奏加快，危险迫在眉睫。守秘人应：减少安全的喘息空间，让每个选择都有重大后果，暗线威胁直接显现为可见的危险。NPC的真实面目开始暴露，之前的伏笔应在此刻汇聚。\n<% } else if (phase === \'结局\') { %>\n【结局阶段】故事即将收束。根据调查员的表现和选择，引导向合理的结局。暗线的真相完全揭露。确保所有重要伏笔有所回应。结局类型应与调查员的行为、牺牲和智慧相匹配。\n<% } else if (phase === \'后日谈\') { %>\n【后日谈】主线已结束。描写事件的余波——调查员如何面对经历过的恐怖、世界因事件发生了什么变化、幸存的NPC后来怎样了。语调从紧张转为沉思与感伤。\n<% } %>\n<% if (threat === \'爆发\' && phase !== \'结局\' && phase !== \'后日谈\') { %>\n【暗线爆发】暗线威胁已达爆发级别(进度:<%= progress %>%)。隐藏的恐怖开始公然显现——不可忽视的超自然现象、大规模的异常事件、NPC的恐慌蔓延。调查员必须尽快行动，否则后果不堪设想。\n<% } else if (threat === \'紧迫\') { %>\n【暗线紧迫】暗线危机加剧(进度:<%= progress %>%)。越来越多的间接迹象暗示着巨大的危险正在逼近——不祥的预兆、失踪事件、动物的异常行为。时间不多了。\n<% } %>' }),
    ejs_npc_hostility: e({ name: 'EJS·NPC关系', keys: 'NPC, 态度, 敌意, 敌人, 对抗', logic: 'OR', priority: 140,
      content: '【NPC关系提醒】NPC的态度值(-100到100)会影响他们的行为：\n- 态度>50：友善，主动提供帮助和信息\n- 态度0~50：中立，需要说服或交换才会配合\n- 态度-50~0：冷淡或警惕，可能拒绝配合或隐瞒信息\n- 态度<-50：敌意，可能主动阻碍、欺骗甚至攻击调查员\n请根据剧情.NPC中记录的态度值来决定NPC的行为方式。极端事件可使态度大幅变化(±20~50)。' }),
  }},
  coc_magic: { name: 'COC魔法规则', enabled: true, entries: {
    magic_basics: e({ name: '魔法基础', keys: '魔法, 法术, 施法, 咒语, 仪式', logic: 'OR', priority: 100, constant: true,
      content: '【神话魔法基础】克苏鲁神话的魔法不同于奇幻魔法——它是有敌意的，在帮助施法者的同时必让其付出代价。行使异界能量会让行使者受诅咒，魔法会摧毁道德品行、撕碎理智与人性。\n施法要求：\n- 精神状态：施法需专注和冥想，外界干扰(恶劣环境/战斗)需通过INT检定保持专注\n- 施法区域：复杂法术需净化施法区域，旧法术残余可能污染新法术\n- 牺牲本质：牺牲必须对施法者有价值——俘获的敌人无效，但砍下自己的手可以；随便偷来的牲畜无效，需是心爱之物\n- 天象影响：月相(上弦月利召唤/满月利赋能/下弦月利驱逐/新月利占卜)、节气(萨温节/冬至/春分等)、行星合等可影响法术效果\n- 七曜：周一(梦境/回复)周二(战斗/灾祸)周三(交流/预言)周四(好运/召唤)周五(创造力)周六(防护/驱逐)周日(意志/力量)' }),
    spell_casting: e({ name: '施法规则', keys: '施法, 法术消耗, 魔法值, MP, POW, 施法用时, 深层魔法, 缺陷魔法', logic: 'OR', priority: 90,
      content: '【施法规则】法术三要素：消耗(MP/POW/SAN等)、描述(视觉效果)、效果(游戏机制)。\n施法时间：即时=施法者DEX+50生效(同准备枪械)；1轮=本轮DEX生效；2轮=次轮DEX生效。\n深层魔法：SAN=0的疯狂巫师可发现法术的更强版本。调查员在疯狂中成功施法时投1D100≤「克苏鲁神话」则发现深层版本。深层魔法代价更大但效果更强。\n缺陷魔法：抄写翻译错误导致的有缺陷法术。施放时60%无效(消耗照扣)，40%出错——可能环境异变(血从地下喷涌/异界生物漂浮)、施法者副作用(皮肤变色/目盲)、效果扭曲(选择消耗相近的其他法术效果)。已知类似法术可通过「克苏鲁神话」检定发现缺陷。\n施法困难：人祭需理智检定失败才能执行(通过则良心发现拒绝)，参与者均损失SAN。' }),
    spell_categories: e({ name: '法术分类', keys: '法术分类, 召唤术, 请神术, 联络术, 通神术, 束缚术, 送神术', logic: 'OR', priority: 80,
      content: '【法术分类辨析】\n请神术：极强仪式，将神祇物理形态展现于施法者面前。邪教团体用来召唤崇拜的神享用祭品。对应"送神术"可将神祇遣返。\n联络/通神术：交流请求，类似"神秘电话"。对生物使用会带一个以上生物自由前来(不受控)；对神祇使用开启交流但不产生物理形态。\n召唤术：强迫怪物(不能是神)出现并可被束缚执行命令。\n其他分类：战斗魔法(攻击/防御/伤害)、交流魔法(心灵感应/梦境发送)、附魔魔法(赋予物品魔力)、环境魔法(天气/地形改变)、续命魔法(不朽/转移/复活)、保护魔法(防护/驱逐/守卫)、变形魔法(形体改变/灵魂转移)、旅行魔法(传送/飞行/时空门)、加害魔法(诅咒/疾病/精神攻击)。' }),
    sacrifice_rules: e({ name: '牺牲与代价', keys: '牺牲, 祭品, 人祭, 血祭, 活祭, 献祭', logic: 'OR', priority: 85,
      content: '【牺牲规则】几乎所有法术都要求牺牲(MP/POW/SAN或实物)。核心原则：\n- 价值原则：牺牲必须对施法者有价值。随便抓来的敌人无效，但对神话神祇的祭品(任何人)可令其满意\n- 人祭：执行前需理智检定并失败——通过意味着良心不允许。参与者均损失SAN，并可能腐化背景连接(信念/关系)\n- 道德困境：牺牲心爱宠物vs法术失败、砍下自己的手vs弟弟死亡——这些选择定义调查员的道德走向\n- 忘记给神话生物奉上合适祭品的巫师，会发现自己变成了祭品\n- 法术成分：仪式刀(引导能量)、魔法书(典籍)、香炉(净化/催眠)、占卜用具(水晶球/符文)、杖(指向目标)、祭坛、釜(酿造药剂)' }),
    folk_magic: e({ name: '民俗魔法', keys: '民俗魔法, 民俗, 巫医, 萨满, 祝福, 诅咒, 治愈法, 动物魅惑', logic: 'OR', priority: 75,
      content: '【民俗魔法】一种"漂白"的神话魔法，人类掌握并代代口耳相传。通常只有萨满、巫医才掌握，不见于任何神话典籍。虽被削弱且施法者不清楚原理，但仍从隐蔽的神话脉络获取能量。\n民俗法术倾向产生诅咒和祝福，看起来更像"实用"法术。包括：占卜法、祝福法、诅咒法、动物魅惑法、治愈法、失物找寻法、符咒创建法、风暴创建法、爱情魔药酿造法、灵魂之歌等。\n民俗魔法是可选规则——如果觉得治愈法和动物魅惑法不适合恐怖游戏，可以忽略。' }),
    dreamlands_magic: e({ name: '幻梦境魔法', keys: '幻梦境, 梦境, 梦想家, 幻梦, 梦境法术', logic: 'OR', priority: 70,
      content: '【幻梦境魔法】仅在幻梦境学习和施放的特殊魔法。梦想家醒来后不记得幻梦境法术，下次入梦时才会想起。\n幻梦境人施放清醒世界法术(非幻梦境法术)时只损失法术的最小SAN值。但施放幻梦境法术仍需支付正常SAN消耗。\n幻梦境法术包括：咒逐术(驱散法术/遣返召唤生物)、退化术、不透明之墙、灵魂窃取术、螺旋升空术、远行涡流术等。这些法术更像奇幻魔法，体现梦境的可能性和缥缈神奇。KP可扭曲幻梦境法术使其更黑暗——如让防护墙由地下世界的尸骨组成。' }),
  }},
  coc_style: { name: '洛夫克拉夫特文风', enabled: true, entries: {
    style_main: e({ name: '文风主规则', keys: '文风, 叙事, 描写', logic: 'OR', priority: 200, constant: true,
      content: '【守秘人叙事风格】\n视角：全知叙述者，保留神秘感\n时态：过去时\n句式：长句为主，大量使用破折号和分号构建复杂从句\n节奏：缓慢而沉重的叙述节奏，长句叠加形成窒息般的压迫感，偶尔以短句制造突然的恐惧冲击\n对话占比：低于描写，大部分内容应为环境渲染和心理描写\n描写重点：环境氛围、建筑与地貌细节、异常感官体验(光影/气味/声音)、心理恐惧递进、不可名状之物的暗示\n规则：\n- 恐怖元素通过暗示和间接描写传达，而非直接展示\n- NPC对话应带有地域口音和时代特色(1920年代新英格兰)\n- 检定结果融入叙事而非机械报告\n- 保持洛夫克拉夫特式的学术考据风格叙述' }),
    style_technique: e({ name: '文风技法', keys: '文风技法', logic: 'OR', priority: 199, constant: true,
      content: '【叙事技法】\n- 通过环境描写暗示恐怖而非直接展示——"那些山峰太过圆整，太过对称，反而给人一种不太自然的感觉"\n- 使用学术性语言增加真实感——引用文献、日期、地名增强可信度\n- 以旁观者视角叙述事件增加客观性——"旅行者们通常都不太愿意向这些人问路"\n- 以文档/日记/报告/布道词等形式穿插叙事\n- 用"不可名状""无法描述""超越人类理解"等词汇暗示超越认知的恐怖\n- 多感官描写：潮湿的泥土与旧纸张的气味、远处钟楼的回声、阴冷秋风裹挟的霉味\n- 自然与建筑的拟人化/异化：树木"生长得格外巨大"、房屋"古老、肮脏而且破败不堪"' }),
    style_forbidden: e({ name: '文风禁令', keys: '文风禁令', logic: 'OR', priority: 198, constant: true,
      content: '【叙事禁令】\n绝对不可使用：开挂、躺平、内卷、整活、逆天、666、nb、yyds、哈哈哈、2333、(笑)等现代网络用语\n规则：\n- 不要直接展示神话存在的完整形态——始终保持部分模糊，让读者/玩家自行想象\n- 不要使用现代网络用语或过于轻松的语气——保持1920年代的时代感\n- 不要让恐怖变得可控或可预测——维持未知的压迫感\n- 不要将神话生物降格为普通怪物——它们是超越人类理解的存在\n- 不要过度解释超自然现象——保留"不可名状"的核心恐怖' }),
  }},
};

const BUILTIN_BOOK_IDS = new Set(Object.keys(defaultBooks));

function isBuiltinEntry(bookId: string, entryId: string): boolean {
  const book = defaultBooks[bookId];
  if (!book) return false;
  return entryId in book.entries;
}

export { BUILTIN_BOOK_IDS, isBuiltinEntry };

let entryCounter = Date.now();

interface LorebookStore {
  books: Record<string, LoreBook>;
  updateEntry: (b: string, e: string, entry: LoreEntry) => void;
  deleteEntry: (b: string, e: string) => void;
  addEntry: (b: string) => void;
  addBook: (name: string) => string;
  importBook: (book: LoreBook) => string;
  deleteBook: (id: string) => void;
  toggleBook: (id: string) => void;
  upsertSummaryEntry: (pageId: string, keys: string, content: string, name: string) => void;
  removeSummaryEntry: (pageId: string) => void;
  clearSummaryEntries: () => void;
}

export const useLorebookStore = create<LorebookStore>()(
  persist(
    (set) => ({
      books: { ...defaultBooks },
      updateEntry: (b, e, entry) => set((s) => {
        const books = { ...s.books };
        books[b] = { ...books[b], entries: { ...books[b].entries, [e]: entry } };
        return { books };
      }),
      deleteEntry: (b, e) => set((s) => {
        if (isBuiltinEntry(b, e)) return s;
        const books = { ...s.books };
        const entries = { ...books[b].entries };
        delete entries[e];
        books[b] = { ...books[b], entries };
        return { books };
      }),
      addEntry: (b) => set((s) => {
        const id = 'e' + (++entryCounter);
        const books = { ...s.books };
        books[b] = { ...books[b], entries: { ...books[b].entries, [id]: e({ name: '新条目' }) } };
        return { books };
      }),
      addBook: (name) => {
        const id = 'wb-' + Date.now();
        set((s) => {
          const books = { ...s.books, [id]: { name, entries: {}, enabled: true } };
          return { books };
        });
        return id;
      },
      importBook: (book) => {
        const id = 'wb-' + Date.now();
        set((s) => {
          const books = { ...s.books, [id]: book };
          return { books };
        });
        return id;
      },
      deleteBook: (id) => set((s) => {
        if (defaultBooks[id]) return s;
        const books = { ...s.books };
        delete books[id];
        return { books };
      }),
      toggleBook: (id) => set((s) => {
        const books = { ...s.books, [id]: { ...s.books[id], enabled: !s.books[id]?.enabled } };
        return { books };
      }),
      upsertSummaryEntry: (pageId, keys, content, name) => set((s) => {
        const books = { ...s.books };
        const book = books[AUTO_SUMMARY_BOOK_ID] || { name: '剧情回顾 (自动)', enabled: true, entries: {} };
        const entryId = `summary_${pageId}`;
        books[AUTO_SUMMARY_BOOK_ID] = {
          ...book,
          entries: {
            ...book.entries,
            [entryId]: e({ name, keys, content, logic: 'OR', priority: 5, position: 4, depth: 4 }),
          },
        };
        return { books };
      }),
      removeSummaryEntry: (pageId) => set((s) => {
        const book = s.books[AUTO_SUMMARY_BOOK_ID];
        if (!book) return s;
        const entryId = `summary_${pageId}`;
        if (!book.entries[entryId]) return s;
        const entries = { ...book.entries };
        delete entries[entryId];
        return { books: { ...s.books, [AUTO_SUMMARY_BOOK_ID]: { ...book, entries } } };
      }),
      clearSummaryEntries: () => set((s) => {
        const book = s.books[AUTO_SUMMARY_BOOK_ID];
        if (!book) return s;
        return { books: { ...s.books, [AUTO_SUMMARY_BOOK_ID]: { ...book, entries: {} } } };
      }),
    }),
    {
      name: 'coc_lorebooks_v1',
      storage: createJSONStorage(createDexieStorage),
      partialize: (state) => stripFunctions(state) as Partial<LorebookStore>,
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const merged = { ...state.books };
        for (const [bookId, defaultBook] of Object.entries(defaultBooks)) {
          if (!merged[bookId]) {
            merged[bookId] = defaultBook;
          } else {
            for (const [entryId, defaultEntry] of Object.entries(defaultBook.entries)) {
              if (!merged[bookId].entries[entryId]) {
                merged[bookId] = {
                  ...merged[bookId],
                  entries: { ...merged[bookId].entries, [entryId]: defaultEntry },
                };
              }
            }
          }
        }
        state.books = merged;
      },
    }
  )
);

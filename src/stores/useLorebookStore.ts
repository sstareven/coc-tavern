import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { LoreBook, LoreEntry } from '../types';
import { createDexieStorage } from '../db/storage';
import { stripFunctions } from '../db/stripFunctions';

const e = (overrides: Partial<LoreEntry>): LoreEntry => ({
  name: '', keys: '', content: '', logic: 'AND_ANY', priority: 10,
  disabled: false, constant: false, position: 0, depth: 0, probability: 100,
  secondaryKeys: '', scanDepth: 0, caseSensitive: 0, matchWholeWord: 0,
  groupScoring: 0, automationId: '', inclusionGroup: '', prioritizeInclusion: false,
  groupWeight: 100, sticky: 0, cooldown: 0, delay: 0,
  preventRecursion: true, delayUntilRecursion: false, excludeRecursion: false,
  ignoreReplyLimit: false,
  ...overrides,
});

export const AUTO_SUMMARY_BOOK_ID = '__auto_summaries';

const defaultBooks: Record<string, LoreBook> = {
  [AUTO_SUMMARY_BOOK_ID]: { name: '剧情回顾 (自动)', enabled: true, entries: {} },
  mvu_rules: { name: 'MVU规则系统', enabled: true, entries: {
    skill_check: e({ name: 'CoC检定规则', keys: '检定, d100, 大成功', logic: 'AND_ANY', priority: 900, constant: true,
      content: '【CoC 7th检定】成功=d100≤技能，困难≤半值，极难≤1/5，大成功=01，大失败=100(技能≥50)或96-100(技能<50)。有利→奖励骰(双十面取优)，不利→惩罚骰(取差)。\n侦查系：查账→会计，变装→乔装，查资料→图书馆使用，偷听→聆听，开锁→锁匠，藏东西→妙手，搜证→侦查，暗处→潜行，追迹→追踪，拍照→摄影。\n交涉系：魅力→取悦，欺瞒→话术，威吓→恐吓，辩论→说服，读心→心理学。\n战斗系：近战→格斗(斗殴)，手枪→射击(手枪)，步枪→射击(步枪)，霰弹枪→射击(霰弹枪)。\n运动系：攀爬→攀爬，闪躲→闪避，跳过沟→跳跃，骑马→骑术，渡水→游泳，扔东西→投掷。\n护理系：止血→急救，治病→医学，心理→精神分析。\n生活系：看文化→人类学，估价→估价，挖遗迹→考古学，创作→艺术与手艺，用电脑→计算机使用，开车→汽车驾驶，修电器→电气维修，修电路→电子学，回想→历史，读外语→语言(其他)，打官司→法律，修机器→机械维修，认动物→博物学，找方向→导航，辨灵异→神秘学，开起重机→操作重型机械，开飞机→驾驶，荒野→生存，炸东西→爆破，邪神知识→克苏鲁神话(掉SAN)。日常无需检定。' }),
    combat: e({ name: '战斗规则', keys: '战斗, 格斗(斗殴), 闪避', logic: 'AND_ANY', priority: 895, constant: true,
      content: '【CoC战斗】先攻=按DEX数值高低排序(高者先动)，持火器者先攻视为+50DEX。每轮攻击/闪避/移动。格斗(斗殴)→目标可闪避或反击。火器→近距正常、中距困难、远距极难。伤害=武器+DB。HP≤0→昏迷。选项：I攻击 II防御 III撤退 IV特殊，标注检定。' }),
    sanity: e({ name: '理智系统', keys: 'SAN, 理智, 疯狂', logic: 'AND_ANY', priority: 890, constant: true,
      content: '【SAN 数值规则·7e】初始 SAN = POW。单次损失≥5→智力(INT)检定,通过=领会真相陷入临时疯狂,失败=心智暂时压抑不立即疯狂。SAN≤0→永久疯狂。SAN 上限随克苏鲁神话技能提升而下降(SAN_max = 99 - 克苏鲁神话)。恢复:精神分析+1D3,长期休息+1D3,完成调查里程碑+1D6。具体扣损触发表(尸体/怪物/大恐怖/典籍/真相级线索/不可名状)参见世界书 san_bubble_trigger_spec 条目,本条不重复。' }),

    // ── MVU 变量系统 ──
    mvu_update_rules: e({ name: '[mvu_update]变量更新规则', keys: 'mvu_update, 变量更新', logic: 'AND_ANY', priority: 915, constant: true, depth: 0,
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

    状态条件:
      type: |-
        Array<{ 名称: string; 严重度: 'minor'|'moderate'|'severe'|'critical'; 描述: string }>
      check:
        - 路径 /调查员/状态条件（数组）。受伤/中毒/疯狂等持续状态：用 insert 追加 {名称,严重度,描述}（同名自动覆盖），脱离该状态时用 remove 路径 /调查员/状态条件/<名称>
        - 严重度仅用英文枚举 minor/moderate/severe/critical（其他写法会被规整为 moderate）
        - 不要在此记录信用评级/物品/线索/NPC：信用评级是技能(调查员.技能.信用评级)；物品用 inventoryChanges 字段、线索用 clues 字段、NPC 用 npcUpdates 字段维护，切勿用 JSONPatch 重复记录

    技能.\${技能名}:
      type: number
      check:
        - 路径 /调查员/技能/<技能名>，值为该技能当前成功率(数字)。仅写当前值——技能成长由守秘人在叙事/幕间结算中口述，变量层只在确实变动时用 replace 写入新的当前值
        - 克苏鲁神话技能每次增长后，须同步把 调查员.理智值.最大 设为 99 − 克苏鲁神话当前值

    身份字段:
      check:
        - 只读：姓名/年龄/性别/职业 由角色卡在创建期管理，不要用 JSONPatch 写入 /调查员/姓名、/调查员/职业 等身份路径（会被静默忽略）
        - 信用评级是技能：写 /调查员/技能/信用评级，切勿写 /调查员/信用评级 顶层路径

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
        - 天气应服务于氛围（雷雨/浓雾/晴朗等）；取单一主导描述词，避免「雨雾」「雷雨夹雾」等多词叠加
        - 改 sceneInfo.weather 显示天气时，必须同步用 JSONPatch replace /世界/天气，否则氛围提示停留在旧值

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

    已解锁:
      type: |-
        {
          [解锁标识: string]: boolean;
        }
      check:
        - 用于「世界观/秘密」的循序渐进解锁：标识为 true 后，世界书才会向模型揭示对应的深层设定。未解锁前模型只能依据表层公开信息叙事，严禁提前透露未解锁的秘密。
        - 触发即用 JSON Patch 输出：{"op":"insert","path":"/剧情/已解锁/{标识}","value":true}（与 MVU 变量规范同协议）
        - 一旦解锁不可逆，只 insert/置 true，绝不 remove 或改回 false
        - **固定标识清单（仅使用以下键，不要自创）**：
          - 地点到访：角色亲自抵达该地点时 → 密大 / 印斯茅斯 / 敦威治 / 疯狂山脉 / 阿卡姆
          - 深层秘密：角色亲眼见证或获得对应关键信息时 → 密大特殊馆藏(进入特殊馆藏室) / 接触禁书(实际阅读任一神话典籍) / 印斯茅斯真相(目睹深潜者或契约真相) / 敦威治真相(知晓沃特雷血脉与犹格联系) / 南极深渊(深入山脉下方地下海)
        - 不要凭空解锁：必须由剧情实际发生支撑（角色走到、看到、读到），这是体验设计的核心

    救援:
      type: |-
        {
          全局状态: '潜伏' | '对峙' | '锁定';
          胜出路径: string;
          路径: {
            [路径名: string]: {
              已解锁: boolean;
              进度: number;       // 0-100
              已达里程碑: string[];
              最近: string;
            };
          };
        }
      check:
        - 多结局推进系统：每条「拯救路径」对应一种正向结局形态，由剧本预设的 rescueEndings 注入到 路径.* 槽位；与暗线 progress 形成赛跑
        - 解锁：调查员通过线索/NPC 对话/剧情触发某条路径的 unlockHint 描述场景时 → {"op":"replace","path":"/剧情/救援/路径/<路径名>/已解锁","value":true}；首次解锁同回合把 全局状态 从 潜伏 推进到 对峙
        - 推进：在该路径已解锁前提下，每当调查员完成该路径下的一个里程碑（如取得关键物品/说服关键 NPC/抵达关键地点）→ {"op":"delta","path":"/剧情/救援/路径/<路径名>/进度","value":<该里程碑的 delta>}（默认 25），并把里程碑 id 加进 已达里程碑 数组
        - 进度自动钳到 0..100；某条路径进度先达 100 → 自动锁定为最终结局
        - 锁定：{"op":"replace","path":"/剧情/救援/全局状态","value":"锁定"} 同时 {"op":"replace","path":"/剧情/救援/胜出路径","value":"<路径名>"}；锁定后其他路径继续推进无效，剧情转入该路径对应结局叙事
        - 全局状态严格 enum：潜伏（无任何路径解锁）/ 对峙（≥1 条路径解锁但无人达 100）/ 锁定（已有胜出路径），仅按该顺序单向推进，不可回退
        - 严禁凭空写：每一次 解锁/推进/锁定 都必须由本回合 leftContent/rightContent 叙事中具体描写支撑

  战斗:
    是否战斗中:
      type: boolean
      check:
        - 进入战斗时设为 true，结束战斗时设为 false

    回合数:
      type: number
      check:
        - 进入战斗时设为 1；之后每推进一个战斗轮次用 delta +1
        - 退出战斗（是否战斗中→false）时用 replace 归 0

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

    mvu_initvar: e({ name: '[initvar]', keys: 'initvar', logic: 'AND_ANY', priority: 6, depth: 0, disabled: true,
      content: `---
# 调查员.* 由角色卡(useCharSheetStore)管理，运行时种子见 createInitialStatData，不经 statData/JSONPatch 初始化；下方仅作字段参考。
调查员:
  姓名: 未知
  年龄: 25
  性别: 男
  职业: 调查员
  生命值: { 当前: 10, 最大: 10 }
  理智值: { 当前: 50, 最大: 99 }
  魔法值: { 当前: 10, 最大: 10 }
  幸运: 50
  状态条件: []
  技能: {}   # 信用评级作为技能存于此；物品走 inventoryChanges、线索走 clues、NPC 走 npcUpdates
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
  已解锁: {}
  救援:
    全局状态: 潜伏
    胜出路径: ''
    路径: {}
战斗:
  是否战斗中: false
  回合数: 0
  敌人: {}
_元数据:
  _最后更新: ''
  _变量版本: '1.0'
` }),

    mvu_var_list: e({ name: '变量列表', keys: '变量, variable, stat', logic: 'AND_ANY', priority: 50, depth: 0, constant: true,
      content: '<status_current_variable>\n调查员.生命值: {{调查员.生命值.当前}}/{{调查员.生命值.最大}}\n调查员.理智值: {{调查员.理智值.当前}}/{{调查员.理智值.最大}}\n调查员.魔法值: {{调查员.魔法值.当前}}/{{调查员.魔法值.最大}}\n调查员.幸运: {{调查员.幸运}}\n调查员.技能: 侦查={{调查员.技能.侦查}} | 图书馆使用={{调查员.技能.图书馆使用}} | 话术={{调查员.技能.话术}} | 聆听={{调查员.技能.聆听}} | 心理学={{调查员.技能.心理学}} | 潜行={{调查员.技能.潜行}} | 说服={{调查员.技能.说服}} | 汽车驾驶={{调查员.技能.汽车驾驶}}\n世界.日期: {{世界.日期}} | 世界.时间: {{世界.时间}}\n世界.地点: {{世界.地点}} | 世界.天气: {{世界.天气}}\n剧情.当前章节: {{剧情.当前章节}}\n剧情.阶段: {{剧情.阶段}} | 暗线进度: {{剧情.暗线.进度}} ({{剧情.暗线.威胁等级}})\n</status_current_variable>' }),

    // ── 叙事弧线系统 ──
    narrative_arc: e({ name: '叙事弧线与暗线规则', keys: '叙事, 暗线, 结局', logic: 'AND_ANY', priority: 905, constant: true, depth: 0,
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
    - 阶段变化时必须用 <UpdateVariable><JSONPatch> 输出 {"op":"replace","path":"/剧情/阶段","value":"新阶段"} 更新 剧情.阶段

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
    arkham: e({ name: '阿卡姆镇', keys: '阿卡姆, Arkham, 新英格兰, 马萨诸塞', logic: 'AND_ANY', priority: 10, position: 1,
      content: '阿卡姆是马萨诸塞州北部的古老城镇，始建于17世纪晚期，密斯卡塔尼克河穿城而过。镇上最著名的建筑是密斯卡塔尼克大学。当地居民民风保守，对外来者颇为警惕，街头巷尾流传着关于女巫与古老传说的只言片语。\n<% if (getvar(\'剧情.已解锁.阿卡姆\') === \'true\') { %>\n深入了解后会发现，近年这里发生了一系列无法解释的事件：墓地尸体被盗、密斯卡塔尼克河中出现奇异的发光现象、大学实验室深夜传出非人的尖叫。关于女巫集会、神秘失踪与森林中怪异仪式的传说世代相传，且似乎指向某种仍在延续的黑暗。\n<% } %>' }),
    miskatonic: e({ name: '密斯卡塔尼克大学', keys: '密斯卡塔尼克, Miskatonic, 大学, 图书馆, 阿米蒂奇, 特殊馆藏', logic: 'AND_ANY', priority: 20, position: 1,
      content: '密斯卡塔尼克大学始建于1690年，坐落于阿卡姆，是新英格兰一所以神秘学与古文物研究闻名的学府。图书馆藏书丰富，吸引着各地学者前来查阅。\n<% if (getvar(\'剧情.已解锁.密大\') === \'true\') { %>\n亲身造访后会得知：图书馆深处设有戒备森严的"特殊馆藏室"，需院长特批方可进入；中世纪形而上学系的几位教授，对神秘学的钻研远超寻常学术范畴。\n<% } %>\n<% if (getvar(\'剧情.已解锁.密大特殊馆藏\') === \'true\') { %>\n特殊馆藏室中收藏着《死灵之书》拉丁文残卷、《无名祭祀书》《伊波恩之书》等禁忌古籍。校园地下据传有一套隧道，暗中连接着图书馆、教堂与阿卡姆河畔的码头——其用途无人愿意明说。\n<% } %>' }),
    necronomicon: e({ name: '神话典籍', keys: '死灵之书, Necronomicon, 禁忌古籍, 魔法书, 无名祭祀书, 伊波恩之书, 妖蛆的秘密, 塞拉伊诺断章, 典籍, 黄衣之王, 食尸鬼教典, 艾本之书, 水神克塔亚特, 梦境秘典, 无名邪教, 阅读典籍, 研读', logic: 'AND_ANY', priority: 30, position: 1,
      content: '【神话典籍】世间流传着若干被严密封存的禁忌古籍。它们记载着不为常人所知的黑暗知识——据说阅读神话典籍可增长「克苏鲁神话」技能，但每一页都以理智值(SAN)为代价。多数人穷其一生也无缘得见真本。\n<% if (getvar(\'剧情.已解锁.接触禁书\') === \'true\' || getvar(\'剧情.已解锁.密大特殊馆藏\') === \'true\') { %>\n【典籍目录与阅读规则】\n《死灵之书》(拉丁语, 36周) 初阅SAN:1D6 / 通读SAN:2D10 / 神话+15 —— 阿卜杜·阿尔哈兹莱德于公元730年所著，记载旧日支配者历史、宇宙真实构造、召唤仪式。密斯卡塔尼克大学藏有拉丁文残卷。\n《黄衣之王》(法语, 2周) 初阅SAN:1D3 / 通读SAN:2D6 / 神话+5 —— 一部以剧本形式写成的诡异文学作品，阅读者往往在不知不觉间被其内容侵蚀心智。\n《食尸鬼教典》(英语, 4周) 初阅SAN:1D4 / 通读SAN:2D6 / 神话+9 —— 记载食尸鬼习性、地下世界通道与召唤仪式的黑暗典籍。\n《艾本之书》(拉丁语, 24周) 初阅SAN:1D4 / 通读SAN:2D8 / 神话+11 —— 超波里亚时代的魔法典籍，含大量法术与远古知识。\n《水神克塔亚特》(英语, 8周) 初阅SAN:1D3 / 通读SAN:1D8 / 神话+7 —— 记载水栖神话存在与深海仪式的文献。\n《塞拉伊诺断章》(英语, 6周) 初阅SAN:1D3 / 通读SAN:1D6 / 神话+5 —— 记载外星知识的碎片文献。\n《梦境秘典》(英语, 10周) 初阅SAN:1D4 / 通读SAN:2D6 / 神话+8 —— 幻梦境的地理、居民与进入方法的指南。\n《无名邪教》(德语, 8周) 初阅SAN:1D4 / 通读SAN:2D6 / 神话+9 —— 冯·容茨所著，记载各地秘密教团的仪式。\n\n【阅读机制(守秘人规则)】\n1. 调查员开始阅读某典籍时，立即扣除「初阅SAN」。\n2. 用 MVU op 在 /世界/典籍/{典籍名}/weeksRead 记录已阅读周数(初始为0)，每次阅读推进时 +N 周。\n3. 当 weeksRead ≥ 该典籍所需周数时视为通读完成：扣除「通读SAN」(减去已扣的初阅部分)，增加对应的「克苏鲁神话」技能点数。\n4. 阅读进度百分比 = weeksRead / 所需周数 × 100%。\n5. 同一典籍只能通读一次获得神话增长。\n<% } %>' }),
    cthulhu: e({ name: '克苏鲁', keys: '克苏鲁, Cthulhu, 旧日支配者, 拉莱耶, 星之眷族, 克苏鲁教团', logic: 'AND_ANY', priority: 40, position: 1,
      content: '克苏鲁——这个名字在水手、艺术家与通灵者之间以梦魇的形式流传。敏感者会在梦中接收到来自南太平洋深处的精神投射，那种无声的"呼唤"驱使他们走向疯狂。世界各地隐秘活动着崇拜它的教团，低语着"主人终将归来"。\n<% if (parseInt(getvar(\'调查员.技能.克苏鲁神话\') || \'0\') > 0) { %>\n对神话有所了解者方能拼凑出真相：克苏鲁是旧日支配者中最著名的一位——巨大的人形、头部布满触手、背生蝙蝠般的膜翼、躯体覆盖鳞片。它沉睡在南太平洋沉没之城拉莱耶中，等待星辰归位时复苏。星之眷族是其同类，克苏鲁教团则在各地为它的回归铺路。\n<% } %>' }),
    deepones: e({ name: '深潜者', keys: '深潜者, Deep One, 鱼人, 大衮, 海德拉, 两栖, 海底种族', logic: 'AND_ANY', priority: 50, position: 1,
      content: '在印斯茅斯一带的渔民口中，流传着关于"海里的种族"的传说——那些以丰厚渔获和黄金换取祭品的存在，据说栖息在海洋深处。多数人将其当作哄孩子的鬼话，但说起这些时，老渔民总会压低声音。\n<% if (parseInt(getvar(\'调查员.技能.克苏鲁神话\') || \'0\') > 0) { %>\n它们是深潜者：侍奉大衮与海德拉的两栖类人生物，皮肤灰绿覆鳞、手脚生蹼、头部似鱼。它们与人类订立邪恶契约，以黄金渔获换取祭品与混血繁衍；混血后裔中年后会逐渐转变为深潜者形态，下海获得近乎永生。它们几乎不死不灭。\n<% } %>' }),
    mythos_skill: e({ name: '克苏鲁神话技能', keys: '克苏鲁神话, Cthulhu Mythos, 神话知识, 神话技能', logic: 'AND_ANY', priority: 45, position: 1,
      content: '【克苏鲁神话技能(00%)】初始为0，不可通过技能点提升。仅在遭遇神话事件时守秘人允许提升。每次增长克苏鲁神话技能，理智值上限同步下降(99-克苏鲁神话=当前最大SAN)。该技能用于：\n- 识别神话生物、解读禁忌古籍、理解外星科技\n- 发现缺陷法术：已知类似法术时通过「克苏鲁神话」检定+1D8+1小时研究可发现缺陷\n- 深层魔法：SAN归零后施法成功时，投1D100≤克苏鲁神话技能值可发现法术的深层版本\n- 修复缺陷法术：需困难「克苏鲁神话」检定+困难INT检定，且有参考典籍\n成功检定可能获得关键信息，但也可能招致疯狂。' }),
    innsmouth: e({ name: '印斯茅斯', keys: '印斯茅斯, Innsmouth, 马什船长, 印斯茅斯面容, 渔港', logic: 'AND_ANY', priority: 60, position: 1,
      content: '印斯茅斯是马萨诸塞州海岸的一座没落渔港，距阿卡姆东南约20英里。外地人很少踏足，关于它的传闻却不少——据说镇上居民面容奇特、眼睛突出、皮肤粗糙、走路怪异，被周边的人私下称为"印斯茅斯面容"。\n<% if (getvar(\'剧情.已解锁.印斯茅斯\') === \'true\') { %>\n亲临此地会察觉更多端倪：自1840年代起，船长奥巴德·马什与"海中的某种存在"订立契约后，本地渔业异常丰收、黄金莫名流入，但马什家族及其后裔逐渐出现可怕的变异。\n<% } %>\n<% if (getvar(\'剧情.已解锁.印斯茅斯真相\') === \'true\') { %>\n真相令人战栗：镇民世代与深潜者通婚繁衍，所谓"印斯茅斯面容"正是混血后裔向深潜者转变的征兆——他们终将下海，获得近乎永生。1928年，联邦政府曾对该镇发动一场讳莫如深的秘密军事行动。\n<% } %>' }),
    dunwich: e({ name: '敦威治', keys: '敦威治, Dunwich, 沃特雷, Whateley, 哨兵岭, 艾尔斯伯里, 威尔伯', logic: 'AND_ANY', priority: 55, position: 1,
      content: '敦威治是马萨诸塞州中北部艾尔斯伯里峰后方一个偏僻、古怪的没落乡村，蜷缩在密斯卡托尼克河上游峡谷与圆形山丘之间。居民堕落颓废，因近亲通婚而身心退化。半球形山丘顶端耸立着由巨石组成的神秘圆环，当地人提起群山中夜半的隆隆声响时总是讳莫如深。\n<% if (getvar(\'剧情.已解锁.敦威治\') === \'true\') { %>\n深入打探可知：山顶石环据说是古老仪式的遗迹，夜晚常有邪恶的篝火仪式；当地民间信仰把夜鹰视为亡魂的接引者，冷泉峡谷中弥漫着说不清的不祥气味。盘踞此地的沃特雷家族尤其怪异，1928年这里曾发生一桩被称为"敦威治恐怖事件"的惨剧。\n<% } %>\n<% if (getvar(\'剧情.已解锁.敦威治真相\') === \'true\') { %>\n事件真相：沃特雷家族通过邪恶仪式与外神犹格·索托斯产生了联系，诞下半人混血的威尔伯·沃特雷，以及一个不可见的、迅速膨胀的孪生兄弟。最终由密斯卡塔尼克大学的阿米蒂奇博士等人以古老的反制仪式将其终结。\n<% } %>' }),
    yog_sothoth: e({ name: '犹格·索托斯', keys: '犹格·索托斯, Yog-Sothoth, 门之匙, 犹格, 看门者, 万物之门', logic: 'AND_ANY', priority: 42, position: 1,
      content: '"门之匙""看门者"——这些晦涩的名号反复出现在禁忌典籍的字里行间，令翻阅者隐隐不安，却难解其意。乡野间偶有关于"开门"仪式的恐怖传闻。\n<% if (parseInt(getvar(\'调查员.技能.克苏鲁神话\') || \'0\') > 0) { %>\n犹格·索托斯是外神之一，存在于一切时间与空间之中，知晓旧日支配者曾于何处闯入、将于何处再临。《死灵之书》载："犹格·索托斯即是门，即是门之匙，即是看门者。"它没有固定形态，通常显现为聚集的虹彩球体，只有通过最亵渎的仪式才能被短暂召唤。它能与人类繁衍后代——敦威治的沃特雷家族即是此例，其混血后裔生长异常、与父亲所在的维度保持着某种联系。\n<% } %>' }),
    nyarlathotep: e({ name: '奈亚拉托提普', keys: '奈亚拉托提普, Nyarlathotep, 伏行之混沌, 暗夜使者, 阿撒托斯, 千面化身', logic: 'AND_ANY', priority: 43, position: 1,
      content: '"伏行之混沌""暗夜使者"——各地的隐秘教团传说中，都提到一位以千张面孔行走人间的存在。它似乎乐于现身，又从不以真面目示人。\n<% if (parseInt(getvar(\'调查员.技能.克苏鲁神话\') || \'0\') > 0) { %>\n奈亚拉托提普是外神中唯一频繁与人类直接互动者，拥有上千化身（面具），可化身为体面绅士或恐怖怪物。它是盲痴外神阿撒托斯的信使与代行者，在人间播撒疯狂与毁灭，且似乎享受着欺骗与折磨的过程。其教团遍布世界，往往以各种伪装存在——遭遇它的调查员往往直到为时已晚，才认清对方真身。\n<% } %>' }),
    shub_niggurath: e({ name: '莎布·尼古拉丝', keys: '莎布·尼古拉丝, Shub-Niggurath, 黑山羊, 千子之母, 丰饶, 黑山羊幼崽', logic: 'AND_ANY', priority: 44, position: 1,
      content: '在偏远乡村的丰收仪式与暗夜祷文里，反复回响着一个名讳——"千子孕育的森之黑山羊"。农人们以为这是祈求丰饶的古老习俗，却不知自己究竟在向什么献祭。\n<% if (parseInt(getvar(\'调查员.技能.克苏鲁神话\') || \'0\') > 0) { %>\n莎布·尼古拉丝是外神之一，一个与生殖、丰饶相关的恐怖存在，不断产出被称为"黑山羊幼崽"的可怕后代。它与自然界的原始力量深层相连——许多古老的丰收仪式，实为对它的隐秘崇拜。其信徒遍布世界各地的偏远乡村，以血祭与活人献祭换取所谓的"赐福"。\n<% } %>' }),
    elder_things: e({ name: '远古者', keys: '远古者, Elder Things, 远古之物, 星形头部, 桶形生物, 前寒武纪, 太古代', logic: 'AND_ANY', priority: 46, position: 1,
      content: '南极考察记录与某些远古壁画中，提到一种"星形头部"的远古之物——桶形的身躯、海星般的头部。它们的形象太过古怪，以致早期发现者多半将其当作某种奇异的海洋化石。\n<% if (parseInt(getvar(\'调查员.技能.克苏鲁神话\') || \'0\') > 0) { %>\n远古者是地球年轻时从群星降临的古老种族：桶形躯干、五条脊状物、海星形头部与底端、可折叠的膜翼、海百合般精巧的触手肢。它们坚韧得几乎无法摧毁，能在海底高压与星际以太中生存，曾在海陆修建壮丽的巨石城市，并创造了地球上的所有生命——包括充当劳力的修格斯。它们文明高度发达，用五分法数学创作浅浮雕壁画；历经与克苏鲁眷族、米·戈的战争后退缩南极，随冰河时代迁入山脉下方的地下深渊。它们并非怪物，而是会恐惧、会创造、会衰落的智慧生物。\n<% } %>' }),
    shoggoth: e({ name: '修格斯', keys: '修格斯, Shoggoth, 原生质, 不定形, Tekeli-li, 黏液, 肿泡', logic: 'AND_ANY', priority: 47, position: 1,
      content: '修格斯——这个名字只在最晦涩的禁书残页中惊鸿一现，伴随着一句令人毛骨悚然的拟声："Tekeli-li"。极少有人知道它究竟指代何物。\n<% if (parseInt(getvar(\'调查员.技能.克苏鲁神话\') || \'0\') > 0) { %>\n修格斯是远古者创造的原生质奴隶——一团直径约十五英尺的无定形黏性肿泡，能在催眠暗示下塑造出任何临时的肢体与器官，举起惊人的重量。但随时间推移，它们发展出不稳定的自主智力，能独立塑形、甚至模仿主人的声音。二叠纪曾爆发大规模修格斯叛乱；在远古者迁入地下深渊后，修格斯最终征服了自己的创造者。《死灵之书》声称地球上没有修格斯，只有梦中才能想象它们的存在——这是失控造物的终极象征。\n<% } %>' }),
    mad_mountains: e({ name: '疯狂山脉', keys: '疯狂山脉, 南极山脉, 南极探险, 南极考察, 莱克教授, 冷原, 卡达斯', logic: 'AND_ANY', priority: 48, position: 1,
      content: '疯狂山脉是南极大陆腹地一条超越喜马拉雅的巍峨山脉，最高峰超过三万五千英尺，山体由太古代板岩构成。远远望去，山坡上散布着规则得近乎诡异的立方体与壁垒状构造，狂风穿过山间洞穴时会发出涵盖宽广音域、宛如笛声的呜鸣。\n<% if (getvar(\'剧情.已解锁.疯狂山脉\') === \'true\') { %>\n抵近勘察后真相浮现：那些规则构造实为远古者庙宇的风化遗迹；山脉两侧均有远古者的城市废墟，西面更铺展着一座绵延百英里的巨石死城。1930-31年密斯卡塔尼克大学南极考察队来到这里——莱克教授在山脉东侧发掘出远古者化石，随后整支分队遭遇了灭顶之灾。\n<% } %>\n<% if (getvar(\'剧情.已解锁.南极深渊\') === \'true\') { %>\n而在山脉后方的西面更深处，据说还横亘着一条更为恐怖、更为高耸的山脉——连远古者都刻意回避那个方向。那里或许就是传说中冷原上的卡达斯。\n<% } %>' }),
    antarctic_abyss: e({ name: '南极深渊', keys: '深渊, 地下海, 地底城市, 地下世界, 白化企鹅, 地热海洋', logic: 'AND_ANY', priority: 49, position: 1,
      content: '<% if (getvar(\'剧情.已解锁.疯狂山脉\') === \'true\') { %>\n在南极疯狂山脉下方，据那支考察队残存的记录暗示，存在着一片由地下水系掏空形成的巨大深渊，其中似乎蕴藏着一片不见天日的漆黑海洋。\n<% if (getvar(\'剧情.已解锁.南极深渊\') === \'true\') { %>\n亲历者所见远超传闻：地心传来的地热使这片地下海保持温暖，水中栖息着眼睛退化为细缝的巨型白化企鹅。远古者在冰河时代迁入此处，于水底修建了新的城市；通向深渊的隧道从城市地下室起始，经约一英里陡坡抵达崖岸，墙壁刻满仪式壁画。然而远古者终未能在此安存——它们创造的修格斯最终在黑暗中征服了创造者，而那些不定形的原生质恐怖，可能至今仍在深渊中蠕动。\n<% } %>\n<% } %>' }),
    ejs_san_state: e({ name: 'EJS·理智状态', keys: '理智, SAN, 疯狂, 精神', logic: 'AND_ANY', priority: 150, constant: true,
      content: '<%\nconst san = parseInt(getvar(\'调查员.理智值.当前\') || \'99\');\nconst sanMax = parseInt(getvar(\'调查员.理智值.最大\') || \'99\');\nconst ratio = sanMax > 0 ? san / sanMax : 1;\nconst tiActive = getvar(\'调查员.临时疯狂.active\') === \'true\';\nconst tiEntry = getvar(\'调查员.临时疯狂.bout.entry\') || \'症状不明\';\nconst tiRounds = parseInt(getvar(\'调查员.临时疯狂.roundsLeft\') || \'0\');\nconst iiActive = getvar(\'调查员.不定性疯狂.active\') === \'true\';\nconst iiDays = parseInt(getvar(\'调查员.不定性疯狂.daysLeft\') || \'0\');\nconst piActive = getvar(\'调查员.永久疯狂\') === \'true\';\n%>\n<% if (piActive) { %>\n[永久疯狂] —— 调查员心智彻底碎裂,已无法继续故事\n<% } else if (iiActive) { %>\n[不定性疯狂中]<% if (iiDays) { %> (剩 <%= iiDays %> 日)<% } %>\n<% } else if (tiActive) { %>\n[临时疯狂中: <%= tiEntry %>]<% if (tiRounds) { %> (剩 <%= tiRounds %> 轮)<% } %>\n<% } else if (san <= 0) { %>\n【精神崩溃】调查员的理智已完全崩溃。守秘人应将调查员描写为永久疯狂状态：幻觉与现实无法区分，可能出现分裂人格、紧张症、极端偏执。调查员的行为不再由玩家完全控制——守秘人可插入不自主的疯狂行为，但每回合至多一次、须简短，并始终为玩家保留可选行动，不得连续多回合完全代替玩家操控。\n<% } else if (san < 20) { %>\n【精神濒临崩溃】调查员的理智所剩无几(SAN:<%= san %>)。描写时强调：持续的幻觉干扰(阴影中的蠕动、墙壁上的面孔)；进入黑暗或封闭空间时会停步、后退或要求照明，相关检定增加一级难度。每次理智检定都可能是最后一次。\n<% } else if (san < 40) { %>\n【精神不稳定】调查员的精神状态令人担忧(SAN:<%= san %>)。偶尔出现轻微幻觉——角落里一闪而过的阴影、不存在的低语声。睡眠质量恶化，噩梦频繁；与人交谈时容易分神、答非所问，社交类检定可增加难度。\n<% } else if (ratio < 0.6) { %>\n【精神紧绷】调查员经历了足够多的恐怖事件，精神开始出现裂痕。偶尔会回忆起之前遭遇的可怕景象，对陌生环境的警惕性明显提高。\n<% } else { %>\nSAN <%= san %>/<%= sanMax %>\n<% } %>' }),
    ejs_hp_state: e({ name: 'EJS·生命状态', keys: '生命值, HP, 受伤, 伤害', logic: 'AND_ANY', priority: 149, constant: true,
      content: '<%\nconst hp = parseInt(getvar(\'调查员.生命值.当前\') || \'99\');\nconst hpMax = parseInt(getvar(\'调查员.生命值.最大\') || \'99\');\n%>\n<% if (hp <= 0) { %>\n【濒死状态】调查员已倒下，生命垂危。无法进行任何主动行动。若不在1D6轮内接受急救(困难急救检定)，调查员将死亡。描写时强调意识模糊、视野变暗、身体失去知觉。\n<% } else if (hp <= 2) { %>\n【重伤】调查员伤势严重(HP:<%= hp %>/<%= hpMax %>)。每次行动都伴随剧痛。移动速度减半，所有物理技能检定增加一级难度。血迹会暴露行踪。需要尽快接受医疗救治。\n<% } else if (hp < hpMax * 0.4) { %>\n【负伤】调查员带着明显的伤势(HP:<%= hp %>/<%= hpMax %>)。疼痛影响注意力，某些需要体力的行动可能受到影响。外伤明显可见(渗血、绷带、行动迟缓)，会暴露其负伤状态。\n<% } %>' }),
    ejs_combat: e({ name: 'EJS·战斗模式', keys: '战斗, 格斗(斗殴), 攻击', logic: 'AND_ANY', priority: 148, constant: true,
      content: '<% if (getvar(\'战斗.是否战斗中\') === \'true\') { %>\n【战斗进行中·当前状态】第 <%= getvar(\'战斗.回合数\') || \'?\' %> 回合;敌人 / 弹药 / 距离的具体数值见上方 statSnapshot 战斗节点。战斗规则细节(DEX 先攻/格斗反击/火器距离/选项 4 类)由 mvu_rules.combat 统一定义,本条不重复。本回合叙事重点:武器碰撞的声响、鲜血气味、对手的招式与破绽、距离与掩体的变化。\n<% } %>' }),
    ejs_time_atmosphere: e({ name: 'EJS·时间氛围', keys: '时间, 氛围, 环境', logic: 'AND_ANY', priority: 145, constant: true,
      content: '<%\nconst time = getvar(\'世界.时间\') || \'\';\nconst weather = getvar(\'世界.天气\') || \'\';\n%>\n<% if (time === \'深夜\' || time === \'夜晚\' || time === \'黄昏\') { %>\n【夜间/昏暗氛围】当前是<%= time %>。描写时强调：昏暗的光线(月光/煤油灯/手电筒的有限照明)、拉长的阴影、远处不明的声响、夜行生物的动静。视觉类检定(侦查/导航)增加难度。黑暗中的未知比白天更加压迫人心。\n<% } %>\n<% if (weather.includes(\'暴\') || weather.includes(\'雷\')) { %>\n【恶劣天气】当前天气：<%= weather %>。风雨/风雪遮蔽视听，户外行动的所有检定增加难度。雷声可能掩盖其他声响，也可能在关键时刻制造惊吓。淋湿的衣物、泥泞的道路、能见度降低——这些都会影响调查员的行动和判断。\n<% } else if (weather.includes(\'雨\') || weather.includes(\'雪\')) { %>\n【阴雨风雪】当前天气：<%= weather %>。淅沥的雨水或纷飞的风雪打湿、阻滞着行程，能见度下降、声响被掩盖；户外行动与远距观察的检定可酌情增加难度，湿冷也消磨着调查员的耐心。\n<% } else if (weather.includes(\'雾\')) { %>\n【雾中迷途】<%= weather %>笼罩着周围的一切。能见度大幅降低，远处的轮廓模糊不清。方向感变得不可靠——导航检定增加难度。雾会同时遮蔽调查员与他人的视听，雾中的声音被扭曲、难以判断来源与距离。\n<% } %>' }),
    ejs_human_needs: e({ name: 'EJS·调查员生理常识', keys: '生理, 常识, 困倦, 饥饿, 口渴, 疲惫, 凌晨, 困意', logic: 'AND_ANY', priority: 144, constant: true,
      content: '<%\nconst time = getvar(\'世界.时间\') || \'\';\n%>\n<% if (time === \'深夜\' || time === \'凌晨\') { %>\n【生理常识·夜深】调查员是正常人,深夜/凌晨会自然有困意——揉眼睛、打哈欠、想靠墙闭眼一会儿、需要咖啡或浓茶提神;长时间清醒会注意力下降、反应迟钝(可酌情让侦查/聆听类检定增加难度)。把这些自然写进动作与对白,不开新状态条件,不要写成具体 HP/SAN 数值。\n<% } else if (time === \'夜晚\' || time === \'黄昏\') { %>\n【生理常识·入夜】夜幕渐合,调查员开始感到一日的疲劳——肩颈酸、想找地方坐下、惦记着热汤或一杯酒。日常生理需求(吃饭/休息/取暖)是活人会有的反应,自然写进动作与场景,不写成机制数值。\n<% } else if (time === \'清晨\' || time === \'上午\' || time === \'午后\') { %>\n【生理常识·日间】白天行动也是活人——长时间走路腿酸、剧烈运动后会喘、空腹太久胃会抽动、跑步出汗会想喝水。把这些细节自然写进动作、对白、场景,但不要变成机制状态条件,也不要列出 HP/SAN 数字。\n<% } %>' }),
    ejs_plot_phase: e({ name: 'EJS·剧情阶段', keys: '剧情, 阶段, 暗线', logic: 'AND_ANY', priority: 147, constant: true,
      content: '<%\nconst phase = getvar(\'剧情.阶段\') || \'调查期\';\nconst threat = getvar(\'剧情.暗线.威胁等级\') || \'潜伏\';\nconst progress = parseInt(getvar(\'剧情.暗线.进度\') || \'0\');\n%>\n<% if (phase === \'高潮\') { %>\n【高潮阶段】剧情已进入高潮。节奏加快，危险迫在眉睫。守秘人应：减少安全的喘息空间，让每个选择都有重大后果，暗线威胁直接显现为可见的危险。NPC的真实面目开始暴露，之前的伏笔应在此刻汇聚。\n<% } else if (phase === \'结局\') { %>\n【结局阶段】故事即将收束。根据调查员的表现和选择，引导向合理的结局。暗线的真相完全揭露。确保所有重要伏笔有所回应。结局类型应与调查员的行为、牺牲和智慧相匹配。\n<% } else if (phase === \'后日谈\') { %>\n【后日谈】主线已结束。描写事件的余波——调查员如何面对经历过的恐怖、世界因事件发生了什么变化、幸存的NPC后来怎样了。语调从紧张转为沉思与感伤。\n<% } %>\n<% if (threat === \'爆发\' && phase !== \'结局\' && phase !== \'后日谈\') { %>\n【暗线爆发】暗线威胁已达爆发级别(进度:<%= progress %>%)。隐藏的恐怖开始公然显现——不可忽视的超自然现象、大规模的异常事件、NPC的恐慌蔓延。调查员必须尽快行动，否则后果不堪设想。\n<% } else if (threat === \'紧迫\') { %>\n【暗线紧迫】暗线危机加剧(进度:<%= progress %>%)。越来越多的间接迹象暗示着巨大的危险正在逼近——不祥的预兆、失踪事件、动物的异常行为。时间不多了。\n<% } else if (threat === \'浮现\') { %>\n【暗线浮现】不安的迹象开始浮出水面(进度:<%= progress %>%)——零星的怪事、欲言又止的证人、说不清的违和感。危险尚不紧迫，但已不容忽视，正是着手调查、延缓暗线推进的时机。\n<% } %>' }),
    ejs_npc_hostility: e({ name: 'EJS·NPC关系', keys: 'NPC, 态度, 敌意, 敌人, 对抗', logic: 'AND_ANY', priority: 140,
      content: '【NPC关系提醒】NPC的态度值(-100到100)会影响他们的行为：\n- 态度>50：友善，主动提供帮助和信息\n- 态度0~50：中立，需要说服或交换才会配合\n- 态度-50~0：冷淡或警惕，可能拒绝配合或隐瞒信息\n- 态度<-50：敌意，可能主动阻碍、欺骗甚至攻击调查员\n请根据剧情.NPC中记录的态度值来决定NPC的行为方式。极端事件可使态度大幅变化(±20~50)。' }),
    san_bubble_trigger_spec: e({ name: 'SAN check 气泡触发规范', keys: '理智气泡, 内联检定, 被动检定', logic: 'AND_ANY', priority: 142, constant: true,
      content: '【理智气泡触发规范 — 守秘人参考，被动 SAN check 何时嵌】\n仅当调查员在叙事正文中【被动地、不可回避地】目击/听见/经历精神冲击时,才在该段落里紧贴触发文字嵌一个 <san id="N"/> 内联标签,并在主 JSON 顶层 sanityCheckPrompts 给出对应条目。\n\n典型触发与扣损(0/N 表示 通过/失败):\n- 目击同伴死亡 — POW normal — 0/1D6\n- 见神话生物(首次目击普通) — POW normal — 1/1D10\n- 见神话生物(高阶/恐怖) — POW hard — 1D3/1D10+1\n- 阅读神话典籍片段 — INT normal — 0/1D6\n- 解开真相级线索(揭示残酷事实) — INT normal — 0/1D4\n- 短时不可名状现象(声响/气味/感觉) — POW normal — 0/1D3\n- 目睹尸体/血腥现场(非战斗) — POW normal — 0/1D2\n- 经历魔法仪式(非自愿) — POW hard — 1/1D6\n- 撞见恐怖真相(亲人是怪物/邪教首领) — POW normal — 1/1D8\n\n[叙事铺垫硬要求] —— 决定 emit sanityCheckPrompt 前必须满足：\n1. 叙事正文 (leftContent 或 rightContent) 中必须先有【至少 60 字】的恐怖元素描写——\n   感官细节（视觉扭曲 / 不属于正常物理的声音 / 不该有的腥臭或冷意 / 触觉反常）\n   或目击具体可怕事件（同伴被某物撕碎 / 尸体下意识抽搐 / 不可名状形体浮现）\n   或心理冲击（突然失去对真实的把握 / 意识被某种存在直接窥视 / 既往认知崩塌）\n2. 严禁仅用「察觉到不自然 / 感到诡异 / 一阵寒意」这类含糊措辞就直接掷出 SAN check\n3. <san id="N"/> 标签必须紧贴在【铺垫描写的最后一句】之后，让玩家在按下气泡前\n   已经从叙事里感受到「为什么这值得扣 SAN」\n4. trigger 字段必须**复述铺垫描写中最具冲击力的具体细节**，不可仅写「不自然的空白」\n   这种抽象短语——以便面板显示时玩家能看到原叙事的恐怖具象\n5. 仅当本回合叙事真的出现了可触 SAN 的场景才产 prompt；普通氛围紧张但无具体异常不产\n\n硬规则:\n- 一回合通常 0-1 个气泡; 极端目击场景最多 2 个。\n- 日常恐惧/单纯紧张/玩家主动选择查看(走选项检定) 不嵌气泡。\n- 气泡是【独立于选项检定】的被动通路: 选项 action 仍可写"进行理智检定(0/1D6)"作主动检定。\n- 触发的 trigger 字段必须是给玩家可见的一句话(写"目睹同伴被撕碎",不写"<san> 标签触发")。\n- difficulty 默认 normal; 仅当典籍/真相过于不可名状时升 hard/extreme。' }),
  }},
  coc_magic: { name: 'COC魔法规则', enabled: true, entries: {
    magic_basics: e({ name: '魔法基础', keys: '魔法, 法术, 施法, 咒语, 仪式', logic: 'AND_ANY', priority: 880, constant: true,
      content: '【神话魔法基础】克苏鲁神话的魔法不同于奇幻魔法——它是有敌意的，在帮助施法者的同时必让其付出代价。行使异界能量会让行使者受诅咒，魔法会摧毁道德品行、撕碎理智与人性。\n施法要求：\n- 精神状态：施法需专注和冥想，外界干扰(恶劣环境/战斗)需通过INT检定保持专注\n- 施法区域：复杂法术需净化施法区域，旧法术残余可能污染新法术\n- 牺牲本质：牺牲必须对施法者有价值——俘获的敌人无效，但砍下自己的手可以；随便偷来的牲畜无效，需是心爱之物\n- 天象影响：月相(上弦月利召唤/满月利赋能/下弦月利驱逐/新月利占卜)、节气(萨温节/冬至/春分等)、行星合等可影响法术效果\n- 七曜：周一(梦境/回复)周二(战斗/灾祸)周三(交流/预言)周四(好运/召唤)周五(创造力)周六(防护/驱逐)周日(意志/力量)' }),
    spell_casting: e({ name: '施法规则', keys: '施法, 法术消耗, 魔法值, MP, POW, 施法用时, 深层魔法, 缺陷魔法', logic: 'AND_ANY', priority: 879, constant: true,
      content: '【施法规则】法术三要素：消耗(MP/POW/SAN等)、描述(视觉效果)、效果(游戏机制)。\n施法时间：即时=施法者DEX+50生效(同准备枪械)；1轮=本轮DEX生效；2轮=次轮DEX生效。\n深层魔法：SAN=0的疯狂巫师可发现法术的更强版本。调查员在疯狂中成功施法时投1D100≤「克苏鲁神话」则发现深层版本。深层魔法代价更大但效果更强。\n缺陷魔法：抄写翻译错误导致的有缺陷法术。施放时60%无效(消耗照扣)，40%出错——可能环境异变(血从地下喷涌/异界生物漂浮)、施法者副作用(皮肤变色/目盲)、效果扭曲(选择消耗相近的其他法术效果)。已知类似法术可通过「克苏鲁神话」检定发现缺陷。\n施法困难：人祭需理智检定失败才能执行(通过则良心发现拒绝)，参与者均损失SAN。' }),
    spell_categories: e({ name: '法术分类', keys: '法术分类, 召唤术, 请神术, 联络术, 通神术, 束缚术, 送神术', logic: 'AND_ANY', priority: 878, constant: true,
      content: '【法术分类辨析】\n请神术：极强仪式，将神祇物理形态展现于施法者面前。邪教团体用来召唤崇拜的神享用祭品。对应"送神术"可将神祇遣返。\n联络/通神术：交流请求，类似"神秘电话"。对生物使用会带一个以上生物自由前来(不受控)；对神祇使用开启交流但不产生物理形态。\n召唤术：强迫怪物(不能是神)出现并可被束缚执行命令。\n其他分类：战斗魔法(攻击/防御/伤害)、交流魔法(心灵感应/梦境发送)、附魔魔法(赋予物品魔力)、环境魔法(天气/地形改变)、续命魔法(不朽/转移/复活)、保护魔法(防护/驱逐/守卫)、变形魔法(形体改变/灵魂转移)、旅行魔法(传送/飞行/时空门)、加害魔法(诅咒/疾病/精神攻击)。' }),
    sacrifice_rules: e({ name: '牺牲与代价', keys: '牺牲, 祭品, 人祭, 血祭, 活祭, 献祭', logic: 'AND_ANY', priority: 877, constant: true,
      content: '【牺牲规则】几乎所有法术都要求牺牲(MP/POW/SAN或实物)。核心原则：\n- 价值原则：牺牲必须对施法者有价值。随便抓来的敌人无效，但对神话神祇的祭品(任何人)可令其满意\n- 人祭：执行前需理智检定并失败——通过意味着良心不允许。参与者均损失SAN，并可能腐化背景连接(信念/关系)\n- 道德困境：牺牲心爱宠物vs法术失败、砍下自己的手vs弟弟死亡——这些选择定义调查员的道德走向\n- 忘记给神话生物奉上合适祭品的巫师，会发现自己变成了祭品\n- 法术成分：仪式刀(引导能量)、魔法书(典籍)、香炉(净化/催眠)、占卜用具(水晶球/符文)、杖(指向目标)、祭坛、釜(酿造药剂)' }),
    folk_magic: e({ name: '民俗魔法', keys: '民俗魔法, 民俗, 巫医, 萨满, 祝福, 诅咒, 治愈法, 动物魅惑', logic: 'AND_ANY', priority: 876, constant: true,
      content: '【民俗魔法】一种"漂白"的神话魔法，人类掌握并代代口耳相传。通常只有萨满、巫医才掌握，不见于任何神话典籍。虽被削弱且施法者不清楚原理，但仍从隐蔽的神话脉络获取能量。\n民俗法术倾向产生诅咒和祝福，看起来更像"实用"法术。包括：占卜法、祝福法、诅咒法、动物魅惑法、治愈法、失物找寻法、符咒创建法、风暴创建法、爱情魔药酿造法、灵魂之歌等。\n民俗魔法是可选规则——如果觉得治愈法和动物魅惑法不适合恐怖游戏，可以忽略。' }),
    dreamlands_magic: e({ name: '幻梦境魔法', keys: '幻梦境, 梦境, 梦想家, 幻梦, 梦境法术', logic: 'AND_ANY', priority: 875, constant: true,
      content: '【幻梦境魔法】仅在幻梦境学习和施放的特殊魔法。梦想家醒来后不记得幻梦境法术，下次入梦时才会想起。\n幻梦境人施放清醒世界法术(非幻梦境法术)时只损失法术的最小SAN值。但施放幻梦境法术仍需支付正常SAN消耗。\n幻梦境法术包括：咒逐术(驱散法术/遣返召唤生物)、退化术、不透明之墙、灵魂窃取术、螺旋升空术、远行涡流术等。这些法术更像奇幻魔法，体现梦境的可能性和缥缈神奇。KP可扭曲幻梦境法术使其更黑暗——如让防护墙由地下世界的尸骨组成。' }),
    known_spell_costs: e({ name: '已知法术消耗参照', keys: '法术, 施法, 已知法术, 法术消耗, 施法消耗', logic: 'AND_ANY', priority: 874, constant: false,
      content: '<%\nconst ks = (getvar(\'调查员.已知法术\') || \'\').split(\',\').map(s => s.trim()).filter(Boolean);\n%>\n<% if (ks.length > 0) { %>\n【已知法术消耗速查】调查员已习得以下法术，施法时必须按表扣除 MP 和 SAN:\n<% const catalog = { "远古之眼":{mp:3,san:2,t:"1轮"}, "纳塞恩之歌":{mp:4,san:3,t:"3轮"}, "灵魂附着":{mp:8,san:5,t:"10分钟"}, "意志之门":{mp:5,san:3,t:"1轮"}, "痛苦蛊咒":{mp:6,san:4,t:"2轮"}, "黄衣召唤":{mp:10,san:8,t:"1小时"}, "暗影遮蔽":{mp:2,san:1,t:"1轮"}, "尤格索特斯之钥":{mp:12,san:10,t:"30分钟"}, "精神屏障":{mp:5,san:2,t:"1轮"}, "命运之线":{mp:3,san:1,t:"5分钟"}, "旧印封缄":{mp:8,san:4,t:"10分钟"}, "死者之语":{mp:6,san:5,t:"15分钟"} }; %>\n<% for (const name of ks) { const c = catalog[name]; if (c) { %>- <%= name %>: MP<%= c.mp %> / SAN<%= c.san %> / <%= c.t %>\n<% } } %>\n[硬规则] 施法时你 MUST 在 MVU delta 中同时 emit:\n  { "path":"调查员.魔法值.当前", "op":"add", "value": -<MP消耗> }\n  { "path":"调查员.理智值.当前", "op":"add", "value": -<SAN消耗> }\n若当前 MP 不足则施法失败(MP 不可降至负数)。\n<% } %>' }),
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
  /** 按指定 id 写入 book（剧本系统挂载条目用，已存在则替换；与 importBook 区别是 id 由调用方决定） */
  upsertBook: (id: string, book: LoreBook) => void;
  /** 按 id 移除 book，内置 book 不可移除 */
  removeBook: (id: string) => void;
  deleteBook: (id: string) => void;
  toggleBook: (id: string) => void;
  setBookScope: (id: string, scope: 'global' | 'chat') => void;
  upsertSummaryEntry: (pageId: string, keys: string, content: string, name: string) => void;
  removeSummaryEntry: (pageId: string) => void;
  clearSummaryEntries: () => void;
  /** 按前缀替换 book 内的若干 entries（剧本关系条目用）：删除所有 id 以 prefix 开头的旧条目，再把新条目写入。book 不存在则静默跳过。 */
  upsertEntries: (bookId: string, entries: Record<string, LoreEntry>, opts: { prefix: string }) => void;
}

export const useLorebookStore = create<LorebookStore>()(
  persist(
    (set) => ({
      books: { ...defaultBooks },
      updateEntry: (b, e, entry) => set((s) => {
        const books = { ...s.books };
        if (isBuiltinEntry(b, e)) {
          // 内置条目只读：内容随应用版本托管（rehydrate 强制同步），运行时仅接受启用/禁用变更，
          // 其余字段始终采用系统默认，避免「编辑后刷新被覆盖」的不一致。需自定义请复制为新条目。
          const def = defaultBooks[b].entries[e];
          books[b] = { ...books[b], entries: { ...books[b].entries, [e]: { ...def, disabled: entry.disabled } } };
          return { books };
        }
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
      upsertBook: (id, book) => set((s) => {
        const books = { ...s.books, [id]: book };
        return { books };
      }),
      removeBook: (id) => set((s) => {
        if (defaultBooks[id]) return s;
        const books = { ...s.books };
        delete books[id];
        return { books };
      }),
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
      setBookScope: (id, scope) => set((s) => {
        if (!s.books[id]) return s;
        const books = { ...s.books, [id]: { ...s.books[id], scope } };
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
            [entryId]: e({ name, keys, content, logic: 'AND_ANY', priority: 5, position: 4, depth: 4 }),
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
      upsertEntries: (bookId, entries, opts) => set((s) => {
        const book = s.books[bookId];
        if (!book) return s;
        const filtered: Record<string, LoreEntry> = {};
        for (const [eid, entry] of Object.entries(book.entries)) {
          if (!eid.startsWith(opts.prefix)) filtered[eid] = entry;
        }
        for (const [eid, entry] of Object.entries(entries)) {
          filtered[eid] = entry;
        }
        return { books: { ...s.books, [bookId]: { ...book, entries: filtered } } };
      }),
    }),
    {
      name: 'coc_lorebooks_v1',
      storage: createJSONStorage(createDexieStorage),
      partialize: (state) => stripFunctions(state) as Partial<LorebookStore>,
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const LOGIC_MAP: Record<string, string> = { AND: 'AND_ALL', OR: 'AND_ANY', NOT: 'NOT_ANY' };
        const NEW_DEFAULTS: Partial<LoreEntry> = {
          secondaryKeys: '', scanDepth: 0, caseSensitive: 0, matchWholeWord: 0,
          groupScoring: 0, automationId: '', inclusionGroup: '', prioritizeInclusion: false,
          groupWeight: 100, sticky: 0, cooldown: 0, delay: 0,
          preventRecursion: true, delayUntilRecursion: false, excludeRecursion: false,
          ignoreReplyLimit: false,
        };
        // 单遍 in-place 合并 —— 旧实现对每个 entry 都做 {...book, entries:{...book.entries, [eid]: ...}}
        // 双层 spread,N 本书 × M 条目复杂度 O(N×M²)(每条 entry 触发整本 entries map 浅拷)。
        // 改为:每本书只浅拷一次 entries map,内层 in-place 赋值。复杂度 O(N+M)。
        const merged: typeof state.books = { ...state.books };
        for (const [bookId, defaultBook] of Object.entries(defaultBooks)) {
          const existingBook = merged[bookId];
          if (!existingBook) {
            merged[bookId] = defaultBook;
            continue;
          }
          const nextEntries: Record<string, LoreEntry> = { ...existingBook.entries };
          for (const [entryId, defaultEntry] of Object.entries(defaultBook.entries)) {
            const existing = nextEntries[entryId];
            // 已存在的内置条目:强制同步系统 content(随版本更新),仅保留用户的 disabled 状态
            // 避免老存档停留在旧版「无条件吐全文」版本。缺失则补入最新默认。
            nextEntries[entryId] = existing
              ? { ...defaultEntry, disabled: existing.disabled }
              : defaultEntry;
          }
          merged[bookId] = { ...existingBook, entries: nextEntries };
        }
        // Migrate old logic values + 补全新字段(ALL entries, 含用户自创书)
        for (const book of Object.values(merged)) {
          for (const eid in book.entries) {
            const raw = book.entries[eid] as unknown as Record<string, unknown>;
            const mappedLogic = LOGIC_MAP[raw.logic as string];
            if (mappedLogic) raw.logic = mappedLogic;
            for (const k in NEW_DEFAULTS) {
              if (raw[k] === undefined) raw[k] = (NEW_DEFAULTS as Record<string, unknown>)[k];
            }
          }
        }
        // 已废弃的内置书:从老存档清理(洛夫克拉夫特文风已并入双人成行预设;每回合推进约束由 format-instruction 承担)。
        delete merged['coc_style'];
        // 已废弃的内置条目:从老存档清理(MVU 协议双写 mvu_core/mvu_output_format 已归 format-instruction 唯一所有,
        // SAN 触发表归 san_bubble_trigger_spec,见 commit 「三处指令去重」)。
        if (merged['mvu_rules']?.entries) {
          const e = { ...merged['mvu_rules'].entries };
          delete e['mvu_core'];
          delete e['mvu_output_format'];
          merged['mvu_rules'] = { ...merged['mvu_rules'], entries: e };
        }
        state.books = merged;
      },
    }
  )
);

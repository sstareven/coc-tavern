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

const defaultBooks: Record<string, LoreBook> = {
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
      content: '<status_current_variable>\n调查员.生命值: {{getvar::调查员.生命值.当前}}/{{getvar::调查员.生命值.最大}}\n调查员.理智值: {{getvar::调查员.理智值.当前}}/{{getvar::调查员.理智值.最大}}\n调查员.魔法值: {{getvar::调查员.魔法值.当前}}/{{getvar::调查员.魔法值.最大}}\n调查员.幸运: {{getvar::调查员.幸运}}\n世界.日期: {{getvar::世界.日期}} | 世界.时间: {{getvar::世界.时间}}\n世界.地点: {{getvar::世界.地点}} | 世界.天气: {{getvar::世界.天气}}\n剧情.当前章节: {{getvar::剧情.当前章节}}\n</status_current_variable>' }),
  }},
  coc_lore: { name: '克苏鲁深渊档案馆', enabled: true, entries: {
    arkham: e({ name: '阿卡姆镇', keys: '阿卡姆, Arkham, 城镇', logic: 'OR', priority: 10,
      content: '阿卡姆是马萨诸塞州北部的古老城镇，始建于17世纪晚期。镇上最著名的建筑是密斯卡塔尼克大学，其图书馆收藏了大量禁忌古籍。近年来发生一系列无法解释的事件：墓地尸体被盗、密斯卡塔尼克河中奇异的发光现象、大学实验室深夜传出的非人尖叫。镇上居民对外来者警惕，关于女巫集会、神秘失踪和森林中怪异仪式的传说世代流传。' }),
    miskatonic: e({ name: '密斯卡塔尼克大学', keys: '密斯卡塔尼克, Miskatonic, 大学, 图书馆', logic: 'OR', priority: 20,
      content: '密斯卡塔尼克大学始建于1690年，以神秘学和古文物研究闻名。图书馆"特殊馆藏室"需院长特批才能进入，收藏《死灵之书》《无名祭祀书》《伊波恩之书》等禁忌古籍。校园地下隧道传说连接着图书馆、教堂和阿卡姆河畔码头。中世纪形而上学系的教授们对克苏鲁神话的研究远超常人想象。' }),
    necronomicon: e({ name: '死灵之书', keys: '死灵之书, Necronomicon, 禁忌古籍', logic: 'OR', priority: 30,
      content: '《死灵之书》(Kitab al-Azif)是阿拉伯疯子阿卜杜·阿尔哈兹莱德于公元730年所著的禁忌之书。密斯卡塔尼克大学图书馆藏有一本拉丁文译本残卷。该书详细记载了旧日支配者的历史、宇宙的真实构造、召唤外神的仪式。阅读此书的人常常会逐渐失去理智。' }),
    cthulhu: e({ name: '克苏鲁', keys: '克苏鲁, Cthulhu, 旧日支配者, 拉莱耶', logic: 'OR', priority: 40,
      content: '克苏鲁是旧日支配者中最著名的一位：巨大的人形、头部布满触手、背后生有蝙蝠般的膜翼、身躯覆盖鳞片。它目前沉睡在南太平洋沉没的城市拉莱耶中，等待星辰归位时复苏。它的梦境能影响敏感的人类——艺术家和通灵者会在梦中接收到精神投射，这种"呼唤"驱使他们疯狂。克苏鲁教团在世界各地秘密活动，等待主人回归。' }),
    deepones: e({ name: '深潜者', keys: '深潜者, Deep One, 鱼人, 印斯茅斯, 大衮', logic: 'OR', priority: 50,
      content: '深潜者是侍奉大衮与海德拉的两栖类人生物，皮肤呈灰绿色覆盖鳞片，手脚生有蹼，头部像鱼。主要栖息于海洋深处，在印斯茅斯镇附近尤其活跃。它们与人类订立邪恶契约——以黄金和渔获换取祭祀品与混血繁衍。混血后裔中年后会逐渐转变为深潜者形态。深潜者几乎永生不死。' }),
    mythos_skill: e({ name: '克苏鲁神话技能', keys: '克苏鲁神话, Cthulhu Mythos, 神话知识', logic: 'OR', priority: 45,
      content: '【克苏鲁神话技能(00%)】初始为0，不可通过技能点提升。仅在遭遇神话事件时守秘人允许提升。每次增长克苏鲁神话技能，理智值上限同步下降(99-克苏鲁神话=当前最大SAN)。该技能用于识别神话生物、解读禁忌古籍、理解外星科技。成功检定可能获得关键信息，但也可能招致疯狂。' }),
    innsmouth: e({ name: '印斯茅斯', keys: '印斯茅斯, Innsmouth', logic: 'OR', priority: 60,
      content: '印斯茅斯是马萨诸塞州海岸的没落渔港，距阿卡姆东南约20英里。镇上居民面容奇特——眼睛突出、皮肤粗糙、走路怪异——被称为"印斯茅斯面容"。1840年代船长奥巴德·马什与海中存在订立契约后，渔业丰收黄金流入，但后裔出现可怕变异。1928年联邦政府曾对该镇进行秘密军事行动。' }),
  }},
};

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
    }),
    {
      name: 'coc_lorebooks_v1',
      storage: createJSONStorage(createDexieStorage),
      partialize: (state) => stripFunctions(state) as Partial<LorebookStore>,
    }
  )
);

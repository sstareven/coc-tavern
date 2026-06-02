// AUTO-GENERATED 双人成行融合菜单（对齐官方「双人成行悬浮窗」脚本的分组结构）。
// 匹配 key = option.name = 官方 data-kw 原文（含 emoji/装饰），即 importPresetFromST 保留的
// PromptItem.name；PresetSwitchOverlay 按 name 匹配预设条目（DS/向斜阳两版通用）。
// displayName = 菜单显示名。取舍：剔除「组件渲染」整组（与 COC 纯 JSON 冲突），仅归并其有用项
// 到「补丁与玩法」；跳过官方有、本预设缺的条目（细腻情感/草稿/思考模式简繁/自由CoT/卡COT）。
export interface FusionOption { name: string; displayName?: string; hint?: string; }
export interface FusionSub { title?: string; single: boolean; label?: string; effect?: string; options: FusionOption[]; }
// exclusive=true: 整组跨子块单选（文风库——底层共用一个 setvar 变量，只能一个生效）。
export interface FusionGroup { title: string; desc: string; exclusive?: boolean; subs: FusionSub[]; }
export const FUSION_MENU: FusionGroup[] = [
  {
    "title": "人称与话语权调度",
    "desc": "调节叙述视角与用户话语权：选人称、调 user 台词量与对白比例。各项按需开关。",
    "subs": [
      {
        "title": "叙述视角",
        "single": true,
        "label": "叙述视角",
        "effect": "决定正文以谁的视角叙述；只能选一种",
        "options": [
          {
            "name": "🕐第一人称",
            "displayName": "第一人称",
            "hint": "以「我」为主语，聚焦主观所见所感，代入感强"
          },
          {
            "name": "🕑第二人称",
            "displayName": "第二人称",
            "hint": "以「你」为主语描述，亲密又略带疏离的代入"
          },
          {
            "name": "🕒第三人称",
            "displayName": "第三人称",
            "hint": "所有角色含user都用第三人称，多用名字指代"
          },
          {
            "name": "🕒群像视角",
            "displayName": "群像视角",
            "hint": "AI完全无视笑脸，只支配角色卡里的人物"
          },
          {
            "name": " 👑上帝模式",
            "displayName": "上帝模式",
            "hint": "你变导演决定剧情，笑脸user才是真主角"
          },
          {
            "name": "🕒自定义视角",
            "displayName": "自定视角"
          }
        ]
      },
      {
        "title": "User发言量",
        "single": true,
        "label": "User发言",
        "effect": "控制你在正文里说多少话；只能选一种",
        "options": [
          {
            "name": "😲user全是话",
            "displayName": "全是话"
          },
          {
            "name": "🤐user不说话",
            "displayName": "不说话"
          },
          {
            "name": "😏user的嘴替",
            "displayName": "User嘴替"
          },
          {
            "name": "😀自定义user选项",
            "displayName": "自定User"
          }
        ]
      },
      {
        "title": "对白与中心",
        "single": false,
        "label": "对白",
        "effect": "调整对白比例与 user 中心度",
        "options": [
          {
            "name": "🗨增加对白",
            "displayName": "增加对话"
          },
          {
            "name": "🗨增加NPC对白",
            "displayName": "增NPC对话"
          },
          {
            "name": "🎫// COT //User去中心化",
            "displayName": "去中心化"
          },
          {
            "name": "👤user基准性格",
            "displayName": "User基准性格"
          }
        ]
      }
    ]
  },
  {
    "title": "情感基调",
    "desc": "决定故事整体情感走向，会显著影响剧情。只能开一个，也可不开。",
    "subs": [
      {
        "single": true,
        "label": "情感基调",
        "effect": "为正文定下整体情绪；只能选一种",
        "options": [
          {
            "name": "●积极",
            "displayName": "● 积极"
          },
          {
            "name": "●治愈",
            "displayName": "● 治愈"
          },
          {
            "name": "●消极",
            "displayName": "● 消极"
          },
          {
            "name": "●伤感",
            "displayName": "● 伤感"
          },
          {
            "name": "●基调为空",
            "displayName": "● 基调为空"
          }
        ]
      }
    ]
  },
  {
    "title": "特色文风滤镜库",
    "desc": "正文叙述风格库，全库单选：选一个自动关其它，再点当前项清空、回到自由发挥。",
    "subs": [
      {
        "title": "克苏鲁向（默认）",
        "single": true,
        "label": "克苏鲁向（默认）",
        "effect": "洛夫克拉夫特式宇宙恐怖（默认文风）",
        "options": [
          {
            "name": "洛夫克拉夫特文风",
            "displayName": "克苏鲁向（默认）",
            "hint": "古典克苏鲁式神秘恐怖叙事（默认文风）"
          }
        ]
      },
      {
        "title": "轻松温馨向",
        "single": true,
        "label": "轻松温馨向",
        "effect": "日系轻松、对白丰富、温软甜美",
        "options": [
          {
            "name": "烤面包机@电波系",
            "displayName": "烤面包机",
            "hint": "电波系，于平凡荒诞中提炼温暖笑点"
          },
          {
            "name": "流转心跳叙事@四神花ル水",
            "displayName": "流转心跳"
          }
        ]
      },
      {
        "title": "情绪表达向",
        "single": true,
        "label": "情绪表达向",
        "effect": "偏氛围与质感、画面留白",
        "options": [
          {
            "name": "旧录像带质感[TEST]",
            "displayName": "旧录像带"
          },
          {
            "name": "冷冽与梦核",
            "displayName": "冷冽梦核"
          }
        ]
      },
      {
        "title": "神秘高压向",
        "single": true,
        "label": "神秘高压向",
        "effect": "压迫解构、冷硬残酷张力",
        "options": [
          {
            "name": "显性高压",
            "displayName": "显性高压",
            "hint": "人格解构与生理叙事，剥离浪漫直视支配"
          },
          {
            "name": "深渊童谣[TEST]",
            "displayName": "深渊童谣",
            "hint": "银河铁道式极寒与宇宙尺度的童谣感"
          },
          {
            "name": "后311@natami",
            "displayName": "后311",
            "hint": "日式实存青年反叛，感觉与冲动驱动"
          },
          {
            "name": "魔幻现实",
            "displayName": "魔幻现实",
            "hint": "原始生命力，在荒诞泥泞中展现人性高光"
          }
        ]
      },
      {
        "title": "小说故事向",
        "single": true,
        "label": "小说故事向",
        "effect": "成熟长篇小说笔法、情节导向",
        "options": [
          {
            "name": "群像文风",
            "displayName": "群像文风"
          },
          {
            "name": "西方魔幻",
            "displayName": "西方魔幻",
            "hint": "中世纪西幻史诗，魔法骑士与权力斗争"
          },
          {
            "name": "写实西幻",
            "displayName": "写实西幻",
            "hint": "史诗权谋，宏大残酷世界中的群像博弈"
          },
          {
            "name": "辰东网文",
            "displayName": "辰东网文",
            "hint": "太古玄幻，宏大宇宙洪荒、独断万古之感"
          },
          {
            "name": "成人童话",
            "displayName": "成人童话",
            "hint": "意象与情感驱动，清冷孤寂带宇宙慈爱"
          },
          {
            "name": "🔖N-轻小说",
            "displayName": "N-轻小说",
            "hint": "日系轻小说，对话与叙述相辅相成，口语鲜活"
          },
          {
            "name": "🌸N-恋爱",
            "displayName": "N-恋爱"
          },
          {
            "name": "散文",
            "displayName": "散文小说",
            "hint": "故事/情节导向，删繁就简、镜头着眼故事"
          },
          {
            "name": "散文小说（测试 使用者多反馈）",
            "displayName": "散文(测)"
          }
        ]
      },
      {
        "title": "古风",
        "single": true,
        "label": "古风",
        "effect": "半文半白/文言笔调",
        "options": [
          {
            "name": "四字为锋",
            "displayName": "四字为锋",
            "hint": "半文半白，四字短句为鼓点、留白截断"
          },
          {
            "name": "红楼一梦@四神花ル水",
            "displayName": "红楼一梦",
            "hint": "仿《红楼梦》文言为核心的叙述语言"
          }
        ]
      },
      {
        "title": "NSFW向",
        "single": true,
        "label": "NSFW向",
        "effect": "直白详尽的色情笔法",
        "options": [
          {
            "name": "🔞黄文@Lime",
            "displayName": "🔞黄文"
          },
          {
            "name": "🔞N-黄文（纯爱）@Lime",
            "displayName": "🔞纯爱H"
          },
          {
            "name": "🎧日系ASMR",
            "displayName": "日系ASMR",
            "hint": "可爱与淫荡融合，高对话比的感官色情轻小说"
          },
          {
            "name": "反差（男孩）",
            "displayName": "反差男孩"
          },
          {
            "name": "反差色情",
            "displayName": "反差色情",
            "hint": "长段落沉浸压迫，反差感高张力叙事"
          }
        ]
      },
      {
        "title": "特殊向",
        "single": true,
        "label": "特殊向",
        "effect": "Galgame/聊天/自适应等特殊风格",
        "options": [
          {
            "name": "🍡Galgame",
            "displayName": "Galgame"
          },
          {
            "name": "💬聊天（关闭人称）",
            "displayName": "聊天风格"
          },
          {
            "name": "瞎勾八写吧你就（杀™八股）",
            "displayName": "瞎写杀八股"
          },
          {
            "name": "自适应文风@小回",
            "displayName": "自适应文风"
          }
        ]
      },
      {
        "title": "自定义文风",
        "single": true,
        "label": "自定义文风",
        "effect": "留空槽位，自行填入想要的文风",
        "options": [
          {
            "name": "✒自定义文风",
            "displayName": "自定文风1"
          },
          {
            "name": "✒自定义文风2",
            "displayName": "自定文风2"
          }
        ]
      }
    ],
    "exclusive": true
  },
  {
    "title": "自定义扩展区",
    "desc": "自定义格式/杀法/思维链，以及输出字数设定等扩展项。",
    "subs": [
      {
        "title": "自定义模块",
        "single": false,
        "label": "自定义",
        "effect": "自定义格式/杀法/思维链",
        "options": [
          {
            "name": "💿自定义格式",
            "displayName": "自定格式"
          },
          {
            "name": "❎自定义杀什么",
            "displayName": "自定杀什么"
          },
          {
            "name": "✒自定义思维链",
            "displayName": "自定思维链"
          }
        ]
      },
      {
        "title": "字数",
        "single": true,
        "label": "字数",
        "effect": "设定单次输出字数；只能选一种",
        "options": [
          {
            "name": "💬字数设定",
            "displayName": "字数设定",
            "hint": "设定单次输出的最小/最大字数区间"
          },
          {
            "name": "💬无字数需求",
            "displayName": "字数无限制"
          },
          {
            "name": "💬字数加强@陆子慕",
            "displayName": "字数加强",
            "hint": "强制核对累计字数，未达标禁止收尾"
          }
        ]
      }
    ]
  },
  {
    "title": "杀八股（修辞抑制与净化）",
    "desc": "压制正文里套路化的「八股味」表现，可多选叠加，不建议常开。",
    "subs": [
      {
        "single": false,
        "label": "去八股",
        "effect": "勾选的维度被强制禁止，可多选",
        "options": [
          {
            "name": "❎杀比拟",
            "displayName": "杀比拟",
            "hint": "全文不输出任何比喻/拟人句及多余修辞"
          },
          {
            "name": "❎杀说明",
            "displayName": "杀说明",
            "hint": "拒绝说明性文字，不突兀解释角色行为性格"
          },
          {
            "name": "❎白描",
            "displayName": "纯白描"
          },
          {
            "name": "❎杀揭示",
            "displayName": "杀揭示",
            "hint": "不以作者视角揭示人物行为的内在动机与意义"
          },
          {
            "name": "❎杀声述",
            "displayName": "杀声述",
            "hint": "不阐述角色声音，直接写出台词"
          },
          {
            "name": "❎微观与宏观",
            "displayName": "禁极端感知"
          },
          {
            "name": "❎情绪化通感",
            "displayName": "禁躯体隐喻"
          },
          {
            "name": "❎占有与支配",
            "displayName": "禁支配词汇"
          },
          {
            "name": "❗反科幻",
            "displayName": "反科幻",
            "hint": "正文不出现系统/数据/检测等科幻化词汇，更像真人"
          },
          {
            "name": "🧷禁用词表（测试）",
            "displayName": "禁用词表"
          },
          {
            "name": "🧷克劳德禁词表（测试）",
            "displayName": "克劳德禁词"
          },
          {
            "name": "🔓抗空回",
            "displayName": "抗空回",
            "hint": "破限：防止AI空回不出正文"
          },
          {
            "name": "❎杀转折词",
            "displayName": "杀转折词",
            "hint": "避免「不是…而是…」式转折词，正文不用破折号"
          },
          {
            "name": "❎杀超雄",
            "displayName": "杀超雄",
            "hint": "检查角色情绪是否机械冷淡/超雄、反应是否合理"
          }
        ]
      }
    ]
  },
  {
    "title": "NSFW局部特化",
    "desc": "NSFW 局部强化与色情写法开关，可多选。",
    "subs": [
      {
        "single": false,
        "label": "局部特化",
        "effect": "NSFW 局部强化，可多选",
        "options": [
          {
            "name": "✅启用特化",
            "displayName": "启用特化"
          },
          {
            "name": "🐬足部特化",
            "displayName": "足部特化"
          },
          {
            "name": "🐬腿部特化",
            "displayName": "腿部特化"
          },
          {
            "name": "🐬胸部特化",
            "displayName": "胸部特化"
          },
          {
            "name": "🐬臀部特化",
            "displayName": "臀部特化"
          },
          {
            "name": "🐬性器特化",
            "displayName": "性器特化"
          },
          {
            "name": "🐬脸部特化",
            "displayName": "脸部特化"
          },
          {
            "name": "🐬反差特化",
            "displayName": "反差特化"
          },
          {
            "name": "🥵官能凝视（色）@KKM",
            "displayName": "官能凝视"
          },
          {
            "name": "❗反发情",
            "displayName": "防发情"
          },
          {
            "name": "🔣语气符号",
            "displayName": "语气符号"
          },
          {
            "name": "❗反回避色色@Qiheng",
            "displayName": "反回避色色",
            "hint": "亲密场景不回避，自然推进NSFW而非跳过"
          },
          {
            "name": "🔞nsfw必开",
            "displayName": "NSFW必开"
          },
          {
            "name": "🔞sex_guide",
            "displayName": "Sex Guide"
          },
          {
            "name": "🔞用词要求",
            "displayName": "用词要求"
          }
        ]
      }
    ]
  },
  {
    "title": "底层规则与推演逻辑",
    "desc": "叙事推进、认知边界、输入处理与结尾钩子等底层规则。",
    "subs": [
      {
        "title": "输入处理",
        "single": true,
        "label": "输入处理",
        "effect": "决定如何接续你的输入；只能选一种",
        "options": [
          {
            "name": "⚠️防复述",
            "displayName": "防复述",
            "hint": "紧接你输入往后写，不重复你的原话；与嘴替冲突"
          },
          {
            "name": "⚠️扩写/加强复述",
            "displayName": "扩写复述"
          },
          {
            "name": "⚠️扩写后推进",
            "displayName": "扩写后推"
          },
          {
            "name": "⚠️只复述",
            "displayName": "只复述"
          }
        ]
      },
      {
        "title": "推演规则",
        "single": false,
        "label": "推演",
        "effect": "认知边界/推进/物理等规则，可多选",
        "options": [
          {
            "name": "❗反转述只续写",
            "displayName": "反转述续写"
          },
          {
            "name": "❗无对话",
            "displayName": "无对话",
            "hint": "正文完全不出现对话，只续写行为现象；需配合反转述续写"
          },
          {
            "name": "💥抢话提醒",
            "displayName": "抢话提醒"
          },
          {
            "name": "⁉️// COT //反抢话",
            "displayName": "CoT反抢话"
          },
          {
            "name": "❎抗抢话Beta",
            "displayName": "抗抢话Beta"
          },
          {
            "name": "❗反固定",
            "displayName": "反固定",
            "hint": "主线持续引入低概率高趣味变量，避免刻板可预测的发展"
          },
          {
            "name": "❗反全知",
            "displayName": "反全知",
            "hint": "限制角色认知，只依当前已知信息反应、不开天眼"
          },
          {
            "name": "😭// COT //反极端",
            "displayName": "CoT反极端"
          },
          {
            "name": "❗抗绝望",
            "displayName": "抗绝望",
            "hint": "角色不受困境羞辱打击侵蚀、性格恒定不崩；不建议开"
          },
          {
            "name": "❎抗绝望Beta",
            "displayName": "抗绝望Beta"
          },
          {
            "name": "❎反神化",
            "displayName": "反神化",
            "hint": "禁止把user或角色神化无敌，能力须合世界观"
          },
          {
            "name": "🎬// COT //Char主动",
            "displayName": "Char主动",
            "hint": "让char强势主动介入、创造与你互动的机会"
          },
          {
            "name": "🎭// COT //NPC引入",
            "displayName": "NPC主动"
          },
          {
            "name": "♾️物理规则",
            "displayName": "物理规则"
          },
          {
            "name": "🧱多渠道破限增强",
            "displayName": "多渠道破限"
          },
          {
            "name": "🗺️真实世界",
            "displayName": "真实世界"
          }
        ]
      },
      {
        "title": "结尾处理",
        "single": true,
        "label": "结尾",
        "effect": "正文结尾钩子方式；只能选一种",
        "options": [
          {
            "name": "♻️防打断",
            "displayName": "防打断",
            "hint": "正文结尾留钩子，引导你接话续写"
          },
          {
            "name": "♻️防打断（新）",
            "displayName": "防打断（新）"
          }
        ]
      },
      {
        "title": "心理透视（内心活动）",
        "single": false,
        "label": "心理透视",
        "effect": "增加角色内心独白描写",
        "options": [
          {
            "name": "✅启用内心独白",
            "displayName": "启用内心话"
          },
          {
            "name": "🔢内心话要求",
            "displayName": "格式规范"
          },
          {
            "name": "🗣️用户角色",
            "displayName": "User内心"
          },
          {
            "name": "👤其他角色",
            "displayName": "NPC内心"
          }
        ]
      }
    ]
  },
  {
    "title": "角色质感塑造(RSD)",
    "desc": "人格塑造、事实增强、写作质感与详略控制，让人物更立体。",
    "subs": [
      {
        "title": "质感模块",
        "single": false,
        "label": "质感",
        "effect": "人格/事实/写作质感增强，可多选",
        "options": [
          {
            "name": "📊事实增强@pigment",
            "displayName": "事实增强"
          },
          {
            "name": "😀人格补充",
            "displayName": "人格补充"
          },
          {
            "name": "😀人格补充（测试版）",
            "displayName": "人格补充(测)"
          },
          {
            "name": "😼哈基米抑制器@翎",
            "displayName": "哈基米抑制器",
            "hint": "让人物更正向，但会增加媚user倾向"
          },
          {
            "name": "😋同人增强@pigment",
            "displayName": "同人增强",
            "hint": "涉及虚构作品时按需查证，对Gemini更有用"
          },
          {
            "name": "❎抗过拟合Beta",
            "displayName": "抗过拟合"
          },
          {
            "name": "🍉生动化Beta",
            "displayName": "生动化Beta"
          },
          {
            "name": "🗡深度",
            "displayName": "深度写作"
          },
          {
            "name": "🗡叙事",
            "displayName": "叙事优化"
          },
          {
            "name": "🗡写作优化",
            "displayName": "写作优化",
            "hint": "整体优化正文写作质量"
          },
          {
            "name": "🩹外表美化",
            "displayName": "美型化(美颜)"
          }
        ]
      },
      {
        "title": "详略",
        "single": true,
        "label": "详略",
        "effect": "详略繁简控制；只能选一种",
        "options": [
          {
            "name": "😕克—详略得当",
            "displayName": "克—详略得当"
          },
          {
            "name": "😕克—详略得当（测试版）",
            "displayName": "详略得当(测)"
          }
        ]
      }
    ]
  },
  {
    "title": "思维链(CoT)增强节点",
    "desc": "出文前的专项思考强化节点，推荐开 0-4 个，多开会拖慢且互相稀释。",
    "subs": [
      {
        "single": false,
        "label": "CoT节点",
        "effect": "出文前的专项思考，可多选",
        "options": [
          {
            "name": "🔁// COT //防重复",
            "displayName": "CoT防重复"
          },
          {
            "name": "📚// COT //世界书增强",
            "displayName": "世界书增强",
            "hint": "出文前从世界书Lore提取≥3条相关设定核对"
          },
          {
            "name": "🗰强化思考@leyangzhoumichael0421",
            "displayName": "强化思考"
          },
          {
            "name": "✍️// COT //生动化",
            "displayName": "CoT生动化"
          },
          {
            "name": "🚒// COT //推剧情",
            "displayName": "CoT推剧情"
          },
          {
            "name": "🥒// COT //色情要求",
            "displayName": "CoT色情要求"
          },
          {
            "name": "🍆// COT //性爱事件判断",
            "displayName": "性爱事件判断",
            "hint": "判断是否为性爱事件及其走向与收尾"
          }
        ]
      }
    ]
  },
  {
    "title": "补丁与玩法",
    "desc": "番外/彩蛋/破限与特殊对话模式等玩法补丁，平时按需开。",
    "subs": [
      {
        "title": "玩法补丁",
        "single": false,
        "label": "玩法",
        "effect": "番外/彩蛋/破限等，可多选",
        "options": [
          {
            "name": "😱IF剧情线",
            "displayName": "IF剧情线",
            "hint": "停主线写番外，记录标记为IF且不OOC"
          },
          {
            "name": "🗯 双语对白",
            "displayName": "双语对白",
            "hint": "角色对话改用双语，可改引号设定语种"
          },
          {
            "name": "❗️打破第四面墙",
            "displayName": "第四面墙"
          },
          {
            "name": "❗️色情吐槽",
            "displayName": "色情吐槽",
            "hint": "NSFW时插入上帝视角戏谑点评彩蛋"
          },
          {
            "name": "🔓抗截断",
            "displayName": "抗截断(高数)"
          }
        ]
      },
      {
        "title": "特殊对话模式",
        "single": true,
        "label": "特殊模式",
        "effect": "特殊对话/总结模式；只能选一种",
        "options": [
          {
            "name": "🤬AI对话（对线哈基米）",
            "displayName": "AI对话 (哈基米)"
          },
          {
            "name": "👊拷打（拷打克劳德）",
            "displayName": "拷打模式 (小克)"
          },
          {
            "name": "💥大总结模式",
            "displayName": "💥 大总结模式"
          }
        ]
      }
    ]
  }
];

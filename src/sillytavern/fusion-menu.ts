// AUTO-GENERATED 双人成行友好功能菜单：折叠组+说明+二级子块,取自双人成行选项与使用指南。
// option.id = 双人成行真实 identifier(已对 json 校验);开关映射到融合预设里该条目的 enabled。
export interface FusionOption { id: string; name: string; }
export interface FusionSub { title?: string; single: boolean; options: FusionOption[]; }
export interface FusionGroup { title: string; desc: string; isModel: boolean; subs: FusionSub[]; }
export const FUSION_MENU: FusionGroup[] = [
  {
    "title": "选择核心驱动模型",
    "desc": "根据使用的模型选择对应条目。Gemini与Claude/GLM用户需分别选择。不建议使用Claude-sonnet-4.6。",
    "isModel": true,
    "subs": [
      {
        "single": true,
        "options": [
          {
            "id": "57cadf85-d3b2-4268-aaf6-d8b248e886c8",
            "name": "Gemini"
          },
          {
            "id": "4ea7f2d4-a8de-4134-a905-574fa89b1645",
            "name": "Claude"
          },
          {
            "id": "197ddde7-e5ff-4128-a61d-6aa8ed2cdc80",
            "name": "GLM"
          }
        ]
      }
    ]
  },
  {
    "title": "人称与话语权调度",
    "desc": "控制叙述视角和用户发言比例。人称视角决定故事观察视角，User选项调整用户台词量和AI对用户输入的处理方式。",
    "isModel": false,
    "subs": [
      {
        "title": "叙述视角",
        "single": true,
        "options": [
          {
            "id": "a98f7a28-bfe8-4b4b-ae9f-a74c5cc2a8b3",
            "name": "第一人称"
          },
          {
            "id": "f48dd664-dd7f-4f9f-85ec-24579a2dc06e",
            "name": "第二人称"
          },
          {
            "id": "d7fe66fd-5bee-4f48-9a7a-186bb532f8ce",
            "name": "第三人称"
          },
          {
            "id": "c45fcd94-0748-4c10-bc54-08d3f2c1fa6c",
            "name": "非user视角"
          },
          {
            "id": "3b73f84e-9dbe-43f2-9b6c-8ce95ed0099c",
            "name": "char第三人称"
          },
          {
            "id": "2ebc5bad-34f4-48e0-a62f-608288be9ec8",
            "name": "群像视角"
          }
        ]
      },
      {
        "title": "User发言量",
        "single": false,
        "options": [
          {
            "id": "fbce1f0d-3432-43a3-ae3b-de0c330d2d16",
            "name": "user全是话"
          },
          {
            "id": "4eaa05f8-14d8-484c-846c-208b69e52ad2",
            "name": "user不说话"
          },
          {
            "id": "16f12b6d-236f-4289-85be-eb0fbb4008f2",
            "name": "user的嘴替"
          }
        ]
      },
      {
        "title": "对白处理",
        "single": false,
        "options": [
          {
            "id": "809aa33c-54a3-46e5-97fd-db5f3b1e2d65",
            "name": "增加对白"
          },
          {
            "id": "7463f7c8-6f41-486c-94ea-11baaea78173",
            "name": "增加NPC对白"
          },
          {
            "id": "bda99b2d-dffb-4e0f-9e6d-a7b5abc24f6f",
            "name": "User去中心化"
          }
        ]
      },
      {
        "title": "User基准性格",
        "single": true,
        "options": [
          {
            "id": "b3b0250d-78df-4901-b5cc-af62c3a0ce0f",
            "name": "USERROLE默认"
          },
          {
            "id": "fbafb78f-e095-474f-a3f7-dfc253608dff",
            "name": "自定义人格"
          }
        ]
      }
    ]
  },
  {
    "title": "情感基调",
    "desc": "决定故事的整体情感走向。基调会显著影响剧情发展（如即使开启虐文，治愈向基调也会化解虐意）。每次仅可开启一个基调，或不开。",
    "isModel": false,
    "subs": [
      {
        "single": true,
        "options": [
          {
            "id": "c8b215ef-c7c5-484f-9cfe-ffd747d86410",
            "name": "基调为空"
          },
          {
            "id": "fd134cc1-c391-4a14-9419-2facf220cbd5",
            "name": "治愈"
          },
          {
            "id": "63d32a0f-e881-4ec1-9c5d-ee4e506dd75d",
            "name": "伤感"
          },
          {
            "id": "b061c539-3c15-4130-be66-881c95d034d2",
            "name": "积极"
          },
          {
            "id": "ae90e752-d3ea-469c-9723-fa406abe88ca",
            "name": "消极"
          }
        ]
      }
    ]
  },
  {
    "title": "特色文风滤镜库",
    "desc": "预设文风分类库，支持多种风格搭配。文风已分类整理，若多开则仅最下方生效。可选择改setvar为addvar实现多开（不建议）。",
    "isModel": false,
    "subs": [
      {
        "title": "轻松温馨向",
        "single": true,
        "options": [
          {
            "id": "7f5a80d3-8b2a-443d-9bea-b25b5a4bf15e",
            "name": "N-轻小说"
          },
          {
            "id": "9a279ba3-84ce-41dd-93e4-ecfc3e12aab7",
            "name": "成人童话"
          },
          {
            "id": "ecfff904-9736-4c35-a4db-a5b024d26ace",
            "name": "日系ASMR"
          },
          {
            "id": "542eb285-7582-47f4-a0ca-aa3781f88ddd",
            "name": "烤面包机"
          },
          {
            "id": "c8e99048-132d-4cdd-a77d-0e0eb30ef093",
            "name": "流转心跳叙事"
          }
        ]
      },
      {
        "title": "情绪表达向",
        "single": true,
        "options": [
          {
            "id": "28906fc6-9b8b-484c-a5d1-7c41a1f5a7d6",
            "name": "旧录像带质感"
          },
          {
            "id": "34ead477-4c68-49e1-a2ee-004d823e9482",
            "name": "冷冽与梦核"
          },
          {
            "id": "fb97d0f8-db42-4561-a18a-fb03827099fd",
            "name": "白描文风"
          }
        ]
      },
      {
        "title": "神秘高压向",
        "single": true,
        "options": [
          {
            "id": "8daa005a-79c7-4e45-8b93-d0d1ca65afca",
            "name": "显性高压"
          },
          {
            "id": "17939e9f-38b7-4f84-92be-5d2d66fd3760",
            "name": "魔幻现实"
          },
          {
            "id": "b665f40e-f8e7-4f41-a081-9612f9a1558c",
            "name": "深渊童谣"
          },
          {
            "id": "276458a7-26ed-4bab-bfd9-ef767834a2bc",
            "name": "后311"
          }
        ]
      },
      {
        "title": "小说故事向",
        "single": true,
        "options": [
          {
            "id": "2224b8e7-d998-4359-933c-db0f066385c9",
            "name": "写实西幻"
          },
          {
            "id": "f859b478-7dc2-4f8d-9cc6-1ef520bfe6b3",
            "name": "散文小说"
          },
          {
            "id": "9c79c34c-1c00-4948-b4a5-bc9ffe154702",
            "name": "西方魔幻"
          },
          {
            "id": "1ba3a44c-e9a2-461b-ba70-f60e0857025e",
            "name": "辰东网文"
          }
        ]
      },
      {
        "title": "古风",
        "single": true,
        "options": [
          {
            "id": "67d1b236-d330-4344-b29f-fe6df921f01f",
            "name": "四字为锋"
          },
          {
            "id": "57b73db3-c1de-4422-9ebd-47b0258de3a3",
            "name": "红楼一梦"
          }
        ]
      },
      {
        "title": "NSFW向",
        "single": true,
        "options": [
          {
            "id": "a1b83532-9cbc-41e0-9272-4756c4cad77b",
            "name": "N-黄文(纯爱)"
          },
          {
            "id": "8582178b-4087-4f18-92c3-bb63621312aa",
            "name": "黄文"
          },
          {
            "id": "113e2f9d-f3c3-4270-8cea-db39bf5f9f39",
            "name": "反差色情"
          },
          {
            "id": "29e6ead5-2f72-46e8-a109-eea6ef5d7d97",
            "name": "反差(男孩)"
          }
        ]
      },
      {
        "title": "自定义文风",
        "single": true,
        "options": [
          {
            "id": "66c757f5-bedc-4400-81f1-5889b2bf74a6",
            "name": "自定义文风1"
          },
          {
            "id": "1b0c5882-73f4-4f2d-866c-d99341369ebe",
            "name": "自定义文风2"
          }
        ]
      }
    ]
  },
  {
    "title": "思考功能",
    "desc": "按需开启思考强化。推荐开启0-4个，不建议多开。每个模型有对应的思维链配置。",
    "isModel": false,
    "subs": [
      {
        "single": false,
        "options": [
          {
            "id": "9a5fe514-2b7c-46f0-a730-c7903ba6c821",
            "name": "反抢话"
          },
          {
            "id": "64a122a7-f10f-48d6-b4da-65a90b4a7103",
            "name": "推剧情"
          },
          {
            "id": "90892916-902a-495e-a24d-3a5816d725e5",
            "name": "NPC引入"
          },
          {
            "id": "60d89cd3-b49f-4990-befa-6b1f477fd2c8",
            "name": "生动化"
          },
          {
            "id": "76a49a05-1443-412d-9f6b-0add04a3c3bc",
            "name": "反极端"
          },
          {
            "id": "dee8df23-4bb9-4fc9-8dac-17f5ddca28c8",
            "name": "Char主动"
          },
          {
            "id": "4b892b37-3cbc-4d36-af69-b07d0db9c8bd",
            "name": "防重复"
          },
          {
            "id": "318fd753-3b3d-4e95-b07d-94a548d27463",
            "name": "性爱事件判断"
          },
          {
            "id": "a01febbd-dfc3-4dc0-890a-7ce95d1e3ded",
            "name": "色情要求"
          }
        ]
      }
    ]
  },
  {
    "title": "常规功能",
    "desc": "基础功能开关。包括上帝模式(写小说)、思维链自定义、User角色定义等。锋芒未露用于优化正文，请勿关闭。",
    "isModel": false,
    "subs": [
      {
        "single": false,
        "options": [
          {
            "id": "7ed8345a-26dc-4550-9e3b-a7c4e4d00d07",
            "name": "上帝模式"
          },
          {
            "id": "d02403c9-07df-47fa-b06c-c1ac5743fea3",
            "name": "自定义思维链"
          },
          {
            "id": "d0e01450-ed02-4606-872d-21fdc9cba355",
            "name": "User角色定义"
          },
          {
            "id": "a04824ba-ba43-4291-a61b-fa50550b27c9",
            "name": "双语对白"
          },
          {
            "id": "4b3a89f3-09fb-4586-a5e3-bc2f90f2de97",
            "name": "字数设定"
          }
        ]
      }
    ]
  },
  {
    "title": "正文优化",
    "desc": "优化正文表现。按需开启，不建议多开。避免开启与其他选项冲突的项（如'无对话'与其他项冲突）。",
    "isModel": false,
    "subs": [
      {
        "single": false,
        "options": [
          {
            "id": "58b1885f-0f3a-4cd2-9af4-94b29219e38b",
            "name": "抗绝望"
          },
          {
            "id": "6775f10c-bba4-4161-b5da-1a1e3e240ca9",
            "name": "反科幻"
          },
          {
            "id": "4fe674f3-943e-4757-9f9a-dc6528bada18",
            "name": "反转述只续写"
          },
          {
            "id": "1e83cafa-3ab9-4109-bafe-3f8df670ce20",
            "name": "无对话"
          },
          {
            "id": "3f43d947-d3f6-47a5-a2bf-258b29b90e04",
            "name": "反固定"
          },
          {
            "id": "ed30203c-358d-46e1-b847-d94341a2ed70",
            "name": "反回避色色"
          },
          {
            "id": "745611c7-d4f8-4f40-8e53-e0f88484fe2d",
            "name": "反发情"
          },
          {
            "id": "006f4504-3b87-40ce-a6b7-c490192e9798",
            "name": "反全知"
          }
        ]
      }
    ]
  },
  {
    "title": "杀八股",
    "desc": "清除套路化表现。仅在正文严重套路化时开启，解决后立即关闭。不建议常开。",
    "isModel": false,
    "subs": [
      {
        "single": false,
        "options": [
          {
            "id": "d95bdac6-6e68-422f-b525-ea3989a74f09",
            "name": "杀比拟"
          },
          {
            "id": "e63cfaff-0ce0-493e-91d1-6cc9fa205191",
            "name": "杀揭示"
          },
          {
            "id": "c73e6224-5063-4275-a107-0181691e4030",
            "name": "反神化"
          },
          {
            "id": "d60f4718-f053-44c2-bf0d-fece187ef1ff",
            "name": "杀说明"
          },
          {
            "id": "42d19d3b-5bc3-4757-a269-f638434173d6",
            "name": "杀声述"
          },
          {
            "id": "ded39ef4-dbca-4d54-8eb0-d992603b44b1",
            "name": "白描"
          },
          {
            "id": "c295de2a-8f08-4add-b2c7-3046c2875c47",
            "name": "杀超雄"
          },
          {
            "id": "d8ce5239-8a5f-4165-be4a-6cd66370ac4a",
            "name": "杀转折词"
          },
          {
            "id": "e2553a13-f789-4097-953d-052e61c35636",
            "name": "微观与宏观"
          },
          {
            "id": "2ea831e6-4b97-40f0-a5ad-307ee8cbcbe7",
            "name": "情绪化通感"
          },
          {
            "id": "f458bf04-6951-4810-9136-0a05dca5ff93",
            "name": "占有与支配"
          }
        ]
      }
    ]
  },
  {
    "title": "补丁与扩展",
    "desc": "模块化扩展功能。哈基米抑制器提升人物正向性但增加媚user倾向；克-详略得当优化输出逻辑；IF剧情线撰写番外；打破第四面墙插入彩蛋。",
    "isModel": false,
    "subs": [
      {
        "single": false,
        "options": [
          {
            "id": "ac7f7576-c7ef-4a76-84c8-12a697ffdf0b",
            "name": "哈基米抑制器"
          },
          {
            "id": "3b7099d0-f243-4352-bbef-481eed70952d",
            "name": "克-详略得当"
          },
          {
            "id": "58316ba1-d644-4a87-b945-6d62c429097f",
            "name": "IF剧情线"
          },
          {
            "id": "f66ec5e5-fa3a-4ff4-ac58-e649d4cf6a5f",
            "name": "打破第四面墙"
          },
          {
            "id": "2cab1557-5b97-4362-a359-8a59bf8e7bee",
            "name": "色情吐槽"
          },
          {
            "id": "bd189e76-0e40-436a-b22d-64a2c3b50644",
            "name": "同人增强"
          }
        ]
      }
    ]
  },
  {
    "title": "附加选项",
    "desc": "可选的辅助功能。防打断在正文末留钩子；防复述/扩写加强复述处理用户输入；心理透视增加角色内心描写；色情自缝合辅助NSFW表现。",
    "isModel": false,
    "subs": [
      {
        "single": false,
        "options": [
          {
            "id": "1659f4d5-3430-4484-a60e-8bc531e84205",
            "name": "防打断"
          },
          {
            "id": "fe46236a-427d-4a08-8e2a-6f6405f1d524",
            "name": "防复述"
          },
          {
            "id": "4350c77d-8c88-41c9-a1e2-407368da0790",
            "name": "扩写后推进"
          },
          {
            "id": "a0bc9bd6-db57-4938-b2de-22d6c95968ea",
            "name": "扩写/加强复述"
          },
          {
            "id": "05bbbbb5-fb72-4501-a87e-c7ad22b8c1e6",
            "name": "心理透视"
          },
          {
            "id": "enhanceDefinitions",
            "name": "色情自缝合"
          }
        ]
      }
    ]
  },
  {
    "title": "前端功能",
    "desc": "UI美化与交互功能。按需开启。包括变量更新(有变量时开)、日期卡片、伏笔(需摘要)、快捷回复等。",
    "isModel": false,
    "subs": [
      {
        "single": false,
        "options": [
          {
            "id": "b1f24a1e-d7da-4e63-b030-ca4b673821a6",
            "name": "变量更新"
          },
          {
            "id": "6b4b5d2f-5a7e-48f1-a16f-5dd4aad617c7",
            "name": "日期卡片"
          },
          {
            "id": "16c8e083-fbd3-4115-8e44-a89115d7b9e5",
            "name": "快捷回复"
          },
          {
            "id": "221e60bd-127a-4b2d-bef4-11ddab4c4056",
            "name": "伏笔"
          },
          {
            "id": "e546b425-f465-42e4-843a-dde0b93c1af4",
            "name": "摘要"
          },
          {
            "id": "c937d9cd-726d-45b0-aee6-66e59335422e",
            "name": "小剧场"
          }
        ]
      }
    ]
  },
  {
    "title": "禁词与冲突检查",
    "desc": "禁用词表防止AI生成违禁词或陈词滥调；抢话提醒检测抢话行为。若触发，检查冲突项目。",
    "isModel": false,
    "subs": [
      {
        "single": false,
        "options": [
          {
            "id": "46dbedd7-2b9d-42bb-ba6b-c6e17f86b8e6",
            "name": "禁用词表"
          },
          {
            "id": "b60c23bb-e398-4b06-86fc-cb03b309bb67",
            "name": "Claude禁词表"
          },
          {
            "id": "e36945c2-59f8-4de4-8578-dd69d168fccc",
            "name": "抢话提醒"
          }
        ]
      }
    ]
  },
  {
    "title": "深度优化",
    "desc": "高级写作优化。字数加强、写作优化、草稿模式、加强破限等。按需开启，需根据具体剧情调整。",
    "isModel": false,
    "subs": [
      {
        "single": false,
        "options": [
          {
            "id": "57a02cda-987c-4c4d-ac84-745e3b2b2dbd",
            "name": "字数加强"
          },
          {
            "id": "47e69b3c-16d3-48ab-84da-521f31a821b7",
            "name": "写作优化"
          },
          {
            "id": "804a29f4-42dc-43d5-a851-976dae5a083b",
            "name": "草稿"
          },
          {
            "id": "78e53f98-9381-4cda-ad41-bded49fbe202",
            "name": "叙事"
          },
          {
            "id": "95124048-99c8-4476-aa14-b46f588c1542",
            "name": "深度"
          },
          {
            "id": "05e64fba-02de-4c2e-b00a-bb51ee99b03f",
            "name": "抗空回"
          },
          {
            "id": "5c05fb6b-10a3-454f-bd3f-f4c727304466",
            "name": "抗截断"
          }
        ]
      }
    ]
  },
  {
    "title": "NPC与对白增强",
    "desc": "增加故事中的NPC活跃度和对白比例，提升互动感。",
    "isModel": false,
    "subs": [
      {
        "single": false,
        "options": [
          {
            "id": "809aa33c-54a3-46e5-97fd-db5f3b1e2d65",
            "name": "增加对白"
          },
          {
            "id": "7463f7c8-6f41-486c-94ea-11baaea78173",
            "name": "增加NPC对白"
          }
        ]
      }
    ]
  }
];

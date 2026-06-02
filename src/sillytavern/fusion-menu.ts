// AUTO-GENERATED 双人成行友好菜单。每选项含 xy/ds 两版真实 identifier(按 name 在两版各查),
// 悬浮窗按当前预设选用对应 id;已删前端美化/禁词/模型组(模型由顶部预设栏切换)。
export interface FusionOption { name: string; xy?: string; ds?: string; }
export interface FusionSub { title?: string; single: boolean; options: FusionOption[]; }
// exclusive=true: 整组跨子块单选（如文风库——底层共用一个 setvar 变量，只能有一个生效）；
// 点未选项→仅开它并关掉全组其它；点已选项→清空（全组关闭）。未设则各子块按自身 single 处理。
export interface FusionGroup { title: string; desc: string; exclusive?: boolean; subs: FusionSub[]; }
export const FUSION_MENU: FusionGroup[] = [
  {
    "title": "人称与话语权调度",
    "desc": "控制叙述视角和用户发言比例。人称视角决定故事观察视角，User选项调整用户台词量和AI对用户输入的处理方式。",
    "subs": [
      {
        "single": true,
        "options": [
          {
            "name": "第一人称",
            "xy": "a98f7a28-bfe8-4b4b-ae9f-a74c5cc2a8b3",
            "ds": "a98f7a28-bfe8-4b4b-ae9f-a74c5cc2a8b3"
          },
          {
            "name": "第二人称",
            "xy": "f48dd664-dd7f-4f9f-85ec-24579a2dc06e",
            "ds": "f48dd664-dd7f-4f9f-85ec-24579a2dc06e"
          },
          {
            "name": "第三人称",
            "xy": "d7fe66fd-5bee-4f48-9a7a-186bb532f8ce",
            "ds": "d7fe66fd-5bee-4f48-9a7a-186bb532f8ce"
          },
          {
            "name": "非user视角",
            "xy": "c45fcd94-0748-4c10-bc54-08d3f2c1fa6c",
            "ds": "c45fcd94-0748-4c10-bc54-08d3f2c1fa6c"
          },
          {
            "name": "char第三人称",
            "xy": "3b73f84e-9dbe-43f2-9b6c-8ce95ed0099c",
            "ds": "3b73f84e-9dbe-43f2-9b6c-8ce95ed0099c"
          },
          {
            "name": "群像视角",
            "xy": "2ebc5bad-34f4-48e0-a62f-608288be9ec8",
            "ds": "2ebc5bad-34f4-48e0-a62f-608288be9ec8"
          }
        ],
        "title": "叙述视角"
      },
      {
        "single": false,
        "options": [
          {
            "name": "user全是话",
            "xy": "fbce1f0d-3432-43a3-ae3b-de0c330d2d16",
            "ds": "d14126d1-9450-436b-a3f9-5a1e3e2297ac"
          },
          {
            "name": "user不说话",
            "xy": "4eaa05f8-14d8-484c-846c-208b69e52ad2",
            "ds": "cc8e2640-d8c5-4a54-922a-7879d2bba6f3"
          },
          {
            "name": "user的嘴替",
            "xy": "16f12b6d-236f-4289-85be-eb0fbb4008f2",
            "ds": "5b634397-6b05-4a14-aeec-a381b1a1e95b"
          }
        ],
        "title": "User发言量"
      },
      {
        "single": false,
        "options": [
          {
            "name": "增加对白",
            "xy": "809aa33c-54a3-46e5-97fd-db5f3b1e2d65"
          },
          {
            "name": "增加NPC对白",
            "xy": "7463f7c8-6f41-486c-94ea-11baaea78173",
            "ds": "0cc22069-a025-4de4-aa0c-7f88800a4256"
          },
          {
            "name": "User去中心化",
            "xy": "bda99b2d-dffb-4e0f-9e6d-a7b5abc24f6f"
          }
        ],
        "title": "对白处理"
      },
      {
        "single": true,
        "options": [
          {
            "name": "USERROLE默认",
            "xy": "b3b0250d-78df-4901-b5cc-af62c3a0ce0f"
          },
          {
            "name": "自定义人格",
            "xy": "fbafb78f-e095-474f-a3f7-dfc253608dff"
          }
        ],
        "title": "User基准性格"
      }
    ]
  },
  {
    "title": "情感基调",
    "desc": "决定故事的整体情感走向。基调会显著影响剧情发展（如即使开启虐文，治愈向基调也会化解虐意）。每次仅可开启一个基调，或不开。",
    "subs": [
      {
        "single": true,
        "options": [
          {
            "name": "基调为空",
            "xy": "c8b215ef-c7c5-484f-9cfe-ffd747d86410"
          },
          {
            "name": "治愈",
            "xy": "fd134cc1-c391-4a14-9419-2facf220cbd5"
          },
          {
            "name": "伤感",
            "xy": "63d32a0f-e881-4ec1-9c5d-ee4e506dd75d"
          },
          {
            "name": "积极",
            "xy": "b061c539-3c15-4130-be66-881c95d034d2"
          },
          {
            "name": "消极",
            "xy": "ae90e752-d3ea-469c-9723-fa406abe88ca"
          }
        ]
      }
    ]
  },
  {
    "title": "特色文风滤镜库",
    "desc": "正文叙述风格，全库单选：选一个会自动关掉其它文风；再次点击当前文风即可清空（回到模型自由发挥）。默认为洛夫克拉夫特文风。",
    "exclusive": true,
    "subs": [
      {
        "single": true,
        "title": "克苏鲁向（默认）",
        "options": [
          {
            "name": "洛夫克拉夫特",
            "xy": "lovecraft-style",
            "ds": "lovecraft-style"
          }
        ]
      },
      {
        "single": true,
        "options": [
          {
            "name": "N-轻小说",
            "xy": "7f5a80d3-8b2a-443d-9bea-b25b5a4bf15e",
            "ds": "7f5a80d3-8b2a-443d-9bea-b25b5a4bf15e"
          },
          {
            "name": "成人童话",
            "xy": "9a279ba3-84ce-41dd-93e4-ecfc3e12aab7",
            "ds": "9a279ba3-84ce-41dd-93e4-ecfc3e12aab7"
          },
          {
            "name": "日系ASMR",
            "xy": "ecfff904-9736-4c35-a4db-a5b024d26ace",
            "ds": "ecfff904-9736-4c35-a4db-a5b024d26ace"
          },
          {
            "name": "烤面包机",
            "xy": "542eb285-7582-47f4-a0ca-aa3781f88ddd",
            "ds": "542eb285-7582-47f4-a0ca-aa3781f88ddd"
          },
          {
            "name": "流转心跳叙事",
            "xy": "c8e99048-132d-4cdd-a77d-0e0eb30ef093",
            "ds": "c8e99048-132d-4cdd-a77d-0e0eb30ef093"
          }
        ],
        "title": "轻松温馨向"
      },
      {
        "single": true,
        "options": [
          {
            "name": "旧录像带质感",
            "xy": "28906fc6-9b8b-484c-a5d1-7c41a1f5a7d6"
          },
          {
            "name": "冷冽与梦核",
            "xy": "34ead477-4c68-49e1-a2ee-004d823e9482",
            "ds": "34ead477-4c68-49e1-a2ee-004d823e9482"
          },
          {
            "name": "白描文风",
            "xy": "fb97d0f8-db42-4561-a18a-fb03827099fd",
            "ds": "fb97d0f8-db42-4561-a18a-fb03827099fd"
          }
        ],
        "title": "情绪表达向"
      },
      {
        "single": true,
        "options": [
          {
            "name": "显性高压",
            "xy": "8daa005a-79c7-4e45-8b93-d0d1ca65afca",
            "ds": "8daa005a-79c7-4e45-8b93-d0d1ca65afca"
          },
          {
            "name": "魔幻现实",
            "xy": "17939e9f-38b7-4f84-92be-5d2d66fd3760",
            "ds": "17939e9f-38b7-4f84-92be-5d2d66fd3760"
          },
          {
            "name": "深渊童谣",
            "xy": "b665f40e-f8e7-4f41-a081-9612f9a1558c"
          },
          {
            "name": "后311",
            "xy": "276458a7-26ed-4bab-bfd9-ef767834a2bc",
            "ds": "276458a7-26ed-4bab-bfd9-ef767834a2bc"
          }
        ],
        "title": "神秘高压向"
      },
      {
        "single": true,
        "options": [
          {
            "name": "写实西幻",
            "xy": "2224b8e7-d998-4359-933c-db0f066385c9",
            "ds": "2224b8e7-d998-4359-933c-db0f066385c9"
          },
          {
            "name": "散文小说",
            "xy": "f859b478-7dc2-4f8d-9cc6-1ef520bfe6b3",
            "ds": "f859b478-7dc2-4f8d-9cc6-1ef520bfe6b3"
          },
          {
            "name": "西方魔幻",
            "xy": "9c79c34c-1c00-4948-b4a5-bc9ffe154702",
            "ds": "9c79c34c-1c00-4948-b4a5-bc9ffe154702"
          },
          {
            "name": "辰东网文",
            "xy": "1ba3a44c-e9a2-461b-ba70-f60e0857025e",
            "ds": "1ba3a44c-e9a2-461b-ba70-f60e0857025e"
          }
        ],
        "title": "小说故事向"
      },
      {
        "single": true,
        "options": [
          {
            "name": "四字为锋",
            "xy": "67d1b236-d330-4344-b29f-fe6df921f01f",
            "ds": "67d1b236-d330-4344-b29f-fe6df921f01f"
          },
          {
            "name": "红楼一梦",
            "xy": "57b73db3-c1de-4422-9ebd-47b0258de3a3",
            "ds": "57b73db3-c1de-4422-9ebd-47b0258de3a3"
          }
        ],
        "title": "古风"
      },
      {
        "single": true,
        "options": [
          {
            "name": "N-黄文(纯爱)",
            "xy": "a1b83532-9cbc-41e0-9272-4756c4cad77b",
            "ds": "a1b83532-9cbc-41e0-9272-4756c4cad77b"
          },
          {
            "name": "黄文",
            "xy": "8582178b-4087-4f18-92c3-bb63621312aa",
            "ds": "8582178b-4087-4f18-92c3-bb63621312aa"
          },
          {
            "name": "反差色情",
            "xy": "113e2f9d-f3c3-4270-8cea-db39bf5f9f39",
            "ds": "113e2f9d-f3c3-4270-8cea-db39bf5f9f39"
          },
          {
            "name": "反差(男孩)",
            "xy": "29e6ead5-2f72-46e8-a109-eea6ef5d7d97",
            "ds": "29e6ead5-2f72-46e8-a109-eea6ef5d7d97"
          }
        ],
        "title": "NSFW向"
      },
      {
        "single": true,
        "options": [
          {
            "name": "自定义文风1",
            "xy": "66c757f5-bedc-4400-81f1-5889b2bf74a6"
          },
          {
            "name": "自定义文风2",
            "xy": "1b0c5882-73f4-4f2d-866c-d99341369ebe",
            "ds": "1b0c5882-73f4-4f2d-866c-d99341369ebe"
          }
        ],
        "title": "自定义文风"
      }
    ]
  },
  {
    "title": "思考功能",
    "desc": "按需开启思考强化。推荐开启0-4个，不建议多开。每个模型有对应的思维链配置。",
    "subs": [
      {
        "single": false,
        "options": [
          {
            "name": "反抢话",
            "xy": "9a5fe514-2b7c-46f0-a730-c7903ba6c821"
          },
          {
            "name": "推剧情",
            "xy": "64a122a7-f10f-48d6-b4da-65a90b4a7103"
          },
          {
            "name": "NPC引入",
            "xy": "90892916-902a-495e-a24d-3a5816d725e5"
          },
          {
            "name": "生动化",
            "xy": "60d89cd3-b49f-4990-befa-6b1f477fd2c8"
          },
          {
            "name": "反极端",
            "xy": "76a49a05-1443-412d-9f6b-0add04a3c3bc"
          },
          {
            "name": "Char主动",
            "xy": "dee8df23-4bb9-4fc9-8dac-17f5ddca28c8"
          },
          {
            "name": "世界书增强",
            "xy": "dee8df23-4bb9-4fc9-8dac-17f5ddca28c8"
          },
          {
            "name": "防重复",
            "xy": "4b892b37-3cbc-4d36-af69-b07d0db9c8bd"
          },
          {
            "name": "性爱事件判断",
            "xy": "318fd753-3b3d-4e95-b07d-94a548d27463"
          },
          {
            "name": "色情要求",
            "xy": "a01febbd-dfc3-4dc0-890a-7ce95d1e3ded"
          }
        ]
      }
    ]
  },
  {
    "title": "常规功能",
    "desc": "基础功能开关。包括上帝模式(写小说)、思维链自定义、User角色定义等。锋芒未露用于优化正文，请勿关闭。",
    "subs": [
      {
        "single": false,
        "options": [
          {
            "name": "上帝模式",
            "xy": "7ed8345a-26dc-4550-9e3b-a7c4e4d00d07",
            "ds": "ca2cc946-3832-418d-a866-4d3995fe2ad6"
          },
          {
            "name": "自定义思维链",
            "xy": "d02403c9-07df-47fa-b06c-c1ac5743fea3",
            "ds": "d02403c9-07df-47fa-b06c-c1ac5743fea3"
          },
          {
            "name": "User角色定义",
            "xy": "d0e01450-ed02-4606-872d-21fdc9cba355"
          },
          {
            "name": "双语对白",
            "xy": "a04824ba-ba43-4291-a61b-fa50550b27c9",
            "ds": "a04824ba-ba43-4291-a61b-fa50550b27c9"
          },
          {
            "name": "字数设定",
            "xy": "4b3a89f3-09fb-4586-a5e3-bc2f90f2de97",
            "ds": "4b3a89f3-09fb-4586-a5e3-bc2f90f2de97"
          }
        ]
      }
    ]
  },
  {
    "title": "正文优化",
    "desc": "优化正文表现。按需开启，不建议多开。避免开启与其他选项冲突的项（如'无对话'与其他项冲突）。",
    "subs": [
      {
        "single": false,
        "options": [
          {
            "name": "抗绝望",
            "xy": "58b1885f-0f3a-4cd2-9af4-94b29219e38b",
            "ds": "58b1885f-0f3a-4cd2-9af4-94b29219e38b"
          },
          {
            "name": "反科幻",
            "xy": "6775f10c-bba4-4161-b5da-1a1e3e240ca9",
            "ds": "6775f10c-bba4-4161-b5da-1a1e3e240ca9"
          },
          {
            "name": "反转述只续写",
            "xy": "4fe674f3-943e-4757-9f9a-dc6528bada18",
            "ds": "4fe674f3-943e-4757-9f9a-dc6528bada18"
          },
          {
            "name": "无对话",
            "xy": "1e83cafa-3ab9-4109-bafe-3f8df670ce20",
            "ds": "1e83cafa-3ab9-4109-bafe-3f8df670ce20"
          },
          {
            "name": "反固定",
            "xy": "3f43d947-d3f6-47a5-a2bf-258b29b90e04",
            "ds": "3f43d947-d3f6-47a5-a2bf-258b29b90e04"
          },
          {
            "name": "反回避色色",
            "xy": "ed30203c-358d-46e1-b847-d94341a2ed70",
            "ds": "ed30203c-358d-46e1-b847-d94341a2ed70"
          },
          {
            "name": "反发情",
            "xy": "745611c7-d4f8-4f40-8e53-e0f88484fe2d",
            "ds": "745611c7-d4f8-4f40-8e53-e0f88484fe2d"
          },
          {
            "name": "反全知",
            "xy": "006f4504-3b87-40ce-a6b7-c490192e9798",
            "ds": "006f4504-3b87-40ce-a6b7-c490192e9798"
          }
        ]
      }
    ]
  },
  {
    "title": "杀八股",
    "desc": "清除套路化表现。仅在正文严重套路化时开启，解决后立即关闭。不建议常开。",
    "subs": [
      {
        "single": false,
        "options": [
          {
            "name": "杀比拟",
            "xy": "d95bdac6-6e68-422f-b525-ea3989a74f09",
            "ds": "c98ab165-57f1-4b57-a0c2-479896545677"
          },
          {
            "name": "杀揭示",
            "xy": "e63cfaff-0ce0-493e-91d1-6cc9fa205191",
            "ds": "272a2bb0-3676-42d2-8318-8b46ad6acb3e"
          },
          {
            "name": "反神化",
            "xy": "c73e6224-5063-4275-a107-0181691e4030",
            "ds": "f3f3752a-7810-47ee-8eb9-1e0cc94419a4"
          },
          {
            "name": "杀说明",
            "xy": "d60f4718-f053-44c2-bf0d-fece187ef1ff",
            "ds": "48075cc7-0aef-4b81-961c-a1897607b544"
          },
          {
            "name": "杀声述",
            "xy": "42d19d3b-5bc3-4757-a269-f638434173d6",
            "ds": "4312a0a6-0cb4-4bff-9bd4-e7071c6e2146"
          },
          {
            "name": "白描",
            "xy": "ded39ef4-dbca-4d54-8eb0-d992603b44b1"
          },
          {
            "name": "杀超雄",
            "xy": "c295de2a-8f08-4add-b2c7-3046c2875c47"
          },
          {
            "name": "杀转折词",
            "xy": "d8ce5239-8a5f-4165-be4a-6cd66370ac4a"
          },
          {
            "name": "微观与宏观",
            "xy": "e2553a13-f789-4097-953d-052e61c35636"
          },
          {
            "name": "情绪化通感",
            "xy": "2ea831e6-4b97-40f0-a5ad-307ee8cbcbe7"
          },
          {
            "name": "占有与支配",
            "xy": "f458bf04-6951-4810-9136-0a05dca5ff93"
          }
        ]
      }
    ]
  },
  {
    "title": "补丁与扩展",
    "desc": "模块化扩展功能。哈基米抑制器提升人物正向性但增加媚user倾向；克-详略得当优化输出逻辑；IF剧情线撰写番外；打破第四面墙插入彩蛋。",
    "subs": [
      {
        "single": false,
        "options": [
          {
            "name": "哈基米抑制器",
            "xy": "ac7f7576-c7ef-4a76-84c8-12a697ffdf0b"
          },
          {
            "name": "克-详略得当",
            "xy": "3b7099d0-f243-4352-bbef-481eed70952d"
          },
          {
            "name": "IF剧情线",
            "xy": "58316ba1-d644-4a87-b945-6d62c429097f",
            "ds": "02cc6162-c441-46ed-8c85-b33bcd27b99c"
          },
          {
            "name": "打破第四面墙",
            "xy": "f66ec5e5-fa3a-4ff4-ac58-e649d4cf6a5f",
            "ds": "f66ec5e5-fa3a-4ff4-ac58-e649d4cf6a5f"
          },
          {
            "name": "色情吐槽",
            "xy": "2cab1557-5b97-4362-a359-8a59bf8e7bee",
            "ds": "2cab1557-5b97-4362-a359-8a59bf8e7bee"
          },
          {
            "name": "同人增强",
            "xy": "bd189e76-0e40-436a-b22d-64a2c3b50644",
            "ds": "bd189e76-0e40-436a-b22d-64a2c3b50644"
          }
        ]
      }
    ]
  },
  {
    "title": "附加选项",
    "desc": "可选的辅助功能。防打断在正文末留钩子；防复述/扩写加强复述处理用户输入；心理透视增加角色内心描写；色情自缝合辅助NSFW表现。",
    "subs": [
      {
        "single": false,
        "options": [
          {
            "name": "防打断",
            "xy": "1659f4d5-3430-4484-a60e-8bc531e84205",
            "ds": "f981ad73-1807-49e3-bcf3-b25ed9e974c3"
          },
          {
            "name": "防复述",
            "xy": "fe46236a-427d-4a08-8e2a-6f6405f1d524",
            "ds": "305d5e97-8cfd-4dd4-aac8-073c9b4ca41b"
          },
          {
            "name": "扩写后推进",
            "xy": "4350c77d-8c88-41c9-a1e2-407368da0790",
            "ds": "59be6230-5cdd-46de-aba0-15b9a0d8f395"
          },
          {
            "name": "扩写/加强复述",
            "xy": "a0bc9bd6-db57-4938-b2de-22d6c95968ea",
            "ds": "a0b3d80b-ee08-4afb-886b-0630766cb698"
          },
          {
            "name": "心理透视",
            "xy": "05bbbbb5-fb72-4501-a87e-c7ad22b8c1e6",
            "ds": "05bbbbb5-fb72-4501-a87e-c7ad22b8c1e6"
          },
          {
            "name": "色情自缝合",
            "xy": "enhanceDefinitions"
          }
        ]
      }
    ]
  },
  {
    "title": "深度优化",
    "desc": "高级写作优化。字数加强、写作优化、草稿模式、加强破限等。按需开启，需根据具体剧情调整。",
    "subs": [
      {
        "single": false,
        "options": [
          {
            "name": "字数加强",
            "xy": "57a02cda-987c-4c4d-ac84-745e3b2b2dbd",
            "ds": "ea02e1bb-e126-4a3f-9f0d-7bbaadf5bf55"
          },
          {
            "name": "写作优化",
            "xy": "47e69b3c-16d3-48ab-84da-521f31a821b7"
          },
          {
            "name": "草稿",
            "xy": "804a29f4-42dc-43d5-a851-976dae5a083b"
          },
          {
            "name": "叙事",
            "xy": "78e53f98-9381-4cda-ad41-bded49fbe202"
          },
          {
            "name": "深度",
            "xy": "95124048-99c8-4476-aa14-b46f588c1542"
          },
          {
            "name": "抗空回",
            "xy": "05e64fba-02de-4c2e-b00a-bb51ee99b03f"
          },
          {
            "name": "抗截断",
            "xy": "5c05fb6b-10a3-454f-bd3f-f4c727304466"
          }
        ]
      }
    ]
  },
  {
    "title": "NPC与对白增强",
    "desc": "增加故事中的NPC活跃度和对白比例，提升互动感。",
    "subs": [
      {
        "single": false,
        "options": [
          {
            "name": "增加对白",
            "xy": "809aa33c-54a3-46e5-97fd-db5f3b1e2d65"
          },
          {
            "name": "增加NPC对白",
            "xy": "7463f7c8-6f41-486c-94ea-11baaea78173",
            "ds": "0cc22069-a025-4de4-aa0c-7f88800a4256"
          }
        ]
      }
    ]
  }
];

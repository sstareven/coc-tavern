import { useEffect, useState } from 'react';
import { kvGet, kvSet } from '../../db/kv';

const CHANGELOG_KEY = 'coc-changelog-seen';
const CURRENT_VERSION = 'v1.3.6';

interface Release {
  version: string;
  label: string;
  items: string[];
}

// 版本倒序：最新在最前。新增版本时在数组顶部插入，并同步更新 CURRENT_VERSION。
const RELEASES: Release[] = [
  {
    version: 'v1.3.6',
    label: '选项不再出现 {{}} 花括号',
    items: [
      '修复选项文字偶尔带「{{}}」花括号的问题 — 正文用花括号做关键词悬停高亮，但选项是纯文字直接显示，AI 写在选项里的「{{粘液}}」等会露出字面括号；现已自动剥除（正文关键词高亮不受影响）',
    ],
  },
  {
    version: 'v1.3.5',
    label: '行动补写更忠实',
    items: [
      '自定义行动补写更忠于你的本意 — 比如你写「喝下去」，给出的 4 个候选里第一个一定是直接照做，其余是同一动作的不同方式（小口试、捏鼻灌等），不再发散成「闻一闻 / 化验 / 倒掉」这类替你改主意的替代方案',
      '补写不再因「危险/不理智」就回避 — 后果交给掷骰和剧情承担；只有动作在当前场景物理上真的做不到时，才会说明受阻原因',
    ],
  },
  {
    version: 'v1.3.4',
    label: '热修：专精技能检定目标值',
    items: [
      '修复带括号专精技能（如「科学(生物学)」「艺术与手艺(...)」）检定时目标值被错算成 1 的问题 — 原因是当选项叙事里恰好含「进行」二字时，技能名被解析串错误吞并；现在检定只读取选项的机制部分，技能名能正确识别',
      '检定取值更稳健 — 全角括号「（）」自动归一为半角；角色卡里技能存成「裸名」或「专精名」时能互相命中，不再因 key 形态不一致回退成 1',
    ],
  },
  {
    version: 'v1.3.3',
    label: '变量校验自纠 · 正文换行修复',
    items: [
      '状态变量更新校验 — 非法的变量更新（如生命值跌破 0、剧情阶段/暗线威胁等级填了不存在的值）会被拦下并记入调试日志，不再悄悄写进存档污染状态',
      '新增「变量更新自纠」（设置 · MVU，默认关闭）— 开启后，校验未通过的变量更新会回灌给 AI 请求修正；严格走 MVU 的 RPM 限流通道、受「自纠重试预算」硬上限约束（默认 1 次/回合），绝不超出每分钟请求限制',
      '自纠消耗的 token 已计入该页生成统计（右下角数字）',
      '修复正文偶尔出现字面「\\n\\n」的问题 — AI 返回双重转义文本时残留的换行符号，现自动还原；正文段落改为按真实换行渲染（与生成中预览一致）',
    ],
  },
  {
    version: 'v1.3.2',
    label: '生成统计每页化 · 输入与夜间细节',
    items: [
      '生成统计改为「每页记录」— 右下角显示的是当前页生成时的 token 消耗与耗时（翻回旧页看旧页的），不再是全局最近一次；序章等无记录的页不显示',
      '统计纳入 MVU 与行动补写消耗 — 补写时数字以老虎机式翻滚动画向上累加到新值',
      '自定义行动按 Enter 现在正确触发「行动补写」— 此前会误走「推进」，与右侧按钮显示不一致',
      '移动端行动补写 — 过渡叙述移到卷轴底部「奇思妙想」分区，不再混入正文',
      '黑夜模式文字提亮 — 暗色背景下正文/次级文字更接近白色、更清晰',
    ],
  },
  {
    version: 'v1.3.1',
    label: '微调',
    items: [
      '右下角生成信息 — 改为内联显示「↑输入 ↓输出 · 耗时」（输入/输出 token 直接可见，悬停看合计明细）',
      '状态变量提取改回同步排队 — 撤销 v1.3.0 的「后台异步提取」，恢复为等变量解析完再翻页，行为更可预期、避免变量延迟造成的错位',
      '顶部处理提示新增实时计时器 — 「正在窥探深渊…」等提示末尾实时走秒，知道这次等了多久',
    ],
  },
  {
    version: 'v1.3.0',
    label: '黑夜模式 · 记忆与线索演化 · 性能优化',
    items: [
      '黑夜模式 — 设置新增总开关，正文页 / 背包线索 / 人物名册 一键切换「深墨羊皮纸」夜间配色（金色描边不变）；其余界面与地图文字不受影响',
      'NPC 互动记忆自动消化 — 每个 NPC 的互动记忆不再无限堆积：AI 随回合把旧互动浓缩成「记忆梗概」，只保留最近若干条（可在设置调「NPC 记忆保留条数」）',
      '线索会演化 — 关键线索随剧情推进升华为更显著的新线索，旧线索归档进「历史线索」（默认收起、可展开回溯）',
      '检定技能中文化 — AI 用 INT/STR 等英文属性发起检定时，自动显示为「智力 / 力量」等中文，目标值也不再被错算成 1',
      '变量提取不再卡翻页 — 开启「独立变量 API」时，状态变量改为后台异步解析，正文一生成即可翻到下一页，变量页稍后自动补齐',
      '右下角生成信息 — 改为显示本次生成实际消耗的 token 与耗时（拿不到真实用量时按估算并标 ~，悬停可看输入 / 输出明细）',
      'API 设置 —「测试」按钮改名「连接」；请求附带 coc-tavern 署名，便于中转站识别调用来源',
      '性能 — 长列表（线索 / 物品 / 名册 / 目录 / 技能）按视口渲染，屏幕外的行不再占用浏览器布局与绘制',
      '地图与交互修复 — 地图改为左→右分层布局、节点不再重叠；输入框提交后自动回缩；快速填充的「Failed to fetch」改为可读的排查指引',
    ],
  },
  {
    version: 'v1.2.1',
    label: '热修复',
    items: [
      '检定记录 — 现在会随存档保存并显示页码；读档后不再丢失，删除页面时检定记录也会一并回溯',
      '人物创建 · 自定义职业 — 「随机分配」不再清空你已选的职业技能，只重新分配点数',
      '人物创建 · 重置按钮 — 技能加点页新增「重置」，可随时清空重新分配',
      '人物创建 · 信用评级 — 默认从该职业的最低基础值开始（不再错误地从 0 开始）',
      '克苏鲁神话 — 不再出现在加点栏，玩家无法给它加点（但游戏过程中仍会通过遭遇神话而增长）',
    ],
  },
  {
    version: 'v1.2.0',
    label: '世界系统大更新',
    items: [
      '人物名册（NPC 系统）— 在场/离场 NPC 完整档案：身份、属性、好感度、性格、内心想法、记忆、经历、随身物品；在场 NPC 注入剧情，让 AI 按其动机与好感度一致地扮演',
      '地图系统 — 地点自动连成可视化网络（实线=可往返、虚线箭头=单向不可逆），双页浏览：左页地点清单+描述、右页地图图；AI 移动须沿连线、不可瞬移或逆行',
      '独立线索库 — 物品浮层右页改为「线索」，每条线索含详细「发现细节」叙事；物品取消「装备中」概念，统一为随身物品',
      '调查员姿态与状态 — 角色卡新增当前姿态（站立/倒下/昏迷…）与状态条件（中毒/着火/极度口渴…），AI 须遵守物理约束（倒下的人不能站着被爆头）',
      '选项更懂角色 — 行动选项会贴合调查员的属性与性格：高智力角色优先获得推理、查证、交涉等智取选项，而非清一色蛮力',
      '选项防误触 — 点击「推进」后选项立即锁定置灰，杜绝连点导致的重复掷骰与记录错乱',
      '删页完整回溯 — 删除页面会将物品、线索、人物、地图、暗线及人物状态(HP/SAN/MP/姿态)一并回退到删除前',
      '手机翻页改为左右滑动 — 移除箭头，左右拖动即可翻页',
      '若干修复 — 技能别名（快速交谈→话术）致检定目标值归零、状态栏关键词标签、浮层互斥与切换动画/音效、线索图标等',
    ],
  },
  {
    version: 'v1.1.0',
    label: '手机端支持',
    items: [
      '手机端适配 — 窄屏（≤768px）自动从横向双页书本切换为单页便条式界面，桌面/宽屏体验不变',
      '单页便条 — 左右页正文并入同一张卷轴、以「抉择时刻」分隔；左右滑动或点箭头翻页',
      '行动抽屉 — 剧情推进选项收进底部「选择行动」二级菜单，防误触；选项多时带下隐滚动暗示',
      '顶部工具条 — 库存 / 角色卡 / 目录 / 检定记录改为顶部古典线描图标 Tab；状态栏居中单行',
      '浮层单列 — 库存、角色卡浮层手机端改单列 + 顶部分段切换，无需关闭即可切换另一页',
      '全屏面板 — 人物创建、设置与各编辑器弹窗手机端铺满全屏；软键盘弹出时输入栏自动跟随',
      '多项修复 — 状态栏残留关键词标签清理、选职业 insertBefore 崩溃修复、深色抽屉选项改浅色字、读档自动收起浮层',
    ],
  },
  {
    version: 'v1.0.0',
    label: '正式发布',
    items: [
      '检定记录优化 — 骰子结果改在剧情真正推进后才计入检定历史；点了选项却未提交、或重新选择时不再误记',
      '关键词提示增强 — 修复部分关键词（尤其音译地名）悬停无释义的问题，现可容忍拼写变体匹配',
      '骰子判定统一 — 五档成功/失败判定逻辑归一，普通检定、奖励/惩罚骰与对抗检定结果更一致',
      '行动补写可中断 — 补写推演过程中可随时取消，不再误报失败',
      '稳定性加固 — 角色创建属性派生、变量系统、错误日志与渲染规范等多项底层修复',
    ],
  },
  {
    version: 'v0.1.0',
    label: '首次发布',
    items: [
      '双页故事书阅读系统 — 仿古籍翻页体验',
      '骰子检定与历史记录 — 完整 COC 7th 规则支持',
      '角色卡管理系统 — 调查员属性与技能编辑',
      '世界书知识库 — 人物、地点、事件词条',
      'AI 对话引擎 — 多会话、预设、流式输出',
      '预设编辑器 — 自定义 AI 参数与提示词',
      '环境音效与背景音乐系统',
      '数据持久化 — IndexedDB 本地存储',
    ],
  },
];

export function ChangelogModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const seen = kvGet(CHANGELOG_KEY);
    if (seen !== CURRENT_VERSION) {
      setVisible(true);
    }

    const handler = () => setVisible(true);
    document.addEventListener('show-changelog', handler);
    return () => document.removeEventListener('show-changelog', handler);
  }, []);

  const close = () => {
    kvSet(CHANGELOG_KEY, CURRENT_VERSION);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'var(--leather)', border: '1px solid var(--gold)',
        borderRadius: 6, padding: '32px 40px', maxWidth: 480, width: '90%',
        maxHeight: '82vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 0 60px rgba(0,0,0,0.5)',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--gold)',
          letterSpacing: 6, textAlign: 'center', marginBottom: 20, flexShrink: 0,
        }}>
          更新日志
        </h2>

        <div style={{
          overflowY: 'auto', flex: 1, minHeight: 0,
          scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) transparent',
        }}>
          {RELEASES.map((rel, ri) => (
            <div key={rel.version} style={{ marginBottom: ri === RELEASES.length - 1 ? 0 : 26 }}>
              <p style={{
                fontSize: 11, textAlign: 'center', letterSpacing: 4,
                color: ri === 0 ? 'var(--gold)' : 'var(--ink-subtle)',
                opacity: ri === 0 ? 1 : 0.7,
                marginTop: 0, marginBottom: 14,
                paddingBottom: 8, borderBottom: '1px solid rgba(196,168,85,0.15)',
              }}>
                {rel.version} — {rel.label}
              </p>
              <ul style={{
                listStyle: 'none', padding: 0, margin: 0,
                display: 'flex', flexDirection: 'column', gap: 8,
                opacity: ri === 0 ? 1 : 0.78,
              }}>
                {rel.items.map((f, i) => (
                  <li key={i} style={{
                    fontSize: 13, color: 'var(--text-light)',
                    fontFamily: 'var(--font-ui)', lineHeight: 1.55,
                    paddingLeft: 18, position: 'relative',
                  }}>
                    <span style={{
                      position: 'absolute', left: 0, color: 'var(--gold)',
                      fontSize: 10, lineHeight: '20px',
                    }}>&#9733;</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <button onClick={close} style={{
          display: 'block', margin: '24px auto 0', padding: '12px 48px', flexShrink: 0,
          border: '1px solid var(--gold)', background: 'rgba(196,168,85,0.1)',
          color: 'var(--gold)', fontFamily: 'var(--font-ui)', fontSize: 14,
          letterSpacing: 4, borderRadius: 3, cursor: 'pointer',
        }}>
          开 始 探 索
        </button>
      </div>
    </div>
  );
}

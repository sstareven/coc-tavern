import { useEffect, useState } from 'react';
import { kvGet, kvSet } from '../../db/kv';

const CHANGELOG_KEY = 'coc-changelog-seen';
const CURRENT_VERSION = 'v1.2.1';

interface Release {
  version: string;
  label: string;
  items: string[];
}

// 版本倒序：最新在最前。新增版本时在数组顶部插入，并同步更新 CURRENT_VERSION。
const RELEASES: Release[] = [
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

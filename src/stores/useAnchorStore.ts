import { create } from 'zustand';
import type { PlotAnchors } from '../types';

const EMPTY: PlotAnchors = { nodes: [], constraints: [], threatDependencies: [] };

interface AnchorStore {
  /** 本局剧情蓝图；未生成时 nodes 为空数组。 */
  anchors: PlotAnchors;
  /** 上一回合 causal-echo-extractor 产出的因果回响（1 句话）；空字符串表示无。 */
  lastCausalEcho: string;
  /** 写入蓝图——仅当当前 nodes 为空时生效（幂等防重复生成覆盖）。 */
  setAnchors: (a: PlotAnchors) => void;
  /** 读档恢复：整体替换。 */
  replaceAll: (a: PlotAnchors) => void;
  /** 清空（会话隔离）。 */
  clearAll: () => void;
  /** causal-echo-extractor 每回合产出后写入（覆盖上一句）。 */
  setLastCausalEcho: (echo: string) => void;
  /**
   * 构造守秘人视角「剧情骨架与进程」注入文本；nodes 为空返回 ''。
   * @param recentSummaries 最近若干页的 page.summary（事件时间线，旧→新），由调用方现算传入。
   */
  buildContextInjection: (recentSummaries: string[]) => string;
}

/** 深拷贝 anchors：nodes/constraints/threatDependencies 必字段 + 4 个新可选字段。 */
function cloneAnchors(a: PlotAnchors): PlotAnchors {
  return {
    nodes: a.nodes.map((n) => ({ ...n })),
    constraints: [...a.constraints],
    threatDependencies: [...a.threatDependencies],
    ...(a.theme ? { theme: a.theme } : {}),
    ...(a.worldFacts ? { worldFacts: [...a.worldFacts] } : {}),
    ...(a.characterArcs ? { characterArcs: a.characterArcs.map((c) => ({ ...c })) } : {}),
    ...(a.causalLinks ? { causalLinks: a.causalLinks.map((l) => ({ ...l })) } : {}),
  };
}

export const useAnchorStore = create<AnchorStore>()((set, get) => ({
  anchors: EMPTY,
  lastCausalEcho: '',

  setAnchors: (a) => {
    if (get().anchors.nodes.length !== 0) return; // 幂等防覆盖
    set({ anchors: cloneAnchors(a) });
  },

  replaceAll: (a) => set({ anchors: cloneAnchors(a) }),

  clearAll: () => set({ anchors: EMPTY, lastCausalEcho: '' }),

  setLastCausalEcho: (echo) => set({ lastCausalEcho: echo ?? '' }),

  buildContextInjection: (recentSummaries) => {
    const { anchors, lastCausalEcho } = get();
    const { nodes, constraints, threatDependencies, theme, worldFacts, characterArcs, causalLinks } = anchors;
    if (nodes.length === 0) return '';

    const lines: string[] = ['[剧情骨架与进程 — 仅限守秘人参考，用于把控剧情走向，绝不可照搬进正文]'];

    // ① 本局主题
    if (theme) {
      lines.push('');
      lines.push('【本局主题】（隐性回响,不让 NPC 当讲道文）');
      lines.push(`  ${theme}`);
    }

    // ② 必经骨架节点 + 节点间因果钩子(若有)
    lines.push('');
    lines.push('【必经骨架节点(默认推进路线,按序)】');
    const linkByFrom = new Map<string, string>();
    if (causalLinks) for (const l of causalLinks) linkByFrom.set(l.fromNodeId, l.hookHint);
    nodes.forEach((n, i) => {
      lines.push(`  ${i + 1}. ${n.title} —— ${n.description}`);
      const hook = linkByFrom.get(n.id);
      if (hook && i < nodes.length - 1) lines.push(`  ↓ ${hook}`);
    });

    // ③ 角色弧目标
    if (characterArcs && characterArcs.length > 0) {
      lines.push('');
      lines.push('【角色弧目标(KP 让角色长期朝终态收束,不强求每回合可见进度)】');
      for (const arc of characterArcs) {
        lines.push(`  · ${arc.name}:${arc.from} → ${arc.to}`);
        if (arc.mid) lines.push(`    (中段:${arc.mid})`);
      }
    }

    // ④ 已发生事件时间线
    if (recentSummaries.length > 0) {
      lines.push('');
      lines.push('【已发生事件时间线(旧→新;严禁重复以下场景/对话/事件)】');
      recentSummaries.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
    }

    // ⑤ 全局硬约束
    if (constraints.length > 0) {
      lines.push('');
      lines.push('【全局硬约束(按默认推进时遵守,不凌驾合法整活胜利)】');
      for (const c of constraints) lines.push(`  · ${c}`);
    }

    // ⑥ KP 视角世界硬事实
    if (worldFacts && worldFacts.length > 0) {
      lines.push('');
      lines.push('【KP 视角世界硬事实(玩家未必发现,但据此判定一切合理性)】');
      for (const f of worldFacts) lines.push(`  · ${f}`);
    }

    // ⑦ 上回合因果回响
    if (lastCausalEcho) {
      lines.push('');
      lines.push('【上回合因果回响】');
      lines.push(`  ${lastCausalEcho}`);
    }

    // ⑧ 推进要求(恒出)
    lines.push('');
    lines.push('【推进要求】');
    lines.push('  参照已发生事件判断当前进度,让本回合 4 个行动选项中至少 1 个推动剧情朝「下一个尚未发生的骨架节点」前进;绝不重复已发生事件、场景或对话。');

    // 威胁达成坏结局所依赖之物 + 开放式胜利
    if (threatDependencies.length > 0) {
      lines.push('');
      lines.push('【威胁达成坏结局所依赖之物(玩家可瓦解的关键靶子)】');
      for (const d of threatDependencies) lines.push(`  · ${d}`);
      lines.push('  开放式胜利:玩家若用逻辑自洽的手段真正移除上述关键依赖,则暗线再无法逼近坏结局——此时你可跳过剩余骨架节点,用 1-2 回合收尾叙事直接导向好结局(剧情.阶段 可推进至「高潮」「结局」)。不得因「玩家没按剧本正面对决」而拒绝或把玩家硬拉回;唯有没有真正瓦解任何依赖的无意义跑题,才用合理理由软性重定向回主线。');
    }

    return lines.join('\n');
  },
}));

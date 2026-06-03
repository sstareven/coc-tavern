import { create } from 'zustand';
import type { PlotAnchors } from '../types';

const EMPTY: PlotAnchors = { nodes: [], constraints: [], threatDependencies: [] };

interface AnchorStore {
  /** 本局剧情蓝图；未生成时 nodes 为空数组。 */
  anchors: PlotAnchors;
  /** 写入蓝图——仅当当前 nodes 为空时生效（幂等防重复生成覆盖）。 */
  setAnchors: (a: PlotAnchors) => void;
  /** 读档恢复：整体替换。 */
  replaceAll: (a: PlotAnchors) => void;
  /** 清空（会话隔离）。 */
  clearAll: () => void;
  /**
   * 构造守秘人视角「剧情骨架与进程」注入文本；nodes 为空返回 ''。
   * @param recentSummaries 最近若干页的 page.summary（事件时间线，旧→新），由调用方现算传入。
   */
  buildContextInjection: (recentSummaries: string[]) => string;
}

export const useAnchorStore = create<AnchorStore>()((set, get) => ({
  anchors: EMPTY,

  setAnchors: (a) => {
    if (get().anchors.nodes.length !== 0) return; // 幂等防覆盖
    set({ anchors: { nodes: a.nodes.map((n) => ({ ...n })), constraints: [...a.constraints], threatDependencies: [...a.threatDependencies] } });
  },

  replaceAll: (a) =>
    set({ anchors: { nodes: a.nodes.map((n) => ({ ...n })), constraints: [...a.constraints], threatDependencies: [...a.threatDependencies] } }),

  clearAll: () => set({ anchors: EMPTY }),

  buildContextInjection: (recentSummaries) => {
    const { nodes, constraints, threatDependencies } = get().anchors;
    if (nodes.length === 0) return '';
    const lines: string[] = ['[剧情骨架与进程 — 仅限守秘人参考，用于把控剧情走向，绝不可照搬进正文]'];
    lines.push('本局必经骨架节点（默认推进路线，按序）：');
    nodes.forEach((n, i) => lines.push(`  ${i + 1}. ${n.title} —— ${n.description}`));
    if (constraints.length) {
      lines.push('全局硬约束（若剧情按默认推进则须遵守；不凌驾于玩家合法的整活胜利之上）：');
      for (const c of constraints) lines.push(`  · ${c}`);
    }
    if (recentSummaries.length) {
      lines.push('已发生事件时间线（旧→新；严禁重复以下已发生过的事件/场景/对话）：');
      recentSummaries.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
    }
    lines.push('推进要求：参照已发生事件判断当前进度，让本回合 4 个行动选项中至少 1 个推动剧情朝「下一个尚未发生的骨架节点」前进；绝不重复已发生过的事件、场景或对话。');
    if (threatDependencies.length) {
      lines.push('威胁达成坏结局所依赖之物（玩家可瓦解的关键靶子）：');
      for (const d of threatDependencies) lines.push(`  · ${d}`);
      lines.push('开放式胜利：玩家若用逻辑自洽的手段真正移除上述关键依赖，则暗线再无法逼近坏结局——此时你可跳过剩余骨架节点，用 1-2 回合收尾叙事直接导向好结局（剧情.阶段 可推进至「高潮」「结局」）。不得因「玩家没按剧本正面对决」而拒绝或把玩家硬拉回；唯有没有真正瓦解任何依赖的无意义跑题，才用合理理由软性重定向回主线。');
    }
    return lines.join('\n');
  },
}));

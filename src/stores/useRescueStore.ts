// 拯救路径运行态 store — spec §1.2
// 与暗线对称:暗线 = KP 机密(玩家不可见胜出条件),拯救 = 玩家可见的多结局推进
// 写入入口收敛:UI mutation 直接调本 store action;LLM JSONPatch 经 useVariableStore 写到 statData
// 后,由 mvu-megaagent.dispatchMegaAgentResult 末尾调 hydrateFromStatData() 反向回灌(单点同步)。
import { create } from 'zustand';
import type { RescueEnding } from '../types/scenario';
import { useVariableStore } from './useVariableStore';
import { setTreePath } from '../sillytavern/mvu-var-access';
import { useDarkThreadStore } from './useDarkThreadStore';

export type RescueGlobalStatus = '潜伏' | '对峙' | '锁定';

export interface RescuePathState {
  endingId: string;
  unlocked: boolean;
  progress: number; // 0-100
  achievedMilestoneIds: string[];
  lastNarration?: string;
}

export interface RescueSnapshot {
  paths: RescuePathState[];
  globalStatus: RescueGlobalStatus;
  winningEndingId: string | null;
}

export interface RescueStore {
  paths: RescuePathState[];
  globalStatus: RescueGlobalStatus;
  winningEndingId: string | null;

  initFromScenario: (endings: RescueEnding[]) => void;
  unlockPath: (endingId: string) => void;
  advanceMilestone: (endingId: string, milestoneId: string, narration?: string) => void;
  applyDelta: (endingId: string, delta: number, narration?: string) => void;
  lockOutcome: (endingId: string) => void;
  buildContextInjection: () => string;
  clear: () => void;
  hydrateFromSnapshot: (snap: RescueSnapshot | null) => void;
  toSnapshot: () => RescueSnapshot;
  hydrateFromStatData: (statData: Record<string, unknown>) => void;
}

// 内部记忆:endingId → ending 完整副本(initFromScenario 时填,后续 mutation 沿用)
// advanceMilestone 需查 milestone.delta;mirrorToStatData 需 id→name 映射
const endingsByIdCache: Record<string, RescueEnding> = {};

function getNameMap(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of Object.keys(endingsByIdCache)) out[id] = endingsByIdCache[id].name;
  return out;
}

/** 把 store 当前状态镜像写回 statData「剧情.救援」。 */
function mirrorToStatData(
  paths: RescuePathState[],
  globalStatus: RescueGlobalStatus,
  winningEndingId: string | null,
): void {
  const varStore = useVariableStore.getState();
  const next: Record<string, unknown> = structuredClone(varStore.statData) ?? {};
  const nameMap = getNameMap();
  setTreePath(next, '剧情.救援.全局状态', globalStatus);
  setTreePath(next, '剧情.救援.胜出路径', winningEndingId ? (nameMap[winningEndingId] ?? '') : '');
  // 重建「路径」整块(避免残留旧剧本的键)
  const pathsTree: Record<string, unknown> = {};
  for (const p of paths) {
    const name = nameMap[p.endingId] ?? p.endingId;
    pathsTree[name] = {
      已解锁: p.unlocked,
      进度: p.progress,
      已达里程碑: [...p.achievedMilestoneIds],
      最近: p.lastNarration ?? '',
    };
  }
  setTreePath(next, '剧情.救援.路径', pathsTree);
  varStore.setStatData(next);
}

function clamp01_100(n: number): number {
  return Math.max(0, Math.min(100, n));
}

export const useRescueStore = create<RescueStore>()((set, get) => ({
  paths: [],
  globalStatus: '潜伏',
  winningEndingId: null,

  initFromScenario: (endings) => {
    for (const k of Object.keys(endingsByIdCache)) delete endingsByIdCache[k];
    for (const e of endings) endingsByIdCache[e.id] = e;
    const paths: RescuePathState[] = endings.map((e) => ({
      endingId: e.id,
      unlocked: false,
      progress: 0,
      achievedMilestoneIds: [],
      lastNarration: undefined,
    }));
    set({ paths, globalStatus: '潜伏', winningEndingId: null });
    mirrorToStatData(paths, '潜伏', null);
  },

  unlockPath: (endingId) => {
    const { paths, globalStatus, winningEndingId } = get();
    const idx = paths.findIndex((p) => p.endingId === endingId);
    if (idx < 0) return;
    if (paths[idx].unlocked) return;
    const nextPaths = paths.slice();
    nextPaths[idx] = { ...paths[idx], unlocked: true };
    // 锁定态下不降级,否则升为「对峙」
    const nextStatus: RescueGlobalStatus = globalStatus === '锁定' ? '锁定' : '对峙';
    set({ paths: nextPaths, globalStatus: nextStatus });
    mirrorToStatData(nextPaths, nextStatus, winningEndingId);
  },

  advanceMilestone: (endingId, milestoneId, narration) => {
    const { paths, globalStatus, winningEndingId } = get();
    // 锁定后非获胜路径冻结
    if (globalStatus === '锁定' && winningEndingId && winningEndingId !== endingId) return;
    const idx = paths.findIndex((p) => p.endingId === endingId);
    if (idx < 0) return;
    const ending = endingsByIdCache[endingId];
    if (!ending) return;
    const ms = ending.milestones.find((m) => m.id === milestoneId);
    if (!ms) return;
    const current = paths[idx];
    if (current.achievedMilestoneIds.includes(milestoneId)) {
      // 幂等:仅更新最近叙述(如果给了),不动 progress / achievedMilestoneIds
      if (narration !== undefined) {
        const nextPaths = paths.slice();
        nextPaths[idx] = { ...current, lastNarration: narration };
        set({ paths: nextPaths });
        mirrorToStatData(nextPaths, globalStatus, winningEndingId);
      }
      return;
    }
    const delta = typeof ms.delta === 'number' && Number.isFinite(ms.delta) ? ms.delta : 25;
    const nextProgress = clamp01_100(current.progress + delta);
    const nextPaths = paths.slice();
    nextPaths[idx] = {
      ...current,
      progress: nextProgress,
      achievedMilestoneIds: [...current.achievedMilestoneIds, milestoneId],
      lastNarration: narration ?? current.lastNarration,
    };
    // 满 100 自动锁定
    if (nextProgress >= 100 && globalStatus !== '锁定') {
      set({ paths: nextPaths, globalStatus: '锁定', winningEndingId: endingId });
      mirrorToStatData(nextPaths, '锁定', endingId);
    } else {
      set({ paths: nextPaths });
      mirrorToStatData(nextPaths, globalStatus, winningEndingId);
    }
  },

  applyDelta: (endingId, delta, narration) => {
    const { paths, globalStatus, winningEndingId } = get();
    if (globalStatus === '锁定' && winningEndingId && winningEndingId !== endingId) return;
    const idx = paths.findIndex((p) => p.endingId === endingId);
    if (idx < 0) return;
    const current = paths[idx];
    const safeDelta = typeof delta === 'number' && Number.isFinite(delta) ? delta : 0;
    const nextProgress = clamp01_100(current.progress + safeDelta);
    const nextPaths = paths.slice();
    nextPaths[idx] = {
      ...current,
      progress: nextProgress,
      lastNarration: narration ?? current.lastNarration,
    };
    if (nextProgress >= 100 && globalStatus !== '锁定') {
      set({ paths: nextPaths, globalStatus: '锁定', winningEndingId: endingId });
      mirrorToStatData(nextPaths, '锁定', endingId);
    } else {
      set({ paths: nextPaths });
      mirrorToStatData(nextPaths, globalStatus, winningEndingId);
    }
  },

  lockOutcome: (endingId) => {
    const { paths } = get();
    const found = paths.find((p) => p.endingId === endingId);
    if (!found) return;
    set({ globalStatus: '锁定', winningEndingId: endingId });
    mirrorToStatData(paths, '锁定', endingId);
  },

  buildContextInjection: () => {
    const { paths, globalStatus, winningEndingId } = get();
    if (paths.length === 0) return '';
    const lines: string[] = [`[拯救路径状态 — 当前阶段:${globalStatus}]`];

    if (globalStatus === '锁定' && winningEndingId) {
      const winning = paths.find((p) => p.endingId === winningEndingId);
      const ending = endingsByIdCache[winningEndingId];
      if (winning && ending) {
        lines.push(`已锁定结局:${ending.name}`);
        lines.push(`结局描述:${ending.description}`);
        if (winning.lastNarration) lines.push(`最近:${winning.lastNarration}`);
        lines.push('其他路径已冻结,叙事应围绕这一结局的最终降临展开。');
      }
      return lines.join('\n');
    }

    for (const p of paths) {
      const ending = endingsByIdCache[p.endingId];
      if (!ending) continue;
      if (!p.unlocked) {
        lines.push(`- 「${ending.name}」(未解锁):解锁提示——${ending.unlockHint}`);
        continue;
      }
      const remaining = ending.milestones.filter((m) => !p.achievedMilestoneIds.includes(m.id));
      lines.push(`- 「${ending.name}」(${p.progress}/100, 已激活)`);
      if (p.lastNarration) lines.push(`  最近:${p.lastNarration}`);
      if (remaining.length > 0) {
        const hints = remaining.slice(0, 3).map((m) => m.hint ?? m.name).join(';');
        lines.push(`  剩余里程碑(参考方向):${hints}`);
      }
    }

    // 暗线赛跑提示:暗线 progress >= 75 时附加紧迫感
    try {
      const darkEntries = useDarkThreadStore.getState().entries;
      const latest = darkEntries.length > 0 ? darkEntries[darkEntries.length - 1] : null;
      if (latest && latest.progress >= 75) {
        lines.push(`[赛跑提示:暗线进度已达 ${latest.progress}/100(${latest.threatLevel}),灾厄逼近,救援必须加紧]`);
      } else if (latest && latest.progress >= 100) {
        lines.push('[暗线已 100,灾厄已胜出,不应再推进救援]');
      }
    } catch {
      // useDarkThreadStore 未初始化时跳过(测试态)
    }

    return lines.join('\n');
  },

  clear: () => {
    for (const k of Object.keys(endingsByIdCache)) delete endingsByIdCache[k];
    set({ paths: [], globalStatus: '潜伏', winningEndingId: null });
  },

  hydrateFromSnapshot: (snap) => {
    if (!snap) {
      set({ paths: [], globalStatus: '潜伏', winningEndingId: null });
      mirrorToStatData([], '潜伏', null);
      return;
    }
    const paths = snap.paths.map((p) => ({
      endingId: p.endingId,
      unlocked: p.unlocked,
      progress: clamp01_100(p.progress),
      achievedMilestoneIds: [...p.achievedMilestoneIds],
      lastNarration: p.lastNarration,
    }));
    set({ paths, globalStatus: snap.globalStatus, winningEndingId: snap.winningEndingId });
    mirrorToStatData(paths, snap.globalStatus, snap.winningEndingId);
  },

  toSnapshot: () => {
    const { paths, globalStatus, winningEndingId } = get();
    return {
      paths: paths.map((p) => ({
        endingId: p.endingId,
        unlocked: p.unlocked,
        progress: p.progress,
        achievedMilestoneIds: [...p.achievedMilestoneIds],
        lastNarration: p.lastNarration,
      })),
      globalStatus,
      winningEndingId,
    };
  },

  hydrateFromStatData: (statData) => {
    const drama = (statData?.['剧情'] as Record<string, unknown> | undefined) ?? undefined;
    const rescue = (drama?.['救援'] as Record<string, unknown> | undefined) ?? undefined;
    if (!rescue) return;
    const { paths, globalStatus, winningEndingId } = get();
    // 已锁定不被回退覆盖(spec §1.2「不降级」)
    if (globalStatus === '锁定' && winningEndingId) return;

    const nextStatusRaw = rescue['全局状态'];
    let nextStatus: RescueGlobalStatus =
      nextStatusRaw === '对峙' || nextStatusRaw === '锁定' ? nextStatusRaw : '潜伏';
    const winnerName = typeof rescue['胜出路径'] === 'string' ? (rescue['胜出路径'] as string) : '';
    // 反查 winnerName → endingId
    let nextWinning: string | null = null;
    if (winnerName) {
      const hit = Object.entries(endingsByIdCache).find(([, e]) => e.name === winnerName);
      if (hit) {
        nextWinning = hit[0];
        // spec §1.2:若 statData 显示「胜出路径」已填且本地 store 未锁,自动锁定
        nextStatus = '锁定';
      }
    }

    const pathsTree = (rescue['路径'] as Record<string, Record<string, unknown>> | undefined) ?? {};
    const nameMap = getNameMap();
    const nextPaths = paths.map((p) => {
      const name = nameMap[p.endingId];
      const incoming = name ? pathsTree[name] : undefined;
      if (!incoming) return p;
      const unlocked = incoming['已解锁'] === true;
      const progressRaw = incoming['进度'];
      const progress = typeof progressRaw === 'number'
        ? clamp01_100(progressRaw)
        : p.progress;
      const msIds = Array.isArray(incoming['已达里程碑'])
        ? (incoming['已达里程碑'] as unknown[]).filter((x): x is string => typeof x === 'string')
        : p.achievedMilestoneIds;
      const lastNarration = typeof incoming['最近'] === 'string' && (incoming['最近'] as string).length > 0
        ? (incoming['最近'] as string)
        : p.lastNarration;
      return { ...p, unlocked, progress, achievedMilestoneIds: msIds, lastNarration };
    });
    set({ paths: nextPaths, globalStatus: nextStatus, winningEndingId: nextWinning });
    // 不回写 statData(避免循环);调用方已持有最新 statData
  },
}));

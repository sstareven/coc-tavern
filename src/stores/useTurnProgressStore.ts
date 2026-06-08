// 回合进度条状态机:主+MVU综合+收尾的多阶段队列,UI 仅读派生 selector
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

export type StageStatus = 'queued' | 'running' | 'done' | 'skipped';

export interface Stage {
  id: string;
  label: string;
  status: StageStatus;
  subLabel?: string;
}

interface TurnProgressState {
  stages: Stage[];

  beginTurn: (initialStages: Pick<Stage, 'id' | 'label'>[]) => void;
  enqueueAfter: (afterId: string, stage: Pick<Stage, 'id' | 'label'>) => void;
  start: (id: string) => void;
  finish: (id: string) => void;
  skip: (id: string) => void;
  setSubLabel: (id: string, subLabel?: string) => void;
  endTurn: () => void;
}

export const useTurnProgressStore = create<TurnProgressState>()((set) => ({
  stages: [],

  // 入口:每回合开头先清掉上轮残留再排入新队列,避免状态泄漏
  beginTurn: (initial) =>
    set({
      stages: initial.map((x) => ({ id: x.id, label: x.label, status: 'queued' })),
    }),

  // 重纠/补写在已知阶段后插入,找不到锚点则尾部追加(防止动态阶段丢失)
  enqueueAfter: (afterId, stage) =>
    set((s) => {
      const idx = s.stages.findIndex((x) => x.id === afterId);
      const node: Stage = { id: stage.id, label: stage.label, status: 'queued' };
      if (idx < 0) return { stages: [...s.stages, node] };
      const next = [...s.stages];
      next.splice(idx + 1, 0, node);
      return { stages: next };
    }),

  start: (id) =>
    set((s) => ({
      stages: s.stages.map((x) => (x.id === id ? { ...x, status: 'running' } : x)),
    })),

  finish: (id) =>
    set((s) => ({
      stages: s.stages.map((x) => (x.id === id ? { ...x, status: 'done' } : x)),
    })),

  // skipped 不计入 total,避免被跳过的可选阶段拉低进度百分比
  skip: (id) =>
    set((s) => ({
      stages: s.stages.map((x) => (x.id === id ? { ...x, status: 'skipped' } : x)),
    })),

  // RPM 限流排队时显示等待秒数等副标
  setSubLabel: (id, subLabel) =>
    set((s) => ({
      stages: s.stages.map((x) => (x.id === id ? { ...x, subLabel } : x)),
    })),

  // 收尾必须清空 stages,isRunning 立刻回 false 让选项解锁
  endTurn: () => set({ stages: [] }),
}));

// 派生 selector:shallow 比对避免 stages 内部其它字段变动触发无关 re-render
export function useTurnProgress(): {
  current: number;
  total: number;
  label: string;
  subLabel: string | undefined;
  isRunning: boolean;
} {
  return useTurnProgressStore(
    useShallow((s) => {
      const total = s.stages.filter((x) => x.status !== 'skipped').length;
      const done = s.stages.filter((x) => x.status === 'done').length;
      const running = s.stages.find((x) => x.status === 'running');
      return {
        current: done + (running ? 1 : 0),
        total,
        label: running?.label ?? '',
        subLabel: running?.subLabel,
        isRunning: s.stages.some((x) => x.status === 'queued' || x.status === 'running'),
      };
    }),
  );
}

// 选项 lock 只关心 isRunning,单独抽出避免订阅整个派生对象
export function useTurnProgressIsRunning(): boolean {
  return useTurnProgressStore((s) =>
    s.stages.some((x) => x.status === 'queued' || x.status === 'running'),
  );
}

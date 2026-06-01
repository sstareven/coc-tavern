import { create } from 'zustand';

/** 本次主生成（产出书页那次 LLM 调用）的 token 用量与耗时。会话级易失，不持久化。 */
interface GenStatsStore {
  totalTokens: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number | null;
  /** true = 无 API usage、按字数估算 */
  estimated: boolean;
  setStats: (s: {
    totalTokens: number;
    promptTokens?: number;
    completionTokens?: number;
    durationMs: number;
    estimated: boolean;
  }) => void;
}

export const useGenStatsStore = create<GenStatsStore>((set) => ({
  totalTokens: null,
  promptTokens: null,
  completionTokens: null,
  durationMs: null,
  estimated: false,
  setStats: (s) => set({
    totalTokens: s.totalTokens,
    promptTokens: s.promptTokens ?? null,
    completionTokens: s.completionTokens ?? null,
    durationMs: s.durationMs,
    estimated: s.estimated,
  }),
}));

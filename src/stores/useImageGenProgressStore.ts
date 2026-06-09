// 文生图进度态(2026-06-08):按 pageId 索引当前阶段标签,内存态不持久化。
// trigger 在各关键节点 setStage(pageId, '阶段文字'),PageBanner 订阅渲染。
// 结束(成功/失败/跳过)清掉对应 pageId 的状态(由 trigger 自己 clearStage)。

import { create } from 'zustand';

export type ImageGenStage =
  | '准备中'        // 入口检查
  | '提取图像 prompt' // LLM 子调用把中文叙事转英文 image prompt(NovelAI 等英文模型才跑)
  | '排队中'        // rpmAcquire
  | '连接 API'      // fetch 开始
  | '生成中'        // 等待响应
  | '解析响应'      // 收到响应,解析中
  | '写入存储'      // blob→IndexedDB
  | '降级重试';     // auto fallback

interface ImageGenProgressStore {
  /** pageId → 当前阶段。无该 key 表示无活动任务。 */
  progress: Record<string, ImageGenStage>;
  setStage: (pageId: string, stage: ImageGenStage) => void;
  clearStage: (pageId: string) => void;
}

export const useImageGenProgressStore = create<ImageGenProgressStore>((set) => ({
  progress: {},
  setStage: (pageId, stage) => set((s) => ({ progress: { ...s.progress, [pageId]: stage } })),
  clearStage: (pageId) => set((s) => {
    if (!(pageId in s.progress)) return s;
    const next = { ...s.progress };
    delete next[pageId];
    return { progress: next };
  }),
}));

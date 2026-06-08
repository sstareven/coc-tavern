// 文生图触发器(2026-06-08):
// 把 "为某页生成图片" 的完整流程抽成纯函数模块,主流程(useChatPipeline 自动钩入)
// 与 UI(PageBanner 重生成按钮)都调用同一个入口,保持单一事实源。
//
// 设计:
// - 不耦合 React;通过 useXxxStore.getState() 同步读 store
// - AbortSignal 透传 fetch 取消
// - 失败 fail-open,内部 try/catch + pushLog,不抛
// - aid 守卫切档放弃
// - 各关键节点 setStage(pageId, '阶段名') 让 PageBanner 显示进度条 sublabel
// - 日志走 'image-gen' category,内容含 mode / size / duration / 失败原因

import { useSettingsStore } from '../stores/useSettingsStore';
import { useChatStore } from '../stores/useChatStore';
import { useBookStore } from '../stores/useBookStore';
import { useScenarioStore } from '../stores/useScenarioStore';
import { useApiProfilesStore } from '../stores/useApiProfilesStore';
import { useImageGenProgressStore } from '../stores/useImageGenProgressStore';
import { pushLog as pushLogRaw } from '../stores/useLogStore';
import { saveConversation } from '../stores/sessionLifecycle';
import { rpmAcquire, RpmQueueExhaustedError } from '../sillytavern/rpm-limiter';
import { buildImageSpecFromPage } from './image-prompt-builder';
import { callImageApiWithRetry, b64ToBlob, ImageGenError, detectPayloadMode } from './image-gen-engine';
import { isNovelAiBaseUrl } from './image-gen-novelai';
import { db } from '../db/database';

export interface TriggerImageGenOpts {
  pageIdx: number;
  /** 主流程自动调用时透传主流程 AbortController.signal;UI 手动重生成时可不传(MVP)。 */
  signal?: AbortSignal;
  /** 调用源标签,用于日志。'auto'=主流程自动钩入,'manual'=玩家手动点重生成。 */
  source?: 'auto' | 'manual';
}

const pushLog = (level: 'info' | 'warn' | 'error', msg: string) => {
  pushLogRaw(level, msg, 'image-gen');
};

/**
 * 为指定页生成图片。完整生命周期:
 * 1. 检查总开关 / API 配置 / scn imageGen.enabled 三态
 * 2. setPageImageStatus('pending') 让 PageBanner 显示骨架
 * 3. setStage('准备中') → '排队中'(rpmAcquire) → '连接 API' / '生成中'(callImageApi) → '解析响应' → '写入存储'
 * 4. 失败 setPageImageStatus('failed') + clearStage
 *
 * 永不抛,玩家/管线层不需要 try/catch。
 */
export async function triggerImageGenForPage(opts: TriggerImageGenOpts): Promise<void> {
  const { pageIdx, signal, source = 'auto' } = opts;
  const sourceTag = source === 'manual' ? '[手动]' : '[自动]';
  const startedAt = Date.now();

  const s = useSettingsStore.getState();
  if (!s.imageGenerationEnabled) {
    if (source === 'manual') pushLog('warn', `${sourceTag} 总开关未开,跳过`);
    return;
  }
  const imgApi = s.getEffectiveImageApi();
  if (!imgApi.apiKey?.trim() || !imgApi.model?.trim() || !imgApi.baseUrl?.trim()) {
    if (source === 'manual') pushLog('warn', `${sourceTag} image API 未配齐 baseUrl/apiKey/model`);
    return;
  }

  const pages = useBookStore.getState().pages;
  if (pageIdx < 0 || pageIdx >= pages.length) return;
  const page = pages[pageIdx];
  if (!page?.id) {
    pushLog('warn', `${sourceTag} 第 ${pageIdx + 1} 页缺 id,无法关联 db.pageImages`);
    return;
  }
  const pageId = page.id;

  // 剧本 imageGen.enabled === false 强关
  const session = useChatStore.getState().sessions.find((c) => c.id === useChatStore.getState().activeId);
  const scnId = session?.scenarioId;
  const scnDoc = (scnId && scnId !== '__free') ? useScenarioStore.getState().getById(scnId) : undefined;
  if (scnDoc?.imageGen?.enabled === false) {
    if (source === 'manual') pushLog('warn', `${sourceTag} 当前剧本强关生图`);
    return;
  }

  const payloadMode = useApiProfilesStore.getState().selectedImagePayloadMode;
  // 提前判定本次实际跑的是不是 NovelAI(影响 prompt 风格 tokens 选择):
  // 显式 'novelai' 命中,或 'auto' 模式下 detectPayloadMode/isNovelAiBaseUrl 命中
  const willUseNovelAi = payloadMode === 'novelai'
    || (payloadMode === 'auto' && (isNovelAiBaseUrl(imgApi.baseUrl) || detectPayloadMode(imgApi.baseUrl, imgApi.model) === 'novelai'));
  const spec = buildImageSpecFromPage(page, scnDoc, s.imageDefaults, s.imageGenerationEnabled, page.sheetSnapshot, willUseNovelAi);
  if (!spec.enabled) return;

  const aid = useChatStore.getState().activeId;
  const progress = useImageGenProgressStore.getState();

  // UI 占位
  useBookStore.getState().setPageImageStatus(pageIdx, 'pending');
  progress.setStage(pageId, '准备中');
  pushLog('info', `${sourceTag} 第 ${pageIdx + 1} 页开始生成 · model=${spec.modelOverride ?? imgApi.model} · ${spec.width}×${spec.height} · payloadMode=${payloadMode}`);

  progress.setStage(pageId, '排队中');
  try {
    await rpmAcquire('image');
  } catch (err) {
    progress.clearStage(pageId);
    if (err instanceof RpmQueueExhaustedError) {
      pushLog('warn', `${sourceTag} 第 ${pageIdx + 1} 页 image RPM 桶已满(limit=${err.limit}/分钟,等了 ${err.attempts} 轮),跳过 — 玩家可手动重生成`);
    } else {
      pushLog('warn', `${sourceTag} 第 ${pageIdx + 1} 页 rpmAcquire 失败:${err instanceof Error ? err.message : String(err)}`);
    }
    useBookStore.getState().setPageImageStatus(pageIdx, 'skipped');
    return;
  }

  progress.setStage(pageId, '连接 API');

  try {
    const resp = await callImageApiWithRetry({
      apiBaseUrl: imgApi.baseUrl,
      apiKey: imgApi.apiKey,
      model: spec.modelOverride ?? imgApi.model,
      prompt: spec.prompt,
      negativePrompt: spec.negativePrompt,
      width: spec.width,
      height: spec.height,
      steps: spec.steps,
      cfgScale: spec.cfgScale,
      sampler: spec.sampler,
      n: 1,
      responseFormat: s.imageStorageMode === 'remote-url' ? 'url' : 'b64_json',
      extraParams: imgApi.extraParams,
      signal,
      payloadMode,
      // 重试前节流:让重试也占 RPM 桶 + UI 显示『降级重试』 + 日志记录原因
      onBeforeRetry: async (attempt, reason) => {
        const reasonZh = reason === 'http-4xx' ? '协议不匹配,准备降级' : reason === 'http-5xx' ? '服务端错' : '网络错';
        pushLog('warn', `${sourceTag} 第 ${pageIdx + 1} 页第 ${attempt} 次重试前(${reasonZh})— 已等待 2s,正在重新申请 image RPM 配额`);
        progress.setStage(pageId, '降级重试');
        await rpmAcquire('image'); // 重试也占 RPM 桶;桶满抛 RpmQueueExhaustedError,engine 据此放弃重试
      },
    });
    if (signal?.aborted) { progress.clearStage(pageId); return; }
    if (useChatStore.getState().activeId !== aid) { progress.clearStage(pageId); return; }

    progress.setStage(pageId, '解析响应');

    let storedUrl: string;
    let storedSizeNote = '';
    if (s.imageStorageMode === 'remote-url') {
      if (!resp.url) {
        pushLog('warn', `${sourceTag} 第 ${pageIdx + 1} 页 remote-url 模式响应缺 url 字段`);
        useBookStore.getState().setPageImageStatus(pageIdx, 'failed');
        progress.clearStage(pageId);
        return;
      }
      storedUrl = resp.url;
      storedSizeNote = ' · 存远程 URL';
      // 切换到远程 URL 时,清掉可能残留的旧 IndexedDB blob 行(防 blob→url 模式切换后留孤儿占空间)
      try { await db.pageImages.delete(pageId); } catch { /* 不存在或 IndexedDB 异常都不影响主流程 */ }
    } else {
      if (!resp.b64Data) {
        pushLog('warn', `${sourceTag} 第 ${pageIdx + 1} 页 blob 模式响应缺 b64_json`);
        useBookStore.getState().setPageImageStatus(pageIdx, 'failed');
        progress.clearStage(pageId);
        return;
      }
      progress.setStage(pageId, '写入存储');
      const blob = b64ToBlob(resp.b64Data, 'image/jpeg');
      if (blob.size > s.imageMaxBlobBytes) {
        // 推算建议值:略大于实际尺寸的下一个整数 MB(至少 +0.5MB 余量)
        const suggestedMB = Math.max(2, Math.ceil((blob.size / 1_000_000) + 0.5));
        pushLog('warn',
          `${sourceTag} 第 ${pageIdx + 1} 页图片 ${(blob.size / 1024).toFixed(0)}KB 超 imageMaxBlobBytes(${(s.imageMaxBlobBytes / 1024).toFixed(0)}KB),跳过保存`,
        );
        pushLog('warn',
          `${sourceTag} 修复:打开『设置 → API 管理 → 图像生成 API → 单张图最大字节』调到 ${suggestedMB}MB 以上,然后点重生成按钮`,
        );
        useBookStore.getState().setPageImageStatus(pageIdx, 'failed');
        progress.clearStage(pageId);
        return;
      }
      const cid = useChatStore.getState().activeId ?? '';
      await db.pageImages.put({
        pageId,
        conversationId: cid,
        blob,
        prompt: resp.revisedPrompt ?? spec.prompt,
        mimeType: 'image/jpeg',
        sizeBytes: blob.size,
        createdAt: Date.now(),
      });
      storedUrl = `blob://${pageId}`;
      storedSizeNote = ` · 入库 ${(blob.size / 1024).toFixed(0)}KB`;
    }

    useBookStore.getState().setPageImage(pageIdx, {
      url: storedUrl,
      prompt: resp.revisedPrompt ?? spec.prompt,
      at: Date.now(),
    });
    useChatStore.getState().savePages(useBookStore.getState().pages);
    if (aid) await saveConversation(aid);
    const modeNote = resp.resolvedMode ? ` · resolvedMode=${resp.resolvedMode}` : '';
    const totalMs = Date.now() - startedAt;
    pushLog('info', `${sourceTag} 第 ${pageIdx + 1} 页插画已生成 · 总耗时 ${totalMs}ms(API ${resp.durationMs}ms)${modeNote}${storedSizeNote}`);
    progress.clearStage(pageId);
  } catch (err) {
    progress.clearStage(pageId);
    if (signal?.aborted) return;
    const baseMsg = err instanceof Error ? err.message : String(err);
    if (err instanceof ImageGenError) {
      const parts: string[] = [];
      if (err.status) parts.push(`status=${err.status}`);
      if (err.endpoint) parts.push(`endpoint=${err.endpoint}`);
      if (err.bodyKeys && err.bodyKeys.length) parts.push(`body=[${err.bodyKeys.join(',')}]`);
      const annot = parts.length ? ` · ${parts.join(' · ')}` : '';
      pushLog('error', `${sourceTag} 第 ${pageIdx + 1} 页失败${annot}:${baseMsg}`);
      if (err.recoveryHint) {
        pushLog('warn', `${sourceTag} 修复提示:${err.recoveryHint}`);
      }
    } else {
      pushLog('error', `${sourceTag} 第 ${pageIdx + 1} 页失败:${baseMsg}`);
    }
    useBookStore.getState().setPageImageStatus(pageIdx, 'failed');
  }
}

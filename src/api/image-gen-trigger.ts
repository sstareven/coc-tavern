// 文生图触发器(2026-06-08):
// 把 "为某页生成图片" 的完整流程抽成纯函数模块,主流程(useChatPipeline 自动钩入)
// 与 UI(PageBanner 重生成按钮)都调用同一个入口,保持单一事实源。
//
// 设计:
// - 不耦合 React;通过 useXxxStore.getState() 同步读 store
// - AbortSignal 透传 fetch 取消
// - 失败 fail-open,内部 try/catch + pushLog,不抛
// - aid 守卫切档放弃

import { useSettingsStore } from '../stores/useSettingsStore';
import { useChatStore } from '../stores/useChatStore';
import { useBookStore } from '../stores/useBookStore';
import { useScenarioStore } from '../stores/useScenarioStore';
import { pushLog as pushLogRaw } from '../stores/useLogStore';
import { saveConversation } from '../stores/sessionLifecycle';
import { rpmAcquire, RpmQueueExhaustedError } from '../sillytavern/rpm-limiter';
import { buildImageSpecFromPage } from './image-prompt-builder';
import { callImageApiWithRetry, b64ToBlob } from './image-gen-engine';
import { db } from '../db/database';

export interface TriggerImageGenOpts {
  pageIdx: number;
  /** 主流程自动调用时透传主流程 AbortController.signal;UI 手动重生成时可不传(MVP)。 */
  signal?: AbortSignal;
  /** 调用源标签,用于日志。'auto'=主流程自动钩入,'manual'=玩家手动点重生成。 */
  source?: 'auto' | 'manual';
}

const pushLog = (level: 'info' | 'warn' | 'error', msg: string) => {
  pushLogRaw(level, msg, 'system');
};

/**
 * 为指定页生成图片。完整生命周期:
 * 1. 检查总开关 / API 配置 / scn imageGen.enabled 三态
 * 2. setPageImageStatus('pending') 让 PageBanner 显示骨架
 * 3. rpmAcquire('image')(RPM 桶满 → 静默 fail-open setPageImageStatus('skipped'))
 * 4. buildImageSpecFromPage → callImageApiWithRetry
 * 5. 按 storageMode 'blob'/'remote-url' 写入
 * 6. 双守卫(aid/abort) + savePages + saveConversation
 * 7. 失败 setPageImageStatus('failed')
 *
 * 永不抛,玩家/管线层不需要 try/catch。
 */
export async function triggerImageGenForPage(opts: TriggerImageGenOpts): Promise<void> {
  const { pageIdx, signal, source = 'auto' } = opts;
  const sourceTag = source === 'manual' ? '[文生图·手动]' : '[文生图]';

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
    pushLog('warn', `${sourceTag} 页缺 id,无法关联 db.pageImages`);
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

  const spec = buildImageSpecFromPage(page, scnDoc, s.imageDefaults, s.imageGenerationEnabled, page.sheetSnapshot);
  if (!spec.enabled) return;

  const aid = useChatStore.getState().activeId;

  // UI 占位
  useBookStore.getState().setPageImageStatus(pageIdx, 'pending');

  try {
    await rpmAcquire('image');
  } catch (err) {
    if (err instanceof RpmQueueExhaustedError) {
      pushLog('warn', `${sourceTag} image RPM 桶已满,跳过`);
    } else {
      pushLog('warn', `${sourceTag} rpmAcquire 失败:${err instanceof Error ? err.message : String(err)}`);
    }
    useBookStore.getState().setPageImageStatus(pageIdx, 'skipped');
    return;
  }

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
    });
    if (signal?.aborted) return;
    if (useChatStore.getState().activeId !== aid) return;

    let storedUrl: string;
    if (s.imageStorageMode === 'remote-url') {
      if (!resp.url) {
        pushLog('warn', `${sourceTag} remote-url 模式响应缺 url 字段`);
        useBookStore.getState().setPageImageStatus(pageIdx, 'failed');
        return;
      }
      storedUrl = resp.url;
    } else {
      if (!resp.b64Data) {
        pushLog('warn', `${sourceTag} blob 模式响应缺 b64_json`);
        useBookStore.getState().setPageImageStatus(pageIdx, 'failed');
        return;
      }
      const blob = b64ToBlob(resp.b64Data, 'image/jpeg');
      if (blob.size > s.imageMaxBlobBytes) {
        pushLog('warn', `${sourceTag} 图片 ${(blob.size / 1024).toFixed(0)}KB 超 imageMaxBlobBytes(${(s.imageMaxBlobBytes / 1024).toFixed(0)}KB)`);
        useBookStore.getState().setPageImageStatus(pageIdx, 'failed');
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
    }

    useBookStore.getState().setPageImage(pageIdx, {
      url: storedUrl,
      prompt: resp.revisedPrompt ?? spec.prompt,
      at: Date.now(),
    });
    useChatStore.getState().savePages(useBookStore.getState().pages);
    if (aid) await saveConversation(aid);
    pushLog('info', `${sourceTag} 插画已生成(${resp.durationMs}ms)`);
  } catch (err) {
    if (signal?.aborted) return;
    pushLog('warn', `${sourceTag} 失败:${err instanceof Error ? err.message : String(err)}`);
    useBookStore.getState().setPageImageStatus(pageIdx, 'failed');
  }
}

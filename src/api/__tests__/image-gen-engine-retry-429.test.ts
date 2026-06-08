// callImageApiWithRetry 429 不降级回归测试(2026-06-08):
// Bug 报告:auto 协议下上游中转返 429 quota exhausted,
// 被误当 4xx 触发 openai-strict 降级 → 切端点 + body 后又 400,
// 玩家看到"协议不匹配,请显式选择 openai-strict / sd-compat..." 完全南辕北辙。
//
// 修复:callImageApiWithRetry 的 catch 顶部加 is429 早抛分支,
// 带中文「上游配额耗尽」hint,不 sleep / 不烧 RPM / 不重试 / 不降级。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  callImageApiWithRetry,
  ImageGenError,
  type CallImageApiRequest,
} from '../image-gen-engine';

// 用 vi.spyOn 不行(callImageApi 是函数引用,模块内调用走闭包),改用 mock fetch 模拟 HTTP 响应。
// 优点:能验证真实 endpoint / body 与降级行为(降级会改 payloadMode → 端点变 → fetch URL 变)。

function makeReq(payloadMode: CallImageApiRequest['payloadMode']): CallImageApiRequest {
  return {
    apiBaseUrl: 'https://relay.example.com/v1',
    apiKey: 'sk-test',
    model: 'gemini-2.5-flash-image-preview', // detectPayloadMode 会识别为 chat-completions
    prompt: 'a cat in moonlight',
    negativePrompt: 'blurry',
    width: 832,
    height: 224,
    steps: 24,
    cfgScale: 5,
    sampler: 'Euler a',
    n: 1,
    responseFormat: 'b64_json',
    payloadMode,
  };
}

const ORIGINAL_FETCH = globalThis.fetch;

describe('callImageApiWithRetry — 429 不降级回归', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('auto 模式 + 429 上游配额耗尽 → 立即抛带中文 hint,不调 openai-strict 降级', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { message: 'Resource has been exhausted (e.g. check quota).', type: 'upstream_error', code: 429 },
        }),
        { status: 429, headers: { 'content-type': 'application/json' } },
      ),
    );

    const onBeforeRetry = vi.fn();
    await expect(
      callImageApiWithRetry({ ...makeReq('auto'), onBeforeRetry }, 10),
    ).rejects.toMatchObject({
      status: 429,
      recoveryHint: expect.stringMatching(/配额耗尽/),
    });

    // 关键:fetch 只调一次,没有降级到 openai-strict
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // 也没烧 RPM
    expect(onBeforeRetry).not.toHaveBeenCalled();
  });

  it('auto 模式 + 400 真协议错 → 仍走 openai-strict 降级(回归不破坏现有路径)', async () => {
    // 第一次:auto 探测的 chat-completions 端点 400(invalid_request_error)
    // 第二次:降级到 openai-strict,端点变成 /v1/images/generations 仍 400
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: 'invalid_request_error', code: 400 } }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: 'still 400', code: 400 } }),
          { status: 400 },
        ),
      );

    const onBeforeRetry = vi.fn().mockResolvedValue(undefined);
    await expect(
      callImageApiWithRetry({ ...makeReq('auto'), onBeforeRetry }, 10),
    ).rejects.toThrow(/降级/);

    // fetch 调两次:首次 + 降级
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    // onBeforeRetry 烧了一次 RPM(降级前)
    expect(onBeforeRetry).toHaveBeenCalledTimes(1);
    expect(onBeforeRetry).toHaveBeenCalledWith(1, 'http-4xx');
    // 降级请求的端点应该切到 /v1/images/generations
    const secondCallUrl = fetchSpy.mock.calls[1][0] as string;
    expect(secondCallUrl).toContain('/v1/images/generations');
  });

  it('显式 chat-completions 模式 + 429 → 同样立即抛带 quota hint(早抛先于 declaredMode 短路)', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({ error: { message: 'quota', code: 429 } }),
        { status: 429 },
      ),
    );

    const onBeforeRetry = vi.fn();
    await expect(
      callImageApiWithRetry({ ...makeReq('chat-completions'), onBeforeRetry }, 10),
    ).rejects.toMatchObject({
      status: 429,
      recoveryHint: expect.stringMatching(/配额耗尽/),
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(onBeforeRetry).not.toHaveBeenCalled();
  });

  it('429 hint 含「等 30-60 秒」「换 Key」「下调图像 RPM」三条具体修复指引', async () => {
    fetchSpy.mockResolvedValue(
      new Response('{"error":{"code":429}}', { status: 429 }),
    );
    const err = await callImageApiWithRetry(makeReq('auto'), 10).catch((e) => e);
    expect(err).toBeInstanceOf(ImageGenError);
    expect(err.recoveryHint).toMatch(/30-60/);
    expect(err.recoveryHint).toMatch(/Key|中转/);
    expect(err.recoveryHint).toMatch(/RPM/);
  });
});

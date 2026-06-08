// NovelAI 端点拼接幂等单测(2026-06-08):
// 第三方中转的 baseUrl 形态多样,有的填裸主页,有的填完整端点路径。
// 修复:engine 在 NovelAI 模式拼接端点前检测 baseUrl 是否已含 '/ai/generate-image',
// 命中则原样用,不再追加 — 避免拼成 '...generate-image/ai/generate-image' 双重路径。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callImageApi, type CallImageApiRequest } from '../image-gen-engine';

const ORIGINAL_FETCH = globalThis.fetch;

function makeReq(apiBaseUrl: string): CallImageApiRequest {
  return {
    apiBaseUrl,
    apiKey: 'pst-test',
    model: 'nai-diffusion-4-5-full',
    prompt: 'a cat',
    negativePrompt: '',
    width: 832,
    height: 1216,
    steps: 28,
    cfgScale: 5,
    sampler: 'k_euler_ancestral',
    payloadMode: 'novelai',
  };
}

// 最小合法 ZIP(单 PNG entry, method=0 store)— 让 extractFirstPngFromZip 解析成功
function buildMinimalNovelAiZipResponse(): Response {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const name = new TextEncoder().encode('image_0.png');
  const zip = new Uint8Array(30 + name.length + png.length);
  const dv = new DataView(zip.buffer);
  dv.setUint32(0, 0x04034b50, true);
  dv.setUint16(8, 0, true);
  dv.setUint32(18, png.length, true);
  dv.setUint32(22, png.length, true);
  dv.setUint16(26, name.length, true);
  zip.set(name, 30);
  zip.set(png, 30 + name.length);
  return new Response(zip, { status: 200, headers: { 'content-type': 'application/x-zip-compressed' } });
}

describe('callImageApi(novelai) 端点幂等拼接', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn().mockImplementation(() => Promise.resolve(buildMinimalNovelAiZipResponse()));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it('baseUrl=裸主页 → 拼上 /ai/generate-image', async () => {
    await callImageApi(makeReq('https://relay.example.com/'));
    expect(fetchSpy.mock.calls[0][0]).toBe('https://relay.example.com/ai/generate-image');
  });

  it('baseUrl 已含 /ai/generate-image → 原样用,不重复拼接', async () => {
    await callImageApi(makeReq('https://relay.example.com/ai/generate-image'));
    expect(fetchSpy.mock.calls[0][0]).toBe('https://relay.example.com/ai/generate-image');
  });

  it('baseUrl 含 /ai/generate-image/(尾斜杠) → trim 后原样,无重复', async () => {
    await callImageApi(makeReq('https://relay.example.com/ai/generate-image/'));
    expect(fetchSpy.mock.calls[0][0]).toBe('https://relay.example.com/ai/generate-image');
  });

  it('baseUrl 含子路径前置 /v1/ai/generate-image → 原样用', async () => {
    await callImageApi(makeReq('https://relay.example.com/v1/ai/generate-image'));
    expect(fetchSpy.mock.calls[0][0]).toBe('https://relay.example.com/v1/ai/generate-image');
  });

  it('NovelAI 官方域(裸)→ 拼上端点路径', async () => {
    await callImageApi(makeReq('https://image.novelai.net'));
    expect(fetchSpy.mock.calls[0][0]).toBe('https://image.novelai.net/ai/generate-image');
  });

  it('NovelAI 官方域 + 尾斜杠 → 拼上端点路径,无双斜杠', async () => {
    await callImageApi(makeReq('https://image.novelai.net/'));
    expect(fetchSpy.mock.calls[0][0]).toBe('https://image.novelai.net/ai/generate-image');
  });
});

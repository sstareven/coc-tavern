// NovelAI baseUrl 判定与兜底模型清单单测(2026-06-08):
// Bug 报告:NovelAI profile 保存被「fetchModelList → /v1/models 404」拦下。
// 修复:isNovelAiBaseUrl 宽容判定 + getNovelAiFallbackModels 注入 NOVELAI_KNOWN_MODELS。

import { describe, it, expect } from 'vitest';
import {
  isNovelAiBaseUrl,
  getNovelAiFallbackModels,
  NOVELAI_KNOWN_MODELS,
} from '../image-gen-novelai';

describe('isNovelAiBaseUrl — 宽容判定 NovelAI baseUrl', () => {
  it('官方域名命中', () => {
    expect(isNovelAiBaseUrl('https://image.novelai.net')).toBe(true);
    expect(isNovelAiBaseUrl('https://image.novelai.net/')).toBe(true);
    expect(isNovelAiBaseUrl('https://api.novelai.net')).toBe(true);
  });
  it('大小写不敏感', () => {
    expect(isNovelAiBaseUrl('https://IMAGE.NOVELAI.NET')).toBe(true);
    expect(isNovelAiBaseUrl('HTTPS://image.NovelAI.net')).toBe(true);
  });
  it('中转透传别名(含 novelai 子串)命中', () => {
    expect(isNovelAiBaseUrl('https://relay.example.com/novelai/v1')).toBe(true);
    expect(isNovelAiBaseUrl('https://my-cloudflare-worker.workers.dev/novelai-proxy')).toBe(true);
  });
  it('含 /ai/generate-image 路径(无 novelai 子串的中转)命中', () => {
    expect(isNovelAiBaseUrl('https://relay.example.com/ai/generate-image')).toBe(true);
    expect(isNovelAiBaseUrl('https://relay.example.com/ai/generate-image/')).toBe(true);
    expect(isNovelAiBaseUrl('https://proxy.example.com/v1/ai/generate-image')).toBe(true);
  });
  it('普通 OpenAI 兼容 baseUrl 不命中', () => {
    expect(isNovelAiBaseUrl('https://api.deepseek.com')).toBe(false);
    expect(isNovelAiBaseUrl('https://api.openai.com/v1')).toBe(false);
    expect(isNovelAiBaseUrl('https://relay.example.com/v1')).toBe(false);
  });
  it('空值与非字符串安全兜底', () => {
    expect(isNovelAiBaseUrl('')).toBe(false);
    // @ts-expect-error 故意传非字符串测兜底
    expect(isNovelAiBaseUrl(null)).toBe(false);
    // @ts-expect-error 故意传非字符串测兜底
    expect(isNovelAiBaseUrl(undefined)).toBe(false);
  });
});

describe('getNovelAiFallbackModels — 已知模型清单可写副本', () => {
  it('返回 NOVELAI_KNOWN_MODELS 内容(顺序一致)', () => {
    const list = getNovelAiFallbackModels();
    expect(list).toEqual([...NOVELAI_KNOWN_MODELS]);
  });
  it('每次返回独立副本(不共享引用)', () => {
    const a = getNovelAiFallbackModels();
    const b = getNovelAiFallbackModels();
    expect(a).not.toBe(b);
    a.push('test-injected');
    expect(getNovelAiFallbackModels()).not.toContain('test-injected');
  });
  it('清单含官方主推 nai-diffusion-4-5-full', () => {
    expect(getNovelAiFallbackModels()).toContain('nai-diffusion-4-5-full');
  });
  it('清单非空,长度 ≥ 5', () => {
    expect(getNovelAiFallbackModels().length).toBeGreaterThanOrEqual(5);
  });
});

import { describe, it, expect } from 'vitest';
import { detectPayloadMode, mapToOpenAiSize } from '../api/image-gen-engine';

describe('detectPayloadMode', () => {
  it('OpenAI 官方 URL → openai-strict', () => {
    expect(detectPayloadMode('https://api.openai.com/v1', 'dall-e-3')).toBe('openai-strict');
    expect(detectPayloadMode('https://api.openai.com', 'dall-e-2')).toBe('openai-strict');
  });

  it('model 是 gpt-image* → gpt-image-1(无论 URL)', () => {
    expect(detectPayloadMode('https://random.com/v1', 'gpt-image-1')).toBe('gpt-image-1');
    expect(detectPayloadMode('https://relay.com', 'gpt-image-2')).toBe('gpt-image-1');
  });

  it('model dall-e* 即便不在 openai.com → openai-strict(中转 DALL-E)', () => {
    expect(detectPayloadMode('https://onehub.relay.com/v1', 'dall-e-3')).toBe('openai-strict');
  });

  it('URL 含 pollinations → pollinations', () => {
    expect(detectPayloadMode('https://image.pollinations.ai', 'flux')).toBe('pollinations');
  });

  it('其他全部走 sd-compat 默认(保留老行为)', () => {
    expect(detectPayloadMode('https://api.deepseek.com/v1', 'random-sd')).toBe('sd-compat');
    expect(detectPayloadMode('https://volcengine-ark.com', 'doubao-seedream-3-0')).toBe('sd-compat');
    expect(detectPayloadMode('https://siliconflow.cn', 'flux-dev')).toBe('sd-compat');
    expect(detectPayloadMode('http://127.0.0.1:7860', 'sd_xl')).toBe('sd-compat');
  });

  it('空字符串安全', () => {
    expect(detectPayloadMode('', '')).toBe('sd-compat');
  });
});

describe('mapToOpenAiSize', () => {
  it('832×224(横幅 3.71:1)→ 1792×1024', () => {
    expect(mapToOpenAiSize(832, 224)).toBe('1792x1024');
  });
  it('1024×1024(方) → 1024×1024', () => {
    expect(mapToOpenAiSize(1024, 1024)).toBe('1024x1024');
  });
  it('竖幅 → 1024×1792', () => {
    expect(mapToOpenAiSize(512, 1024)).toBe('1024x1792');
    expect(mapToOpenAiSize(800, 1200)).toBe('1024x1792');
  });
  it('接近方形 → 1024×1024', () => {
    expect(mapToOpenAiSize(900, 1000)).toBe('1024x1024');
    expect(mapToOpenAiSize(1100, 1000)).toBe('1024x1024');
  });
  it('极端宽幅 → 1792×1024', () => {
    expect(mapToOpenAiSize(2048, 512)).toBe('1792x1024');
  });
  it('非法输入 → 1024×1024 兜底', () => {
    expect(mapToOpenAiSize(0, 0)).toBe('1024x1024');
    expect(mapToOpenAiSize(-1, 100)).toBe('1024x1024');
  });
});

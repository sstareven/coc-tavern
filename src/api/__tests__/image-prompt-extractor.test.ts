// needsLlmEnglishHint 单测(2026-06-08):
// 按 protocol 自动判定是否跑 LLM 子调用提取英文 image prompt。
// 设计:chat-completions(Gemini 系)原生支持中文叙事 → 跳过;其他英文模型 → 都跑。

import { describe, it, expect } from 'vitest';
import { needsLlmEnglishHint } from '../image-prompt-extractor';

describe('needsLlmEnglishHint — 按 protocol 自动判定', () => {
  it('chat-completions(Gemini 系)不需要 LLM hint', () => {
    expect(needsLlmEnglishHint('chat-completions')).toBe(false);
  });
  it('novelai 需要(Danbooru tag 英文 only 训练)', () => {
    expect(needsLlmEnglishHint('novelai')).toBe(true);
  });
  it('sd-compat 需要(SD 英文 only 训练)', () => {
    expect(needsLlmEnglishHint('sd-compat')).toBe(true);
  });
  it('openai-strict / gpt-image-1 需要(DALL-E 英文效果更好)', () => {
    expect(needsLlmEnglishHint('openai-strict')).toBe(true);
    expect(needsLlmEnglishHint('gpt-image-1')).toBe(true);
  });
  it('pollinations 需要(同 OpenAI 系英文优先)', () => {
    expect(needsLlmEnglishHint('pollinations')).toBe(true);
  });
  it('auto 需要(保守开启,实际调用时已 resolve 出具体协议)', () => {
    expect(needsLlmEnglishHint('auto')).toBe(true);
  });
  it('空值/未识别协议 → 保守开启', () => {
    expect(needsLlmEnglishHint('')).toBe(true);
    expect(needsLlmEnglishHint(undefined)).toBe(true);
    expect(needsLlmEnglishHint('unknown-future-protocol')).toBe(true);
  });
});

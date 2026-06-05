import { describe, expect, it } from 'vitest';
import { buildThinkingMarker, DS_THINKING_MARKERS, DEFAULT_DS_CACHE_CONFIG } from './deepseek-cache';

describe('buildThinkingMarker', () => {
  it('未启用 / 默认模式 → 空串(不注入)', () => {
    expect(buildThinkingMarker(undefined)).toBe('');
    expect(buildThinkingMarker(DEFAULT_DS_CACHE_CONFIG)).toBe('');
    expect(buildThinkingMarker({ enabled: false, mode: 'immersive', customText: '' })).toBe('');
    expect(buildThinkingMarker({ enabled: true, mode: 'default', customText: '' })).toBe('');
  });

  it('沉浸/分析/格式加强 → 对应预设文案', () => {
    expect(buildThinkingMarker({ enabled: true, mode: 'immersive', customText: '' })).toBe(DS_THINKING_MARKERS.immersive);
    expect(buildThinkingMarker({ enabled: true, mode: 'analysis', customText: '' })).toBe(DS_THINKING_MARKERS.analysis);
    expect(buildThinkingMarker({ enabled: true, mode: 'format_enforce', customText: '' })).toBe(DS_THINKING_MARKERS.format_enforce);
    expect(DS_THINKING_MARKERS.immersive).toContain('角色沉浸要求');
    expect(DS_THINKING_MARKERS.analysis).toContain('思维模式要求');
  });

  it('自定义模式 → 用户文本(去空白)；空文本回落不注入', () => {
    expect(buildThinkingMarker({ enabled: true, mode: 'custom', customText: '  只思考三段  ' })).toBe('只思考三段');
    expect(buildThinkingMarker({ enabled: true, mode: 'custom', customText: '   ' })).toBe('');
  });
});

// estimateCostCNY 的全面覆盖见 __tests__/deepseek-cache.pricing.test.ts（按 flash/pro tier 分价）

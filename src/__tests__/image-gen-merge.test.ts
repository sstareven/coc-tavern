import { describe, it, expect } from 'vitest';
import { resolveImageGen, DEFAULT_SETTINGS_IMAGE_DEFAULTS } from '../api/image-gen-merge';
import type { ImageRenderContext } from '../api/image-gen-merge';
import type { ScenarioImageGen } from '../types/scenario';

const emptyCtx: ImageRenderContext = {};

const richCtx: ImageRenderContext = {
  location: '阿卡姆',
  time: '深夜',
  weather: '雾',
  characters: [{ name: '霍尔姆斯' }, { name: '艾米' }],
  san: 55,
  sceneBrief: '调查员推开图书馆的木门',
};

describe('resolveImageGen 三层 merge', () => {
  it('空覆盖 + settings 基线 → 用基线所有字段', () => {
    const spec = resolveImageGen(DEFAULT_SETTINGS_IMAGE_DEFAULTS, undefined, richCtx, true);
    expect(spec.width).toBe(832);
    expect(spec.height).toBe(224);
    expect(spec.steps).toBe(24);
    expect(spec.cfgScale).toBe(5);
    expect(spec.sampler).toBe('DPM++ 2M Karras');
    expect(spec.enabled).toBe(true);
    expect(spec.prompt).toContain('阿卡姆');
    expect(spec.prompt).toContain('深夜');
    expect(spec.prompt).toContain('雾');
    expect(spec.prompt).toContain('霍尔姆斯');
    expect(spec.prompt).toContain('艾米');
    expect(spec.prompt).toContain('1920s vintage photograph'); // 默认 style=vintage_photo
  });

  it('scn 标量字段优先于 settings', () => {
    const scn: ScenarioImageGen = {
      width: 1024,
      height: 512,
      steps: 30,
      cfgScale: 7,
      sampler: 'Euler a',
    };
    const spec = resolveImageGen(DEFAULT_SETTINGS_IMAGE_DEFAULTS, scn, emptyCtx, true);
    expect(spec.width).toBe(1024);
    expect(spec.height).toBe(512);
    expect(spec.steps).toBe(30);
    expect(spec.cfgScale).toBe(7);
    expect(spec.sampler).toBe('Euler a');
  });

  it('风格 style 切换 → prompt 含对应英文片段', () => {
    const scn: ScenarioImageGen = { style: 'oil_painting' };
    const spec = resolveImageGen(DEFAULT_SETTINGS_IMAGE_DEFAULTS, scn, emptyCtx, true);
    expect(spec.prompt).toContain('classical oil painting');
    expect(spec.prompt).not.toContain('1920s vintage photograph');
  });

  it('风格 custom → 用 stylePromptOverride 字面', () => {
    const scn: ScenarioImageGen = {
      style: 'custom',
      stylePromptOverride: 'my secret art style',
    };
    const spec = resolveImageGen(DEFAULT_SETTINGS_IMAGE_DEFAULTS, scn, emptyCtx, true);
    expect(spec.prompt).toContain('my secret art style');
  });

  it('negative 逗号去重(忽略大小写)', () => {
    const settings = { ...DEFAULT_SETTINGS_IMAGE_DEFAULTS, negativePrompt: 'a, b, c, blurry' };
    const scn: ScenarioImageGen = { negativePromptAppend: 'd, blurry, B, e' };
    const spec = resolveImageGen(settings, scn, emptyCtx, true);
    expect(spec.negativePrompt).toBe('a, b, c, blurry, d, e');
  });

  it('styleAnchors:scn 非 undefined 整块替换;undefined 沿用 settings', () => {
    const settings = { ...DEFAULT_SETTINGS_IMAGE_DEFAULTS, styleAnchors: ['baseline anchor'] };
    const specA = resolveImageGen(settings, undefined, emptyCtx, true);
    expect(specA.prompt).toContain('baseline anchor');

    const scn: ScenarioImageGen = { styleAnchors: ['scn anchor only'] };
    const specB = resolveImageGen(settings, scn, emptyCtx, true);
    expect(specB.prompt).toContain('scn anchor only');
    expect(specB.prompt).not.toContain('baseline anchor');

    // 空数组 = 显式清空
    const scnEmpty: ScenarioImageGen = { styleAnchors: [] };
    const specC = resolveImageGen(settings, scnEmpty, emptyCtx, true);
    expect(specC.prompt).not.toContain('baseline anchor');
  });

  it('enabled 三态:scn.enabled=undefined 沿用 settings;=true 强开;=false 强关', () => {
    expect(resolveImageGen(DEFAULT_SETTINGS_IMAGE_DEFAULTS, undefined, emptyCtx, true).enabled).toBe(true);
    expect(resolveImageGen(DEFAULT_SETTINGS_IMAGE_DEFAULTS, undefined, emptyCtx, false).enabled).toBe(false);
    expect(resolveImageGen(DEFAULT_SETTINGS_IMAGE_DEFAULTS, { enabled: true }, emptyCtx, false).enabled).toBe(true);
    expect(resolveImageGen(DEFAULT_SETTINGS_IMAGE_DEFAULTS, { enabled: false }, emptyCtx, true).enabled).toBe(false);
  });

  it('占位符填充缺失字段 → 替空,不留 {{xxx}}', () => {
    const spec = resolveImageGen(DEFAULT_SETTINGS_IMAGE_DEFAULTS, undefined, emptyCtx, true);
    expect(spec.prompt).not.toMatch(/\{\{\w+\}\}/);
  });

  it('promptTemplate scn 覆盖优先', () => {
    const scn: ScenarioImageGen = {
      promptTemplate: '只有 {{location}} 与 {{characters}}',
    };
    const spec = resolveImageGen(DEFAULT_SETTINGS_IMAGE_DEFAULTS, scn, richCtx, true);
    expect(spec.prompt).toContain('阿卡姆');
    expect(spec.prompt).toContain('霍尔姆斯');
    expect(spec.prompt).not.toContain('深夜'); // 因模板未含 {{time}}
  });

  it('modelOverride 透传', () => {
    const scn: ScenarioImageGen = { modelOverride: 'dall-e-3' };
    const spec = resolveImageGen(DEFAULT_SETTINGS_IMAGE_DEFAULTS, scn, emptyCtx, true);
    expect(spec.modelOverride).toBe('dall-e-3');
  });
});

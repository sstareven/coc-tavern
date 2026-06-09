import { describe, it, expect } from 'vitest';
import { renderPromptTemplate, type PromptTemplateContext } from '../image-gen-merge';

function makeCtx(extra: Partial<PromptTemplateContext> = {}): PromptTemplateContext {
  return {
    style: '', style_anchors: '', location: '', time: '', weather: '',
    characters: '', san: '', scene: '', scene_brief: '', image_hint: '',
    characters_outfit: '', characters_outfit_en: '',
    protocol: 'novelai', model: 'nai-diffusion-4-5-full',
    isNovelAi: true, isV4: true, isSd: false, isOpenAi: false, isChatCompletions: false,
    ...extra,
  };
}

describe('renderPromptTemplate — characters_outfit 占位', () => {
  it('{{characters_outfit}} 渲染中文串', () => {
    const tmpl = 'tags, {{characters_outfit}}, end';
    const result = renderPromptTemplate(tmpl, makeCtx({ characters_outfit: '张三(灰大衣); 李四(护士裙,提油灯)' }));
    expect(result).toBe('tags, 张三(灰大衣); 李四(护士裙,提油灯), end');
  });

  it('{{characters_outfit_en}} 渲染英文串', () => {
    const tmpl = '{{characters_outfit_en}}';
    const result = renderPromptTemplate(tmpl, makeCtx({ characters_outfit_en: 'a man in gray coat, a nurse holding lantern' }));
    expect(result).toBe('a man in gray coat, a nurse holding lantern');
  });

  it('characters_outfit 为空时占位渲染为空', () => {
    expect(renderPromptTemplate('a, {{characters_outfit}}, b', makeCtx({ characters_outfit: '' }))).toBe('a, , b');
  });

  it('EJS 条件块可读到新字段', () => {
    const tmpl = '<% if (characters_outfit) { %>has{{characters_outfit}}<% } else { %>none<% } %>';
    expect(renderPromptTemplate(tmpl, makeCtx({ characters_outfit: 'X' }))).toBe('hasX');
    expect(renderPromptTemplate(tmpl, makeCtx({ characters_outfit: '' }))).toBe('none');
  });
});

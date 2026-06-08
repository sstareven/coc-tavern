// image prompt 模板渲染单测(2026-06-08):
// renderPromptTemplate 支持向后兼容的 {{key}} 占位符 + 新的 EJS 条件/输出块,
// 让玩家在 promptTemplate 里按图像模型(novelai / sd / openai / chat-completions)分支。

import { describe, it, expect } from 'vitest';
import { renderPromptTemplate, type PromptTemplateContext } from '../image-gen-merge';

function makeCtx(overrides: Partial<PromptTemplateContext> = {}): PromptTemplateContext {
  return {
    style: 'vintage style',
    style_anchors: '',
    location: 'library',
    time: 'dusk',
    weather: 'rain',
    characters: 'investigator',
    san: '50',
    scene: '',
    scene_brief: '',
    protocol: 'sd-compat',
    model: 'sd-1.5',
    isNovelAi: false,
    isV4: false,
    isSd: true,
    isOpenAi: false,
    isChatCompletions: false,
    ...overrides,
  };
}

describe('renderPromptTemplate — 向后兼容 {{key}} 占位符', () => {
  it('简单占位符替换', () => {
    const out = renderPromptTemplate(
      '{{style}}, {{location}}, {{time}}',
      makeCtx(),
    );
    expect(out).toBe('vintage style, library, dusk');
  });
  it('缺失字段替空字符串(不留 {{xxx}})', () => {
    const out = renderPromptTemplate(
      '{{style}}, {{notExist}}, {{location}}',
      makeCtx(),
    );
    expect(out).toBe('vintage style, , library');
  });
  it('多次出现同 key 全部替换', () => {
    const out = renderPromptTemplate('{{style}} A {{style}}', makeCtx());
    expect(out).toBe('vintage style A vintage style');
  });
});

describe('renderPromptTemplate — EJS 条件分支', () => {
  it('isNovelAi=true 走 NovelAI 分支', () => {
    const out = renderPromptTemplate(
      '<% if (isNovelAi) { %>anime style<% } else { %>realistic<% } %>',
      makeCtx({ isNovelAi: true, isSd: false, protocol: 'novelai' }),
    );
    expect(out).toBe('anime style');
  });
  it('isNovelAi=false 走默认分支', () => {
    const out = renderPromptTemplate(
      '<% if (isNovelAi) { %>anime style<% } else { %>realistic<% } %>',
      makeCtx(),
    );
    expect(out).toBe('realistic');
  });
  it('isV4 分支:NovelAI V4/V4.5 与 V3 出不同 quality tag', () => {
    const tpl = '<% if (isV4) { %>very aesthetic, absurdres<% } else { %>best quality, amazing quality<% } %>';
    expect(renderPromptTemplate(tpl, makeCtx({
      isNovelAi: true, isV4: true, isSd: false, model: 'nai-diffusion-4-5-full', protocol: 'novelai',
    }))).toBe('very aesthetic, absurdres');
    expect(renderPromptTemplate(tpl, makeCtx({
      isNovelAi: true, isV4: false, isSd: false, model: 'nai-diffusion-3', protocol: 'novelai',
    }))).toBe('best quality, amazing quality');
  });
  it('字段空时不输出空逗号占位', () => {
    const tpl =
      '<% if (characters) { %>{{characters}}, <% } %>'
      + '<% if (location) { %>{{location}}, <% } %>'
      + '{{style}}';
    // characters 与 location 都有 → 都输出
    expect(renderPromptTemplate(tpl, makeCtx())).toBe('investigator, library, vintage style');
    // location 空 → 跳过该段
    expect(renderPromptTemplate(tpl, makeCtx({ location: '' }))).toBe('investigator, vintage style');
    // 都空 → 只剩 style
    expect(renderPromptTemplate(tpl, makeCtx({ characters: '', location: '' }))).toBe('vintage style');
  });
  it('<%= expr %> 输出表达式结果', () => {
    expect(renderPromptTemplate(
      '<%= isNovelAi ? "anime" : "photo" %>, <%= model %>',
      makeCtx({ isNovelAi: true, model: 'nai-test', isSd: false, protocol: 'novelai' }),
    )).toBe('anime, nai-test');
  });
  it('protocol 字面量比较', () => {
    const tpl = '<% if (protocol === "chat-completions") { %>gemini-pro-image hint<% } %>';
    expect(renderPromptTemplate(tpl, makeCtx({
      protocol: 'chat-completions', isChatCompletions: true, isSd: false,
    }))).toBe('gemini-pro-image hint');
    expect(renderPromptTemplate(tpl, makeCtx())).toBe('');
  });
});

describe('renderPromptTemplate — 失败兜底', () => {
  it('模板含非法 JS 表达式 → 退回到只做占位符替换', () => {
    // 非法表达式不应崩溃,返回 fallback(占位符已替换的版本)
    const out = renderPromptTemplate(
      '{{style}} <% this is not valid js %> end',
      makeCtx(),
    );
    // 至少 style 占位符被替换,EJS 失败时 fallback 是占位符替换版本
    expect(out).toContain('vintage style');
    expect(out).toContain('end');
  });
  it('未闭合 <% 不崩溃', () => {
    const out = renderPromptTemplate('{{style}} <% if (true) { ', makeCtx());
    expect(out).toContain('vintage style');
  });
  it('无 EJS 标签纯占位符模板:不进 EJS 编译路径', () => {
    // 这条主要是确保 no-op 路径正确,即便 ctx 字段非常多也快速返回
    const out = renderPromptTemplate('{{style}}', makeCtx());
    expect(out).toBe('vintage style');
  });
});

describe('renderPromptTemplate — 混合语法', () => {
  it('占位符 + EJS 条件 + 表达式混用', () => {
    const tpl =
      '<% if (isNovelAi) { %>{{characters}}, anime style<% } else { %>{{characters}}, realistic<% } %>'
      + ', <%= model %>';
    expect(renderPromptTemplate(tpl, makeCtx({
      isNovelAi: true, isSd: false, model: 'nai-x', protocol: 'novelai',
    }))).toBe('investigator, anime style, nai-x');
    expect(renderPromptTemplate(tpl, makeCtx({
      model: 'sd-checkpoint',
    }))).toBe('investigator, realistic, sd-checkpoint');
  });
});

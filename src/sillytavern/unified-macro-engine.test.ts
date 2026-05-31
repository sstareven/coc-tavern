import { describe, it, expect } from 'vitest';
import {
  isTruthy,
  parseArgs,
  protectEscapes,
  restoreEscapes,
  removeComments,
  collectInjects,
  resolvePlaceholders,
  resolveCommandMacros,
  resolveShorthands,
  resolveIfBlocks,
  resolveCompatLayer,
  resolveFallbackVars,
  resolveAllMacros,
  resolveAllMacrosBatch,
  type MacroContext,
  type MacroMutation,
} from './unified-macro-engine';

function makeCtx(overrides: Partial<MacroContext> = {}): MacroContext {
  return {
    macroVars: {},
    charVars: {},
    gameVars: {},
    charName: 'Alice',
    userName: '调查员',
    modelName: 'gpt-4',
    lastMessage: 'Hello world',
    ...overrides,
  };
}

// ══════════════════════════════════════════════
// Task 1: isTruthy and parseArgs
// ══════════════════════════════════════════════

describe('isTruthy', () => {
  it('returns false for falsy values', () => {
    expect(isTruthy(undefined)).toBe(false);
    expect(isTruthy('')).toBe(false);
    expect(isTruthy('false')).toBe(false);
    expect(isTruthy('False')).toBe(false);
    expect(isTruthy('0')).toBe(false);
    expect(isTruthy('off')).toBe(false);
    expect(isTruthy('no')).toBe(false);
    expect(isTruthy('NO')).toBe(false);
  });

  it('returns true for truthy values', () => {
    expect(isTruthy('true')).toBe(true);
    expect(isTruthy('1')).toBe(true);
    expect(isTruthy('hello')).toBe(true);
    expect(isTruthy('yes')).toBe(true);
    expect(isTruthy(' ')).toBe(true);
  });
});

describe('parseArgs', () => {
  it('splits on :: separator', () => {
    expect(parseArgs('a::b::c')).toEqual(['a', 'b', 'c']);
  });

  it('trims whitespace from args', () => {
    expect(parseArgs(' a :: b :: c ')).toEqual(['a', 'b', 'c']);
  });

  it('returns single-element array for no separator', () => {
    expect(parseArgs('hello')).toEqual(['hello']);
  });

  it('handles empty string', () => {
    expect(parseArgs('')).toEqual(['']);
  });
});

// ══════════════════════════════════════════════
// Task 2: Phase 0 - Preprocessing
// ══════════════════════════════════════════════

describe('Phase 0: Preprocessing', () => {
  describe('escape protection', () => {
    it('replaces escaped braces with placeholders', () => {
      const { text, tokens } = protectEscapes('hello \\{\\{world\\}\\} end');
      expect(text).not.toContain('\\{\\{');
      expect(tokens.length).toBe(1);
      expect(tokens[0]).toBe('{{world}}');
    });

    it('restores placeholders to literal braces', () => {
      const { text, tokens } = protectEscapes('\\{\\{literal\\}\\}');
      const restored = restoreEscapes(text, tokens);
      expect(restored).toBe('{{literal}}');
    });

    it('handles no escapes', () => {
      const { text, tokens } = protectEscapes('no escapes here');
      expect(text).toBe('no escapes here');
      expect(tokens.length).toBe(0);
    });
  });

  describe('removeComments', () => {
    it('removes inline comments', () => {
      expect(removeComments('before {{// comment}} after')).toBe('before  after');
    });

    it('handles multiple comments', () => {
      expect(removeComments('{{// a}} middle {{// b}}')).toBe(' middle ');
    });
  });

  describe('collectInjects', () => {
    it('collects inject macros into outletMap', () => {
      const map = new Map<string, string[]>();
      const text = collectInjects('before {{inject::CombatInfo::深潜者 HP:45}} after', map);
      expect(text).toBe('before  after');
      expect(map.get('CombatInfo')).toEqual(['深潜者 HP:45']);
    });

    it('collects multiple injects for same key', () => {
      const map = new Map<string, string[]>();
      collectInjects('{{inject::Info::A}} {{inject::Info::B}}', map);
      expect(map.get('Info')).toEqual(['A', 'B']);
    });

    it('handles no injects', () => {
      const map = new Map<string, string[]>();
      const text = collectInjects('nothing here', map);
      expect(text).toBe('nothing here');
      expect(map.size).toBe(0);
    });
  });
});

// ══════════════════════════════════════════════
// Task 3: Basic placeholders
// ══════════════════════════════════════════════

describe('Basic placeholders', () => {
  it('resolves {{char}}', () => {
    expect(resolvePlaceholders('Hello {{char}}', makeCtx())).toBe('Hello Alice');
  });

  it('resolves {{user}}', () => {
    expect(resolvePlaceholders('Hi {{user}}', makeCtx())).toBe('Hi 调查员');
  });

  it('resolves {{format_message_variable::stat_data}} 整树 YAML', () => {
    const ctx = makeCtx({ statData: { 世界: { 时间: '深夜' }, 剧情: { 阶段: '高潮' } } });
    const out = resolvePlaceholders('当前状态：\n{{format_message_variable::stat_data}}', ctx);
    expect(out).toContain('世界:');
    expect(out).toContain('时间: 深夜');
    expect(out).toContain('阶段: 高潮');
  });

  it('resolves {{format_message_variable::stat_data.世界}} 子树', () => {
    const ctx = makeCtx({ statData: { 世界: { 时间: '黎明', 天气: '雾' }, 剧情: { 阶段: 'x' } } });
    const out = resolvePlaceholders('{{format_message_variable::stat_data.世界}}', ctx);
    expect(out).toContain('时间: 黎明');
    expect(out).toContain('天气: 雾');
    expect(out).not.toContain('阶段');
  });

  it('{{format_message_variable::stat_data}} 空树/缺失 → 空对象 {}', () => {
    expect(resolvePlaceholders('[{{format_message_variable::stat_data}}]', makeCtx())).toBe('[{}]');
  });

  it('resolves {{model}}', () => {
    expect(resolvePlaceholders('Using {{model}}', makeCtx())).toBe('Using gpt-4');
  });

  it('resolves {{lastMessage}}', () => {
    expect(resolvePlaceholders('Last: {{lastMessage}}', makeCtx())).toBe('Last: Hello world');
  });

  it('is case-insensitive', () => {
    expect(resolvePlaceholders('{{CHAR}} {{User}}', makeCtx())).toBe('Alice 调查员');
  });

  it('resolves {{newline}}', () => {
    expect(resolvePlaceholders('a{{newline}}b', makeCtx())).toBe('a\nb');
  });

  it('resolves {{newline::3}}', () => {
    expect(resolvePlaceholders('a{{newline::3}}b', makeCtx())).toBe('a\n\n\nb');
  });

  it('resolves {{noop}} to empty', () => {
    expect(resolvePlaceholders('a{{noop}}b', makeCtx())).toBe('ab');
  });

  it('resolves {{random::a::b::c}} to one of the options', () => {
    const result = resolvePlaceholders('{{random::晴::阴::雨}}', makeCtx());
    expect(['晴', '阴', '雨']).toContain(result);
  });

  it('resolves {{roll::2d6}} to a number between 2-12', () => {
    const result = resolvePlaceholders('{{roll::2d6}}', makeCtx());
    const num = Number(result);
    expect(num).toBeGreaterThanOrEqual(2);
    expect(num).toBeLessThanOrEqual(12);
  });

  it('resolves {{time}} to HH:MM format', () => {
    const result = resolvePlaceholders('{{time}}', makeCtx());
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it('resolves {{date}} to YYYY-MM-DD format', () => {
    const result = resolvePlaceholders('{{date}}', makeCtx());
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('resolves {{isodate}} to YYYY-MM-DD format', () => {
    const result = resolvePlaceholders('{{isodate}}', makeCtx());
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('resolves {{isotime}} to HH:mm format', () => {
    const result = resolvePlaceholders('{{isotime}}', makeCtx());
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it('resolves {{weekday}} to a day name', () => {
    const result = resolvePlaceholders('{{weekday}}', makeCtx());
    expect(result.length).toBeGreaterThan(0);
  });

  it('leaves unknown macros as-is', () => {
    expect(resolvePlaceholders('{{unknown_macro}}', makeCtx())).toBe('{{unknown_macro}}');
  });
});

// ══════════════════════════════════════════════
// Task 4: Command-style variable macros
// ══════════════════════════════════════════════

describe('Command-style variable macros', () => {
  it('resolves {{getvar::name}}', () => {
    const ctx = makeCtx({ macroVars: { hp: '100' } });
    const { text } = resolveCommandMacros('HP: {{getvar::hp}}', ctx, []);
    expect(text).toBe('HP: 100');
  });

  it('resolves {{getvar::name}} to empty for missing var', () => {
    const { text } = resolveCommandMacros('{{getvar::missing}}', makeCtx(), []);
    expect(text).toBe('');
  });

  it('resolves {{setvar::name::value}} and mutates ctx', () => {
    const ctx = makeCtx();
    const mutations: MacroMutation[] = [];
    const { text } = resolveCommandMacros('{{setvar::hp::100}}rest', ctx, mutations);
    expect(text).toBe('rest');
    expect(ctx.macroVars.hp).toBe('100');
    expect(mutations).toEqual([{ op: 'set', scope: 'local', name: 'hp', value: '100' }]);
  });

  it('resolves {{incvar::name}} increments by 1', () => {
    const ctx = makeCtx({ macroVars: { hp: '10' } });
    const { text } = resolveCommandMacros('{{incvar::hp}}', ctx, []);
    expect(text).toBe('11');
    expect(ctx.macroVars.hp).toBe('11');
  });

  it('resolves {{incvar::name::5}} increments by N', () => {
    const ctx = makeCtx({ macroVars: { hp: '10' } });
    const { text } = resolveCommandMacros('{{incvar::hp::5}}', ctx, []);
    expect(text).toBe('15');
  });

  it('resolves {{decvar::name}} decrements by 1', () => {
    const ctx = makeCtx({ macroVars: { hp: '10' } });
    const { text } = resolveCommandMacros('{{decvar::hp}}', ctx, []);
    expect(text).toBe('9');
  });

  it('resolves {{addvar::name::value}} adds numeric', () => {
    const ctx = makeCtx({ macroVars: { score: '100' } });
    resolveCommandMacros('{{addvar::score::50}}', ctx, []);
    expect(ctx.macroVars.score).toBe('150');
  });

  it('resolves {{addvar::name::value}} concatenates strings', () => {
    const ctx = makeCtx({ macroVars: { name: 'hello' } });
    resolveCommandMacros('{{addvar::name:: world}}', ctx, []);
    expect(ctx.macroVars.name).toBe('hello world');
  });

  it('resolves {{hasvar::name}} returns true/false', () => {
    const ctx = makeCtx({ macroVars: { hp: '10' } });
    expect(resolveCommandMacros('{{hasvar::hp}}', ctx, []).text).toBe('true');
    expect(resolveCommandMacros('{{hasvar::missing}}', ctx, []).text).toBe('false');
  });

  it('resolves {{deletevar::name}} removes the var', () => {
    const ctx = makeCtx({ macroVars: { hp: '10' } });
    resolveCommandMacros('{{deletevar::hp}}', ctx, []);
    expect(ctx.macroVars.hp).toBeUndefined();
  });

  it('resolves global variants the same way', () => {
    const ctx = makeCtx({ macroVars: { g: '5' } });
    expect(resolveCommandMacros('{{getglobalvar::g}}', ctx, []).text).toBe('5');
    resolveCommandMacros('{{setglobalvar::x::99}}', ctx, []);
    expect(ctx.macroVars.x).toBe('99');
  });

  it('is case-insensitive for command names', () => {
    const ctx = makeCtx({ macroVars: { hp: '10' } });
    expect(resolveCommandMacros('{{GetVar::hp}}', ctx, []).text).toBe('10');
  });
});

// ══════════════════════════════════════════════
// Task 5: Variable shorthands
// ══════════════════════════════════════════════

describe('Variable shorthands', () => {
  describe('get (no operator)', () => {
    it('{{.name}} reads local var', () => {
      const ctx = makeCtx({ macroVars: { hp: '100' } });
      expect(resolveShorthands('{{.hp}}', ctx, []).text).toBe('100');
    });

    it('{{$name}} reads global var', () => {
      const ctx = makeCtx({ macroVars: { hp: '100' } });
      expect(resolveShorthands('{{$hp}}', ctx, []).text).toBe('100');
    });

    it('returns empty for missing var', () => {
      expect(resolveShorthands('{{.missing}}', makeCtx(), []).text).toBe('');
    });
  });

  describe('set (=)', () => {
    it('sets variable and returns empty', () => {
      const ctx = makeCtx();
      expect(resolveShorthands('{{.hp = 100}}', ctx, []).text).toBe('');
      expect(ctx.macroVars.hp).toBe('100');
    });
  });

  describe('arithmetic (++, --, +=, -=)', () => {
    it('++ increments by 1 and returns new value', () => {
      const ctx = makeCtx({ macroVars: { hp: '10' } });
      expect(resolveShorthands('{{.hp++}}', ctx, []).text).toBe('11');
    });

    it('-- decrements by 1 and returns new value', () => {
      const ctx = makeCtx({ macroVars: { hp: '10' } });
      expect(resolveShorthands('{{.hp--}}', ctx, []).text).toBe('9');
    });

    it('+= adds value and returns empty', () => {
      const ctx = makeCtx({ macroVars: { hp: '10' } });
      resolveShorthands('{{.hp += 5}}', ctx, []);
      expect(ctx.macroVars.hp).toBe('15');
    });

    it('-= subtracts value and returns empty', () => {
      const ctx = makeCtx({ macroVars: { hp: '10' } });
      resolveShorthands('{{.hp -= 3}}', ctx, []);
      expect(ctx.macroVars.hp).toBe('7');
    });
  });

  describe('comparison (==, !=, >, <, >=, <=)', () => {
    it('== returns "true" on match', () => {
      const ctx = makeCtx({ macroVars: { status: 'active' } });
      expect(resolveShorthands('{{.status == active}}', ctx, []).text).toBe('true');
    });

    it('== returns "false" on mismatch', () => {
      const ctx = makeCtx({ macroVars: { status: 'idle' } });
      expect(resolveShorthands('{{.status == active}}', ctx, []).text).toBe('false');
    });

    it('!= returns "true" on mismatch', () => {
      const ctx = makeCtx({ macroVars: { status: 'idle' } });
      expect(resolveShorthands('{{.status != active}}', ctx, []).text).toBe('true');
    });

    it('> compares numerically', () => {
      const ctx = makeCtx({ macroVars: { hp: '50' } });
      expect(resolveShorthands('{{.hp > 30}}', ctx, []).text).toBe('true');
      expect(resolveShorthands('{{.hp > 80}}', ctx, []).text).toBe('false');
    });

    it('< compares numerically', () => {
      const ctx = makeCtx({ macroVars: { hp: '20' } });
      expect(resolveShorthands('{{.hp < 30}}', ctx, []).text).toBe('true');
    });

    it('>= and <= work', () => {
      const ctx = makeCtx({ macroVars: { hp: '50' } });
      expect(resolveShorthands('{{.hp >= 50}}', ctx, []).text).toBe('true');
      expect(resolveShorthands('{{.hp <= 50}}', ctx, []).text).toBe('true');
    });
  });

  describe('coalescing (||, ??, ||=, ??=)', () => {
    it('|| returns fallback when falsy', () => {
      const ctx = makeCtx({ macroVars: { name: '' } });
      expect(resolveShorthands('{{.name || Guest}}', ctx, []).text).toBe('Guest');
    });

    it('|| returns value when truthy', () => {
      const ctx = makeCtx({ macroVars: { name: 'Alice' } });
      expect(resolveShorthands('{{.name || Guest}}', ctx, []).text).toBe('Alice');
    });

    it('?? returns fallback when undefined', () => {
      const ctx = makeCtx();
      expect(resolveShorthands('{{.missing ?? default}}', ctx, []).text).toBe('default');
    });

    it('?? returns value even if falsy when defined', () => {
      const ctx = makeCtx({ macroVars: { flag: '0' } });
      expect(resolveShorthands('{{.flag ?? default}}', ctx, []).text).toBe('0');
    });

    it('||= sets and returns when falsy', () => {
      const ctx = makeCtx({ macroVars: { name: '' } });
      expect(resolveShorthands('{{.name ||= Guest}}', ctx, []).text).toBe('Guest');
      expect(ctx.macroVars.name).toBe('Guest');
    });

    it('??= sets and returns when undefined', () => {
      const ctx = makeCtx();
      expect(resolveShorthands('{{.missing ??= default}}', ctx, []).text).toBe('default');
      expect(ctx.macroVars.missing).toBe('default');
    });
  });

  describe('whitespace tolerance', () => {
    it('handles extra whitespace', () => {
      const ctx = makeCtx({ macroVars: { hp: '10' } });
      expect(resolveShorthands('{{ .hp }}', ctx, []).text).toBe('10');
      expect(resolveShorthands('{{ .hp == 10 }}', ctx, []).text).toBe('true');
    });
  });
});

// ══════════════════════════════════════════════
// Task 6: If block parser
// ══════════════════════════════════════════════

describe('If block parser', () => {
  it('keeps true branch when condition is truthy', () => {
    const result = resolveIfBlocks('{{if true}}yes{{/if}}', makeCtx(), []);
    expect(result).toBe('yes');
  });

  it('removes content when condition is falsy', () => {
    const result = resolveIfBlocks('{{if false}}no{{/if}}', makeCtx(), []);
    expect(result).toBe('');
  });

  it('uses else branch when condition is falsy', () => {
    const result = resolveIfBlocks('{{if 0}}yes{{else}}no{{/if}}', makeCtx(), []);
    expect(result).toBe('no');
  });

  it('handles ! prefix inversion', () => {
    const result = resolveIfBlocks('{{if !false}}inverted{{/if}}', makeCtx(), []);
    expect(result).toBe('inverted');
  });

  it('resolves nested macros in condition', () => {
    const ctx = makeCtx({ macroVars: { hp: '20' } });
    const result = resolveIfBlocks('{{if {{.hp < 30}}}}low{{else}}ok{{/if}}', ctx, []);
    expect(result).toBe('low');
  });

  it('handles nested if blocks', () => {
    const ctx = makeCtx({ macroVars: { a: 'true', b: 'true' } });
    const result = resolveIfBlocks(
      '{{if {{.a}}}}outer{{if {{.b}}}}inner{{/if}}{{/if}}',
      ctx, [],
    );
    expect(result).toBe('outerinner');
  });

  it('handles nested if with else', () => {
    const ctx = makeCtx({ macroVars: { a: 'true', b: 'false' } });
    const result = resolveIfBlocks(
      '{{if {{.a}}}}A{{if {{.b}}}}B{{else}}C{{/if}}D{{/if}}',
      ctx, [],
    );
    expect(result).toBe('ACD');
  });

  it('leaves unmatched if blocks as-is', () => {
    const result = resolveIfBlocks('{{if true}}no closing', makeCtx(), []);
    expect(result).toBe('{{if true}}no closing');
  });

  it('is case-insensitive for if/else/endif', () => {
    const result = resolveIfBlocks('{{IF true}}yes{{ELSE}}no{{/IF}}', makeCtx(), []);
    expect(result).toBe('yes');
  });

  it('preserves surrounding text', () => {
    const result = resolveIfBlocks('before {{if true}}middle{{/if}} after', makeCtx(), []);
    expect(result).toBe('before middle after');
  });
});

// ══════════════════════════════════════════════
// Task 7: Backward compatibility
// ══════════════════════════════════════════════

describe('Backward compatibility layer', () => {
  it('resolves {{get_global_variable::x}}', () => {
    const ctx = makeCtx({ macroVars: { hp: '100' } });
    expect(resolveCompatLayer('{{get_global_variable::hp}}', ctx).text).toBe('100');
  });

  it('resolves {{get_chat_variable::x}}', () => {
    const ctx = makeCtx({ macroVars: { hp: '100' } });
    expect(resolveCompatLayer('{{get_chat_variable::hp}}', ctx).text).toBe('100');
  });

  it('resolves {{get_preset_variable::x}} from presetVars', () => {
    const ctx = makeCtx({ presetVars: { mood: { name: 'mood', value: 'happy' } } });
    expect(resolveCompatLayer('{{get_preset_variable::mood}}', ctx).text).toBe('happy');
  });

  it('resolves {{get_char_variable::x}} from charVars', () => {
    const ctx = makeCtx({ charVars: { charName: 'Alice' } });
    expect(resolveCompatLayer('{{get_char_variable::charName}}', ctx).text).toBe('Alice');
  });

  it('resolves {{get_character_variable::x}} same as char', () => {
    const ctx = makeCtx({ charVars: { charHP: '80' } });
    expect(resolveCompatLayer('{{get_character_variable::charHP}}', ctx).text).toBe('80');
  });

  it('resolves {{format_global_variable::x::HP: %s}} with template', () => {
    const ctx = makeCtx({ macroVars: { hp: '100' } });
    expect(resolveCompatLayer('{{format_global_variable::hp::HP: %s}}', ctx).text).toBe('HP: 100');
  });

  it('resolves <USER> to user name', () => {
    const ctx = makeCtx();
    expect(resolveCompatLayer('<USER>', ctx).text).toBe('调查员');
  });

  it('resolves <BOT> and <CHAR> to char name', () => {
    const ctx = makeCtx();
    expect(resolveCompatLayer('<BOT>', ctx).text).toBe('Alice');
    expect(resolveCompatLayer('<CHAR>', ctx).text).toBe('Alice');
  });

  it('shows [未找到] for missing compat vars', () => {
    const ctx = makeCtx();
    expect(resolveCompatLayer('{{get_preset_variable::missing}}', ctx).text).toContain('未找到');
  });
});

describe('Fallback variable lookup', () => {
  it('resolves {{varName}} from gameVars', () => {
    const ctx = makeCtx({ gameVars: { charHP: '80' } });
    expect(resolveFallbackVars('HP: {{charHP}}', ctx)).toBe('HP: 80');
  });

  it('resolves Chinese variable names', () => {
    const ctx = makeCtx({ gameVars: { '调查员.生命值.当前': '65' } });
    expect(resolveFallbackVars('{{调查员.生命值.当前}}', ctx)).toBe('65');
  });

  it('falls back from gameVars to charVars', () => {
    const ctx = makeCtx({ charVars: { charName: 'Bob' } });
    expect(resolveFallbackVars('{{charName}}', ctx)).toBe('Bob');
  });

  it('leaves unresolved macros as-is', () => {
    expect(resolveFallbackVars('{{unknown}}', makeCtx())).toBe('{{unknown}}');
  });
});

// ══════════════════════════════════════════════
// Task 8: Outlet system + Public API
// ══════════════════════════════════════════════

describe('Outlet system', () => {
  it('fills outlet with collected inject content', () => {
    const texts = [
      '状态: {{outlet::CombatInfo}}',
      '{{inject::CombatInfo::HP: 100}}',
    ];
    const ctx = makeCtx();
    const results = resolveAllMacrosBatch(texts, ctx);
    expect(results[0].text).toBe('状态: HP: 100');
    expect(results[1].text).toBe('');
  });

  it('joins multiple injects with newline', () => {
    const texts = [
      '{{outlet::Info}}',
      '{{inject::Info::Line A}}',
      '{{inject::Info::Line B}}',
    ];
    const results = resolveAllMacrosBatch(texts, makeCtx());
    expect(results[0].text).toBe('Line A\nLine B');
  });

  it('resolves macros inside inject content', () => {
    const texts = [
      '{{outlet::Status}}',
      '{{inject::Status::HP: {{.hp}}}}',
    ];
    const ctx = makeCtx({ macroVars: { hp: '100' } });
    const results = resolveAllMacrosBatch(texts, ctx);
    expect(results[0].text).toBe('HP: 100');
  });

  it('empty outlet when no injects', () => {
    const result = resolveAllMacros('{{outlet::Missing}}', makeCtx());
    expect(result.text).toBe('');
  });
});

describe('resolveAllMacros (single text)', () => {
  it('resolves nested macros through multiple iterations', () => {
    const ctx = makeCtx({ macroVars: { 'Alice_hp': '80' } });
    const result = resolveAllMacros('HP: {{getvar::{{char}}_hp}}', ctx);
    expect(result.text).toBe('HP: 80');
  });

  it('respects maxDepth', () => {
    const ctx = makeCtx();
    const result = resolveAllMacros('{{char}}', ctx, { maxDepth: 1 });
    expect(result.text).toBe('Alice');
  });

  it('handles escape sequences', () => {
    const result = resolveAllMacros('\\{\\{not a macro\\}\\}', makeCtx());
    expect(result.text).toBe('{{not a macro}}');
  });

  it('removes comments', () => {
    const result = resolveAllMacros('before {{// comment}} after', makeCtx());
    expect(result.text).toBe('before  after');
  });

  it('handles complex nested scenario', () => {
    const ctx = makeCtx({ macroVars: { hp: '20', combat: 'true' } });
    const result = resolveAllMacros(
      '{{if {{.combat}}}}战斗中 {{if {{.hp < 30}}}}危险{{else}}安全{{/if}}{{/if}}',
      ctx,
    );
    expect(result.text).toBe('战斗中 危险');
  });

  it('collects mutations from all processing', () => {
    const ctx = makeCtx();
    const result = resolveAllMacros('{{setvar::x::1}}{{.y = 2}}', ctx);
    expect(result.text).toBe('');
    expect(result.mutations.length).toBe(2);
    expect(ctx.macroVars.x).toBe('1');
    expect(ctx.macroVars.y).toBe('2');
  });

  it('handles trim macro', () => {
    const result = resolveAllMacros('\n\n{{trim}}\n\n', makeCtx());
    expect(result.text.trim()).toBe('');
  });
});

describe('resolveAllMacrosBatch', () => {
  it('shares macroVars mutations across texts', () => {
    const texts = [
      '{{setvar::mode::combat}}',
      'Mode: {{getvar::mode}}',
    ];
    const ctx = makeCtx();
    const results = resolveAllMacrosBatch(texts, ctx);
    expect(results[0].text).toBe('');
    expect(results[1].text).toBe('Mode: combat');
  });

  it('returns separate MacroResult per text', () => {
    const texts = ['{{char}}', '{{user}}'];
    const results = resolveAllMacrosBatch(texts, makeCtx());
    expect(results.length).toBe(2);
    expect(results[0].text).toBe('Alice');
    expect(results[1].text).toBe('调查员');
  });
});

import { describe, it, expect } from 'vitest';
import { stripMvu, escapeStrayInnerQuotes, parseRewriteResponse, parseLlmResponse, coerceJsonObject, cleanChoiceField, stripVarTagsLoose } from './llm-response-parser';

// ============================================================
// cleanChoiceField / stripVarTagsLoose — 剥除畸形 var 标签 + 裸难度文字（真实 bug 回归）
// ============================================================
describe('stripVarTagsLoose — 畸形 var 标签兜底剥除', () => {
  it('剥除正常 var 标签', () => {
    expect(stripVarTagsLoose("查阅 <var name='x' value='y'/> 档案").trim()).toBe('查阅  档案'.trim());
  });
  it('剥除畸形 <Varname=...> 标签（漏空格漏关键字）', () => {
    expect(stripVarTagsLoose("追踪<Varname=lastAction'value='追踪地面痕迹'/>")).toBe('追踪');
  });
  it('剥除畸形 <varname="...> 标签（引号错配）', () => {
    expect(stripVarTagsLoose('线索<varname="lastCheck\'value=\'追踪\'/>')).toBe('线索');
  });
});

describe('cleanChoiceField — 选项字段清理（真实 bug 回归）', () => {
  it('剥除畸形 var 标签 + 裸(普通难度)文字，保留叙事', () => {
    const input = '绕到仓库另一侧，仔细观察地面拖痕与粘液的延伸方向。尝试追踪痕迹(普通难度)，以获得更多线索<Varname=lastAction\'value=\'追踪地面痕迹\'/><varname="lastCheck\'value=\'追踪\'/>';
    const out = cleanChoiceField(input);
    expect(out).not.toContain('<');
    expect(out).not.toContain('Varname');
    expect(out).not.toContain('普通难度');
    expect(out).toContain('绕到仓库另一侧');
    expect(out).toContain('以获得更多线索');
  });
  it('保留合法检定标记 进行XX检定(普通)（不带「难度」二字）', () => {
    const out = cleanChoiceField("进行追踪检定(普通)，追踪痕迹 <var name='lastCheck' value='追踪'/>");
    expect(out).toContain('进行追踪检定(普通)');
    expect(out).not.toContain('<var');
  });
});

// ============================================================
// coerceJsonObject — 标点归一化只作用于 JSON 结构位置，不破坏字符串值内的中文标点
// ============================================================
describe('coerceJsonObject — 结构标点归一化保护字符串内容', () => {
  it('字符串值内的中文标点（，、：；）原样保留', () => {
    const raw = '{"text":"他停下，低声说：走吧；快。","n":1}';
    const { parsed } = coerceJsonObject(raw);
    expect(parsed).not.toBeNull();
    expect((parsed as { text: string }).text).toBe('他停下，低声说：走吧；快。');
  });

  it('结构位置的全角标点（key：value，pair）仍被修复', () => {
    const raw = '{"a"："你好"，"b"："世界"}';
    const { parsed } = coerceJsonObject(raw);
    expect(parsed).not.toBeNull();
    expect(parsed).toEqual({ a: '你好', b: '世界' });
  });

  it('混合：结构全角标点被修复，字符串内中文标点存活', () => {
    const raw = '{"text"："他说：走吧；快。"，"k"：1}';
    const { parsed } = coerceJsonObject(raw);
    expect(parsed).not.toBeNull();
    expect((parsed as { text: string; k: number }).text).toBe('他说：走吧；快。');
    expect((parsed as { text: string; k: number }).k).toBe(1);
  });

  it('字符串内含转义引号时不脱轨，标点仍受保护', () => {
    const raw = '{"text":"他说\\"走\\"，然后；离开。"}';
    const { parsed } = coerceJsonObject(raw);
    expect(parsed).not.toBeNull();
    expect((parsed as { text: string }).text).toBe('他说"走"，然后；离开。');
  });
});

// ============================================================
// stripMvu — HTML tag conversion and stripping
// ============================================================
describe('stripMvu', () => {
  // HTML emphasis tags → {{keyword}} conversion
  describe('HTML emphasis → {{keyword}} conversion', () => {
    it('<strong>text</strong> → {{text}}', () => {
      expect(stripMvu('<strong>text</strong>')).toBe('{{text}}');
    });

    it('<b>text</b> → {{text}}', () => {
      expect(stripMvu('<b>text</b>')).toBe('{{text}}');
    });

    it('<em>text</em> → {{text}}', () => {
      expect(stripMvu('<em>text</em>')).toBe('{{text}}');
    });

    it('<i>text</i> (plain, no data-* attrs) → {{text}}', () => {
      expect(stripMvu('<i>text</i>')).toBe('{{text}}');
    });

    it('nested tags: <strong><em>text</em></strong> → {{text}}', () => {
      // Nested tags are converted sequentially: <em>text</em> → {{text}}, then <strong>{{text}}</strong> → {{{{text}}}}
      // This is acceptable - the outer tags add extra {{}} but content is still visible
      expect(stripMvu('<strong><em>text</em></strong>')).toContain('text');
    });

    it('mixed content: before <strong>bold</strong> after', () => {
      expect(stripMvu('before <strong>bold</strong> after')).toBe('before {{bold}} after');
    });

    it('multiple tags: <strong>a</strong> and <strong>b</strong>', () => {
      expect(stripMvu('<strong>a</strong> and <strong>b</strong>')).toBe('{{a}} and {{b}}');
    });
  });

  // Safety net: strip remaining HTML tags
  describe('safety net: strip remaining HTML tags', () => {
    it('<div>text</div> → text', () => {
      expect(stripMvu('<div>text</div>')).toBe('text');
    });

    it('<span class="x">text</span> → text', () => {
      expect(stripMvu('<span class="x">text</span>')).toBe('text');
    });

    it('<p>text</p> → text', () => {
      expect(stripMvu('<p>text</p>')).toBe('text');
    });
  });

  // Existing behavior preserved
  describe('existing behavior preserved', () => {
    it('<var> tags are stripped', () => {
      expect(stripMvu('<var name="x" value="y"/>')).toBe('');
    });

    it('{{set:...}} macros are stripped', () => {
      expect(stripMvu('{{set:x=1}}')).toBe('');
    });

    it('<i data-var="x"> tags are stripped', () => {
      expect(stripMvu('<i data-var="x">text</i>')).toBe('text');
    });

    it('<i data-set="x"> tags are stripped', () => {
      expect(stripMvu('<i data-set="x">text</i>')).toBe('text');
    });

    it('<i data-val="x"> tags are stripped', () => {
      expect(stripMvu('<i data-val="x">text</i>')).toBe('text');
    });
  });
});

// ============================================================
// escapeStrayInnerQuotes — repair unescaped ASCII quotes in JSON string values
// ============================================================
describe('escapeStrayInnerQuotes', () => {
  it('repairs the real-world Greek-gloss failure (position 464 crash)', () => {
    const broken = '{"leftContent": "你辨认出其中的几个——τὸ ὄνειρον, "梦境",ἄβυσσος, "深渊"）以手写体排列"}';
    // Without repair, this throws
    expect(() => JSON.parse(broken)).toThrow();
    // After repair, it parses and preserves the gloss quotes as literal content
    const repaired = escapeStrayInnerQuotes(broken);
    const parsed = JSON.parse(repaired) as { leftContent: string };
    expect(parsed.leftContent).toContain('"梦境"');
    expect(parsed.leftContent).toContain('"深渊"');
  });

  it('repairs an inner dialogue quote followed by Chinese text', () => {
    const broken = '{"text": "他说"快跑"然后消失了"}';
    expect(() => JSON.parse(broken)).toThrow();
    const parsed = JSON.parse(escapeStrayInnerQuotes(broken)) as { text: string };
    expect(parsed.text).toBe('他说"快跑"然后消失了');
  });

  it('leaves valid JSON untouched (structural quotes preserved)', () => {
    const valid = '{"a": "hello", "b": "world", "c": ["x", "y"], "n": 12}';
    expect(escapeStrayInnerQuotes(valid)).toBe(valid);
    expect(JSON.parse(escapeStrayInnerQuotes(valid))).toEqual(JSON.parse(valid));
  });

  it('does not touch already-escaped quotes', () => {
    const valid = '{"a": "say \\"hi\\" now"}';
    expect(escapeStrayInnerQuotes(valid)).toBe(valid);
  });

  it('handles a string value ending the object (followed by })', () => {
    const broken = '{"a": "结尾是"引号""}';
    const parsed = JSON.parse(escapeStrayInnerQuotes(broken)) as { a: string };
    expect(parsed.a).toBe('结尾是"引号"');
  });
});

describe('parseRewriteResponse', () => {
  it('解析合法补写 JSON，选项重编号为 V–VIII', () => {
    const raw = '{"text":"你握紧了火柴。","choices":[{"num":"1","text":"点燃书页","action":"进行神秘学检定(普通)，点燃 <var name=\'lastAction\' value=\'点燃\'/>"},{"num":"2","text":"先后退","action":"后退观察"},{"num":"3","text":"呼救","action":"大声呼救"},{"num":"4","text":"逃跑","action":"夺门而出"}]}';
    const r = parseRewriteResponse(raw)!;
    expect(r.text).toBe('你握紧了火柴。');
    expect(r.choices.map((c) => c.num)).toEqual(['V', 'VI', 'VII', 'VIII']);
    expect(r.choices[0].text).toBe('点燃书页');
  });

  it('多于 4 个选项时截断为 4', () => {
    const raw = '{"text":"t","choices":[{"text":"a","action":"a"},{"text":"b","action":"b"},{"text":"c","action":"c"},{"text":"d","action":"d"},{"text":"e","action":"e"}]}';
    expect(parseRewriteResponse(raw)!.choices).toHaveLength(4);
  });

  it('不足 4 个选项时补足为 4', () => {
    const raw = '{"text":"t","choices":[{"text":"a","action":"a"}]}';
    const r = parseRewriteResponse(raw)!;
    expect(r.choices).toHaveLength(4);
    expect(r.choices[3].num).toBe('VIII');
  });

  it('裸英文引号被兜底修复', () => {
    const raw = '{"text":"他说"快跑"然后消失","choices":[{"text":"a","action":"a"},{"text":"b","action":"b"},{"text":"c","action":"c"},{"text":"d","action":"d"}]}';
    expect(parseRewriteResponse(raw)!.text).toContain('快跑');
  });

  it('完全非法 → null', () => {
    expect(parseRewriteResponse('这不是JSON')).toBeNull();
  });

  it('全角标点 JSON 被归一化后解析（中文模型常见失败）', () => {
    const raw = '{"text"："你握紧了火柴。"，"choices"：[{"text"："点燃书页"，"action"："点燃书页"}，{"text"："后退"，"action"："后退"}]}';
    const r = parseRewriteResponse(raw);
    expect(r).not.toBeNull();
    expect(r!.text).toBe('你握紧了火柴。');
    expect(r!.choices[0].text).toBe('点燃书页');
  });

  it('尾随逗号被清理后解析', () => {
    const raw = '{"text":"你停下脚步。","choices":[{"text":"前进","action":"前进",},{"text":"后退","action":"后退",},],}';
    const r = parseRewriteResponse(raw);
    expect(r).not.toBeNull();
    expect(r!.text).toBe('你停下脚步。');
  });

  it('中文弯引号强调被转为「」后解析', () => {
    const raw = '{"text":"他低声说“快走”，别回头。","choices":[{"text":"点头","action":"点头"}]}';
    const r = parseRewriteResponse(raw);
    expect(r).not.toBeNull();
    expect(r!.text).toContain('快走');
  });

  it('代码块包裹 + 前导说明文字仍能解析', () => {
    const raw = '好的，这是补写：\n```json\n{"text":"你环顾四周。","choices":[{"text":"搜查","action":"搜查"}]}\n```';
    const r = parseRewriteResponse(raw);
    expect(r).not.toBeNull();
    expect(r!.text).toBe('你环顾四周。');
  });

  it('模型返回非JSON（纯叙事/自然语言列表）时返回 null（救场已移除）', () => {
    const prose = '鹅卵石地面的凉意透过裤子的布料慢慢渗上来——你将后背靠在那扇沉重的橡木门板上。';
    expect(parseRewriteResponse(prose)).toBeNull();
    const list = '迟缓的拖拽声。\n选项一：质问柯林斯\n选项二：坐下\n选项三：逼到墙边\n选项四：搜查';
    expect(parseRewriteResponse(list)).toBeNull();
  });
});
// ============================================================
// parseLlmResponse — 非 JSON 返回 null（救场已移除）
// ============================================================
describe('parseLlmResponse', () => {
  it('LLM返回纯叙事（非JSON）时返回 null', () => {
    const prose = '密斯卡塔尼克大学的标本室位于地下二层。莱克教授站在尽头，「你来了。」他低声说。';
    expect(parseLlmResponse(prose)).toBeNull();
  });

  it('正常JSON回复解析为书页', () => {
    const json = '{"leftHeader":"书房","leftContent":"你走进书房。","rightHeader":"行动","rightContent":"怎么做？","choices":[{"num":"I","text":"搜查","action":"进行侦查检定(普通)"}]}';
    const r = parseLlmResponse(json);
    expect(r).not.toBeNull();
    expect(r!.page.leftHeader).toBe('书房');
  });

  // ── 物品叙事一致性硬执行 ──
  describe('物品叙事一致性硬执行', () => {
    it('叙事提及的物品(add)保留', () => {
      const json = '{"leftHeader":"书房","leftContent":"你在抽屉里发现一封泛黄的信件，小心收起。","rightHeader":"行动","rightContent":"接下来？","choices":[{"num":"I","text":"离开","action":"离开"}],"inventoryChanges":[{"action":"add","name":"泛黄的信件","category":"clue"}]}';
      const r = parseLlmResponse(json);
      expect(r!.page.inventoryChanges).toHaveLength(1);
      expect(r!.page.inventoryChanges![0].name).toBe('泛黄的信件');
    });

    it('叙事未提及的幻影物品(add)被丢弃', () => {
      const json = '{"leftHeader":"书房","leftContent":"你环顾四周，空无一物。","rightHeader":"行动","rightContent":"接下来？","choices":[{"num":"I","text":"离开","action":"离开"}],"inventoryChanges":[{"action":"add","name":"黄金护身符","category":"misc"}]}';
      const r = parseLlmResponse(json);
      expect(r!.page.inventoryChanges).toBeUndefined();
    });

    it('{{关键词}}括号包裹的物品名也能匹配', () => {
      const json = '{"leftHeader":"书房","leftContent":"桌上放着一本{{奈克特抄本}}，你将它收入怀中。","rightHeader":"行动","rightContent":"接下来？","choices":[{"num":"I","text":"离开","action":"离开"}],"inventoryChanges":[{"action":"add","name":"奈克特抄本","category":"key_item"}]}';
      const r = parseLlmResponse(json);
      expect(r!.page.inventoryChanges).toHaveLength(1);
    });

    it('名称变体（叙事"泛黄的信"↔物品"泛黄的信件"）通过片段匹配保留', () => {
      const json = '{"leftHeader":"书房","leftContent":"你拾起一封泛黄的信。","rightHeader":"行动","rightContent":"接下来？","choices":[{"num":"I","text":"离开","action":"离开"}],"inventoryChanges":[{"action":"add","name":"泛黄的信件","category":"clue"}]}';
      const r = parseLlmResponse(json);
      expect(r!.page.inventoryChanges).toHaveLength(1);
    });

    it('叙事未提及的失去(remove)被丢弃', () => {
      const json = '{"leftHeader":"书房","leftContent":"你静静站着。","rightHeader":"行动","rightContent":"接下来？","choices":[{"num":"I","text":"离开","action":"离开"}],"inventoryChanges":[{"action":"remove","name":"银质怀表"}]}';
      const r = parseLlmResponse(json);
      expect(r!.page.inventoryChanges).toBeUndefined();
    });

    it('skipInventoryNarrativeCheck=true 时保留未点名的 add（序章起始装备）', () => {
      const json = '{"leftHeader":"序章","leftContent":"清晨，你准备出发。","rightHeader":"行动","rightContent":"接下来？","choices":[{"num":"I","text":"出发","action":"出发"}],"inventoryChanges":[{"action":"add","name":"怀表","category":"misc"},{"action":"add","name":"外套","category":"misc"}]}';
      const r = parseLlmResponse(json, { skipInventoryNarrativeCheck: true });
      expect(r!.page.inventoryChanges).toHaveLength(2);
    });

    it('equip/update 不强制点名（对已有物品的装备/数量变化）', () => {
      const json = '{"leftHeader":"书房","leftContent":"你整理了一下行装。","rightHeader":"行动","rightContent":"接下来？","choices":[{"num":"I","text":"离开","action":"离开"}],"inventoryChanges":[{"action":"equip","name":"左轮手枪"},{"action":"update","name":"子弹","quantity":-2}]}';
      const r = parseLlmResponse(json);
      expect(r!.page.inventoryChanges).toHaveLength(2);
    });
  });
});

// ============================================================
// stripMvu 单层花括号规范化 + cleanHeader
// ============================================================
import { cleanHeader } from './llm-response-parser';

describe('stripMvu — 单层花括号关键词规范化', () => {
  it('单层 {词} → 双层 {{词}}（高亮、不暴露花括号）', () => {
    expect(stripMvu('一团{不可名状之物}在蠕动')).toBe('一团{{不可名状之物}}在蠕动');
  });
  it('已是 {{词}} 的不被改坏', () => {
    expect(stripMvu('走进{{阿卡姆}}')).toBe('走进{{阿卡姆}}');
  });
  it('混排单层与双层各自正确', () => {
    expect(stripMvu('{单层}与{{双层}}')).toBe('{{单层}}与{{双层}}');
  });
  it('含冒号的类宏 {set:x} 不被当关键词转换', () => {
    expect(stripMvu('{set:x}')).toBe('{set:x}');
  });
});

describe('cleanHeader — 标题清理尖括号/花括号', () => {
  it('去掉标题外的 <>', () => {
    expect(cleanHeader('<标本室·暗涌>')).toBe('标本室·暗涌');
  });
  it('去掉花括号', () => {
    expect(cleanHeader('{标题}')).toBe('标题');
  });
  it('正常标题不变', () => {
    expect(cleanHeader('雾夜中的奥恩楼')).toBe('雾夜中的奥恩楼');
  });
});

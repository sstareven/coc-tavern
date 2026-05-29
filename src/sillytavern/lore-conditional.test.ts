import { describe, it, expect, beforeEach } from 'vitest';
import { renderTemplate } from './ejs-template';
import { useVariableStore } from '../stores/useVariableStore';
import { useLorebookStore } from '../stores/useLorebookStore';

// 取真实内置词条 content（验证条件解锁改造）
const lore = () => useLorebookStore.getState().books.coc_lore.entries;
const set = (name: string, value: string) => useVariableStore.getState().setVariable(name, value, 'llm');

describe('coc_lore 条件解锁', () => {
  beforeEach(() => {
    useVariableStore.getState().clearAll();
  });

  describe('密斯卡塔尼克大学 — 三层渐进解锁', () => {
    it('锁定态只显表层，不剧透特殊馆藏与禁书', () => {
      const out = renderTemplate(lore().miskatonic.content);
      expect(out).toContain('1690');           // 表层公开信息
      expect(out).not.toContain('特殊馆藏室');   // 深层1 未解锁
      expect(out).not.toContain('死灵之书');     // 深层2 未解锁
    });

    it('解锁「密大」后显示特殊馆藏室存在，但仍不剧透禁书', () => {
      set('剧情.已解锁.密大', 'true');
      const out = renderTemplate(lore().miskatonic.content);
      expect(out).toContain('特殊馆藏室');
      expect(out).not.toContain('死灵之书');
    });

    it('解锁「密大特殊馆藏」后才揭示禁书与地下隧道', () => {
      set('剧情.已解锁.密大特殊馆藏', 'true');
      const out = renderTemplate(lore().miskatonic.content);
      expect(out).toContain('死灵之书');
      expect(out).toContain('地下');
    });
  });

  describe('神话典籍 — 接触禁书后才列出书目', () => {
    it('锁定态不列出具体典籍', () => {
      const out = renderTemplate(lore().necronomicon.content);
      expect(out).not.toContain('无名祭祀书');
    });

    it('解锁「接触禁书」后列出典籍详情', () => {
      set('剧情.已解锁.接触禁书', 'true');
      const out = renderTemplate(lore().necronomicon.content);
      expect(out).toContain('无名祭祀书');
    });
  });

  describe('神话生物真相 — 由克苏鲁神话技能解锁', () => {
    it('神话技能为0时，克苏鲁词条只显民间传说', () => {
      const out = renderTemplate(lore().cthulhu.content);
      expect(out).not.toContain('旧日支配者');
      expect(out).not.toContain('拉莱耶');
    });

    it('神话技能>0时揭示克苏鲁本质', () => {
      set('调查员.技能.克苏鲁神话', '5');
      const out = renderTemplate(lore().cthulhu.content);
      expect(out).toContain('旧日支配者');
      expect(out).toContain('拉莱耶');
    });
  });

  describe('南极深渊 — 未到疯狂山脉则完全不揭示', () => {
    it('未解锁疯狂山脉时输出为空（即使关键词命中）', () => {
      const out = renderTemplate(lore().antarctic_abyss.content).trim();
      expect(out).toBe('');
    });

    it('解锁疯狂山脉后显表层传闻，深渊真相仍锁定', () => {
      set('剧情.已解锁.疯狂山脉', 'true');
      const out = renderTemplate(lore().antarctic_abyss.content);
      expect(out).toContain('深渊');
      expect(out).not.toContain('修格斯');
    });

    it('解锁南极深渊后揭示修格斯征服真相', () => {
      set('剧情.已解锁.疯狂山脉', 'true');
      set('剧情.已解锁.南极深渊', 'true');
      const out = renderTemplate(lore().antarctic_abyss.content);
      expect(out).toContain('修格斯');
    });
  });
});

// src/scenario/relation-lorebook.ts
// 剧本关系图 → lorebook 条目渲染（spec §7）
// 纯函数，不引 zustand，可单测。被 subscribeRelationLorebook 副作用调用，
// 玩家/PeopleTab/post-settle 任一改动 characters[].relations / presentAtStart 都触发重新渲染。

import type { ScenarioDoc, ScenarioCharacter, ScenarioEntry, RelationType } from '../types/scenario';

/** 给 ScenarioCharacter 取一个可读名字（用于 lorebook content 与 keys）。
 *  优先 sheet.identity.name；缺失退回 npcAttrs.identityTag；再退回 id。 */
function nameOf(c: ScenarioCharacter): string {
  const raw = c.sheet?.identity?.name?.trim();
  if (raw) return raw;
  if (c.npcAttrs.identityTag.trim()) return c.npcAttrs.identityTag.trim();
  return c.id;
}

/** 渲染一条出边为一行文本。 */
function renderOutEdge(target: ScenarioCharacter, type: RelationType, note?: string): string {
  const namePart = nameOf(target);
  const noteSuffix = note?.trim() ? `（备注：${note.trim()}）` : '';
  return `  · ${type}：${namePart}${noteSuffix}`;
}

/** 渲染一条入边为一行文本。 */
function renderInEdge(source: ScenarioCharacter, type: RelationType, note?: string): string {
  const namePart = nameOf(source);
  const noteSuffix = note?.trim() ? `（备注：${note.trim()}）` : '';
  return `  · ${namePart} → ${type}${noteSuffix}`;
}

/**
 * 把剧本里每个有 relations 或被他人指向（入边）的 ScenarioCharacter 渲染为一条 lorebook 条目。
 * 无关系也无入边的 character → 不生成条目（避免噪声）。
 * 返回 ScenarioEntry[]（由调用方进一步走 scenarioEntriesToLoreEntries 转 LoreEntry）。
 */
export function buildRelationEntries(scenarioDoc: ScenarioDoc): ScenarioEntry[] {
  const sid = scenarioDoc.id;
  const chars = scenarioDoc.characters;
  if (chars.length === 0) return [];
  const byId = new Map<string, ScenarioCharacter>();
  for (const c of chars) byId.set(c.id, c);

  // 反查入边：targetId → Array<{ source, type, note }>
  const inEdges = new Map<string, Array<{ source: ScenarioCharacter; type: RelationType; note?: string }>>();
  for (const src of chars) {
    if (!src.relations) continue;
    for (const r of src.relations) {
      if (!byId.has(r.targetId)) continue; // 悬空边静默跳过（M2 已守，但渲染层再防一次）
      const arr = inEdges.get(r.targetId) ?? [];
      arr.push({ source: src, type: r.type, note: r.note });
      inEdges.set(r.targetId, arr);
    }
  }

  const out: ScenarioEntry[] = [];
  for (const c of chars) {
    const outs = (c.relations ?? []).filter((r) => byId.has(r.targetId));
    const ins = inEdges.get(c.id) ?? [];
    if (outs.length === 0 && ins.length === 0) continue;

    const lines: string[] = [];
    lines.push(`${nameOf(c)}的人际关系：`);
    if (outs.length > 0) {
      for (const r of outs) {
        const tgt = byId.get(r.targetId)!;
        lines.push(renderOutEdge(tgt, r.type, r.note));
      }
    }
    if (ins.length > 0) {
      lines.push('被以下角色提及：');
      for (const e of ins) {
        lines.push(renderInEdge(e.source, e.type, e.note));
      }
    }

    // keys：姓名 + identityTag（spec §7.1 keys = X 姓名 + identityTag + 别名）。
    // 当前 ScenarioCharacter 没有「别名」字段——先只放姓名 + identityTag,
    // 后续若引入 alias 字段在此追加；用逗号分隔与 lorebook 同语义。
    const keyParts = [nameOf(c)];
    if (c.npcAttrs.identityTag.trim()) keyParts.push(c.npcAttrs.identityTag.trim());

    out.push({
      id: `__scenario_${sid}_rel_${c.id}`,
      category: '人物',
      comment: `<${nameOf(c)}> 的人际关系`,
      keys: keyParts.join(','),
      content: lines.join('\n'),
      constant: false,
      position: 1,
      priority: 800,
      cachePolicy: 'dynamic_suffix',
    });
  }
  return out;
}

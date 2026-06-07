// 一次性把 workflow 生成的 roster-patches.json 应用到 src/data/scenarios/<id>.ts。
// 对每个剧本做三件事：
//   1) 给 existing_npc_relations 里列出的每个现有 NPC 在 makeNpc 块尾追加 relations 字段
//   2) 替换 existing_npc_field_overrides（仅 rome titus 的 hiddenBio）
//   3) 在 characters[] 数组的 ] 之前追加 new_npcs 渲染串
// makeNpc 块边界用括号计数器精确定位（容忍 chars/skills 内部嵌套 {}）。
//
// 用法: node scripts/apply-roster-patches.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PATCH_FILE = 'scripts/.backfill-output/roster-patches.json';

const patches = JSON.parse(readFileSync(PATCH_FILE, 'utf-8'));

/**
 * 找到从 startIdx 处开始的某个 NPC 的 makeNpc({ ... }) 块的 [start, end] 字符偏移。
 * startIdx 必须指向 `id: 'npc_xxx',` 那一行的某个偏移；先向前找 `makeNpc({`，再用 { } 计数器找匹配的 `})`。
 * 返回 { blockStart, blockEnd, closeBraceIdx } —— blockStart 指 `makeNpc` 的 'm' 偏移，blockEnd 指 `}),` 后的 `,` 偏移+1，closeBraceIdx 指右括号 `)` 偏移。
 */
function findMakeNpcBlock(src, npcIdRefIdx) {
  // 向前找最近的 'makeNpc('
  const head = src.lastIndexOf('makeNpc(', npcIdRefIdx);
  if (head < 0) throw new Error(`找不到 makeNpc( 在偏移 ${npcIdRefIdx} 之前`);
  // 从 makeNpc( 后的 ( 开始计数（找匹配的 )）
  const openParen = src.indexOf('(', head);
  let i = openParen + 1;
  let depth = 1;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '(' ) depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) break;
    } else if (c === "'") {
      // 跳过单引号字符串（含转义）
      i++;
      while (i < src.length && src[i] !== "'") {
        if (src[i] === '\\') i++;
        i++;
      }
    } else if (c === '`') {
      i++;
      while (i < src.length && src[i] !== '`') i++;
    }
  }
  if (depth !== 0) throw new Error('makeNpc 块未闭合');
  // i 指向匹配的 )，块结束包含其后的 ,
  const closeBraceIdx = i;            // ')'
  const blockEnd = src.indexOf(',', closeBraceIdx) + 1;
  return { blockStart: head, blockEnd, closeBraceIdx };
}

/** 把 ScenarioRelation[] 渲染为多行 TS 源（缩进 6 空格） */
function renderRelations(relations, indent = '      ') {
  if (!relations || relations.length === 0) return '';
  const lines = ['['];
  for (const r of relations) {
    lines.push(`${indent}  { targetId: ${JSON.stringify(r.targetId)}, type: ${JSON.stringify(r.type)}, note: ${JSON.stringify(r.note)} },`);
  }
  lines.push(`${indent}]`);
  return lines.join('\n');
}

/** 把完整新 NPC 数据渲染为 makeNpc({...}) 字面量（4 空格缩进，匹配现有风格） */
function renderNewNpc(npc) {
  const I = '      '; // 6 空格 — 字段缩进
  const lines = ['    makeNpc({'];
  lines.push(`${I}id: ${JSON.stringify(npc.id)},`);
  lines.push(`${I}role: ${JSON.stringify(npc.role)},`);
  lines.push(`${I}name: ${JSON.stringify(npc.name)},`);
  lines.push(`${I}age: ${npc.age},`);
  lines.push(`${I}gender: ${JSON.stringify(npc.gender)},`);
  lines.push(`${I}occupation: ${JSON.stringify(npc.occupation)},`);
  lines.push(`${I}birthplace: ${JSON.stringify(npc.birthplace)},`);
  lines.push(`${I}residence: ${JSON.stringify(npc.residence)},`);
  // chars 单行紧凑
  const charsEntries = Object.entries(npc.chars).map(([k, v]) => `${k}: ${v}`).join(', ');
  lines.push(`${I}chars: { ${charsEntries} },`);
  // skills 单行紧凑（与现有风格一致）
  const skillsEntries = Object.entries(npc.skills).map(([k, v]) => `${JSON.stringify(k)}: ${v}`).join(', ');
  lines.push(`${I}skills: { ${skillsEntries} },`);
  lines.push(`${I}description: ${JSON.stringify(npc.description)},`);
  lines.push(`${I}personality: ${JSON.stringify(npc.personality)},`);
  lines.push(`${I}initialItemsRaw: ${JSON.stringify(npc.initialItemsRaw)},`);
  lines.push(`${I}identityTag: ${JSON.stringify(npc.identityTag)},`);
  lines.push(`${I}attitudeDefault: ${npc.attitudeDefault},`);
  lines.push(`${I}relationshipDefault: ${JSON.stringify(npc.relationshipDefault)},`);
  lines.push(`${I}locationDefault: ${JSON.stringify(npc.locationDefault)},`);
  lines.push(`${I}publicBio: ${JSON.stringify(npc.publicBio)},`);
  lines.push(`${I}hiddenBio: ${JSON.stringify(npc.hiddenBio)},`);
  lines.push(`${I}beliefs: ${JSON.stringify(npc.beliefs)},`);
  lines.push(`${I}significantPeople: ${JSON.stringify(npc.significantPeople)},`);
  lines.push(`${I}meaningfulLocations: ${JSON.stringify(npc.meaningfulLocations)},`);
  lines.push(`${I}treasuredPossessions: ${JSON.stringify(npc.treasuredPossessions)},`);
  lines.push(`${I}traits: ${JSON.stringify(npc.traits)},`);
  lines.push(`${I}injuries: ${JSON.stringify(npc.injuries)},`);
  lines.push(`${I}backgroundFears: ${JSON.stringify(npc.backgroundFears)},`);
  if (npc.relations && npc.relations.length > 0) {
    lines.push(`${I}relations: ${renderRelations(npc.relations, I)},`);
  }
  if (npc.presentAtStart !== undefined) {
    lines.push(`${I}presentAtStart: ${npc.presentAtStart},`);
  }
  lines.push('    }),');
  return lines.join('\n');
}

/** 找到 characters: [ ... ] 数组的结束 ] 位置（数组级 [/] 配平，跳过字符串/对象内部 []） */
function findCharactersArrayEnd(src) {
  const head = src.indexOf('characters:');
  if (head < 0) throw new Error('找不到 characters: 字段');
  const openBracket = src.indexOf('[', head);
  let i = openBracket + 1;
  let depthSq = 1;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '[') depthSq++;
    else if (c === ']') {
      depthSq--;
      if (depthSq === 0) return i;
    } else if (c === "'") {
      i++;
      while (i < src.length && src[i] !== "'") {
        if (src[i] === '\\') i++;
        i++;
      }
    } else if (c === '`') {
      i++;
      while (i < src.length && src[i] !== '`') i++;
    }
  }
  throw new Error('characters[] 未闭合');
}

function applyPatchToFile(file, patch) {
  let src = readFileSync(file, 'utf-8');
  const initialLen = src.length;

  // 某些 agent 把新 NPC 误放进了 existing_npc_relations。把这部分合并回对应的
  // new_npc.relations，避免对一个还不存在的 id 做 existing 修补。
  const newNpcIds = new Set(patch.new_npcs?.map((n) => n.id) ?? []);
  const realExistingRelations = [];
  const newNpcRelOverlay = new Map(); // newNpcId → ScenarioRelation[]
  for (const rel of patch.existing_npc_relations ?? []) {
    if (newNpcIds.has(rel.npc_id)) {
      const acc = newNpcRelOverlay.get(rel.npc_id) ?? [];
      acc.push(...rel.relations);
      newNpcRelOverlay.set(rel.npc_id, acc);
    } else {
      realExistingRelations.push(rel);
    }
  }
  // 合并到 new_npcs[i].relations（去重：按 targetId+type 唯一）
  const enrichedNewNpcs = (patch.new_npcs ?? []).map((npc) => {
    const overlay = newNpcRelOverlay.get(npc.id);
    if (!overlay) return npc;
    const merged = [...(npc.relations ?? []), ...overlay];
    const seen = new Set();
    const dedup = merged.filter((r) => {
      const k = `${r.targetId}|${r.type}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return { ...npc, relations: dedup };
  });

  // 1) existing_npc_field_overrides — 替换 hiddenBio（必须在 relations 插入之前做，避免偏移漂移）
  for (const ov of patch.existing_npc_field_overrides ?? []) {
    if (ov.field !== 'hiddenBio') continue;
    // 找到该 NPC 的 makeNpc 块（文件用单引号）
    const idAnchor = `id: '${ov.npc_id}'`;
    const idIdx = src.indexOf(idAnchor);
    if (idIdx < 0) throw new Error(`找不到 ${ov.npc_id} 的 id 字段`);
    const { blockStart, closeBraceIdx } = findMakeNpcBlock(src, idIdx);
    // 块内找 hiddenBio: '...' 行（hiddenBio 字符串可能跨多行）
    const block = src.slice(blockStart, closeBraceIdx);
    const hbStart = block.indexOf('hiddenBio:');
    if (hbStart < 0) throw new Error(`${ov.npc_id} 块内找不到 hiddenBio:`);
    // 从 hiddenBio: 后定位字符串字面量起止
    let p = blockStart + hbStart + 'hiddenBio:'.length;
    while (p < src.length && (src[p] === ' ' || src[p] === '\t')) p++;
    if (src[p] !== "'") throw new Error(`${ov.npc_id} 的 hiddenBio 未以单引号开头`);
    const strStart = p;
    p++;
    while (p < src.length && src[p] !== "'") {
      if (src[p] === '\\') p++;
      p++;
    }
    const strEnd = p + 1; // 包含闭合 '
    const newLit = JSON.stringify(ov.new_value); // 改用双引号字符串
    src = src.slice(0, strStart) + newLit + src.slice(strEnd);
  }

  // 2) existing_npc_relations — 给每个真实现有 NPC 块的 } 之前追加 relations 字段
  // 必须从文件**末尾**向前扫描应用（否则前面插入会让后面 NPC 的偏移漂移）。
  // 先收集每个 NPC 的 closeBraceIdx，按降序排序，再插入。
  const insertions = [];
  for (const rel of realExistingRelations) {
    const idAnchor = `id: '${rel.npc_id}'`;
    const idIdx = src.indexOf(idAnchor);
    if (idIdx < 0) throw new Error(`找不到 ${rel.npc_id} 的 id 字段`);
    const { closeBraceIdx } = findMakeNpcBlock(src, idIdx);
    // 在 ) 之前注入。需要找到 ) 之前的换行 + 缩进位置。
    // closeBraceIdx 指 ')'。它前面是 '\n    '（4 空格 + 换行）—— 在这之前插入 relations。
    // 我们直接在 ) 之前插入一段 `\n      relations: [...]\n` 并确保格式干净。
    // 但 closeBraceIdx 前的字符是 '\n    '，所以我们把 relations 块插在该换行之前最后一个字符 ',' 后。
    // 更简单：在 ')' 字符之前插入。
    // ')' 之前是 '\n    '；如果我们直接插入 `\n      relations: ...` 在 ')' 之前，得到：
    // ...,
    //     <插入处>
    //   })
    // 即 6 空格 relations 在 } 之前。我们插入字符串包含 `      relations: [...]\n    `
    const relSrc = `      relations: ${renderRelations(rel.relations, '      ')},\n    `;
    insertions.push({ at: closeBraceIdx, text: relSrc });
  }
  insertions.sort((a, b) => b.at - a.at);
  for (const ins of insertions) {
    // closeBraceIdx 指 ')'；它前面通常是 '\n    '（换行 + 4 空格缩进）。我们在 ')' 之前插入文本。
    // 插入位置: closeBraceIdx（即 ')' 的位置），但要先回退到那个换行前的 '}'。
    // 当前块结构: `..., \n    }),`
    // 我们要插在 `}` 之前。先找 closeBraceIdx 之前的 `}` 偏移。
    let j = ins.at - 1;
    while (j >= 0 && (src[j] === ' ' || src[j] === '\t')) j--;
    if (src[j] !== '}') throw new Error(`expected } before makeNpc closing, got ${JSON.stringify(src[j])} at ${j}`);
    const braceIdx = j;
    // braceIdx 指 '}'。它前面是某个字段的换行。我们要在 '}' 这一行的缩进开始位置之前插入 relations 行。
    // 即插在 '\n' 后第一个非空白字符（'}') 之前。
    // 更简单：直接在 '}' 之前换 `      relations: ...,\n    `。注意 '}' 这一行缩进是 '    '（4 空格）。
    // 但我们不打算改 '}' 的缩进，所以插入文本是 `      relations: ...,\n    `（行尾换行 + 4 空格缩进还给 '}'）。
    // 同时还要确保插入处之前的字段有结尾 ','。最后一个字段已经带 ','，所以不用管。
    src = src.slice(0, braceIdx) + ins.text + src.slice(braceIdx);
  }

  // 3) new_npcs — 在 characters[] 数组 ] 之前追加新 NPC 渲染串（使用合并 overlay 后的列表）
  if (enrichedNewNpcs.length > 0) {
    const arrEnd = findCharactersArrayEnd(src);
    const renderedNew = enrichedNewNpcs.map(renderNewNpc).join('\n');
    // arrEnd 指 ']'。它前面是 `\n  `（换行 + 2 空格缩进）。我们在 ']' 这一行的换行之前插入新 NPC 串。
    // 找 arrEnd 之前最近的 '\n' 位置作为插入点。
    let k = arrEnd - 1;
    while (k >= 0 && (src[k] === ' ' || src[k] === '\t')) k--;
    // 插入点 = k+1（缩进开始处，即 ']' 之前的缩进）。
    const insertAt = k + 1;
    src = src.slice(0, insertAt) + renderedNew + '\n  ' + src.slice(insertAt);
    // 注意上面在 ']' 之前补了 '\n  '（换行 + 2 空格缩进），保持 ']' 的对齐
  }

  writeFileSync(file, src, 'utf-8');
  return { fromBytes: initialLen, toBytes: src.length };
}

const scenarioFiles = {
  'sc-rome-cthulhu':    'src/data/scenarios/rome-cthulhu.ts',
  'sc-dark-ages':       'src/data/scenarios/dark-ages.ts',
  'sc-mystic-iceland':  'src/data/scenarios/mystic-iceland.ts',
  'sc-blade-and-arrow': 'src/data/scenarios/blade-and-arrow.ts',
  'sc-gaslight':        'src/data/scenarios/gaslight.ts',
  'sc-dreamlands':      'src/data/scenarios/dreamlands.ts',
  'sc-icarus':          'src/data/scenarios/icarus.ts',
  'sc-harvest':         'src/data/scenarios/harvest.ts',
};

let total = 0;
for (const s of patches.scenarios) {
  const p = s.patch;
  const file = resolve(scenarioFiles[p.scenario_id]);
  try {
    const r = applyPatchToFile(file, p);
    console.log(`✓ ${p.scenario_id}  ${r.fromBytes} → ${r.toBytes} bytes  (+${p.new_npcs.length} npc, +${p.existing_npc_relations.length} rel patch, ${p.existing_npc_field_overrides.length} override)`);
    total++;
  } catch (e) {
    console.error(`✗ ${p.scenario_id} FAILED: ${e.message}`);
    process.exitCode = 1;
  }
}
console.log(`\nDone: ${total}/${patches.scenarios.length} scenarios patched`);

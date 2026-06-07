import type { ChatPreset, ChatMessage, LoreEntry } from '../types';

export interface AssembledMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function resolvePlaceholders(text: string, variables: Record<string, string>): string {
  if (!text.includes('{{')) return text;
  return text.replace(/\{\{([^}]+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : match,
  );
}

/**
 * Match lorebook entries against the current context.
 * Full SillyTavern-compatible matching engine with recursion, regex keys,
 * per-entry scan depth, character filter, triggers, and timed effects.
 */
export interface MatchContext {
  caseSensitive: boolean;
  matchWholeWord: boolean;
  messageCount: number;
  stickyState: Map<string, number>;
  cooldownState: Map<string, number>;
  maxRecursionSteps: number;
  includeNames: boolean;
  tokenBudget: number;
  /** 可选: 当 tokenBudget>0 且有条目被裁掉时触发,用于 UI 溢出告警(alertOnOverflow)。 */
  onOverflow?: (droppedCount: number, totalCandidates: number) => void;
  charName: string;
  generationType: 'normal' | 'continue' | 'regenerate' | 'quiet';
  charTags?: string[];
  matchSources?: {
    personaDescription: string;
    characterDescription: string;
    characterPersonality: string;
    characterDepthPrompt: string;
    scenario: string;
    creatorNotes: string;
  };
}

function isRegex(key: string): RegExp | null {
  const m = key.match(/^\/(.+)\/([gimsuy]*)$/);
  if (!m) return null;
  try { return new RegExp(m[1], m[2]); } catch { return null; }
}

function keyMatch(ctx: string, key: string, caseSensitive: boolean, wholeWord: boolean): boolean {
  if (!key) return false;
  const regex = isRegex(key);
  if (regex) return regex.test(ctx);
  const haystack = caseSensitive ? ctx : ctx.toLowerCase();
  const needle = caseSensitive ? key : key.toLowerCase();
  if (wholeWord) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\b|[\\s,，.。!！?？])${escaped}(?:$|\\b|[\\s,，.。!！?？])`, caseSensitive ? '' : 'i').test(haystack);
  }
  return haystack.includes(needle);
}

function splitKeys(raw: string): string[] {
  const keys: string[] = [];
  let current = '';
  let inRegex = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === '/' && !inRegex && (i === 0 || raw[i - 1] === ',' || raw[i - 1] === '，' || raw[i - 1] === ' ')) {
      inRegex = true; current += c; continue;
    }
    if (inRegex) {
      current += c;
      if (c === '/' && i > 0 && raw[i - 1] !== '\\') {
        while (i + 1 < raw.length && /[gimsuy]/.test(raw[i + 1])) { current += raw[++i]; }
        inRegex = false;
      }
      continue;
    }
    if (c === ',' || c === '，') {
      const t = current.trim();
      if (t) keys.push(t);
      current = '';
    } else {
      current += c;
    }
  }
  const t = current.trim();
  if (t) keys.push(t);
  return keys;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2.5);
}

export function matchLoreEntries(
  contextText: string,
  entries: (LoreEntry & { _id?: string })[],
  matchCtx?: MatchContext,
): LoreEntry[] {
  const globalCS = matchCtx?.caseSensitive ?? false;
  const globalWW = matchCtx?.matchWholeWord ?? false;
  const msgCount = matchCtx?.messageCount ?? 999;
  const sticky = matchCtx?.stickyState;
  const cooldown = matchCtx?.cooldownState;
  const maxRecursion = matchCtx?.maxRecursionSteps ?? 0;
  const tokenBudget = matchCtx?.tokenBudget ?? 0;
  const charName = matchCtx?.charName ?? '';
  const genType = matchCtx?.generationType ?? 'normal';
  const charTags = matchCtx?.charTags ?? [];
  const matchSources = matchCtx?.matchSources;

  function matchSingle(
    ctx: string,
    entry: LoreEntry & { _id?: string },
    isRecursion: boolean,
  ): { pass: boolean; score: number } {
    const id = entry._id || entry.name;
    const cs = entry.caseSensitive === 1 ? true : entry.caseSensitive === 2 ? false : globalCS;
    const ww = entry.matchWholeWord === 1 ? true : entry.matchWholeWord === 2 ? false : globalWW;

    // Character filter — 白/黑名单（优先于 sticky，不符合者直接排除）
    const cf = entry.characterFilter;
    if (cf && ((cf.names?.length ?? 0) > 0 || (cf.tags?.length ?? 0) > 0)) {
      const nameHit = (cf.names ?? []).some((n) => n.toLowerCase() === charName.toLowerCase());
      const tagHit = (cf.tags ?? []).some((t) => charTags.includes(t));
      const matched = nameHit || tagHit;
      // isExclude=false → 白名单：未命中则排除；isExclude=true → 黑名单：命中则排除
      if (cf.isExclude ? matched : !matched) return { pass: false, score: 0 };
    }

    // Triggers — 生成类型触发（空数组 = 不限）
    if (entry.triggers && entry.triggers.length > 0 && !entry.triggers.includes(genType)) {
      return { pass: false, score: 0 };
    }

    if (entry.delay > 0 && msgCount < entry.delay) return { pass: false, score: 0 };
    if (cooldown && (cooldown.get(id) ?? 0) > 0) return { pass: false, score: 0 };
    if (!isRecursion && entry.delayUntilRecursion) return { pass: false, score: 0 };
    if (isRecursion && entry.preventRecursion) return { pass: false, score: 0 };

    if (sticky && (sticky.get(id) ?? 0) > 0) return { pass: true, score: 0 };

    // Additional matching sources — 仅主匹配阶段把额外来源拼入扫描文本（递归阶段用已激活内容）
    let scanText = ctx;
    if (!isRecursion && matchSources) {
      const extra: string[] = [];
      if (entry.matchPersonaDescription && matchSources.personaDescription) extra.push(matchSources.personaDescription);
      if (entry.matchCharacterDescription && matchSources.characterDescription) extra.push(matchSources.characterDescription);
      if (entry.matchCharacterPersonality && matchSources.characterPersonality) extra.push(matchSources.characterPersonality);
      if (entry.matchCharacterDepthPrompt && matchSources.characterDepthPrompt) extra.push(matchSources.characterDepthPrompt);
      if (entry.matchScenario && matchSources.scenario) extra.push(matchSources.scenario);
      if (entry.matchCreatorNotes && matchSources.creatorNotes) extra.push(matchSources.creatorNotes);
      if (extra.length > 0) scanText = ctx + '\n' + extra.join('\n');
    }

    const keys = splitKeys(entry.keys);
    if (keys.length === 0) return { pass: false, score: 0 };
    const matches = keys.map((k) => keyMatch(scanText, k, cs, ww));

    let primaryPass = false;
    switch (entry.logic) {
      case 'AND_ANY': primaryPass = matches.some(Boolean); break;
      case 'AND_ALL': primaryPass = matches.every(Boolean); break;
      case 'NOT_ANY': primaryPass = !matches.some(Boolean); break;
      case 'NOT_ALL': primaryPass = !matches.every(Boolean); break;
      default: primaryPass = matches.some(Boolean);
    }
    if (!primaryPass) return { pass: false, score: 0 };
    const score = matches.filter(Boolean).length;

    if (entry.secondaryKeys) {
      const secKeys = splitKeys(entry.secondaryKeys);
      if (secKeys.length > 0 && !secKeys.every((k) => keyMatch(scanText, k, cs, ww))) {
        return { pass: false, score: 0 };
      }
    }

    return { pass: true, score };
  }

  // Phase 1: Primary matching
  const activated: (LoreEntry & { _id?: string; _score?: number })[] = [];
  const activatedIds = new Set<string>();

  for (const entry of entries) {
    const id = entry._id || entry.name;
    const { pass, score } = matchSingle(contextText, entry, false);
    if (pass) {
      activated.push({ ...entry, _id: id, _score: score });
      activatedIds.add(id);
    }
  }

  // Phase 2: Recursive matching
  if (maxRecursion !== 1) {
    const maxSteps = maxRecursion === 0 ? 10 : maxRecursion;
    for (let step = 0; step < maxSteps - 1; step++) {
      const activatedContent = activated
        .filter((e) => !e.excludeRecursion)
        .map((e) => e.content)
        .join('\n');
      if (!activatedContent) break;

      let foundNew = false;
      for (const entry of entries) {
        const id = entry._id || entry.name;
        if (activatedIds.has(id)) continue;
        const { pass, score } = matchSingle(activatedContent, entry, true);
        if (pass) {
          activated.push({ ...entry, _id: id, _score: score });
          activatedIds.add(id);
          foundNew = true;
        }
      }
      if (!foundNew) break;
    }
  }

  // Phase 3: Inclusion group resolution
  const groups = new Map<string, typeof activated>();
  const ungrouped: typeof activated = [];
  for (const e of activated) {
    if (e.inclusionGroup) {
      const labels = e.inclusionGroup.split(/[,，]/).map((g) => g.trim()).filter(Boolean);
      for (const label of labels) {
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label)!.push(e);
      }
    } else {
      ungrouped.push(e);
    }
  }

  const resolved: LoreEntry[] = [...ungrouped];
  const suppressedIds = new Set<string>();
  const resolvedIds = new Set(ungrouped.map((e) => e._id || e.name));

  for (const [, members] of groups) {
    let candidates = members.filter((m) => !suppressedIds.has(m._id!));
    if (candidates.length === 0) continue;

    const useScoring = candidates.some((m) => m.groupScoring === 1);
    if (useScoring) {
      const maxScore = Math.max(...candidates.map((m) => m._score ?? 0));
      candidates = candidates.filter((m) => (m._score ?? 0) === maxScore);
    }

    let winner: (typeof candidates)[0];
    const hasPrioritize = candidates.some((m) => m.prioritizeInclusion);
    if (hasPrioritize) {
      const prioritized = candidates.filter((m) => m.prioritizeInclusion);
      winner = prioritized.reduce((a, b) => (a.priority > b.priority ? a : b));
    } else {
      const totalWeight = candidates.reduce((s, m) => s + (m.groupWeight || 100), 0);
      let roll = Math.random() * totalWeight;
      winner = candidates[0];
      for (const c of candidates) {
        roll -= (c.groupWeight || 100);
        if (roll <= 0) { winner = c; break; }
      }
    }

    const winnerId = winner._id || winner.name;
    if (!resolvedIds.has(winnerId)) {
      resolved.push(winner);
      resolvedIds.add(winnerId);
    }
    for (const m of members) {
      if (m._id !== winner._id) suppressedIds.add(m._id!);
    }
  }

  // Phase 4: Token budget enforcement
  let final = resolved;
  if (tokenBudget > 0) {
    let used = 0;
    final = [];
    const sorted = [...resolved].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    for (const e of sorted) {
      const tokens = estimateTokens(e.content);
      if (used + tokens > tokenBudget) continue;
      used += tokens;
      final.push(e);
    }
    // 上报溢出:被预算挤掉的条目数 > 0 时调用回调,供 UI(setting面板的 alertOnOverflow)弹 toast。
    const dropped = resolved.length - final.length;
    if (dropped > 0 && matchCtx?.onOverflow) {
      try { matchCtx.onOverflow(dropped, resolved.length); } catch { /* UI 回调失败不影响主流程 */ }
    }
  }

  // Phase 5: Update sticky/cooldown state
  if (sticky && cooldown) {
    for (const e of final) {
      const id = (e as { _id?: string })._id || e.name;
      if (e.sticky > 0) sticky.set(id, e.sticky);
      if (e.cooldown > 0) cooldown.set(id, e.cooldown);
    }
  }

  return final;
}

/**
 * Resolve content for a system marker from its source.
 *
 * Note on the `'main'` marker precedence: a preset carries system-level instruction in
 * TWO legitimate, non-redundant fields — `mainPrompt` (authored via the preset editor UI)
 * and `systemPrompt` (populated by ST imports and built-in presets such as COC_KP_PRESET).
 * The marker resolves `mainPrompt` first and falls back to `systemPrompt`, so neither
 * channel is silently dropped. This `preset` is the macro-PROCESSED preset
 * (see useChatPipeline buildPromptMessages — `processedPreset.systemPrompt` is EJS/macro
 * resolved before assembly), so the fallback already returns fully-resolved text.
 * The `||` precedence is REQUIRED for PATH A (promptItems) correctness regardless of which
 * field a given preset uses — do not remove it.
 */
function resolveMarkerContent(
  markerId: string,
  preset: ChatPreset,
  charVars: Record<string, string>,
  worldInfoBefore: string,
  worldInfoAfter: string,
  formatInstruction: string,
): string {
  switch (markerId) {
    case 'main':
      return preset.mainPrompt || preset.systemPrompt || '';
    case 'formatInstruction':
      return formatInstruction;
    case 'worldInfoBefore':
      return worldInfoBefore;
    case 'worldInfoAfter':
      return worldInfoAfter;
    case 'personaDescription':
      // 字段已删（玩家 Persona 在 COC 投影下与 sheet.identity+description 重复）；
      // marker 保留接收 ST 老预设导入，渲染为空。
      return '';
    case 'charDescription':
      return charVars.description || '';
    case 'charPersonality':
      // 字段已删（性格由 CharCreator「特质」段写进 description 8 段）
      return '';
    case 'scenario':
      // 字段已删（场景由剧本系统 prologueSeed + entries + scenario-engine 接管）
      return '';
    case 'enhanceDefinitions':
    case 'auxiliary':
      return preset.auxiliaryPrompt || '';
    case 'postHistoryInstructions':
      return preset.postHistoryPrompt || '';
    case 'dialogueExamples':
      // 字段已删（COC 翻页式叙事没有「角色第一句话」语义）
      return '';
    default:
      return '';
  }
}

export function assemblePrompt(
  input: string,
  history: ChatMessage[],
  preset: ChatPreset,
  loreEntries: LoreEntry[],
  variables: Record<string, string>,
  formatInstruction?: string,
  loreContent?: { before: string; after: string },
): AssembledMessage[] {
  const messages: AssembledMessage[] = [];
  const promptItems = preset.promptItems || [];
  const sorted = [...promptItems].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  const enabledItems = sorted.filter((p) => p.enabled !== false);

  const wbBefore = loreContent?.before || '';
  const wbAfter = loreContent?.after || '';
  const fmtInstruction = formatInstruction || '';
  // Whether a dedicated formatInstruction marker is present — if so, FORMAT emits in-loop
  // at its configured order (default 0.5, right after `main`), forming a contiguous static
  // [main + FORMAT] prefix for deepseek prefix-cache reuse. Otherwise we append it (legacy).
  const hasFormatMarker = enabledItems.some(
    (p) => p.kind === 'marker' && p.id === 'formatInstruction',
  );

  // Build messages from promptItems in order
  for (const item of enabledItems) {
    let content: string;

    if (item.kind === 'marker') {
      // Marker — resolve content from source
      content = resolveMarkerContent(item.id, preset, variables, wbBefore, wbAfter, fmtInstruction);
      // If the marker has its own content set (user edited it), use that instead
      if (item.content) content = item.content;
    } else {
      // User prompt — use its content directly
      content = item.content || '';
    }

    if (!content.trim()) continue;

    const resolved = resolvePlaceholders(content, variables);
    messages.push({ role: item.role || 'system', content: resolved });
  }

  // If no promptItems, fall back to system prompt from preset
  if (promptItems.length === 0) {
    messages.push({
      role: 'system',
      content: resolvePlaceholders(preset.systemPrompt, variables),
    });

    // Format instruction — emitted BEFORE lore so the static [system + FORMAT] prefix is
    // contiguous and cacheable; all per-turn-varying lore follows it.
    if (formatInstruction) {
      messages.push({ role: 'system', content: resolvePlaceholders(formatInstruction, variables) });
    }

    // Lore entries (per-turn varying)
    const loreSorted = [...loreEntries].sort((a, b) => b.priority - a.priority);
    for (const entry of loreSorted) {
      messages.push({
        role: 'system',
        content: resolvePlaceholders(entry.content, variables),
      });
    }
  } else {
    // promptItems exist — lore and format are handled by markers (worldInfo + formatInstruction).
    // Fallback safety: if the preset has NO formatInstruction marker (legacy presets), append
    // it so the format block is never silently dropped.
    if (formatInstruction && !hasFormatMarker) {
      messages.push({ role: 'system', content: resolvePlaceholders(formatInstruction, variables) });
    }
  }

  // Chat history
  for (const msg of history) {
    messages.push({
      role: msg.role,
      content: resolvePlaceholders(msg.content, variables),
    });
  }

  // Current user input
  messages.push({
    role: 'user',
    content: resolvePlaceholders(input, variables),
  });

  return messages;
}

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useBookStore } from '../stores/useBookStore';
import { usePanelStore } from '../stores/usePanelStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useLorebookStore, AUTO_SUMMARY_BOOK_ID } from '../stores/useLorebookStore';
import { useDarkThreadStore } from '../stores/useDarkThreadStore';
import { useClueStore, CLUE_ACTIVE_CAP } from '../stores/useClueStore';
import { useNpcStore } from '../stores/useNpcStore';
import { useMapStore } from '../stores/useMapStore';
import { useLocationElementStore } from '../stores/useLocationElementStore';
import { useKeyClueStore } from '../stores/useKeyClueStore';
import { useAnchorStore } from '../stores/useAnchorStore';
import { LOCATION_ELEMENT_CAP } from '../stores/useLocationElementStore';
import { useChoiceLockStore } from '../stores/useChoiceLockStore';
import { useKeywordStore } from '../stores/useKeywordStore';
import { useChatStore } from '../stores/useChatStore';
import { saveConversation } from '../stores/sessionLifecycle';
import { integrateClues } from '../sillytavern/clue-integrator';
import { generateBadEnding } from '../sillytavern/bad-ending-generator';
import { generateDarkThread } from '../sillytavern/dark-thread-generator';
import { generateAnchors } from '../sillytavern/anchor-generator';
import { shouldDetectCombat, detectAndBuildEncounter } from '../sillytavern/combat-detector';
import { sanitizeNarrative } from '../sillytavern/sanitize-narrative';
import { useCombatStore } from '../stores/useCombatStore';
import { evaluateKeyClues } from '../sillytavern/key-clue-evaluator';
import { generateStartingItems } from '../sillytavern/starting-items-generator';
import { rectifyMissingNpcs } from '../sillytavern/npc-rectifier';
import { extractLocationElements } from '../sillytavern/location-element-extractor';
import { integrateLocationElements } from '../sillytavern/location-element-integrator';
import { reconcileMap } from '../sillytavern/map-reconciler';
import { usePromptViewerStore } from '../stores/usePromptViewerStore';
import { useTavernHelperStore } from '../stores/useTavernHelperStore';
import { useVariableStore } from '../stores/useVariableStore';
import { useRegexStore } from '../stores/useRegexStore';
import { useInventoryStore } from '../stores/useInventoryStore';
import { useCharSheetStore, isDefaultSheet } from '../stores/useCharSheetStore';
import { useDiceStore } from '../stores/useDiceStore';
import { useErrorModalStore } from '../stores/useErrorModalStore';
import { useStreamingRenderer } from './useStreamingRenderer';

import { assemblePrompt, matchLoreEntries } from '../sillytavern/prompt-assembler';
import { resolveActiveBooks, sortByInsertionStrategy, type WorldInfoSource } from '../sillytavern/worldinfo-scope';
import { sendChatCompletion } from '../sillytavern/api-router';
import { extractVariablesWithLLM, shouldUseLlmExtraction } from '../sillytavern/mvu-extractor';
import { selectLoreForRewrite, droppedLoreForRewrite } from '../sillytavern/rewrite-lite';
import { buildKeywordInjection } from '../sillytavern/keyword-injection';
import { formatStatDataYaml } from '../sillytavern/mvu-format';
import { filterAlreadyAcquiredAdds } from '../sillytavern/item-acquisition';
import { sfxDing } from '../audio/sfx';
import { processSlashCommands, getCommands } from '../sillytavern/slash-commands';
import { renderTemplate } from '../sillytavern/ejs-template';
import { resolveAllMacrosBatch, type MacroContext } from '../sillytavern/unified-macro-engine';
import { runAllRegexScripts } from '../sillytavern/regex-engine';
import { parseDiceResultsFromInput } from '../sillytavern/parse-dice-input';
import {
  loadThScripts,
  runSendHooks,
  runReceiveHooks,
  type ThScriptHooks,
} from '../sillytavern/th-script-engine';
import { extensionsToScripts } from '../sillytavern/extension-runtime';
import { trimToBudget, getModelBudget } from '../sillytavern/context-manager';
import { estimateTokens } from '../sillytavern/token-counter';
import { pushLog } from '../stores/useLogStore';
import { useStatusToastStore } from '../stores/useStatusToastStore';
import { DEFAULT_INPUT_PRESET, DEFAULT_PRESETS, ensureFormatInstructionMarker } from '../constants/presets';
import { FORMAT_INSTRUCTION, CHOICE_FIT_RULE, SAVE_WORLD_INSTRUCTION, PROLOGUE_GOAL_INSTRUCTION } from '../sillytavern/format-instruction';
import { buildThinkingMarker } from '../sillytavern/deepseek-cache';
import { restructureMessages, isDeepSeekSource, buildDynamicTail, hasDynamicMarker, leanStatData, type DsRestructureConfig } from '../sillytavern/deepseek-cache-restructure';
import { diagnosePrefixDrift, formatDiagnosticLine } from '../sillytavern/prefix-cache-diagnostics';
import { parseLlmResponse, parseRewriteResponse, detectNpcMissing } from '../sillytavern/llm-response-parser';
import { type MvuPatchReport, hasUpdateVariableMarker } from '../sillytavern/mvu-jsonpatch';
import { runMvuSelfCorrect } from '../sillytavern/mvu-self-correct';
import { runPostSettleEvaluators } from '../sillytavern/post-settle-evaluators';
import '../sillytavern/bout-evaluator'; // A2 重设: 模块加载即 registerEvaluator('bout', ...)
import { REWRITE_INSTRUCTION } from '../sillytavern/rewrite-instruction';
import { applyPostProcessing } from '../sillytavern/post-processor';
import { buildCharacterVariables, buildAbilityBrief } from '../sillytavern/character-variables';
import { buildContextFromPages } from '../sillytavern/context-builder';
import { kvGet } from '../db/kv';
import type { TokenUsage } from '../sillytavern/stream-parser';
import { getCurrentRpm } from '../sillytavern/rpm-limiter';

import type { ChatPreset, LoreEntry, Extension } from '../types';
import type { AssembledMessage } from '../sillytavern/prompt-assembler';

// ── Return Type ──

export interface UseChatPipelineReturn {
  // State
  loading: boolean;
  error: string;
  clearError: () => void;
  streamingText: string;
  isStreaming: boolean;

  // Token counter
  showTokenCounter: boolean;
  tokenContext: TokenContext | undefined;
  openTokenCounter: (text: string) => void;
  closeTokenCounter: () => void;

  // Prompt viewer
  showPromptViewer: boolean;
  openPromptViewer: (currentInput: string) => void;
  closePromptViewer: () => void;

  // Wand menu actions
  toggleDiceHistory: () => void;
  openVariablePanel: () => void;
  toggleDebugLog: () => void;

  // Pipeline
  submit: (text: string) => Promise<string>;
  regenerate: () => Promise<void>;
  rewriteAction: (input: string) => Promise<void>;

  // Slash command autocomplete
  allCommands: ReturnType<typeof getCommands>;
}

// ── Internal Types ──

interface TokenContext {
  systemPrompt: string;
  loreEntryContents: string[];
  formatInstruction: string;
  chatHistoryMessages: string[];
  userMessage: string;
}

/**
 * 「发送 → 解析 → 失败带纠正消息重试」的公共骨架，主生成与行动补写共用（去重两套近乎相同的 harness）。
 * 差异点（streaming / rpmKind / 消息构造 / 解析器）由调用方通过 send/parse 注入。
 * @param send 发送一次请求；corrective=true 表示这是重试，调用方应附加「系统纠正」消息。
 * @returns result=解析结果(null 表示重试用尽仍失败)，attempts=重试次数，lastContent=最后一次响应原文（成功后处理用）。
 */
async function sendWithJsonRetry<T>(opts: {
  maxRetries: number;
  send: (corrective: boolean) => Promise<{ content: string; usage?: TokenUsage }>;
  parse: (content: string) => T | null;
  logTag: string;
}): Promise<{ result: T | null; attempts: number; lastContent: string; lastUsage?: TokenUsage }> {
  const { maxRetries, send, parse, logTag } = opts;
  let response = await send(false);
  pushLog('debug', `[${logTag}] 收到响应 — ${response.content.length}字 ===\n${response.content}`, 'api');
  let result = parse(response.content);

  let attempt = 0;
  while (!result && attempt < maxRetries) {
    attempt++;
    pushLog('warn', `[${logTag}] 回复非合法JSON，自动重试 ${attempt}/${maxRetries}（要求只输出JSON）…`, 'system');
    response = await send(true);
    pushLog('debug', `[${logTag}] 重试响应(${attempt}) — ${response.content.length}字 ===\n${response.content}`, 'api');
    result = parse(response.content);
  }
  return { result, attempts: attempt, lastContent: response.content, lastUsage: response.usage };
}

// ── Hook ──

export function useChatPipeline(returnToMenu: () => void): UseChatPipelineReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showTokenCounter, setShowTokenCounter] = useState(false);
  const [showPromptViewer, setShowPromptViewer] = useState(false);
  const [tokenContext, setTokenContext] = useState<TokenContext | undefined>();

  const lastInputRef = useRef('');
  const buildFnRef = useRef<((text?: string) => void) | null>(null);
  const currentInputRef = useRef('');
  const abortRef = useRef<AbortController | null>(null);
  const rewriteAbortRef = useRef<AbortController | null>(null);
  const messageCountRef = useRef(0);
  const stickyStateRef = useRef(new Map<string, number>());
  const cooldownStateRef = useRef(new Map<string, number>());

  const { streamingText, isStreaming, onToken, startStream, endStream, enabled: streamRenderEnabled } = useStreamingRenderer();
  const allCommands = useMemo(() => getCommands(), []);

  // TH script hooks — refresh when global or preset scripts change
  const thGlobalScripts = useTavernHelperStore((s) => s.globalScripts);
  const thPresetScripts = useTavernHelperStore((s) => s.presetScripts);
  const thHooks = useMemo<ThScriptHooks>(
    () => {
      // 启用的扩展(内联代码)复用同一 TH 沙箱执行。扩展经 kv 读取(非响应式)，
      // 改动在组件重挂载/切换会话后生效——属低频配置，可接受。
      let exts: Extension[] = [];
      try {
        const raw = kvGet('coc_extensions_v2');
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) exts = parsed as Extension[];
        }
      } catch {
        exts = [];
      }
      return loadThScripts([...thGlobalScripts, ...extensionsToScripts(exts)], thPresetScripts);
    },
    [thGlobalScripts, thPresetScripts],
  );

  // ── buildPromptMessages ──

  const buildPromptMessages = useCallback(
    (overrideInput?: string, formatOverride?: string, opts?: { lite?: boolean; liteIncludeMatchedLore?: boolean }): { messages: AssembledMessage[]; tokenCount: number; preset: ChatPreset; liteSavedTokens: number } | null => {
      const trimmed = (overrideInput ?? '').trim();
      const effectiveInput = trimmed || '(提示词查看器预览)';
      const liteMode = opts?.lite === true;

      // Unified macro engine handles all {{...}} syntax after EJS rendering
      const pt = useTavernHelperStore.getState().promptTemplate;
      let macroProcessedInput = effectiveInput;

      // Run TH script onSend hooks (pre-send pipeline)
      macroProcessedInput = runSendHooks(thHooks, macroProcessedInput);

      // Build context from recent pages
      const contextText = buildContextFromPages();

      // Match lorebook entries against context + user input (scope-aware: global + bound chat books)
      const allBooks = useLorebookStore.getState().books;
      const thOptimize = useTavernHelperStore.getState().optimize;
      const chatNow = useChatStore.getState();
      const sessionLorebookIds = chatNow.sessions.find((s) => s.id === chatNow.activeId)?.lorebookIds ?? [];
      const scopedBooks = resolveActiveBooks(allBooks, sessionLorebookIds, thOptimize.forceWorldbookSettings);
      // 早期取 DS 缓存配置：experimentalSkipMvuVarList 在 buckets 收集阶段就要用
      const earlyDsCache = useSettingsStore.getState().dsCache;
      const experimentalSkipMvuVarList = earlyDsCache?.experimentalSkipMvuVarList === true;
      type ScopedEntry = LoreEntry & { _source?: WorldInfoSource };
      let otherEntries: ScopedEntry[] = [];
      let summaryEntries: ScopedEntry[] = [];
      const generateInjects: ScopedEntry[] = [];
      const constantEntries: ScopedEntry[] = [];
      for (const { bookId, book, source } of scopedBooks) {
        for (const [entryKey, rawEntry] of Object.entries(book.entries)) {
          if (rawEntry.disabled) continue;
          // 实验性：跳过 mvu_var_list（与 statSnapshot 重复，节省 ~400-800 tokens）
          // 注:比 entries 的 key 'mvu_var_list',不是 rawEntry.name(那是中文显示名 '变量列表')
          if (experimentalSkipMvuVarList && entryKey === 'mvu_var_list') continue;
          const entry: ScopedEntry = { ...rawEntry, _source: source };
          const keys = entry.keys.toLowerCase();
          const isGenerate = keys.includes('generate:before') || keys.includes('generate:after');
          const isInject = entry.keys.includes('@INJECT');
          if (pt.generateLoaderEnabled && isGenerate) {
            generateInjects.push(entry);
          } else if (pt.injectLoaderEnabled && isInject) {
            generateInjects.push(entry);
          } else if (entry.constant) {
            constantEntries.push(entry);
          } else if (bookId === AUTO_SUMMARY_BOOK_ID) {
            summaryEntries.push(entry);
          } else {
            otherEntries.push(entry);
          }
        }
      }
      const matchCtx = contextText + '\n' + macroProcessedInput;
      const settingsNow = useSettingsStore.getState();
      // Character variables (also reused later for macro substitution) — needed here for matchSources
      const charVars = buildCharacterVariables();
      const matchSettings = {
        caseSensitive: settingsNow.globalCaseSensitive ?? false,
        matchWholeWord: settingsNow.globalMatchWholeWord ?? false,
        messageCount: messageCountRef.current,
        stickyState: stickyStateRef.current,
        cooldownState: cooldownStateRef.current,
        maxRecursionSteps: settingsNow.maxRecursionSteps ?? 0,
        includeNames: settingsNow.includeNames ?? true,
        tokenBudget: settingsNow.wiBudget ?? 0,
        charName: charVars['charName'] ?? '',
        generationType: 'normal' as const,
        charTags: [] as string[],   // COC 暂无角色标签来源
        matchSources: {
          personaDescription: charVars.personaDescription || '',
          characterDescription: charVars.description || '',
          characterPersonality: charVars.personality || '',
          characterDepthPrompt: '',   // COC 无对应来源
          scenario: charVars.scenario || '',
          creatorNotes: '',           // COC 无对应来源
        },
      };
      let matchedKeyword = matchLoreEntries(matchCtx, otherEntries, matchSettings);
      // Probability filter: entries with probability < 100 have a chance of being skipped
      matchedKeyword = matchedKeyword.filter((e) => e.probability >= 100 || Math.random() * 100 < e.probability);
      let matchedSummary = matchLoreEntries(matchCtx, summaryEntries, matchSettings);
      const maxSummary = useSettingsStore.getState().maxSummaryEntries;
      if (matchedSummary.length > maxSummary) {
        matchedSummary = matchedSummary.slice(-maxSummary);
      }
      // Constant entries are always injected (bypass keyword matching), but still respect triggers
      const constantBucket = constantEntries.filter((e) => !e.triggers?.length || e.triggers.includes('normal'));

      // Dark thread context (bypasses keyword matching)
      const darkThreadBucket: LoreEntry[] = [];
      const saveWorldMode = useKeyClueStore.getState().saveWorldMode;
      const darkCtx = useDarkThreadStore.getState().buildContextInjection(saveWorldMode);
      if (darkCtx) {
        darkThreadBucket.push({
          name: '暗线状态', keys: '', content: darkCtx,
          logic: 'AND_ANY', priority: 2, disabled: false,
          constant: true, position: 0, depth: 0, probability: 100,
          secondaryKeys: '', scanDepth: 0, caseSensitive: 0, matchWholeWord: 0,
          groupScoring: 0, automationId: '', inclusionGroup: '', prioritizeInclusion: false,
          groupWeight: 100, sticky: 0, cooldown: 0, delay: 0,
          preventRecursion: false, delayUntilRecursion: false, excludeRecursion: false,
          ignoreReplyLimit: false,
          _source: 'global',
        } as LoreEntry);
      }

      // 剧情骨架与进程（开局锚点+硬约束+已发生事件时间线+软引导+开放式胜利判定）。
      // 像暗线一样常驻注入，补写 lite 模式由 selectLoreForRewrite 丢弃。事件时间线取最近 N 页 page.summary 现算。
      const anchorBucket: LoreEntry[] = [];
      const recentSummaries = useBookStore.getState().pages
        .slice(-12)
        .map((p) => p.summary)
        .filter((s): s is string => !!s && s.trim().length > 0);
      const anchorCtx = useAnchorStore.getState().buildContextInjection(recentSummaries);
      if (anchorCtx) {
        anchorBucket.push({
          name: '剧情骨架与进程', keys: '', content: anchorCtx,
          logic: 'AND_ANY', priority: 2, disabled: false,
          constant: true, position: 0, depth: 0, probability: 100,
          secondaryKeys: '', scanDepth: 0, caseSensitive: 0, matchWholeWord: 0,
          groupScoring: 0, automationId: '', inclusionGroup: '', prioritizeInclusion: false,
          groupWeight: 100, sticky: 0, cooldown: 0, delay: 0,
          preventRecursion: false, delayUntilRecursion: false, excludeRecursion: false,
          ignoreReplyLimit: false,
          _source: 'global',
        } as LoreEntry);
      }

      // Keyword dictionary context (混合策略：最近 3 页 page.keywords 常驻 + 老词按当前文本匹配)。
      // scanText 用 matchCtx(上下文+输入)，让最近叙事提到的老关键词也被回灌。轻量补写模式由 selectLoreForRewrite 丢弃。
      const keywordBucket: LoreEntry[] = [];
      const kwInjection = buildKeywordInjection({
        recentPages: useBookStore.getState().pages.slice(-3),
        accumulated: useKeywordStore.getState().keywords,
        scanText: matchCtx,
        maxEntries: 40,
      });
      if (kwInjection) {
        keywordBucket.push({
          name: '已知词条', keys: '', content: kwInjection,
          logic: 'AND_ANY', priority: 2, disabled: false,
          constant: true, position: 0, depth: 0, probability: 100,
          secondaryKeys: '', scanDepth: 0, caseSensitive: 0, matchWholeWord: 0,
          groupScoring: 0, automationId: '', inclusionGroup: '', prioritizeInclusion: false,
          groupWeight: 100, sticky: 0, cooldown: 0, delay: 0,
          preventRecursion: false, delayUntilRecursion: false, excludeRecursion: false,
          ignoreReplyLimit: false,
          _source: 'global',
        } as LoreEntry);
      }

      // statData 快照(世界/剧情/战斗整树 YAML)：让 AI 看到当前叙事状态(调查员.* 在角色卡,不在此)。
      // 与暗线同模式的运行时常驻注入；轻量补写由 selectLoreForRewrite 丢弃。
      const statSnapshotBucket: LoreEntry[] = [];
      const rawStat = useVariableStore.getState().statData;
      const visibleStat: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rawStat)) {
        if (!k.startsWith('_') && !k.startsWith('$')) visibleStat[k] = v;
      }
      // 实验性 statSnapshot 减肥：丢弃 /剧情/已解锁/线索/关键事件 等长但低频字段，
      // 仅保留 HP/SAN/MP/姿态/状态/战斗/时间/天气/暗线进度/阶段。省 ~500-1500 tokens/回合。
      const leanedStat = earlyDsCache?.experimentalLeanSnapshot === true
        ? leanStatData(visibleStat)
        : visibleStat;
      if (Object.keys(leanedStat).length > 0) {
        const snapshotYaml = formatStatDataYaml(leanedStat);
        if (snapshotYaml && snapshotYaml !== '{}') {
          statSnapshotBucket.push({
            name: '当前状态', keys: '', content: `[当前状态 — 守秘人参考，世界/剧情/战斗的实时快照]\n${snapshotYaml}`,
            logic: 'AND_ANY', priority: 2, disabled: false,
            constant: true, position: 0, depth: 0, probability: 100,
            secondaryKeys: '', scanDepth: 0, caseSensitive: 0, matchWholeWord: 0,
            groupScoring: 0, automationId: '', inclusionGroup: '', prioritizeInclusion: false,
            groupWeight: 100, sticky: 0, cooldown: 0, delay: 0,
            preventRecursion: false, delayUntilRecursion: false, excludeRecursion: false,
            ignoreReplyLimit: false,
            _source: 'global',
          } as LoreEntry);
        }
      }

      // GENERATE/INJECT entries (always injected regardless of keyword match)
      const generateInjectBucket: LoreEntry[] =
        pt.generateLoaderEnabled || pt.injectLoaderEnabled ? generateInjects : [];

      // Invert compatibility: disabled entries still get processed if invertEnabled
      const invertedBucket: LoreEntry[] = [];
      if (pt.invertEnabled) {
        for (const book2 of Object.values(allBooks)) {
          if (book2.enabled === false) continue;
          for (const e of Object.values(book2.entries)) {
            if (e.disabled) invertedBucket.push(e);
          }
        }
      }

      // Merge buckets into the final lore list. In lite (action-rewrite) mode this drops the
      // expensive, rewrite-irrelevant buckets (summary/dark-thread/generate-inject/inverted, and
      // keyword-matched unless liteIncludeMatchedLore) — see selectLoreForRewrite. Non-lite returns
      // the canonical full ordering, byte-for-byte equivalent to the previous inline assembly.
      const loreBuckets = {
        matchedKeyword,
        summary: matchedSummary,
        constant: constantBucket,
        darkThread: darkThreadBucket,
        anchor: anchorBucket,
        keyword: keywordBucket,
        statSnapshot: statSnapshotBucket,
        generateInjects: generateInjectBucket,
        inverted: invertedBucket,
      };
      const loreOpts = { lite: liteMode, liteIncludeMatchedLore: opts?.liteIncludeMatchedLore };
      const matchedLore = selectLoreForRewrite(loreBuckets, loreOpts);

      // DS 缓存优化器：在 lore 渲染前先决定哪些 entry 走"动态尾置"通道（仅 isDeepSeekSource & restructure 开启）。
      // 动态桶 = matchedKeyword/summary/darkThread/anchor/keyword/statSnapshot（每回合通常变）；
      // 静态桶 = constant/generateInjects/inverted；用户可通过 treatConstantAsDynamic 把 constant 也下沉。
      // 自动检测(默认开)：constantBucket 里【含 EJS/动态宏】的条目(如 coc_lore 的 ejs_san_state/mvu_var_list 等)
      //   会自动加入 dynamicEntriesByRef——它们 entry.constant=true 但渲染结果随 statData 变，曾是命中率衰减元凶。
      const dsCfg = settingsNow.dsCache;
      const dsRestructureOn =
        !liteMode &&
        dsCfg?.restructure === true &&
        isDeepSeekSource(settingsNow.apiModel, dsCfg.targetSources ?? 'deepseek,custom');
      const dynamicEntriesByRef = new Set<LoreEntry>();
      const autoDetectedDynamicConstants: string[] = []; // 名字列表，仅给 debugLog 用
      if (dsRestructureOn) {
        for (const e of matchedKeyword) dynamicEntriesByRef.add(e);
        for (const e of matchedSummary) dynamicEntriesByRef.add(e);
        for (const e of darkThreadBucket) dynamicEntriesByRef.add(e);
        for (const e of anchorBucket) dynamicEntriesByRef.add(e);
        for (const e of keywordBucket) dynamicEntriesByRef.add(e);
        for (const e of statSnapshotBucket) dynamicEntriesByRef.add(e);
        const treatAllConstantAsDynamic = dsCfg.treatConstantAsDynamic === true;
        const autoDetect = dsCfg.autoDetectDynamicConstant !== false; // 默认开
        for (const e of constantBucket) {
          if (treatAllConstantAsDynamic) {
            dynamicEntriesByRef.add(e);
          } else if (autoDetect && hasDynamicMarker(e.content)) {
            dynamicEntriesByRef.add(e);
            autoDetectedDynamicConstants.push(e.name);
          }
        }
        if (dsCfg.debugLog === true && autoDetectedDynamicConstants.length > 0) {
          console.log(
            '[ds-cache-restructure] 自动下沉的 constant 条目(含 EJS/动态宏):',
            autoDetectedDynamicConstants,
          );
        }
      }
      // Token savings of lite mode = estimated tokens of the lore entries it dropped vs the full build.
      // Pure calculation over the bucket diff (no second buildPromptMessages call → no side effects).
      const liteSavedTokens = liteMode
        ? droppedLoreForRewrite(loreBuckets, loreOpts).reduce((sum, e) => sum + estimateTokens(e.content), 0)
        : 0;
      // Debug logging
      if (pt.debugEnabled) {
        pushLog(
          'debug',
          `[PT] 世界书条目: ${matchedLore.length}条匹配(含${matchedSummary.length}条总结/${maxSummary}上限) + ${generateInjectBucket.length}条注入${darkCtx ? ' + 暗线注入' : ''}${liteMode ? ' [轻量补写]' : ''}`,
          'system',
        );
      }

      // Build full variable substitution map (character + game variables)
      // charVars already built above for matchSources; reuse it here.
      const gameVars = useVariableStore.getState().buildFullSubstitutionMap();

      // Load active preset (try chat session, then localStorage, fall back to default)
      const activePresetId =
        useChatStore
          .getState()
          .sessions.find((s) => s.id === useChatStore.getState().activeId)?.presetId ||
        kvGet('coc_last_preset') ||
        'p2';
      let activePreset: ChatPreset = DEFAULT_INPUT_PRESET;
      try {
        const raw = kvGet('coc_presets_v1');
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved[activePresetId]) {
            const builtin = DEFAULT_PRESETS[activePresetId];
            activePreset = { ...DEFAULT_INPUT_PRESET, ...(builtin || {}), ...saved[activePresetId] };
            // Ensure promptItems from code default if saved version is empty
            if (builtin && (!saved[activePresetId].promptItems || saved[activePresetId].promptItems.length === 0)) {
              activePreset.promptItems = builtin.promptItems;
            }
          }
        }
      } catch {
        /* use default */
      }
      // Fall back to built-in presets if not found in localStorage
      if (activePreset === DEFAULT_INPUT_PRESET && activePresetId) {
        if (DEFAULT_PRESETS[activePresetId]) {
          activePreset = { ...DEFAULT_INPUT_PRESET, ...DEFAULT_PRESETS[activePresetId] };
        }
      }

      // Prompt Template: EJS render options
      const tmplOpts = {
        disableWith: pt.withContextDisabled,
        cache: { enabled: pt.cacheEnabled, size: pt.cacheSize },
      };

      // Process EJS templates in system prompt and lore entries
      const processedPreset = {
        ...activePreset,
        // P3b: retrofit persisted presets edited before the formatInstruction marker existed,
        // so the static FORMAT block front-loads (order 0.5) for prefix-cache reuse.
        promptItems: ensureFormatInstructionMarker(activePreset.promptItems),
        systemPrompt: renderTemplate(
          activePreset.systemPrompt || DEFAULT_INPUT_PRESET.systemPrompt,
          tmplOpts,
        ),
      };
      const processedLore = matchedLore.map((e) => ({
        ...e,
        content: renderTemplate(e.content, tmplOpts),
        _isDynamic: dynamicEntriesByRef.has(e),
      }));
      // 序章首回合的「起始装备」【不再注入主回合格式】——曾内联追加 PROLOGUE_STARTING_ITEMS_INSTRUCTION，
      // 但被 FORMAT_INSTRUCTION 主体「无物品变化则省略 inventoryChanges」压过，模型把开场判为「无变化」整体丢弃
      // （日志现象：parsed 顶层键缺 inventoryChanges/clues）。改为解析成功后用独立 LLM 调用 generateStartingItems
      // 生成、并入首页 inventoryChanges（见下方应用段），与坏结局同源解耦（inline-llm-fields-truncate-trailing）。
      let baseFormat = formatOverride ?? FORMAT_INSTRUCTION;
      // DS 缓存优化器：动态附加段（每回合变）按开关分流——dsRestructureOn 时 push 到 dynamicFormatParts，
      // 由 dynamicTail 拼到合并 user 末尾；否则保持原行为 `+=` 到 baseFormat 中（旧路径，进 system 前缀）。
      const dynamicFormatParts: string[] = [];
      const addFormatPart = (s: string) => {
        if (dsRestructureOn && !formatOverride) dynamicFormatParts.push(s);
        else baseFormat += '\n\n' + s;
      };
      // 坏结局【不再注入主回合格式】——曾导致模型在主 JSON 末尾挤掉 clues/npcUpdates/mapUpdates 的回归。
      // 改为回合后用独立 LLM 调用 generateBadEnding 生成（见下方应用段），与主输出彻底解耦。
      // 注入「调查员能力概览」+ 选项契合规则，让 LLM 据角色强项/性格生成选项（非补写、非空白卡）。
      if (!formatOverride && !isDefaultSheet(useCharSheetStore.getState().sheet)) {
        addFormatPart('【调查员能力概览】' + buildAbilityBrief() + '\n\n' + CHOICE_FIT_RULE);
      }
      // 注入「当前随身物品」清单：让 LLM 知道调查员实际持有什么，生成行动选项时不再凭空让玩家使用未拥有的物品
      // （如背包没相机却给「使用相机」选项——根因是物品清单此前只进世界书匹配 contextText、从不进消息体）。
      // 空背包也注入「空」提示——此时任何「使用某物」选项都更应避免。物品使用约束规则见 FORMAT_INSTRUCTION 重要物品约束段。
      if (!formatOverride) {
        const invSummary = useInventoryStore.getState().buildInventorySummary();
        addFormatPart(invSummary || '[调查员随身物品]\n（空——调查员目前身上没有任何物品）');
      }
      // 注入在场 NPC 档案，让 LLM 一致地扮演他们。
      if (!formatOverride) {
        const npcCtx = useNpcStore.getState().buildContextInjection();
        if (npcCtx) addFormatPart(npcCtx);
      }
      // 注入当前地点已知的「地点元素」，让 LLM 与既有环境特征保持一致、不凭空矛盾。
      if (!formatOverride) {
        const ms = useMapStore.getState();
        const curLocName = ms.locations.find((l) => l.id === ms.currentLocationId)?.name ?? '';
        if (curLocName) {
          const locElemCtx = useLocationElementStore.getState().buildContextInjection(curLocName);
          if (locElemCtx) addFormatPart(locElemCtx);
        }
      }
      // 拯救世界系统注入。
      if (!formatOverride) {
        // 真相支柱进度（守秘人机密引导，引导剧情逐步让玩家逼近未揭示支柱；绝不泄露原文给玩家）。
        const pillarCtx = useKeyClueStore.getState().buildContextInjection();
        if (pillarCtx) addFormatPart(pillarCtx);
        // 拯救世界模式：集齐 3 关键线索后进入与暗线赛跑的终局。
        if (saveWorldMode) addFormatPart(SAVE_WORLD_INSTRUCTION);
        // 序章首幕：结合本局谜题向调查员点明核心目标（纯叙事，无截断风险）。
        if (useBookStore.getState().pages.length <= 1) addFormatPart(PROLOGUE_GOAL_INSTRUCTION);
      }
      const processedFormat = renderTemplate(baseFormat, tmplOpts);
      const dynamicFormatJoined = dynamicFormatParts.join('\n\n');
      const renderedDynamicFormat = dynamicFormatJoined ? renderTemplate(dynamicFormatJoined, tmplOpts) : '';

      // ── Unified Macro Engine: resolve all {{...}} syntax in one batch ──
      const macroCtx: MacroContext = {
        macroVars: { ...useTavernHelperStore.getState().macroVars },
        presetVars: activePreset.tavernHelperVars,
        charVars,
        gameVars,
        statData: useVariableStore.getState().statData,
        charName: useCharSheetStore.getState().sheet?.identity?.name ?? '',
        userName: charVars['charName'] || '调查员',
        modelName: useSettingsStore.getState().apiModel,
        lastMessage: '',
      };

      // 双人成行等大预设的功能开关依赖 {{setvar}}/{{getvar}} 宏跨条目协作：必须把 enabled
      // 且有静态 content 的 promptItems 按 order 一并纳入同一个宏批处理（共享变量作用域），
      // 让前部条目 setvar 设值、后部核心条目 getvar 取值组装。否则这些宏只会以字面文本注入、功能失效。
      const sortedItems = [...processedPreset.promptItems].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
      const macroItemPositions: number[] = []; // sortedItems 中需跑宏的下标
      const itemTexts: string[] = [];
      // 自动下沉：扫描 role='system' 且含动态宏的 promptItem,渲染后剥离到 dynamicTail。
      // 渲染阶段所有字符串走同一 batch（共享 macroCtx.macroVars）→ 渲染顺序与组装位置完全解耦,
      // setvar/getvar 跨条目链不破坏。仅作用于 system 类（user/assistant 是对话结构,保持原位）。
      const autoSinkDynamicPromptItem =
        dsRestructureOn && dsCfg.autoSinkDynamicPromptItem !== false;
      sortedItems.forEach((it, idx) => {
        if (it.enabled !== false && it.content && it.content.trim()) {
          macroItemPositions.push(idx);
          itemTexts.push(it.content);
          const isSystemRole = (it.role || 'system') === 'system';
          if (autoSinkDynamicPromptItem && isSystemRole && hasDynamicMarker(it.content)) {
            (it as { _sinkToDynamicTail?: boolean })._sinkToDynamicTail = true;
          }
        }
      });

      // DS 缓存优化器诊断（debugLog 模式）：扫描【会进入静态前缀】的预设字段是否含动态宏。
      // - role='system' 类 promptItem 若含动态宏 → 已自动下沉到 dynamicTail（autoSinkDynamicPromptItem
      //   默认开）,宏链不破坏（因为渲染走同一 macro batch,组装位置改变与宏副作用无关）。
      // - role='user'/'assistant' 类不能下沉（会破坏对话结构）→ 仍报给用户排查。
      // - preset.systemPrompt 也走静态前缀,含动态宏会污染（用户需要自己改）。
      if (dsRestructureOn && dsCfg.debugLog === true) {
        const sunkWarnings: string[] = [];
        const userActionableWarnings: string[] = [];
        if (hasDynamicMarker(processedPreset.systemPrompt)) {
          userActionableWarnings.push(`preset.systemPrompt: ${processedPreset.systemPrompt.slice(0, 80)}...`);
        }
        sortedItems.forEach((it) => {
          if (it.enabled !== false && it.content && hasDynamicMarker(it.content)) {
            const isSystemRole = (it.role || 'system') === 'system';
            const label = `promptItem[${it.id ?? it.role}/${it.kind ?? 'unknown'}]: ${it.content.slice(0, 80)}...`;
            if (autoSinkDynamicPromptItem && isSystemRole) {
              sunkWarnings.push(label);
            } else {
              userActionableWarnings.push(`(role=${it.role || 'system'}) ${label}`);
            }
          }
        });
        if (sunkWarnings.length > 0) {
          console.log(
            `[ds-cache-restructure] ✅ 已自动下沉 ${sunkWarnings.length} 个 system 类含动态宏的 promptItem 到 dynamicTail（前缀缓存保护）：\n  ` +
              sunkWarnings.join('\n  '),
          );
        }
        if (userActionableWarnings.length > 0) {
          console.log(
            '[ds-cache-restructure] ⚠️ 以下字段含动态宏会污染前缀缓存（user/assistant 类与 systemPrompt 不能自动下沉，需手动改）：\n  ' +
              userActionableWarnings.join('\n  ') +
              '\n  建议：把这些字段的内容改为不含 {{xxx.yyy}}/<%%>/{{getvar}} 的静态文本，' +
              '或在世界书里用 entry.constant=true 的形式注入(已自动下沉到 dynamicTail)。',
          );
        }
      }

      const allTexts = [
        ...itemTexts, // 条目在前：setvar 先于后续 getvar 执行（promptItems 已按 order 排序）
        processedPreset.systemPrompt,
        ...processedLore.map((e) => e.content),
        macroProcessedInput,
        processedFormat,
        renderedDynamicFormat, // DS 重组：动态附加段同走 macro batch（保持 setvar/getvar 跨段一致）
      ];
      const macroResults = resolveAllMacrosBatch(allTexts, macroCtx);

      // 写回宏处理后的 promptItems content
      const newItems = sortedItems.map((it) => ({ ...it }));
      macroItemPositions.forEach((pos, k) => { newItems[pos].content = macroResults[k].text; });

      // 自动下沉：把标记了 _sinkToDynamicTail 的 promptItem 从主 messages 剔除,
      // 渲染后内容收集到 sunkPromptContents,稍后注入到 dynamicTail。
      const sunkPromptContents: string[] = [];
      if (autoSinkDynamicPromptItem) {
        const kept: typeof newItems = [];
        for (const it of newItems) {
          if ((it as { _sinkToDynamicTail?: boolean })._sinkToDynamicTail) {
            sunkPromptContents.push(it.content);
          } else {
            kept.push(it);
          }
        }
        processedPreset.promptItems = kept;
      } else {
        processedPreset.promptItems = newItems;
      }

      const base = itemTexts.length;
      processedPreset.systemPrompt = macroResults[base].text;
      for (let i = 0; i < processedLore.length; i++) {
        processedLore[i].content = macroResults[base + 1 + i].text;
      }
      macroProcessedInput = macroResults[base + 1 + processedLore.length].text;
      const resolvedFormat = macroResults[base + 1 + processedLore.length + 1].text;
      const resolvedDynamicFormat = macroResults[base + 1 + processedLore.length + 2].text;

      // Persist macro var mutations back to store
      const mutationStore = useTavernHelperStore.getState();
      for (const [key, val] of Object.entries(macroCtx.macroVars)) {
        if (mutationStore.macroVars[key] !== val) {
          mutationStore.setMacroVar(key, val);
        }
      }

      // Apply regex scripts to user input (placement 1 = USER_INPUT)
      const regexScripts = [
        ...useRegexStore.getState().globalScripts,
        ...useRegexStore.getState().presetScripts,
      ];
      const regexProcessedInput = runAllRegexScripts(
        renderTemplate(macroProcessedInput, tmplOpts),
        1,
        regexScripts,
        { isPrompt: true },
      );

      // Build world book content from matched entries (matchedLore), ordered by insertion strategy.
      // position 0 → before；其余 → after（COC 仅 worldInfoBefore/After 两个注入点）。
      // DS 重组开启时：wbBefore/wbAfter 仅由静态 lore 构成 → 让 system 前缀字节稳定；
      // 动态 lore 走 dynamicTail，由下方 prepend 到合并 user 内容的末段（紧贴用户输入之前）。
      const wiStrategy = settingsNow.worldInfoStrategy ?? 'evenly';
      const loreForWb = dsRestructureOn
        ? processedLore.filter((e) => !(e as { _isDynamic?: boolean })._isDynamic)
        : processedLore;
      const beforeEntries = sortByInsertionStrategy(loreForWb.filter((e) => e.position === 0), wiStrategy);
      const afterEntries = sortByInsertionStrategy(loreForWb.filter((e) => e.position !== 0), wiStrategy);
      const wbBefore = beforeEntries.map((e) => e.content).join('\n');
      const wbAfter = afterEntries.map((e) => e.content).join('\n');

      // 实验性：跨回合静态前缀漂移诊断（借鉴 claude-code-best PROMPT_CACHE_BREAK_DETECTION）。
      // 把"理论上应每回合相等"的静态字段(systemPrompt + wbBefore + processedFormat + wbAfter)
      // 拼成字符串，跨回合对比 → 找出第一处字节差异点 + 启发式定位是哪段污染。
      // 仅 dsRestructureOn && experimentalPrefixDiagnostics 同时开启时生效，写到 console + pushLog。
      if (dsRestructureOn && dsCfg.experimentalPrefixDiagnostics === true) {
        const SEP = '\n--§--\n';
        const segSystem = processedPreset.systemPrompt;
        const segWbBefore = wbBefore;
        const segFormat = resolvedFormat;
        const segWbAfter = wbAfter;
        // segment offsets — 跳过零长度段:它们与下个段差距仅 SEP.length,会让 inferSegment 把缝隙处误判为空段
        const offsets: Record<string, number> = { systemPrompt: 0 };
        let acc = segSystem.length + SEP.length;
        if (segWbBefore.length) { offsets.wbBefore = acc; acc += segWbBefore.length + SEP.length; }
        if (segFormat.length)   { offsets.processedFormat = acc; acc += segFormat.length + SEP.length; }
        if (segWbAfter.length)  { offsets.wbAfter = acc; }
        const staticPrefix = [segSystem, segWbBefore, segFormat, segWbAfter].join(SEP);
        const sessionId = useChatStore.getState().activeId ?? '__no_session__';
        const result = diagnosePrefixDrift(staticPrefix, sessionId, offsets);
        const line = formatDiagnosticLine(result);
        if (dsCfg.debugLog === true) console.log(line);
        if (!result.prefixStable) {
          // 命中漂移：在主日志面板写一条 warn，提醒用户排查
          pushLog('warn', line, 'system');
        }
      }

      // Assemble prompt messages (variables already resolved by unified macro engine)
      // 关键:dsRestructureOn 时,_isDynamic 标记的条目会通过 dynamicTail 再注入一次(line 727+),
      // 这里必须先剔除以避免【双重注入】(legacy fallback 路径会把 lore 整组 push 成 system 消息;
      // 见 prompt-assembler.ts fallback 分支)。
      const loreForAssemble = dsRestructureOn
        ? processedLore.filter((e) => !(e as { _isDynamic?: boolean })._isDynamic)
        : processedLore;
      const messages = assemblePrompt(
        regexProcessedInput,
        [],
        processedPreset,
        loreForAssemble,
        {},
        resolvedFormat,
        { before: wbBefore, after: wbAfter },
      );

      // DS 缓存优化器(B') —— 静态前置/动态尾置：把动态 lore + 动态 baseFormat 段拼成 dynamicTail，
      // prepend 到 messages 中【最后一条 user 消息】的 content 前。这样合并后的字节顺序为：
      //   [静态 system 段(每回合不变)] + [dynamicTail(本回合状态)] + [用户输入] + [dsMarker]
      // 静态前缀才是 DeepSeek 真正可缓存的部分。
      if (dsRestructureOn) {
        const dynamicProcessedLore = processedLore.filter(
          (e) => (e as { _isDynamic?: boolean })._isDynamic,
        );
        const sortedDynamic = sortByInsertionStrategy(dynamicProcessedLore, wiStrategy);
        // sunkPromptContents（从 system 区剥离的含动态宏 promptItem 渲染后内容）放在
        // dynamicFormatParts 最前面——保持与原 system 区相对靠前的注意力位置;
        // 后接项目的 dynamicFormatParts（调查员能力概览/物品/NPC 等）。
        const dynamicTail = buildDynamicTail({
          dynamicLoreContents: sortedDynamic.map((e) => e.content),
          dynamicFormatParts: [
            ...sunkPromptContents,
            ...(resolvedDynamicFormat ? [resolvedDynamicFormat] : []),
          ],
        });
        if (dynamicTail) {
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
              messages[i] = { ...messages[i], content: `${dynamicTail}\n\n${messages[i].content}` };
              break;
            }
          }
        }
      }

      // DeepSeek V4 缓存优化器(A) —— 思维模式 marker 附着到【最后一条 user 消息】末尾。
      // 重组开启后这一步仍发生在重组前，marker 进入"被合并的首条 user"里，等价于"前缀缓存中段插指令"——
      // 但 marker 是用户主动开启的，且对每回合都是同一段文本，所以仍是稳定字节段，不破坏前缀。
      const dsMarker = buildThinkingMarker(settingsNow.dsCache);
      if (dsMarker) {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'user') { messages[i] = { ...messages[i], content: `${messages[i].content}\n\n${dsMarker}` }; break; }
        }
      }

      // Context budget management — trim if over limit
      const settings = useSettingsStore.getState();
      const budget = getModelBudget(settings.apiModel);
      const result = trimToBudget(messages, budget);

      if (result.summary) {
        const formatIdx = result.trimmed.findIndex((m) => m.content === processedFormat);
        if (formatIdx >= 0) {
          result.trimmed.splice(formatIdx, 0, { role: 'system', content: result.summary });
        }
      }

      // DeepSeek V4 缓存优化器(B) —— 消息三区重组。仅对 isDeepSeekSource(modelId, targetSources) 命中时启用。
      // 把 [system×N, user×1, assistant×M, user] 合并为顶部稳定 user(缓存区) + 中间对话区 + 末 user 前置高注意力区。
      // 本项目 history=[]，通常走 isSingleMessage 路径 → 所有 system + 当前 user 合并成一条 user 消息。
      // dsCfg/dsRestructureOn 已在 buildPromptMessages 上半段提前计算（用于 baseFormat / lore 分桶）；此处复用。
      let finalMessages = result.trimmed;
      if (dsRestructureOn) {
        const rsCfg: DsRestructureConfig = {
          enabled: true,
          roleTags: dsCfg.roleTags !== false,
          debugLog: dsCfg.debugLog === true,
          keepTailAssistant: dsCfg.keepTailAssistant !== false,
          customPrefillEnabled: dsCfg.customPrefillEnabled === true,
          customPrefillContent: dsCfg.customPrefillContent ?? '',
          separateWiLights: dsCfg.separateWiLights === true,
        };
        // 绿灯 lore 内容：从 matchedLore 中抽出 constant=false 的渲染后内容（仅当 separateWiLights 开启时）。
        // 抽取自 processedLore 而非原 buckets，因为后者尚未经 EJS/宏渲染。
        // 同 assemblePrompt 路径,这里也要剔除 _isDynamic 标记的条目——它们已经走 dynamicTail 注入一次,
        // 不剔除则 restructureMessages 顶部合并区会再注入一次,与 dynamicTail 形成双重注入。
        const greenContents = rsCfg.separateWiLights
          ? processedLore
              .filter((e) => !e.constant && !(e as { _isDynamic?: boolean })._isDynamic)
              .map((e) => e.content)
          : undefined;
        finalMessages = restructureMessages(result.trimmed, rsCfg, greenContents);
      }

      // Store for Prompt Viewer —— 显示真实发送的(重组后)消息结构，所见即所得。
      usePromptViewerStore.getState().setPrompt(
        finalMessages,
        useSettingsStore.getState().apiModel,
        activePreset.name,
      );

      const finalTokens = estimateTokens(JSON.stringify(finalMessages));
      if (result.trimmedCount > 0) {
        pushLog(
          'warn',
          `上下文裁剪: ${result.trimmedCount}条 → 剩余~${finalTokens} tokens / 上限${budget.maxTokens}`,
        );
      }

      return { messages: finalMessages, tokenCount: finalTokens, preset: activePreset, liteSavedTokens };
    },
    [thHooks],
  );

  // Keep a ref to the builder so external events can trigger mock generation
  buildFnRef.current = (text?: string) => {
    buildPromptMessages(text);
  };

  // ── handleSendFromPreview ──

  const handleSendFromPreview = useCallback(
    async (editedMessages: AssembledMessage[], replace: boolean, resolvedPreset?: ChatPreset) => {
      const settings = useSettingsStore.getState();
      const presetForApi = resolvedPreset || DEFAULT_INPUT_PRESET;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError('');
      useStatusToastStore.getState().showProcessing('正在窥探深渊，等待档案浮现…');
      pushLog(
        'info',
        `发送API请求 — 模型: ${settings.apiModel}, 消息数: ${editedMessages.length}, ~${estimateTokens(JSON.stringify(editedMessages))} tokens`,
      );

      startStream();

      try {
        // ── 发送 + 解析；解析失败时按设置自动重试（要求只输出 JSON）──
        const correctiveMsg = {
          role: 'user' as const,
          content: '【系统纠正】你上一条回复不是合法的 JSON 对象（可能返回了纯叙事或夹带了额外文字），已被丢弃。请严格只输出一个符合格式规范的 JSON 对象，不要包含任何 JSON 之外的文字、解释或 Markdown 代码块标记。',
        };
        const maxRetries = Math.max(0, settings.jsonRetryCount ?? 0);

        // 序章首回合（pages.length<=1，起始装备由 AI 凭职业+情境生成，叙事未必逐一点名）跳过物品叙事校验。
        // 此路径只走整页生成（parseLlmResponse），补写走 parseRewriteResponse，故无需排除补写。
        const skipInventoryNarrativeCheck = useBookStore.getState().pages.length <= 1;

        const genStart = performance.now();
        const { result, attempts: attempt, lastContent, lastUsage } = await sendWithJsonRetry({
          maxRetries,
          logTag: 'API',
          send: (corrective) => sendChatCompletion(
            applyPostProcessing(corrective ? [...editedMessages, correctiveMsg] : editedMessages, settings.promptPostProcessing),
            presetForApi,
            settings.apiBaseUrl,
            settings.apiKey,
            settings.apiModel,
            streamRenderEnabled,
            streamRenderEnabled ? onToken : undefined,
            controller.signal,
          ),
          parse: (content) => parseLlmResponse(content, { skipInventoryNarrativeCheck }),
        });

        if (!result) {
          // 所有尝试均失败 → 不生成书页（各次解析报错已记入调试日志）
          pushLog('error', `[生成失败] 共 ${attempt + 1} 次尝试均未返回合法JSON，已放弃本回合。原因见上方 [parseLlm] 报错。`, 'system');
          // 顶部 processing toast 是 persistent 的——需主动 showError/hide 才会清，否则进度条会一直转。
          useStatusToastStore.getState().showError(`AI 连续 ${attempt + 1} 次未按格式返回，已放弃本回合`);
          setError(`AI 连续 ${attempt + 1} 次未按格式返回，已放弃本回合（输入已保留，可重试）。`);
          return false;
        }

        // ── 解析成功：在最终回复上跑显示regex / TH钩子 / 变量提取 ──
        const response = { content: lastContent };
        const aiOutputRegexScripts = [
          ...useRegexStore.getState().globalScripts,
          ...useRegexStore.getState().presetScripts,
        ];
        const regexProcessedContent = runAllRegexScripts(
          response.content,
          2,
          aiOutputRegexScripts,
          { isMarkdown: true, isPrompt: true },
        );
        const hookProcessedContent = runReceiveHooks(thHooks, regexProcessedContent);

        const mvuSettings = useSettingsStore.getState();
        // Gate the LLM extraction call: the local regex extractors already cover explicit
        // <var>/{{set:}} tags, so an LLM round-trip only adds value when the narrative
        // *implies* a numeric change without an explicit tag. Skip the call otherwise
        // (mvuForceAlways forces it every turn for max extraction fidelity).
        const needLlmExtraction =
          mvuSettings.mvuForceAlways || shouldUseLlmExtraction(hookProcessedContent);
        const useIndependentMvu = !!(mvuSettings.mvuUseIndependentApi && mvuSettings.mvuApiKey && needLlmExtraction);
        let mvuUsage: TokenUsage | undefined;
        let selfCorrectUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;
        // 先【同步】应用模型显式输出的 <UpdateVariable> JSONPatch（本地正则，快）：本回合 HP/SAN/MP/姿态/状态/阶段
        // 由此落地，供下方 newPage.sheetSnapshot 与阶段校验取到最新值。独立 MVU API 的「隐含数值」LLM 提取较慢，
        // 连同失败回灌自纠一起【挪到页面+物品提交之后】再 await（见 settleVariables 及其调用点），
        // 让书页/背包/NPC/地图立即可见、不被 MVU 往返拖在后面。
        const patchReport: MvuPatchReport =
          useVariableStore.getState().processResponse(hookProcessedContent).patchReport;

        // ── MVU 补丁块静默失败嗅探 ──
        // LLM 输出了 <UpdateVariable> 开标签、却一条 op 都没抽出来（applied+failed===0），
        // 多半是回复在末尾补丁块处被 max_tokens 截断（双人成行 COT 思考较长时尤甚），
        // 或补丁块结构畸形。这种情况下变量更新会无声丢失——显式告警让其可见、便于排障。
        if (
          patchReport &&
          patchReport.applied === 0 &&
          patchReport.failed.length === 0 &&
          hasUpdateVariableMarker(hookProcessedContent)
        ) {
          pushLog(
            'warn',
            '[MVU] 检测到 <UpdateVariable> 开标签但未解析出任何变量补丁——疑似回复被截断（max_tokens 不足）或补丁块结构畸形，本回合变量更新可能丢失。',
            'system',
          );
        }

        // ── MVU 变量更新校验失败 → 始终记日志让其可见（零额外 LLM）。实际的失败回灌自纠移入 settleVariables ──
        if (patchReport.failed.length > 0) {
          pushLog(
            'warn',
            `[MVU校验] ${patchReport.failed.length} 项变量更新未通过校验：\n` +
              patchReport.failed.map((f) => `· ${f.path || f.op}: ${f.reason}`).join('\n'),
            'system',
          );
        }

        // 页面+物品提交【之后】才结算的慢变量逻辑：独立 MVU API 隐含变量提取 + 可选失败回灌自纠（默认关闭）。
        // 在可见结果提交后 await（见下方调用点）——await 让出事件循环，React 先渲染新页与背包，再跑 MVU 往返；
        // await 期间 loading 仍为真、选项保持锁定，故变量不会迟到下一回合。
        const settleVariables = async () => {
          if (useIndependentMvu) {
            useStatusToastStore.getState().updateProcessing('正在解析状态变量…');
            try {
              const extracted = await extractVariablesWithLLM(
                hookProcessedContent,
                mvuSettings.mvuApiBaseUrl,
                mvuSettings.mvuApiKey,
                mvuSettings.mvuApiModel,
                mvuSettings.mvuTemperature,
                mvuSettings.mvuRetryCount,
                mvuSettings.mvuMaxTokens,
              );
              mvuUsage = extracted.usage;
              const st = useVariableStore.getState();
              for (const [name, value] of Object.entries(extracted.variables)) {
                st.setVariable(name, value, 'llm');
              }
            } catch (err) {
              pushLog(
                'warn',
                `[MVU] 独立提取失败，已回退本地正则: ${err instanceof Error ? err.message : String(err)}`,
                'system',
              );
            }
          }
          if (patchReport.failed.length > 0 && settings.mvuSelfCorrectEnabled && (settings.mvuSelfCorrectRetries ?? 0) > 0) {
            useStatusToastStore.getState().updateProcessing('正在校正状态变量…');
            // 自纠瘦上下文：不再重发整份主 prompt(editedMessages，最大上下文冗余)，只给本回合叙事 + 当前状态快照。
            const rawStat = useVariableStore.getState().statData;
            const visibleStat: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(rawStat)) {
              if (!k.startsWith('_') && !k.startsWith('$')) visibleStat[k] = v;
            }
            const statSnapshotYaml = Object.keys(visibleStat).length > 0 ? formatStatDataYaml(visibleStat) : '';
            const sc = await runMvuSelfCorrect(
              patchReport.failed,
              settings.mvuSelfCorrectRetries,
              {
                // send 显式走 'mvu' RPM 桶 + 传中止信号 —— RPM 死线在此落实。
                send: async (msgs) => {
                  const r = await sendChatCompletion(
                    applyPostProcessing(msgs, settings.promptPostProcessing),
                    presetForApi,
                    settings.apiBaseUrl,
                    settings.apiKey,
                    settings.apiModel,
                    false,
                    undefined,
                    controller.signal,
                    'mvu',
                  );
                  return { content: r.content, usage: r.usage };
                },
                applyOps: (ops) => useVariableStore.getState().applyCorrectiveOps(ops),
                log: (level, msg) => pushLog(level, msg, 'system'),
                isAborted: () => controller.signal.aborted,
              },
              { narrative: hookProcessedContent, statSnapshotYaml },
            );
            if (sc.usage.total_tokens > 0 || sc.usage.prompt_tokens > 0 || sc.usage.completion_tokens > 0) {
              selfCorrectUsage = sc.usage;
            }
          }

          // ── G3: post-settle 评估器相位 ──
          // MVU drain + corrective 已结束的此刻才跑 evaluator——它们 emit 的 ops 走【独立的】
          // applyCorrectiveOps 通道,不被 MVU 快照体系视为"本回合 LLM 写入"而回滚.
          // A2(SAN-loss→临疯) / A3(成功检定→ticked) 在后续 ticket 通过 registerEvaluator 接入.
          runPostSettleEvaluators({
            sheet: useCharSheetStore.getState().sheet,
            statData: useVariableStore.getState().statData,
            patchReport,
            applyCorrectiveOps: (ops) => useVariableStore.getState().applyCorrectiveOps(ops),
          });
        };

        const newPage = result.page;
        // 正文/选项净化：剥「中文紧贴英文」黏连(如「借书台circulation desk」) + 折叠连续重复标点(「。。」→「。」)，防污染上下文。
        newPage.leftContent = sanitizeNarrative(newPage.leftContent);
        newPage.rightContent = sanitizeNarrative(newPage.rightContent);
        if (newPage.summary) newPage.summary = sanitizeNarrative(newPage.summary);
        if (newPage.rightChoices) {
          newPage.rightChoices = newPage.rightChoices.map((c) => ({
            ...c,
            text: sanitizeNarrative(c.text),
            action: c.action ? sanitizeNarrative(c.action) : c.action,
          }));
        }
        // 把本回合的线索/NPC/地图/暗线更新随页面持久化，供删页时从剩余页面重建派生状态。
        if (result.clues) newPage.clues = result.clues;
        if (result.npcUpdates) newPage.npcUpdates = result.npcUpdates;
        if (result.mapUpdates) newPage.mapUpdates = result.mapUpdates;
        if (result.darkThread) newPage.darkThread = result.darkThread;
        // A2 重设: 本页 SAN check 气泡数组(随页持久化, 删页时一并随页移除, 不污染剩余页面)
        if (result.sanityCheckPrompts) newPage.sanityCheckPrompts = result.sanityCheckPrompts;

        const chatStore = useChatStore.getState();
        chatStore.addMessage('user', lastInputRef.current);
        chatStore.addMessage('assistant', response.content);

        // Parse dice results from the user input (e.g., "[侦查 d100=42/60 成功]")
        const diceFromInput = parseDiceResultsFromInput(lastInputRef.current);
        if (diceFromInput.length > 0) {
          // 标注检定发生时的页码（与实时检定记录的 pageIndex+1 一致），随页面持久化、供读档重建带页码。
          const checkPage = useBookStore.getState().pageIndex + 1;
          newPage.diceResults = diceFromInput.map((r) => ({ ...r, page: r.page ?? checkPage }));
        }

        // Validate generation quality
        const validationErrors: string[] = [];
        if (newPage.leftContent.length < 30) {
          validationErrors.push(`正文内容过短（${newPage.leftContent.length}字），可能生成不完整`);
        }
        // 剧情.阶段 改读 buildFullSubstitutionMap(statData JSON Patch 真值优先,老存档 flat 兜底)
        const currentStage = useVariableStore.getState().buildFullSubstitutionMap()['剧情.阶段'] ?? '调查期';
        const isEpilogue = currentStage === '后日谈';
        const hasPriorDarkThread = useDarkThreadStore.getState().entries.length > 0;
        // 暗线缺失：剧情本应推进暗线（已有历史暗线、非后日谈）却 LLM 未返回 darkThread。
        // 不再弹错误框打断玩家，改为下方页面提交后【定向补生成】（走 mvu RPM 桶、撞限额排队、重试）。
        const darkThreadMissing = hasPriorDarkThread && !isEpilogue && (!result.darkThread || !result.darkThread.development);
        if (validationErrors.length > 0) {
          pushLog('error', `[Validation] 生成异常:\n${validationErrors.join('\n')}`, 'system');
          useErrorModalStore.getState().showError('生成异常', validationErrors.join('\n'));
        }

        // ── 先结算【慢】MVU 变量，再提交/翻页 ──
        // 把独立 API 隐含变量提取 + 失败回灌自纠放到页面提交【之前】await：保证玩家翻到该页时，
        // 右页 HP/SAN/MP/状态栏已是结算后的终值，不会在读到一半时跳变。
        // await 期间 loading 仍为真、选项保持锁定，故变量不会迟到下一回合。
        // 防护（关键）：MVU 结算失败【绝不】吞掉本回合书页——仅告警续行、用本地正则值提交；
        // 唯独玩家中止（abort）才放弃整轮（与「等 MVU 再翻页」一致，取消=放弃本回合）。
        try {
          await settleVariables();
        } catch (settleErr) {
          if (controller.signal.aborted) throw settleErr;
          pushLog('warn', `[MVU] 变量结算失败，已用本地正则值提交本页：${settleErr instanceof Error ? settleErr.message : String(settleErr)}`, 'system');
        }
        if (controller.signal.aborted) return false;

        // 生成统计：耗时含全程（genStart→变量结算完成），token 并入 MVU 提取/自纠用量——一次算对，
        // 右下角与顶部实时计时器同源（修复「右下角耗时只含主生成、对不上实际等待」）。
        const durationMs = Math.round(performance.now() - genStart);
        const promptEst = estimateTokens(JSON.stringify(editedMessages));
        const completionEst = estimateTokens(response.content);
        const realUsage = lastUsage?.total_tokens != null;
        const mainPrompt = realUsage ? (lastUsage!.prompt_tokens ?? 0) : promptEst;
        const mainCompletion = realUsage ? (lastUsage!.completion_tokens ?? 0) : completionEst;
        const mainTotal = realUsage ? lastUsage!.total_tokens! : promptEst + completionEst;
        const promptTok = mainPrompt + (mvuUsage?.prompt_tokens ?? 0) + (selfCorrectUsage?.prompt_tokens ?? 0);
        const completionTok = mainCompletion + (mvuUsage?.completion_tokens ?? 0) + (selfCorrectUsage?.completion_tokens ?? 0);
        const totalTok = mainTotal + (mvuUsage?.total_tokens ?? 0) + (selfCorrectUsage?.total_tokens ?? 0);
        const pageGenStats = {
          totalTokens: totalTok,
          promptTokens: promptTok,
          completionTokens: completionTok,
          durationMs,
          estimated: !realUsage,
          // DeepSeek 上下文缓存命中/未命中(仅主生成)——供缓存面板按页/按天统计；删页随页移除。
          cacheHitTokens: lastUsage?.prompt_cache_hit_tokens,
          cacheMissTokens: lastUsage?.prompt_cache_miss_tokens,
          at: Date.now(),
          // 主 RPM 桶 60s 窗口内已发出的请求数实测值——TokenDisplay 在右下角显示「当时
          // 发了 N 次请求」, 反映系统真实繁忙度（含本页主回合 + 同窗口内子调用累积）。
          rpm: getCurrentRpm('main'),
          // 本回合使用的模型名快照——CacheStatsPanel 按 model tier 走对应费率算 cost，
          // 并把曲线按 flash/pro 分双线展示。
          model: useSettingsStore.getState().apiModel,
          // 子调用历史日志：主回合内部的 MVU 提取 + MVU 自纠各算一条；fire-and-forget 子调用
          // （起始物品/坏结局/关键线索/线索整合/NPC补写/地点元素/地图自检/时间跳跃/战斗探测/
          // 行动补写）由各自调用点完成后用 addPageSubCallStat 追加。
          subCalls: (() => {
            const subs: import('../types').PageSubCallStat[] = [];
            if (mvuUsage) {
              subs.push({
                label: 'MVU 提取',
                model: useIndependentMvu ? mvuSettings.mvuApiModel : mvuSettings.apiModel,
                hit: mvuUsage.prompt_cache_hit_tokens,
                miss: mvuUsage.prompt_cache_miss_tokens,
                promptTokens: mvuUsage.prompt_tokens,
                output: mvuUsage.completion_tokens,
                at: Date.now(),
              });
            }
            if (selfCorrectUsage) {
              subs.push({
                label: 'MVU 自纠',
                model: useIndependentMvu ? mvuSettings.mvuApiModel : mvuSettings.apiModel,
                promptTokens: selfCorrectUsage.prompt_tokens,
                output: selfCorrectUsage.completion_tokens,
                at: Date.now(),
              });
            }
            return subs.length > 0 ? subs : undefined;
          })(),
        };
        pushLog(
          'info',
          `API响应成功 — ${response.content.length}字符, ${realUsage ? '' : '约'}消耗 ${totalTok} tokens（输入 ${promptTok} / 输出 ${completionTok}${mvuUsage ? ' · 含MVU' : ''}）· 耗时 ${(durationMs / 1000).toFixed(1)}s${realUsage ? '' : '（估算）'}${attempt > 0 ? `（重试${attempt}次后成功）` : ''}`,
        );
        newPage.genStats = pageGenStats;
        // 先把本回合 NPC 更新落库，再做快照——否则 npcSnapshot 会漏掉本页的 NPC 变化(登场/离场/昏迷)，
        // 删页快照回溯就会把人物丢掉(教授因战斗页快照缺失而消失的根因)。
        if (result.npcUpdates && result.npcUpdates.length > 0) {
          useNpcStore.getState().applyUpdates(result.npcUpdates);
          pushLog('debug', `[Pipeline] NPC 更新(${result.npcUpdates.length}): ${result.npcUpdates.map((n) => n.name).join(', ')}`, 'system');
        } else {
          pushLog('debug', '[Pipeline] 本回合无 NPC 更新(result.npcUpdates 为空)', 'system');
        }
        // BUG2 Part 2: 检测「叙事里出现 NPC、但 npcUpdates 缺失/为空」→ 用【补写 API】fire-and-forget 重纠。
        // 触发条件：parsed.npcUpdates 缺失或空数组，且 leftContent+rightContent 含称谓/对话标记。
        // 走 'rewrite' RPM 桶——撞上限自动排队 1 分钟（rpm-limiter 实现），不报错；
        // 含会话守卫；穷尽 retries 失败 → 静默放弃（fail-open，绝不阻塞翻页）。
        const investigatorNameForRectify = useCharSheetStore.getState().sheet?.identity?.name?.trim() ?? '';
        const npcMissingDetected = detectNpcMissing(
          `${newPage.leftContent}\n${newPage.rightContent}`,
          !!(result.npcUpdates && result.npcUpdates.length > 0),
          investigatorNameForRectify,
        );
        // 角色卡快照（此刻 statData 已含独立 API 隐含提取 + 自纠后的终值）
        newPage.sheetSnapshot = structuredClone(useCharSheetStore.getState().sheet);
        // NPC 名册快照（已含本页 NPC 更新）——供删页快照式回溯
        newPage.npcSnapshot = structuredClone(useNpcStore.getState().profiles);

        const bookStore = useBookStore.getState();
        // 补写拾取所在页 = 追加新页之前的当前页；其 acquiredItems 用于本回合正文去重。
        const rewriteSourceIdx = bookStore.pageIndex;
        if (replace) {
          bookStore.replacePage(bookStore.pageIndex, newPage);
          pushLog('info', `页面已重新生成 — ${newPage.leftHeader}`);
          pushLog(
            'debug',
            `[页面内容/替换] 左: ${newPage.leftContent}\n右: ${newPage.rightContent}`,
            'system',
          );
        } else {
          bookStore.appendPage(newPage);
          pushLog('info', `新页面已生成 — ${newPage.leftHeader}`);
          pushLog(
            'debug',
            `[页面内容] 左: ${newPage.leftContent}\n右: ${newPage.rightContent}\n选项: ${newPage.rightChoices.map((c: { text: string }) => c.text).join(' | ')}`,
            'system',
          );
          bookStore.autoFlipForward();
          const thOptimize2 = useTavernHelperStore.getState().optimize;
          const thRender = useTavernHelperStore.getState().render;
          if (thOptimize2.optimizeMessageLoad) {
            const limit = thRender.renderDepth > 0 ? thRender.renderDepth : 10;
            bookStore.trimPages(limit);
          }
        }
        chatStore.savePages(useBookStore.getState().pages);

        // 暗线定向补生成：剧情本应推进暗线、但主 JSON 遗漏 darkThread 时（darkThreadMissing），
        // 不弹框打断、改为【fire-and-forget 独立调用】补出本回合暗线。走 'mvu' RPM 桶——撞上限自动排队
        // （rpmAcquire 排队不报错），内部重试若干次；穷尽失败才记日志。全程会话守卫，绝不阻塞翻页。
        if (darkThreadMissing && settings.apiKey?.trim() && settings.apiBaseUrl?.trim() && settings.apiModel?.trim()) {
          const aidDT = useChatStore.getState().activeId;
          const dtPageIdx = replace ? rewriteSourceIdx : useBookStore.getState().pages.length - 1;
          const latest = useDarkThreadStore.getState().entries.slice(-1)[0];
          const badEnding = useDarkThreadStore.getState().badEnding;
          const progressLine = latest ? `当前暗线进度: ${latest.progress}/100（${latest.threatLevel}）` : '当前暗线进度: 0/100（潜伏）';
          const secretLine = badEnding ? `本局注定坏结局（守秘人机密，绝不泄露玩家）: ${badEnding.description}` : '';
          const dtCtx = [`近期叙事:\n${newPage.leftContent}`, progressLine, secretLine].filter(Boolean).join('\n');
          void (async () => {
            try {
              const dt = await generateDarkThread(dtCtx, settings.apiBaseUrl, settings.apiKey, settings.apiModel, controller.signal);
              if (!dt || useChatStore.getState().activeId !== aidDT) return; // 穷尽失败或切档 → 放弃
              // addEntry 入参字段名是 details（映射 development）——与正常路径 :947-952 一致。
              useDarkThreadStore.getState().addEntry({ progress: dt.progress, threatLevel: dt.threatLevel, details: dt.development, foreshadowing: dt.foreshadowing });
              useBookStore.getState().setPageDarkThread(dtPageIdx, { development: dt.development, progress: dt.progress, threatLevel: dt.threatLevel, foreshadowing: dt.foreshadowing });
              useChatStore.getState().savePages(useBookStore.getState().pages);
              if (aidDT) await saveConversation(aidDT);
              pushLog('info', `[暗线] 主生成遗漏，已定向补生成: 进度${dt.progress}/100（${dt.threatLevel}）— ${dt.development}`, 'system');
            } catch (e) {
              if (controller.signal.aborted) return;
              pushLog('warn', `[暗线] 定向补生成失败（已穷尽重试）: ${e instanceof Error ? e.message : String(e)}`, 'api');
            }
          })();
        }

        // BUG2 Part 2: NPC 缺失「补写 API 重纠」——detectNpcMissing 命中且独立补写 API 配置齐全时，
        // fire-and-forget 走 'rewrite' RPM 桶（撞上限自动排队 1 分钟）拉出叙事里被遗漏的 NPC、回灌入名册并写回页面。
        // 与暗线补生成同模式：会话守卫、abort 守卫、失败静默 fail-open。
        if (npcMissingDetected) {
          const useIndepRW = settings.rewriteUseIndependentApi && !!settings.rewriteApiKey?.trim();
          const rwBase = useIndepRW ? settings.rewriteApiBaseUrl : settings.apiBaseUrl;
          const rwKey  = useIndepRW ? settings.rewriteApiKey  : settings.apiKey;
          const rwModel = useIndepRW ? settings.rewriteApiModel : settings.apiModel;
          if (rwBase?.trim() && rwKey?.trim() && rwModel?.trim()) {
            const aidNR = useChatStore.getState().activeId;
            const nrPageIdx = replace ? rewriteSourceIdx : useBookStore.getState().pages.length - 1;
            const narrativeForRectify = `${newPage.leftContent}\n${newPage.rightContent}`;
            pushLog('info', `[NPC缺失] 检测到叙事里有 NPC 但 npcUpdates 缺失/空，已启动补写 API 重纠…`, 'system');
            void (async () => {
              try {
                const rectified = await rectifyMissingNpcs(
                  narrativeForRectify, investigatorNameForRectify,
                  rwBase, rwKey, rwModel, controller.signal,
                );
                if (!rectified || rectified.npcUpdates.length === 0) return;
                if (useChatStore.getState().activeId !== aidNR) return; // 切档放弃
                if (controller.signal.aborted) return;
                useNpcStore.getState().applyUpdates(rectified.npcUpdates);
                // 写回该页 npcUpdates + 刷新 npcSnapshot——保证删页快照回溯不丢补写出来的 NPC。
                const snap = structuredClone(useNpcStore.getState().profiles);
                useBookStore.getState().setPageNpcRectification(nrPageIdx, rectified.npcUpdates, snap);
                useChatStore.getState().savePages(useBookStore.getState().pages);
                if (aidNR) await saveConversation(aidNR);
                pushLog('info', `[NPC缺失] 补写 API 已重纠 ${rectified.npcUpdates.length} 个 NPC：${rectified.npcUpdates.map((n) => n.name).join('、')}`, 'system');
              } catch (e) {
                if (controller.signal.aborted) return;
                pushLog('warn', `[NPC缺失] 补写 API 重纠失败（已穷尽重试）：${e instanceof Error ? e.message : String(e)}`, 'api');
              }
            })();
          }
        }

        // 序章首回合「起始装备」：页面插入后【fire-and-forget】独立 LLM 调用，绝不阻塞翻页（曾同步 await 致卡顿 ~30s）。
        // 背包是「页锚定」派生态：异步拿到物品后须 (a) setPageInventoryChanges 写回该首页（删页重放据此恢复）、
        // (b) applyChanges 入背包（主回合 applyChanges 早已跑完，这里必须自行入库）、(c) 重新持久化。全程 activeId 守卫防串档。
        // 按【捕获的插入 index】定位该页（appendPage 不赋 id，不能用 findIndex(id)）：append 取 pages 末位、replace 取被替换位；
        // setPageInventoryChanges 自带越界守卫，期间该页若被删则静默放弃。skipInventoryNarrativeCheck 即 pages.length<=1 序章首回合标志。
        if (
          skipInventoryNarrativeCheck &&
          (!newPage.inventoryChanges || newPage.inventoryChanges.length === 0) &&
          settings.apiKey?.trim() && settings.apiBaseUrl?.trim() && settings.apiModel?.trim()
        ) {
          const aidSI = useChatStore.getState().activeId;
          const siPageIdx = replace ? rewriteSourceIdx : useBookStore.getState().pages.length - 1;
          const sheet = useCharSheetStore.getState().sheet;
          const prologue = useBookStore.getState().pages[0];
          const opening = [prologue?.leftContent, newPage.leftContent].filter(Boolean).join('\n').slice(0, 1500);
          const ctx = `调查员：${sheet.identity?.name || '无名'}（${sheet.identity?.occupation || '职业不详'}）\n开场情境：\n${opening}`;
          void (async () => {
            try {
              // 走 MVU API（若已配置）/ 主 API（fallback）+ mvu RPM 桶 —— 起始物品是
              // 短 JSON 子调用，无需主回合的 Pro 大模型，走 Flash 更快更便宜。
              const useMvuSI = !!(settings.mvuUseIndependentApi && settings.mvuApiKey?.trim());
              const siBase = (useMvuSI ? settings.mvuApiBaseUrl : settings.apiBaseUrl) ?? '';
              const siKey = (useMvuSI ? settings.mvuApiKey : settings.apiKey) ?? '';
              const siModel = (useMvuSI ? settings.mvuApiModel : settings.apiModel) ?? '';
              const { changes, usage: siUsage } = await generateStartingItems(ctx, siBase, siKey, siModel);
              // 缓存命中历史：起始物品调用统计追加进 page.genStats.subCalls
              if (siUsage && useChatStore.getState().activeId === aidSI) {
                useBookStore.getState().addPageSubCallStat(siPageIdx, {
                  label: '起始物品',
                  model: siModel,
                  hit: siUsage.prompt_cache_hit_tokens,
                  miss: siUsage.prompt_cache_miss_tokens,
                  promptTokens: siUsage.prompt_tokens,
                  output: siUsage.completion_tokens,
                  at: Date.now(),
                });
              }
              if (changes.length === 0 || useChatStore.getState().activeId !== aidSI) return;
              useBookStore.getState().setPageInventoryChanges(siPageIdx, changes);
              useInventoryStore.getState().applyChanges(changes);
              if (useChatStore.getState().activeId === aidSI) useChatStore.getState().savePages(useBookStore.getState().pages);
              if (aidSI && useChatStore.getState().activeId === aidSI) await saveConversation(aidSI);
              pushLog('info', `[起始物品] 已为序章配备 ${changes.length} 件起始随身物品：${changes.map((c) => c.name).join('、')}`, 'system');
            } catch (e) {
              pushLog('warn', `[起始物品] 生成失败（本局无起始装备）：${e instanceof Error ? e.message : String(e)}`, 'api');
            }
          })();
        }

        // 剧情已真正推进（新页已写入并保存）——把本回合在 RightPage 暂存的检定记录落入 history。
        // 此前点选项时只 stash 不记录，故未提交/提交失败的掷骰不会污染检定记录面板。
        useDiceStore.getState().commitPending();

        // 累积 LLM 本页产出的关键词释义入会话级 DB（addKeywords 保留首见去重）——
        // 供 KeywordTooltip 悬停显示，并经 buildKeywordInjection 在后续回合回灌给 LLM。
        // 随后的 saveConversation 会把 keywords 持久化进 Dexie keywords 表。
        if (newPage.keywords) {
          useKeywordStore.getState().addKeywords(newPage.keywords);
        }

        if (newPage.summary && newPage.id) {
          const keys = newPage.keywords
            ? Object.keys(newPage.keywords).join(', ')
            : newPage.leftHeader;
          if (keys.trim()) {
            useLorebookStore.getState().upsertSummaryEntry(
              newPage.id,
              keys,
              `[剧情回顾] ${newPage.summary}`,
              `摘要: ${newPage.leftHeader}`,
            );
            pushLog('debug', `[Pipeline] 已创建摘要条目: "${newPage.leftHeader}" — 关键词: ${keys}`, 'system');
          }
        }

        // Store dark thread in DB
        if (result.darkThread && result.darkThread.development) {
          useDarkThreadStore.getState().addEntry({
            progress: result.darkThread.progress,
            threatLevel: result.darkThread.threatLevel,
            details: result.darkThread.development,
            foreshadowing: result.darkThread.foreshadowing,
          });
          pushLog('debug', `[Pipeline] 暗线更新: 进度${result.darkThread.progress}/100 (${result.darkThread.threatLevel}) — ${result.darkThread.development}${result.darkThread.foreshadowing ? ` ｜伏笔: ${result.darkThread.foreshadowing}` : ''}`, 'system');
        }

        // 坏结局（守秘人机密，暗线终点）：本局尚无 → 回合后用【独立 LLM 调用】据情境生成，
        // 与主回合输出彻底解耦，绝不挤占主 JSON（修复其曾导致 clues/npc/map 被截断的回归）。
        // fire-and-forget；含会话守卫；后日谈不生成；需 API 配置齐全。
        if ((!useDarkThreadStore.getState().badEnding || useKeyClueStore.getState().pillars.length === 0) && !isEpilogue
            && settings.apiKey?.trim() && settings.apiBaseUrl?.trim() && settings.apiModel?.trim()) {
          const aidBE = useChatStore.getState().activeId;
          const sheet = useCharSheetStore.getState().sheet;
          const recent = useBookStore.getState().pages.slice(-3).map((p) => p.leftContent).filter(Boolean).join('\n');
          const ctx = `调查员：${sheet.identity?.name || '无名'}（${sheet.identity?.occupation || '职业不详'}）\n近期情节：\n${recent || newPage.leftContent}`;
          void (async () => {
            try {
              // 一次产出：坏结局（灾厄终点）+ 3 真相支柱（破局所需，守秘人机密）。
              // 走 MVU API（若已配置）/ 主 API（fallback）—— 短 JSON 子调用走 Flash 更快。
              const useMvuBE = !!(settings.mvuUseIndependentApi && settings.mvuApiKey?.trim());
              const beBase = (useMvuBE ? settings.mvuApiBaseUrl : settings.apiBaseUrl) ?? '';
              const beKey = (useMvuBE ? settings.mvuApiKey : settings.apiKey) ?? '';
              const beModel = (useMvuBE ? settings.mvuApiModel : settings.apiModel) ?? '';
              const { description, pillars, usage: beUsage } = await generateBadEnding(ctx, beBase, beKey, beModel);
              if (useChatStore.getState().activeId !== aidBE) return; // 期间切换会话，放弃避免污染别档
              // 缓存命中历史：坏结局调用统计追加进 page.genStats.subCalls
              if (beUsage) {
                const bePageIdx = replace ? rewriteSourceIdx : useBookStore.getState().pages.length - 1;
                useBookStore.getState().addPageSubCallStat(bePageIdx, {
                  label: '坏结局',
                  model: beModel,
                  hit: beUsage.prompt_cache_hit_tokens,
                  miss: beUsage.prompt_cache_miss_tokens,
                  promptTokens: beUsage.prompt_tokens,
                  output: beUsage.completion_tokens,
                  at: Date.now(),
                });
              }
              let changed = false;
              if (description && !useDarkThreadStore.getState().badEnding) {
                useDarkThreadStore.getState().setBadEnding({ description, createdAt: Date.now() });
                changed = true;
                pushLog('info', `[坏结局] 本局坏结局已生成（暗线终点，守秘人机密）: ${description}`, 'system');
              }
              if (pillars.length > 0 && useKeyClueStore.getState().pillars.length === 0) {
                useKeyClueStore.getState().setPillars(pillars.map((p) => ({ id: crypto.randomUUID(), title: p.title, secret: p.secret, uncovered: false })));
                changed = true;
                pushLog('info', `[关键线索] 本局 3 真相支柱已生成（守秘人机密）: ${pillars.map((p) => p.title).join(' / ')}`, 'system');
              }
              if (changed && aidBE) await saveConversation(aidBE);
            } catch (e) {
              pushLog('warn', `[坏结局/支柱] 生成失败：${e instanceof Error ? e.message : String(e)}`, 'api');
            }
          })();
        }

        // 剧情锚点（守秘人机密，剧情蓝图）：本局尚无锚点、且坏结局+支柱已就绪 → 用【独立 LLM 调用】据情境生成。
        // 与主输出彻底解耦（绝不挤占主 JSON）；fire-and-forget + 会话守卫；后日谈不生成；需 API 齐全。
        // 首回合坏结局/支柱也在异步生成、可能尚未落地，则本回合跳过、下回合补生成。
        {
          const dtNow = useDarkThreadStore.getState().badEnding;
          const kcNow = useKeyClueStore.getState().pillars;
          if (useAnchorStore.getState().anchors.nodes.length === 0 && dtNow && kcNow.length > 0 && !isEpilogue
              && settings.apiKey?.trim() && settings.apiBaseUrl?.trim() && settings.apiModel?.trim()) {
            const aidAN = useChatStore.getState().activeId;
            const prologue = useBookStore.getState().pages[0];
            const opening = [prologue?.leftContent, newPage.leftContent].filter(Boolean).join('\n').slice(0, 1500);
            void (async () => {
              try {
                const anchors = await generateAnchors(
                  opening,
                  dtNow.description,
                  kcNow.map((p) => ({ title: p.title, secret: p.secret })),
                  settings.apiBaseUrl, settings.apiKey, settings.apiModel,
                  controller.signal,
                );
                if (!anchors || useChatStore.getState().activeId !== aidAN) return; // 失败或切档 → 放弃
                if (useAnchorStore.getState().anchors.nodes.length > 0) return; // 期间已生成 → 不覆盖
                useAnchorStore.getState().setAnchors(anchors);
                if (aidAN) await saveConversation(aidAN);
                pushLog('info', `[剧情锚点] 本局剧情蓝图已生成（守秘人机密）：${anchors.nodes.map((n) => n.title).join(' → ')}`, 'system');
              } catch (e) {
                if (controller.signal.aborted) return;
                pushLog('warn', `[剧情锚点] 生成失败：${e instanceof Error ? e.message : String(e)}`, 'api');
              }
            })();
          }
        }

        // 战斗检测建场：未在战斗中 && 叙事含暴力线索 && 本回合非战斗结算页 && 非后日谈 → 独立调用(优先MVU API)判定是否进战。
        // 进战 → useCombatStore.start(encounter)，右页由 Storybook 条件渲染成战斗面板。fire-and-forget + 会话守卫。
        if (
          !useCombatStore.getState().encounter &&
          shouldDetectCombat(newPage.leftContent) &&
          !isEpilogue &&
          !lastInputRef.current.includes('即时战斗结束') // 防战斗结算页再次触发进战
        ) {
          const useMvuApiCB = !!(settings.mvuUseIndependentApi && settings.mvuApiKey?.trim());
          const cdBase = (useMvuApiCB ? settings.mvuApiBaseUrl : settings.apiBaseUrl) ?? '';
          const cdKey = (useMvuApiCB ? settings.mvuApiKey : settings.apiKey) ?? '';
          const cdModel = (useMvuApiCB ? settings.mvuApiModel : settings.apiModel) ?? '';
          if (cdBase.trim() && cdKey.trim() && cdModel.trim()) {
            const aidCB = useChatStore.getState().activeId;
            const sheetCB = useCharSheetStore.getState().sheet;
            const invCB = useInventoryStore.getState().items;
            const narrativeCB = newPage.leftContent;
            void (async () => {
              try {
                const enc = await detectAndBuildEncounter(narrativeCB, sheetCB, invCB, cdBase, cdKey, cdModel, controller.signal);
                if (!enc || useChatStore.getState().activeId !== aidCB || useCombatStore.getState().encounter) return;
                const anchorPages = useBookStore.getState().pages;
                enc.anchorPageId = anchorPages[anchorPages.length - 1]?.id; // 锚定到战斗所属页
                useCombatStore.getState().start(enc);
                if (aidCB) await saveConversation(aidCB);
                pushLog('info', `[战斗] 进入即时战斗：${enc.combatants.filter((c) => c.faction === 'enemy').map((c) => c.name).join('、')}`, 'system');
              } catch (e) {
                if (controller.signal.aborted) return;
                pushLog('warn', `[战斗] 检测失败：${e instanceof Error ? e.message : String(e)}`, 'api');
              }
            })();
          }
        }

        // 独立线索库
        if (result.clues && result.clues.length > 0) {
          useClueStore.getState().addClues(result.clues.map((c) => ({ ...c, foundAtPage: newPage.leftPage })));
          pushLog('debug', `[Pipeline] 线索更新(${result.clues.length}): ${result.clues.map((c) => c.name).join(', ')}`, 'system');
        } else {
          pushLog('debug', '[Pipeline] 本回合无新线索(result.clues 为空)', 'system');
        }

        // 关键线索评估：本回合有新线索 && 尚有未揭示真相支柱 && 未进入拯救模式 && API → 解耦判定哪些线索揭示了哪个支柱。
        // 命中即标记支柱已揭示 + 给线索打关键标记；揭满 3 个 → markPillarUncovered 内部置 saveWorldMode。fire-and-forget + 会话守卫。
        {
          const kc = useKeyClueStore.getState();
          const unsolved = kc.pillars.filter((p) => !p.uncovered);
          if (result.clues && result.clues.length > 0 && unsolved.length > 0 && !kc.saveWorldMode
              && settings.apiKey?.trim() && settings.apiBaseUrl?.trim() && settings.apiModel?.trim()) {
            const aidKC = useChatStore.getState().activeId;
            const newClues = result.clues.map((c) => ({ name: c.name, summary: c.summary ?? '', discoveryNarrative: c.discoveryNarrative }));
            const pillarsForEval = unsolved.map((p) => ({ id: p.id, title: p.title, secret: p.secret }));
            void (async () => {
              try {
                // 走 MVU API（若已配置）—— 关键线索评估也是短 JSON 子调用，走 Flash 更快。
                const useMvuKC = !!(settings.mvuUseIndependentApi && settings.mvuApiKey?.trim());
                const kcBase = (useMvuKC ? settings.mvuApiBaseUrl : settings.apiBaseUrl) ?? '';
                const kcKey = (useMvuKC ? settings.mvuApiKey : settings.apiKey) ?? '';
                const kcModel = (useMvuKC ? settings.mvuApiModel : settings.apiModel) ?? '';
                const { matches, usage: kcUsage } = await evaluateKeyClues(pillarsForEval, newClues, kcBase, kcKey, kcModel);
                // 缓存命中历史：关键线索调用统计追加进 page.genStats.subCalls
                if (kcUsage) {
                  const kcPageIdx = replace ? rewriteSourceIdx : useBookStore.getState().pages.length - 1;
                  useBookStore.getState().addPageSubCallStat(kcPageIdx, {
                    label: '关键线索',
                    model: kcModel,
                    hit: kcUsage.prompt_cache_hit_tokens,
                    miss: kcUsage.prompt_cache_miss_tokens,
                    promptTokens: kcUsage.prompt_tokens,
                    output: kcUsage.completion_tokens,
                    at: Date.now(),
                  });
                }
                if (matches.length === 0 || useChatStore.getState().activeId !== aidKC) return;
                const wasSaveWorld = useKeyClueStore.getState().saveWorldMode;
                for (const m of matches) {
                  useKeyClueStore.getState().markPillarUncovered(m.pillarId, m.clueName);
                  useClueStore.getState().markClueKey(m.clueName, m.pillarId);
                }
                const kcAfter = useKeyClueStore.getState();
                pushLog('info', `[关键线索] 本回合揭示 ${matches.length} 个真相支柱（已揭示 ${kcAfter.uncoveredCount()}/3）`, 'system');
                if (!wasSaveWorld && kcAfter.saveWorldMode) {
                  pushLog('info', '[拯救世界] 已集齐 3 条关键线索——开启拯救世界模式，与暗线灾厄赛跑！', 'system');
                }
                if (aidKC) await saveConversation(aidKC);
              } catch (e) {
                pushLog('warn', `[关键线索] 评估失败：${e instanceof Error ? e.message : String(e)}`, 'api');
              }
            })();
          }
        }

        // 活跃线索超上限 → 推进过程中自动归并成 1-3 条总结（后台进行，不阻塞本回合渲染；
        // 原线索归档、可在「历史线索」回溯）。仅在 API 配置齐全时尝试。
        const activeClues = useClueStore.getState().clues.filter((c) => c.status !== 'archived');
        if (activeClues.length > CLUE_ACTIVE_CAP && settings.apiKey?.trim() && settings.apiBaseUrl?.trim() && settings.apiModel?.trim()) {
          const aidAtTrigger = useChatStore.getState().activeId;
          void (async () => {
            try {
              const { clues: summaries } = await integrateClues(
                activeClues.map((c) => ({ name: c.name, summary: c.summary, discoveryNarrative: c.discoveryNarrative, relatedTo: c.relatedTo, tags: c.tags })),
                settings.apiBaseUrl, settings.apiKey, settings.apiModel,
              );
              if (summaries.length === 0) return;
              // 守卫：归并期间若切换了会话，放弃——避免把本会话的归并写进已切到的别的存档（污染）。
              if (useChatStore.getState().activeId !== aidAtTrigger) {
                pushLog('warn', '[线索整合] 自动归并取消：归并期间已切换会话', 'api');
                return;
              }
              useClueStore.getState().consolidateClues(summaries, activeClues.map((c) => c.id));
              if (aidAtTrigger) await saveConversation(aidAtTrigger);
              useStatusToastStore.getState().markDone(`线索已自动归并为 ${summaries.length} 条总结（原线索可在线索页历史回溯）`);
              pushLog('info', `[线索整合] 线索超过 ${CLUE_ACTIVE_CAP} 条，已自动归并 ${activeClues.length} → ${summaries.length} 条（原线索归档可回溯）`, 'api');
            } catch (e) {
              pushLog('warn', `[线索整合] 自动归并失败：${e instanceof Error ? e.message : String(e)}`, 'api');
            }
          })();
        }

        // NPC 档案更新已在快照前(见上)落库；此处不再重复 applyUpdates。

        // 地图更新（新地点/连线/当前位置）
        if (result.mapUpdates) {
          useMapStore.getState().applyUpdates(result.mapUpdates);
          pushLog('debug', `[Pipeline] 地图更新: 当前=${result.mapUpdates.current ?? '-'} 新地点=${result.mapUpdates.newLocations?.length ?? 0} 新连线=${result.mapUpdates.newEdges?.length ?? 0}`, 'system');
        } else {
          pushLog('debug', '[Pipeline] 本回合无地图更新(result.mapUpdates 为空)', 'system');
        }
        // 兜底:无论 LLM 是否给 mapUpdates,都把本回合场景地点登记为地图当前地点——
        // 否则开局/原地不动时地图全空、无当前地点节点(地图只靠 LLM mapUpdates 时常缺位)。
        // 仅当 mapUpdates 未自带 current 时补,避免覆盖 LLM 给的当前地点。
        // BUG3:不再用 applyUpdates({ newLocations: [{ name: sceneLoc }] }) 兜底——
        // 那会建一个空描述节点,后续即便 LLM 给了真实描述也只能写入「首次为空」分支。
        // 改为只 setCurrentByName:若同名节点已存在(LLM 在某轮给过真实描述),指向之;
        // 否则不强行建空节点,等待 LLM 真正命名+描述时由 applyUpdates 的 newLocations 路径建。
        const sceneLoc = result.page.sceneInfo?.location?.trim();
        if (sceneLoc && sceneLoc !== '未知' && !result.mapUpdates?.current) {
          useMapStore.getState().setCurrentByName(sceneLoc);
        }

        // 地点元素抽取：对【当前地点】用独立 LLM 调用从本回合叙事抽取新环境元素，与主输出解耦、不阻塞翻页。
        // 优先走 MVU 独立 API（mvuUseIndependentApi && mvuApiKey），否则回退主 API。fire-and-forget + 会话守卫；
        // 页锚定写回该页 locationElements（删页重放可恢复）+ applyExtracted 入 store + 持久化。
        // 本段处于主生成路径（行动补写走独立的 rewriteAction，不经此），故无需 formatOverride 守卫。
        {
          const ms = useMapStore.getState();
          const curLoc = ms.locations.find((l) => l.id === ms.currentLocationId);
          const useMvuApi = !!(settings.mvuUseIndependentApi && settings.mvuApiKey?.trim());
          const leBase = (useMvuApi ? settings.mvuApiBaseUrl : settings.apiBaseUrl) ?? '';
          const leKey = (useMvuApi ? settings.mvuApiKey : settings.apiKey) ?? '';
          const leModel = (useMvuApi ? settings.mvuApiModel : settings.apiModel) ?? '';
          if (curLoc?.name && leBase.trim() && leKey.trim() && leModel.trim()) {
            const aidLE = useChatStore.getState().activeId;
            const ledPageIdx = replace ? rewriteSourceIdx : useBookStore.getState().pages.length - 1;
            const locName = curLoc.name;
            const existingNames = useLocationElementStore.getState().getByLocation(locName).map((e) => e.name);
            const narrative = `${newPage.leftContent}\n${newPage.rightContent}`;
            void (async () => {
              try {
                const { elements } = await extractLocationElements(locName, existingNames, narrative, leBase, leKey, leModel);
                if (elements.length === 0 || useChatStore.getState().activeId !== aidLE) return;
                useLocationElementStore.getState().applyExtracted(elements);
                // 页锚定写回：直接覆写本页 locationElements（与 setPageInventoryChanges 一致；
                // 每页每回合仅一次抽取，regenerate 时应替换而非堆叠）。
                useBookStore.getState().setPageLocationElements(ledPageIdx, elements);
                useChatStore.getState().savePages(useBookStore.getState().pages);
                if (aidLE && useChatStore.getState().activeId === aidLE) await saveConversation(aidLE);
                pushLog('info', `[地点元素] 「${locName}」抽取 ${elements.length} 个新元素：${elements.map((e) => e.name).join('、')}`, 'system');

                // 超上限归纳收敛：该地点元素 > LOCATION_ELEMENT_CAP 时，后台独立 LLM 把碎元素归并成 ≤5（store 级替换 + 持久化）。
                // 不写回页面——consolidation 跨全地点，与「每页 historical locationElements」语义不同；删页重放走原始元素、下回合再重整。
                const curList = useLocationElementStore.getState().getByLocation(locName);
                if (curList.length > LOCATION_ELEMENT_CAP) {
                  const { elements: mergedEls } = await integrateLocationElements(
                    locName,
                    curList.map((e) => ({ name: e.name, category: e.category, description: e.description })),
                    leBase, leKey, leModel,
                  );
                  if (mergedEls.length > 0 && useChatStore.getState().activeId === aidLE) {
                    useLocationElementStore.getState().consolidateLocation(locName, mergedEls);
                    if (aidLE && useChatStore.getState().activeId === aidLE) await saveConversation(aidLE);
                    pushLog('info', `[地点元素整合] 「${locName}」元素超过 ${LOCATION_ELEMENT_CAP} 个，已归纳收敛为 ${mergedEls.length} 个`, 'system');
                  }
                }
              } catch (e) {
                pushLog('warn', `[地点元素] 抽取失败：${e instanceof Error ? e.message : String(e)}`, 'api');
              }
            })();
          }
        }

        // 地图自检（拓扑校对）：仅在本回合地图有新增（新地点或新连线）时触发——用独立 LLM 校对当前
        // 地图拓扑，纠正三类错误：①「描述说通往B却没连B」的缺失边；②端点错挂的边；③同地异名的重复节点。
        // 后台 fire-and-forget + 会话守卫，不阻塞翻页；API 选取与地点元素抽取一致（优先 MVU 独立 API，否则主 API）。
        {
          const mapChangedThisTurn = !!(result.mapUpdates && (
            (result.mapUpdates.newLocations?.length ?? 0) > 0 ||
            (result.mapUpdates.newEdges?.length ?? 0) > 0
          ));
          if (mapChangedThisTurn && useMapStore.getState().locations.length >= 2) {
            const useMvuApi = !!(settings.mvuUseIndependentApi && settings.mvuApiKey?.trim());
            const rcBase = (useMvuApi ? settings.mvuApiBaseUrl : settings.apiBaseUrl) ?? '';
            const rcKey = (useMvuApi ? settings.mvuApiKey : settings.apiKey) ?? '';
            const rcModel = (useMvuApi ? settings.mvuApiModel : settings.apiModel) ?? '';
            if (rcBase.trim() && rcKey.trim() && rcModel.trim()) {
              const aidRC = useChatStore.getState().activeId;
              const ms0 = useMapStore.getState();
              void (async () => {
                try {
                  const rc = await reconcileMap(ms0.locations, ms0.edges, rcBase, rcKey, rcModel);
                  if (useChatStore.getState().activeId !== aidRC) return; // 校对期间切了会话，放弃
                  const map = useMapStore.getState();
                  // 1) 先并重复地点（让后续增删边走 canonical 名），元素跟着改挂到 canonical。
                  for (const m of rc.merges) {
                    map.mergeLocations(m.canonical, m.aliases);
                    for (const a of m.aliases) useLocationElementStore.getState().renameLocation(a, m.canonical);
                  }
                  // 2) 删错挂边。
                  if (rc.removeEdges.length > 0) map.removeEdgesByName(rc.removeEdges);
                  // 3) 补缺失边（复用 applyUpdates 的按名建边 + 去重；名字已校验为现有地点，不会凭空建点）。
                  if (rc.addEdges.length > 0) {
                    map.applyUpdates({ newEdges: rc.addEdges.map((e) => ({ from: e.from, to: e.to, type: e.type, description: e.description })) });
                  }
                  const touched = rc.merges.length + rc.removeEdges.length + rc.addEdges.length;
                  if (touched > 0) {
                    const parts: string[] = [];
                    if (rc.merges.length) parts.push(`并 ${rc.merges.length} 组重复地点`);
                    if (rc.removeEdges.length) parts.push(`删 ${rc.removeEdges.length} 条错挂边`);
                    if (rc.addEdges.length) parts.push(`补 ${rc.addEdges.length} 条缺失边`);
                    pushLog('info', `[地图自检] 已纠正：${parts.join('，')}`, 'system');
                    if (aidRC && useChatStore.getState().activeId === aidRC) await saveConversation(aidRC);
                  }
                } catch (e) {
                  pushLog('warn', `[地图自检] 失败：${e instanceof Error ? e.message : String(e)}`, 'api');
                }
              })();
            }
          }
        }

        if (newPage.inventoryChanges && newPage.inventoryChanges.length > 0) {
          // 防重复：若上一页（补写所在页）已通过拾取选项直接入库了某物品，
          // 则丢弃本回合正文对同名物品的 add，避免 applyChanges 按名合并致数量翻倍。
          const rewritePage = bookStore.pages[rewriteSourceIdx];
          const acquired = rewritePage?.acquiredItems ?? [];
          const dedupedChanges = filterAlreadyAcquiredAdds(newPage.inventoryChanges, acquired);
          if (dedupedChanges.length > 0) {
            useInventoryStore.getState().applyChanges(dedupedChanges);
            pushLog('info', `物品更新: ${dedupedChanges.length}项变化`, 'system');
          }
          if (dedupedChanges.length < newPage.inventoryChanges.length) {
            pushLog('debug', `[物品] 已过滤 ${newPage.inventoryChanges.length - dedupedChanges.length} 项补写已入库的重复物品`, 'system');
          }
        }

        // Persist full game state for this conversation into Dexie v2 relational
        // tables (pages + character/inventory/darkThread/keywords/variables/macroVars).
        // Reads live in-memory stores, so no snapshot object needed here.
        chatStore.savePages(useBookStore.getState().pages);
        if (chatStore.activeId) void saveConversation(chatStore.activeId);

        // 变量结算完成：此刻才报「档案已浮现」关闭顶部 processing 提示并【停止实时计时器】（无论是否走了 MVU）。
        // 注：MVU 慢变量结算已在页面提交【之前】完成（见上方 await settleVariables()），此处仅收尾报完成。
        useStatusToastStore.getState().markDone('档案已浮现');

        // 生成成功结束：发出「叮」提醒（即便玩家已切到后台标签页也能听见——Web Audio 不受后台节流影响）。
        // 受全局 soundEnabled 门控；仅主生成成功路径触发，中止/报错走 false 分支不会误响。
        if (useSettingsStore.getState().soundEnabled) {
          try { sfxDing(); } catch { /* audio 不可用时静默 */ }
        }
        return true;
      } catch (err) {
        // 用户主动取消/重新生成/卸载触发的中止不是失败，静默返回。
        // 用 controller.signal.aborted 而非 err.name==='AbortError'：非流式路径的中止
        // 在 api-router 已被重包装成普通 Error，仅流式路径才原样冒泡 AbortError。
        if (controller.signal.aborted) {
          return false;
        }
        const message = err instanceof Error ? err.message : 'AI请求失败';
        pushLog('error', `API请求失败: ${message}`, 'api');
        useStatusToastStore.getState().showError(`窥探失败：${message}`);
        setError(message);
        return false;
      } finally {
        endStream();
        setLoading(false);
      }
    },
    [endStream, onToken, startStream, streamRenderEnabled, thHooks],
  );

  // ── submit ──

  const loadingRef = useRef(false);

  const submit = useCallback(
    async (text: string): Promise<string> => {
      const trimmed = text.trim();
      if (!trimmed || loadingRef.current) return trimmed;
      // 防御性兜底：无活跃会话时绝不发起 LLM 调用——避免删活跃会话后残留态被注入(跨会话混档防线)。
      if (!useChatStore.getState().activeId) return trimmed;

      // Tick sticky/cooldown counters and increment message count
      messageCountRef.current++;
      for (const [k, v] of stickyStateRef.current) {
        if (v <= 1) stickyStateRef.current.delete(k);
        else stickyStateRef.current.set(k, v - 1);
      }
      for (const [k, v] of cooldownStateRef.current) {
        if (v <= 1) cooldownStateRef.current.delete(k);
        else cooldownStateRef.current.set(k, v - 1);
      }
      loadingRef.current = true;
      // 同时设 React state，让 InputBar.pipeline.loading 立即变 true → 推进按钮 disabled
      // —— 之前只设 loadingRef（防并发用的非响应式 ref），React state 完全靠下游 handleSendFromPreview
      // 的 setLoading 兜底，若下游异步路径有任何延迟/中断会让按钮在 167s 主回合期间一直可点。
      setLoading(true);
      useChoiceLockStore.getState().lock(); // 提交开始即锁灰选项，防止生成中连点重掷/二次推进

      try {
        pushLog('debug', `[提交] 原始输入: "${trimmed}"`, 'system');

        let processedInput = trimmed;
        if (trimmed.startsWith('/')) {
          processedInput = await processSlashCommands(trimmed);
          pushLog('debug', `[提交] 处理后: "${processedInput}"`, 'system');
          if (!processedInput.trim() || processedInput.startsWith('[')) {
            return processedInput;
          }
        }

        lastInputRef.current = trimmed || lastInputRef.current;
        currentInputRef.current = processedInput;

        const settings = useSettingsStore.getState();
        if (!settings.apiKey) {
          setError('请先在设置中配置API');
          return processedInput;
        }

        const result = buildPromptMessages(processedInput);
        if (!result) return processedInput;

        pushLog('info', `提示词已组装 — ~${result.tokenCount} tokens`);
        const ok = await handleSendFromPreview(result.messages, false, result.preset);
        return ok ? '' : processedInput;
      } finally {
        loadingRef.current = false;
        setLoading(false); // 兜底解锁,无论 handleSendFromPreview 是否走到了它自己的 setLoading(false)
        useChoiceLockStore.getState().unlock(); // 解锁选项（本次提交已结束：成功/失败/中止）
      }
    },
    [buildPromptMessages, handleSendFromPreview],
  );

  // ── regenerate ──

  const regenerate = useCallback(async () => {
    if (loadingRef.current) return;
    const lastInput = lastInputRef.current;
    if (!lastInput) {
      setError('没有可重新生成的内容');
      return;
    }

    loadingRef.current = true;
    try {
      pushLog('info', `[重新生成] 使用上次输入: "${lastInput.slice(0, 50)}..."`);

      const settings = useSettingsStore.getState();
      if (!settings.apiKey) {
        setError('请先在设置中配置API');
        return;
      }

      currentInputRef.current = lastInput;
      const result = buildPromptMessages(lastInput);
      if (!result) {
        pushLog('error', '[重新生成] 提示词组装失败');
        return;
      }

      pushLog(
        'info',
        `[重新生成] 提示词已组装 — ~${result.tokenCount} tokens, ${result.messages.length} 条消息`,
      );
      await handleSendFromPreview(result.messages, true, result.preset);
    } finally {
      loadingRef.current = false;
    }
  }, [buildPromptMessages, handleSendFromPreview]);

  // ── rewriteAction ──

  const rewriteAction = useCallback(async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError('');
    useStatusToastStore.getState().showProcessing('正在推演可能的行动…');
    // 新请求开始时中止在途 rewrite，并为本次补写建立可取消的 controller（与主生成 abortRef 同模式，桶仍为 'rewrite'）。
    rewriteAbortRef.current?.abort();
    const controller = new AbortController();
    rewriteAbortRef.current = controller;
    try {
      const settings = useSettingsStore.getState();
      const useIndep = settings.rewriteUseIndependentApi && !!settings.rewriteApiKey;
      const baseUrl = useIndep ? settings.rewriteApiBaseUrl : settings.apiBaseUrl;
      const apiKey = useIndep ? settings.rewriteApiKey : settings.apiKey;
      const model = useIndep ? settings.rewriteApiModel : settings.apiModel;
      if (!apiKey) {
        useStatusToastStore.getState().showError('请先在设置中配置API');
        setError('请先在设置中配置API');
        return;
      }

      // 行动补写·战斗发起：玩家明确发起攻击/搏斗 → 据当前场景建场进入即时战斗面板，跳过候选选项生成；
      // 脱战后由 InputBar 订阅 status='resolving' 走主管线翻页叙述。仅当未在战斗中且检测出可战目标才进战，否则回落正常补写。
      if (shouldDetectCombat(trimmed) && !useCombatStore.getState().encounter) {
        const useMvuApiCB = !!(settings.mvuUseIndependentApi && settings.mvuApiKey?.trim());
        const cdBase = (useMvuApiCB ? settings.mvuApiBaseUrl : settings.apiBaseUrl) ?? '';
        const cdKey = (useMvuApiCB ? settings.mvuApiKey : settings.apiKey) ?? '';
        const cdModel = (useMvuApiCB ? settings.mvuApiModel : settings.apiModel) ?? '';
        if (cdBase.trim() && cdKey.trim() && cdModel.trim()) {
          useStatusToastStore.getState().updateProcessing('正在进入战斗…');
          const recent = useBookStore.getState().pages.slice(-2).map((p) => p.leftContent).filter(Boolean).join('\n');
          const ctx = `${recent}\n玩家主动发起：${trimmed}`;
          const enc = await detectAndBuildEncounter(ctx, useCharSheetStore.getState().sheet, useInventoryStore.getState().items, cdBase, cdKey, cdModel, controller.signal);
          if (enc && !useCombatStore.getState().encounter) {
            enc.log = [...enc.log, { kind: 'narrative', text: trimmed }];
            const anchorPages = useBookStore.getState().pages;
            enc.anchorPageId = anchorPages[anchorPages.length - 1]?.id; // 锚定到战斗所属页
            enc.opener = trimmed; // 玩家发起的动作并入脱战输入
            useCombatStore.getState().start(enc);
            const aidCB = useChatStore.getState().activeId;
            if (aidCB) await saveConversation(aidCB);
            pushLog('info', `[战斗] 玩家发起即时战斗：${enc.combatants.filter((c) => c.faction === 'enemy').map((c) => c.name).join('、')}`, 'system');
            useStatusToastStore.getState().markDone('战斗开始');
            return; // 进战，跳过补写；脱战后翻页叙述
          }
          if (controller.signal.aborted) return;
          useStatusToastStore.getState().updateProcessing('正在推演可能的行动…'); // 无可战目标 → 回落补写
        }
      }

      const bookStore = useBookStore.getState();
      const idx = bookStore.pageIndex;
      const hasPrev = !!bookStore.pages[idx]?.rewrite;
      const directive = hasPrev
        ? `${REWRITE_INSTRUCTION}\n\n（玩家对上次补写不满意，请给出与上次明显不同的 4 个方案。）`
        : REWRITE_INSTRUCTION;

      pushLog('info', `[行动补写] ${hasPrev ? '重新续写' : '生成'}: "${trimmed.slice(0, 40)}"`);

      // 把玩家原话显式标注为「必须忠实执行的指定动作」，避免 AI 把裸输入当普通对话而发散成替代方案。
      // 仅作用于送给 AI 的提示；block.sourceInput 仍用干净的 trimmed（前端展示/回填不受影响）。
      const rewriteInput = `【玩家坚持要执行的动作】${trimmed}\n（请据此生成 4 个都用于执行该动作的候选选项，第一个最忠实地照做。）`;

      const built = buildPromptMessages(rewriteInput, directive, {
        lite: settings.rewriteLite,
        liteIncludeMatchedLore: settings.rewriteLiteIncludeMatchedLore,
      });
      if (!built) {
        setError('行动补写提示词组装失败');
        return;
      }
      // Record lite-mode token savings for the Settings display (runtime only, not persisted).
      if (settings.rewriteLite) {
        usePromptViewerStore.getState().setLastRewriteSaving(built.liteSavedTokens);
        pushLog('info', `[行动补写] 轻量模式节省 ~${built.liteSavedTokens} tokens（跳过摘要/暗线/注入${settings.rewriteLiteIncludeMatchedLore ? '' : '/匹配世界书'}）`);
      }

      // ── 发送 + 解析；解析失败按设置重试，要求只输出 JSON ──
      const maxRetries = Math.max(0, settings.jsonRetryCount ?? 0);
      const correctiveMsg = {
        role: 'user' as const,
        content: '【系统纠正】你上一条回复不是合法的 JSON 对象（可能返回了纯叙事或夹带额外文字），已被丢弃。请严格只输出一个符合行动补写格式的 JSON 对象：{ "text": "...", "choices": [...] }，不要包含任何 JSON 之外的文字、解释或 Markdown 代码块标记。',
      };

      const { result: block, attempts: attempt, lastContent: rewriteContent, lastUsage: rewriteUsage } = await sendWithJsonRetry({
        maxRetries,
        logTag: '行动补写',
        send: (corrective) => sendChatCompletion(
          applyPostProcessing(corrective ? [...built.messages, correctiveMsg] : built.messages, settings.promptPostProcessing),
          built.preset,
          baseUrl,
          apiKey,
          model,
          false,
          undefined,
          controller.signal,
          'rewrite',
        ),
        parse: (content) => parseRewriteResponse(content),
      });

      if (!block) {
        // 重试用尽仍非合法 JSON → 不生成补写，提示失败
        pushLog('error', `[行动补写] 共 ${attempt + 1} 次尝试均未返回合法JSON，已放弃。`, 'system');
        useStatusToastStore.getState().showError('补写失败：未能拟出可行的行动');
        setError(`行动补写生成失败：AI 连续 ${attempt + 1} 次未按格式返回（可重试）。`);
        return;
      }
      block.sourceInput = trimmed;
      useBookStore.getState().setPageRewrite(idx, block);
      // 把补写这次的 token 用量追加进该页 genStats（中途增加 → 右下角数字翻滚）。
      {
        const real = rewriteUsage?.total_tokens != null;
        useBookStore.getState().addPageGenStats(idx, real
          ? {
              totalTokens: rewriteUsage!.total_tokens!,
              promptTokens: rewriteUsage!.prompt_tokens,
              completionTokens: rewriteUsage!.completion_tokens,
              estimated: false,
            }
          : (() => {
              const p = estimateTokens(JSON.stringify(built.messages));
              const c = estimateTokens(rewriteContent);
              return { totalTokens: p + c, promptTokens: p, completionTokens: c, estimated: true };
            })());
      }
      useChatStore.getState().savePages(useBookStore.getState().pages);
      pushLog('info', `[行动补写] 已生成 ${block.choices.length} 个候选选项${attempt > 0 ? `（重试${attempt}次后成功）` : ''}`);
      useStatusToastStore.getState().markDone(`已拟出 ${block.choices.length} 种可能`);
    } catch (e) {
      // 用户主动取消（新 rewrite 或卸载触发的 abort）不是失败，静默返回。
      // 与主生成同策略：用 controller.signal.aborted 而非 err.name==='AbortError'，
      // 因为非流式路径的中止在 api-router 已被重包装成普通 Error。
      if (controller.signal.aborted) {
        return;
      }
      useStatusToastStore.getState().showError(`补写失败：${e instanceof Error ? e.message : String(e)}`);
      setError(`行动补写失败: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [buildPromptMessages]);

  // ── Token counter ──

  const openTokenCounter = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      const contextText = buildContextFromPages();
      const allBooks = useLorebookStore.getState().books;
      const tcChat = useChatStore.getState();
      const tcSessionBookIds = tcChat.sessions.find((s) => s.id === tcChat.activeId)?.lorebookIds ?? [];
      const tcForce = useTavernHelperStore.getState().optimize.forceWorldbookSettings;
      let matchedLore: LoreEntry[] = [];
      for (const { book } of resolveActiveBooks(allBooks, tcSessionBookIds, tcForce)) {
        for (const entry of Object.values(book.entries)) {
          if (entry.disabled) continue;
          matchedLore.push(entry);
        }
      }
      const tcSettings = useSettingsStore.getState();
      const tcCharVars = buildCharacterVariables();
      matchedLore = matchLoreEntries(contextText + '\n' + trimmed, matchedLore, {
        caseSensitive: tcSettings.globalCaseSensitive ?? false,
        matchWholeWord: tcSettings.globalMatchWholeWord ?? false,
        messageCount: messageCountRef.current,
        stickyState: stickyStateRef.current,
        cooldownState: cooldownStateRef.current,
        maxRecursionSteps: tcSettings.maxRecursionSteps ?? 0,
        includeNames: tcSettings.includeNames ?? true,
        tokenBudget: tcSettings.wiBudget ?? 0,
        charName: tcCharVars['charName'] ?? '',
        generationType: 'normal',
        charTags: [],
        matchSources: {
          personaDescription: tcCharVars.personaDescription || '',
          characterDescription: tcCharVars.description || '',
          characterPersonality: tcCharVars.personality || '',
          characterDepthPrompt: '',
          scenario: tcCharVars.scenario || '',
          creatorNotes: '',
        },
      });

      setTokenContext({
        systemPrompt: DEFAULT_INPUT_PRESET.systemPrompt,
        loreEntryContents: matchedLore.map((e) => e.content),
        formatInstruction: FORMAT_INSTRUCTION,
        chatHistoryMessages: [],
        userMessage: trimmed || '(空)',
      });
      setShowTokenCounter(true);
    },
    [],
  );

  const closeTokenCounter = useCallback(() => {
    setShowTokenCounter(false);
  }, []);

  // ── Prompt viewer ──

  const openPromptViewer = useCallback(
    (currentInput: string) => {
      currentInputRef.current = currentInput;
      setShowPromptViewer(true);
      // Trigger prompt build via mock-generate event
      // The event handler below calls buildFnRef.current with the stored input
      setTimeout(() => {
        buildFnRef.current?.(currentInput.trim() || undefined);
      }, 50);
    },
    [],
  );

  const closePromptViewer = useCallback(() => {
    setShowPromptViewer(false);
  }, []);

  // ── Wand menu actions ──

  const toggleDiceHistory = useCallback(() => {
    const panelStore = usePanelStore.getState();
    if (panelStore.openPanel === 'diceHistory') {
      panelStore.closeAll();
    } else {
      panelStore.open('diceHistory');
    }
  }, []);

  const openVariablePanel = useCallback(() => {
    usePanelStore.getState().open('variable');
  }, []);

  const toggleDebugLog = useCallback(() => {
    document.dispatchEvent(new CustomEvent('toggle-debug-log'));
  }, []);

  // ── Effects ──

  // Abort in-flight request on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); rewriteAbortRef.current?.abort(); };
  }, []);

  // Listen for mock generation request (from Prompt Viewer refresh)
  useEffect(() => {
    const handler = () => {
      buildFnRef.current?.(currentInputRef.current.trim() || undefined);
    };
    document.addEventListener('trigger-mock-generate', handler);
    return () => document.removeEventListener('trigger-mock-generate', handler);
  }, []);

  // ── Clear error helper ──

  const clearError = useCallback(() => {
    setError('');
  }, []);

  // ── Return ──
  // returnToMenu is accepted as parameter for future slash command use (e.g. "返回主菜单")
  // Currently unused but available for the component to pass to slash command registration if needed.
  void returnToMenu;

  return {
    // State
    loading,
    error,
    clearError,
    streamingText,
    isStreaming,

    // Token counter
    showTokenCounter,
    tokenContext,
    openTokenCounter,
    closeTokenCounter,

    // Prompt viewer
    showPromptViewer,
    openPromptViewer,
    closePromptViewer,

    // Wand menu actions
    toggleDiceHistory,
    openVariablePanel,
    toggleDebugLog,

    // Pipeline
    submit,
    regenerate,
    rewriteAction,

    // Slash command autocomplete
    allCommands,
  };
}

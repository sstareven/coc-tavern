import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useBookStore } from '../stores/useBookStore';
import { usePanelStore } from '../stores/usePanelStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useLorebookStore, AUTO_SUMMARY_BOOK_ID } from '../stores/useLorebookStore';
import { useDarkThreadStore } from '../stores/useDarkThreadStore';
import { useChatStore } from '../stores/useChatStore';
import { saveConversation } from '../stores/sessionLifecycle';
import { usePromptViewerStore } from '../stores/usePromptViewerStore';
import { useTavernHelperStore } from '../stores/useTavernHelperStore';
import { useVariableStore } from '../stores/useVariableStore';
import { useRegexStore } from '../stores/useRegexStore';
import { useInventoryStore } from '../stores/useInventoryStore';
import { useCharSheetStore } from '../stores/useCharSheetStore';
import { useErrorModalStore } from '../stores/useErrorModalStore';
import { useStreamingRenderer } from './useStreamingRenderer';

import { assemblePrompt, matchLoreEntries } from '../sillytavern/prompt-assembler';
import { resolveActiveBooks, sortByInsertionStrategy, type WorldInfoSource } from '../sillytavern/worldinfo-scope';
import { sendChatCompletion } from '../sillytavern/api-router';
import { extractVariablesWithLLM, shouldUseLlmExtraction } from '../sillytavern/mvu-extractor';
import { selectLoreForRewrite, droppedLoreForRewrite } from '../sillytavern/rewrite-lite';
import { filterAlreadyAcquiredAdds } from '../sillytavern/item-acquisition';
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
import { trimToBudget, getModelBudget } from '../sillytavern/context-manager';
import { estimateTokens } from '../sillytavern/token-counter';
import { pushLog } from '../stores/useLogStore';
import { useStatusToastStore } from '../stores/useStatusToastStore';
import { DEFAULT_INPUT_PRESET, DEFAULT_PRESETS, ensureFormatInstructionMarker } from '../constants/presets';
import { FORMAT_INSTRUCTION, PROLOGUE_STARTING_ITEMS_INSTRUCTION } from '../sillytavern/format-instruction';
import { parseLlmResponse, parseRewriteResponse } from '../sillytavern/llm-response-parser';
import { REWRITE_INSTRUCTION } from '../sillytavern/rewrite-instruction';
import { applyPostProcessing } from '../sillytavern/post-processor';
import { buildCharacterVariables } from '../sillytavern/character-variables';
import { buildContextFromPages } from '../sillytavern/context-builder';
import { kvGet } from '../db/kv';

import type { ChatPreset, LoreEntry } from '../types';
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
  send: (corrective: boolean) => Promise<{ content: string }>;
  parse: (content: string) => T | null;
  logTag: string;
}): Promise<{ result: T | null; attempts: number; lastContent: string }> {
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
  return { result, attempts: attempt, lastContent: response.content };
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
  const messageCountRef = useRef(0);
  const stickyStateRef = useRef(new Map<string, number>());
  const cooldownStateRef = useRef(new Map<string, number>());

  const { streamingText, isStreaming, onToken, startStream, endStream, enabled: streamRenderEnabled } = useStreamingRenderer();
  const allCommands = useMemo(() => getCommands(), []);

  // TH script hooks — refresh when global or preset scripts change
  const thGlobalScripts = useTavernHelperStore((s) => s.globalScripts);
  const thPresetScripts = useTavernHelperStore((s) => s.presetScripts);
  const thHooks = useMemo<ThScriptHooks>(
    () => loadThScripts(thGlobalScripts, thPresetScripts),
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
      type ScopedEntry = LoreEntry & { _source?: WorldInfoSource };
      let otherEntries: ScopedEntry[] = [];
      let summaryEntries: ScopedEntry[] = [];
      const generateInjects: ScopedEntry[] = [];
      const constantEntries: ScopedEntry[] = [];
      for (const { bookId, book, source } of scopedBooks) {
        for (const rawEntry of Object.values(book.entries)) {
          if (rawEntry.disabled) continue;
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
      const darkCtx = useDarkThreadStore.getState().buildContextInjection();
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
        generateInjects: generateInjectBucket,
        inverted: invertedBucket,
      };
      const loreOpts = { lite: liteMode, liteIncludeMatchedLore: opts?.liteIncludeMatchedLore };
      const matchedLore = selectLoreForRewrite(loreBuckets, loreOpts);
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
      }));
      // 序章首回合（尚无生成页，pages.length<=1）：追加起始装备指令，让 AI 按职业+情境生成起始物品。
      // 行动补写走 formatOverride，故 !formatOverride 可自然排除补写场景。
      let baseFormat = formatOverride ?? FORMAT_INSTRUCTION;
      if (!formatOverride && useBookStore.getState().pages.length <= 1) {
        baseFormat += '\n\n' + PROLOGUE_STARTING_ITEMS_INSTRUCTION;
      }
      const processedFormat = renderTemplate(baseFormat, tmplOpts);

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

      const allTexts = [
        processedPreset.systemPrompt,
        ...processedLore.map((e) => e.content),
        macroProcessedInput,
        processedFormat,
      ];
      const macroResults = resolveAllMacrosBatch(allTexts, macroCtx);

      processedPreset.systemPrompt = macroResults[0].text;
      for (let i = 0; i < processedLore.length; i++) {
        processedLore[i].content = macroResults[i + 1].text;
      }
      macroProcessedInput = macroResults[processedLore.length + 1].text;
      const resolvedFormat = macroResults[processedLore.length + 2].text;

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
      const wiStrategy = settingsNow.worldInfoStrategy ?? 'evenly';
      const beforeEntries = sortByInsertionStrategy(processedLore.filter((e) => e.position === 0), wiStrategy);
      const afterEntries = sortByInsertionStrategy(processedLore.filter((e) => e.position !== 0), wiStrategy);
      const wbBefore = beforeEntries.map((e) => e.content).join('\n');
      const wbAfter = afterEntries.map((e) => e.content).join('\n');

      // Assemble prompt messages (variables already resolved by unified macro engine)
      const messages = assemblePrompt(
        regexProcessedInput,
        [],
        processedPreset,
        processedLore,
        {},
        resolvedFormat,
        { before: wbBefore, after: wbAfter },
      );
      // Store for Prompt Viewer
      usePromptViewerStore.getState().setPrompt(
        messages,
        useSettingsStore.getState().apiModel,
        activePreset.name,
      );

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

      const finalTokens = estimateTokens(JSON.stringify(result.trimmed));
      if (result.trimmedCount > 0) {
        pushLog(
          'warn',
          `上下文裁剪: ${result.trimmedCount}条 → 剩余~${finalTokens} tokens / 上限${budget.maxTokens}`,
        );
      }

      return { messages: result.trimmed, tokenCount: finalTokens, preset: activePreset, liteSavedTokens };
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

        const { result, attempts: attempt, lastContent } = await sendWithJsonRetry({
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
        if (mvuSettings.mvuUseIndependentApi && mvuSettings.mvuApiKey && needLlmExtraction) {
          useStatusToastStore.getState().showProcessing('正在解析状态变量…');
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
            const st = useVariableStore.getState();
            st.processResponse(hookProcessedContent);
            for (const [name, value] of Object.entries(extracted.variables)) {
              st.setVariable(name, value, 'llm');
            }
          } catch (err) {
            pushLog(
              'warn',
              `[MVU] 独立提取失败，已回退本地正则: ${err instanceof Error ? err.message : String(err)}`,
              'system',
            );
            useVariableStore.getState().processResponse(hookProcessedContent);
          }
        } else {
          useVariableStore.getState().processResponse(hookProcessedContent);
        }

        pushLog(
          'info',
          `API响应成功 — ${response.content.length}字符, 总消耗~${estimateTokens(JSON.stringify(editedMessages)) + estimateTokens(regexProcessedContent)} tokens${attempt > 0 ? `（重试${attempt}次后成功）` : ''}`,
        );
        useStatusToastStore.getState().markDone('档案已浮现');
        const newPage = result.page;

        const chatStore = useChatStore.getState();
        chatStore.addMessage('user', lastInputRef.current);
        chatStore.addMessage('assistant', response.content);

        // Parse dice results from the user input (e.g., "[侦查 d100=42/60 成功]")
        const diceFromInput = parseDiceResultsFromInput(lastInputRef.current);
        if (diceFromInput.length > 0) {
          newPage.diceResults = diceFromInput;
        }

        // Validate generation quality
        const validationErrors: string[] = [];
        if (newPage.leftContent.length < 30) {
          validationErrors.push(`正文内容过短（${newPage.leftContent.length}字），可能生成不完整`);
        }
        const currentStage = useVariableStore.getState().variables['剧情.阶段']?.value;
        const isEpilogue = currentStage === '后日谈';
        const hasPriorDarkThread = useDarkThreadStore.getState().entries.length > 0;
        if (hasPriorDarkThread && !isEpilogue && (!result.darkThread || !result.darkThread.development)) {
          validationErrors.push('暗线剧情未生成 — LLM未返回darkThread字段');
        }
        if (validationErrors.length > 0) {
          pushLog('error', `[Validation] 生成异常:\n${validationErrors.join('\n')}`, 'system');
          useErrorModalStore.getState().showError('生成异常', validationErrors.join('\n'));
        }

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
          pushLog('debug', `[Pipeline] 暗线更新: 进度${result.darkThread.progress}, 威胁等级=${result.darkThread.threatLevel}`, 'system');
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

      const bookStore = useBookStore.getState();
      const idx = bookStore.pageIndex;
      const hasPrev = !!bookStore.pages[idx]?.rewrite;
      const directive = hasPrev
        ? `${REWRITE_INSTRUCTION}\n\n（玩家对上次补写不满意，请给出与上次明显不同的 4 个方案。）`
        : REWRITE_INSTRUCTION;

      pushLog('info', `[行动补写] ${hasPrev ? '重新续写' : '生成'}: "${trimmed.slice(0, 40)}"`);

      const built = buildPromptMessages(trimmed, directive, {
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

      const { result: block, attempts: attempt } = await sendWithJsonRetry({
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
          undefined,
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
      useChatStore.getState().savePages(useBookStore.getState().pages);
      pushLog('info', `[行动补写] 已生成 ${block.choices.length} 个候选选项${attempt > 0 ? `（重试${attempt}次后成功）` : ''}`);
      useStatusToastStore.getState().markDone(`已拟出 ${block.choices.length} 种可能`);
    } catch (e) {
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
    return () => { abortRef.current?.abort(); };
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

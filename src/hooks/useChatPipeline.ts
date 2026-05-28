import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useBookStore } from '../stores/useBookStore';
import { usePanelStore } from '../stores/usePanelStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useLorebookStore } from '../stores/useLorebookStore';
import { useChatStore } from '../stores/useChatStore';
import { usePromptViewerStore } from '../stores/usePromptViewerStore';
import { useTavernHelperStore } from '../stores/useTavernHelperStore';
import { useVariableStore } from '../stores/useVariableStore';
import { useRegexStore } from '../stores/useRegexStore';
import { useStreamingRenderer } from './useStreamingRenderer';

import { assemblePrompt, matchLoreEntries } from '../sillytavern/prompt-assembler';
import { sendChatCompletion } from '../sillytavern/api-router';
import { extractVariablesWithLLM } from '../sillytavern/mvu-extractor';
import { processSlashCommands, getCommands } from '../sillytavern/slash-commands';
import { renderTemplate } from '../sillytavern/ejs-template';
import { processMacros } from '../sillytavern/macro-engine';
import { resolveTavernHelperMacrosDeep } from '../sillytavern/tavern-helper-macros';
import { runAllRegexScripts } from '../sillytavern/regex-engine';
import {
  loadThScripts,
  runSendHooks,
  runReceiveHooks,
  type ThScriptHooks,
} from '../sillytavern/th-script-engine';
import { trimToBudget, getModelBudget } from '../sillytavern/context-manager';
import { estimateTokens } from '../sillytavern/token-counter';
import { pushLog } from '../stores/useLogStore';
import { DEFAULT_INPUT_PRESET } from '../constants/presets';
import { FORMAT_INSTRUCTION } from '../sillytavern/format-instruction';
import { parseLlmResponse } from '../sillytavern/llm-response-parser';
import { applyPostProcessing } from '../sillytavern/post-processor';
import { buildCharacterVariables } from '../sillytavern/character-variables';
import { buildContextFromPages } from '../sillytavern/context-builder';

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
    (overrideInput?: string): { messages: AssembledMessage[]; tokenCount: number } | null => {
      const trimmed = (overrideInput ?? '').trim();
      const effectiveInput = trimmed || '(提示词查看器预览)';

      // Process ST-style macros ({{setvar}}, {{getvar}}, {{incvar}}, {{decvar}})
      const pt = useTavernHelperStore.getState().promptTemplate;
      const templateEnabled = pt.enabled && pt.generateEnabled;
      let macroProcessedInput = templateEnabled ? processMacros(effectiveInput) : effectiveInput;
      // Filter chat: strip template syntax before generation
      if (pt.enabled && pt.filterChatMessage) {
        macroProcessedInput = macroProcessedInput
          .replace(/\{\{(?:setvar|getvar|incvar|decvar)::[^}]*\}\}/g, '')
          .trim();
      }

      // Run TH script onSend hooks (pre-send pipeline)
      macroProcessedInput = runSendHooks(thHooks, macroProcessedInput);

      // Build context from recent pages
      const contextText = buildContextFromPages();

      // Match lorebook entries against context + user input (skip disabled books unless forced)
      const allBooks = useLorebookStore.getState().books;
      const thOptimize = useTavernHelperStore.getState().optimize;
      let matchedLore: LoreEntry[] = [];
      const generateInjects: LoreEntry[] = [];
      for (const book of Object.values(allBooks)) {
        if (!thOptimize.forceWorldbookSettings && book.enabled === false) continue;
        for (const entry of Object.values(book.entries)) {
          const keys = entry.keys.toLowerCase();
          const isGenerate = keys.includes('generate:before') || keys.includes('generate:after');
          const isInject = entry.keys.includes('@INJECT');
          if (pt.generateLoaderEnabled && isGenerate) {
            generateInjects.push(entry);
          } else if (pt.injectLoaderEnabled && isInject) {
            generateInjects.push(entry);
          } else {
            matchedLore.push(entry);
          }
        }
      }
      matchedLore = matchLoreEntries(contextText + '\n' + macroProcessedInput, matchedLore);
      // Add GENERATE/INJECT entries regardless of keyword match (they're always injected)
      if (pt.generateLoaderEnabled || pt.injectLoaderEnabled) {
        matchedLore.push(...generateInjects);
      }
      // Invert compatibility: disabled entries still get processed if invertEnabled
      if (pt.invertEnabled) {
        for (const book2 of Object.values(allBooks)) {
          if (book2.enabled === false) continue;
          for (const e of Object.values(book2.entries)) {
            if (e.disabled) matchedLore.push(e);
          }
        }
      }
      // Debug logging
      if (pt.debugEnabled) {
        pushLog(
          'debug',
          `[PT] 世界书条目: ${matchedLore.length}条匹配 + ${generateInjects.length}条注入`,
          'system',
        );
      }

      // Build full variable substitution map (character + game variables)
      const charVars = buildCharacterVariables();
      const gameVars = useVariableStore.getState().buildFullSubstitutionMap();
      const variables = { ...gameVars, ...charVars };

      // Load active preset (try chat session, then localStorage, fall back to default)
      const activePresetId =
        useChatStore
          .getState()
          .sessions.find((s) => s.id === useChatStore.getState().activeId)?.presetId ||
        localStorage.getItem('coc_last_preset');
      let activePreset: ChatPreset = DEFAULT_INPUT_PRESET;
      if (activePresetId && activePresetId !== 'p1') {
        try {
          const raw = localStorage.getItem('coc_presets_v1');
          if (raw) {
            const saved = JSON.parse(raw);
            if (saved[activePresetId]) {
              activePreset = { ...DEFAULT_INPUT_PRESET, ...saved[activePresetId] };
            }
          }
        } catch {
          /* use default */
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
        systemPrompt: renderTemplate(
          activePreset.systemPrompt || DEFAULT_INPUT_PRESET.systemPrompt,
          tmplOpts,
        ),
      };
      const processedLore = matchedLore.map((e) => ({
        ...e,
        content: renderTemplate(e.content, tmplOpts),
      }));
      const processedFormat = renderTemplate(FORMAT_INSTRUCTION, tmplOpts);

      // Resolve Tavern Helper macros ({{get_<scope>_variable::name}} etc.)
      if (useTavernHelperStore.getState().enabled) {
        const presetVars = activePreset.tavernHelperVars;
        processedPreset.systemPrompt = resolveTavernHelperMacrosDeep(
          processedPreset.systemPrompt,
          3,
          presetVars,
        );
        for (const e of processedLore) {
          e.content = resolveTavernHelperMacrosDeep(e.content, 3, presetVars);
        }
        macroProcessedInput = resolveTavernHelperMacrosDeep(macroProcessedInput, 3, presetVars);
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

      // Build world book content strings (for before/after markers)
      const enabledBooks = Object.values(useLorebookStore.getState().books).filter(
        (b) => b.enabled !== false,
      );
      const wbEntries = enabledBooks.flatMap((b) => Object.values(b.entries));
      const wbBefore = wbEntries
        .filter((e) => e.position === 0)
        .map((e) => renderTemplate(e.content, tmplOpts))
        .join('\n');
      const wbAfter = wbEntries
        .filter((e) => e.position !== 0)
        .map((e) => renderTemplate(e.content, { ...tmplOpts, onlyWorldinfo: true }))
        .join('\n');

      // Assemble prompt messages
      const messages = assemblePrompt(
        regexProcessedInput,
        [],
        processedPreset,
        processedLore,
        variables,
        processedFormat,
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

      return { messages: result.trimmed, tokenCount: finalTokens };
    },
    [thHooks],
  );

  // Keep a ref to the builder so external events can trigger mock generation
  buildFnRef.current = (text?: string) => {
    buildPromptMessages(text);
  };

  // ── handleSendFromPreview ──

  const handleSendFromPreview = useCallback(
    async (editedMessages: AssembledMessage[], replace: boolean) => {
      const settings = useSettingsStore.getState();

      setLoading(true);
      setError('');
      pushLog(
        'info',
        `发送API请求 — 模型: ${settings.apiModel}, 消息数: ${editedMessages.length}, ~${estimateTokens(JSON.stringify(editedMessages))} tokens`,
      );

      // Start streaming preview if enabled
      startStream();

      try {
        const response = await sendChatCompletion(
          applyPostProcessing(editedMessages, settings.promptPostProcessing),
          DEFAULT_INPUT_PRESET,
          settings.apiBaseUrl,
          settings.apiKey,
          settings.apiModel,
          streamRenderEnabled, // stream when rendering enabled for token callbacks
          streamRenderEnabled ? onToken : undefined,
        );

        pushLog(
          'debug',
          `[API] 收到响应 — ${response.content.length}字 ===\n${response.content}`,
          'api',
        );

        // Apply regex scripts to AI output (placement 2 = AI_OUTPUT)
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

        // Run TH script onReceive hooks (post-receive pipeline)
        const hookProcessedContent = runReceiveHooks(thHooks, regexProcessedContent);

        // Extract variables from LLM response (run on hook-processed content)
        const mvuSettings = useSettingsStore.getState();
        if (mvuSettings.mvuUseIndependentApi && mvuSettings.mvuApiKey) {
          try {
            const result = await extractVariablesWithLLM(
              hookProcessedContent,
              mvuSettings.mvuApiBaseUrl,
              mvuSettings.mvuApiKey,
              mvuSettings.mvuApiModel,
              mvuSettings.mvuTemperature,
              mvuSettings.mvuRetryCount,
            );
            const st = useVariableStore.getState();
            await import('../sillytavern/variables');
            st.processResponse(hookProcessedContent);
            for (const [name, value] of Object.entries(result.variables)) {
              st.setVariable(name, value, 'llm');
            }
          } catch {
            useVariableStore.getState().processResponse(hookProcessedContent);
          }
        } else {
          useVariableStore.getState().processResponse(hookProcessedContent);
        }

        // Parse JSON from raw response
        pushLog(
          'info',
          `API响应成功 — ${response.content.length}字符, 总消耗~${estimateTokens(JSON.stringify(editedMessages)) + estimateTokens(regexProcessedContent)} tokens`,
        );
        const newPage = parseLlmResponse(response.content, lastInputRef.current);
        if (!newPage) {
          throw new Error('无法解析AI回复');
        }

        const bookStore = useBookStore.getState();
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
          // Optimize: trim old pages if enabled
          const thOptimize = useTavernHelperStore.getState().optimize;
          const thRender = useTavernHelperStore.getState().render;
          if (thOptimize.optimizeMessageLoad) {
            const limit = thRender.renderDepth > 0 ? thRender.renderDepth : 10;
            bookStore.trimPages(limit);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'AI请求失败';
        pushLog('error', `API请求失败: ${message}`, 'api');
        setError(message);
      } finally {
        endStream();
        setLoading(false);
      }
    },
    [endStream, onToken, startStream, streamRenderEnabled, thHooks],
  );

  // ── submit ──

  const submit = useCallback(
    async (text: string): Promise<string> => {
      const trimmed = text.trim();
      if (!trimmed || loading) return trimmed;

      pushLog('debug', `[提交] 原始输入: "${trimmed}"`, 'system');

      // Process slash commands first
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
      await handleSendFromPreview(result.messages, false);
      // Success — signal component to clear input
      return '';
    },
    [buildPromptMessages, handleSendFromPreview, loading],
  );

  // ── regenerate ──

  const regenerate = useCallback(async () => {
    if (loading) return;
    const lastInput = lastInputRef.current;
    if (!lastInput) {
      setError('没有可重新生成的内容');
      return;
    }

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
    await handleSendFromPreview(result.messages, true);
  }, [buildPromptMessages, handleSendFromPreview, loading]);

  // ── Token counter ──

  const openTokenCounter = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      const contextText = buildContextFromPages();
      const allBooks = useLorebookStore.getState().books;
      let matchedLore: LoreEntry[] = [];
      for (const book of Object.values(allBooks)) {
        if (book.enabled === false) continue;
        for (const entry of Object.values(book.entries)) {
          matchedLore.push(entry);
        }
      }
      matchedLore = matchLoreEntries(contextText + '\n' + trimmed, matchedLore);

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

    // Slash command autocomplete
    allCommands,
  };
}

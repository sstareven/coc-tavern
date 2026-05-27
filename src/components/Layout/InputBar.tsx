import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBookStore } from '../../stores/useBookStore';
import { usePanelStore } from '../../stores/usePanelStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useLorebookStore } from '../../stores/useLorebookStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { useChatStore } from '../../stores/useChatStore';
import { usePromptViewerStore } from '../../stores/usePromptViewerStore';
import { useTavernHelperStore } from '../../stores/useTavernHelperStore';
import { assemblePrompt, matchLoreEntries } from '../../sillytavern/prompt-assembler';
import { sendChatCompletion } from '../../sillytavern/api-router';
import { PromptViewer } from '../Settings/PromptViewer';
import { TokenCounter } from '../Shared/TokenCounter';
import { StreamingPreview, useStreamingRenderer } from '../Shared/StreamingPreview';
import { useVariableStore } from '../../stores/useVariableStore';
import { extractVariablesWithLLM } from '../../sillytavern/mvu-extractor';
import { processSlashCommands, getCommands } from '../../sillytavern/slash-commands';
import { renderTemplate } from '../../sillytavern/ejs-template';
import { processMacros } from '../../sillytavern/macro-engine';
import { resolveTavernHelperMacrosDeep } from '../../sillytavern/tavern-helper-macros';
import { runAllRegexScripts } from '../../sillytavern/regex-engine';
import { loadThScripts, runSendHooks, runReceiveHooks, type ThScriptHooks } from '../../sillytavern/th-script-engine';

import { useRegexStore } from '../../stores/useRegexStore';
import { trimToBudget, getModelBudget } from '../../sillytavern/context-manager';
import { estimateTokens } from '../../sillytavern/token-counter';
import { pushLog } from '../../stores/useLogStore';
import type { BookPage, ChatPreset, LoreEntry, SceneInfo } from '../../types';
import type { AssembledMessage } from '../../sillytavern/prompt-assembler';

const FORMAT_INSTRUCTION = '你必须严格以JSON格式回复。注意：JSON中的var标签必须用单引号！\n\n{\n  "sceneInfo": {"date": "1923年10月15日", "weekday": "星期一", "time": "深夜", "weather": "阴雨", "location": "阿卡姆·书房"},\n  "leftHeader": "章节标题",\n  "leftContent": "叙事内容。嵌入状态变量：<var name=\'hp\' value=\'12\'/> <var name=\'san\' value=\'60\'/> <var name=\'mp\' value=\'12\'/> <var name=\'location\' value=\'书房\'/> <var name=\'threat\' value=\'2\'/>",\n  "rightHeader": "行动标题",\n  "rightContent": "引导文字。",\n  "choices": [\n    {"num": "I", "text": "选项简述", "action": "进行侦查检定(目标值:60)，搜查书房 <var name=\'lastAction\' value=\'搜查书房\'/> <var name=\'lastCheck\' value=\'侦查\'/>"},\n    {"num": "II", "text": "选项简述", "action": "进行图书馆使用检定(目标值:50)，查阅档案 <var name=\'lastAction\' value=\'查阅档案\'/> <var name=\'lastCheck\' value=\'图书馆使用\'/>"},\n    {"num": "III", "text": "选项简述", "action": "谨慎观察周围环境 <var name=\'lastAction\' value=\'观察环境\'/>"},\n    {"num": "IV", "text": "选项简述", "action": "重新评估局势 <var name=\'lastAction\' value=\'重新评估\'/>"}\n  ]\n}\n必须恰好4个选项。';

const DEFAULT_PRESET: ChatPreset = {
  id: 'default',
  name: '默认',
  temperature: 1.00,
  frequencyPenalty: 0.00,
  presencePenalty: 0.00,
  repetitionPenalty: 1.00,
  topP: 1.00,
  topK: 40,
  minP: 0,
  topA: 0,
  maxTokens: 2048,
  systemPrompt: '你是COC 7版（克苏鲁的呼唤）的守秘人（KP）。你的职责是：\n1. 根据玩家的行动描述推进剧情\n2. 进行检定判定并描述结果\n3. 描绘洛夫克拉夫特式的恐怖氛围\n4. 为玩家提供合理的行动选项\n\n【变量管理】\n你需要在回复末尾使用 JSON Patch 格式管理游戏状态变量。变量采用嵌套路径，例如：\n- 生命值变化：{"op":"replace","path":"/调查员/生命值/当前","value":"8"}\n- 理智值变化：{"op":"delta","path":"/调查员/理智值/当前","value":"-5"}\n- 新增线索：{"op":"insert","path":"/剧情/线索","value":{"名称":"神秘信件","内容":"..."}}\n- 时间推进：{"op":"replace","path":"/世界/时间","value":"深夜"}\n\n请在每次回复中有状态变化时输出变量标签。请始终以叙事者的身份进行回复，保持悬疑和恐怖的氛围。',
  userPrefix: '玩家: ',
  assistantPrefix: '守秘人: ',
  unlockContext: false,
  contextLength: 65536,
  maxResponseTokens: 2048,
  alternativeReplies: 1,
  streamEnabled: false,
  reasoningEffort: 'auto' as const,
  showThoughts: false,
  responseLength: 'auto' as const,
  seed: -1,
  charNameBehavior: 'none' as const,
  continueSuffix: 'none' as const,
  continuePrefill: false,
  assistantPrefill: '',
  mainPrompt: '',
  auxiliaryPrompt: '',
  postHistoryPrompt: '',
  aiAssistPrompt: '根据上文内容，写出{{char}}的下一句对话或行动',
  worldBookTemplate: '[世界书: {0}]',
  scenarioTemplate: '场景: {{scenario}}',
  personalityTemplate: '性格: {{personality}}',
  groupChatPrompt: '请以{{char}}的身份回复。',
  newChatPrompt: '[新的聊天即将开始]',
  newGroupChatPrompt: '[新的群聊即将开始]',
  newExampleChatPrompt: '[新的示例聊天即将开始]',
  continuePrompt: '[继续推进]',
  emptyMessagePrompt: '',
  promptItems: [],
};

function applyPostProcessing(messages: AssembledMessage[], mode: string): AssembledMessage[] {
  if (!mode) return messages;

  // Merge consecutive messages from the same role
  const mergeSameRole = (msgs: AssembledMessage[]): AssembledMessage[] => {
    const result: AssembledMessage[] = [];
    for (const m of msgs) {
      const last = result[result.length - 1];
      if (last && last.role === m.role) {
        last.content += '\n' + m.content;
      } else {
        result.push({ ...m });
      }
    }
    return result;
  };

  switch (mode) {
    case 'merge':
    case 'merge_with_tools':
      return mergeSameRole(messages);

    case 'semi_strict':
    case 'semi_strict_with_tools': {
      // Merge roles + allow only one optional system message
      const merged = mergeSameRole(messages);
      const systemMsgs = merged.filter((m) => m.role === 'system');
      if (systemMsgs.length <= 1) return merged;
      // Keep only first system message, merge rest into it
      const firstSys = systemMsgs[0];
      const rest = systemMsgs.slice(1).map((m) => m.content).join('\n');
      firstSys.content += '\n' + rest;
      return merged.filter((m) => m.role !== 'system' || m === firstSys);
    }

    case 'strict':
    case 'strict_with_tools': {
      // Merge roles, one system, require user first
      let result = mergeSameRole(messages);
      // Keep only one system message
      const sysIdx = result.findIndex((m) => m.role === 'system');
      if (sysIdx >= 0) {
        const allSys = result.filter((m) => m.role === 'system');
        if (allSys.length > 1) {
          const mergedSys = allSys[0];
          mergedSys.content = allSys.map((m) => m.content).join('\n');
          result = result.filter((m) => m.role !== 'system' || m === mergedSys);
        }
      }
      // Ensure user message is first (move system after first user)
      if (result.length > 0 && result[0].role !== 'user') {
        const firstUser = result.findIndex((m) => m.role === 'user');
        if (firstUser > 0) {
          const user = result.splice(firstUser, 1)[0];
          result.unshift(user);
        }
      }
      return result;
    }

    case 'single_user': {
      // Merge ALL into a single user message
      const combined = messages.map((m) => `[${m.role}]: ${m.content}`).join('\n\n');
      return [{ role: 'user', content: combined }];
    }

    default:
      return messages;
  }
}

function buildCharacterVariables(): Record<string, string> {
  const sheet = useCharSheetStore.getState().sheet;
  const chars = Object.entries(sheet.characteristics)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  return {
    charName: sheet.identity.name,
    charOccupation: sheet.identity.occupation,
    charAge: String(sheet.identity.age),
    charGender: sheet.identity.gender,
    charCharacteristics: chars,
    charHP: `${sheet.secondary.hp.current}/${sheet.secondary.hp.max}`,
    charSAN: `${sheet.secondary.san.current}/${sheet.secondary.san.max}`,
    charMP: `${sheet.secondary.mp.current}/${sheet.secondary.mp.max}`,
    charLuck: String(sheet.secondary.luck),
    greeting: sheet.greeting || '',
    description: sheet.description || '',
    personality: sheet.personality || '',
    scenario: sheet.scenario || '',
    personaDescription: sheet.personaDescription || '',
  };
}

function buildContextFromPages(): string {
  const { pages, pageIndex } = useBookStore.getState();
  const relevantPages = pages.slice(Math.max(0, pageIndex - 2), pageIndex + 1);
  let ctx = relevantPages
    .map((p) => `【${p.leftHeader}】${p.leftContent}\n【${p.rightHeader}】${p.rightContent}`)
    .join('\n\n');

  // Append current scene info as context for continuity
  const currentPage = pages[pageIndex];
  if (currentPage?.sceneInfo) {
    const si = currentPage.sceneInfo;
    ctx += `\n\n[当前场景: ${si.date} ${si.weekday} ${si.time} | 天气: ${si.weather} | 地点: ${si.location}]`;
  }
  return ctx;
}

function computeNextPageNumber(): string {
  const { pages } = useBookStore.getState();
  // Existing pages use odd numbers like '— 3 —', '— 5 —'
  // Calculate next odd number based on total pages
  const nextNum = pages.length * 2 + 1;
  return `— ${nextNum} —`;
}

function parseLlmResponse(raw: string, userAction: string): BookPage | null {
  let jsonStr = raw.trim();

  // Extract JSON from markdown code blocks if present
  const cbMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (cbMatch) jsonStr = cbMatch[1].trim();

  // Strip outer wrapping quotes (AI may string-encode the JSON)
  jsonStr = jsonStr.replace(/^"(\s*\{[\s\S]*\}\s*)"$/m, '$1');
  // Also handle unclosed outer quotes
  if (jsonStr.startsWith('"') && /^\s*\{/.test(jsonStr.slice(1))) {
    jsonStr = jsonStr.slice(1);
  }
  if (jsonStr.endsWith('"') && /\}\s*$/.test(jsonStr.slice(0, -1))) {
    jsonStr = jsonStr.slice(0, -1);
  }

  // Extract JSON object using brace matching (more reliable than greedy regex)
  const braceStart = jsonStr.indexOf('{');
  if (braceStart >= 0) {
    let depth = 0, inString = false, escaped = false, braceEnd = -1;
    for (let i = braceStart; i < jsonStr.length; i++) {
      const c = jsonStr[i];
      if (inString) {
        if (escaped) { escaped = false; continue; }
        if (c === '\\') { escaped = true; continue; }
        if (c === '"') { inString = false; }
        continue;
      }
      if (c === '"') { inString = true; continue; }
      if (c === '{') { depth++; }
      else if (c === '}') { depth--; if (depth === 0) { braceEnd = i; break; } }
    }
    if (braceEnd > 0) {
      jsonStr = jsonStr.substring(braceStart, braceEnd + 1);
    }
  }

  // Fix Chinese/fullwidth punctuation that AI may use as JSON structural chars
  jsonStr = jsonStr
    .replace(/[，、]/g, ',')
    .replace(/[：]/g, ':')
    .replace(/[；]/g, ',')
    .replace(/[［]/g, '[')
    .replace(/[］]/g, ']')
    .replace(/[｛]/g, '{')
    .replace(/[｝]/g, '}');

  // Fix common JSON syntax errors from AI output
  // 1. Convert <var name="X" value="Y"/> to single-quoted form (don't break JSON strings)
  jsonStr = jsonStr.replace(/<var\s+name="([^"]*)"\s+value="([^"]*)"\s*\/>/gi, '<var name=\'$1\' value=\'$2\'/>');
  // 2. Trailing commas before } or ]
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

  // Parse attempt loop: retry with increasingly aggressive cleanup
  let parsed: Record<string, unknown> | null = null;
  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      parsed = JSON.parse(jsonStr) as Record<string, unknown>;
      break;
    } catch (e: any) {
      lastErr = e.message;
      // Show context around the error position
      const posMatch = lastErr.match(/position\s+(\d+)/i);
      if (posMatch) {
        const pos = parseInt(posMatch[1]);
        const ctx = jsonStr.substring(Math.max(0, pos - 30), Math.min(jsonStr.length, pos + 30));
        lastErr += ` | 上下文: ...${ctx}...`;
      }
      if (attempt === 0) {
        // Aggressive cleanup: remove zero-width chars, BOM, and non-printable
        jsonStr = jsonStr.replace(/[​-‍﻿ -]/g, '');
      }
    }
  }

  if (!parsed) {
    pushLog('warn', `[parseLlm] JSON解析失败。原因: ${lastErr}。\n=== 处理后JSON(全部${jsonStr.length}字) ===\n${jsonStr}\n=== 原始文本(全部${raw.length}字) ===\n${raw}`, 'system');
    // Fallback: raw text
    return {
      leftHeader: userAction,
      leftContent: raw,
      leftPage: computeNextPageNumber(),
      rightHeader: '行动',
      rightContent: '接下来你打算怎么做？',
      sceneInfo: undefined,
      rightChoices: [
        { num: 'I', text: '继续探索', action: '继续探索周围环境' },
        { num: 'II', text: '仔细观察', action: '仔细观察你注意到的事物' },
        { num: 'III', text: '使用技能', action: '使用你的技能进行调查' },
        { num: 'IV', text: '后退一步', action: '退后一步，重新评估局势' },
      ],
    };
  }

  // ── Parse successful — extract fields ──

  // Extract scene info if present; inherit from last page if missing
  let sceneInfo: SceneInfo | undefined;
    if (parsed.sceneInfo && typeof parsed.sceneInfo === 'object') {
      const si = parsed.sceneInfo as Record<string, unknown>;
      sceneInfo = {
        date: String(si.date ?? ''),
        weekday: String(si.weekday ?? ''),
        time: String(si.time ?? ''),
        weather: String(si.weather ?? ''),
        location: String(si.location ?? ''),
      };
    } else {
      const pages = useBookStore.getState().pages;
      sceneInfo = pages[pages.length - 1]?.sceneInfo;
    }

    // ── MVU Variable Extraction ──
    // Extract <var name='X' value='Y'/> from parsed JSON text (before strip)
    const extractVarTags = (text: string): Record<string, string> => {
      const vars: Record<string, string> = {};
      let m;
      const re = /<var\s+name=['"]([^"']+)['"]\s+value=['"]([^"']*)['"]\s*\/>/gi;
      while ((m = re.exec(text)) !== null) {
        if (m[2]) vars[m[1]] = m[2]; // only overwrite if value is not empty
      }
      return vars;
    };
    // Extract from both raw JSON and the narrative
    const rawTextForVars = JSON.stringify(parsed); // use full JSON string to catch all var tags
    const allVars = extractVarTags(rawTextForVars);

    // Sync scene-related vars into sceneInfo
    if (allVars.location) sceneInfo = { ...(sceneInfo || {} as any), date: sceneInfo?.date ?? '', weekday: sceneInfo?.weekday ?? '', time: sceneInfo?.time ?? '', weather: sceneInfo?.weather ?? '', location: allVars.location };
    if (allVars.date) sceneInfo = { ...(sceneInfo || {} as any), date: allVars.date, weekday: sceneInfo?.weekday ?? '', time: sceneInfo?.time ?? '', weather: sceneInfo?.weather ?? '', location: sceneInfo?.location ?? '' };
    if (allVars.time) sceneInfo = { ...(sceneInfo || {} as any), date: sceneInfo?.date ?? '', weekday: sceneInfo?.weekday ?? '', time: allVars.time, weather: sceneInfo?.weather ?? '', location: sceneInfo?.location ?? '' };
    if (allVars.weather) sceneInfo = { ...(sceneInfo || {} as any), date: sceneInfo?.date ?? '', weekday: sceneInfo?.weekday ?? '', time: sceneInfo?.time ?? '', weather: allVars.weather, location: sceneInfo?.location ?? '' };
    // Save all extracted vars to the variable store for cross-page access
    if (Object.keys(allVars).length > 0) {
      try {
        const st = useVariableStore.getState();
        for (const [k, v] of Object.entries(allVars)) {
          if (v) st.setVariable(k, v, 'llm');
        }
      } catch { /* store not available */ }
    }

    // Strip MVU tags from display — data already extracted above
    const stripMvu = (s: string) => s
      .replace(/<var\s+name=['"][^"']+['"]\s+value=['"][^"']*['"]\s*\/>/gi, '')
      .replace(/\{\{set:[^}]+\}\}/gi, '')
      .replace(/<i\s+data-(?:var|set|val)="[^"]*"[^>]*>/gi, '')
      .trim();
    const leftHeader = String(parsed.leftHeader ?? '探索');
    const leftContent = stripMvu(String(parsed.leftContent ?? raw));
    const rightHeader = String(parsed.rightHeader ?? '行动');
    const rightContent = stripMvu(String(parsed.rightContent ?? '接下来你打算怎么做？'));

    let choices = Array.isArray(parsed.choices)
      ? parsed.choices.map((c: unknown, i: number) => {
          const item = c as Record<string, unknown>;
          return {
            num: String(item.num ?? String(i + 1)),
            text: String(item.text ?? `选项 ${i + 1}`),
            action: String(item.action ?? item.text ?? ''),
          };
        })
      : [];

    // Ensure we have exactly 4 choices
    while (choices.length < 4) {
      choices.push({
        num: String(choices.length + 1),
        text: '继续探索',
        action: '继续探索当前环境',
      });
    }
    choices = choices.slice(0, 4);

    pushLog('debug', `[parseLlm] JSON解析成功 — leftHeader="${leftHeader}", rightHeader="${rightHeader}", choices=${choices.length}条, sceneInfo=${sceneInfo ? '有' : '无'}`, 'system');
    pushLog('debug', `[parseLlm] 左页: ${leftContent}\n[parseLlm] 右页: ${rightContent}\n[parseLlm] 选项: ${choices.map((c: any) => c.num+'.'+c.text).join(' | ')}`, 'system');

    return {
      leftHeader,
      leftContent,
      leftPage: computeNextPageNumber(),
      rightHeader,
      rightContent,
      rightChoices: choices,
      sceneInfo,
    };
}

export function InputBar() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lastInputRef = useRef('');

  // Prompt viewer state
  const [previewMessages, setPreviewMessages] = useState<AssembledMessage[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  // Wand menu state
  const [wandOpen, setWandOpen] = useState(false);
  const [showPromptViewer, setShowPromptViewer] = useState(false);
  const promptViewerRef = useRef<AssembledMessage[]>([]);
  const buildFnRef = useRef<((text?: string) => void) | null>(null);
  const { streamingText, isStreaming, onToken, startStream, endStream, enabled: streamRenderEnabled } = useStreamingRenderer();
  const allCommands = useMemo(() => getCommands(), []);

  // TH script hooks — refresh when global or preset scripts change
  const thGlobalScripts = useTavernHelperStore((s) => s.globalScripts);
  const thPresetScripts = useTavernHelperStore((s) => s.presetScripts);
  const thHooks = useMemo<ThScriptHooks>(
    () => loadThScripts(thGlobalScripts, thPresetScripts),
    [thGlobalScripts, thPresetScripts],
  );

  // Token counter state
  const [showTokenCounter, setShowTokenCounter] = useState(false);
  const [tokenContext, setTokenContext] = useState<{
    systemPrompt: string;
    loreEntryContents: string[];
    formatInstruction: string;
    chatHistoryMessages: string[];
    userMessage: string;
  } | undefined>();

  // Click outside to close wand menu
  useEffect(() => {
    if (!wandOpen) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target instanceof HTMLElement)) return;
      if (!e.target.closest('.wand-menu-container')) setWandOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [wandOpen]);

  const openTokenCounter = () => {
    const trimmed = input.trim();
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
      systemPrompt: DEFAULT_PRESET.systemPrompt,
      loreEntryContents: matchedLore.map((e) => e.content),
      formatInstruction: FORMAT_INSTRUCTION,
      chatHistoryMessages: [],
      userMessage: trimmed || '(空)',
    });
    setShowTokenCounter(true);
  };

  const buildPromptMessages = (overrideInput?: string): { messages: AssembledMessage[]; tokenCount: number } | null => {
    const trimmed = (overrideInput ?? input).trim();
    const isMock = !trimmed; // Allow mock build with placeholder for prompt viewer
    const effectiveInput = trimmed || '(提示词查看器预览)';

    // Process ST-style macros ({{setvar}}, {{getvar}}, {{incvar}}, {{decvar}})
    const pt = useTavernHelperStore.getState().promptTemplate;
    const templateEnabled = pt.enabled && pt.generateEnabled;
    let macroProcessedInput = templateEnabled ? processMacros(effectiveInput) : effectiveInput;
    // Filter chat: strip template syntax before generation
    if (pt.enabled && pt.filterChatMessage) {
      macroProcessedInput = macroProcessedInput.replace(/\{\{(?:setvar|getvar|incvar|decvar)::[^}]*\}\}/g, '').trim();
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
        // GENERATE injection: inject entries with GENERATE:BEFORE/GENERATE:AFTER markers
        const keys = entry.keys.toLowerCase();
        const isGenerate = keys.includes('generate:before') || keys.includes('generate:after');
        const isInject = entry.keys.includes('@INJECT');
        const isRender = keys.includes('render:before') || keys.includes('render:after');
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
      for (const book of Object.values(allBooks)) {
        if (book.enabled === false) continue;
        for (const e of Object.values(book.entries)) {
          if (e.disabled) matchedLore.push(e);
        }
      }
    }
    // Debug logging
    if (pt.debugEnabled) {
      pushLog('debug', `[PT] 世界书条目: ${matchedLore.length}条匹配 + ${generateInjects.length}条注入`, 'system');
    }

    // Build full variable substitution map (character + game variables)
    const charVars = buildCharacterVariables();
    const gameVars = useVariableStore.getState().buildFullSubstitutionMap();
    const variables = { ...gameVars, ...charVars };

    // Load active preset (try chat session, then localStorage, fall back to default)
    const activePresetId = useChatStore.getState().sessions.find((s) => s.id === useChatStore.getState().activeId)?.presetId
      || localStorage.getItem('coc_last_preset');
    let activePreset: ChatPreset = DEFAULT_PRESET;
    if (activePresetId && activePresetId !== 'p1') {
      try {
        const raw = localStorage.getItem('coc_presets_v1');
        if (raw) {
          const saved = JSON.parse(raw);
          if (saved[activePresetId]) {
            activePreset = { ...DEFAULT_PRESET, ...saved[activePresetId] };
          }
        }
      } catch { /* use default */ }
    }

    // Prompt Template: EJS render options
    const tmplOpts = {
      disableWith: pt.withContextDisabled,
      cache: { enabled: pt.cacheEnabled, size: pt.cacheSize },
    };

    // Process EJS templates in system prompt and lore entries
    const processedPreset = {
      ...activePreset,
      systemPrompt: renderTemplate(activePreset.systemPrompt || DEFAULT_PRESET.systemPrompt, tmplOpts),
    };
    const processedLore = matchedLore.map((e) => ({
      ...e,
      content: renderTemplate(e.content, tmplOpts),
    }));
    const processedFormat = renderTemplate(FORMAT_INSTRUCTION, tmplOpts);

    // Resolve Tavern Helper macros ({{get_<scope>_variable::name}} etc.)
    if (useTavernHelperStore.getState().enabled) {
      const presetVars = activePreset.tavernHelperVars;
      processedPreset.systemPrompt = resolveTavernHelperMacrosDeep(processedPreset.systemPrompt, 3, presetVars);
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
      renderTemplate(macroProcessedInput, tmplOpts), 1, regexScripts, { isPrompt: true },
    );
    const regexProcessedSystem = runAllRegexScripts(
      activePreset.systemPrompt, 1, regexScripts, { isPrompt: true },
    );

    // Build world book content strings (for before/after markers)
    const enabledBooks = Object.values(useLorebookStore.getState().books).filter((b) => b.enabled !== false);
    const wbEntries = enabledBooks.flatMap((b) => Object.values(b.entries));
    const wbBefore = wbEntries.filter((e) => (e as any).position === 'before_char').map((e) => renderTemplate(e.content, tmplOpts)).join('\n');
    const wbAfter = wbEntries.filter((e) => (e as any).position !== 'before_char').map((e) => renderTemplate(e.content, { ...tmplOpts, onlyWorldinfo: true })).join('\n');

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
    // Store for Prompt Viewer — update on every build (mock or real)
    promptViewerRef.current = messages;
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
      pushLog('warn', `上下文裁剪: ${result.trimmedCount}条 → 剩余~${finalTokens} tokens / 上限${budget.maxTokens}`);
    }

    return { messages: result.trimmed, tokenCount: finalTokens };
  };

  // Keep a ref to the builder so external events can trigger mock generation
  buildFnRef.current = (text?: string) => { buildPromptMessages(text); };

  // Listen for mock generation request (from Prompt Viewer refresh)
  useEffect(() => {
    const handler = () => { buildFnRef.current?.(input.trim() || undefined); };
    document.addEventListener('trigger-mock-generate', handler);
    return () => document.removeEventListener('trigger-mock-generate', handler);
  }, []);

  const submit = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    pushLog('debug', `[提交] 原始输入: "${trimmed}"`, 'system');

    // Process slash commands first
    let processedInput = trimmed;
    if (trimmed.startsWith('/')) {
      processedInput = await processSlashCommands(trimmed);
      pushLog('debug', `[提交] 处理后: "${processedInput}"`, 'system');
      if (!processedInput.trim() || processedInput.startsWith('[')) {
        setInput(processedInput);
        return;
      }
      setInput(processedInput);
    }

    lastInputRef.current = trimmed || lastInputRef.current;

    const settings = useSettingsStore.getState();
    if (!settings.apiKey) {
      setError('请先在设置中配置API');
      return;
    }

    const result = buildPromptMessages();
    if (!result) return;

    pushLog('info', `提示词已组装 — ~${result.tokenCount} tokens`);
    await handleSendFromPreview(result.messages, false);
  };

  const regenerate = async () => {
    if (loading) return;
    const lastInput = lastInputRef.current || input.trim();
    if (!lastInput) { setError('没有可重新生成的内容'); return; }

    pushLog('info', `[重新生成] 使用上次输入: "${lastInput.slice(0, 50)}..."`);

    const settings = useSettingsStore.getState();
    if (!settings.apiKey) { setError('请先在设置中配置API'); return; }

    // Use lastInput as the prompt input instead of the (cleared) current input
    const result = buildPromptMessages(lastInput);
    if (!result) { pushLog('error', '[重新生成] 提示词组装失败'); return; }

    pushLog('info', `[重新生成] 提示词已组装 — ~${result.tokenCount} tokens, ${result.messages.length} 条消息`);
    await handleSendFromPreview(result.messages, true);
  };

  const handleSendFromPreview = async (editedMessages: AssembledMessage[], replace = false) => {
    setShowPreview(false);
    const settings = useSettingsStore.getState();
    const trimmed = input.trim();

    setLoading(true);
    setError('');
    pushLog('info', `发送API请求 — 模型: ${settings.apiModel}, 消息数: ${editedMessages.length}, ~${estimateTokens(JSON.stringify(editedMessages))} tokens`);

    // Start streaming preview if enabled
    startStream();

    try {
      const response = await sendChatCompletion(
        applyPostProcessing(editedMessages, settings.promptPostProcessing),
        DEFAULT_PRESET,
        settings.apiBaseUrl,
        settings.apiKey,
        settings.apiModel,
        streamRenderEnabled, // stream when rendering enabled for token callbacks
        streamRenderEnabled ? onToken : undefined,
      );

      pushLog('debug', `[API] 收到响应 — ${response.content.length}字 ===\n${response.content}`, 'api');

      // Apply regex scripts to AI output (placement 2 = AI_OUTPUT)
      const aiOutputRegexScripts = [
        ...useRegexStore.getState().globalScripts,
        ...useRegexStore.getState().presetScripts,
      ];
      const regexProcessedContent = runAllRegexScripts(
        response.content, 2, aiOutputRegexScripts, { isMarkdown: true, isPrompt: true },
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
          const { mergeVariables } = await import('../../sillytavern/variables');
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

      // Parse JSON from raw response — stripMvu cleans display after variable extraction
      pushLog('info', `API响应成功 — ${response.content.length}字符, 总消耗~${estimateTokens(JSON.stringify(editedMessages)) + estimateTokens(regexProcessedContent)} tokens`);
      const newPage = parseLlmResponse(response.content, trimmed);
      if (!newPage) {
        throw new Error('无法解析AI回复');
      }

      const bookStore = useBookStore.getState();
      if (replace) {
        bookStore.replacePage(bookStore.pageIndex, newPage);
        pushLog('info', `页面已重新生成 — ${newPage.leftHeader}`);
        pushLog('debug', `[页面内容/替换] 左: ${newPage.leftContent}\n右: ${newPage.rightContent}`, 'system');
      } else {
        bookStore.appendPage(newPage);
        pushLog('info', `新页面已生成 — ${newPage.leftHeader}`);
        pushLog('debug', `[页面内容] 左: ${newPage.leftContent}\n右: ${newPage.rightContent}\n选项: ${newPage.rightChoices.map((c: any) => c.text).join(' | ')}`, 'system');
        bookStore.autoFlipForward();
        // Optimize: trim old pages if enabled
        const thOptimize = useTavernHelperStore.getState().optimize;
        const thRender = useTavernHelperStore.getState().render;
        if (thOptimize.optimizeMessageLoad) {
          const limit = thRender.renderDepth > 0 ? thRender.renderDepth : 10;
          bookStore.trimPages(limit);
        }
      }
      setInput('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI请求失败';
      pushLog('error', `API请求失败: ${message}`, 'api');
      setError(message);
    } finally {
      endStream();
      setLoading(false);
    }
  };

  const handleClosePreview = () => {
    setShowPreview(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const toggleDiceHistory = () => {
    const panelStore = usePanelStore.getState();
    if (panelStore.openPanel === 'diceHistory') {
      panelStore.closeAll();
    } else {
      panelStore.open('diceHistory');
    }
  };

  return (
    <>
      <TokenCounter
        visible={showTokenCounter}
        onClose={() => setShowTokenCounter(false)}
        contextBreakdown={tokenContext}
        model={useSettingsStore.getState().apiModel}
      />
      <PromptViewer
        visible={showPromptViewer}
        onClose={() => setShowPromptViewer(false)}
      />
      {streamRenderEnabled && (
        <StreamingPreview visible={isStreaming} text={streamingText} />
      )}
      <footer style={{
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        borderTop: '1px solid rgba(196,168,85,0.15)',
        background: 'rgba(13,10,7,0.85)', backdropFilter: 'blur(8px)',
      }}>
        <style>{`.inputbar-textarea::-webkit-scrollbar{width:5px}.inputbar-textarea::-webkit-scrollbar-track{background:rgba(0,0,0,0.15);border-radius:3px}.inputbar-textarea::-webkit-scrollbar-thumb{background:var(--brass);border-radius:3px}.inputbar-textarea::-webkit-scrollbar-thumb:hover{background:var(--gold)}`}</style>
        {error && (
          <div style={{
            padding: '6px 24px', fontSize: 12, color: '#e8815b',
            fontFamily: 'var(--font-ui)', letterSpacing: 1,
            background: 'rgba(180,60,30,0.1)', display: 'flex', justifyContent: 'space-between',
          }}>
            <span>{error}</span>
            <span
              onClick={() => setError('')}
              style={{ cursor: 'pointer', opacity: 0.7, fontSize: 16 }}
              title="关闭"
            >
              ×
            </span>
          </div>
        )}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 24px',
        }}>
          {/* Magic wand button with popup menu */}
          <div className="wand-menu-container" style={{ position: 'relative' }}>
            <button
              onClick={() => setWandOpen(!wandOpen)}
              title="工具"
              style={wandBtnStyle}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--gold)'; }}
              onMouseLeave={(e) => { if (!wandOpen) { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'var(--brass)'; } }}
            >
              ✦
            </button>

            <AnimatePresence>
              {wandOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 8px)',
                    left: 0,
                    minWidth: 160,
                    background: 'linear-gradient(180deg, rgba(42,31,20,0.98) 0%, rgba(26,20,16,0.98) 100%)',
                    border: '1px solid var(--gold)',
                    borderRadius: 6,
                    boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
                    overflow: 'hidden',
                    zIndex: 700,
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-ui)', fontSize: 11 }}>
                    <tbody>
                      <tr
                        onClick={() => { toggleDiceHistory(); setWandOpen(false); }}
                        style={{ cursor: 'pointer', transition: 'background 0.15s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.08)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <td style={{ padding: '10px 14px', width: 28, textAlign: 'center', color: 'var(--gold)', fontSize: 14 }}>✦</td>
                        <td style={{ padding: '10px 14px 10px 0', color: 'var(--text-light)', letterSpacing: 1 }}>检定记录</td>
                      </tr>
                      <tr
                        onClick={() => { openTokenCounter(); setWandOpen(false); }}
                        style={{ cursor: 'pointer', borderTop: '1px solid rgba(196,168,85,0.1)', transition: 'background 0.15s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.08)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <td style={{ padding: '10px 14px', width: 28, textAlign: 'center', color: 'var(--gold)', fontFamily: 'var(--font-mono)', fontWeight: 'bold', fontSize: 11 }}>T</td>
                        <td style={{ padding: '10px 14px 10px 0', color: 'var(--text-light)', letterSpacing: 1 }}>Token 计数</td>
                      </tr>
                      <tr
                        onClick={() => { usePanelStore.getState().open('variable'); setWandOpen(false); }}
                        style={{ cursor: 'pointer', borderTop: '1px solid rgba(196,168,85,0.1)', transition: 'background 0.15s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.08)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <td style={{ padding: '10px 14px', width: 28, textAlign: 'center', color: '#7b9fc1', fontSize: 12 }}>⬡</td>
                        <td style={{ padding: '10px 14px 10px 0', color: 'var(--text-light)', letterSpacing: 1 }}>变量引擎</td>
                      </tr>
                      <tr
                        onClick={() => { setShowPromptViewer(true); setWandOpen(false); setTimeout(() => document.dispatchEvent(new CustomEvent('trigger-mock-generate')), 50); }}
                        style={{ cursor: 'pointer', borderTop: '1px solid rgba(196,168,85,0.1)', transition: 'background 0.15s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.08)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <td style={{ padding: '10px 14px', width: 28, textAlign: 'center', color: 'var(--gold)', fontSize: 12 }}>◈</td>
                        <td style={{ padding: '10px 14px 10px 0', color: 'var(--text-light)', letterSpacing: 1 }}>提示词查看器</td>
                      </tr>
                      <tr
                        onClick={() => { regenerate(); setWandOpen(false); }}
                        style={{ cursor: 'pointer', borderTop: '1px solid rgba(196,168,85,0.1)', transition: 'background 0.15s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.08)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <td style={{ padding: '10px 14px', width: 28, textAlign: 'center', color: 'var(--gold)', fontSize: 13 }}>↻</td>
                        <td style={{ padding: '10px 14px 10px 0', color: 'var(--text-light)', letterSpacing: 1 }}>重新生成</td>
                      </tr>
                      <tr
                        onClick={() => { document.dispatchEvent(new CustomEvent('toggle-debug-log')); setWandOpen(false); }}
                        style={{ cursor: 'pointer', borderTop: '1px solid rgba(196,168,85,0.1)', transition: 'background 0.15s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(196,168,85,0.08)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <td style={{ padding: '10px 14px', width: 28, textAlign: 'center', color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>&#9881;</td>
                        <td style={{ padding: '10px 14px 10px 0', color: 'var(--text-light)', letterSpacing: 1 }}>调试日志</td>
                      </tr>
                    </tbody>
                  </table>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
            {/* Slash command autocomplete */}
            {input.startsWith('/') && (
              <div style={{
                position: 'absolute', bottom: '100%', left: 0, right: 0, zIndex: 800,
                background: 'linear-gradient(180deg, rgba(20,16,12,0.96) 0%, rgba(13,10,7,0.98) 100%)',
                border: '1px solid var(--gold)', borderRadius: 4,
                marginBottom: 4, maxHeight: 180, overflowY: 'auto',
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.2)',
              }}>
                {allCommands
                  .filter((c) => c.name.startsWith(input.slice(1).split(/[\s=]/)[0].toLowerCase()) || input === '/')
                  .map((c) => (
                    <div key={c.name} onClick={() => { setInput('/' + c.name + ' '); }}
                      style={{ padding: '6px 12px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-light)', borderBottom: '1px solid rgba(196,168,85,0.06)' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(196,168,85,0.08)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                      <span style={{ color: 'var(--gold)', fontWeight: 'bold' }}>/{c.name}</span>
                      <span style={{ color: 'var(--ink-subtle)', marginLeft: 8, fontSize: 10 }}>{c.description}</span>
                    </div>
                  ))}
              </div>
            )}

            <textarea
            value={input}
            onChange={(e) => { setInput(e.target.value); if (error) setError(''); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 200) + 'px';
            }}
            placeholder="输入行动或对话..."
            disabled={loading}
            rows={1}
            style={{
              flex: 1, padding: '10px 16px',
              border: '1px solid var(--brass)', borderRadius: 3,
              background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)',
              fontFamily: 'var(--font-ui)', fontSize: 14, letterSpacing: 1,
              outline: 'none', caretColor: 'var(--gold)',
              opacity: loading ? 0.5 : 1,
              resize: 'none', overflowY: 'auto',
              maxHeight: 200, minHeight: 42,
              scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.2)',
            }}
            className="inputbar-textarea"
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
          />
          </div>
          <button onClick={submit} disabled={loading} title="预览提示词后发送" style={{
            padding: '10px 28px', border: '1px solid var(--gold)',
            background: loading ? 'rgba(196,168,85,0.05)' : 'rgba(196,168,85,0.1)',
            color: loading ? 'rgba(196,168,85,0.4)' : 'var(--gold)',
            fontFamily: 'var(--font-ui)', fontSize: 14, letterSpacing: 4,
            borderRadius: 3, cursor: loading ? 'default' : 'pointer',
            whiteSpace: 'nowrap', transition: 'var(--transition-smooth)',
            opacity: loading ? 0.7 : 1,
          }}
            onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = 'rgba(196,168,85,0.2)'; }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = 'rgba(196,168,85,0.1)'; }}
          >
            {loading ? '...' : '推 进'}
          </button>
        </div>
      </footer>
    </>
  );
}

const wandBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 0,
  border: '1px solid var(--brass)',
  background: 'rgba(0,0,0,0.2)',
  color: 'var(--ink-subtle)',
  fontFamily: 'var(--font-ui)',
  fontSize: 14,
  borderRadius: 3,
  cursor: 'pointer',
  transition: 'var(--transition-smooth)',
  flexShrink: 0,
};

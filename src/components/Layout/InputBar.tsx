import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBookStore } from '../../stores/useBookStore';
import { usePanelStore } from '../../stores/usePanelStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useLorebookStore } from '../../stores/useLorebookStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { assemblePrompt, matchLoreEntries } from '../../sillytavern/prompt-assembler';
import { sendChatCompletion } from '../../sillytavern/api-router';
import { PromptViewer } from '../Settings/PromptViewer';
import { TokenCounter } from '../Shared/TokenCounter';
import { useVariableStore } from '../../stores/useVariableStore';
import { extractVariablesWithLLM } from '../../sillytavern/mvu-extractor';
import { processSlashCommands } from '../../sillytavern/slash-commands';
import { renderTemplate } from '../../sillytavern/ejs-template';
import { trimToBudget, getModelBudget } from '../../sillytavern/context-manager';
import { estimateTokens } from '../../sillytavern/token-counter';
import { pushLog } from '../Shared/DebugLog';
import type { BookPage, ChatPreset, LoreEntry, SceneInfo } from '../../types';
import type { AssembledMessage } from '../../sillytavern/prompt-assembler';

const FORMAT_INSTRUCTION = `你必须严格以JSON格式回复，不要包含任何其他文字。JSON格式如下：
{
  "sceneInfo": {
    "date": "当前游戏内日期，如 1923年10月15日",
    "weekday": "星期几，如 星期一",
    "time": "当前时间段，如 深夜、清晨、午后",
    "weather": "当前天气，如 阴雨绵绵、大雾弥漫、月朗星稀",
    "location": "当前地点，如 阿卡姆·密斯卡塔尼克大学图书馆"
  },
  "leftHeader": "左页章节标题（如：调查结果、深入探索、战斗等）",
  "leftContent": "左页的叙事内容，包含环境描写、NPC对话、检定结果等。使用中文。",
  "rightHeader": "右页行动标题（如：行动选项、选择等）",
  "rightContent": "引导玩家选择的描述文字，简要说明当前可采取的行动方向。",
  "choices": [
    {"num": "I", "text": "选项一的简短描述", "action": "选项一的具体行动内容"},
    {"num": "II", "text": "选项二的简短描述", "action": "选项二的具体行动内容"},
    {"num": "III", "text": "选项三的简短描述", "action": "选项三的具体行动内容"},
    {"num": "IV", "text": "选项四的简短描述", "action": "选项四的具体行动内容"}
  ]
}
必须提供恰好4个选项，sceneInfo中的日期要符合1920年代COC世界观。`;

const DEFAULT_PRESET: ChatPreset = {
  id: 'default',
  name: '默认',
  temperature: 0.8,
  topP: 0.9,
  topK: 40,
  maxTokens: 2048,
  repetitionPenalty: 1.1,
  systemPrompt: `你是COC 7版（克苏鲁的呼唤）的守秘人（KP）。你的职责是：
1. 根据玩家的行动描述推进剧情
2. 进行检定判定并描述结果
3. 描绘洛夫克拉夫特式的恐怖氛围
4. 为玩家提供合理的行动选项

【MVU变量系统】
你可以在回复中使用以下格式管理游戏状态变量：
- 设置变量：<var name="变量名" value="变量值" />
- 内联命令：{{set:变量名=变量值}}
- 属性变化示例：HP-3时输出 <var name="hpChange" value="-3" />
- 场景更新示例：地点变化时输出 <var name="location" value="新地点" />

常用变量名：hpChange, sanChange, luckChange, mpChange, clue, threat, npcMood, investigationProgress
请在每次回复中有状态变化时输出对应变量标签。请始终以叙事者的身份进行回复，保持悬疑和恐怖的氛围。`,
  userPrefix: '玩家: ',
  assistantPrefix: '守秘人: ',
};

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

  // Try to extract JSON from markdown code blocks
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  // Try to find the outermost JSON object if embedded in other text
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objMatch) {
    jsonStr = objMatch[0];
  }

  try {
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    // Extract scene info if present
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
    }

    const leftHeader = String(parsed.leftHeader ?? '探索');
    const leftContent = String(parsed.leftContent ?? raw);
    const rightHeader = String(parsed.rightHeader ?? '行动');
    const rightContent = String(parsed.rightContent ?? '接下来你打算怎么做？');

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

    return {
      leftHeader,
      leftContent,
      leftPage: computeNextPageNumber(),
      rightHeader,
      rightContent,
      rightChoices: choices,
      sceneInfo,
    };
  } catch {
    // JSON parse failed — use the raw text as narrative with default choices
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
}

export function InputBar() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Prompt viewer state
  const [previewMessages, setPreviewMessages] = useState<AssembledMessage[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  // Wand menu state
  const [wandOpen, setWandOpen] = useState(false);

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

  const buildPromptMessages = (): { messages: AssembledMessage[] } | null => {
    const trimmed = input.trim();
    if (!trimmed) return null;

    // Build context from recent pages
    const contextText = buildContextFromPages();

    // Match lorebook entries against context + user input
    const allBooks = useLorebookStore.getState().books;
    let matchedLore: LoreEntry[] = [];
    for (const book of Object.values(allBooks)) {
      for (const entry of Object.values(book.entries)) {
        matchedLore.push(entry);
      }
    }
    matchedLore = matchLoreEntries(contextText + '\n' + trimmed, matchedLore);

    // Build full variable substitution map (character + game variables)
    const charVars = buildCharacterVariables();
    const gameVars = useVariableStore.getState().buildFullSubstitutionMap();
    const variables = { ...gameVars, ...charVars };

    // Process EJS templates in system prompt and lore entries
    const processedPreset = {
      ...DEFAULT_PRESET,
      systemPrompt: renderTemplate(DEFAULT_PRESET.systemPrompt),
    };
    const processedLore = matchedLore.map((e) => ({
      ...e,
      content: renderTemplate(e.content),
    }));
    const processedFormat = renderTemplate(FORMAT_INSTRUCTION);

    // Assemble prompt messages
    const messages = assemblePrompt(
      renderTemplate(trimmed),
      [],
      processedPreset,
      processedLore,
      variables,
      processedFormat,
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

    if (result.trimmedCount > 0) {
      console.debug(`[Context Manager] Trimmed ${result.trimmedCount} messages, final tokens: ~${estimateTokens(JSON.stringify(result.trimmed))}`);
    }

    return { messages: result.trimmed };
  };

  const submit = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    // Process slash commands first
    let processedInput = trimmed;
    if (trimmed.startsWith('/')) {
      processedInput = await processSlashCommands(trimmed);
      // If the command fully handled the input (no remaining message), update input and stop
      if (!processedInput.trim() || processedInput.startsWith('[')) {
        setInput(processedInput);
        return;
      }
      setInput(processedInput);
    }

    const settings = useSettingsStore.getState();
    if (!settings.apiKey) {
      setError('请先在设置中配置API');
      return;
    }

    const result = buildPromptMessages();
    if (!result) return;

    // Send directly — no prompt viewer
    await handleSendFromPreview(result.messages);
  };

  const handleSendFromPreview = async (editedMessages: AssembledMessage[]) => {
    setShowPreview(false);
    const settings = useSettingsStore.getState();
    const trimmed = input.trim();

    setLoading(true);
    setError('');
    pushLog('info', `发送API请求 — 模型: ${settings.apiModel}, 消息数: ${editedMessages.length}, ~${estimateTokens(JSON.stringify(editedMessages))} tokens`);

    try {
      const response = await sendChatCompletion(
        editedMessages,
        DEFAULT_PRESET,
        settings.apiBaseUrl,
        settings.apiKey,
        settings.apiModel,
        false,
      );

      // Extract variables from LLM response
      const mvuSettings = useSettingsStore.getState();
      let cleanedText: string;
      if (mvuSettings.mvuUseIndependentApi && mvuSettings.mvuApiKey) {
        try {
          const result = await extractVariablesWithLLM(
            response.content,
            mvuSettings.mvuApiBaseUrl,
            mvuSettings.mvuApiKey,
            mvuSettings.mvuApiModel,
            mvuSettings.mvuTemperature,
            mvuSettings.mvuRetryCount,
          );
          cleanedText = result.cleanedText;
          // Merge extracted variables
          const st = useVariableStore.getState();
          const { mergeVariables } = await import('../../sillytavern/variables');
          st.processResponse(response.content); // also runs regex extraction as baseline
          // Override with LLM-extracted variables
          for (const [name, value] of Object.entries(result.variables)) {
            st.setVariable(name, value, 'llm');
          }
        } catch {
          // Fallback to regex extraction
          const result = useVariableStore.getState().processResponse(response.content);
          cleanedText = result.cleanedText;
        }
      } else {
        const result = useVariableStore.getState().processResponse(response.content);
        cleanedText = result.cleanedText;
      }

      pushLog('info', `API响应成功 — 长度: ${response.content.length} 字符`);
      const newPage = parseLlmResponse(cleanedText, trimmed);
      if (!newPage) {
        throw new Error('无法解析AI回复');
      }

      useBookStore.getState().appendPage(newPage);
      pushLog('info', `新页面已生成 — ${newPage.leftHeader}`);
      useBookStore.getState().autoFlipForward();
      setInput('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI请求失败';
      pushLog('error', `API请求失败: ${message}`);
      setError(message);
    } finally {
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
      <footer style={{
        display: 'flex', flexDirection: 'column', flexShrink: 0,
        borderTop: '1px solid rgba(196,168,85,0.15)',
        background: 'rgba(13,10,7,0.85)', backdropFilter: 'blur(8px)',
      }}>
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

          <input
            type="text"
            value={input}
            onChange={(e) => { setInput(e.target.value); if (error) setError(''); }}
            onKeyDown={handleKeyDown}
            placeholder="输入行动或对话..."
            disabled={loading}
            style={{
              flex: 1, padding: '10px 16px',
              border: '1px solid var(--brass)', borderRadius: 3,
              background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)',
              fontFamily: 'var(--font-ui)', fontSize: 14, letterSpacing: 1,
              outline: 'none', caretColor: 'var(--gold)',
              opacity: loading ? 0.5 : 1,
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--brass)'; }}
          />
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

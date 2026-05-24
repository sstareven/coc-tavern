import { useState } from 'react';
import { useBookStore } from '../../stores/useBookStore';
import { usePanelStore } from '../../stores/usePanelStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { useLorebookStore } from '../../stores/useLorebookStore';
import { useCharSheetStore } from '../../stores/useCharSheetStore';
import { assemblePrompt, matchLoreEntries } from '../../sillytavern/prompt-assembler';
import { sendChatCompletion } from '../../sillytavern/api-router';
import type { BookPage, ChatPreset, LoreEntry } from '../../types';

const FORMAT_INSTRUCTION = `你必须严格以JSON格式回复，不要包含任何其他文字。JSON格式如下：
{
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
必须提供恰好4个选项。`;

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
请始终以叙事者的身份进行回复，保持悬疑和恐怖的氛围。`,
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
  return relevantPages
    .map((p) => `【${p.leftHeader}】${p.leftContent}\n【${p.rightHeader}】${p.rightContent}`)
    .join('\n\n');
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
    };
  } catch {
    // JSON parse failed — use the raw text as narrative with default choices
    return {
      leftHeader: userAction,
      leftContent: raw,
      leftPage: computeNextPageNumber(),
      rightHeader: '行动',
      rightContent: '接下来你打算怎么做？',
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

  const submit = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const settings = useSettingsStore.getState();
    if (!settings.apiKey) {
      setError('请先在设置中配置API');
      return;
    }

    setLoading(true);
    setError('');

    try {
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

      // Build character variables
      const variables = buildCharacterVariables();

      // Assemble prompt messages
      const messages = assemblePrompt(
        trimmed,
        [], // chat history — we use page context instead
        DEFAULT_PRESET,
        matchedLore,
        variables,
        FORMAT_INSTRUCTION,
      );

      // Call the LLM API
      const response = await sendChatCompletion(
        messages,
        DEFAULT_PRESET,
        settings.apiBaseUrl,
        settings.apiKey,
        settings.apiModel,
        false, // non-streaming for structured JSON reliability
      );

      // Parse response into a BookPage
      const newPage = parseLlmResponse(response.content, trimmed);
      if (!newPage) {
        throw new Error('无法解析AI回复');
      }

      // Append new page and auto-flip
      useBookStore.getState().appendPage(newPage);

      // Clear input and loading state
      setInput('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI请求失败';
      setError(message);
    } finally {
      setLoading(false);
    }
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
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 24px',
      }}>
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
        <button onClick={toggleDiceHistory} title="检定记录" style={{
          padding: '10px 12px', border: '1px solid var(--brass)',
          background: 'rgba(0,0,0,0.2)', color: 'var(--ink-subtle)',
          fontFamily: 'var(--font-display)', fontSize: 14,
          borderRadius: 3, cursor: 'pointer', transition: 'var(--transition-smooth)',
        }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--gold)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'var(--brass)'; }}
        >
          &#9861;
        </button>
        <button onClick={submit} disabled={loading} style={{
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
  );
}

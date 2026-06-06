// 作者伙伴 — CompanionChat:自然语言对话产 ScenarioPatch,带「变更预览」接受/拒绝
import { useEffect, useRef, useState } from 'react';
import type { ScenarioDoc, ScenarioPatch } from '../../types/scenario';
import { validateScenarioPatch } from '../../scenario/scenario-patch';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { callDsSubagent } from '../../sillytavern/subagent-call';
import { IconCheck } from '../Layout/TabIcons';

const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

interface Props {
  scn: ScenarioDoc;
  onApplyPatch: (patch: ScenarioPatch) => void;
  // 折叠抽屉模式(<800px 视口)时由外层控制布局
  compact?: boolean;
}

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  pendingPatch?: ScenarioPatch;
  applied?: boolean;
  rejected?: boolean;
}

const SYSTEM_PROMPT = [
  '你是 COC 调查员叙事游戏的剧本编辑助手「作者伙伴」。',
  '用户会以自然语言描述对当前剧本的修改诉求,你必须把诉求翻译为 ScenarioPatch JSON,并附一句中文回复说明做了什么。',
  '严格遵守:',
  '1. 仅返回单个合法 JSON 对象,不要外层 markdown 围栏、不要解释、不要任何前缀后缀文本。',
  '2. JSON 必须包含两个键:',
  '   - "reply": string — 给用户的一句中文摘要(不超过 80 字)。',
  '   - "patch": ScenarioPatch — 变更包,字段全部可选,见下方 schema。',
  '3. ScenarioPatch schema(字段全部可选,只填要改的):',
  '   {',
  '     upsertEntries?: ScenarioEntry[],',
  '     removeEntryIds?: string[],',
  '     recategorize?: { id: string; category: "地点"|"人物"|"势力"|"物品线索"|"暗线"|"秘密与解锁" }[],',
  '     setCachePolicies?: { id: string; cachePolicy: "static_prefix"|"dynamic_suffix"|"auto" }[],',
  '     upsertDarkTimeline?: DarkPhase[],',
  '     upsertBadEndings?: BadEnding[],',
  '     patchMeta?: Partial<ScenarioMeta>,',
  '     patchCharacters?: ScenarioCharacter[]',
  '   }',
  '4. ScenarioEntry 必须字段:id, category, comment, keys(逗号分隔), content, constant, position(0~4), priority, cachePolicy。',
  '5. EJS 标签 <% %> 原样保留;字符串字段一律简体中文。',
].join('\n');

function newMsgId(): string {
  return `m_${Date.now().toString(36)}${Math.floor(Math.random() * 36 ** 3).toString(36)}`;
}

// 把 LLM 自由文本里第一个 { 到最后一个 } 抠出来 parse;失败返 null
function extractFirstJson(content: string): unknown {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) return null;
  try {
    return JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
}

// 总览 patch 改了什么 — 列 +N/-N/改 N + 概要
function summarizePatch(p: ScenarioPatch): string[] {
  const lines: string[] = [];
  if (p.upsertEntries?.length) lines.push(`+/改 条目 ×${p.upsertEntries.length}`);
  if (p.removeEntryIds?.length) lines.push(`- 条目 ×${p.removeEntryIds.length}`);
  if (p.recategorize?.length) lines.push(`改分类 ×${p.recategorize.length}`);
  if (p.setCachePolicies?.length) lines.push(`改缓存策略 ×${p.setCachePolicies.length}`);
  if (p.upsertDarkTimeline?.length) lines.push(`+/改 暗线阶段 ×${p.upsertDarkTimeline.length}`);
  if (p.upsertBadEndings?.length) lines.push(`+/改 坏结局 ×${p.upsertBadEndings.length}`);
  if (p.patchMeta) lines.push(`改元信息(${Object.keys(p.patchMeta).join(', ')})`);
  if (p.patchCharacters?.length) lines.push(`+/改 角色 ×${p.patchCharacters.length}`);
  return lines.length === 0 ? ['(空 patch)'] : lines;
}

export function CompanionChat({ scn, onApplyPatch, compact }: Props): React.ReactElement {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 自动滚到底:消息变化后下一帧滚
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages.length]);

  const send = async (): Promise<void> => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    const userMsg: ChatMsg = { id: newMsgId(), role: 'user', content: text };
    setMessages((m) => [...m, userMsg]);
    setBusy(true);

    try {
      // 把当前剧本摘要拼进 user prompt:meta + 条目列表头几个字段 + 暗线/坏结局 id
      const snapshot = {
        meta: scn.meta,
        entries: scn.entries.map((e) => ({
          id: e.id,
          category: e.category,
          comment: e.comment,
          keys: e.keys,
          constant: e.constant,
        })),
        darkTimelineIds: scn.darkTimeline.map((p) => ({ id: p.id, threshold: p.threshold, title: p.title })),
        badEndingIds: scn.badEndings.map((b) => ({ id: b.id, condition: b.condition.slice(0, 60) })),
        characterIds: scn.characters.map((c) => ({ id: c.id, role: c.role })),
      };
      const userPayload = [
        '当前剧本摘要(只读快照):',
        JSON.stringify(snapshot, null, 2),
        '',
        '用户诉求:',
        text,
        '',
        '请输出 { "reply": "...", "patch": { ... } } 单个 JSON 对象。',
      ].join('\n');

      const { apiBaseUrl, apiKey, apiModel } = useSettingsStore.getState();
      const { content } = await callDsSubagent({
        apiBaseUrl,
        apiKey,
        model: apiModel,
        temperature: 0.7,
        maxTokens: 20000,
        rpmLane: 'rewrite',
        label: 'scenario:CompanionChat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPayload },
        ],
      });

      const parsed = extractFirstJson(content);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('LLM 未返回合法 JSON');
      }
      const obj = parsed as Record<string, unknown>;
      const reply = typeof obj.reply === 'string' ? obj.reply : '已生成变更包';
      const patch = obj.patch;
      if (!validateScenarioPatch(patch)) {
        throw new Error('patch 校验未通过,字段不符 ScenarioPatch schema');
      }

      setMessages((m) => [
        ...m,
        { id: newMsgId(), role: 'assistant', content: reply, pendingPatch: patch },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((m) => [...m, { id: newMsgId(), role: 'error', content: `生成失败:${msg}` }]);
    } finally {
      setBusy(false);
    }
  };

  const accept = (id: string): void => {
    const m = messages.find((x) => x.id === id);
    if (!m || !m.pendingPatch) return;
    onApplyPatch(m.pendingPatch);
    setMessages((arr) => arr.map((x) => (x.id === id ? { ...x, applied: true } : x)));
  };

  const reject = (id: string): void => {
    setMessages((arr) => arr.map((x) => (x.id === id ? { ...x, rejected: true } : x)));
  };

  return (
    <aside
      role="complementary"
      aria-label="作者伙伴"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: compact ? '100%' : 320,
        height: '100%',
        background: 'linear-gradient(180deg, rgba(28,20,12,0.92), rgba(14,10,6,0.96))',
        borderLeft: compact ? 'none' : '1px solid rgba(196,168,85,0.25)',
        borderTop: compact ? '1px solid rgba(196,168,85,0.25)' : 'none',
      }}
    >
      <header
        style={{
          padding: '12px 14px',
          fontSize: 12,
          letterSpacing: 2,
          fontFamily: 'var(--font-ui)',
          color: 'var(--gold)',
          borderBottom: '1px solid rgba(196,168,85,0.18)',
          flexShrink: 0,
        }}
      >
        作者伙伴
      </header>

      {/* 消息列表 */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {messages.length === 0 && <Hint />}
        {messages.map((m) => (
          <MsgBubble key={m.id} msg={m} onAccept={() => accept(m.id)} onReject={() => reject(m.id)} />
        ))}
      </div>

      {/* 输入栏 */}
      <footer
        style={{
          flexShrink: 0,
          padding: 10,
          borderTop: '1px solid rgba(196,168,85,0.18)',
          background: 'rgba(20,14,8,0.6)',
          display: 'flex',
          gap: 8,
          alignItems: 'flex-end',
        }}
      >
        <textarea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl/Cmd+Enter 发送
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={'告诉我你想要的:例如「生 5 个印斯茅斯渔夫」「把暗线再凶一点」「给所有禁书条目加 EJS 解锁」'}
          style={{
            flex: 1,
            padding: '6px 8px',
            fontSize: 12.5,
            lineHeight: 1.55,
            color: 'var(--text-light, #d0c2a0)',
            background: 'rgba(8,5,2,0.55)',
            border: '1px solid rgba(196,168,85,0.25)',
            borderRadius: 2,
            outline: 'none',
            resize: 'none',
            fontFamily: 'var(--font-ui)',
          }}
        />
        <SendButton onClick={() => void send()} busy={busy} disabled={busy || draft.trim().length === 0} />
      </footer>
    </aside>
  );
}

function Hint(): React.ReactElement {
  return (
    <div
      style={{
        margin: 'auto',
        textAlign: 'center',
        color: 'var(--ink, #8a7a52)',
        fontSize: 12,
        fontFamily: 'var(--font-ui)',
        lineHeight: 1.7,
        opacity: 0.85,
      }}
    >
      <div style={{ marginBottom: 8, color: 'var(--gold)', letterSpacing: 2 }}>对话即编辑</div>
      <div>告诉我你想要的:</div>
      <div style={{ opacity: 0.75, marginTop: 4 }}>
        「生 5 个印斯茅斯渔夫」
        <br />
        「把暗线再凶一点」
        <br />
        「给所有禁书条目加 EJS 解锁」
      </div>
    </div>
  );
}

function MsgBubble({
  msg,
  onAccept,
  onReject,
}: {
  msg: ChatMsg;
  onAccept: () => void;
  onReject: () => void;
}): React.ReactElement {
  const isUser = msg.role === 'user';
  const isErr = msg.role === 'error';
  return (
    <div style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
      <div
        style={{
          maxWidth: '85%',
          padding: '8px 12px',
          fontSize: 12.5,
          lineHeight: 1.55,
          color: isErr ? '#e0a0a0' : isUser ? 'var(--gold)' : 'var(--text-light, #d0c2a0)',
          background: isErr
            ? 'rgba(60,20,20,0.4)'
            : isUser
              ? 'rgba(196,168,85,0.12)'
              : 'rgba(20,14,8,0.85)',
          border: `1px solid ${isErr ? '#a05050' : isUser ? 'var(--brass, rgba(196,168,85,0.5))' : 'rgba(196,168,85,0.25)'}`,
          borderRadius: 4,
          fontFamily: 'var(--font-ui)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {msg.content}
        {msg.pendingPatch && (
          <PatchPreview
            patch={msg.pendingPatch}
            applied={!!msg.applied}
            rejected={!!msg.rejected}
            onAccept={onAccept}
            onReject={onReject}
          />
        )}
      </div>
    </div>
  );
}

function PatchPreview({
  patch,
  applied,
  rejected,
  onAccept,
  onReject,
}: {
  patch: ScenarioPatch;
  applied: boolean;
  rejected: boolean;
  onAccept: () => void;
  onReject: () => void;
}): React.ReactElement {
  const lines = summarizePatch(patch);
  return (
    <div
      style={{
        marginTop: 8,
        padding: '8px 10px',
        background: 'rgba(8,5,2,0.55)',
        border: '1px dashed rgba(196,168,85,0.4)',
        borderRadius: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--ink, #8a7a52)', letterSpacing: 1.5 }}>变更预览</div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text-light, #d0c2a0)' }}>
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      {applied ? (
        <div style={{ fontSize: 11, color: 'var(--gold)', letterSpacing: 1, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <IconCheck size={14} />
          <span>已应用</span>
        </div>
      ) : rejected ? (
        <div style={{ fontSize: 11, color: '#d08585', letterSpacing: 1 }}>已拒绝</div>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <SmallBtn primary onClick={onAccept}>接受</SmallBtn>
          <SmallBtn onClick={onReject}>拒绝</SmallBtn>
        </div>
      )}
    </div>
  );
}

function SmallBtn({
  onClick,
  children,
  primary,
}: {
  onClick: () => void;
  children: React.ReactNode;
  primary?: boolean;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '3px 10px',
        fontSize: 11,
        fontFamily: 'var(--font-ui)',
        letterSpacing: 1.2,
        color: primary ? 'var(--gold)' : 'var(--text-light, #d0c2a0)',
        background: primary ? 'rgba(196,168,85,0.18)' : 'transparent',
        border: `1px solid ${primary ? 'var(--gold)' : 'rgba(196,168,85,0.4)'}`,
        borderRadius: 2,
        cursor: 'pointer',
        transition: `transform 160ms ${EASE}, background 200ms ${EASE}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.background = primary ? 'rgba(196,168,85,0.28)' : 'rgba(196,168,85,0.10)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.background = primary ? 'rgba(196,168,85,0.18)' : 'transparent';
      }}
      onMouseDown={(e) => {
        e.currentTarget.style.transform = 'translateY(0) scale(0.97)';
      }}
      onMouseUp={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px) scale(1)';
      }}
    >
      {children}
    </button>
  );
}

function SendButton({
  onClick,
  busy,
  disabled,
}: {
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Ctrl+Enter"
      style={{
        padding: '8px 16px',
        fontFamily: 'var(--font-ui)',
        fontSize: 12,
        letterSpacing: 1.5,
        color: 'var(--gold)',
        background: 'rgba(196,168,85,0.18)',
        border: '1px solid var(--gold)',
        borderRadius: 3,
        cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: `transform 160ms ${EASE}, background 200ms ${EASE}, box-shadow 200ms ${EASE}`,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(196,168,85,0.25)';
        e.currentTarget.style.background = 'rgba(196,168,85,0.28)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.background = 'rgba(196,168,85,0.18)';
      }}
      onMouseDown={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = 'translateY(0) scale(0.97)';
      }}
      onMouseUp={(e) => {
        if (disabled) return;
        e.currentTarget.style.transform = 'translateY(-1px) scale(1)';
      }}
    >
      {busy ? '生成中…' : '发送'}
    </button>
  );
}

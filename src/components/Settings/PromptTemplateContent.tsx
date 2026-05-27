import React from 'react';
import { useTavernHelperStore } from '../../stores/useTavernHelperStore';

export function PromptTemplateContent() {
  const pt = useTavernHelperStore((s) => s.promptTemplate);
  const set = useTavernHelperStore((s) => s.setPromptTemplate);

  const handleReset = () => {
    set({
      enabled: true, generateEnabled: true, generateLoaderEnabled: true,
      injectLoaderEnabled: false, renderEnabled: true, renderLoaderEnabled: true,
      codeBlocksEnabled: true, permanentEvaluation: true, filterChatMessage: true,
      chatDepth: -1, autosaveEnabled: false, preloadWorldinfo: true,
      withContextDisabled: false, debugEnabled: false, invertEnabled: true,
      compileWorkers: false, sandbox: false, cacheEnabled: 0, cacheSize: 64,
      cacheHasher: 'h32ToString',
    });
  };

  return (
    <div>
      {/* Title bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid rgba(196,168,85,0.18)', paddingBottom: 12 }}>
        <h3 style={{ margin: 0, color: 'var(--gold)', fontFamily: 'var(--font-display)', fontSize: 16, letterSpacing: 3 }}>提示词模板</h3>
        <button onClick={handleReset} title="重置为默认值" style={{ background: 'transparent', border: '1px solid var(--brass)', borderRadius: 3, color: 'var(--ink-subtle)', cursor: 'pointer', fontSize: 14, padding: '4px 10px' }}>↻</button>
      </div>

      {/* Extension & Generation */}
      <SectionTitle>扩展与生成</SectionTitle>
      <Checkbox id="pt_enabled" checked={pt.enabled} onChange={(v) => set({ enabled: v })}
        label="是否启用扩展" help="全局开关" />
      <Checkbox id="pt_generate_enabled" checked={pt.generateEnabled} onChange={(v) => set({ generateEnabled: v })}
        label="处理生成内容" help="生成全局开关" />
      <Checkbox id="pt_generate_loader" checked={pt.generateLoaderEnabled} onChange={(v) => set({ generateLoaderEnabled: v })}
        label="生成时注入 GENERATE 世界书条目" help="允许世界书条目的 GENERATE:BEFORE 和 GENERATE:AFTER 注入到生成提示词中" />
      <Checkbox id="pt_inject_loader" checked={pt.injectLoaderEnabled} onChange={(v) => set({ injectLoaderEnabled: v })}
        label="生成时注入 @INJECT 世界书条目" help="允许世界书条目的 @INJECT 注入到生成提示词中。Contributed by kanon0914" />

      <Divider />

      {/* Message & Render */}
      <SectionTitle>消息与渲染处理</SectionTitle>
      <Checkbox id="pt_render_enabled" checked={pt.renderEnabled} onChange={(v) => set({ renderEnabled: v })}
        label="处理保存消息" help="楼层全局开关" />
      <Checkbox id="pt_render_loader" checked={pt.renderLoaderEnabled} onChange={(v) => set({ renderLoaderEnabled: v })}
        label="渲染楼层时注入 RENDER 世界书条目" help="允许世界书条目的 RENDER:BEFORE 和 RENDER:AFTER 注入到楼层消息中。仅影响显示内容，不影响生成。一般用来显示状态栏。" />
      <Checkbox id="pt_code_blocks" checked={pt.codeBlocksEnabled} onChange={(v) => set({ codeBlocksEnabled: v })}
        label="处理代码块" help="允许在处理楼层消息时对 pre 块进行模板处理" />
      <Checkbox id="pt_permanent_eval" checked={pt.permanentEvaluation} onChange={(v) => set({ permanentEvaluation: v })}
        label="处理原始消息内容" help="先对原始消息进行模板处理，会修改原始消息内容。可以避免重复处理楼层消息，建议开启。" />
      <Checkbox id="pt_filter_chat" checked={pt.filterChatMessage} onChange={(v) => set({ filterChatMessage: v })}
        label="生成时忽略楼层消息处理" help="在生成前将楼层消息里的模板语句隐藏，不参与生成。" />
      <div style={rowStyle}>
        <span style={labelStyle}>
          楼层处理最大深度
          <HelpIcon content="仅处理深度小于此值的楼层。-1 表示无限制。" />
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="range" min={-1} max={100} step={1} value={pt.chatDepth}
            onChange={(e) => set({ chatDepth: Number(e.target.value) })}
            style={{ width: 100, accentColor: 'var(--gold)' }} />
          <input type="number" value={pt.chatDepth}
            onChange={(e) => set({ chatDepth: Number(e.target.value) })}
            min={-1} max={100} style={numInput} />
        </div>
      </div>

      <Divider />

      {/* World Book & Control */}
      <SectionTitle>世界书与运行控制</SectionTitle>
      <Checkbox id="pt_autosave" checked={pt.autosaveEnabled} onChange={(v) => set({ autosaveEnabled: v })}
        label="自动保存变量更新" help="模板处理结束后立即保存。一般不需要开启，酒馆也会自行保存的。" />
      <Checkbox id="pt_preload" checked={pt.preloadWorldinfo} onChange={(v) => set({ preloadWorldinfo: v })}
        label="立即加载世界书" help="打开角色卡时立即加载并处理世界书。一般用来初始化变量和 define。" />
      <Checkbox id="pt_with_disabled" checked={pt.withContextDisabled} onChange={(v) => set({ withContextDisabled: v })}
        label="禁用 with 语句块" help="用来解决 getvar is not defined 的问题。开启会导致 define 和 const 冲突。" />
      <Checkbox id="pt_debug" checked={pt.debugEnabled} onChange={(v) => set({ debugEnabled: v })}
        label="控制台显示详细信息" help="控制台显示详细日志。日志非常多。" />
      <Checkbox id="pt_invert" checked={pt.invertEnabled} onChange={(v) => set({ invertEnabled: v })}
        label="GENERATE/RENDER/INJECT 条目禁用视为启用" help="旧设定兼容模式。世界书中的相应条目禁用时视为启用。" />
      <Checkbox id="pt_compile_workers" checked={pt.compileWorkers} onChange={(v) => set({ compileWorkers: v })}
        label="后台编译" help="使用 Web Workers 在后台编译，避免页面卡顿。" />
      <Checkbox id="pt_sandbox" checked={pt.sandbox} onChange={(v) => set({ sandbox: v })}
        label="环境隔离" help="在 iframe 中执行代码，更安全，但性能下降。" />

      <Divider />

      {/* Cache */}
      <SectionTitle>缓存设置（实验性）</SectionTitle>
      <div style={{ fontSize: 9, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)', marginBottom: 8 }}>
        模板编译缓存，可以提速。目前存在一些问题。
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>
          缓存
          <HelpIcon content="模板编译缓存，可以提速性能。目前存在一些问题。" />
        </span>
        <select value={pt.cacheEnabled} onChange={(e) => set({ cacheEnabled: Number(e.target.value) as 0 | 1 | 2 })}
          style={miniSelect}>
          <option value={0}>禁用</option>
          <option value={1}>启用</option>
          <option value={2}>仅世界书</option>
        </select>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>
          缓存大小
          <HelpIcon content="缓存大小限制。0 表示不限制。" />
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input type="range" min={0} max={512} step={8} value={pt.cacheSize}
            onChange={(e) => set({ cacheSize: Number(e.target.value) })}
            style={{ width: 100, accentColor: 'var(--gold)' }} />
          <input type="number" value={pt.cacheSize}
            onChange={(e) => set({ cacheSize: Number(e.target.value) })}
            min={0} max={512} step={8} style={numInput} />
        </div>
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>
          缓存 Hash 函数
          <HelpIcon content="缓存 Hash 算法。不同算法性能会有差异。当前值：h32，还有 h64。" />
        </span>
        <select value={pt.cacheHasher} onChange={(e) => set({ cacheHasher: e.target.value as 'h32ToString' | 'h64ToString' })}
          style={miniSelect}>
          <option value="h32ToString">h32</option>
          <option value="h64ToString">h64</option>
        </select>
      </div>
    </div>
  );
}

// ── Sub-components ──

function SectionTitle({ children }: { children: string }) {
  return (
    <div style={{ fontSize: 9, color: 'var(--gold)', fontFamily: 'var(--font-ui)', letterSpacing: 2, marginTop: 16, marginBottom: 8, textTransform: 'uppercase' }}>{children}</div>
  );
}

function Divider() {
  return <hr style={{ border: 'none', borderTop: '1px solid rgba(196,168,85,0.08)', margin: '12px 0' }} />;
}

function Checkbox({ checked, onChange, label, help }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; help: string }) {
  return (
    <div style={rowStyle}>
      <span style={labelStyle}>
        {label}
        {help && <HelpIcon content={help} />}
      </span>
      <button onClick={() => onChange(!checked)} style={{
        padding: '5px 18px', borderRadius: 3, cursor: 'pointer',
        border: checked ? '1px solid var(--success)' : '1px solid var(--ink-faded)',
        background: checked ? 'rgba(58,107,90,0.15)' : 'rgba(0,0,0,0.2)',
        color: checked ? 'var(--success)' : 'var(--ink-faded)',
        fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 2,
      }}>{checked ? 'ON' : 'OFF'}</button>
    </div>
  );
}

function HelpIcon({ content }: { content: string }) {
  return (
    <span title={content} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 14, height: 14, borderRadius: '50%', border: '1px solid var(--brass)',
      color: 'var(--ink-subtle)', cursor: 'help', fontSize: 9, fontWeight: 'bold',
      fontFamily: 'var(--font-ui)', marginLeft: 4, flexShrink: 0,
    }}>?</span>
  );
}

const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.02)' };
const labelStyle: React.CSSProperties = { fontSize: 11, color: 'var(--text-light)', fontFamily: 'var(--font-ui)', letterSpacing: 1 };
const numInput: React.CSSProperties = { width: 60, padding: '4px 6px', border: '1px solid var(--brass)', borderRadius: 3, background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-mono)', fontSize: 11, textAlign: 'center', outline: 'none' };
const miniSelect: React.CSSProperties = { padding: '4px 8px', border: '1px solid var(--brass)', borderRadius: 3, background: 'rgba(0,0,0,0.3)', color: 'var(--text-light)', fontFamily: 'var(--font-ui)', fontSize: 11, outline: 'none', cursor: 'pointer' };

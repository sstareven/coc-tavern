import { useState, useMemo, useRef } from 'react';
import { useBookStore } from '../../stores/useBookStore';
import { estimateCostCNY, inferModelTier, type ModelTier } from '../../sillytavern/deepseek-cache';

/** 一个数据点：X 轴标签 + 命中/未命中/输出 token + 命中率(%) + 估算费用(¥)。tier 用于双线分组。 */
interface Point { label: string; hit: number; miss: number; output: number; rate: number; cost: number; tier: ModelTier; }

interface Rec { label: string; hit: number; miss: number; output: number; at: number; tier: ModelTier; }

function dayKey(at: number): string {
  if (!at) return '—';
  const d = new Date(at);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function yuan(n: number): string { return `¥${n < 1 ? n.toFixed(4) : n.toFixed(2)}`; }

/** Flash / Pro 双线配色 — 与项目铜金色调一致。 */
const TIER_COLORS: Record<ModelTier, string> = {
  flash: '#7cd1ff', // 冷淡蓝（便宜的轻量模型）
  pro:   '#e8c84a', // 暖金（贵的旗舰模型）
};
const TIER_LABELS: Record<ModelTier, string> = { flash: 'Flash', pro: 'Pro' };

/**
 * 把缓存面板的全部数据序列化成 Markdown 表格（含总览 + 按页明细 + 子调用细分），
 * 供「复制表格」按钮一键写入剪贴板,方便用户直接贴给排错。
 */
function buildCopyText(
  pages: import('../../types').BookPage[],
  totalRate: number,
  totalCost: number,
  totalHit: number,
  totalMiss: number,
  totalOut: number,
  saved: number,
  byTier: { flash: { count: number; hit: number; miss: number; output: number; cost: number };
            pro:   { count: number; hit: number; miss: number; output: number; cost: number } },
): string {
  const lines: string[] = [];
  const yuanS = (n: number) => `¥${n < 1 ? n.toFixed(4) : n.toFixed(2)}`;
  lines.push('=== 缓存命中统计 ===');
  lines.push('');
  lines.push(`总命中率: ${totalRate.toFixed(1)}% · 总费用: ${yuanS(totalCost)} · 缓存省下: ${yuanS(saved)}`);
  lines.push(`Tokens: 命中 ${totalHit.toLocaleString()} / 未命中 ${totalMiss.toLocaleString()} / 输出 ${totalOut.toLocaleString()}`);
  if (byTier.flash.count > 0) {
    const r = byTier.flash.hit + byTier.flash.miss > 0
      ? (byTier.flash.hit / (byTier.flash.hit + byTier.flash.miss)) * 100 : 0;
    lines.push(`Flash: ${byTier.flash.count} 条 · 命中 ${r.toFixed(1)}% · ${yuanS(byTier.flash.cost)} · ↓${byTier.flash.hit.toLocaleString()} ↑${byTier.flash.miss.toLocaleString()} ↗${byTier.flash.output.toLocaleString()}`);
  }
  if (byTier.pro.count > 0) {
    const r = byTier.pro.hit + byTier.pro.miss > 0
      ? (byTier.pro.hit / (byTier.pro.hit + byTier.pro.miss)) * 100 : 0;
    lines.push(`Pro:   ${byTier.pro.count} 条 · 命中 ${r.toFixed(1)}% · ${yuanS(byTier.pro.cost)} · ↓${byTier.pro.hit.toLocaleString()} ↑${byTier.pro.miss.toLocaleString()} ↗${byTier.pro.output.toLocaleString()}`);
  }
  lines.push('');
  lines.push('| 页 | 调用 | 模型 | 命中率 | 命中 | 未命中 | 输出 | 费用 |');
  lines.push('|---|---|---|---:|---:|---:|---:|---:|');

  // 倒序：最新页在前
  const ordered = pages.map((p, i) => ({ p, i })).filter(({ p }) => p.genStats).reverse();
  for (const { p, i } of ordered) {
    const gs = p.genStats!;
    const pageLabel = `第 ${i + 1} 页 · ${p.leftHeader || ''}`.trim();
    const mainHit = gs.cacheHitTokens ?? 0;
    const mainMiss = gs.cacheMissTokens ?? 0;
    const mainOut = gs.completionTokens ?? 0;
    const mainRate = mainHit + mainMiss > 0 ? (mainHit / (mainHit + mainMiss)) * 100 : 0;
    const mainCost = estimateCostCNY(mainHit, mainMiss, mainOut, gs.model);
    lines.push(`| ${pageLabel} | 主回合 | ${gs.model ?? '-'} | ${mainRate.toFixed(1)}% | ${mainHit.toLocaleString()} | ${mainMiss.toLocaleString()} | ${mainOut.toLocaleString()} | ${yuanS(mainCost)} |`);

    for (const s of gs.subCalls ?? []) {
      const sHit = s.hit ?? 0;
      const sMiss = s.miss ?? (s.promptTokens != null && s.hit == null ? s.promptTokens : 0);
      const sOut = s.output ?? 0;
      const sRate = sHit + sMiss > 0 ? (sHit / (sHit + sMiss)) * 100 : 0;
      const sCost = estimateCostCNY(sHit, sMiss, sOut, s.model);
      lines.push(`|  | ${s.label} | ${s.model ?? '-'} | ${sRate.toFixed(1)}% | ${sHit.toLocaleString()} | ${sMiss.toLocaleString()} | ${sOut.toLocaleString()} | ${yuanS(sCost)} |`);
    }
  }
  return lines.join('\n');
}

/** 缓存命中面板：读各书页 genStats 的缓存命中/未命中(删页自动排除、随页持久化)，按页或按天看命中率折线 + 总览 + 估算费用。 */
export function CacheStatsPanel({ onClose }: { onClose: () => void }) {
  const pages = useBookStore((s) => s.pages);
  const [mode, setMode] = useState<'page' | 'day'>('page');
  // 复制反馈：点了按钮 → 2 秒内显示「已复制 ✓」
  const [copied, setCopied] = useState(false);

  // 把每页拆成「(主回合 model_tier 1 个) + (subCalls 按 tier 聚合 1 个 per tier)」的 Rec 数组。
  // 同页同 tier 会被合并(比如主回合是 Pro,Pro 子调用很罕见但会合进同一页 Pro 点)。
  // 这样每页最多产生 2 个 Rec(Pro + Flash),折线图按 tier 分两条曲线、X 轴用公共 page 序列对齐。
  const recs: Rec[] = useMemo(() => {
    const out: Rec[] = [];
    pages.forEach((p, i) => {
      const gs = p.genStats;
      if (!gs) return;
      const label = p.rightPage || p.leftPage || String(i + 1);
      const at = gs.at ?? 0;
      const byTier = new Map<ModelTier, { hit: number; miss: number; output: number }>();

      // 主回合
      const mainHit = gs.cacheHitTokens ?? 0;
      const mainMiss = gs.cacheMissTokens ?? 0;
      const mainOut = gs.completionTokens ?? 0;
      if (mainHit > 0 || mainMiss > 0) {
        const mainTier = inferModelTier(gs.model);
        byTier.set(mainTier, { hit: mainHit, miss: mainMiss, output: mainOut });
      }

      // 子调用按 tier 累加
      for (const s of gs.subCalls ?? []) {
        const sHit = s.hit ?? 0;
        const sMiss = s.miss ?? (s.promptTokens != null && s.hit == null ? s.promptTokens : 0);
        const sOut = s.output ?? 0;
        if (sHit === 0 && sMiss === 0) continue;
        const t = inferModelTier(s.model);
        const cur = byTier.get(t) ?? { hit: 0, miss: 0, output: 0 };
        cur.hit += sHit; cur.miss += sMiss; cur.output += sOut;
        byTier.set(t, cur);
      }

      byTier.forEach((v, t) => {
        out.push({ label, hit: v.hit, miss: v.miss, output: v.output, at, tier: t });
      });
    });
    return out;
  }, [pages]);

  // 总览：按 tier 分组合计 + 全局合计
  const byTier = useMemo(() => {
    const init = (): { hit: number; miss: number; output: number; cost: number; count: number } =>
      ({ hit: 0, miss: 0, output: 0, cost: 0, count: 0 });
    const flash = init(); const pro = init();
    for (const r of recs) {
      const bucket = r.tier === 'flash' ? flash : pro;
      bucket.hit += r.hit; bucket.miss += r.miss; bucket.output += r.output; bucket.count += 1;
      bucket.cost += estimateCostCNY(r.hit, r.miss, r.output, r.tier === 'flash' ? 'deepseek-v4-flash' : 'deepseek-v4-pro');
    }
    return { flash, pro };
  }, [recs]);

  const totalHit = byTier.flash.hit + byTier.pro.hit;
  const totalMiss = byTier.flash.miss + byTier.pro.miss;
  const totalOut = byTier.flash.output + byTier.pro.output;
  const totalRate = totalHit + totalMiss > 0 ? (totalHit / (totalHit + totalMiss)) * 100 : 0;
  const totalCost = byTier.flash.cost + byTier.pro.cost;
  // 若无缓存，未命中=全部输入时按各 tier 的非缓存费率算，反映「缓存省了多少」
  const costNoCacheFlash = estimateCostCNY(0, byTier.flash.hit + byTier.flash.miss, byTier.flash.output, 'deepseek-v4-flash');
  const costNoCachePro   = estimateCostCNY(0, byTier.pro.hit   + byTier.pro.miss,   byTier.pro.output,   'deepseek-v4-pro');
  const saved = (costNoCacheFlash + costNoCachePro) - totalCost;

  // 复制全部数据成 Markdown 表格,贴给排错用。失败时降级为 alert(让用户手动复制)。
  const handleCopy = async () => {
    const text = buildCopyText(pages, totalRate, totalCost, totalHit, totalMiss, totalOut, saved, byTier);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 浏览器拒绝(非 https / 无权限) → 用 prompt 让用户手动 Ctrl+C
      window.prompt('复制下面的内容(Ctrl+C):', text);
    }
  };

  // 折线图数据：保持 tier 分组，让 RateChart 画双线
  const points: Point[] = useMemo(() => {
    const mk = (label: string, hit: number, miss: number, output: number, tier: ModelTier): Point => ({
      label, hit, miss, output, tier,
      rate: hit + miss > 0 ? (hit / (hit + miss)) * 100 : 0,
      cost: estimateCostCNY(hit, miss, output, tier === 'flash' ? 'deepseek-v4-flash' : 'deepseek-v4-pro'),
    });
    if (mode === 'page') return recs.map((r) => mk(String(r.label), r.hit, r.miss, r.output, r.tier));
    // 按天分组——同一天内的 flash 和 pro 各自合计成独立点（双线）
    const byDayTier = new Map<string, { hit: number; miss: number; output: number }>();
    for (const r of recs) {
      const k = `${dayKey(r.at)}|${r.tier}`;
      const e = byDayTier.get(k) ?? { hit: 0, miss: 0, output: 0 };
      e.hit += r.hit; e.miss += r.miss; e.output += r.output; byDayTier.set(k, e);
    }
    return [...byDayTier.entries()].map(([k, v]) => {
      const [label, tier] = k.split('|') as [string, ModelTier];
      return mk(label, v.hit, v.miss, v.output, tier);
    });
  }, [recs, mode]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 850, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* zoom 反向抵消界面缩放(uiScale)：用户开 1.15/1.3/1.5 时数据面板保持 100% 显示,
          否则图表 + 明细被放大反而看着信息密度变低。calc(1/var(...)) 让面板回到自然尺寸。 */}
      <div style={{ background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)', border: '1px solid var(--gold)', borderRadius: 8, padding: '24px 28px', minWidth: 540, maxWidth: 720, width: '94%', maxHeight: '82vh', display: 'flex', flexDirection: 'column', boxShadow: '0 0 80px rgba(0,0,0,0.6)', zoom: 'calc(1 / var(--ui-scale, 1))' as React.CSSProperties['zoom'] }}>
        {/* 标题栏 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, borderBottom: '1px solid rgba(196,168,85,0.18)', paddingBottom: 10, flexShrink: 0 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--gold)', letterSpacing: 4, margin: 0 }}>缓存命中 / CACHE HITS</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={handleCopy}
              title="把全部缓存命中数据(总览 + 按页明细 + 子调用)复制成 Markdown 表格,方便贴给排错"
              style={{
                padding: '4px 10px', border: `1px solid ${copied ? 'var(--gold)' : 'rgba(196,168,85,0.4)'}`,
                borderRadius: 3, background: copied ? 'rgba(196,168,85,0.2)' : 'transparent',
                color: copied ? 'var(--gold)' : 'var(--ink-subtle)',
                fontFamily: 'var(--font-ui)', fontSize: 10, letterSpacing: 2, cursor: 'pointer',
                transition: 'var(--transition-smooth)',
              }}
              onMouseEnter={(e) => { if (!copied) { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--brass)'; } }}
              onMouseLeave={(e) => { if (!copied) { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'rgba(196,168,85,0.4)'; } }}
            >
              {copied ? '已复制 ✓' : '复制表格'}
            </button>
            <button onClick={onClose} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid transparent', borderRadius: 3, background: 'transparent', color: 'var(--ink-subtle)', fontSize: 16, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--brass)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'transparent'; }}>✕</button>
          </div>
        </div>

        {/* 总览 — 全局合计 */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 6, fontFamily: 'var(--font-ui)' }}>
          <Stat label="命中率" value={`${totalRate.toFixed(1)}%`} color="var(--gold)" big />
          <Stat label="估算费用" value={yuan(totalCost)} color="var(--gold)" big />
          <Stat label="命中 tokens" value={totalHit.toLocaleString()} color="#69f0ae" />
          <Stat label="未命中 tokens" value={totalMiss.toLocaleString()} color="#ff7043" />
          <Stat label="输出 tokens" value={totalOut.toLocaleString()} color="#7b9fc1" />
          <Stat label="缓存省下" value={yuan(saved)} color="#69f0ae" />
        </div>

        {/* 按 tier 分项 — 只显示有数据的 tier */}
        {(byTier.flash.count > 0 || byTier.pro.count > 0) && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 6, fontFamily: 'var(--font-ui)' }}>
            {byTier.flash.count > 0 && (
              <TierStat tier="flash" hit={byTier.flash.hit} miss={byTier.flash.miss} output={byTier.flash.output} cost={byTier.flash.cost} count={byTier.flash.count} />
            )}
            {byTier.pro.count > 0 && (
              <TierStat tier="pro" hit={byTier.pro.hit} miss={byTier.pro.miss} output={byTier.pro.output} cost={byTier.pro.cost} count={byTier.pro.count} />
            )}
          </div>
        )}

        <div style={{ fontSize: 9, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)', marginBottom: 12, lineHeight: 1.7 }}>
          按 DeepSeek 2026 标准价估算（每百万 token，单位 ¥）：
          <span style={{ color: TIER_COLORS.flash, marginLeft: 4 }}>Flash 命中 0.02 / 未命中 1 / 输出 2</span>
          <span style={{ margin: '0 6px', color: 'var(--ink-faded)' }}>·</span>
          <span style={{ color: TIER_COLORS.pro }}>Pro 命中 0.025 / 未命中 3 / 输出 6</span>
          。删除的页面不计入；老存档若无模型标记按 Pro 价保守估算。
        </div>

        {/* X 轴模式切换 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {([['page', '按页'], ['day', '按天']] as const).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)}
              style={{ fontSize: 11, fontFamily: 'var(--font-ui)', letterSpacing: 1, padding: '4px 14px', borderRadius: 3, cursor: 'pointer',
                border: `1px solid ${mode === m ? 'var(--gold)' : 'rgba(196,168,85,0.3)'}`,
                background: mode === m ? 'rgba(196,168,85,0.18)' : 'transparent', color: mode === m ? 'var(--gold)' : 'var(--ink-subtle)',
                transition: 'var(--transition-smooth)' }}>{label}</button>
          ))}
        </div>

        {/* 折线图 / 空态 */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          {points.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', fontSize: 12, color: 'var(--ink-faded)', fontStyle: 'italic', fontFamily: 'var(--font-body)' }}>
              暂无缓存数据——当前模型未返回缓存信息（DeepSeek 等支持），或尚未生成新页面。
            </div>
          ) : (
            <>
              <RateChart points={points} xLabel={mode === 'page' ? '页' : '日'} />
              <PageDetailList pages={pages} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** 按页明细：每页一个卡片，展示主回合 + 所有子调用的命中/未命中/输出/费用细分。 */
function PageDetailList({ pages }: { pages: import('../../types').BookPage[] }) {
  const pagesWithStats = pages
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.genStats);
  if (pagesWithStats.length === 0) return null;
  // 倒序：最新页在前
  const ordered = [...pagesWithStats].reverse();

  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(196,168,85,0.2)' }}>
      <div style={{ fontSize: 11, color: 'var(--gold)', letterSpacing: 3, marginBottom: 10, fontFamily: 'var(--font-display)' }}>
        按页明细 / PER-PAGE DETAIL
      </div>
      {/* 内层独立滚动:页数多时不让外层面板被撑长。 */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 8,
        maxHeight: 360, overflowY: 'auto', paddingRight: 6,
        scrollbarWidth: 'thin', scrollbarColor: 'var(--brass) rgba(0,0,0,0.1)',
      }}>
        {ordered.map(({ p, i }) => <PageDetailCard key={p.id ?? i} page={p} pageIdx={i} />)}
      </div>
    </div>
  );
}

function PageDetailCard({ page, pageIdx }: { page: import('../../types').BookPage; pageIdx: number }) {
  const gs = page.genStats!;
  const mainTier: ModelTier = inferModelTier(gs.model);
  const mainHit = gs.cacheHitTokens ?? 0;
  const mainMiss = gs.cacheMissTokens ?? 0;
  const mainOut = gs.completionTokens ?? 0;
  const mainCost = estimateCostCNY(mainHit, mainMiss, mainOut, gs.model);
  const mainRate = mainHit + mainMiss > 0 ? (mainHit / (mainHit + mainMiss)) * 100 : 0;

  const subs = gs.subCalls ?? [];

  // 累计本页总费用：主 + 所有 subCalls。subCalls 用 promptTokens 当未命中兜底（没 hit/miss 拆分时）。
  let pageTotalCost = mainCost;
  for (const s of subs) {
    const sHit = s.hit ?? 0;
    const sMiss = s.miss ?? (s.promptTokens != null && s.hit == null ? s.promptTokens : 0);
    const sOut = s.output ?? 0;
    pageTotalCost += estimateCostCNY(sHit, sMiss, sOut, s.model);
  }

  return (
    <div style={{
      border: `1px solid ${TIER_COLORS[mainTier]}55`,
      borderRadius: 5,
      padding: '8px 12px',
      background: 'rgba(0,0,0,0.18)',
      fontFamily: 'var(--font-ui)',
      fontSize: 11,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ color: 'var(--gold)', fontWeight: 700 }}>
          {page.rightPage || page.leftPage || `第 ${pageIdx + 1} 页`} · {page.leftHeader || '（未命名）'}
        </span>
        <span style={{ color: 'var(--ink-subtle)', fontFamily: 'var(--font-mono)' }}>
          ¥{pageTotalCost < 0.01 ? pageTotalCost.toFixed(4) : pageTotalCost.toFixed(2)}（合计 {1 + subs.length} 次调用）
        </span>
      </div>

      {/* 主回合 */}
      <SubCallRow
        label="主回合"
        tier={mainTier}
        model={gs.model}
        hit={mainHit}
        miss={mainMiss}
        output={mainOut}
        rate={mainRate}
        cost={mainCost}
      />

      {/* 子调用 */}
      {subs.map((s, idx) => {
        const sTier = inferModelTier(s.model);
        const sHit = s.hit ?? 0;
        const sMiss = s.miss ?? (s.promptTokens != null && s.hit == null ? s.promptTokens : 0);
        const sOut = s.output ?? 0;
        const sRate = sHit + sMiss > 0 ? (sHit / (sHit + sMiss)) * 100 : 0;
        const sCost = estimateCostCNY(sHit, sMiss, sOut, s.model);
        return (
          <SubCallRow
            key={idx}
            label={s.label}
            tier={sTier}
            model={s.model}
            hit={sHit}
            miss={sMiss}
            output={sOut}
            rate={sRate}
            cost={sCost}
          />
        );
      })}
    </div>
  );
}

function SubCallRow({
  label, tier, model, hit, miss, output, rate, cost,
}: {
  label: string; tier: ModelTier; model?: string;
  hit: number; miss: number; output: number; rate: number; cost: number;
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(80px, 1fr) auto minmax(120px, auto)',
      alignItems: 'baseline',
      gap: 10,
      padding: '3px 0',
      borderTop: '1px dashed rgba(196,168,85,0.08)',
      fontSize: 10,
      color: 'var(--text-light)',
    }}>
      <span>
        <span style={{ color: TIER_COLORS[tier], fontWeight: 600 }}>{label}</span>
        {model && <span style={{ color: 'var(--ink-faded)', marginLeft: 6, fontSize: 9 }}>· {model}</span>}
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-faded)' }}>
        {hit + miss > 0 ? `${rate.toFixed(0)}%` : '—'}
        <span style={{ marginLeft: 6, color: '#69f0ae' }}>↓{hit.toLocaleString()}</span>
        <span style={{ marginLeft: 4, color: '#ff7043' }}>↑{miss.toLocaleString()}</span>
        <span style={{ marginLeft: 4, color: '#7b9fc1' }}>↗{output.toLocaleString()}</span>
      </span>
      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold)', textAlign: 'right' }}>
        ¥{cost < 0.01 ? cost.toFixed(4) : cost.toFixed(2)}
      </span>
    </div>
  );
}

function Stat({ label, value, color, big }: { label: string; value: string; color: string; big?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 12px', border: '1px solid rgba(196,168,85,0.18)', borderRadius: 5, background: 'rgba(0,0,0,0.15)', minWidth: 80 }}>
      <span style={{ fontSize: 9, color: 'var(--ink-faded)', letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: big ? 19 : 14, fontWeight: 700, color, fontFamily: 'var(--font-display)' }}>{value}</span>
    </div>
  );
}

/** 单 tier 的小卡：N 页 · 命中率 · 费用 —— 让 flash/pro 各自一眼看清。 */
function TierStat({ tier, hit, miss, output, cost, count }: { tier: ModelTier; hit: number; miss: number; output: number; cost: number; count: number }) {
  const rate = hit + miss > 0 ? (hit / (hit + miss)) * 100 : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 12px', border: `1px solid ${TIER_COLORS[tier]}66`, borderRadius: 5, background: `${TIER_COLORS[tier]}10`, minWidth: 180 }}>
      <span style={{ fontSize: 10, color: TIER_COLORS[tier], letterSpacing: 1.5, fontWeight: 700 }}>
        {TIER_LABELS[tier]} · {count} 页 · 命中 {rate.toFixed(1)}%
      </span>
      <span style={{ fontSize: 11, color: 'var(--text-light)', fontFamily: 'var(--font-mono)', lineHeight: 1.6 }}>
        ↓{hit.toLocaleString()} ↑{miss.toLocaleString()} ↗{output.toLocaleString()} · {`¥${cost < 1 ? cost.toFixed(4) : cost.toFixed(2)}`}
      </span>
    </div>
  );
}

/** 命中率折线图——按 tier 分双线（flash 蓝 / pro 金）；鼠标移到图上显示最近点的明细。自绘 SVG。 */
function RateChart({ points, xLabel }: { points: Point[]; xLabel: string }) {
  const W = 600, H = 220, padL = 36, padR = 12, padT = 14, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{ tier: ModelTier; labelIdx: number } | null>(null);

  // 公共 X 轴：所有 label 去重(保持首次出现顺序) → 同一页的 Pro 点与 Flash 点 X 位置对齐。
  // 旧版按各 tier 自己的 N 等分,Flash/Pro 长度不同时两线在同一页错位。
  const xLabels = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const p of points) {
      if (!seen.has(p.label)) { seen.add(p.label); out.push(p.label); }
    }
    return out;
  }, [points]);
  const labelIdx = useMemo(() => {
    const m = new Map<string, number>();
    xLabels.forEach((l, i) => m.set(l, i));
    return m;
  }, [xLabels]);

  const flashPoints = points.filter((p) => p.tier === 'flash');
  const proPoints = points.filter((p) => p.tier === 'pro');

  const xFor = (label: string) =>
    padL + (xLabels.length <= 1 ? innerW / 2 : ((labelIdx.get(label) ?? 0) / (xLabels.length - 1)) * innerW);
  const y = (rate: number) => padT + (1 - rate / 100) * innerH;

  const linePoints = (arr: Point[]) =>
    arr.map((p) => `${xFor(p.label).toFixed(1)},${y(p.rate).toFixed(1)}`).join(' ');

  const step = Math.max(1, Math.ceil(xLabels.length / 10));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const el = svgRef.current; if (!el || xLabels.length === 0) return;
    const r = el.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    const idx = xLabels.length <= 1 ? 0 : Math.round(((vx - padL) / innerW) * (xLabels.length - 1));
    const clamped = Math.max(0, Math.min(xLabels.length - 1, idx));
    const labelAtX = xLabels[clamped];
    // 该 X 位置上同时有 Flash 与 Pro 点时,取离鼠标 Y 更近的(允许在两条线之间切换)
    const yPxRaw = ((e.clientY - r.top) / r.height) * H;
    const fp = flashPoints.find((p) => p.label === labelAtX);
    const pp = proPoints.find((p) => p.label === labelAtX);
    type Cand = { tier: ModelTier; labelIdx: number; dy: number };
    const cf: Cand | null = fp ? { tier: 'flash', labelIdx: clamped, dy: Math.abs(yPxRaw - y(fp.rate)) } : null;
    const cp: Cand | null = pp ? { tier: 'pro', labelIdx: clamped, dy: Math.abs(yPxRaw - y(pp.rate)) } : null;
    const pick = !cf ? cp : !cp ? cf : (cf.dy <= cp.dy ? cf : cp);
    setHover(pick);
  };

  const hoverLabel = hover ? xLabels[hover.labelIdx] : null;
  const hp = hover && hoverLabel
    ? (hover.tier === 'flash' ? flashPoints.find((p) => p.label === hoverLabel) : proPoints.find((p) => p.label === hoverLabel))
    : null;
  const hx = hp ? xFor(hp.label) : 0;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 6, fontSize: 10, fontFamily: 'var(--font-ui)', color: 'var(--ink-faded)' }}>
        {flashPoints.length > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 14, height: 2, background: TIER_COLORS.flash, display: 'inline-block' }} />
            Flash ({flashPoints.length})
          </span>
        )}
        {proPoints.length > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 14, height: 2, background: TIER_COLORS.pro, display: 'inline-block' }} />
            Pro ({proPoints.length})
          </span>
        )}
      </div>

      <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', fontFamily: 'var(--font-mono)' }}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line x1={padL} y1={y(g)} x2={W - padR} y2={y(g)} stroke="rgba(196,168,85,0.12)" strokeWidth={1} />
            <text x={padL - 6} y={y(g) + 3} textAnchor="end" fontSize={9} fill="var(--ink-faded)">{g}%</text>
          </g>
        ))}
        {/* 悬停竖向参考线 */}
        {hp && <line x1={hx} y1={padT} x2={hx} y2={H - padB} stroke="rgba(196,168,85,0.4)" strokeWidth={1} strokeDasharray="3 3" />}
        {/* Flash 线 */}
        {flashPoints.length > 0 && (
          <polyline points={linePoints(flashPoints)} fill="none" stroke={TIER_COLORS.flash} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {/* Pro 线 */}
        {proPoints.length > 0 && (
          <polyline points={linePoints(proPoints)} fill="none" stroke={TIER_COLORS.pro} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {/* 数据点 — 公共 X 轴 */}
        {flashPoints.map((p) => {
          const isHovered = hover?.tier === 'flash' && xLabels[hover.labelIdx] === p.label;
          return (
            <circle key={`f-${p.label}`} cx={xFor(p.label)} cy={y(p.rate)} r={isHovered ? 4.5 : 3}
              fill={isHovered ? '#fff3c4' : TIER_COLORS.flash} stroke="var(--abyss)" strokeWidth={1} />
          );
        })}
        {proPoints.map((p) => {
          const isHovered = hover?.tier === 'pro' && xLabels[hover.labelIdx] === p.label;
          return (
            <circle key={`p-${p.label}`} cx={xFor(p.label)} cy={y(p.rate)} r={isHovered ? 4.5 : 3}
              fill={isHovered ? '#fff3c4' : TIER_COLORS.pro} stroke="var(--abyss)" strokeWidth={1} />
          );
        })}
        {/* X 轴标签 — 用公共 label 序列均匀采样 */}
        {xLabels.map((label, i) => (
          i % step === 0 ? (
            <text key={`xl-${i}`} x={xFor(label)} y={H - 8} textAnchor="middle" fontSize={9} fill="var(--ink-faded)">{label}</text>
          ) : null
        ))}
      </svg>
      {/* 悬停明细 tooltip */}
      {hp && (
        <div style={{
          position: 'absolute', left: `${(hx / W) * 100}%`, top: 18, transform: `translateX(${hx > W * 0.6 ? '-105%' : '8px'})`,
          pointerEvents: 'none', background: 'rgba(20,14,8,0.97)', border: `1px solid ${TIER_COLORS[hp.tier]}`, borderRadius: 5,
          padding: '7px 10px', fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-light)', whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.6)', lineHeight: 1.7, zIndex: 2,
        }}>
          <div style={{ color: TIER_COLORS[hp.tier], fontWeight: 700, marginBottom: 2 }}>{TIER_LABELS[hp.tier]} · {xLabel} {hp.label}</div>
          <div>命中率 <b style={{ color: TIER_COLORS[hp.tier] }}>{hp.rate.toFixed(1)}%</b></div>
          <div><span style={{ color: '#69f0ae' }}>命中</span> {hp.hit.toLocaleString()} · <span style={{ color: '#ff7043' }}>未命中</span> {hp.miss.toLocaleString()}</div>
          <div><span style={{ color: '#7b9fc1' }}>输出</span> {hp.output.toLocaleString()} tokens</div>
          <div style={{ marginTop: 2, borderTop: '1px solid rgba(196,168,85,0.2)', paddingTop: 2 }}>费用 <b style={{ color: TIER_COLORS[hp.tier] }}>{yuan(hp.cost)}</b></div>
        </div>
      )}
    </div>
  );
}

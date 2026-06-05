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

/** 缓存命中面板：读各书页 genStats 的缓存命中/未命中(删页自动排除、随页持久化)，按页或按天看命中率折线 + 总览 + 估算费用。 */
export function CacheStatsPanel({ onClose }: { onClose: () => void }) {
  const pages = useBookStore((s) => s.pages);
  const [mode, setMode] = useState<'page' | 'day'>('page');

  // 仅取主生成且返回了缓存信息的页（删页天然不在 pages 里 → 自动排除）。
  // tier 从 genStats.model 推断；老页 model=undefined → inferModelTier 默认 'pro'。
  const recs: Rec[] = useMemo(() => pages
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.genStats && (p.genStats.cacheHitTokens != null || p.genStats.cacheMissTokens != null))
    .map(({ p, i }) => ({
      label: p.rightPage || p.leftPage || String(i + 1),
      hit: p.genStats!.cacheHitTokens ?? 0,
      miss: p.genStats!.cacheMissTokens ?? 0,
      output: p.genStats!.completionTokens ?? 0,
      at: p.genStats!.at ?? 0,
      tier: inferModelTier(p.genStats!.model),
    })),
  [pages]);

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
      <div style={{ background: 'linear-gradient(180deg, var(--leather) 0%, var(--abyss) 100%)', border: '1px solid var(--gold)', borderRadius: 8, padding: '24px 28px', minWidth: 540, maxWidth: 720, width: '94%', maxHeight: '82vh', display: 'flex', flexDirection: 'column', boxShadow: '0 0 80px rgba(0,0,0,0.6)' }}>
        {/* 标题栏 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, borderBottom: '1px solid rgba(196,168,85,0.18)', paddingBottom: 10, flexShrink: 0 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--gold)', letterSpacing: 4, margin: 0 }}>缓存命中 / CACHE HITS</h3>
          <button onClick={onClose} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid transparent', borderRadius: 3, background: 'transparent', color: 'var(--ink-subtle)', fontSize: 16, cursor: 'pointer', fontFamily: 'var(--font-ui)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--gold)'; e.currentTarget.style.borderColor = 'var(--brass)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-subtle)'; e.currentTarget.style.borderColor = 'transparent'; }}>✕</button>
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
            <RateChart points={points} xLabel={mode === 'page' ? '页' : '日'} />
          )}
        </div>
      </div>
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
  const [hover, setHover] = useState<{ tier: ModelTier; idx: number } | null>(null);

  // 双线分组：保持各 tier 自己的 X 轴序列，按出现顺序排在自己的轴上。
  const flashPoints = points.filter((p) => p.tier === 'flash');
  const proPoints = points.filter((p) => p.tier === 'pro');
  const maxN = Math.max(flashPoints.length, proPoints.length, 1);

  const xFor = (i: number, n: number) =>
    padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (rate: number) => padT + (1 - rate / 100) * innerH;

  // 同一条线沿自己的 N 等分；不同 tier 用各自的 N。这让单 tier 数据时也满布全图。
  const linePoints = (arr: Point[]) => arr.map((p, i) => `${xFor(i, arr.length).toFixed(1)},${y(p.rate).toFixed(1)}`).join(' ');

  const step = Math.max(1, Math.ceil(maxN / 10));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const el = svgRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    // 找最近点：分别在 flash / pro 序列里找；取距离更近者。
    type Cand = { tier: ModelTier; idx: number; dx: number };
    const closest = (arr: Point[], tier: ModelTier): Cand | null => {
      if (arr.length === 0) return null;
      const idx = arr.length <= 1 ? 0 : Math.round(((vx - padL) / innerW) * (arr.length - 1));
      const clamped = Math.max(0, Math.min(arr.length - 1, idx));
      return { tier, idx: clamped, dx: Math.abs(vx - xFor(clamped, arr.length)) };
    };
    const cf = closest(flashPoints, 'flash');
    const cp = closest(proPoints, 'pro');
    const pick = !cf ? cp : !cp ? cf : (cf.dx <= cp.dx ? cf : cp);
    setHover(pick);
  };

  const hp = hover ? (hover.tier === 'flash' ? flashPoints[hover.idx] : proPoints[hover.idx]) : null;
  const hxN = hp ? (hover!.tier === 'flash' ? flashPoints.length : proPoints.length) : 1;
  const hx = hp ? xFor(hover!.idx, hxN) : 0;

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
        {/* 数据点 + X 轴标签 */}
        {flashPoints.map((p, i) => {
          const isHovered = hover?.tier === 'flash' && hover.idx === i;
          return (
            <g key={`f-${i}`}>
              <circle cx={xFor(i, flashPoints.length)} cy={y(p.rate)} r={isHovered ? 4.5 : 3} fill={isHovered ? '#fff3c4' : TIER_COLORS.flash} stroke="var(--abyss)" strokeWidth={1} />
            </g>
          );
        })}
        {proPoints.map((p, i) => {
          const isHovered = hover?.tier === 'pro' && hover.idx === i;
          return (
            <g key={`p-${i}`}>
              <circle cx={xFor(i, proPoints.length)} cy={y(p.rate)} r={isHovered ? 4.5 : 3} fill={isHovered ? '#fff3c4' : TIER_COLORS.pro} stroke="var(--abyss)" strokeWidth={1} />
            </g>
          );
        })}
        {/* X 轴标签 — 用 Pro 系列或 Flash 系列里更长的那条做基准（让标签密度合理） */}
        {(proPoints.length >= flashPoints.length ? proPoints : flashPoints).map((p, i, arr) => (
          i % step === 0 ? (
            <text key={`xl-${i}`} x={xFor(i, arr.length)} y={H - 8} textAnchor="middle" fontSize={9} fill="var(--ink-faded)">{p.label}</text>
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

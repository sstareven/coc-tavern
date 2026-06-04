import { useState, useMemo, useRef } from 'react';
import { useBookStore } from '../../stores/useBookStore';
import { estimateCostCNY } from '../../sillytavern/deepseek-cache';

/** 一个数据点：X 轴标签 + 命中/未命中/输出 token + 命中率(%) + 估算费用(¥) */
interface Point { label: string; hit: number; miss: number; output: number; rate: number; cost: number; }

function dayKey(at: number): string {
  if (!at) return '—';
  const d = new Date(at);
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function yuan(n: number): string { return `¥${n < 1 ? n.toFixed(4) : n.toFixed(2)}`; }

/** 缓存命中面板：读各书页 genStats 的缓存命中/未命中(删页自动排除、随页持久化)，按页或按天看命中率折线 + 总览 + 估算费用。 */
export function CacheStatsPanel({ onClose }: { onClose: () => void }) {
  const pages = useBookStore((s) => s.pages);
  const [mode, setMode] = useState<'page' | 'day'>('page');

  // 仅取主生成且返回了缓存信息的页（删页天然不在 pages 里 → 自动排除）。
  const recs = useMemo(() => pages
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.genStats && (p.genStats.cacheHitTokens != null || p.genStats.cacheMissTokens != null))
    .map(({ p, i }) => ({ label: p.rightPage || p.leftPage || String(i + 1), hit: p.genStats!.cacheHitTokens ?? 0, miss: p.genStats!.cacheMissTokens ?? 0, output: p.genStats!.completionTokens ?? 0, at: p.genStats!.at ?? 0 })),
  [pages]);

  const totalHit = recs.reduce((s, r) => s + r.hit, 0);
  const totalMiss = recs.reduce((s, r) => s + r.miss, 0);
  const totalOut = recs.reduce((s, r) => s + r.output, 0);
  const totalRate = totalHit + totalMiss > 0 ? (totalHit / (totalHit + totalMiss)) * 100 : 0;
  const totalCost = estimateCostCNY(totalHit, totalMiss, totalOut);
  // 若无缓存，未命中=全部输入时的费用，用以展示「缓存省了多少」
  const costNoCache = estimateCostCNY(0, totalHit + totalMiss, totalOut);
  const saved = costNoCache - totalCost;

  const points: Point[] = useMemo(() => {
    const mk = (label: string, hit: number, miss: number, output: number): Point => ({
      label, hit, miss, output,
      rate: hit + miss > 0 ? (hit / (hit + miss)) * 100 : 0,
      cost: estimateCostCNY(hit, miss, output),
    });
    if (mode === 'page') return recs.map((r) => mk(String(r.label), r.hit, r.miss, r.output));
    const byDay = new Map<string, { hit: number; miss: number; output: number }>();
    for (const r of recs) {
      const k = dayKey(r.at);
      const e = byDay.get(k) ?? { hit: 0, miss: 0, output: 0 };
      e.hit += r.hit; e.miss += r.miss; e.output += r.output; byDay.set(k, e);
    }
    return [...byDay.entries()].map(([label, v]) => mk(label, v.hit, v.miss, v.output));
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

        {/* 总览 */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 6, fontFamily: 'var(--font-ui)' }}>
          <Stat label="命中率" value={`${totalRate.toFixed(1)}%`} color="var(--gold)" big />
          <Stat label="估算费用" value={yuan(totalCost)} color="var(--gold)" big />
          <Stat label="命中 tokens" value={totalHit.toLocaleString()} color="#69f0ae" />
          <Stat label="未命中 tokens" value={totalMiss.toLocaleString()} color="#ff7043" />
          <Stat label="输出 tokens" value={totalOut.toLocaleString()} color="#7b9fc1" />
          <Stat label="缓存省下" value={yuan(saved)} color="#69f0ae" />
        </div>
        <div style={{ fontSize: 9, color: 'var(--ink-faded)', fontFamily: 'var(--font-ui)', marginBottom: 12 }}>
          按 DeepSeek 标准价估算（输入命中¥0.5 / 未命中¥2 / 输出¥8 每百万 token），仅供参考；删除的页面不计入。
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

/** 命中率折线图（0–100%）；鼠标移到图上显示最近点的 token 明细与费用。自绘 SVG。 */
function RateChart({ points, xLabel }: { points: Point[]; xLabel: string }) {
  const W = 600, H = 220, padL = 36, padR = 12, padT = 14, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const n = points.length;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (rate: number) => padT + (1 - rate / 100) * innerH;
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.rate).toFixed(1)}`).join(' ');
  const step = Math.max(1, Math.ceil(n / 10));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const el = svgRef.current; if (!el || n === 0) return;
    const r = el.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W; // client px → viewBox x（zoom 下同上下文，比例一致）
    const idx = n <= 1 ? 0 : Math.round(((vx - padL) / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, idx)));
  };

  const hp = hover != null ? points[hover] : null;
  const hx = hover != null ? x(hover) : 0;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
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
        <polyline points={line} fill="none" stroke="var(--gold)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.rate)} r={hover === i ? 4.5 : 3} fill={hover === i ? '#fff3c4' : 'var(--gold)'} stroke="var(--abyss)" strokeWidth={1} />
            {i % step === 0 && <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={9} fill="var(--ink-faded)">{p.label}</text>}
          </g>
        ))}
      </svg>
      {/* 悬停明细 tooltip（百分比定位，随视口缩放一致） */}
      {hp && (
        <div style={{
          position: 'absolute', left: `${(hx / W) * 100}%`, top: 0, transform: `translateX(${hx > W * 0.6 ? '-105%' : '8px'})`,
          pointerEvents: 'none', background: 'rgba(20,14,8,0.97)', border: '1px solid var(--gold)', borderRadius: 5,
          padding: '7px 10px', fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-light)', whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.6)', lineHeight: 1.7, zIndex: 2,
        }}>
          <div style={{ color: 'var(--gold)', fontWeight: 700, marginBottom: 2 }}>{xLabel} {hp.label}</div>
          <div>命中率 <b style={{ color: 'var(--gold)' }}>{hp.rate.toFixed(1)}%</b></div>
          <div><span style={{ color: '#69f0ae' }}>命中</span> {hp.hit.toLocaleString()} · <span style={{ color: '#ff7043' }}>未命中</span> {hp.miss.toLocaleString()}</div>
          <div><span style={{ color: '#7b9fc1' }}>输出</span> {hp.output.toLocaleString()} tokens</div>
          <div style={{ marginTop: 2, borderTop: '1px solid rgba(196,168,85,0.2)', paddingTop: 2 }}>费用 <b style={{ color: 'var(--gold)' }}>{yuan(hp.cost)}</b></div>
        </div>
      )}
    </div>
  );
}

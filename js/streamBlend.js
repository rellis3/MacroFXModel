// streamBlend.js — combine two independent daily return streams into one book and
// measure whether the DIVERSIFICATION helps (the one free lunch the map endorses:
// "diversification IS the edge", CLAUDE.md). Built for the momentum × reversion
// question — daily trend-following vs the intraday per-line fade — but pure and
// stream-agnostic: feed any two date→return series.
//
// It does NOT create edge. It measures whether blending two existing edges yields
// a higher risk-adjusted return than either alone, which happens when their
// returns are lowly/negatively correlated (their drawdowns don't coincide).
//
// Pure, no-network, unit-tested in js/streamBlend.test.mjs on synthetic streams
// with a KNOWN correlation. Returns daily-return math annualised ×252.

const DAY = 252;

const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
function stdev(a, ddof = 1) {
  const n = a.length; if (n <= ddof) return 0;
  const m = mean(a); let s = 0;
  for (const x of a) s += (x - m) ** 2;
  return Math.sqrt(s / (n - ddof));
}
function annStats(rets) {
  const r = rets.filter(Number.isFinite);
  const mu = mean(r), sd = stdev(r, 1);
  return {
    n: r.length,
    annReturn: +(mu * DAY * 100).toFixed(2),   // %
    annVol:    +(sd * Math.sqrt(DAY) * 100).toFixed(2),
    sharpe:    +(sd > 0 ? (mu / sd) * Math.sqrt(DAY) : 0).toFixed(3),
  };
}
function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const ma = mean(a), mb = mean(b);
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; sab += da * db; saa += da * da; sbb += db * db; }
  return (saa > 0 && sbb > 0) ? +(sab / Math.sqrt(saa * sbb)).toFixed(4) : null;
}

/**
 * Align two date→return maps (or {date,ret}[] arrays) onto their COMMON dates.
 * Returns { dates, a, b, droppedA, droppedB } — only dates present in BOTH survive,
 * because a correlation/blend across mismatched calendars is meaningless.
 */
export function alignByDate(streamA, streamB) {
  const toMap = s => s instanceof Map ? s
    : Array.isArray(s) ? new Map(s.map(x => [x.date, x.ret ?? x.pnl ?? x.value])) : new Map(Object.entries(s));
  const ma = toMap(streamA), mb = toMap(streamB);
  const common = [...ma.keys()].filter(d => mb.has(d)).sort((x, y) => (x < y ? -1 : 1));
  const a = common.map(d => Number(ma.get(d)));
  const b = common.map(d => Number(mb.get(d)));
  return { dates: common, a, b, droppedA: ma.size - common.length, droppedB: mb.size - common.length };
}

// Blended daily series at weight w on A (1-w on B), both already date-aligned.
const blendSeries = (a, b, w) => a.map((x, i) => w * x + (1 - w) * b[i]);

/**
 * Full blend report on two ALIGNED daily-return arrays (same length, date-matched).
 *  - corr                    : return correlation (the crux — negative = strong diversification)
 *  - a / b                   : per-stream annualised {annReturn, annVol, sharpe}
 *  - grid                    : blended stats across weights 0..1
 *  - maxSharpe               : weight maximising blended Sharpe on this sample (in-sample — report honestly)
 *  - riskParity              : weight equalising each stream's risk contribution (no return look-ahead)
 *  - equalWeight             : the 50/50 blend (the honest default; maxSharpe is optimistic)
 *  - diversificationRatio    : weighted-avg vol ÷ blended vol at equal weight (>1 = diversification present)
 */
export function blendReport(a, b, { weights } = {}) {
  if (!a || !b || a.length !== b.length || a.length < 20)
    return { ok: false, error: `need ≥20 aligned observations, got ${a?.length ?? 0}` };

  const grid = (weights || [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]).map(w => {
    const s = annStats(blendSeries(a, b, w));
    return { w: +w.toFixed(2), sharpe: s.sharpe, annReturn: s.annReturn, annVol: s.annVol };
  });
  const maxSharpe = grid.reduce((best, g) => (g.sharpe > best.sharpe ? g : best), grid[0]);

  // Risk-parity weight: w such that w·σ_a = (1-w)·σ_b  ⇒  w = σ_b / (σ_a + σ_b).
  const sdA = stdev(a, 1), sdB = stdev(b, 1);
  const wRP = (sdA + sdB) > 0 ? sdB / (sdA + sdB) : 0.5;
  const rpStats = annStats(blendSeries(a, b, wRP));

  // Diversification ratio at equal weight: Σ wᵢσᵢ ÷ σ_portfolio. >1 ⇒ real diversification.
  const eqVol = stdev(blendSeries(a, b, 0.5), 1);
  const divRatio = eqVol > 0 ? (0.5 * sdA + 0.5 * sdB) / eqVol : null;

  return {
    ok: true,
    nObs: a.length,
    corr: correlation(a, b),
    a: annStats(a),
    b: annStats(b),
    grid,
    equalWeight: grid.find(g => g.w === 0.5) || annStats(blendSeries(a, b, 0.5)),
    maxSharpe,
    riskParity: { w: +wRP.toFixed(3), sharpe: rpStats.sharpe, annReturn: rpStats.annReturn, annVol: rpStats.annVol },
    diversificationRatio: divRatio == null ? null : +divRatio.toFixed(3),
  };
}

/** Convenience: align two date-keyed streams then report. */
export function blendStreams(streamA, streamB, opts = {}) {
  const al = alignByDate(streamA, streamB);
  const rep = blendReport(al.a, al.b, opts);
  return { ...rep, dates: al.dates.length ? { from: al.dates[0], to: al.dates[al.dates.length - 1] } : null,
           droppedA: al.droppedA, droppedB: al.droppedB };
}

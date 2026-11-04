/**
 * Phase 26: the validation desk (plans/DESK_ANALYST_PIPELINE.md §9ab). Independent of the researchers, it can only
 * reject: a proposal, a system card or a finished harness study has to pass it before it is paper-traded.
 *
 * What the harness (js/harness/runStudy.mjs, js/harness/stats.mjs) already fixes is not repeated here: vol targeting,
 * measured costs, the date-cluster bootstrap, BH-FDR, the deflated Sharpe and PBO by CSCV. This adds the checks a
 * risk committee would ask for on top:
 *   harnessChecklist   reads a harness output (analysis/output/harness/<id>.json) and lists each gate: pass, fail
 *                      or not applicable, with the number behind it
 *   realityCheck       White's reality check (2000) with the Politis-Romano stationary bootstrap: is the best of N
 *                      strategies better than the benchmark once the search over N is paid for?
 *   costStress         the result at 1x, 1.5x, 2x and 3x the measured costs, and the break-even multiple
 *   paramSensitivity   is the best parameter cell a plateau or a spike? its neighbours against it
 *   tradeMonteCarlo    the trade sequence reshuffled: the spread of drawdowns and outcomes the same trades could give
 *   liveVsBacktest     a live record against what the backtest says it should look like at that sample size
 *   cusum              a one-sided CUSUM on a live R series: has the mean shifted below the backtest's?
 * The bias review (leakage, look-ahead, survivorship, data faults) is a model call (desk/roles/validation_desk.md)
 * on the card or the study, checked against the data-rules skill.
 *
 * Pure. Tested in js/validationDesk.test.mjs.
 */
import { mulberry32 } from './statsCore.js';

const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const sd = a => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const q = (sorted, f) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(f * sorted.length)))];
const r4 = x => (Number.isFinite(x) ? +x.toFixed(4) : null);

/** Stationary bootstrap indices (Politis & Romano 1994), mean block length b. */
export function stationaryIndices(T, b, rng) {
  const p = 1 / Math.max(1, b), idx = new Array(T);
  let i = (rng() * T) | 0;
  for (let t = 0; t < T; t++) { idx[t] = i; i = rng() < p ? (rng() * T) | 0 : (i + 1) % T; }
  return idx;
}

/**
 * White's reality check. excess: T × K matrix (periods × strategies) of each strategy's return minus the benchmark's.
 * Statistic V = max_k √T·mean_k; null distribution from the recentred stationary bootstrap. p small = the best
 * strategy beats the benchmark even after the search. Also reports the naive p of the best one alone (the number a
 * study would report if it forgot the other K-1).
 */
export function realityCheck(excess, { meanBlock = 10, nBoot = 1000, seed = 0x9e3779b9 } = {}) {
  const T = excess?.length ?? 0, K = T ? excess[0].length : 0;
  if (T < 50 || K < 1) return { ok: false, error: `needs >= 50 periods and >= 1 strategy, got ${T} × ${K}` };
  const mu = Array.from({ length: K }, (_, k) => mean(excess.map(r => r[k] || 0)));
  const sq = Math.sqrt(T), V = Math.max(...mu.map(m => sq * m)), best = mu.indexOf(Math.max(...mu));
  const rng = mulberry32(seed >>> 0);
  let geAll = 0, geOne = 0;
  for (let b = 0; b < nBoot; b++) {
    const idx = stationaryIndices(T, meanBlock, rng);
    let vmax = -Infinity, vbest = 0;
    for (let k = 0; k < K; k++) { let s = 0; for (const t of idx) s += excess[t][k] || 0; const v = sq * (s / T - mu[k]); if (v > vmax) vmax = v; if (k === best) vbest = v; }
    if (vmax >= V) geAll++;
    if (vbest >= sq * mu[best]) geOne++;
  }
  return { ok: true, periods: T, strategies: K, best, bestMean: r4(mu[best]), pValue: r4((geAll + 1) / (nBoot + 1)), naiveP: r4((geOne + 1) / (nBoot + 1)), meanBlock, nBoot,
    method: "White's reality check, stationary bootstrap (Politis-Romano), recentred" };
}

const sharpeAnn = (a, ppy) => { const s = sd(a); return s > 0 ? (mean(a) / s) * Math.sqrt(ppy) : NaN; };
/**
 * gross: per-period returns before costs; cost: per-period cost drag (positive numbers, same length). Returns the
 * mean and annualised Sharpe at each multiple, and the multiple at which the mean is zero.
 */
export function costStress(gross, cost, { multiples = [0, 1, 1.5, 2, 3], periodsPerYear = 252 } = {}) {
  if (!gross?.length || gross.length !== cost?.length) return { ok: false, error: 'gross and cost must be the same length' };
  const G = gross.reduce((s, x) => s + x, 0), C = cost.reduce((s, x) => s + x, 0);
  const rows = multiples.map(m => { const net = gross.map((g, i) => g - m * cost[i]); return { multiple: m, mean: r4(mean(net)), sharpe: r4(sharpeAnn(net, periodsPerYear)) }; });
  return { ok: true, rows, breakEven: C > 0 ? r4(G / C) : null, survives2x: C > 0 ? G / C >= 2 : true };
}

/**
 * grid: [{ params: { a: 1, b: 0.5 }, metric }]. For the best cell: its neighbours are the cells one step away on one
 * parameter (the next value up or down in that parameter's sorted values) with the others equal. A plateau keeps
 * most of its value next door; a spike does not.
 */
export function paramSensitivity(grid, { spike = 0.5 } = {}) {
  const g = (grid ?? []).filter(c => Number.isFinite(c?.metric) && c.params);
  if (g.length < 3) return { ok: false, error: 'needs >= 3 cells' };
  const keys = Object.keys(g[0].params), vals = Object.fromEntries(keys.map(k => [k, [...new Set(g.map(c => c.params[k]))].sort((a, b) => (a < b ? -1 : 1))]));
  const best = g.reduce((a, b) => (b.metric > a.metric ? b : a));
  const nb = g.filter(c => c !== best && keys.filter(k => c.params[k] !== best.params[k]).length === 1 && keys.every(k => c.params[k] === best.params[k] || Math.abs(vals[k].indexOf(c.params[k]) - vals[k].indexOf(best.params[k])) === 1));
  const ms = nb.map(c => c.metric).sort((a, b) => a - b), med = ms.length ? (ms.length % 2 ? ms[ms.length >> 1] : (ms[ms.length / 2 - 1] + ms[ms.length / 2]) / 2) : null;
  const ratio = med != null && best.metric > 0 ? med / best.metric : null;
  const positive = g.filter(c => c.metric > 0).length / g.length;
  return { ok: true, cells: g.length, best: { params: best.params, metric: r4(best.metric) }, neighbours: nb.length, neighbourMedian: r4(med), ratio: r4(ratio), shareCellsPositive: r4(positive),
    shape: ratio == null ? 'no neighbours' : ratio >= 1 - spike ? 'plateau' : 'spike' };
}

const maxDD = seq => { let peak = 0, eq = 0, dd = 0; for (const x of seq) { eq += x; if (eq > peak) peak = eq; if (peak - eq > dd) dd = peak - eq; } return dd; };
/** trades: per-trade results (R or %). Bootstrap the trade list: drawdown and total percentiles, P(total < 0). */
export function tradeMonteCarlo(trades, { nSim = 2000, seed = 0x9e3779b9, ruin = null } = {}) {
  const t = (trades ?? []).filter(Number.isFinite), n = t.length;
  if (n < 20) return { ok: false, error: `needs >= 20 trades, got ${n}` };
  const rng = mulberry32(seed >>> 0), dds = [], tots = [];
  let neg = 0, ruined = 0;
  for (let s = 0; s < nSim; s++) {
    const seq = Array.from({ length: n }, () => t[(rng() * n) | 0]), tot = seq.reduce((a, b) => a + b, 0), dd = maxDD(seq);
    dds.push(dd); tots.push(tot); if (tot < 0) neg++; if (ruin != null && dd >= ruin) ruined++;
  }
  dds.sort((a, b) => a - b); tots.sort((a, b) => a - b);
  return { ok: true, trades: n, observedDrawdown: r4(maxDD(t)), drawdown: { p50: r4(q(dds, 0.5)), p95: r4(q(dds, 0.95)), p99: r4(q(dds, 0.99)) },
    total: { p5: r4(q(tots, 0.05)), p50: r4(q(tots, 0.5)), p95: r4(q(tots, 0.95)) }, pLoss: r4(neg / nSim), pRuin: ruin != null ? r4(ruined / nSim) : null };
}

/**
 * live: the live per-trade results; backtest: the backtest's. Where does the live mean sit among the means of
 * same-size samples from the backtest? A low percentile = live is worse than the backtest allows for at that n.
 */
export function liveVsBacktest(live, backtest, { nSim = 4000, seed = 0x9e3779b9 } = {}) {
  const L = (live ?? []).filter(Number.isFinite), B = (backtest ?? []).filter(Number.isFinite);
  if (L.length < 5 || B.length < 30) return { ok: false, error: `needs >= 5 live and >= 30 backtest results (got ${L.length}, ${B.length})` };
  const rng = mulberry32(seed >>> 0), m = mean(L), sims = [];
  for (let s = 0; s < nSim; s++) { let x = 0; for (let i = 0; i < L.length; i++) x += B[(rng() * B.length) | 0]; sims.push(x / L.length); }
  sims.sort((a, b) => a - b);
  const pct = sims.filter(v => v <= m).length / nSim;
  return { ok: true, live: L.length, liveMean: r4(m), backtestMean: r4(mean(B)), band90: [r4(q(sims, 0.05)), r4(q(sims, 0.95))], percentile: r4(pct),
    verdict: pct < 0.05 ? 'below the backtest' : pct > 0.95 ? 'above the backtest' : 'within the backtest' };
}

/** One-sided (downward) CUSUM on a series against a target mean, slack k and threshold h, both in units of σ. */
export function cusum(series, { target = 0, sigma = null, k = 0.5, h = 5 } = {}) {
  const x = (series ?? []).filter(Number.isFinite);
  if (x.length < 10) return { ok: false, error: 'needs >= 10 values' };
  const s0 = sigma ?? sd(x);
  let S = 0, alarmAt = null, peak = 0;
  for (let i = 0; i < x.length; i++) { S = Math.max(0, S + (target - x[i]) / s0 - k); if (S > peak) peak = S; if (alarmAt == null && S > h) alarmAt = i; }
  return { ok: true, n: x.length, stat: r4(S), peak: r4(peak), alarm: alarmAt != null, alarmAt, threshold: h };
}

/**
 * The gates on a harness output. Each: { gate, status: pass|fail|n/a, value, need }. The verdict is 'pass' only when
 * no gate fails; 'fail' lists what failed. These are the desk's promotion gates, not the Evidence Book verdict.
 */
export function harnessChecklist(h, { dsrMin = 0.95, pboMax = 0.5, minTradesOos = 100, minYearsPositive = 0.6 } = {}) {
  if (!h || !Array.isArray(h.cells) || !h.cells.length) return { ok: false, error: 'not a harness output with cells' };
  const prim = h.cells.reduce((a, c) => ((c.primary?.pValue ?? 1) < (a.primary?.pValue ?? 1) ? c : a), h.cells[0]);
  const G = [], add = (gate, ok, value, need) => G.push({ gate, status: ok == null ? 'n/a' : ok ? 'pass' : 'fail', value, need });
  add('costs charged', !!h.costs?.rule, h.costs?.rule ? 'measured spread' : 'none', 'measured costs');
  add('out-of-sample result', prim.pnl?.sharpeOos != null || prim.ic?.oos != null, prim.pnl?.sharpeOos ?? prim.ic?.oos?.obs ?? null, 'an OOS number');
  add('survives FDR across its cells', prim.primary?.passesFdr ?? null, prim.primary?.pValue ?? null, 'BH 10%');
  add('deflated Sharpe', prim.dsr?.dsr != null ? prim.dsr.dsr >= dsrMin : null, prim.dsr?.dsr ?? null, `>= ${dsrMin}`);
  add('PBO (tuned studies)', typeof h.pbo?.pbo === 'number' ? h.pbo.pbo < pboMax : null, h.pbo?.pbo ?? h.pbo?.reason ?? null, `< ${pboMax}`);
  add('walk-forward (fitted studies)', h.walkForward?.applied ? true : null, h.walkForward?.applied ? 'applied' : h.walkForward?.reason ?? null, 'expanding refit');
  const tr = prim.pnl?.tradesOos; add('enough OOS trades', tr != null ? tr >= minTradesOos : null, tr ?? null, `>= ${minTradesOos}`);
  const yp = prim.pnl?.yearsPositiveOos; const [a, b] = String(yp ?? '').split('/').map(Number);
  add('years positive OOS', b ? a / b >= minYearsPositive : null, yp ?? null, `>= ${Math.round(minYearsPositive * 100)}%`);
  const hv = prim.ic?.oosHalves; add('both OOS halves same sign', hv && Number.isFinite(hv.firstHalf) && Number.isFinite(hv.secondHalf) ? Math.sign(hv.firstHalf) === Math.sign(hv.secondHalf) : null, hv ? `${hv.firstHalf} / ${hv.secondHalf}` : null, 'same sign');
  const cg = prim.pnl; add('net of costs still positive', cg?.sharpeOos != null ? cg.sharpeOos > 0 : null, cg ? `${cg.sharpeGrossOos ?? '?'} gross → ${cg.sharpeOos} net` : null, '> 0 net');
  const failed = G.filter(g => g.status === 'fail').map(g => g.gate);
  return { ok: true, id: h.id ?? null, cell: prim.key ?? null, gates: G, failed, verdict: failed.length ? 'fail' : 'pass', effN: h.dependence?.effN ?? null };
}

const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
/** The validation desk's bias review: { verdict: pass|fix|reject, summary, issues[{kind, severity, issue, test}] }. */
export function validateReview(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['reply is not a JSON object'] };
  const verdict = ['pass', 'fix', 'reject'].includes(obj.verdict) ? obj.verdict : null, summary = str(obj.summary, 400);
  if (!verdict || !summary) return { ok: false, errors: ['verdict and summary are required'] };
  const KINDS = ['leakage', 'look-ahead', 'survivorship', 'data-fault', 'multiple-testing', 'costs', 'power', 'regime', 'overfit', 'mechanism', 'other'];
  const issues = (Array.isArray(obj.issues) ? obj.issues : []).slice(0, 12).map(i => ({ kind: KINDS.includes(i?.kind) ? i.kind : 'other', severity: ['high', 'medium', 'low'].includes(i?.severity) ? i.severity : 'medium', issue: str(i?.issue, 400), test: str(i?.test, 300) ?? '' })).filter(i => i.issue);
  if (verdict !== 'pass' && !issues.length) return { ok: false, errors: ['a fix or reject verdict needs its issues'] };
  return { ok: true, value: { verdict, summary, issues, gates: (Array.isArray(obj.gates) ? obj.gates : []).slice(0, 10).map(g => str(g, 240)).filter(Boolean) } };
}

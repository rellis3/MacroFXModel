/**
 * OU Pairs Engine — RESEARCH ONLY. Trades an FX cross spread (two
 * currencies vs USD, e.g. AUD & NZD → AUDNZD) with Leung–Li optimal
 * entry/exit levels (`ouOptimal.js`) and A/Bs it against the ad-hoc
 * benchmark it is meant to replace: enter at |z| ≥ 2 stationary sd, exit when
 * the spread crosses its mean — SAME fit, SAME β, SAME refit schedule, so the
 * only difference is where the bands sit. Frozen rules: MD files/FX_FACTOR_V2_TEST.md §5.
 *
 * Mechanics (no lookahead): the model (β, θ, μ, σ, levels) is fitted on the
 * trailing `fitWindow` closes ending at day i and used to decide at the close
 * of day i; the position earns day i+1's spread change. A refit every
 * `refitEvery` days replaces the model only while FLAT — an open trade keeps
 * the model it was entered on until it exits. Costs: `costBps` of gross
 * notional per side (entry and exit). Trades still open at the end are MARKED
 * TO THE LAST BAR and flagged `open`, never dropped (CLAUDE.md §6.7).
 *
 * Spread units: X = A/A₀ − β·B/B₀ ($1 of A minus $β of B, normalised at the fit
 * window start). Daily return = position × ΔX / (1 + β) (per unit gross).
 */

import { bestBeta, spreadSeries, ouMle, ouOptimalLevels } from './ouOptimal.js';
import { summarizeTrades } from './metricsCore.js';
import { summarizeDaily, verdictVs } from './fxFactorV2.js';

export const OU_PAIRS_DEFAULTS = {
  fitWindow: 252, refitEvery: 63, costBps: 2, r: 0.05, zEntry: 2, allowShort: true,
  isFrac: 0.7, betaLo: 0.05, betaHi: 2.0, betaStep: 0.01, minOosTrades: 30,
  // 'fixed1' (primary): β = 1, i.e. the listed cross itself (AUD/NZD etc.) — one
  // tradeable instrument. 'loglik' (diagnostic): Leung–Li's max-likelihood β.
  // Caveat found in testing: the likelihood rewards LOW increment variance, so
  // it picks a minimum-noise hedge (β < 1 when the legs carry independent
  // noise), leaving a directional leg in the "spread". See FX_FACTOR_V2_TEST.md §5.
  betaMode: 'fixed1',
  // v2.1 exits (2026-09-27, pre-registered in FX_FACTOR_V2_TEST.md §7 after the
  // v2 run left every book stuck in one trade for years). null = off = the frozen
  // v2 behaviour. timeStopHL: exit after k × the entry model's half-life.
  // stopSd: exit if the spread moves a further k stationary sd against entry.
  // After a stop/time exit a side re-arms only once the spread is back inside
  // its entry level (no immediate re-entry into the same move).
  timeStopHL: null, stopSd: null,
};

// The v2.1 exit set — applied identically to the OU book and the ±2σ benchmark.
export const OU_EXITS_V21 = { timeStopHL: 3, stopSd: 2 };

function align(a, b) {
  const mb = new Map(b.map(p => [p.t, p.v]));
  const dates = [], A = [], B = [];
  for (const p of a) if (mb.has(p.t) && p.v > 0 && mb.get(p.t) > 0) { dates.push(p.t); A.push(p.v); B.push(mb.get(p.t)); }
  return { dates, A, B };
}

// Fit a model on A[lo..i], B[lo..i]. mode 'ou' | 'zscore'.
function fitModel(A, B, lo, i, o, mode) {
  const a = A.slice(lo, i + 1), b = B.slice(lo, i + 1);
  let fit;
  if (o.betaMode === 'loglik') fit = bestBeta(a, b, { lo: o.betaLo, hi: o.betaHi, step: o.betaStep });
  else { const f = ouMle(spreadSeries(a, b, 1)); fit = f.mu > 0 && f.sigma > 0 ? { beta: 1, ...f } : null; }
  if (!fit) return null;
  const sd = fit.sigma / Math.sqrt(2 * fit.mu);
  const c = 2 * (o.costBps / 1e4) * (1 + fit.beta);            // round-trip cost in X units
  const m = { a0: a[0], b0: b[0], beta: fit.beta, theta: fit.theta, mu: fit.mu, sigma: fit.sigma, sd, c };
  if (mode === 'zscore') {
    m.long = { entry: fit.theta - o.zEntry * sd, exit: fit.theta };
    m.short = { entry: fit.theta + o.zEntry * sd, exit: fit.theta };
    return m;
  }
  const L = ouOptimalLevels(fit, { c, r: o.r });
  if (!L) return null;
  // Short side: the same problem on −X (θ → −θ), mirrored back.
  const S = ouOptimalLevels({ theta: -fit.theta, mu: fit.mu, sigma: fit.sigma }, { c, r: o.r });
  m.long = { entry: L.entry, exit: L.exit };
  m.short = S ? { entry: -S.entry, exit: -S.exit } : null;
  return m;
}

const X = (m, A, B, i) => A[i] / m.a0 - m.beta * B[i] / m.b0;
// Per-trade risk unit (for R-multiples): one stationary sd of the spread per unit
// gross, in %, from the model the trade was entered on. Varies per trade, so R is
// not a relabelled % return (CLAUDE.md CSV rule).
const riskPct = m => +(m.sd / (1 + m.beta) * 100).toFixed(4);

/**
 * runOuPairs(priceA, priceB, opts) — priceA/B: [{t, v}] (1 unit ccy in USD).
 * Returns { mode, dates, daily, trades[], all/is/oos, tradeStats, refits, skippedFits }.
 */
export function runOuPairs(priceA, priceB, opts = {}) {
  const o = { ...OU_PAIRS_DEFAULTS, ...opts };
  const mode = o.mode === 'zscore' ? 'zscore' : 'ou';
  const { dates, A, B } = align(priceA, priceB);
  const n = dates.length;
  if (n < o.fitWindow + 60) return { error: `insufficient data (${n} common days)` };

  const daily = new Array(n).fill(0);
  const trades = [];
  let model = null, pos = 0, posModel = null, entry = null;
  const armed = { long: true, short: true };
  let refits = 0, skippedFits = 0;

  const close = (i, reason) => {
    daily[i] -= o.costBps / 1e4;
    const pnl = entry.cum - 2 * o.costBps / 1e4;
    trades.push({ side: pos > 0 ? 'long' : 'short', entryDate: dates[entry.i], exitDate: dates[i], bars: i - entry.i,
      pnlPct: +(pnl * 100).toFixed(4), maePct: +(entry.mae * 100).toFixed(4), riskPct: riskPct(posModel), beta: posModel.beta, reason });
    if (reason !== 'target') armed[pos > 0 ? 'long' : 'short'] = false;
    pos = 0; posModel = null; entry = null;
  };

  for (let i = o.fitWindow - 1; i < n; i++) {
    // 1) P&L for day i from the position decided at i−1.
    if (pos !== 0 && i > entry.i) {
      const r = pos * (X(posModel, A, B, i) - X(posModel, A, B, i - 1)) / (1 + posModel.beta);
      daily[i] += r; entry.cum += r; entry.mae = Math.min(entry.mae, entry.cum);
    }
    // 2) Refit on schedule (adopted only while flat).
    if ((i - (o.fitWindow - 1)) % o.refitEvery === 0 || !model) {
      const m = fitModel(A, B, i - o.fitWindow + 1, i, o, mode);
      refits++;
      if (m) model = m; else skippedFits++;
    }
    if (i === n - 1) break;
    // 3) Decide at the close of day i.
    if (pos !== 0) {
      const x = X(posModel, A, B, i), lv = pos > 0 ? posModel.long : posModel.short;
      const adverse = pos * (entry.x - x);                       // > 0 when the spread moved against us
      const hlDays = Math.log(2) / posModel.mu * 252;
      if ((pos > 0 && x >= lv.exit) || (pos < 0 && x <= lv.exit)) close(i, 'target');
      else if (o.stopSd != null && adverse >= o.stopSd * posModel.sd) close(i, 'stop');
      else if (o.timeStopHL != null && i - entry.i >= o.timeStopHL * hlDays) close(i, 'time');
    }
    if (pos === 0 && model) {
      const x = X(model, A, B, i);
      if (!armed.long && x > model.long.entry) armed.long = true;
      if (!armed.short && model.short && x < model.short.entry) armed.short = true;
      if (armed.long && x <= model.long.entry) { pos = 1; posModel = model; entry = { i, x, cum: 0, mae: 0 }; daily[i] -= o.costBps / 1e4; }
      else if (o.allowShort && armed.short && model.short && x >= model.short.entry) { pos = -1; posModel = model; entry = { i, x, cum: 0, mae: 0 }; daily[i] -= o.costBps / 1e4; }
    }
  }
  if (pos !== 0) {                                   // mark to the last bar, never drop
    const pnl = entry.cum - o.costBps / 1e4;
    trades.push({ side: pos > 0 ? 'long' : 'short', entryDate: dates[entry.i], exitDate: dates[n - 1], bars: n - 1 - entry.i,
      pnlPct: +(pnl * 100).toFixed(4), maePct: +(entry.mae * 100).toFixed(4), riskPct: riskPct(posModel), beta: posModel.beta, reason: 'open-marked-to-last-bar', open: true });
  }

  const start = o.fitWindow - 1;                      // first decision day (entry cost lands here)
  const live = daily.slice(start), liveDates = dates.slice(start);
  const split = Math.floor(live.length * o.isFrac);
  const splitDate = liveDates[split] ?? null;
  const oosTrades = trades.filter(t => t.entryDate >= splitDate);
  const ts = arr => summarizeTrades(arr.map(t => t.pnlPct), arr.map(t => t.entryDate));
  return {
    mode, params: o, first: liveDates[0], last: liveDates[liveDates.length - 1], splitDate,
    dates: liveDates, daily: live,
    all: summarizeDaily(live), is: summarizeDaily(live.slice(0, split)), oos: summarizeDaily(live.slice(split)),
    tradeStats: { all: ts(trades), oos: ts(oosTrades) },
    oosTrades: oosTrades.length, openAtEnd: trades.filter(t => t.open).length,
    exitReasons: trades.reduce((m, t) => ((m[t.reason] = (m[t.reason] || 0) + 1), m), {}),
    trades, refits, skippedFits,
    currentModel: model ? { beta: model.beta, theta: +model.theta.toFixed(5), sd: +model.sd.toFixed(5), halfLifeDays: +(Math.log(2) / model.mu * 252).toFixed(1),
      long: model.long, short: model.short } : null,
  };
}

// OU bands vs the ±zEntry benchmark on one pair, with the frozen verdict.
export function compareOuVsZscore(priceA, priceB, opts = {}) {
  const ou = runOuPairs(priceA, priceB, { ...opts, mode: 'ou' });
  const z = runOuPairs(priceA, priceB, { ...opts, mode: 'zscore' });
  if (ou.error || z.error) return { error: ou.error || z.error, ou, zscore: z };
  const min = { ...OU_PAIRS_DEFAULTS, ...opts }.minOosTrades;
  const v = verdictVs(z.oos, ou.oos, { oosRebalances: ou.oosTrades, minOosRebalances: min });
  if (v.verdict === 'too-few-oos-rebalances') v.verdict = 'too-few-oos-trades';
  return { ou, zscore: z, vsZscore: v };
}

// Equal-weight daily book across pairs (common dates), for the pooled verdict.
export function poolDaily(runs, isFrac = OU_PAIRS_DEFAULTS.isFrac) {
  const maps = runs.map(r => new Map(r.dates.map((d, i) => [d, r.daily[i]])));
  const dates = runs[0].dates.filter(d => maps.every(m => m.has(d)));
  const daily = dates.map(d => maps.reduce((s, m) => s + m.get(d), 0) / maps.length);
  const split = Math.floor(dates.length * isFrac);
  return { dates, daily, splitDate: dates[split] ?? null,
    all: summarizeDaily(daily), is: summarizeDaily(daily.slice(0, split)), oos: summarizeDaily(daily.slice(split)) };
}

/**
 * The frozen §5 book: OU vs ±2σ per pair, then the pooled equal-weight verdict.
 * pairs: [{ name, a: [{t,v}], b: [{t,v}] }]. Heavy daily arrays are dropped from
 * the per-pair output (trades + summaries kept) so the result is JSON-friendly.
 */
export function runOuBook(pairs, opts = {}) {
  const o = { ...OU_PAIRS_DEFAULTS, ...opts };
  const per = [], ouRuns = [], zRuns = [];
  for (const p of pairs) {
    const cmp = compareOuVsZscore(p.a, p.b, o);
    if (cmp.error) { per.push({ name: p.name, error: cmp.error }); continue; }
    ouRuns.push(cmp.ou); zRuns.push(cmp.zscore);
    const slim = r => { const { daily, dates, ...rest } = r; return rest; };
    per.push({ name: p.name, ou: slim(cmp.ou), zscore: slim(cmp.zscore), vsZscore: cmp.vsZscore });
  }
  if (!ouRuns.length) return { params: o, pairs: per, error: 'no pair produced a result' };
  const ouPool = poolDaily(ouRuns, o.isFrac), zPool = poolDaily(zRuns, o.isFrac);
  const oosTrades = ouRuns.reduce((s, r) => s + r.oosTrades, 0);
  const v = verdictVs(zPool.oos, ouPool.oos, { oosRebalances: oosTrades, minOosRebalances: o.minOosTrades });
  if (v.verdict === 'too-few-oos-rebalances') v.verdict = 'too-few-oos-trades';
  const strip = p => { const { daily, dates, ...rest } = p; return rest; };
  return { params: o, pairs: per, pooled: { ou: strip(ouPool), zscore: strip(zPool), oosTradesOu: oosTrades, vsZscore: v } };
}

/**
 * FX Factor Book v2 — RESEARCH ONLY. Pre-registered A/B tests of the
 * QuantConnect-derived upgrades (education/quantconnect_*.md) against the
 * incumbent trend and carry baskets. Spec + frozen pass/fail rules:
 * `MD files/FX_FACTOR_V2_TEST.md` — read that before changing any default here.
 *
 * Lego shape: nothing here re-implements a backtest loop. Every variant is a
 * `weightsAt(i, ctx)` sizing selector plugged into the EXISTING engines
 * (`runTrendBasket` / `runCarryBasket`), so costs, the carry accrual, the
 * no-lookahead rebalance and the IS/OOS split stay single-sourced. The math
 * lives in the Tier-1 brick `fxFactorSignals.js`.
 *
 * Variants (ids are stable — the route, page and test doc key on them):
 *   Trend family (runTrendBasket; incumbent T0 = its defaults)
 *     T1   TSMOM-CF: t-stat signal + Yang–Zhang vol + correlation factor
 *     T1a/b/c  ablations: each of the three pieces alone (diagnostic)
 *     T2   incumbent × Carver vol-regime multiplier
 *     T5   residual (ex-dollar) multi-horizon cross-sectional momentum, $-neutral
 *   Carry family (runCarryBasket; incumbent C0 = its defaults)
 *     C1   carry kept only where 63d momentum agrees with the carry sign
 *     C1b  strict carry×momentum double sort (diagnostic; 1-vs-1 on 7 ccys)
 *     C2   incumbent × vol-regime multiplier
 *     C3   incumbent × risk-off gate (VIX/VIX3M, VIX pctl, 10y shock)
 *   Combined (runCarryBasket so the accrual is real)
 *     K1   Carver: 0.6 EWMAC ensemble + 0.4 carry forecast, CF sizing, buffer
 *     K2   K1 × vol-regime multiplier
 *     benchmark for K: 50/50 daily blend of T0 and C0
 *
 * Nothing here is imported by a live bot. Built ≠ works ≠ has edge.
 */

import { stdev } from './statsCore.js';
import { sharpeRatio, sharpeStdError, maxDrawdownFromEquity } from './metricsCore.js';
import { runTrendBasket } from './trendBasketEngine.js';
import { runCarryBasket } from './carryEngine.js';
import {
  tstatTrendAt, yzAnnualVolByDate, mapToDates, correlationFactorAt,
  ewmaVolSeries, volRegimeMultiplierSeries, multiHorizonScoreAt, residualReturnsAt,
  ewmacForecastSeries, combineForecasts, carryForecastSeries, rescaleForecastSeries,
  bufferedWeight, doubleSortSelect, riskGateSeries,
} from './fxFactorSignals.js';

const SQRT252 = Math.sqrt(252);

// Frozen defaults (FX_FACTOR_V2_TEST.md §3). Incumbents use the engines' own defaults.
export const FX_FACTOR_V2_DEFAULTS = {
  trend: { lookback: 252, volWindow: 60, targetVol: 0.10, rebalDays: 5, costBps: 2, isFrac: 0.7 },
  carry: { volWindow: 60, targetVol: 0.10, rebalDays: 21, costBps: 2, isFrac: 0.7 },
  yzWindow: 21, corrWindow: 63, maxCF: 2.5,
  momLookback: 63,
  xs: { k: 2, rebalDays: 21, residWindow: 252, horizons: [63, 126, 189, 252] },
  carver: { speeds: [8, 16, 32, 64], trendWeight: 0.6, carryWeight: 0.4, bufferFrac: 0.1, rebalDays: 1 },
  gateLagDays: 1,
  minOosRebalances: 30,
  // FRED IR3TIB01*M156N are MONTHLY averages stamped on the 1st of the month —
  // only knowable after month-end + publication. The v2 route shifts every rate
  // observation forward by this many days for ALL carry runs (incumbent C0 too),
  // so the A/B is like-for-like and the carry signal is not read early.
  rateLagDays: 60,
  bonferroniZ: 2.54,   // one-sided 0.05 / 9 pre-registered primary tests
};

// Shift a date-keyed Map forward by `days` (publication lag). Pure.
export function lagDateMap(map, days) {
  const out = new Map();
  for (const [d, v] of map) {
    const t = new Date(d + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + days);
    out.set(t.toISOString().slice(0, 10), v);
  }
  return out;
}

// The incumbent engines' own vol estimate at decision index d: stdev of
// rets[d−window .. d−1] (they exclude rets[d]). Used so a hook with every
// switch off reproduces the incumbent EXACTLY (asserted in the tests).
export function incumbentVol(rets, d, window) {
  const w = rets.slice(d - window, d).filter(Number.isFinite);
  return stdev(w, 0) * SQRT252;
}

// Lazily align a per-ccy date-keyed Map onto the engine's calendar (cached).
function lazyAligned(mapsByCcy) {
  let cache = null;
  return (ctx) => {
    if (!cache) {
      cache = {};
      for (const c of Object.keys(mapsByCcy || {})) cache[c] = mapToDates(ctx.dates, mapsByCcy[c]);
    }
    return cache;
  };
}

// ── Trend-family selectors (runTrendBasket ctx: {dates, cols, ccys, rets, weights, perCcyRisk, targetVol, volWindow, lookback}) ──

// TSMOM-CF and its ablations. Every switch off ⇒ identical to the incumbent.
export function makeTsmomWeights({ signal = 'sign', vol = 'incumbent', corrFactor = false, ohlcByCcy = null,
  yzWindow = FX_FACTOR_V2_DEFAULTS.yzWindow, corrWindow = FX_FACTOR_V2_DEFAULTS.corrWindow, maxCF = FX_FACTOR_V2_DEFAULTS.maxCF } = {}) {
  const yzMaps = vol === 'yz' && ohlcByCcy
    ? Object.fromEntries(Object.entries(ohlcByCcy).map(([c, bars]) => [c, yzAnnualVolByDate(bars, yzWindow)]))
    : null;
  const yzAligned = yzMaps ? lazyAligned(yzMaps) : null;
  return (d, ctx) => {
    const { ccys, cols, rets, volWindow, lookback, targetVol, perCcyRisk } = ctx;
    const X = {};
    for (const c of ccys) {
      X[c] = signal === 'tstat'
        ? tstatTrendAt(rets[c], d, lookback)
        : Math.sign(cols[c][d] / cols[c][d - lookback] - 1);
    }
    const scale = corrFactor
      ? targetVol * correlationFactorAt(X, rets, d, { window: corrWindow, maxCF }).cf / ccys.length
      : perCcyRisk;
    const yz = yzAligned ? yzAligned(ctx) : null;
    const w = {};
    for (const c of ccys) {
      // Yang–Zhang where available; the incumbent estimate as the fallback.
      const s = yz && yz[c]?.[d] > 0 ? yz[c][d] : incumbentVol(rets[c], d, volWindow);
      w[c] = s > 1e-6 ? X[c] * scale / s : 0;
    }
    return w;
  };
}

// Multiply any selector's weights by a per-ccy series computed from ctx (cached).
function withPerCcyMultiplier(base, buildSeries) {
  let series = null;
  return (d, ctx) => {
    if (!series) series = buildSeries(ctx);
    const w = base(d, ctx);
    const out = {};
    for (const c of Object.keys(w)) {
      const m = series[c]?.[d];
      out[c] = w[c] * (Number.isFinite(m) ? m : 1);   // pre-registered: no history ⇒ ×1
    }
    return out;
  };
}

// Carver vol-regime multiplier on top of any selector. `retKey` is the ctx field
// holding daily log returns ('rets' for trend, 'spotRet' for carry).
export function withVolRegime(base, { retKey = 'rets' } = {}) {
  return withPerCcyMultiplier(base, ctx => {
    const s = {};
    for (const c of ctx.ccys) s[c] = volRegimeMultiplierSeries(ewmaVolSeries(ctx[retKey][c], 32));
    return s;
  });
}

// Portfolio-level risk-off gate. gateInputs = { vix: Map, vix3m: Map, ust10: Map }
// (date-keyed, FRED). Applied with a strict lag (the gate read at d uses d−lag).
export function withRiskGate(base, gateInputs, { lagDays = FX_FACTOR_V2_DEFAULTS.gateLagDays } = {}) {
  let gate = null;
  return (d, ctx) => {
    if (!gate) {
      const al = k => (gateInputs?.[k] ? mapToDates(ctx.dates, gateInputs[k]) : []);
      gate = riskGateSeries({ vix: al('vix'), vix3m: al('vix3m'), ust10: al('ust10') });
    }
    const g = gate[d - lagDays];
    const m = g ? g.m : 1;
    const w = base(d, ctx);
    return Object.fromEntries(Object.entries(w).map(([c, x]) => [c, x * m]));
  };
}

// Residual (ex-dollar) multi-horizon cross-sectional momentum, dollar-neutral:
// long the top-k, short the bottom-k by score, inverse residual-vol sized, then
// the short leg rescaled so Σw = 0 (no net USD exposure).
export function makeResidualXsWeights({ k = FX_FACTOR_V2_DEFAULTS.xs.k, residWindow = FX_FACTOR_V2_DEFAULTS.xs.residWindow,
  horizons = FX_FACTOR_V2_DEFAULTS.xs.horizons } = {}) {
  return (d, ctx) => {
    const res = residualReturnsAt(ctx.rets, d, residWindow);
    if (!res) return {};
    const score = {}, vol = {};
    for (const c of ctx.ccys) {
      const r = res[c];
      if (!r || r.length < residWindow * 0.8) continue;
      score[c] = multiHorizonScoreAt(r, r.length - 1, horizons);
      vol[c] = stdev(r, 0) * SQRT252;
    }
    const ranked = Object.keys(score).filter(c => Number.isFinite(score[c]) && vol[c] > 0).sort((a, b) => score[b] - score[a]);
    if (ranked.length < 2 * k) return {};
    const per = ctx.targetVol / Math.sqrt(2 * k);
    const w = {};
    let L = 0, S = 0;
    for (const c of ranked.slice(0, k)) { w[c] = per / vol[c]; L += w[c]; }
    for (const c of ranked.slice(-k)) { w[c] = -per / vol[c]; S += -w[c]; }
    if (S > 0) for (const c of ranked.slice(-k)) w[c] *= L / S;
    return w;
  };
}

// ── Carry-family selectors (runCarryBasket ctx: {dates, cols, ccys, spotRet, rCol, fundingCcy, weights, perCcyRisk, targetVol, volWindow}) ──

const carryDiff = (ctx, c, d) => ctx.rCol[c][d] - ctx.rCol[ctx.fundingCcy][d];
const momAt = (r, d, h) => r.slice(d - h + 1, d + 1).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

// C1: keep a carry position only if the currency's own `momLookback` return agrees
// with the carry direction; otherwise flat. Incumbent sizing otherwise.
export function makeCarryMomentumFilterWeights({ momLookback = FX_FACTOR_V2_DEFAULTS.momLookback } = {}) {
  return (d, ctx) => {
    const w = {};
    for (const c of ctx.ccys) {
      const diff = carryDiff(ctx, c, d);
      if (!Number.isFinite(diff) || d + 1 < momLookback) { w[c] = 0; continue; }
      const sig = Math.sign(diff), mom = Math.sign(momAt(ctx.spotRet[c], d, momLookback));
      const s = incumbentVol(ctx.spotRet[c], d, ctx.volWindow);
      w[c] = sig !== 0 && sig === mom && s > 1e-6 ? sig * ctx.perCcyRisk / s : 0;
    }
    return w;
  };
}

// C1b: strict tertile double sort (diagnostic).
export function makeCarryDoubleSortWeights({ momLookback = FX_FACTOR_V2_DEFAULTS.momLookback } = {}) {
  return (d, ctx) => {
    const carry = {}, mom = {};
    for (const c of ctx.ccys) { carry[c] = carryDiff(ctx, c, d); mom[c] = d + 1 >= momLookback ? momAt(ctx.spotRet[c], d, momLookback) : NaN; }
    const { long, short } = doubleSortSelect(carry, mom);
    const w = {};
    for (const c of long) { const s = incumbentVol(ctx.spotRet[c], d, ctx.volWindow); w[c] = s > 1e-6 ? ctx.perCcyRisk / s : 0; }
    for (const c of short) { const s = incumbentVol(ctx.spotRet[c], d, ctx.volWindow); w[c] = s > 1e-6 ? -ctx.perCcyRisk / s : 0; }
    return w;
  };
}

// The incumbent carry rule as a selector (so wrappers can decorate it).
export function makeCarryIncumbentWeights() {
  return (d, ctx) => {
    const w = {};
    for (const c of ctx.ccys) {
      const diff = carryDiff(ctx, c, d);
      if (!Number.isFinite(diff)) { w[c] = ctx.weights[c] || 0; continue; }
      const s = incumbentVol(ctx.spotRet[c], d, ctx.volWindow);
      w[c] = s > 1e-6 ? Math.sign(diff) * ctx.perCcyRisk / s : 0;
    }
    return w;
  };
}
// The incumbent trend rule as a selector.
export const makeTrendIncumbentWeights = () => makeTsmomWeights();

// K1: Carver combined forecast (EWMAC ensemble + carry), CF (≈IDM) sizing, buffer.
export function makeCarverWeights({ speeds = FX_FACTOR_V2_DEFAULTS.carver.speeds,
  trendWeight = FX_FACTOR_V2_DEFAULTS.carver.trendWeight, carryWeight = FX_FACTOR_V2_DEFAULTS.carver.carryWeight,
  bufferFrac = FX_FACTOR_V2_DEFAULTS.carver.bufferFrac, corrWindow = FX_FACTOR_V2_DEFAULTS.corrWindow,
  maxCF = FX_FACTOR_V2_DEFAULTS.maxCF } = {}) {
  let F = null, vol = null;
  return (d, ctx) => {
    if (!F) {
      F = {}; vol = {};
      for (const c of ctx.ccys) {
        const prices = ctx.cols[c];
        vol[c] = ewmaVolSeries(ctx.spotRet[c], 32);
        const trend = combineForecasts(speeds.map(s => ewmacForecastSeries(prices, s)));
        const diff = ctx.dates.map((_, i) => carryDiff(ctx, c, i));
        const carry = rescaleForecastSeries(carryForecastSeries(diff, vol[c]));
        F[c] = combineForecasts([trend, carry], [trendWeight, carryWeight]);
      }
    }
    const sig = {};
    for (const c of ctx.ccys) sig[c] = Number.isFinite(F[c][d]) ? Math.sign(F[c][d]) : 0;
    const { cf } = correlationFactorAt(sig, ctx.spotRet, d, { window: corrWindow, maxCF });
    const N = ctx.ccys.length;
    const w = {};
    for (const c of ctx.ccys) {
      const s = vol[c][d];
      if (!Number.isFinite(F[c][d]) || !(s > 1e-6)) { w[c] = 0; continue; }
      const unit = ctx.targetVol * cf / (N * s);            // position at forecast = 10
      w[c] = bufferedWeight(ctx.weights[c] || 0, (F[c][d] / 10) * unit, bufferFrac * unit);
    }
    return w;
  };
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

// Uniform summary from a daily LOG-return series (one Sharpe/DD definition for
// every variant and blend, via metricsCore).
export function summarizeDaily(r) {
  const x = r.filter(Number.isFinite);
  if (x.length < 2) return { days: x.length, sharpe: 0, annRetPct: 0, volPct: 0, maxDDPct: 0 };
  const eq = []; let c = 0; for (const v of x) { c += v; eq.push(Math.exp(c)); }
  const m = x.reduce((a, b) => a + b, 0) / x.length;
  return {
    days: x.length,
    sharpe: +sharpeRatio(x, 252).toFixed(3),
    annRetPct: +((Math.exp(m * 252) - 1) * 100).toFixed(2),
    volPct: +(stdev(x, 0) * SQRT252 * 100).toFixed(2),
    maxDDPct: +(maxDrawdownFromEquity(eq) * 100).toFixed(2),
  };
}

function splitSummary(dates, r, isFrac) {
  const split = Math.floor(dates.length * isFrac);
  return {
    splitDate: dates[split] ?? null,
    all: summarizeDaily(r), is: summarizeDaily(r.slice(0, split)), oos: summarizeDaily(r.slice(split)),
  };
}

// Noise-aware verdict, same rules as /api/trend-basket's qualityAB (Lo-2002 SE).
export function verdictVs(incOos, varOos, { oosRebalances, minOosRebalances = FX_FACTOR_V2_DEFAULTS.minOosRebalances } = {}) {
  const d = +(varOos.sharpe - incOos.sharpe).toFixed(3);
  const seInc = +sharpeStdError(incOos.sharpe, incOos.days).toFixed(3);
  const seVar = +sharpeStdError(varOos.sharpe, varOos.days).toFixed(3);
  let verdict;
  if (oosRebalances != null && oosRebalances < minOosRebalances) verdict = 'too-few-oos-rebalances';
  else if (Math.abs(d) < seInc) verdict = 'within-noise';
  else if (d <= 0) verdict = 'no-improvement';
  else if (varOos.sharpe < seVar) verdict = 'improves-but-still-null';
  else verdict = 'wins-oos';
  return { deltaOosSharpe: d, seIncumbentOos: seInc, seVariantOos: seVar, verdict };
}

function trendRun(priceByCcy, weightsAt, opts) {
  const r = runTrendBasket(priceByCcy, { ...opts, returnDaily: true, ...(weightsAt ? { weightsAt } : {}) });
  if (r.error) return { error: r.error };
  return { dates: r.dates, daily: r.dailyReturns, equity: r.equity, perYear: r.perYear, currentWeights: r.currentWeights ?? null, rebalDays: opts.rebalDays };
}
function carryRun(priceByCcy, rateByCcy, weightsAt, opts) {
  const r = runCarryBasket(priceByCcy, rateByCcy, { ...opts, returnDaily: true, ...(weightsAt ? { weightsAt } : {}) });
  if (r.error) return { error: r.error };
  return { dates: r.daily.dates, daily: r.daily.ret.map(Math.log1p), equity: r.equity, perYear: r.perYear,
    decomposition: r.decomposition, currentWeights: r.currentWeights ?? null, rebalDays: opts.rebalDays };
}

/**
 * Run every pre-registered variant.
 * data = {
 *   priceByCcy: { EUR: [{t, v}], … }                 closes of 1 ccy in USD (oriented)
 *   ohlcByCcy?: { EUR: [{date, open, high, low, close}], … }   oriented, for Yang–Zhang
 *   rateByCcy?: { USD: Map, EUR: Map, … }             FRED interbank (annual %)
 *   gateInputs?: { vix: Map, vix3m: Map, ust10: Map } FRED daily
 * }
 */
export function runFxFactorV2(input, overrides = {}) {
  let data = input;
  const D = { ...FX_FACTOR_V2_DEFAULTS, ...overrides };
  const T = D.trend, C = D.carry;
  const out = { params: D, families: {}, notes: [] };
  const add = (family, id, label, run, { incumbent = null, preRegistered = true, rebalDays } = {}) => {
    const fam = (out.families[family] ||= { variants: [] });
    if (run.error) { fam.variants.push({ id, label, error: run.error }); return null; }
    const s = splitSummary(run.dates, run.daily, T.isFrac);
    const oosRebalances = Math.floor(s.oos.days / (rebalDays || 1));
    const row = { id, label, preRegistered, ...s, oosRebalances, equity: run.equity, perYear: run.perYear,
      currentWeights: run.currentWeights, decomposition: run.decomposition ?? null };
    if (incumbent) row.vsIncumbent = { incumbent: incumbent.id, ...verdictVs(incumbent.oos, s.oos, { oosRebalances, minOosRebalances: D.minOosRebalances }) };
    fam.variants.push(row);
    return { ...row, daily: run.daily, dates: run.dates };
  };

  // ── Trend family ──
  const t0 = add('trend', 'T0', 'Incumbent trend basket (sign × inverse vol)', trendRun(data.priceByCcy, null, T), { rebalDays: T.rebalDays });
  if (t0) {
    const ohlc = data.ohlcByCcy || null;
    if (!ohlc) out.notes.push('No OHLC supplied — Yang–Zhang variants fall back to the incumbent vol estimate.');
    const tv = (id, label, w, pre = true) => add('trend', id, label, trendRun(data.priceByCcy, w, T), { incumbent: t0, preRegistered: pre, rebalDays: T.rebalDays });
    tv('T1', 'TSMOM-CF: t-stat signal + Yang–Zhang vol + correlation factor', makeTsmomWeights({ signal: 'tstat', vol: 'yz', corrFactor: true, ohlcByCcy: ohlc }));
    tv('T1a', 'Ablation: t-stat signal only', makeTsmomWeights({ signal: 'tstat' }), false);
    tv('T1b', 'Ablation: Yang–Zhang vol only', makeTsmomWeights({ vol: 'yz', ohlcByCcy: ohlc }), false);
    tv('T1c', 'Ablation: correlation factor only', makeTsmomWeights({ corrFactor: true }), false);
    tv('T2', 'Incumbent × vol-regime multiplier', withVolRegime(makeTrendIncumbentWeights()));
    add('trend', 'T5', 'Residual multi-horizon XS momentum ($-neutral)',
      trendRun(data.priceByCcy, makeResidualXsWeights(), { ...T, rebalDays: D.xs.rebalDays }),
      { incumbent: t0, rebalDays: D.xs.rebalDays });
  }

  // ── Carry family ──
  const hasRates = data.rateByCcy && data.rateByCcy.USD;
  if (hasRates && D.rateLagDays > 0) {
    data = { ...data, rateByCcy: Object.fromEntries(Object.entries(data.rateByCcy).map(([c, m]) => [c, lagDateMap(m, D.rateLagDays)])) };
    out.notes.push(`Rates lagged ${D.rateLagDays} days for every carry run (monthly FRED averages are only known after month-end).`);
  }
  let c0 = null;
  if (!hasRates) out.notes.push('No rates supplied — carry and combined families skipped.');
  else {
    c0 = add('carry', 'C0', 'Incumbent carry basket (sign(diff) × inverse vol)', carryRun(data.priceByCcy, data.rateByCcy, null, C), { rebalDays: C.rebalDays });
    if (c0) {
      const cv = (id, label, w, pre = true, opts = C) => add('carry', id, label, carryRun(data.priceByCcy, data.rateByCcy, w, opts), { incumbent: c0, preRegistered: pre, rebalDays: opts.rebalDays });
      cv('C1', 'Carry only where 63d momentum agrees', makeCarryMomentumFilterWeights());
      cv('C1b', 'Strict carry×momentum double sort (1 vs 1 on 7 ccys)', makeCarryDoubleSortWeights(), false);
      cv('C2', 'Incumbent × vol-regime multiplier', withVolRegime(makeCarryIncumbentWeights(), { retKey: 'spotRet' }));
      if (data.gateInputs?.vix) cv('C3', 'Incumbent × risk-off gate', withRiskGate(makeCarryIncumbentWeights(), data.gateInputs));
      else out.notes.push('No VIX/VIX3M/10y inputs — C3 risk-off gate skipped.');
    }
  }

  // ── Combined family ──
  if (t0 && c0) {
    // Benchmark: 50/50 daily blend of the two incumbents on common dates.
    const cMap = new Map(c0.dates.map((d, i) => [d, c0.daily[i]]));
    const dates = t0.dates.filter(d => cMap.has(d));
    const tMap = new Map(t0.dates.map((d, i) => [d, t0.daily[i]]));
    const blend = dates.map(d => 0.5 * tMap.get(d) + 0.5 * cMap.get(d));
    const kb = add('combined', 'KB', '50/50 blend of incumbents T0 + C0 (benchmark)', { dates, daily: blend, equity: null, perYear: null }, { rebalDays: C.rebalDays });
    const K = { ...C, rebalDays: D.carver.rebalDays };
    add('combined', 'K1', 'Carver: 0.6 EWMAC + 0.4 carry, CF sizing, 10% buffer',
      carryRun(data.priceByCcy, data.rateByCcy, makeCarverWeights(), K), { incumbent: kb, rebalDays: 5 });
    add('combined', 'K2', 'K1 × vol-regime multiplier',
      carryRun(data.priceByCcy, data.rateByCcy, withVolRegime(makeCarverWeights(), { retKey: 'spotRet' }), K), { incumbent: kb, rebalDays: 5 });
    out.notes.push('K1/K2 re-decide daily behind a 10% buffer; their OOS rebalance count is measured in 5-day units (weekly-equivalent).');
  }

  // Multiple testing: a primary "win" must also clear Bonferroni (Δ ≥ z·SE).
  const primary = Object.values(out.families).flatMap(f => f.variants).filter(v => v.preRegistered && v.vsIncumbent);
  for (const v of primary) v.vsIncumbent.survivesBonferroni = v.vsIncumbent.verdict === 'wins-oos' && v.vsIncumbent.deltaOosSharpe >= D.bonferroniZ * v.vsIncumbent.seIncumbentOos;
  out.multipleTesting = { primaryTests: primary.length, bonferroniZ: D.bonferroniZ,
    note: 'SE is the incumbent\'s OOS Sharpe SE (conservative for correlated variants). With ~9 tests at 1 SE, at least one chance "win" is likely; only survivesBonferroni counts as evidence.' };
  return out;
}

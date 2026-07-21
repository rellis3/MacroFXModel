/**
 * Multi-Factor Book — combine several INDEPENDENT return streams (trend, carry,
 * vol-risk-premium, …) into one diversified, vol-targeted portfolio. This is the
 * only place in the repo where "1 + 1 > 2" can honestly happen: the replicated
 * factors are somewhat uncorrelated (trend pays in crises; carry/VRP bleed in
 * them), so blending them cuts variance without killing return. That
 * diversification — plus vol sizing — IS the durable retail edge, not any one
 * entry signal.
 *
 * ── What it is / is NOT ───────────────────────────────────────────────────────
 *   • It is a COMBINER, factor-agnostic. It consumes each factor's already-costed
 *     daily-return stream (the trend engine's `scaled`, the carry engine's
 *     `total`, …) and never re-derives a signal. Import the factor engines, feed
 *     their outputs in — nothing here is copied from them (Lego Principle 1).
 *   • It is NOT a source of edge. If every input factor is dead out-of-sample,
 *     the blend is dead too — the honest read says so. A combiner sizes/diversifies
 *     an edge that must already exist ("a method is not a strategy").
 *
 * ── Construction (mirrors the trend engine, lifted one level up) ──────────────
 *   1. Inner-join the factor streams on their common trading dates.
 *   2. Normalise each factor to an equal risk budget with a TRAILING vol
 *      (strictly past → no lookahead): nf[t] = r[t] · volTargetFactor / vol[t].
 *      After this, equal-weight == equal-risk (risk parity across factors).
 *   3. Equal-weight the normalised factors present each day.
 *   4. Scale the blend to the portfolio vol target with a trailing vol.
 *   5. Report all / IS / OOS stats, the factor correlation matrix, and the
 *      diversification benefit (blend Sharpe vs best single factor & sum-of-parts).
 *
 * ── Honesty caveats (stated on every result) ─────────────────────────────────
 *   • Each input stream's costs are already embedded (they come from engines that
 *     charge spread on turnover). The combiner adds only the small cost of
 *     nudging factor weights, modelled via `rebalanceCostBp` on factor-weight
 *     turnover — off (0) by default; the honest number treats it as ~free because
 *     factor weights move slowly, but you can switch it on.
 *   • Diversification is only real if the factors are actually uncorrelated. The
 *     result surfaces the correlation matrix and flags a book whose legs are all
 *     the same risk-on bet (the `SYSTEM_ASSESSMENT.md` §2.4 warning made numeric).
 *
 * Pure & offline-testable: the caller runs each factor engine and passes the
 * streams in. Reuses `statsCore` (moments) + `metricsCore` (Sharpe/DD/Calmar).
 * No network, no DOM.
 */

import { mean, stdev } from './statsCore.js';
import { sharpeRatio, maxDrawdownFromEquity, calmar } from './metricsCore.js';

const DAY = 252;

export const MF_DEFAULTS = {
  volWindow: 63,           // trailing days for the factor/portfolio vol estimate
  volTargetFactor: 0.10,   // normalise each factor to 10% annualised vol (equal risk)
  volTargetPort: 0.10,     // scale the blend to 10% annualised vol
  maxFactorLev: 3.0,       // cap the inverse-vol multiplier per factor
  maxPortLev: 3.0,         // cap the portfolio vol-target multiplier
  rebalanceCostBp: 0,      // bp charged on |Δ factor weight| (0 ⇒ treat as ~free)
  isFrac: 0.7,             // in-sample fraction (chronological split)
  minOverlap: 260,         // need ≥ ~1y of common dates to say anything
};

// ── Trailing annualised vol, strictly past (vol[t] uses returns before t) ──────
function trailingVol(rets, window) {
  const n = rets.length, out = new Array(n).fill(NaN);
  for (let t = 0; t < n; t++) {
    const s = Math.max(0, t - window);
    const w = [];
    for (let i = s; i < t; i++) if (Number.isFinite(rets[i])) w.push(rets[i]);   // < t only
    if (w.length >= 20) out[t] = stdev(w, 1) * Math.sqrt(DAY);
  }
  return out;
}

// ── Inner-join factor streams on their common dates ───────────────────────────
// factors: [{ name, dates:string[], dailyRet:number[] }] (equal length per factor).
// Returns { dates, byName:{name→number[]}, names }.
export function joinFactors(factors) {
  const clean = factors
    .filter(f => f && Array.isArray(f.dates) && Array.isArray(f.dailyRet) && f.dates.length === f.dailyRet.length && f.dates.length)
    .map(f => ({ name: f.name, map: new Map(f.dates.map((d, i) => [d, f.dailyRet[i]])) }));
  if (clean.length < 2) return { dates: [], byName: {}, names: clean.map(c => c.name) };
  const common = [...clean[0].map.keys()]
    .filter(d => clean.every(c => c.map.has(d) && Number.isFinite(c.map.get(d))))
    .sort();
  const byName = {};
  for (const c of clean) byName[c.name] = common.map(d => c.map.get(d));
  return { dates: common, byName, names: clean.map(c => c.name) };
}

// ── Metrics on a daily SIMPLE-return series ───────────────────────────────────
function equityFrom(dailyRet) {
  const eq = [1];
  for (let i = 1; i < dailyRet.length; i++) eq.push(eq[i - 1] * (1 + (dailyRet[i] || 0)));
  return eq;
}
function statsOf(dailyRet) {
  const r = dailyRet.filter(Number.isFinite);
  const mu = r.length ? mean(r) : 0;
  const sd = stdev(r, 1);
  const eq = equityFrom(dailyRet);
  const dd = maxDrawdownFromEquity(eq);
  const annRet = mu * DAY, annVol = sd * Math.sqrt(DAY);
  const nz = r.filter(x => x !== 0);
  return {
    days: r.length,
    sharpe: +sharpeRatio(r, DAY, 1).toFixed(2),
    annReturn: +(annRet * 100).toFixed(1),
    annVol: +(annVol * 100).toFixed(1),
    maxDD: +(dd * 100).toFixed(1),
    calmar: +calmar(annRet, dd).toFixed(2),
    winRate: nz.length ? +((nz.filter(x => x > 0).length / nz.length) * 100).toFixed(1) : null,
  };
}
function sharpeOf(dailyRet) {
  const r = dailyRet.filter(Number.isFinite);
  return r.length ? +sharpeRatio(r, DAY, 1).toFixed(2) : 0;
}

// ── Pairwise Pearson correlation of two aligned return arrays ──────────────────
function corr(a, b) {
  const xs = [], ys = [];
  for (let i = 0; i < a.length; i++) if (Number.isFinite(a[i]) && Number.isFinite(b[i])) { xs.push(a[i]); ys.push(b[i]); }
  if (xs.length < 20) return null;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx > 0 && syy > 0 ? +(sxy / Math.sqrt(sxx * syy)).toFixed(2) : null;
}

// ── Combine ───────────────────────────────────────────────────────────────────
// factors: [{ name, dates, dailyRet }] — each a costed daily simple-return stream.
export function combineFactors(factors, cfg = {}) {
  const c = { ...MF_DEFAULTS, ...cfg };
  const { dates, byName, names } = joinFactors(factors);
  const L = dates.length;
  if (L < c.minOverlap) {
    return { ok: false, error: `need ≥${c.minOverlap} common dates across ≥2 factors, got ${L} across [${names.join(', ')}]` };
  }

  // 1–2. Per-factor trailing-vol normalisation (equal risk budget, no lookahead).
  const norm = {};   // name → normalised return[]
  const prevW = {};  // name → previous weight (for turnover cost)
  const wSeries = {};
  for (const name of names) {
    const r = byName[name];
    const vol = trailingVol(r, c.volWindow);
    const nf = new Array(L).fill(0), ws = new Array(L).fill(0);
    for (let t = 0; t < L; t++) {
      const v = vol[t];
      if (!(v > 0) || !Number.isFinite(v)) { nf[t] = 0; ws[t] = 0; continue; }
      let w = c.volTargetFactor / v;
      w = Math.min(c.maxFactorLev, w);
      ws[t] = w;
      nf[t] = w * (Number.isFinite(r[t]) ? r[t] : 0);
    }
    norm[name] = nf; wSeries[name] = ws;
  }

  // 3. Equal-weight the normalised factors present each day, minus weight-turnover cost.
  const blend = new Array(L).fill(0);
  for (const name of names) prevW[name] = 0;
  for (let t = 0; t < L; t++) {
    let s = 0, k = 0, turn = 0;
    for (const name of names) {
      const w = wSeries[name][t] / names.length;   // portfolio weight on this factor today
      if (wSeries[name][t] > 0) { s += norm[name][t] / names.length; k++; }
      turn += Math.abs(w - prevW[name]);
      prevW[name] = w;
    }
    const cost = turn * (c.rebalanceCostBp / 1e4);
    blend[t] = (k ? s : 0) - cost;
  }

  // 4. Scale the blend to the portfolio vol target (trailing vol, strictly past).
  const pv = trailingVol(blend, c.volWindow);
  const scaled = new Array(L).fill(0);
  for (let t = 0; t < L; t++) {
    const v = pv[t];
    if (v && v > 0) scaled[t] = blend[t] * Math.min(c.maxPortLev, c.volTargetPort / v);
    else scaled[t] = blend[t];
  }

  // 5. Reporting — headline, IS/OOS, per-factor standalone, correlation, diversification.
  const split = Math.floor(L * c.isFrac);
  const all = statsOf(scaled), is = statsOf(scaled.slice(0, split)), oos = statsOf(scaled.slice(split));

  // Per-factor standalone (over the SAME joined window, so it's an apples-to-apples
  // "what each factor did alone" vs the blend).
  const perFactor = names.map(name => ({ name, ...statsOf(byName[name]) }));
  const bestSingle = [...perFactor].sort((a, b) => b.sharpe - a.sharpe)[0];
  const avgPartsSharpe = +(perFactor.reduce((s, f) => s + f.sharpe, 0) / perFactor.length).toFixed(2);

  // Correlation matrix on the raw joined factor returns.
  const correlation = { names, matrix: names.map(a => names.map(b => a === b ? 1 : corr(byName[a], byName[b]))) };
  const offDiag = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) { const v = correlation.matrix[i][j]; if (v != null) offDiag.push(v); }
  const avgCorr = offDiag.length ? +(offDiag.reduce((s, x) => s + x, 0) / offDiag.length).toFixed(2) : null;

  // Diversification ratio: Σ|w_i|σ_i / σ_blend on the normalised streams (both ~equal σ,
  // so this reduces to how much the correlation structure shrinks portfolio vol).
  const factorVols = names.map(name => stdev(norm[name].filter(Number.isFinite), 1));
  const wSum = factorVols.reduce((s, v) => s + v, 0) / names.length;   // equal weight
  const blendVol = stdev(blend.filter(Number.isFinite), 1);
  const divRatio = blendVol > 0 ? +(wSum / blendVol).toFixed(2) : null;

  // Honest read.
  const flags = [];
  if (oos.sharpe <= 0) flags.push(`the blend is DEAD out-of-sample (OOS Sharpe ${oos.sharpe}) — combining dead factors does not create edge`);
  if (all.sharpe <= bestSingle.sharpe + 0.05) flags.push(`the blend (Sharpe ${all.sharpe}) does not beat the best single factor (${bestSingle.name} ${bestSingle.sharpe}) — diversification is not adding here`);
  if (avgCorr != null && avgCorr > 0.5) flags.push(`factors are highly correlated (avg ρ ${avgCorr}) — this is one bet wearing several hats, not real diversification`);
  const read = flags.length === 0
    ? `Honest good case: OOS Sharpe ${oos.sharpe} > 0, the blend (${all.sharpe}) beats its best leg (${bestSingle.name} ${bestSingle.sharpe}), and the legs are genuinely uncorrelated (avg ρ ${avgCorr ?? 'n/a'}). Diversification is doing real work — forward-test next.`
    : `Caveats: ${flags.join('; ')}. Weigh these before believing the blended Sharpe.`;

  return {
    ok: true,
    config: c,
    window: { commonDates: L, first: dates[0], last: dates[L - 1], isDays: split, oosDays: L - split },
    factors: names,
    headline: all,
    is, oos,
    perFactor,
    diversification: { avgCorrelation: avgCorr, diversificationRatio: divRatio, bestSingleSharpe: bestSingle.sharpe, bestSingleName: bestSingle.name, avgPartsSharpe },
    correlation,
    // Sampled equity for charting (blended, vol-targeted).
    equity: sampleEquity(dates, equityFrom(scaled), 400),
    read,
  };
}

function sampleEquity(dates, eq, target) {
  const n = eq.length;
  if (n <= target) return dates.map((d, i) => ({ t: d, v: +eq[i].toFixed(4) }));
  const step = (n - 1) / (target - 1), out = [];
  for (let k = 0; k < target; k++) { const i = Math.round(k * step); out.push({ t: dates[i], v: +eq[i].toFixed(4) }); }
  return out;
}

export { statsOf, sharpeOf, trailingVol, equityFrom };

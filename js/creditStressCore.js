// creditStressCore.js — Credit-Stress Index (CSI) risk-overlay brick (pure).
//
// THE QUESTION (pre-registered in CREDIT_STRESS_TEST.md — read it first): does
// scaling a book's exposure by a credit-stress composite (quality spread + HY OAS
// + VIX, equal-weight rolling z's) improve OOS Sharpe versus (a) no gate and
// (b) the SAME gate built on VIX alone? The named benchmark is VIX alone — all
// components load on one risk-off factor, so the composite must beat its simplest
// ingredient or it's decoration.
//
// This is a RISK OVERLAY, not alpha: exposure ×1 / ×0.5 / ×0 at frozen z tiers,
// applied with an as-of ≤ t−1 lookup (yesterday's published index sizes today).
// Weights frozen at equal; tiers frozen — fitting either is the overfitting path.
//
// Pure: series are passed in already publication-lag-shifted by the caller
// (js/creditStressEngine.js owns FRED ids + lags). Reuses statsCore.rollingZScore,
// metricsCore Sharpe/DD, and econTrendCore's asOfValue — no math copies.

import { mean } from './statsCore.js';
import { rollingZScore } from './statsCore.js';
import { sharpeRatio, maxDrawdownFromEquity } from './metricsCore.js';
import { asOfValue } from './econTrendCore.js';

export const CSI_DEFAULTS = {
  zWindow: 252,                 // trading days for each component's rolling z
  tiers: { half: 1, flat: 2 },  // exposure ×0.5 at z≥1, ×0 at z≥2 — frozen
  gateCostBps: 2,               // charged on |Δexposure| when the gate shifts
  isFrac: 0.6,
};

// ── the index ────────────────────────────────────────────────────────────────
// components: { name: [{d,v}] sorted asc } (already lag-shifted). Inner-joins on
// common dates, rolling-z's each component, equal-weights. Returns
// { series:[{d,v}], componentZ:{name:number|null} (latest), n }.
export function buildCsi(components, opts = {}) {
  const o = { ...CSI_DEFAULTS, ...opts };
  const names = Object.keys(components);
  if (!names.length) return { series: [], componentZ: {}, n: 0 };
  const maps = names.map(nm => new Map(components[nm].map(p => [p.d, p.v])));
  const dates = [...maps[0].keys()]
    .filter(d => maps.every(m => Number.isFinite(m.get(d))))
    .sort();
  const zByName = names.map((nm, k) =>
    rollingZScore(dates.map(d => maps[k].get(d)), o.zWindow));
  const series = [];
  for (let i = 0; i < dates.length; i++) {
    const zs = zByName.map(z => z[i]).filter(Number.isFinite);
    if (zs.length === names.length) series.push({ d: dates[i], v: mean(zs) });
  }
  const componentZ = {};
  names.forEach((nm, k) => {
    const z = zByName[k];
    let last = null;
    for (let i = z.length - 1; i >= 0; i--) if (Number.isFinite(z[i])) { last = z[i]; break; }
    componentZ[nm] = last;
  });
  return { series, componentZ, n: series.length };
}

// ── the gate ─────────────────────────────────────────────────────────────────
// Frozen tiers: z < half → ×1 · half ≤ z < flat → ×0.5 · z ≥ flat → ×0.
export function gateExposure(z, tiers = CSI_DEFAULTS.tiers) {
  if (!Number.isFinite(z)) return 1;                 // no reading → fail-open (ungated)
  if (z >= tiers.flat) return 0;
  if (z >= tiers.half) return 0.5;
  return 1;
}

export function buildGateSeries(csiSeries, opts = {}) {
  const o = { ...CSI_DEFAULTS, ...opts };
  return csiSeries.map(p => ({ d: p.d, v: gateExposure(p.v, o.tiers) }));
}

// Apply a gate to a daily return series. NO LOOKAHEAD: day t's exposure is the
// latest gate value dated ≤ dates[t-1] (yesterday's published index). Before the
// gate's history starts, exposure is 1 (identical to ungated — affects all
// variants equally). |Δexposure| is charged at gateCostBps.
export function applyGate(dates, returns, gateSeries, opts = {}) {
  const o = { ...CSI_DEFAULTS, ...opts };
  const out = new Array(returns.length).fill(0);
  let prevExp = 1;
  for (let t = 0; t < returns.length; t++) {
    const exp = t === 0 ? 1 : (asOfValue(gateSeries, dates[t - 1]) ?? 1);
    out[t] = exp * returns[t] - Math.abs(exp - prevExp) * (o.gateCostBps / 10000);
    prevExp = exp;
  }
  return out;
}

// ── stats + the frozen comparison ────────────────────────────────────────────
export function dailyStats(returns) {
  const eq = []; let c = 0;
  for (const r of returns) { c += r; eq.push(Math.exp(c)); }
  const dd = maxDrawdownFromEquity(eq);
  const cagr = returns.length > 1 ? Math.exp(mean(returns) * 252) - 1 : 0;
  return {
    days: returns.length,
    sharpe: +sharpeRatio(returns, 252).toFixed(2),
    cagr: +(cagr * 100).toFixed(1),
    maxDD: +(dd * 100).toFixed(1),
  };
}

function splitStats(returns, isFrac) {
  const split = Math.floor(returns.length * isFrac);
  return { is: dailyStats(returns.slice(0, split)), oos: dailyStats(returns.slice(split)), all: dailyStats(returns) };
}

// One target book vs the two gates. target = { dates, returns }.
export function runCsiOverlay(target, csiSeries, vixZSeries, opts = {}) {
  const o = { ...CSI_DEFAULTS, ...opts };
  const csiGate = buildGateSeries(csiSeries, o);
  const vixGate = buildGateSeries(vixZSeries, o);
  const gatedCsi = applyGate(target.dates, target.returns, csiGate, o);
  const gatedVix = applyGate(target.dates, target.returns, vixGate, o);
  return {
    ungated: splitStats(target.returns, o.isFrac),
    vixGated: splitStats(gatedVix, o.isFrac),
    csiGated: splitStats(gatedCsi, o.isFrac),
  };
}

// The FROZEN verdict (criteria mirror CREDIT_STRESS_TEST.md — do not edit after
// results exist). Decided on the PRIMARY target only.
export function evaluateCsi(primary) {
  if (!primary) return { pass: false, error: 'no primary overlay result' };
  const c = {
    beatsUngatedOos: primary.csiGated.oos.sharpe > primary.ungated.oos.sharpe,
    beatsVixOos: primary.csiGated.oos.sharpe > primary.vixGated.oos.sharpe,
    // ties allowed in-sample: "the ranking holds" — a period where the gates
    // never fire (identical series) must not fail the criterion.
    isConsistent: primary.csiGated.is.sharpe >= primary.ungated.is.sharpe
               && primary.csiGated.is.sharpe >= primary.vixGated.is.sharpe,
  };
  const pass = Object.values(c).every(Boolean);
  const verdict = pass ? 'csi'
    : (c.beatsUngatedOos ? 'vix-enough' : 'no-gate');
  return { pass, criteria: c, verdict };
}

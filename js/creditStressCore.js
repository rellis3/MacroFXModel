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

import { mean, rollingZScore, rollingPercentile } from './statsCore.js';
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

// ── "Credit Vega" — DIAGNOSTIC ONLY, not part of the frozen gate/verdict ─────
// Rolling sensitivity of credit spreads to volatility: OLS beta of daily
// Δ(HY OAS, bps) on Δ(VIX, points). Strictly a rolling beta, not an options
// vega — the label is display shorthand. Reading: LOW beta = credit absorbing
// vol spikes (calm plumbing); HIGH beta = stress transmitting into credit.
// Kept OUT of the CSI gate: adding inputs to the pre-registered test would void
// it. If CSI survives its one-shot, a vega-conditioned gate is a possible
// pre-registered FOLLOW-UP, never a retrofit.
// (Rolling-beta math stays local for now — yieldCouplingCore's pearson/
// rollingCorr are the flagged candidates for a shared statsCore promotion.)

export const VEGA_DEFAULTS = {
  window: 63,        // trading days for the rolling beta (~1 quarter)
  pctlWindow: 756,   // ~3y history for the High/Normal/Low percentile
  labels: { high: 80, elevated: 60, low: 20 },   // percentile cuts — display only
};

export function vegaLabel(pctl, cuts = VEGA_DEFAULTS.labels) {
  if (!Number.isFinite(pctl)) return null;
  if (pctl >= cuts.high) return 'High';
  if (pctl >= cuts.elevated) return 'Elevated';
  if (pctl <= cuts.low) return 'Low';
  return 'Normal';
}

// spreadSeries: HY OAS in % points ([{d,v}] sorted, lag-shifted);
// vixSeries: VIX points. Returns { series:[{d, beta, pctl}], current } where
// beta is bps of spread per 1 VIX point.
export function creditVega(spreadSeries, vixSeries, opts = {}) {
  const o = { ...VEGA_DEFAULTS, ...opts };
  const vix = new Map(vixSeries.map(p => [p.d, p.v]));
  const joined = spreadSeries.filter(p => Number.isFinite(vix.get(p.d)));
  if (joined.length < o.window + 2) return { series: [], current: null };

  const dSpreadBps = [], dVix = [], dDates = [];
  for (let i = 1; i < joined.length; i++) {
    dSpreadBps.push((joined[i].v - joined[i - 1].v) * 100);       // % points → bps
    dVix.push(vix.get(joined[i].d) - vix.get(joined[i - 1].d));
    dDates.push(joined[i].d);
  }

  const betas = new Array(dDates.length).fill(NaN);
  for (let i = o.window - 1; i < dDates.length; i++) {
    const s = i - o.window + 1;
    let mx = 0, my = 0;
    for (let k = s; k <= i; k++) { mx += dVix[k]; my += dSpreadBps[k]; }
    mx /= o.window; my /= o.window;
    let cov = 0, varx = 0;
    for (let k = s; k <= i; k++) { const dx = dVix[k] - mx; cov += dx * (dSpreadBps[k] - my); varx += dx * dx; }
    if (varx > 1e-12) betas[i] = cov / varx;
  }
  const pctls = rollingPercentile(betas, Math.min(o.pctlWindow, betas.length));

  const series = [];
  for (let i = 0; i < dDates.length; i++) {
    if (Number.isFinite(betas[i])) {
      series.push({ d: dDates[i], beta: +betas[i].toFixed(2), pctl: Number.isFinite(pctls[i]) ? +pctls[i].toFixed(0) : null });
    }
  }
  const last = series[series.length - 1] ?? null;
  return {
    series,
    current: last ? { date: last.d, beta: last.beta, pctl: last.pctl, label: vegaLabel(last.pctl, o.labels) } : null,
  };
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

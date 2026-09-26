/**
 * FX factor signal primitives (Tier 1, pure) — the building blocks behind
 * `fxFactorV2.js` (the research-only FX factor book v2). Sources: the
 * QuantConnect library/research notes in `education/quantconnect_strategies.md`
 * §3.8–3.10 / §4.3 and `education/quantconnect_blogs.md` §2 / §7, i.e.
 * Baltas & Kosowski (2017) TSMOM-CF, Carver (2023) EWMAC + carry forecasts,
 * vol-regime multiplier and position buffering, and residual momentum.
 *
 * Every function is pure and takes arrays in, returns numbers/arrays out. The
 * NO-LOOKAHEAD contract: any function called "…At(…, i, …)" reads only indices
 * ≤ i, and every "…Series" output value at index i uses inputs ≤ i. Callers
 * decide at index i and trade from i+1 (the engines' weightsAt hook does this).
 *
 * Nothing here is wired into a live bot. Built ≠ works ≠ has edge.
 */

import { mean, stdev } from './statsCore.js';
import { yzVolSeries } from './volBacktestEngine.js';

const SQRT252 = Math.sqrt(252);
const clip = (x, lo, hi) => Math.min(Math.max(x, lo), hi);
const finite = a => a.filter(Number.isFinite);

// ── Volatility ───────────────────────────────────────────────────────────────

// Annualised close-to-close vol over rets[i-window+1..i].
export function annualVolAt(rets, i, window = 60) {
  if (i + 1 < window) return NaN;
  const w = finite(rets.slice(i - window + 1, i + 1));
  return w.length > 2 ? stdev(w, 0) * SQRT252 : NaN;
}

// EWMA annualised vol series (span in days, Carver-style σ). out[i] uses rets ≤ i.
export function ewmaVolSeries(rets, span = 32, { minObs = 20 } = {}) {
  const a = 2 / (span + 1), out = new Array(rets.length).fill(NaN);
  let v = NaN, n = 0;
  for (let i = 0; i < rets.length; i++) {
    const r = rets[i];
    if (!Number.isFinite(r)) { out[i] = n >= minObs ? Math.sqrt(v) * SQRT252 : NaN; continue; }
    v = Number.isFinite(v) ? a * r * r + (1 - a) * v : r * r;
    n++;
    out[i] = n >= minObs ? Math.sqrt(v) * SQRT252 : NaN;
  }
  return out;
}

// Yang–Zhang annualised vol keyed by date, from one instrument's own OHLC bars
// ([{date, open, high, low, close}], ascending). Reuses the forecaster's
// `yzVolSeries` (single source of truth for YZ). Value on date d uses bars ≤ d.
export function yzAnnualVolByDate(bars, window = 21) {
  const clean = bars.filter(b => [b.open, b.high, b.low, b.close].every(x => Number.isFinite(x) && x > 0));
  const s = yzVolSeries(clean, window);
  const m = new Map();
  for (let i = window; i < clean.length; i++) if (s[i] > 0) m.set(clean[i].date, s[i] * SQRT252);
  return m;
}

// Invert an OHLC bar series (USD_JPY → JPY vs USD): 1/price, high↔low swap.
export function invertBars(bars) {
  return bars.map(b => ({ date: b.date, open: 1 / b.open, high: 1 / b.low, low: 1 / b.high, close: 1 / b.close }));
}

// Forward-fill a date→value Map onto ascending dates (value on-or-before d).
export function mapToDates(dates, map) {
  const keys = [...map.keys()].sort();
  const out = new Array(dates.length).fill(NaN);
  let p = -1, last = NaN;
  for (let i = 0; i < dates.length; i++) {
    while (p + 1 < keys.length && keys[p + 1] <= dates[i]) { p++; last = map.get(keys[p]); }
    out[i] = last;
  }
  return out;
}

// ── Trend signals ────────────────────────────────────────────────────────────

// Baltas–Kosowski TREND: t-stat of the last `lookback` daily log returns,
// clipped to [-1, 1] (strength-scaled instead of ±1). Uses rets ≤ i.
export function tstatTrendAt(rets, i, lookback = 252) {
  if (i + 1 < lookback) return 0;
  const w = finite(rets.slice(i - lookback + 1, i + 1));
  if (w.length < lookback * 0.8) return 0;
  const sd = stdev(w, 0);
  if (!(sd > 0)) return 0;
  return clip(mean(w) / (sd / Math.sqrt(w.length)), -1, 1);
}

// Carver EWMAC(n, 4n) forecast scalars (AFTS / Systematic Trading tables).
export const EWMAC_SCALARS = { 2: 12.1, 4: 8.53, 8: 5.95, 16: 4.1, 32: 2.79, 64: 1.91 };

function emaSeries(x, span) {
  const a = 2 / (span + 1), out = new Array(x.length).fill(NaN);
  let e = NaN;
  for (let i = 0; i < x.length; i++) {
    if (!Number.isFinite(x[i])) { out[i] = e; continue; }
    e = Number.isFinite(e) ? a * x[i] + (1 - a) * e : x[i];
    out[i] = e;
  }
  return out;
}

// One EWMAC(fast, 4·fast) forecast series, capped ±20:
// (EMA_fast − EMA_slow) / (price × daily σ) × scalar. out[i] uses prices ≤ i.
export function ewmacForecastSeries(prices, fast, { volSpan = 32, cap = 20 } = {}) {
  const slow = 4 * fast;
  const scalar = EWMAC_SCALARS[fast];
  if (!scalar) throw new Error(`no EWMAC scalar for fast=${fast}`);
  const rets = prices.map((p, i) => (i > 0 && p > 0 && prices[i - 1] > 0 ? Math.log(p / prices[i - 1]) : NaN));
  const vol = ewmaVolSeries(rets, volSpan);
  const ef = emaSeries(prices, fast), es = emaSeries(prices, slow);
  return prices.map((p, i) => {
    if (i < slow || !(vol[i] > 0)) return NaN;
    const priceSigma = p * vol[i] / SQRT252;
    return clip((ef[i] - es[i]) / priceSigma * scalar, -cap, cap);
  });
}

// Rescale a forecast series so its EXPANDING mean |forecast| is 10 (Carver's
// target), then cap ±20. Replaces a hand-set FDM with a no-lookahead estimate.
export function rescaleForecastSeries(f, { minHist = 250, cap = 20 } = {}) {
  const out = new Array(f.length).fill(NaN);
  let s = 0, n = 0;
  for (let i = 0; i < f.length; i++) {
    if (Number.isFinite(f[i])) { s += Math.abs(f[i]); n++; }
    if (n >= minHist && s > 0 && Number.isFinite(f[i])) out[i] = clip(f[i] * 10 / (s / n), -cap, cap);
  }
  return out;
}

// Average several forecast series (ignoring NaN members), then rescale.
export function combineForecasts(seriesList, weights = null, opts = {}) {
  const n = seriesList[0]?.length ?? 0;
  const w = weights || seriesList.map(() => 1 / seriesList.length);
  const raw = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    let s = 0, ws = 0;
    seriesList.forEach((f, k) => { if (Number.isFinite(f[i])) { s += w[k] * f[i]; ws += w[k]; } });
    if (ws > 0) raw[i] = s / ws;
  }
  return rescaleForecastSeries(raw, opts);
}

// Carver carry forecast: annualised carry in vol units × 30, smoothed over
// several EWMA spans, capped ±20. carryPct[i] = rate differential (annual %),
// annVol[i] = annualised vol of the instrument. out[i] uses inputs ≤ i.
export function carryForecastSeries(carryPct, annVol, { spans = [5, 20, 60, 120], scalar = 30, cap = 20 } = {}) {
  const raw = carryPct.map((c, i) => (Number.isFinite(c) && annVol[i] > 0 ? (c / 100) / annVol[i] * scalar : NaN));
  const smoothed = spans.map(sp => emaSeries(raw, sp));
  return raw.map((_, i) => {
    const v = finite(smoothed.map(s => s[i]));
    return v.length ? clip(mean(v), -cap, cap) : NaN;
  });
}

// Multi-horizon momentum score (QC #21050): average over horizons of the
// vol-normalised cumulative return. rets ≤ i.
export function multiHorizonScoreAt(rets, i, horizons = [63, 126, 189, 252]) {
  const scores = [];
  for (const h of horizons) {
    if (i + 1 < h) return NaN;
    const w = finite(rets.slice(i - h + 1, i + 1));
    if (w.length < h * 0.8) return NaN;
    const sd = stdev(w, 0);
    if (!(sd > 0)) return NaN;
    scores.push(w.reduce((a, b) => a + b, 0) / (sd * Math.sqrt(w.length)));
  }
  return mean(scores);
}

// Residualise each currency's returns on the equal-weight dollar factor
// (DOL = cross-sectional mean) over rets[i-window+1..i]: e = r − α − β·DOL.
// Returns { ccy: residual[] } (length ≤ window). In-window OLS only.
export function residualReturnsAt(retsByCcy, i, window = 252) {
  const ccys = Object.keys(retsByCcy);
  if (i + 1 < window || ccys.length < 3) return null;
  const lo = i - window + 1;
  const dol = [];
  for (let t = lo; t <= i; t++) {
    const xs = finite(ccys.map(c => retsByCcy[c][t]));
    dol.push(xs.length ? mean(xs) : NaN);
  }
  const out = {};
  for (const c of ccys) {
    const y = retsByCcy[c].slice(lo, i + 1);
    const pts = y.map((v, k) => [dol[k], v]).filter(([x, v]) => Number.isFinite(x) && Number.isFinite(v));
    if (pts.length < window * 0.8) { out[c] = []; continue; }
    const mx = mean(pts.map(p => p[0])), my = mean(pts.map(p => p[1]));
    let sxy = 0, sxx = 0;
    for (const [x, v] of pts) { sxy += (x - mx) * (v - my); sxx += (x - mx) ** 2; }
    const beta = sxx > 0 ? sxy / sxx : 0, alpha = my - beta * mx;
    out[c] = pts.map(([x, v]) => v - alpha - beta * x);
  }
  return out;
}

// ── Portfolio-level sizing ───────────────────────────────────────────────────

// Baltas–Kosowski correlation factor (== Carver's IDM for equal weights):
// ρ̄ = 2·Σ_{a<b} X_a X_b ρ_ab / (N(N−1)) over the last `window` returns,
// CF = sqrt(N / (1 + (N−1)ρ̄)), capped at `maxCF`. With ρ̄ = 0 it equals √N,
// i.e. the default trend engine's implicit "uncorrelated" assumption.
export function correlationFactorAt(signals, retsByCcy, i, { window = 63, maxCF = 2.5 } = {}) {
  const ccys = Object.keys(signals).filter(c => signals[c] !== 0 && Number.isFinite(signals[c]));
  const N = ccys.length;
  if (N < 2 || i + 1 < window) return { cf: N ? 1 : 0, rhoBar: NaN, n: N };
  const lo = i - window + 1;
  const cols = ccys.map(c => retsByCcy[c].slice(lo, i + 1));
  const corr = (a, b) => {
    const pts = a.map((x, k) => [x, b[k]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    if (pts.length < 10) return 0;
    const mx = mean(pts.map(p => p[0])), my = mean(pts.map(p => p[1]));
    let sxy = 0, sxx = 0, syy = 0;
    for (const [x, y] of pts) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
  };
  let s = 0;
  for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) s += signals[ccys[a]] * signals[ccys[b]] * corr(cols[a], cols[b]);
  const rhoBar = Math.max(2 * s / (N * (N - 1)), -1 / (N - 1) + 1e-6);
  const cf = Math.min(Math.sqrt(N / (1 + (N - 1) * rhoBar)), maxCF);
  return { cf, rhoBar, n: N };
}

// Carver vol-regime multiplier series. V = σ / mean(σ over the last histDays);
// Q = percentile of V within its own history (≤ i); M = EWMA_span(2 − 1.5Q),
// clipped to [0.5, 2]. High relative vol → smaller positions. out[i] uses σ ≤ i.
export function volRegimeMultiplierSeries(annVol, { histDays = 2520, minHist = 500, span = 10 } = {}) {
  const n = annVol.length, V = new Array(n).fill(NaN), out = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (!(annVol[i] > 0)) continue;
    const w = finite(annVol.slice(Math.max(0, i - histDays + 1), i + 1));
    if (w.length >= minHist) V[i] = annVol[i] / mean(w);
  }
  const a = 2 / (span + 1);
  let e = NaN;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(V[i])) { out[i] = Number.isFinite(e) ? clip(e, 0.5, 2) : NaN; continue; }
    const hist = finite(V.slice(Math.max(0, i - histDays + 1), i + 1));
    const q = hist.filter(x => x <= V[i]).length / hist.length;
    const m = 2 - 1.5 * q;
    e = Number.isFinite(e) ? a * m + (1 - a) * e : m;
    out[i] = clip(e, 0.5, 2);
  }
  return out;
}

// Carver position buffer: keep the old position if the target is within
// ±width of it; otherwise trade only to the near edge of the buffer.
export function bufferedWeight(prev, target, width) {
  if (!Number.isFinite(target)) return 0;
  if (!(width > 0)) return target;
  const p = Number.isFinite(prev) ? prev : 0;
  if (target - width > p) return target - width;
  if (target + width < p) return target + width;
  return p;
}

// Double sort (Fuertes–Miffre–Rallis; QC #30): tertiles by `primary` score,
// then within the top tertile keep the better half by `secondary`, within the
// bottom tertile the worse half. Returns { long: [...], short: [...] }.
export function doubleSortSelect(primary, secondary) {
  const ccys = Object.keys(primary).filter(c => Number.isFinite(primary[c]) && Number.isFinite(secondary[c]));
  const sorted = ccys.sort((a, b) => primary[a] - primary[b]);
  const t = Math.floor(sorted.length / 3);
  if (t < 1) return { long: [], short: [] };
  const hi = sorted.slice(-t).sort((a, b) => secondary[b] - secondary[a]);
  const lo = sorted.slice(0, t).sort((a, b) => secondary[a] - secondary[b]);
  const k = Math.max(1, Math.floor(t / 2));
  return { long: hi.slice(0, k), short: lo.slice(0, k) };
}

// ── Risk-off gate (pre-registered in MD files/FX_FACTOR_V2_TEST.md) ───────────
// Inputs are date-aligned arrays (already lagged by the caller). Three flags:
//   inverted : VIX / VIX3M > 1            (vol term structure in backwardation)
//   vixHigh  : VIX above its trailing 504-day 90th percentile
//   rateShock: 10y yield more than 2.5σ above its trailing 90-day mean
// multiplier = max(0, 1 − 0.5 × flags). out[i] uses inputs ≤ i.
export function riskGateSeries({ vix = [], vix3m = [], ust10 = [] }, { pctWin = 504, pct = 0.9, zWin = 90, zThresh = 2.5 } = {}) {
  const n = Math.max(vix.length, vix3m.length, ust10.length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const flags = {};
    flags.inverted = vix[i] > 0 && vix3m[i] > 0 ? vix[i] / vix3m[i] > 1 : false;
    if (Number.isFinite(vix[i]) && i + 1 >= pctWin) {
      const w = finite(vix.slice(i - pctWin + 1, i + 1));
      flags.vixHigh = w.length > pctWin * 0.8 && w.filter(x => x <= vix[i]).length / w.length > pct;
    } else flags.vixHigh = false;
    if (Number.isFinite(ust10[i]) && i + 1 >= zWin) {
      const w = finite(ust10.slice(i - zWin + 1, i + 1));
      const sd = stdev(w, 0);
      flags.rateShock = w.length > zWin * 0.8 && sd > 0 && (ust10[i] - mean(w)) / sd > zThresh;
    } else flags.rateShock = false;
    const count = +flags.inverted + +flags.vixHigh + +flags.rateShock;
    out.push({ m: Math.max(0, 1 - 0.5 * count), ...flags });
  }
  return out;
}

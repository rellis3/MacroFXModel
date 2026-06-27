/**
 * Forecast Core — horizon-agnostic "lego" engine for the vol/range forecast
 * family (daily, weekly, 20-day). One core, swap the horizon, plug/unplug
 * pieces.
 *
 * Design principles
 *   • Single source of truth. Vol math, asset corrections and the regime
 *     classifier are IMPORTED from volBacktestEngine.js — never re-implemented,
 *     so the backtest can never silently disagree with the live forecaster.
 *   • One entry primitive. The seven bespoke "legs" in v1
 *     (reversal/momentum/momentum50/reversal50/revHL50/exhaustion/dynamicAnchor)
 *     are all the same trade with different parameters. Here they collapse into
 *     ONE `simulateEntry(session, bands, spec)`.
 *   • Horizon-agnostic. A "session" is just { open, bars } — the bars inside one
 *     trade window. Daily = M1 bars in a day; weekly = bars across a week;
 *     20-day = bars across a month. The only horizon inputs are the σ scale and
 *     the window length.
 *   • The brain is a selector. `dayTypeScore` → `selectStrategy` decides, per
 *     window, whether to fade or follow and at which band — instead of a global
 *     leg choice. This is the genuinely new v2 content.
 */

import {
  hvVarSeries, yzVolSeries, garchSigmas, classifyRegime, ASSET_PARAMS,
  BM_P50, BM_P75, HN_P50, HN_P75,
} from './volBacktestEngine.js';
import { summarize, summarizeSplit } from './honestForecastEngine.js';
// Day-type score lives in its own lego brick (dayTypeCore.js) so it can plug
// into other systems too — imported here, never copied. Re-exported so existing
// forecast-family callers keep importing `dayTypeScore` from forecastCore.
import { dayTypeScore, classifyDayType, ESTIMATORS, DAYTYPE_PRESETS } from './dayTypeCore.js';

export { summarize, summarizeSplit };
export { dayTypeScore, classifyDayType, ESTIMATORS, DAYTYPE_PRESETS };

// ── Horizons ─────────────────────────────────────────────────────────────────
// sigmaScale: daily σ scales by √periods for longer horizons (√5 week, √20 month).
// holdLabel is informational. Same bands/selector apply at every horizon.
export const HORIZONS = {
  daily:   { label: 'Daily',  sigmaScale: 1,             windowDays: 1  },
  weekly:  { label: 'Weekly', sigmaScale: Math.sqrt(5),  windowDays: 5  },
  monthly: { label: '20-Day', sigmaScale: Math.sqrt(20), windowDays: 20 },
};

// ── Default frictions (% of price) ───────────────────────────────────────────
const DEFAULT_COST_PCT = { fx: 0.012, index: 0.010, commodity: 0.020 };
const DEFAULT_SLIP_PCT = { fx: 0.006, index: 0.008, commodity: 0.012 };

// ── 1) Bands from a (horizon-scaled) sigma ───────────────────────────────────
// sigma is the per-horizon σ already scaled (daily σ × sigmaScale). Returns
// fractional distances AND the ± price levels off `open`.
export function computeBands(open, sigma, assetClass) {
  const p = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;
  const hl50 = BM_P50 * p.hl_50_corr * sigma;   // median high/low distance (frac)
  const hl75 = BM_P75 * p.hl_75_corr * sigma;   // 75th-pct high/low distance
  const ocMed = HN_P50 * p.oc_corr    * sigma;  // median close displacement
  const oc75 = HN_P75 * p.oc_75_corr  * sigma;  // 75th-pct close displacement
  return {
    hl50, hl75, ocMed, oc75,
    up50: open * (1 + hl50), dn50: open * (1 - hl50),
    up75: open * (1 + hl75), dn75: open * (1 - hl75),
    ocUp: open * (1 + ocMed), ocDn: open * (1 - ocMed),
  };
}

// ── 2) Generalized fill walker (horizon-agnostic) ────────────────────────────
// Walks ordered bars within one window. Fills when a bar trades through the
// entry (limit on the resting side, stop on the breakout side), then resolves
// SL/TP intrabar in time order (SL checked first = conservative). If never
// stopped/targeted, exits at the window's last close (mark-to-window-end).
// Returns { filled, outcome, pnlPct(gross), fillTime, exitTime } or null (no fill).
export function walkBars(bars, entry, tp, sl, isBuy, entryType, open) {
  let filled = false, fillTime = null;
  for (const bar of bars) {
    if (!filled) {
      const hit = isBuy
        ? (entryType === 'stop' ? bar.high >= entry : bar.low <= entry)
        : (entryType === 'stop' ? bar.low  <= entry : bar.high >= entry);
      if (!hit) continue;
      filled = true; fillTime = bar.time ?? null;
    }
    // SL first (conservative), then TP — within this and every later bar.
    if (isBuy) {
      if (bar.low  <= sl) return { filled: true, outcome: 'loss', pnlPct: -((entry - sl) / open * 100), fillTime, exitTime: bar.time ?? null };
      if (bar.high >= tp) return { filled: true, outcome: 'win',  pnlPct:  ((tp - entry) / open * 100), fillTime, exitTime: bar.time ?? null };
    } else {
      if (bar.high >= sl) return { filled: true, outcome: 'loss', pnlPct: -((sl - entry) / open * 100), fillTime, exitTime: bar.time ?? null };
      if (bar.low  <= tp) return { filled: true, outcome: 'win',  pnlPct:  ((entry - tp) / open * 100), fillTime, exitTime: bar.time ?? null };
    }
  }
  if (!filled) return null;
  const last = bars[bars.length - 1];
  const eod  = last?.close ?? entry;
  const pnl  = isBuy ? (eod - entry) / open * 100 : (entry - eod) / open * 100;
  return { filled: true, outcome: pnl > 0 ? 'win' : 'open', pnlPct: pnl, fillTime, exitTime: last?.time ?? null };
}

// ── 3) The ONE entry primitive (collapses all v1 legs) ───────────────────────
// spec = { band:'hl50'|'hl75', action:'fade'|'follow', dir:'up'|'down'|'both',
//          slMult, costPct, slipPct }
// fade   → limit at the band, target = Close median (revert toward open).
// follow → stop through the band, target = the next band out (continuation).
export function simulateEntry(session, bands, spec) {
  const { open, bars } = session;
  const { band = 'hl75', action = 'fade', dir = 'both',
          slMult = 1.5, costPct = 0.012, slipPct = 0.006 } = spec;
  const dist  = band === 'hl50' ? bands.hl50 : bands.hl75;
  const bandD = open * dist;
  const slD   = bandD * slMult;

  // Build the candidate order(s). For a 'both' fade we place both and take the
  // first fill (walk picks it up chronologically by slicing).
  const orders = [];
  const wantUp = dir === 'up' || dir === 'both';
  const wantDn = dir === 'down' || dir === 'both';

  if (action === 'fade') {
    // Sell the upper band → revert down to Close median; buy the lower band → up.
    const upLevel = band === 'hl50' ? bands.up50 : bands.up75;
    const dnLevel = band === 'hl50' ? bands.dn50 : bands.dn75;
    if (wantUp) orders.push({ entry: upLevel, tp: bands.ocUp, sl: upLevel + slD, isBuy: false, type: 'limit' });
    if (wantDn) orders.push({ entry: dnLevel, tp: bands.ocDn, sl: dnLevel - slD, isBuy: true,  type: 'limit' });
  } else {
    // Follow: break THROUGH a band, target the next band out.
    const slip = open * slipPct / 100;
    if (band === 'hl50') {
      if (wantUp) orders.push({ entry: bands.up50 + slip, tp: bands.up75, sl: bands.up50 - slD, isBuy: true,  type: 'stop' });
      if (wantDn) orders.push({ entry: bands.dn50 - slip, tp: bands.dn75, sl: bands.dn50 + slD, isBuy: false, type: 'stop' });
    } else {
      // follow a 75p break → target an extension beyond it (one more ocMed out)
      if (wantUp) orders.push({ entry: bands.up75 + slip, tp: bands.up75 + open * bands.ocMed, sl: bands.up75 - slD, isBuy: true,  type: 'stop' });
      if (wantDn) orders.push({ entry: bands.dn75 - slip, tp: bands.dn75 - open * bands.ocMed, sl: bands.dn75 + slD, isBuy: false, type: 'stop' });
    }
  }

  let best = null;
  for (const o of orders) {
    const r = walkBars(bars, o.entry, o.tp, o.sl, o.isBuy, o.type, open);
    if (r && (!best || (r.fillTime && best.fillTime && r.fillTime < best.fillTime) || !best.filled)) {
      best = { ...r, side: o.isBuy ? 'BUY' : 'SELL' };
      if (dir !== 'both') break;  // single-sided → first order is the trade
    }
  }
  if (!best) return { filled: false, side: '', outcome: 'no_fill', pnlPct: 0, action, band };
  const net = best.pnlPct - costPct;   // round-trip friction
  return { filled: true, side: best.side, outcome: best.outcome,
           pnlPct: +net.toFixed(5), action, band,
           fillTime: best.fillTime ?? null, exitTime: best.exitTime ?? null };
}

// ── 4) Day-type score T ∈ [0,1] (trend-day-ness; no lookahead) ───────────────
// Now owned by the standalone lego brick `dayTypeCore.js` and imported above —
// see that module for the estimator registry and presets. `dayTypeScore` is
// re-exported unchanged (default preset = the original ER 0.6 / VR 0.4 blend).

// ── 5) Selector: T (+regime) → trade spec ────────────────────────────────────
// Encodes the concept note: low T → fade the median (high traffic); mid T →
// fade the 75p (cleaner extreme); high T + directional regime → follow.
export function selectStrategy(T, regime, cfg = {}) {
  const { fadeMedMax = 0.30, fade75Max = 0.55 } = cfg;
  const dir = regime === 'BULL' ? 'up' : regime === 'BEAR' ? 'down' : 'both';
  if (T < fadeMedMax)  return { band: 'hl50', action: 'fade',   dir: 'both', T };
  if (T < fade75Max)   return { band: 'hl75', action: 'fade',   dir: 'both', T };
  if (regime === 'RANGE') return { band: 'hl75', action: 'fade', dir: 'both', T };  // trendy but no direction → fade extreme
  return { band: 'hl50', action: 'follow', dir, T };                                 // trend day → follow
}

// ── 6) Per-horizon walk-forward sigma series (no lookahead) ──────────────────
// Mirrors computeForecast / volBacktestEngine: commodity→HV20, index→GARCH,
// fx→YZ30. Returns out[i] = daily σ for predicting window i (use data < i).
export function volSigmaSeries(bars, assetClass) {
  const closes = bars.map(b => b.close);
  const p = ASSET_PARAMS[assetClass] ?? ASSET_PARAMS.fx;
  const out = new Float64Array(bars.length);
  if (assetClass === 'commodity') {
    const lr = [];
    for (let j = 1; j < closes.length; j++) lr.push(Math.log(closes[j] / closes[j - 1]));
    const hv = hvVarSeries(lr, 20);
    for (let i = 2; i < bars.length; i++) out[i] = Math.sqrt(Math.max(hv[i - 2], 1e-12));
  } else if (assetClass === 'index') {
    const g = garchSigmas(bars, p.garch_omega ?? 4.76e-6);
    for (let i = 0; i < bars.length; i++) out[i] = g[i];
  } else {
    const yz = yzVolSeries(bars, 30);
    for (let i = 1; i < bars.length; i++) out[i] = yz[i - 1] || 1e-6;
  }
  return out;
}

export { ASSET_PARAMS, classifyRegime, DEFAULT_COST_PCT, DEFAULT_SLIP_PCT };

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
//
// Fill-bar causality: on the bar that FILLS the order, the intrabar path is
// unknown. For a LIMIT (fade) entry the TP sits between the approach path and
// the entry, so the bar necessarily traversed the TP region BEFORE the fill —
// counting `bar` extremes as a TP hit there books wins that may have printed
// hours earlier (fatal on D1 window bars: weekly/monthly horizons and the
// daily D1 fallback). So TP is only resolvable on the fill bar when reaching
// it requires passing through the entry first: stop entries yes, limit
// entries no (their TP starts on the NEXT bar). SL is always checked
// (pessimistic). If the fill bar is the window's last bar, the trade marks to
// the window close like any other unresolved position.
// Returns { filled, outcome, pnlPct(gross), fillTime, exitTime } or null (no fill).
export function walkBars(bars, entry, tp, sl, isBuy, entryType, open) {
  let filled = false, fillTime = null;
  for (const bar of bars) {
    let isFillBar = false;
    if (!filled) {
      const hit = isBuy
        ? (entryType === 'stop' ? bar.high >= entry : bar.low <= entry)
        : (entryType === 'stop' ? bar.low  <= entry : bar.high >= entry);
      if (!hit) continue;
      filled = true; fillTime = bar.time ?? null; isFillBar = true;
    }
    // SL first (conservative), then TP — TP is skipped on a limit fill bar
    // (see fill-bar causality note above).
    const tpKnowable = !isFillBar || entryType === 'stop';
    if (isBuy) {
      if (bar.low  <= sl) return { filled: true, outcome: 'loss', pnlPct: -((entry - sl) / open * 100), fillTime, exitTime: bar.time ?? null };
      if (tpKnowable && bar.high >= tp) return { filled: true, outcome: 'win',  pnlPct:  ((tp - entry) / open * 100), fillTime, exitTime: bar.time ?? null };
    } else {
      if (bar.high >= sl) return { filled: true, outcome: 'loss', pnlPct: -((sl - entry) / open * 100), fillTime, exitTime: bar.time ?? null };
      if (tpKnowable && bar.low  <= tp) return { filled: true, outcome: 'win',  pnlPct:  ((entry - tp) / open * 100), fillTime, exitTime: bar.time ?? null };
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
          slMult = 1.5, costPct = 0.012, slipPct = 0.006, dynamicHL = false } = spec;
  const dist  = band === 'hl50' ? bands.hl50 : bands.hl75;
  const bandD = open * dist;
  const slD   = bandD * slMult;

  const wantUp = dir === 'up' || dir === 'both';
  const wantDn = dir === 'down' || dir === 'both';

  // Dynamic-HL mode: the HL bands trail the OPPOSITE running extreme, exactly
  // like the live chart / Pine overlay (proj-high off the running low, proj-low
  // off the running high). Requires an ordered intraday path. The OC take-profit
  // stays static off the open. Static mode (default) is left byte-identical.
  if (dynamicHL) {
    const best = walkDynamicHL(bars, open, bands, { band, action, dir, wantUp, wantDn, slMult, slipPct });
    if (!best) return { filled: false, side: '', outcome: 'no_fill', pnlPct: 0, action, band };
    const net = best.pnlPct - costPct;
    return { filled: true, side: best.side, outcome: best.outcome, pnlPct: +net.toFixed(5),
             action, band, fillTime: best.fillTime ?? null, exitTime: best.exitTime ?? null };
  }

  // Build the candidate order(s). For a 'both' fade we place both and take the
  // first fill (walk picks it up chronologically by slicing).
  const orders = [];

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

// ── 3b) Dynamic-HL fill walker (HL bands trail the opposite running extreme) ──
// Matches the live chart: proj-HIGH (up side) = runLow × (1+hl), proj-LOW (dn
// side) = runHigh × (1−hl). Fade takes a limit at the trailing band → static OC
// take-profit; follow takes a stop through it → target the next (dynamic) band
// out, frozen at the fill bar. SL is set from the realised fill level.
function walkDynamicHL(bars, open, bands, spec) {
  const { band, action, dir, wantUp, wantDn, slMult, slipPct } = spec;
  const n = bars.length;
  if (!n) return null;
  // runHi[k]/runLo[k] = running extremes of bars STRICTLY BEFORE bar k, seeded
  // with the session open. Using bar k's own extreme to place the level that
  // bar k is then fill-tested against is lookahead (the anchor is only knowable
  // in hindsight — self-fulfilling on D1 window bars, the defect BUG_LIST #8
  // documented for the Python port). Lagging one bar makes the level a resting
  // order that existed at bar k's open. On M1 bars the lag is one minute.
  const runHi = new Array(n), runLo = new Array(n);
  { let rh = open, rl = open;
    for (let k = 0; k < n; k++) {
      runHi[k] = rh; runLo[k] = rl;
      if (bars[k].high > rh) rh = bars[k].high;
      if (bars[k].low  < rl) rl = bars[k].low;
    } }
  const hl    = band === 'hl50' ? bands.hl50 : bands.hl75;
  const hlOut = bands.hl75;                       // next band out for an hl50 follow
  const slD   = open * hl * slMult;
  const slip  = open * slipPct / 100;

  // slSign: +1 = SL above entry (sells), −1 = SL below entry (buys).
  const orders = [];
  if (action === 'fade') {
    if (wantUp) orders.push({ isBuy: false, type: 'limit', slSign: +1, lvl: k => runLo[k] * (1 + hl), tp: () => bands.ocUp });
    if (wantDn) orders.push({ isBuy: true,  type: 'limit', slSign: -1, lvl: k => runHi[k] * (1 - hl), tp: () => bands.ocDn });
  } else if (band === 'hl50') {                   // follow a 50p break → target the 75p band
    if (wantUp) orders.push({ isBuy: true,  type: 'stop', slSign: -1, lvl: k => runLo[k] * (1 + hl) + slip, tp: f => runLo[f] * (1 + hlOut) });
    if (wantDn) orders.push({ isBuy: false, type: 'stop', slSign: +1, lvl: k => runHi[k] * (1 - hl) - slip, tp: f => runHi[f] * (1 - hlOut) });
  } else {                                        // follow a 75p break → one ocMed beyond it
    if (wantUp) orders.push({ isBuy: true,  type: 'stop', slSign: -1, lvl: k => runLo[k] * (1 + hl) + slip, tp: f => runLo[f] * (1 + hl) + open * bands.ocMed });
    if (wantDn) orders.push({ isBuy: false, type: 'stop', slSign: +1, lvl: k => runHi[k] * (1 - hl) - slip, tp: f => runHi[f] * (1 - hl) - open * bands.ocMed });
  }

  let best = null;
  for (const o of orders) {
    const r = resolveDynOrder(bars, open, o, slD);
    if (r && (!best || (r.fillTime && best.fillTime && r.fillTime < best.fillTime) || !best.filled)) {
      best = { ...r, side: o.isBuy ? 'BUY' : 'SELL' };
      if (dir !== 'both') break;   // single-sided → first order is the trade
    }
  }
  return best;
}

// Resolve one dynamic order: find first fill against the trailing entry level,
// then SL-first/TP intrabar from the fill bar; else mark to the window close.
function resolveDynOrder(bars, open, o, slD) {
  const { isBuy, type, lvl, tp, slSign } = o;
  let filled = false, fillTime = null, entry = 0, sl = 0, tpLvl = 0;
  for (let k = 0; k < bars.length; k++) {
    const bar = bars[k];
    let isFillBar = false;
    if (!filled) {
      const L = lvl(k);
      const hit = isBuy ? (type === 'stop' ? bar.high >= L : bar.low <= L)
                        : (type === 'stop' ? bar.low  <= L : bar.high >= L);
      if (!hit) continue;
      filled = true; fillTime = bar.time ?? null; entry = L; isFillBar = true;
      sl = entry + slSign * slD;
      tpLvl = tp(k);
    }
    // Same fill-bar causality rule as walkBars: a limit (fade) TP sits on the
    // approach side of the entry, so it is not resolvable on the fill bar.
    const tpKnowable = !isFillBar || type === 'stop';
    if (isBuy) {
      if (bar.low  <= sl)    return { filled: true, outcome: 'loss', pnlPct: -((entry - sl) / open * 100), fillTime, exitTime: bar.time ?? null };
      if (tpKnowable && bar.high >= tpLvl) return { filled: true, outcome: 'win',  pnlPct:  ((tpLvl - entry) / open * 100), fillTime, exitTime: bar.time ?? null };
    } else {
      if (bar.high >= sl)    return { filled: true, outcome: 'loss', pnlPct: -((sl - entry) / open * 100), fillTime, exitTime: bar.time ?? null };
      if (tpKnowable && bar.low  <= tpLvl) return { filled: true, outcome: 'win',  pnlPct:  ((entry - tpLvl) / open * 100), fillTime, exitTime: bar.time ?? null };
    }
  }
  if (!filled) return null;
  const last = bars[bars.length - 1];
  const eod  = last?.close ?? entry;
  const pnl  = isBuy ? (eod - entry) / open * 100 : (entry - eod) / open * 100;
  return { filled: true, outcome: pnl > 0 ? 'win' : 'open', pnlPct: pnl, fillTime, exitTime: last?.time ?? null };
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

// ── 6b) One-step-ahead σ (for TODAY'S not-yet-traded session) ────────────────
// volSigmaSeries[i] predicts bar i using data < i, so its LAST element predicts
// the last COMPLETED bar — i.e. yesterday. A live plan/forecast needs σ for the
// upcoming session (index n, one past the end). Extend the series with a
// phantom bar whose values cannot matter (out[n] only reads data < n) and take
// out[n]. This is the identity `nextSigma(bars[0..n-1]) === volSigmaSeries(
// bars[0..n])[n]` for ANY real bar n — golden-tested in forecastCore.test.mjs.
// `seriesFn` is injectable so offline tests (and the plan producer's DI) can
// fake the series while keeping this indexing contract.
export function nextSigma(bars, assetClass, seriesFn = volSigmaSeries) {
  if (!bars?.length) return 0;
  const last = bars[bars.length - 1];
  const phantom = { open: last.close, high: last.close, low: last.close, close: last.close, time: last.time };
  const s = seriesFn(bars.concat([phantom]), assetClass);
  const isSeries = Array.isArray(s) || ArrayBuffer.isView(s);
  return isSeries ? s[s.length - 1] : s;
}

export { ASSET_PARAMS, classifyRegime, DEFAULT_COST_PCT, DEFAULT_SLIP_PCT };

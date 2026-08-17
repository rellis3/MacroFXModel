/**
 * Impulse/EMA/Range-Exhaustion Engine (v2) — a versioned FORK of
 * js/impulseEmaRangeV1Engine.js (untouched, pinned, still the baseline
 * reference for the original null result — Sharpe -5.99 gold / -2.49 NQ,
 * see education/jordan_impulse_range_backtest/RESULTS.md). v1 stays exactly
 * as originally committed; this file exists so v1 is never edited in place
 * to try an experiment (an explicit anti-pattern in this repo's own
 * conventions — "Version it, don't overwrite... Editing v1 in place to add
 * an experiment").
 *
 * v2 adds three follow-up knobs, tested in
 * education/jordan_impulse_range_backtest/{MULTI_TRADE_PER_DAY,
 * RANGE_GATE_FLIP,VWAP_ENTRY_BAND}.md — all backward-compatible with v1's
 * defaults (verified byte-identical trade-for-trade against v1's own
 * committed baseline trades.json before any of the follow-up numbers were
 * trusted):
 *
 *   - `maxTradesPerDay` (default 1, matches v1's "one trade per day, first
 *     qualifying setup"): when >1, resumes scanning right after each
 *     trade's own exit bar for another same-day setup, folding the skipped
 *     in-trade bars back into the running session range first.
 *   - `rangeGateMode` ('roomLeft' default, matches v1's pinned read of the
 *     range-exhaustion gate) / 'exhausted' inverts it — require the day
 *     already stretched (>= rangeGateMinUsedFrac) instead of room left.
 *   - `entryBandMode` ('fib' default, matches v1's pinned 38.2-61.8%
 *     retracement band) / 'vwap' swaps the pullback-quality check for
 *     distance from the session-anchored VWAP (js/vumanchuCore.js) instead.
 *
 * Also exports `buildDaily` (v1 keeps its own unexported copy — a known,
 * flagged duplication, see LEGO_MODULES.md §1ao) and adds
 * `legOriginTime`/`legExtremeTime` to each trade record (purely additive —
 * every other field is byte-identical to v1's at matching cfg), used by the
 * session-split and liquidity-sweep follow-up analyses.
 *
 * Contract (pure; no network, no DOM) — identical to v1:
 *   runImpulseEmaRange(packed, cfg) → { trades[], records[], meta }
 */

import { extractBars, resampleTo, bisect } from './barUtils.js';
import { pivotHighs, pivotLows, computeATR } from './patternEngine.js';
import { ema } from './indicatorCore.js';
import { walkBars } from './forecastCore.js';
import { pipSize, assetClass as assetClassOf } from './instrumentRegistry.js';
import { rangeExhaustionRead } from './rangePercentileCore.js';
import { computeVWAP } from './vumanchuCore.js';

const DAY = 86400;

// Round-trip friction as % of price, by asset class — same figures as v1 /
// forecastCore / poiReactionV1Engine.
const COST_PCT = { fx: 0.012, index: 0.010, commodity: 0.020 };

export const DEFAULT_CFG = {
  entryTfMin: 1,
  ctxLookbackDays: 2,
  pivotN: 5,
  atrPeriod: 14,
  impulseAtrMult: 2.5,
  emaFast: 9,
  emaSlow: 21,
  retraceMin: 0.382,
  retraceMax: 0.618,
  rangeLookbackDays: 20,
  rangeGateMaxUsedFrac: 1.0,
  slBufferAtrMult: 0.25,
  rr: 2.0,
  warmupDays: 30,
  oosFrac: 0.4,
  account: 10000,
  riskPct: 1.0,
  maxTradesPerDay: 1,        // v1-matching default; >1 scans on after each trade's own exit
  rangeGateMode: 'roomLeft', // 'roomLeft' (v1-matching default) or 'exhausted'
  rangeGateMinUsedFrac: 0.5, // 'exhausted' mode only: require live/median ≥ this
  entryBandMode: 'fib',      // 'fib' (v1-matching default) or 'vwap'
  vwapBandAtrMult: 0.5,      // 'vwap' mode only: max |close - sessionVWAP| in ATR
};

// Build all completed D1 bars from packed M1 in one pass (UTC-day buckets).
// Same loop as v1's own unexported copy — v1 stays untouched (not even to
// export this), so this is a deliberate, flagged 6th copy rather than a
// re-import from the pinned v1 file; see LEGO_MODULES.md §1ao / §2.
export function buildDaily(packed) {
  const { n, times, opens, highs, lows, closes } = packed;
  const days = [];
  let curKey = -1, cur = null;
  for (let i = 0; i < n; i++) {
    const key = times[i] - (times[i] % DAY);
    if (key !== curKey) {
      if (cur) days.push(cur);
      cur = { time: key, open: opens[i], high: highs[i], low: lows[i], close: closes[i] };
      curKey = key;
    } else {
      if (highs[i] > cur.high) cur.high = highs[i];
      if (lows[i] < cur.low) cur.low = lows[i];
      cur.close = closes[i];
    }
  }
  if (cur) days.push(cur);
  return days;
}

const isoDay = e => new Date(e * 1000).toISOString().substring(0, 10);

// MAE (maximum adverse excursion) read off the REAL M1 path — same as v1.
function maeFromPath(packed, fromEpoch, toEpoch, entry, isBuy) {
  const { n, times, highs, lows } = packed;
  let lo = 0, hi = n;
  while (lo < hi) { const m = (lo + hi) >>> 1; if (times[m] < fromEpoch) lo = m + 1; else hi = m; }
  let i = lo, worst = 0;
  const end = toEpoch == null ? Infinity : toEpoch;
  for (; i < n && times[i] <= end; i++) {
    const adverse = isBuy ? (entry - lows[i]) : (highs[i] - entry);
    if (adverse > worst) worst = adverse;
  }
  return worst / entry;
}

// The most recent CONFIRMED impulse leg as of bar index `j` — same as v1.
function lastConfirmedImpulse(bars, pivH, pivL, j, pivotN, atrSeries, impulseAtrMult) {
  const atr = atrSeries[j];
  if (!(atr > 0)) return null;
  const known = [];
  for (const p of pivH) { if (p.idx + pivotN <= j) known.push({ ...p, kind: 'H' }); }
  for (const p of pivL) { if (p.idx + pivotN <= j) known.push({ ...p, kind: 'L' }); }
  known.sort((a, b) => a.idx - b.idx);
  if (known.length < 2) return null;
  for (let k = known.length - 1; k > 0; k--) {
    const a = known[k], b = known[k - 1];
    if (a.kind === b.kind) continue;
    const legSize = Math.abs(a.price - b.price);
    if (legSize < impulseAtrMult * atr) return null;
    return a.kind === 'H'
      ? { originIdx: b.idx, originPrice: b.price, extremeIdx: a.idx, extremePrice: a.price, dir: 'up' }
      : { originIdx: b.idx, originPrice: b.price, extremeIdx: a.idx, extremePrice: a.price, dir: 'down' };
  }
  return null;
}

export function runImpulseEmaRange(packed, cfg = {}) {
  const c = { ...DEFAULT_CFG, ...cfg };
  const instrument = c.instrument;
  if (!instrument) throw new Error('runImpulseEmaRange: cfg.instrument required');
  const klass = c.assetClass ?? assetClassOf(instrument);
  const cost = c.costPct ?? (COST_PCT[klass] ?? COST_PCT.fx);
  const riskAmount = c.account * c.riskPct / 100;

  const daily = buildDaily(packed);
  if (daily.length < c.warmupDays + c.rangeLookbackDays + 2) {
    return { trades: [], records: [], meta: { instrument, days: daily.length, note: 'insufficient history' } };
  }

  const trades = [];
  const records = [];
  const equity = [];

  for (let di = Math.max(c.warmupDays, c.rangeLookbackDays); di < daily.length; di++) {
    const dStart = daily[di].time;
    const dEnd = dStart + DAY;
    const ctxStart = dStart - c.ctxLookbackDays * DAY;

    const ctxBars = resampleTo(extractBars(packed, ctxStart, dEnd), c.entryTfMin);
    if (ctxBars.length < 50) continue;
    const todayStartIdx = ctxBars.findIndex(b => b.time >= dStart);
    if (todayStartIdx < 0 || todayStartIdx >= ctxBars.length - 2) continue;

    const atrSeries = computeATR(ctxBars, c.atrPeriod);
    const closes = ctxBars.map(b => b.close);
    const emaFastSeries = ema(closes, c.emaFast);
    const emaSlowSeries = ema(closes, c.emaSlow);
    const pivH = pivotHighs(ctxBars, c.pivotN);
    const pivL = pivotLows(ctxBars, c.pivotN);

    const dayOpen = ctxBars[todayStartIdx].open;
    if (!(dayOpen > 0)) continue;

    // Session-anchored VWAP (resets at todayStartIdx, not the multi-day ctx
    // window) — only computed when entryBandMode actually needs it.
    let vwapSeries = null;
    if (c.entryBandMode === 'vwap') {
      vwapSeries = new Array(ctxBars.length).fill(null);
      const { vwap } = computeVWAP(ctxBars.slice(todayStartIdx));
      for (let i = 0; i < vwap.length; i++) vwapSeries[todayStartIdx + i] = vwap[i];
    }

    let runningHigh = -Infinity, runningLow = Infinity;
    let tradesToday = 0;
    let scanStart = todayStartIdx;
    let ctxTimes = null;   // lazily built only when a 2nd+ trade the same day needs a resume point

    while (tradesToday < c.maxTradesPerDay) {
      let signal = null;

      for (let j = scanStart; j < ctxBars.length - 1; j++) {
        const bar = ctxBars[j];
        if (bar.high > runningHigh) runningHigh = bar.high;
        if (bar.low < runningLow) runningLow = bar.low;

        const leg = lastConfirmedImpulse(ctxBars, pivH, pivL, j, c.pivotN, atrSeries, c.impulseAtrMult);
        if (!leg) continue;

        const fastAbove = emaFastSeries[j] > emaSlowSeries[j];
        const emaAgrees = leg.dir === 'up' ? fastAbove : !fastAbove;
        if (!emaAgrees) continue;

        const rangeRead = rangeExhaustionRead(daily, di, dayOpen, runningHigh, runningLow, c.rangeLookbackDays);
        if (!rangeRead || rangeRead.usedFracOfMedian == null) continue;
        if (c.rangeGateMode === 'exhausted') {
          if (rangeRead.usedFracOfMedian < c.rangeGateMinUsedFrac) continue;
        } else if (rangeRead.usedFracOfMedian > c.rangeGateMaxUsedFrac) continue;

        if (c.entryBandMode === 'vwap') {
          const vw = vwapSeries[j];
          if (vw == null || Math.abs(bar.close - vw) > c.vwapBandAtrMult * atrSeries[j]) continue;
        } else {
          const span = leg.extremePrice - leg.originPrice;   // signed: >0 for up leg, <0 for down leg
          const retraceLo = leg.extremePrice - c.retraceMax * span;
          const retraceHi = leg.extremePrice - c.retraceMin * span;
          const lo = Math.min(retraceLo, retraceHi), hi = Math.max(retraceLo, retraceHi);
          if (bar.close < lo || bar.close > hi) continue;   // confirmation bar must CLOSE inside the retracement band
        }

        // Structural stop: beyond the realised pullback's own extreme.
        let pullbackLow = Infinity, pullbackHigh = -Infinity;
        for (let k = leg.extremeIdx; k <= j; k++) {
          if (ctxBars[k].low < pullbackLow) pullbackLow = ctxBars[k].low;
          if (ctxBars[k].high > pullbackHigh) pullbackHigh = ctxBars[k].high;
        }
        const buffer = c.slBufferAtrMult * atrSeries[j];

        signal = { j, leg, rangeRead, isBuy: leg.dir === 'up', pullbackLow, pullbackHigh, buffer };
        break;   // first qualifying setup from scanStart onward
      }

      if (!signal) break;   // no (more) qualifying setups today

      const entryBar = ctxBars[signal.j + 1];
      const entry = entryBar.open;
      const isBuy = signal.isBuy;
      const sl = isBuy ? signal.pullbackLow - signal.buffer : signal.pullbackHigh + signal.buffer;
      const stopDist = Math.abs(entry - sl);
      if (!(stopDist > 0)) break;
      const tp = isBuy ? entry + c.rr * stopDist : entry - c.rr * stopDist;

      const fillBars = ctxBars.slice(signal.j + 1);
      const r = walkBars(fillBars, entry, tp, sl, isBuy, 'stop', dayOpen);
      if (!r || !r.filled) break;

      const grossPct = r.pnlPct;
      const netPct = +(grossPct - cost).toFixed(5);
      const riskPctPrice = stopDist / entry * 100;
      const rMult = +(netPct / riskPctPrice).toFixed(4);
      const maeFrac = maeFromPath(packed, r.fillTime ?? dStart, r.exitTime, entry, isBuy);
      const maePct = +(maeFrac * 100).toFixed(5);
      const maeR = +(maeFrac * 100 / riskPctPrice).toFixed(4);

      const date = isoDay(dStart);
      records.push({ filled: true, pnl_pct: netPct, date });
      const cum = (equity.length ? equity[equity.length - 1] : 0) + rMult;
      equity.push(cum);
      trades.push({
        date, instrument, side: isBuy ? 'BUY' : 'SELL',
        entry: +entry.toFixed(6), sl: +sl.toFixed(6), tp: +tp.toFixed(6),
        legDir: signal.leg.dir, legOrigin: +signal.leg.originPrice.toFixed(6), legExtreme: +signal.leg.extremePrice.toFixed(6),
        legOriginTime: ctxBars[signal.leg.originIdx].time, legExtremeTime: ctxBars[signal.leg.extremeIdx].time,
        rangeUsedFracOfMedian: +signal.rangeRead.usedFracOfMedian.toFixed(3),
        rangeLivePct: +(signal.rangeRead.livePct * 100).toFixed(3),
        rangeMedianPct: +(signal.rangeRead.medianPct * 100).toFixed(3),
        outcome: r.outcome, grossPct: +grossPct.toFixed(5), netPct, rMult,
        maePct, maeR, riskAmount: +riskAmount.toFixed(2),
        pnlCcy: +(riskAmount * rMult).toFixed(2),
        fillTime: r.fillTime, exitTime: r.exitTime, cumR: +cum.toFixed(4),
      });
      tradesToday++;
      if (tradesToday >= c.maxTradesPerDay) break;

      // Resume scanning strictly after this trade's own exit bar; fold the
      // skipped in-trade bars into the running day-range first, so the next
      // signal's range-exhaustion gate still sees the FULL session-so-far
      // range, not just the bars the pivot scan actually visited.
      if (!ctxTimes) ctxTimes = ctxBars.map(b => b.time);
      const exitIdx = r.exitTime != null ? bisect(ctxTimes, r.exitTime) : ctxBars.length;
      for (let k = signal.j + 1; k <= exitIdx && k < ctxBars.length; k++) {
        if (ctxBars[k].high > runningHigh) runningHigh = ctxBars[k].high;
        if (ctxBars[k].low < runningLow) runningLow = ctxBars[k].low;
      }
      scanStart = exitIdx + 1;
    }
  }

  return {
    trades, records,
    meta: {
      instrument, days: daily.length,
      from: daily[0] ? isoDay(daily[0].time) : null,
      to: daily[daily.length - 1] ? isoDay(daily[daily.length - 1].time) : null,
      cost, cfg: c,
    },
  };
}

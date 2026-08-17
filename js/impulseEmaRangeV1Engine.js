/**
 * Impulse/EMA/Range-Exhaustion Engine (v1) — a mechanised formalisation of a
 * discretionary intraday pattern observed second-hand (a colleague's posted
 * "test" trades on 1-minute Gold and Nasdaq charts, tagging @C.OG): an
 * impulsive swing leg, a fast/slow EMA cross confirming the leg's direction,
 * and a same-day session-range read used as an exhaustion gate, entered on a
 * pullback into the leg's 38.2–61.8% retracement with a structural stop.
 *
 * This is NOT a reconstruction of any specific trade — the sandbox cannot
 * reach OANDA live (403) and the cached M1 series ends 2026-06-05, before the
 * screenshots' dates (13–14 Aug 2026). It is one falsifiable, low-DOF
 * formalisation of the VISIBLE pattern (impulse + EMA + range-exhaustion +
 * pullback continuation), run honestly on the full real M1 history that IS
 * available (2016-01 → 2026-06, both instruments) to test whether the STYLE
 * has edge — not whether any one screenshot's trade specifically worked.
 *
 * Every discretionary judgment below is a PINNED call (Lego/Build-Plan
 * discipline — see docs/ColezTrades_Backtest_Build_Plan.md §1), stated here so
 * a different pin can be tried later without re-deriving the whole engine:
 *
 *   - Impulse leg = the most recent confirmed swing (pivotHighs/pivotLows,
 *     `pivotN` bars either side) whose size ≥ `impulseAtrMult` × ATR(atrPeriod)
 *     on the entry timeframe. This is the "impulse move measurement" element.
 *   - Direction = CONTINUATION of the impulse (buy pullbacks in an up leg,
 *     sell pullbacks in a down leg) — not a fade of the leg's extreme. Chosen
 *     because the gold screenshots show entries taken mid-trend, following the
 *     prevailing impulse, not against it.
 *   - EMA(emaFast) vs EMA(emaSlow) must agree with the impulse direction at
 *     the confirmation bar — the "EMA cross" element (blue lines visible in
 *     one screenshot crossing right at the reversal/continuation point).
 *   - Range-exhaustion gate: today's session range-so-far, ranked against the
 *     trailing `rangeLookbackDays` sessions' full H-L% (js/rangePercentileCore.js),
 *     must be ≤ `rangeGateMaxUsedFrac` × the trailing median — i.e. only take
 *     the continuation while the day hasn't already used up a typical day's
 *     range. This operationalises the "Live / Median / 75th Pct" tool visible
 *     in one screenshot.
 *   - Entry = confirmation-bar CLOSE inside the leg's `retraceMin`–`retraceMax`
 *     retracement, filled as a STOP at the NEXT bar's open (no lookahead; no
 *     ambiguous same-bar limit fill).
 *   - Stop = beyond the realised pullback's own extreme (the lowest low / highest
 *     high between the impulse's turning point and the confirmation bar), plus
 *     a small ATR buffer — "beyond recent market structure", the stop-placement
 *     hierarchy's preferred rule (`MD files/ZONE_TRADE_DECISION_FRAMEWORK.md`).
 *   - Target = fixed `rr` × stop distance. `maxTradesPerDay` (default 1, first
 *     qualifying setup) matches this engine family's existing convention
 *     (js/poiReactionV1Engine.js) and the ~1-trade/day cadence COG's own
 *     observed system runs at (`MD files/COG_OBSERVED_SYSTEM.md` §4b). Set
 *     >1 to resume scanning right after each trade's own exit, same day —
 *     tested in education/jordan_impulse_range_backtest/MULTI_TRADE_PER_DAY.md
 *     (also null; default stays 1, this cfg is fully backward-compatible).
 *
 * Contract (pure; no network, no DOM):
 *   runImpulseEmaRange(packed, cfg) → { trades[], records[], meta }
 *     packed  = loadM1ForPair(...) shape { n, times, opens, highs, lows, closes, volumes }
 *     records = [{ filled, pnl_pct, date }]  — the shape summarizeSplit consumes
 *     trades  = rich per-trade log (entry/sl/tp/side/leg/gate reads/MAE/R) for CSV + charts
 *
 * No lookahead: pivots are only used once their confirmation window (±pivotN)
 * has fully elapsed at the evaluation bar; EMA/ATR are causal running series
 * over each day's own context window; the range gate reads only D1 bars
 * strictly before today and the running high/low up to the evaluation bar.
 */

import { extractBars, resampleTo, bisect } from './barUtils.js';
import { pivotHighs, pivotLows, computeATR } from './patternEngine.js';
import { ema } from './indicatorCore.js';
import { walkBars } from './forecastCore.js';
import { pipSize, assetClass as assetClassOf } from './instrumentRegistry.js';
import { rangeExhaustionRead } from './rangePercentileCore.js';

const DAY = 86400;

// Round-trip friction as % of price, by asset class — same figures as
// forecastCore/poiReactionV1Engine (spread + commission; entry fills as a
// stop, not a limit, so this also stands in for a small amount of slippage).
const COST_PCT = { fx: 0.012, index: 0.010, commodity: 0.020 };

export const DEFAULT_CFG = {
  entryTfMin: 1,            // M1 — matches "these are all 1-minute charts"
  ctxLookbackDays: 2,       // prior context for EMA/pivot/ATR warmup, per day
  pivotN: 5,                // pivot confirmation half-window (bars each side)
  atrPeriod: 14,
  impulseAtrMult: 2.5,      // leg must be ≥ this × ATR to count as "impulsive"
  emaFast: 9,
  emaSlow: 21,
  retraceMin: 0.382,
  retraceMax: 0.618,
  rangeLookbackDays: 20,
  rangeGateMaxUsedFrac: 1.0, // require live/median ≤ this (room left in the day's range)
  slBufferAtrMult: 0.25,
  rr: 2.0,
  warmupDays: 30,
  oosFrac: 0.4,
  account: 10000,
  riskPct: 1.0,
  maxTradesPerDay: 1,       // pinned baseline (see file header); >1 scans on after each trade's own exit
};

// Build all completed D1 bars from packed M1 in one pass (UTC-day buckets).
// A local copy, not yet an extracted brick — this exact loop is also inlined
// in js/poiReactionV1Engine.js, js/rangeExtEngine.js, js/backtest-worker.js and
// js/gold-backtest-worker.js (4 independent copies now with this one; flagged
// as a LEGO_MODULES.md candidate rather than extracted here, to avoid touching
// those files' own tested call sites in this change).
function buildDaily(packed) {
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

// MAE (maximum adverse excursion) read off the REAL M1 path between fill and
// exit, never approximated from the close — same discipline as
// poiReactionV1Engine's maeFromPath. Returns the adverse move as a positive
// fraction of the entry price.
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

// The most recent CONFIRMED impulse leg as of bar index `j` (bars strictly
// after j+pivotN are never touched — see pivot-confirmation note in the file
// header). Returns { originIdx, originPrice, extremeIdx, extremePrice, dir }
// or null if no confirmed alternating pivot pair qualifies as impulsive yet.
function lastConfirmedImpulse(bars, pivH, pivL, j, pivotN, atrSeries, impulseAtrMult) {
  const atr = atrSeries[j];
  if (!(atr > 0)) return null;
  const known = [];
  for (const p of pivH) { if (p.idx + pivotN <= j) known.push({ ...p, kind: 'H' }); }
  for (const p of pivL) { if (p.idx + pivotN <= j) known.push({ ...p, kind: 'L' }); }
  known.sort((a, b) => a.idx - b.idx);
  if (known.length < 2) return null;
  // Walk backward for the most recent adjacent pair of OPPOSITE kind.
  for (let k = known.length - 1; k > 0; k--) {
    const a = known[k], b = known[k - 1];
    if (a.kind === b.kind) continue;
    const legSize = Math.abs(a.price - b.price);
    if (legSize < impulseAtrMult * atr) return null;   // most recent leg isn't impulsive — stop (don't reach further back)
    return a.kind === 'H'
      ? { originIdx: b.idx, originPrice: b.price, extremeIdx: a.idx, extremePrice: a.price, dir: 'up' }
      : { originIdx: b.idx, originPrice: b.price, extremeIdx: a.idx, extremePrice: a.price, dir: 'down' };
  }
  return null;
}

/**
 * Run the impulse/EMA/range-exhaustion backtest for one instrument's packed
 * M1 series.
 */
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
        if (!rangeRead || rangeRead.usedFracOfMedian == null || rangeRead.usedFracOfMedian > c.rangeGateMaxUsedFrac) continue;

        const span = leg.extremePrice - leg.originPrice;   // signed: >0 for up leg, <0 for down leg
        const retraceLo = leg.extremePrice - c.retraceMax * span;
        const retraceHi = leg.extremePrice - c.retraceMin * span;
        const lo = Math.min(retraceLo, retraceHi), hi = Math.max(retraceLo, retraceHi);
        if (bar.close < lo || bar.close > hi) continue;   // confirmation bar must CLOSE inside the retracement band

        // Structural stop: beyond the realised pullback's own extreme (from the
        // leg's turning point through the confirmation bar), not an arbitrary
        // fixed distance — "Best: stop just beyond swing_origin" per
        // MD files/ZONE_TRADE_DECISION_FRAMEWORK.md.
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

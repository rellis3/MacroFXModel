/**
 * ATR-Band Mean-Reversion Entry Engine (v1) — a genuinely dynamic (bar-to-bar
 * recalculated) band-touch entry, distinct from the pinned impulse/EMA/
 * range-exhaustion rule in `js/impulseEmaRangeV1Engine.js`.
 *
 * Origin: a session member ("Jordan", tagging @C.OG) posted screenshots of a
 * green/red zone overlay under live iterative testing on fast Gold/NQ charts.
 * `education/jordan_impulse_range_backtest/RESULTS.md` re-read those SAME
 * screenshots and concluded the colored rectangle is most likely TradingView's
 * built-in Long/Short Position drawing tool (a manual per-trade entry/stop/
 * target annotation), not a computed indicator — see that file and
 * `education/jordan_video_transcripts/JORDAN_VIDEO_INSIGHTS.md`'s Priority
 * Watch section for the full reasoning. This engine is therefore NOT an
 * attempt to reverse-engineer Jordan's specific tool. It formalises a
 * DIFFERENT, mechanically distinct idea floated independently: can an actual
 * rolling ATR-based band (basis EMA ± k×ATR, recalculated every bar, the way
 * a real Keltner/Bollinger-family indicator works) generate a tradeable
 * intraday mean-reversion entry, regime-gated by ADX the way this group's
 * transcripts describe (`ADX~30 on 4H: below = mean reversion, above =
 * trend`)? Building it on the merits, not to match a screenshot.
 *
 * Every discretionary judgment below is a PINNED call (Lego/Build-Plan
 * discipline, same as the sibling engine), stated here so a different pin can
 * be tried later without re-deriving the whole engine:
 *
 *   - Basis = EMA(emaPeriod) of M1 close. A moving average, not a fixed
 *     session range — this is what makes the band genuinely dynamic.
 *   - Band width = ATR(atrPeriod), Wilder-smoothed (`indicatorCore.atrWilder`)
 *     — the SAME ATR variant and period already used for stop sizing
 *     elsewhere in this repo's transcripts-derived material, so one
 *     volatility unit is reused consistently rather than introducing a
 *     second (classic stdev) with no transcript support.
 *   - Entry zone = price beyond basis ± `zoneMult`×ATR, but inside
 *     ± `extremeMult`×ATR (beyond that: "in discovery", no fade — mirrors
 *     the group's stated behaviour of not fading once price has moved many
 *     multiples beyond a reference range).
 *   - Regime gate = ADX(adxPeriod) on `adxTfMin`-resampled bars (default 4H),
 *     read causally from the most recently COMPLETED higher-timeframe bar.
 *     Only take the fade when ADX < `adxMax` (ranging regime) — the group's
 *     stated threshold (~30 on 4H) for "mean reversion works better in
 *     ranging markets".
 *   - Confirmation = the bar that first closes beyond the zone is NOT
 *     tradeable itself; the NEXT bar must close back toward basis (i.e. the
 *     touch bar's extreme direction reverses) before an entry is placed —
 *     "don't enter on a level touch, enter on a confirmation of the level
 *     holding" (`MD files/ZONE_TRADE_DECISION_FRAMEWORK.md` Layer 7).
 *   - Fill = a guaranteed fill at the bar AFTER the confirmation bar's OPEN
 *     (via `walkBars` with `entryType:'stop'`, entry price == that bar's own
 *     open) — no lookahead, no same-bar limit-fill ambiguity, identical
 *     pattern to the sibling engine.
 *   - Stop = beyond the confirmation bar's own extreme (the side away from
 *     basis) + a small ATR buffer — "beyond recent market structure", this
 *     repo's stated stop-placement preference.
 *   - Target = the basis (EMA) itself for the baseline — a genuine
 *     mean-reversion target, not a fixed RR (a fixed-RR variant is a
 *     follow-up, not the baseline, per the minimal-DOF-first rule).
 *   - One trade per day, first qualifying setup — matches this engine
 *     family's existing convention.
 *
 * Contract (pure; no network, no DOM):
 *   runAtrBandEntry(packed, cfg) → { trades[], records[], meta }
 *     packed  = loadM1ForPair(...) shape { n, times, opens, highs, lows, closes, volumes }
 *     records = [{ filled, pnl_pct, date }]  — the shape summarizeSplit consumes
 *     trades  = rich per-trade log (entry/sl/tp/side/band reads/MAE/R) for CSV + charts
 *
 * No lookahead: EMA/ATR are causal running series over each day's own context
 * window; ADX reads only the most recently COMPLETED higher-timeframe bar as
 * of the evaluation bar (never the still-forming one); the fill happens on
 * the bar AFTER the confirmation bar's close.
 */

import { extractBars, resampleTo } from './barUtils.js';
import { ema, atrWilder, adxWilder } from './indicatorCore.js';
import { walkBars } from './forecastCore.js';
import { assetClass as assetClassOf } from './instrumentRegistry.js';

const DAY = 86400;

// Round-trip friction as % of price, by asset class — identical figures to
// impulseEmaRangeV1Engine / poiReactionV1Engine (spread + commission; entry
// fills as a stop, so this also stands in for a small amount of slippage).
const COST_PCT = { fx: 0.012, index: 0.010, commodity: 0.020 };

export const DEFAULT_CFG = {
  entryTfMin: 1,             // M1 — matches "these are all fast intraday charts"
  ctxLookbackDays: 2,        // prior context for EMA/ATR warmup, per day
  emaPeriod: 20,
  atrPeriod: 14,
  zoneMult: 2.5,             // entry zone = basis +/- zoneMult*ATR
  extremeMult: 4.0,          // beyond this many ATRs: skip, "in discovery"
  adxPeriod: 14,
  adxTfMin: 240,             // 4H, matches the group's stated ADX timeframe
  adxMax: 30,                // fade only when ADX(4H) < this (ranging regime)
  slBufferAtrMult: 0.25,
  warmupDays: 30,
  oosFrac: 0.4,
  account: 10000,
  riskPct: 1.0,
};

// Build all completed D1 bars from packed M1 in one pass (UTC-day buckets).
// Deliberately a local copy — see the note in impulseEmaRangeV1Engine.js on
// this exact loop existing independently in several files already; not
// re-extracted here to avoid touching those files' tested call sites.
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
// exit — same discipline as the sibling engine's maeFromPath.
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

// Causal ADX-on-higher-timeframe lookup, built ONCE over the full packed
// history (not per-day) — Wilder ADX(14) needs >=2*period+2 completed bars of
// warmup (>=30 bars of 4H = 5 days); a per-day 2-3 day context window never
// warms up and silently returns an all-zero series, which then reads as
// "always null" and rejects every setup. Building it once over the whole
// series avoids re-paying that warmup every day AND fixes the bug.
// Returns a function bar-time -> adx|null. O(n) build, O(log n) per lookup.
function buildCausalAdxLookup(packed, adxTfMin, adxPeriod) {
  const { n, times } = packed;
  const fullBars = extractBars(packed, times[0], times[n - 1] + 60);
  const htfBars = resampleTo(fullBars, adxTfMin);
  const adx = adxWilder(htfBars, adxPeriod);
  const tfSecs = adxTfMin * 60;
  // completedAt[i] = htfBars[i].time + tfSecs (when that bar's ADX becomes knowable)
  const completedAt = htfBars.map(b => b.time + tfSecs);
  return (t) => {
    // last index i where completedAt[i] <= t
    let lo = 0, hi = completedAt.length;
    while (lo < hi) { const m = (lo + hi) >>> 1; if (completedAt[m] <= t) lo = m + 1; else hi = m; }
    const idx = lo - 1;
    if (idx < 0) return null;
    const v = adx[idx];
    return Number.isFinite(v) && v > 0 ? v : null;
  };
}

/**
 * Run the ATR-band mean-reversion backtest for one instrument's packed M1
 * series.
 */
export function runAtrBandEntry(packed, cfg = {}) {
  const c = { ...DEFAULT_CFG, ...cfg };
  const instrument = c.instrument;
  if (!instrument) throw new Error('runAtrBandEntry: cfg.instrument required');
  const klass = c.assetClass ?? assetClassOf(instrument);
  const cost = c.costPct ?? (COST_PCT[klass] ?? COST_PCT.fx);
  const riskAmount = c.account * c.riskPct / 100;

  const daily = buildDaily(packed);
  if (daily.length < c.warmupDays + 2) {
    return { trades: [], records: [], meta: { instrument, days: daily.length, note: 'insufficient history' } };
  }

  const trades = [];
  const records = [];
  const equity = [];

  // Built ONCE over the full history — see buildCausalAdxLookup's header note.
  const adxAt = buildCausalAdxLookup(packed, c.adxTfMin, c.adxPeriod);

  for (let di = c.warmupDays; di < daily.length; di++) {
    const dStart = daily[di].time;
    const dEnd = dStart + DAY;
    const ctxStart = dStart - c.ctxLookbackDays * DAY;

    const ctxBars = resampleTo(extractBars(packed, ctxStart, dEnd), c.entryTfMin);
    if (ctxBars.length < 50) continue;
    const todayStartIdx = ctxBars.findIndex(b => b.time >= dStart);
    if (todayStartIdx < 0 || todayStartIdx >= ctxBars.length - 2) continue;

    const closes = ctxBars.map(b => b.close);
    const basisSeries = ema(closes, c.emaPeriod);
    const atrSeries = atrWilder(ctxBars, c.atrPeriod);

    let touchBar = null;   // { j, side: 'above'|'below' } — first bar to exit the zone
    let signal = null;

    for (let j = todayStartIdx; j < ctxBars.length - 1; j++) {
      const bar = ctxBars[j];
      const basis = basisSeries[j];
      const atr = atrSeries[j];
      if (!(basis > 0) || !(atr > 0)) continue;

      const distAtr = (bar.close - basis) / atr;   // signed: >0 above basis, <0 below

      if (!touchBar) {
        // Look for the FIRST bar this day that closes into the entry zone
        // (beyond zoneMult, still inside extremeMult).
        if (Math.abs(distAtr) >= c.zoneMult && Math.abs(distAtr) < c.extremeMult) {
          touchBar = { j, side: distAtr > 0 ? 'above' : 'below' };
        }
        continue;
      }

      // Confirmation bar: the bar AFTER the touch, must show reversion
      // (close moved back toward basis vs. the touch bar's close).
      if (j !== touchBar.j + 1) { touchBar = null; continue; } // only the immediate next bar counts

      const touchClose = ctxBars[touchBar.j].close;
      const revertedTowardBasis = touchBar.side === 'above'
        ? bar.close < touchClose
        : bar.close > touchClose;
      if (!revertedTowardBasis) { touchBar = null; continue; }

      const adx = adxAt(bar.time);
      if (adx == null || adx >= c.adxMax) { touchBar = null; continue; } // regime gate: ranging only, v1

      const isBuy = touchBar.side === 'below';   // price was below basis -> fade = buy
      const confirmExtreme = isBuy ? Math.min(ctxBars[touchBar.j].low, bar.low)
                                    : Math.max(ctxBars[touchBar.j].high, bar.high);
      const buffer = c.slBufferAtrMult * atr;

      signal = { j, isBuy, confirmExtreme, buffer, basis, atr, distAtr, adx };
      break;   // one trade per day: first qualifying setup
    }

    if (!signal) continue;
    if (signal.j + 1 >= ctxBars.length) continue;

    // Fill at the NEXT bar's open, guaranteed (no lookahead, no same-bar
    // limit-fill ambiguity) — same pattern as impulseEmaRangeV1Engine.js.
    const entryBar = ctxBars[signal.j + 1];
    const entry = entryBar.open;
    const isBuy = signal.isBuy;
    const sl = isBuy ? signal.confirmExtreme - signal.buffer : signal.confirmExtreme + signal.buffer;
    const stopDist = Math.abs(entry - sl);
    if (!(stopDist > 0)) continue;
    const tp = signal.basis;   // mean-reversion target = the basis line
    if ((isBuy && tp <= entry) || (!isBuy && tp >= entry)) continue;   // target must be on the right side

    const fillBars = ctxBars.slice(signal.j + 1);
    const dayOpen = ctxBars[todayStartIdx].open;
    const r = walkBars(fillBars, entry, tp, sl, isBuy, 'stop', dayOpen);
    if (!r || !r.filled) continue;

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
      basis: +signal.basis.toFixed(6), atr: +signal.atr.toFixed(6),
      distAtrAtTouch: +signal.distAtr.toFixed(3), adxAtEntry: +signal.adx.toFixed(2),
      outcome: r.outcome, grossPct: +grossPct.toFixed(5), netPct, rMult,
      maePct, maeR, riskAmount: +riskAmount.toFixed(2),
      pnlCcy: +(riskAmount * rMult).toFixed(2),
      fillTime: r.fillTime, exitTime: r.exitTime, cumR: +cum.toFixed(4),
    });
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

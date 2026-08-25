/**
 * Impulse 4H Range-Levels Engine — mechanises the Pine indicator at
 * education/jordan_video_transcripts/impulse_4h_range_levels.pine ("Husky's"
 * untested idea, video 17): detect a standout 4H "impulse" candle and draw a
 * 45-level fib-style range-extension ladder anchored to that single candle's
 * own wick high/low, then DESCRIBE what price actually did against that
 * ladder afterward — level hit-rates, how far along the ladder price travels
 * before exhausting, the size of the reversal once it does, whether that's a
 * function of the impulse's own size, and whether VWAP is involved.
 *
 * This is NOT a lookahead-free trading rule. Several of the statistics below
 * (exhaustion fib level, reversal magnitude) are computed by looking at the
 * FULL forward path within a bounded horizon after the impulse — a genuine
 * historical/descriptive characterization, not something knowable in real
 * time at the moment the impulse confirms. Only the impulse DETECTION itself
 * (which candle qualifies) is causal/no-lookahead, matching the Pine script's
 * `barstate.isconfirmed` gate. This distinction is intentional and must be
 * preserved in any write-up that uses these numbers (see RESULTS.md).
 *
 * The one piece of this file that IS meant to model a real, causally-fillable
 * trade is `simulateContinuationTrade` — a single pinned hypothesis ("what if
 * you just took the impulse's own continuation with a ladder target and a
 * structural stop") used only for the MAE/dynamic-stop analysis, which asks a
 * narrower, honest question: do LOSING instances of that specific trade
 * reveal themselves early via a fast adverse move, the way
 * education/jordan_impulse_range_backtest/MAE_DYNAMIC_STOP.md tested for a
 * different engine? It is explicitly not sold as a validated system.
 *
 * Contract (pure; no network, no DOM):
 *   packed = loadM1ForPair(...) shape { n, times, opens, highs, lows, closes, volumes }
 *   runImpulse4hRangeLevels(packed, cfg, pairKey) -> { impulses: record[], meta }
 *     record = { time, date, bullish, open, high, low, close, range, atr,
 *                rangeAtrMult, bodyRatio, levelsTouched: {fib: bool},
 *                maxExtFib, exhaustionFibRung, exhaustionPrice, exhaustionTime,
 *                reversalAtr, reversalFibUnits, reversalWindowTruncated,
 *                vwapDistAtrAtImpulse, vwapDistAtrAtExhaustion,
 *                vwapTouchedWithinHorizon, horizonBoundedByNextImpulse, trade }
 */

import { resampleToH4 } from './entryTriggerLabEngine.js';
import { atrWilder } from './indicatorCore.js';
import { computeSessionVwap } from './vwapReversionEngine.js';

// Same asymmetric ladder used elsewhere in this repo for range-extension
// levels (matches the Pine script's FIB array verbatim).
export const FIB = [
  -9.5, -9.0, -8.5, -8.0, -7.5, -7.0, -6.5, -6.0, -5.5, -5.0, -4.5, -4.0, -3.5, -3.0, -2.5, -2.0, -1.5, -1.0, -0.5,
  -0.25, 0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5,
  2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0, 7.5, 8.0, 8.5, 9.0, 9.5, 10.0, 10.5,
];

export const ladderPrice = (low, high, fib) => low + (high - low) * fib;

const DAY = 86400;
const H4 = 4 * 3600;

// Per-instrument cost/asset-class table — same figures used elsewhere in this
// repo (js/impulseEmaRangeV1Engine.js COST_PCT: fx 0.012, index 0.010,
// commodity 0.020 round-trip, % of price). Hardcoded here (not resolved via
// instrumentRegistry.js) because our pair keys are the local parquet file
// keys (xauusd, nas100_usd, ...), not that registry's own key set (gold, nq).
export const INSTRUMENT_META = {
  xauusd:     { assetClass: 'commodity', costPct: 0.020 },
  nas100_usd: { assetClass: 'index',     costPct: 0.010 },
  us30:       { assetClass: 'index',     costPct: 0.010 },
  spx500:     { assetClass: 'index',     costPct: 0.010 },
  de30:       { assetClass: 'index',     costPct: 0.010 },
  uk100:      { assetClass: 'index',     costPct: 0.010 },
  eurusd:     { assetClass: 'fx',        costPct: 0.012 },
  gbpusd:     { assetClass: 'fx',        costPct: 0.012 },
  usdjpy:     { assetClass: 'fx',        costPct: 0.012 },
  audusd:     { assetClass: 'fx',        costPct: 0.012 },
  usdcad:     { assetClass: 'fx',        costPct: 0.012 },
};
export const metaFor = pairKey => INSTRUMENT_META[pairKey] || { assetClass: 'fx', costPct: 0.012 };

export const DEFAULT_CFG = {
  atrLen: 14,
  impulseMult: 1.5,          // ATR floor, matches Pine default
  minBodyRatio: 0.6,         // matches Pine default
  rangeLookback: 20,         // matches Pine default
  cooldownBars: 20,          // matches Pine default (in 4H bars)
  horizonH4Bars: 240,        // ~40 days — cap on the forward-looking window used for
                              // descriptive stats when no later impulse arrives sooner
  targetFib: 2.0,            // pinned continuation-trade target rung (bullish; mirrored for bearish)
  slBufferAtrMult: 0.25,     // pinned stop buffer beyond the impulse candle's own opposite extreme
  entryFib: 2.0,             // fade-trade entry rung (bullish; mirrored 1-entryFib for bearish) — "2+" per the colleague's rule
  stopRungsOut: 1,           // fade-trade stop: this many ladder rungs beyond the entry level
  oosFrac: 0.4,
};

function isoDate(epochSec) {
  return new Date(epochSec * 1000).toISOString().slice(0, 10);
}

function bsearch(times, t) {
  let lo = 0, hi = times.length;
  while (lo < hi) { const m = (lo + hi) >>> 1; if (times[m] < t) lo = m + 1; else hi = m; }
  return lo;
}

// ── H4 bars + causal ATR(14) ──────────────────────────────────────────────
// resampleToH4 buckets by wall-clock 4H (epoch-aligned, so 00/04/08/12/16/20
// UTC — standard 4H session boundaries), already used elsewhere in this repo
// (js/entryTriggerLabEngine.js). atrWilder matches the Pine script's ta.atr
// (Wilder smoothing) and, like ta.atr at a bar's close, includes that bar's
// own true range — exactly the causal "as of this bar's confirm" read the
// Pine script's `eligible` gate uses.
export function buildH4(packed) {
  const { n, times, opens, highs, lows, closes } = packed;
  const m1Bars = new Array(n);
  for (let i = 0; i < n; i++) m1Bars[i] = { time: times[i], open: opens[i], high: highs[i], low: lows[i], close: closes[i] };
  const h4Bars = resampleToH4(m1Bars);
  const atr = atrWilder(h4Bars, DEFAULT_CFG.atrLen);
  return { h4Bars, atr };
}

// ── Impulse detection — causal, bar-by-bar, matches the Pine script exactly ──
export function detectImpulses(h4Bars, atr, cfg) {
  const { impulseMult, minBodyRatio, rangeLookback, cooldownBars, atrLen } = cfg;
  const rngs = new Float64Array(h4Bars.length);
  for (let i = 0; i < h4Bars.length; i++) rngs[i] = h4Bars[i].high - h4Bars[i].low;

  const impulses = [];
  let barsSinceImpulse = 999999;
  for (let i = 0; i < h4Bars.length; i++) {
    barsSinceImpulse += 1;
    if (i < atrLen) continue;                 // ATR warmup — "not na(atr)"
    const a = atr[i];
    const rng = rngs[i];
    if (!(a > 0) || !(rng > 0)) continue;
    const body = Math.abs(h4Bars[i].close - h4Bars[i].open);
    const eligible = rng >= impulseMult * a && (body / rng) >= minBodyRatio;
    if (!eligible) continue;
    const start = Math.max(0, i - rangeLookback + 1);
    let mx = 0;
    for (let j = start; j <= i; j++) if (rngs[j] > mx) mx = rngs[j];
    const isLocalMax = rng >= mx;
    if (!isLocalMax) continue;
    if (barsSinceImpulse <= cooldownBars) continue;
    barsSinceImpulse = 0;
    const b = h4Bars[i];
    const bullish = b.close > b.open;
    impulses.push({
      idx: i, time: b.time, date: isoDate(b.time),
      open: b.open, high: b.high, low: b.low, close: b.close,
      bullish, range: rng, atr: a, rangeAtrMult: rng / a, bodyRatio: body / rng,
    });
  }
  return impulses;
}

// ── Session (UTC calendar day) VWAP for the whole M1 series, computed once ──
// Reuses js/vwapReversionEngine.js's computeSessionVwap (the one VWAP
// primitive in this repo) per UTC day, then flattens the per-day arrays back
// into one series aligned 1:1 with packed's bars — avoids recomputing per
// impulse. Same day-bucketing convention (UTC calendar day) that
// vwapReversionEngine's own `sessionBucket('day', ...)` uses.
export function buildDailyVwapSeries(packed) {
  const { n, times, highs, lows, closes, volumes } = packed;
  const vwap = new Float64Array(n);
  let dayStart = 0;
  while (dayStart < n) {
    const dayKey = Math.floor(times[dayStart] / DAY);
    let dayEnd = dayStart + 1;
    while (dayEnd < n && Math.floor(times[dayEnd] / DAY) === dayKey) dayEnd++;
    const len = dayEnd - dayStart;
    const dayBars = new Array(len);
    for (let k = 0; k < len; k++) {
      const idx = dayStart + k;
      dayBars[k] = { high: highs[idx], low: lows[idx], close: closes[idx], volume: volumes[idx] };
    }
    const { vwap: v } = computeSessionVwap(dayBars);
    for (let k = 0; k < len; k++) vwap[dayStart + k] = v[k];
    dayStart = dayEnd;
  }
  return vwap;
}

// ── Per-impulse forward analysis ─────────────────────────────────────────
// Walks the real M1 path from the impulse's H4 bar close to a bounded
// horizon (next impulse's own bar start, or horizonH4Bars converted to M1
// minutes, whichever comes first) and records: which ladder levels were
// touched, the furthest continuation-direction extension reached (the
// "exhaustion" point, a descriptive/backward-looking read of the whole
// window — NOT a real-time signal), the reversal size once that extreme
// passed, and VWAP distance at the impulse and at the exhaustion point.
export function analyzeImpulse(packed, vwapSeries, impulse, m1StartIdx, m1EndIdx) {
  const { times, highs, lows } = packed;
  const { low, high, range, atr, bullish } = impulse;

  const nFib = FIB.length;
  const fibPrices = new Float64Array(nFib);
  for (let f = 0; f < nFib; f++) fibPrices[f] = low + range * FIB[f];
  const touched = new Uint8Array(nFib);
  let touchedCount = 0;

  // "Own edge" reference: fib=1 (the candle's own high) for a bullish
  // impulse, fib=0 (the candle's own low) for a bearish one — extension is
  // only tracked from there onward, matching the ladder's own zero point.
  let extremeFib = bullish ? 1 : 0;
  let extremeIdx = m1StartIdx > 0 ? m1StartIdx - 1 : m1StartIdx;
  let extremePrice = bullish ? high : low;

  for (let i = m1StartIdx; i < m1EndIdx; i++) {
    const hi = highs[i], lo = lows[i];
    if (touchedCount < nFib) {
      for (let f = 0; f < nFib; f++) {
        if (touched[f]) continue;
        const p = fibPrices[f];
        if (lo <= p && hi >= p) { touched[f] = 1; touchedCount++; }
      }
    }
    if (bullish) {
      const upFib = (hi - low) / range;
      if (upFib > extremeFib) { extremeFib = upFib; extremeIdx = i; extremePrice = hi; }
    } else {
      const dnFib = (lo - low) / range;   // more negative = further extended below low
      if (dnFib < extremeFib) { extremeFib = dnFib; extremeIdx = i; extremePrice = lo; }
    }
  }

  // Reversal magnitude — furthest adverse (opposite-direction) move AFTER the
  // extreme point, within the same bounded horizon. If the extreme happens to
  // land on (or after) the last bar examined, there's no room left in the
  // window to observe a reversal — flagged, not silently reported as zero.
  let reversalPrice = extremePrice;
  for (let i = extremeIdx + 1; i < m1EndIdx; i++) {
    if (bullish) { if (lows[i] < reversalPrice) reversalPrice = lows[i]; }
    else         { if (highs[i] > reversalPrice) reversalPrice = highs[i]; }
  }
  const reversalDist = bullish ? (extremePrice - reversalPrice) : (reversalPrice - extremePrice);
  const reversalAtr = atr > 0 ? reversalDist / atr : null;
  const reversalFibUnits = range > 0 ? reversalDist / range : null;
  const reversalWindowTruncated = extremeIdx >= m1EndIdx - 1;

  // Nearest ladder rung actually reached, restricted to the continuation
  // side (fib >= 1 bullish / fib <= 0 bearish) — the furthest FIB array
  // level whose price was cleared by the true continuous extreme.
  let exhaustionFibRung = bullish ? 1 : 0;
  for (const f of FIB) {
    if (bullish && f <= extremeFib && f > exhaustionFibRung) exhaustionFibRung = f;
    if (!bullish && f >= extremeFib && f < exhaustionFibRung) exhaustionFibRung = f;
  }

  const vwapAtImpulseIdx = m1StartIdx > 0 ? m1StartIdx - 1 : m1StartIdx;
  const vwapAtImpulse = vwapSeries[vwapAtImpulseIdx] ?? null;
  const vwapAtExhaustion = vwapSeries[Math.min(extremeIdx, vwapSeries.length - 1)] ?? null;
  const vwapDistAtrAtImpulse = (vwapAtImpulse != null && atr > 0) ? (impulse.close - vwapAtImpulse) / atr : null;
  const vwapDistAtrAtExhaustion = (vwapAtExhaustion != null && atr > 0) ? (extremePrice - vwapAtExhaustion) / atr : null;

  // Did price touch (cross) VWAP within the horizon after the impulse, and if
  // so how many M1 bars did it take? A "touched eventually within up to 40
  // days" rate is close to guaranteed and uninformative on its own — the bar
  // count (and the same-UTC-day / next-day breakdown a caller can derive from
  // it) is the part that actually says something about the "moves back
  // toward VWAP" claim.
  let vwapTouched = false;
  let vwapTouchBars = null;
  for (let i = m1StartIdx; i < m1EndIdx; i++) {
    const v = vwapSeries[i];
    if (v == null) continue;
    if (lows[i] <= v && highs[i] >= v) { vwapTouched = true; vwapTouchBars = i - m1StartIdx; break; }
  }

  const levelsTouched = {};
  for (let f = 0; f < nFib; f++) levelsTouched[FIB[f]] = !!touched[f];

  return {
    levelsTouched,
    maxExtFib: +extremeFib.toFixed(4),
    exhaustionFibRung,
    exhaustionPrice: extremePrice,
    exhaustionTime: times[Math.min(extremeIdx, times.length - 1)] ?? null,
    reversalAtr: reversalAtr != null ? +reversalAtr.toFixed(4) : null,
    reversalFibUnits: reversalFibUnits != null ? +reversalFibUnits.toFixed(4) : null,
    reversalWindowTruncated,
    vwapDistAtrAtImpulse: vwapDistAtrAtImpulse != null ? +vwapDistAtrAtImpulse.toFixed(4) : null,
    vwapDistAtrAtExhaustion: vwapDistAtrAtExhaustion != null ? +vwapDistAtrAtExhaustion.toFixed(4) : null,
    vwapTouchedWithinHorizon: vwapTouched,
    vwapTouchBars: vwapTouchBars,
  };
}

// ── Pinned continuation-trade hypothesis (for the MAE/stop analysis ONLY) ──
// Entry: next M1 bar's open after the impulse H4 candle closes, same
// direction as the impulse (continuation). Stop: beyond the impulse candle's
// own opposite extreme + a small ATR buffer ("beyond recent structure", this
// repo's preferred stop rule elsewhere). Target: the ladder rung at
// cfg.targetFib (bullish) or its mirror 1-cfg.targetFib (bearish) — an
// extension distance of (targetFib-1)*range beyond the candle's own edge in
// both directions. This is ONE pinned, low-DOF formalisation, not a fitted
// or validated system.
export function simulateContinuationTrade(packed, impulse, m1StartIdx, m1EndIdx, cfg, costPct) {
  const { times, highs, lows, closes, opens } = packed;
  if (m1StartIdx >= m1EndIdx || m1StartIdx >= times.length) return null;
  const { low, high, range, atr, bullish } = impulse;
  const entry = opens[m1StartIdx];
  const sl = bullish ? low - cfg.slBufferAtrMult * atr : high + cfg.slBufferAtrMult * atr;
  const targetFibEff = bullish ? cfg.targetFib : (1 - cfg.targetFib);
  const tp = ladderPrice(low, high, targetFibEff);
  const stopDist = Math.abs(entry - sl);
  if (!(stopDist > 0)) return null;

  let outcome = null, exitPrice = null, exitIdx = null, barsHeld = 0;
  for (let i = m1StartIdx; i < m1EndIdx; i++, barsHeld++) {
    if (bullish) {
      if (lows[i] <= sl) { outcome = 'loss'; exitPrice = sl; exitIdx = i; break; }
      if (highs[i] >= tp) { outcome = 'win'; exitPrice = tp; exitIdx = i; break; }
    } else {
      if (highs[i] >= sl) { outcome = 'loss'; exitPrice = sl; exitIdx = i; break; }
      if (lows[i] <= tp) { outcome = 'win'; exitPrice = tp; exitIdx = i; break; }
    }
  }
  if (outcome === null) {
    const lastIdx = Math.min(m1EndIdx, times.length) - 1;
    if (lastIdx < m1StartIdx) return null;
    exitPrice = closes[lastIdx]; exitIdx = lastIdx; barsHeld = lastIdx - m1StartIdx;
    outcome = 'horizon';
  }
  const grossPct = bullish ? (exitPrice - entry) / entry * 100 : (entry - exitPrice) / entry * 100;
  const netPct = grossPct - costPct;
  const riskPctPrice = stopDist / entry * 100;
  const rMult = riskPctPrice > 0 ? netPct / riskPctPrice : 0;
  const finalOutcome = outcome === 'horizon' ? (rMult > 0 ? 'win' : 'loss') : outcome;
  return {
    entry, sl, tp, stopDist, side: bullish ? 'BUY' : 'SELL',
    fillIdx: m1StartIdx, exitIdx, exitTime: times[exitIdx] ?? null, barsHeld,
    netPct: +netPct.toFixed(5), rMult: +rMult.toFixed(4), outcome: finalOutcome, horizonExit: outcome === 'horizon',
  };
}

// ── Pullback-continuation trade hypothesis (2026-08-23, evidence-driven) ────
// Real screenshots (Discord, "Jordan" posting real trades) checked against
// real market data pointed at TWO things simulateContinuationTrade above
// doesn't capture: entries anchored right at the impulse's own edge rather
// than a deep extension, and — the NAS100 2026-08-13 example specifically —
// an entry in the classic 38.2-61.8% Fibonacci retracement zone pulling
// BACK INTO the impulse before continuing in its own direction, not an
// immediate next-bar-open entry. That retracement band, expressed in this
// engine's fib coordinates (impulse low=0, high=1), is symmetric either
// direction: fib in [0.382, 0.618] — no bearish mirroring needed, unlike
// every other pinned trade in this file.
//
// Entry: resting limit at the shallow/first-reached edge of that band
// (fib=0.618 bullish price level, i.e. only a 38.2% pullback from the high;
// fib=0.382 for bearish, i.e. a 38.2% pullback from the low — same "1-fib"
// mirror convention used throughout this file, since 1-0.618=0.382) — same
// no-confirmation resting-limit style as the fade trade. Stop: beyond the
// FAR edge of the band (fib=0.382 bullish / 0.618 bearish) — "if it
// retraces deeper than the classic zone, this pullback read is wrong."
// Target: same cfg.targetFib rung as simulateContinuationTrade, for direct
// comparability — this isolates ONE variable (entry timing/quality) against
// the already-tested immediate-entry version, not several at once.
export function simulateRetracementContinuationTrade(packed, impulse, m1StartIdx, m1EndIdx, cfg, costPct) {
  const { times, highs, lows, closes } = packed;
  if (m1StartIdx >= m1EndIdx || m1StartIdx >= times.length) return { triggered: false };
  const { low, high, range, bullish } = impulse;
  if (!(range > 0)) return { triggered: false };

  const entryFibEff = bullish ? 0.618 : (1 - 0.618);   // = 0.382 bearish
  const stopFibEff = bullish ? 0.382 : (1 - 0.382);    // = 0.618 bearish
  const entryPrice = ladderPrice(low, high, entryFibEff);
  const sl = ladderPrice(low, high, stopFibEff);
  const targetFibEff = bullish ? cfg.targetFib : (1 - cfg.targetFib);
  const tp = ladderPrice(low, high, targetFibEff);
  const side = bullish ? 'BUY' : 'SELL';   // continuation = SAME direction as the impulse

  let fillIdx = -1;
  for (let i = m1StartIdx; i < m1EndIdx; i++) {
    if (lows[i] <= entryPrice && highs[i] >= entryPrice) { fillIdx = i; break; }
  }
  if (fillIdx === -1) return { triggered: false };

  let outcome = null, exitPrice = null, exitIdx = null, barsHeld = 0;
  for (let i = fillIdx; i < m1EndIdx; i++, barsHeld++) {
    if (side === 'BUY') {
      if (lows[i] <= sl) { outcome = 'loss'; exitPrice = sl; exitIdx = i; break; }
      if (highs[i] >= tp) { outcome = 'win'; exitPrice = tp; exitIdx = i; break; }
    } else {
      if (highs[i] >= sl) { outcome = 'loss'; exitPrice = sl; exitIdx = i; break; }
      if (lows[i] <= tp) { outcome = 'win'; exitPrice = tp; exitIdx = i; break; }
    }
  }
  if (outcome === null) {
    const lastIdx = Math.min(m1EndIdx, times.length) - 1;
    if (lastIdx < fillIdx) return { triggered: true, filled: false };
    exitPrice = closes[lastIdx]; exitIdx = lastIdx; barsHeld = lastIdx - fillIdx;
    outcome = 'horizon';
  }
  const stopDist = Math.abs(entryPrice - sl);
  if (!(stopDist > 0)) return { triggered: true, filled: false };
  const grossPct = side === 'BUY' ? (exitPrice - entryPrice) / entryPrice * 100 : (entryPrice - exitPrice) / entryPrice * 100;
  const netPct = grossPct - costPct;
  const riskPctPrice = stopDist / entryPrice * 100;
  const rMult = riskPctPrice > 0 ? netPct / riskPctPrice : 0;
  const finalOutcome = outcome === 'horizon' ? (rMult > 0 ? 'win' : 'loss') : outcome;
  return {
    triggered: true, filled: true,
    entryFib: entryFibEff, entry: entryPrice, sl, tp, stopFib: stopFibEff, stopDist, side,
    fillIdx, fillTime: times[fillIdx], exitIdx, exitTime: times[exitIdx] ?? null, barsHeld,
    netPct: +netPct.toFixed(5), rMult: +rMult.toFixed(4), outcome: finalOutcome, horizonExit: outcome === 'horizon',
  };
}

// ── Fade-the-extension trade hypothesis ─────────────────────────────────────
// Reported second-hand (2026-08-23): a colleague is said to trade this
// pattern as a FADE, not a continuation — enter at one of the ladder rungs
// once price has extended at least ~2 range-widths beyond the impulse
// candle's own edge (fib < 2 is "still within the impulse", not yet
// overextended enough to fade), target back to the impulse candle's own
// median (fib=0.5), i.e. the OPPOSITE of simulateContinuationTrade above.
// Same bearish-mirroring convention as simulateContinuationTrade's
// targetFib (fib -> 1-fib), same resting-limit-no-confirmation fill style
// this group is independently on record preferring (JORDAN_VIDEO_INSIGHTS.md:
// "resting-limit entries with no confirmation indicator"). Every judgment
// call here is pinned and named, not verified against the colleague's own
// rule (which is second-hand and not fully specified) — see RESULTS.md.
export function nextRungBeyond(fib, bullish) {
  let best = null;
  for (const f of FIB) {
    if (bullish) { if (f > fib && (best === null || f < best)) best = f; }
    else         { if (f < fib && (best === null || f > best)) best = f; }
  }
  return best;
}

// vwapSeries (optional) is buildDailyVwapSeries(packed)'s output — when
// given, records vwapDistAtrAtEntry (signed: entryPrice minus VWAP, in ATR
// units, at the actual fill bar) so a caller can test gating entries by
// distance-from-VWAP — RESULTS.md §5's single strongest, most consistent
// finding (VWAP distance at the extension point correlates with the size
// of the reversal) was never wired into the plain fade trade above.
export function simulateFadeTrade(packed, impulse, m1StartIdx, m1EndIdx, cfg, costPct, vwapSeries = null) {
  const { times, highs, lows, closes } = packed;
  if (m1StartIdx >= m1EndIdx || m1StartIdx >= times.length) return { triggered: false };
  const { low, high, range, atr, bullish } = impulse;
  if (!(range > 0)) return { triggered: false };

  // Entry threshold: fib=cfg.entryFib (bullish) / 1-cfg.entryFib (bearish) —
  // same mirror convention as simulateContinuationTrade's targetFib.
  const entryFibEff = bullish ? cfg.entryFib : (1 - cfg.entryFib);
  const entryPrice = ladderPrice(low, high, entryFibEff);
  const side = bullish ? 'SELL' : 'BUY';   // fade = opposite of the impulse

  // Structural stop: the NEXT ladder rung beyond the entry level — "if price
  // keeps running to the next rung instead of reacting here, this instance
  // of the fade is wrong." rungsOut (default 1) lets the stop-sizing grid
  // test 2/3 rungs out too.
  const rungsOut = cfg.stopRungsOut ?? 1;
  let stopFibEff = entryFibEff;
  for (let k = 0; k < rungsOut; k++) {
    const next = nextRungBeyond(stopFibEff, bullish);
    if (next == null) return { triggered: false };
    stopFibEff = next;
  }
  const sl = ladderPrice(low, high, stopFibEff);

  // Target: the impulse candle's own median — direction-symmetric, fib=0.5
  // either way.
  const tp = ladderPrice(low, high, 0.5);

  let fillIdx = -1;
  for (let i = m1StartIdx; i < m1EndIdx; i++) {
    if (lows[i] <= entryPrice && highs[i] >= entryPrice) { fillIdx = i; break; }
  }
  if (fillIdx === -1) return { triggered: false };

  // Signed distance from VWAP at the actual fill bar, in ATR units — RESULTS.md
  // §5's finding was about distance at the EXHAUSTION point (the eventual
  // extreme), not necessarily the same bar as this entry (price can keep
  // extending past the entry rung before truly exhausting), so this is
  // computed fresh here rather than reused from analyzeImpulse's output.
  let vwapDistAtrAtEntry = null;
  if (vwapSeries && atr > 0) {
    const v = vwapSeries[Math.min(fillIdx, vwapSeries.length - 1)];
    if (v != null) vwapDistAtrAtEntry = +((entryPrice - v) / atr).toFixed(4);
  }

  let outcome = null, exitPrice = null, exitIdx = null, barsHeld = 0;
  for (let i = fillIdx; i < m1EndIdx; i++, barsHeld++) {
    if (side === 'SELL') {
      if (highs[i] >= sl) { outcome = 'loss'; exitPrice = sl; exitIdx = i; break; }
      if (lows[i] <= tp)  { outcome = 'win';  exitPrice = tp; exitIdx = i; break; }
    } else {
      if (lows[i] <= sl)  { outcome = 'loss'; exitPrice = sl; exitIdx = i; break; }
      if (highs[i] >= tp) { outcome = 'win';  exitPrice = tp; exitIdx = i; break; }
    }
  }
  if (outcome === null) {
    const lastIdx = Math.min(m1EndIdx, times.length) - 1;
    if (lastIdx < fillIdx) return { triggered: true, filled: false };
    exitPrice = closes[lastIdx]; exitIdx = lastIdx; barsHeld = lastIdx - fillIdx;
    outcome = 'horizon';
  }
  const stopDist = Math.abs(entryPrice - sl);
  if (!(stopDist > 0)) return { triggered: true, filled: false };
  const grossPct = side === 'BUY' ? (exitPrice - entryPrice) / entryPrice * 100 : (entryPrice - exitPrice) / entryPrice * 100;
  const netPct = grossPct - costPct;
  const riskPctPrice = stopDist / entryPrice * 100;
  const rMult = riskPctPrice > 0 ? netPct / riskPctPrice : 0;
  const finalOutcome = outcome === 'horizon' ? (rMult > 0 ? 'win' : 'loss') : outcome;
  return {
    triggered: true, filled: true,
    entryFib: entryFibEff, entry: entryPrice, sl, tp, stopFib: stopFibEff, stopDist, side,
    fillIdx, fillTime: times[fillIdx], exitIdx, exitTime: times[exitIdx] ?? null, barsHeld,
    vwapDistAtrAtEntry,
    netPct: +netPct.toFixed(5), rMult: +rMult.toFixed(4), outcome: finalOutcome, horizonExit: outcome === 'horizon',
  };
}

// ── Small stats helpers shared by the per-analysis runner scripts ─────────
// Not provided by any existing brick (metricsCore/honestForecastEngine are
// trade-P&L-shaped); Pearson r and a date-fraction IS/OOS split are the
// minimum needed for the impulse-size-vs-exhaustion / VWAP-distance-vs-
// reversal correlation claims, reported honestly per the repo's convention
// (first `1-oosFrac` of the date-sorted sample = IS, rest = OOS).
export function pearsonCorr(xs, ys) {
  const n = xs.length;
  if (n < 2) return { r: null, n };
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return { r: denom > 1e-12 ? +(num / denom).toFixed(4) : null, n };
}

// Splits date-tagged records into IS (earlier) / OOS (later) by a date
// fraction — same convention as honestForecastEngine.summarizeSplit (sort by
// date, cut at the (1-oosFrac) point), generalised beyond trade records.
export function splitByDateFrac(records, oosFrac = 0.4, dateKey = 'date') {
  const all = records.slice().sort((a, b) => (a[dateKey] < b[dateKey] ? -1 : 1));
  if (!all.length) return { is: [], oos: [], splitDate: null };
  const cut = Math.floor(all.length * (1 - oosFrac));
  const splitDate = all[cut]?.[dateKey] ?? null;
  const is = all.filter(r => (splitDate ? r[dateKey] < splitDate : true));
  const oos = all.filter(r => (splitDate ? r[dateKey] >= splitDate : false));
  return { is, oos, splitDate };
}

// ── Main entry point ──────────────────────────────────────────────────────
export function runImpulse4hRangeLevels(packed, cfg = {}, pairKey = null) {
  const fullCfg = { ...DEFAULT_CFG, ...cfg };
  const meta = metaFor(pairKey);
  const { h4Bars, atr } = buildH4(packed);
  const impulses = detectImpulses(h4Bars, atr, fullCfg);
  const vwapSeries = buildDailyVwapSeries(packed);

  const horizonM1Bars = fullCfg.horizonH4Bars * 240; // 4h = 240 minutes

  const records = [];
  for (let k = 0; k < impulses.length; k++) {
    const imp = impulses[k];
    const startTime = imp.time + H4;                          // first bar strictly after this H4 candle closes
    const nextImpTime = k + 1 < impulses.length ? impulses[k + 1].time : Infinity;
    const m1StartIdx = bsearch(packed.times, startTime);
    const capTime = imp.time + horizonM1Bars * 60;
    const endTime = Math.min(nextImpTime, capTime);
    const m1EndIdx = Math.min(packed.n, bsearch(packed.times, endTime));
    if (m1StartIdx >= m1EndIdx) continue;

    const forward = analyzeImpulse(packed, vwapSeries, imp, m1StartIdx, m1EndIdx);
    const trade = simulateContinuationTrade(packed, imp, m1StartIdx, m1EndIdx, fullCfg, meta.costPct);
    records.push({
      ...imp,
      horizonBoundedByNextImpulse: nextImpTime <= capTime,
      m1StartIdx, m1EndIdx,
      ...forward,
      trade,
    });
  }

  return {
    impulses: records,
    meta: {
      pairKey, assetClass: meta.assetClass, costPct: meta.costPct,
      h4Bars: h4Bars.length, from: h4Bars[0]?.time ?? null, to: h4Bars.at(-1)?.time ?? null,
      cfg: fullCfg, nImpulses: records.length,
    },
  };
}

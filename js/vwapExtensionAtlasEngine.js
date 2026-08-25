/**
 * VWAP Extension Atlas — the REFERENCE-BOOK companion to Level Atlas / Session
 * Path (`MD files/REFERENCE_ENGINE_PLAYBOOK.md`), NOT a fourth VWAP trading
 * engine. Three standalone VWAP mechanisms are already tested and null in
 * this repo (`MD files/VWAP_REVERSION_FINDINGS.md`'s ±2σ band fade/bounce/
 * follow, `education/jordan_vwap_session_reversion_backtest/RESULTS.md`'s
 * London→NY session-transition fade) — this engine does NOT re-test a rule.
 * It answers a narrower, prior question per the playbook's §3.3 discipline
 * ("reference book, not signal search"): when price stretches away from
 * session VWAP, what does history say happens next, and does session/
 * time-of-day/volatility/range-position/regime genuinely change that, or
 * not? No after-cost gate, no entry/exit rule, no "is this tradeable" cut —
 * a cell that shows 40% either way is a complete, correct answer here.
 *
 * ── THE UNIT (playbook §2) ───────────────────────────────────────────────
 * One row = one bar where a session's cumulative |price − VWAP| distance,
 * expressed in that day's OWN Wilder ATR-14 units, FIRST crosses a fixed
 * threshold (e.g. 1.5×ATR) on one side since the VWAP anchor reset — i.e.
 * "an extension just started," captured with everything true at that bar,
 * plus what happened to price relative to VWAP for the rest of that session.
 * A day contributes 0–2 rows per threshold (one per side, first crossing
 * only — re-arm/multiple-per-day is a documented future extension, not
 * built here, see the module-level TODO at the bottom).
 *
 * VWAP anchor = plain UTC calendar day (00:00–23:59 UTC), matching
 * `vwapReversionEngine.js`/`vwapSessionReversionV1Engine.js` exactly — kept
 * identical on purpose so this engine's population is directly comparable
 * to those two null results, not a subtly different VWAP definition (the
 * "three VWAP definitions" drift already flagged in `LEGO_MODULES.md`).
 * `computeSessionVwap` itself is REUSED, not re-derived.
 *
 * ── NO-LOOKAHEAD CONTRACT (playbook §3.1) ────────────────────────────────
 * - VWAP/sd at bar k: cumulative from that day's own open through bar k only
 *   (computeSessionVwap's own causal-by-construction cumulative loop).
 * - dayAtr: Wilder ATR-14 on daily bars strictly BEFORE today (today's own
 *   range never contributes to the threshold that gates today's crossings —
 *   avoids the exact "day volatility from its own eventual range" tautology
 *   `REFERENCE_ENGINE_PLAYBOOK.md` §3.1 names as a caught bug elsewhere).
 * - dayVolRegime / trailingMedianDayRange: from full days strictly before
 *   today only.
 * - dayType (trend-day-ness): `dayTypeScore`'s own contract — reads daily
 *   closes strictly before the passed `idx`; called with today's close
 *   excluded from the array entirely.
 * - htfTrend / momAdx / wtMtf / wtSlow: `confluenceFeatures.js`'s own
 *   causal contract — last CLOSED HTF bar strictly before the crossing
 *   bar's timestamp (never the bar the event falls inside).
 * - rangeConsumedToday / approachSpeedAtr: today's bars up to and including
 *   the crossing bar k ONLY — this is deliberately "today so far," not a
 *   future-peeking stat.
 * - Outcome (peakExtAtr, touchedVwapAfter, barsToVwapTouch,
 *   didExtendFurtherFirst, pctRetraced, wentToOppositeSide): scans bars
 *   STRICTLY AFTER the crossing bar only, capped at that UTC day's last bar
 *   — never reads into the next day's freshly-reset VWAP (playbook §6.2,
 *   "reading an in-progress period as complete").
 *
 * Pure: no network, no clock reads, no randomness. Callers supply packed M1
 * (`loadM1ForPair`'s shape) + instrument/assetClass.
 */

import { bisect } from './barUtils.js';
import { computeSessionVwap } from './vwapReversionEngine.js';
import { atrWilder } from './indicatorCore.js';
import { classifyDayType } from './dayTypeCore.js';
import { createHtfContext, featWtMtf, featWtSlow, featMomAdx, featHtfTrend } from './confluenceFeatures.js';

// UTC-hour session bucketing — same boundaries levelAtlasEngine.js/
// sessionPathEngine.js each already use (both keep their own private copy;
// a third small local copy is consistent with that existing, tolerated
// practice, not a new duplication of a real brick — this is a 3-line
// hour-bucket, not shared math like vol-sigma or the fill walker).
function sessionOf(hourUtc) {
  if (hourUtc >= 22 || hourUtc < 7) return 'Asia';
  if (hourUtc < 13) return 'London';
  return 'NY';
}
function sessionPosOf(hourUtc) {
  return hourUtc < 8 ? '1·00-08utc' : hourUtc < 16 ? '2·08-16utc' : '3·16-24utc';
}
function dowOf(dateStr) { return new Date(dateStr + 'T00:00:00Z').getUTCDay(); }

// Same ratio-to-trailing-median bucketing vocabulary `sessionVolBucket`
// (levelAtlasEngine.js) already uses elsewhere in this codebase — reused as
// a convention (same thresholds, same labels), not re-imported, since the
// day-key convention there (Asia keyed to its start date) doesn't line up
// with this engine's plain-UTC-day anchor without risking a mismatched
// lookup key.
function volRatioBucket(ratio) {
  if (ratio == null) return null;
  return ratio < 0.7 ? '1·quiet' : ratio > 1.4 ? '3·wild' : '2·normal';
}
function medianOf(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const THRESHOLDS_DEFAULT = [1.0, 1.5, 2.0, 2.5];

/**
 * vwapExtensionAtlasWalk(packed, { instrument, assetClass, thresholds })
 *   -> { rows: [...], coverage: { from, to, days } }
 */
export function vwapExtensionAtlasWalk(packed, {
  instrument, assetClass = 'fx', thresholds = THRESHOLDS_DEFAULT,
  minLookbackDays = 25, approachLookbackBars = 15, trailingDays = 20,
  minDayBars = 200,
} = {}) {
  const sym = String(instrument).toUpperCase();
  const { n, times, opens, highs, lows, closes, volumes } = packed;
  if (!n) return { rows: [], coverage: null };

  // ── 1) Bucket into plain UTC calendar days (own local helper — mirrors
  // vwapReversionEngine.js/vwapSessionReversionV1Engine.js's own per-file bar
  // extraction, each of which already keeps volume locally the same way;
  // reuses `bisect` for the day-boundary search rather than re-deriving it).
  const dayKeys = [];
  const dayIndex = new Map();   // dateStr -> { startIdx, endIdx } (M1 index range)
  {
    let i = 0;
    while (i < n) {
      const dayStart = times[i] - (times[i] % 86400);
      const dayEnd = dayStart + 86400;
      const startIdx = i;
      const endIdx = bisect(times, dayEnd);
      const date = new Date(dayStart * 1000).toISOString().slice(0, 10);
      dayKeys.push(date);
      dayIndex.set(date, { startIdx, endIdx, dayStart });
      i = endIdx;
    }
  }
  if (dayKeys.length <= minLookbackDays) return { rows: [], coverage: null };

  function dayBars(date) {
    const { startIdx, endIdx } = dayIndex.get(date);
    const out = [];
    for (let k = startIdx; k < endIdx; k++) {
      out.push({ time: times[k], open: opens[k], high: highs[k], low: lows[k], close: closes[k], volume: volumes ? volumes[k] : 1 });
    }
    return out;
  }

  // ── 2) Daily OHLC series (all days) — the basis for dayAtr, dayVolRegime,
  // dayType, all deliberately built from CLOSED prior days only at read time.
  const d1 = dayKeys.map(date => {
    const { startIdx, endIdx } = dayIndex.get(date);
    let hi = -Infinity, lo = Infinity;
    for (let k = startIdx; k < endIdx; k++) { if (highs[k] > hi) hi = highs[k]; if (lows[k] < lo) lo = lows[k]; }
    return { date, open: opens[startIdx], high: hi, low: lo, close: closes[endIdx - 1], range: hi - lo };
  });
  const d1Closes = d1.map(d => d.close);
  const atrSeries = atrWilder(d1, 14);   // atrSeries[i] uses d1[0..i] — read atrSeries[i-1] for "as of before day i"

  const htf = createHtfContext(packed);
  const cfg = htf.cfg;
  const otherSide = { up: 'down', down: 'up' };

  const rows = [];

  for (let i = minLookbackDays; i < dayKeys.length; i++) {
    const date = dayKeys[i];
    const bars = dayBars(date);
    if (bars.length < minDayBars) continue;   // holiday/illiquid day — skip, don't force a read

    // dayAtr: Wilder ATR-14 as of the CLOSE of yesterday (index i-1) — never
    // today's own range.
    const dayAtr = i >= 1 ? atrSeries[i - 1] : 0;
    if (!(dayAtr > 0)) continue;

    // Trailing-N-day median day-range, strictly before today — basis for
    // rangeConsumedToday and dayVolRegime.
    const trailStart = Math.max(0, i - trailingDays);
    const trailRanges = d1.slice(trailStart, i).map(d => d.range).filter(r => r > 0);
    const medRange = medianOf(trailRanges);
    const dayVolRegime = (medRange > 0 && i >= 1) ? volRatioBucket(d1[i - 1].range / medRange) : null;

    const dow = dowOf(date);
    const dayType = classifyDayType({ closes: d1Closes.slice(0, i), idx: i, win: 14 });

    const { vwap } = computeSessionVwap(bars);

    // distAtr[k] = signed distance from VWAP, in today's ATR units, causal
    // (uses vwap[k], the cumulative-to-k VWAP, and today's own bar k close).
    const distAtr = new Float64Array(bars.length);
    for (let k = 0; k < bars.length; k++) distAtr[k] = (bars[k].close - vwap[k]) / dayAtr;

    // "Already crossed today" gate — one row per side per threshold, FIRST
    // crossing only (see module header: re-arm is a documented future
    // extension, not built).
    const crossedUp = new Set(), crossedDown = new Set();

    let runHi = bars[0].high, runLo = bars[0].low;   // for rangeConsumedToday, causal running extreme
    for (let k = 0; k < bars.length; k++) {
      const bar = bars[k];
      if (bar.high > runHi) runHi = bar.high;
      if (bar.low < runLo) runLo = bar.low;
      const rangeConsumedToday = medRange > 0 ? (runHi - runLo) / medRange : null;
      const hourUtc = new Date(bar.time * 1000).getUTCHours();

      for (const side of ['up', 'down']) {
        const isUp = side === 'up';
        const d = isUp ? distAtr[k] : -distAtr[k];
        for (const thr of thresholds) {
          const doneSet = isUp ? crossedUp : crossedDown;
          const key = thr;
          if (doneSet.has(key)) continue;         // already fired this side+threshold today
          if (!(d >= thr)) continue;               // not there yet
          doneSet.add(key);

          // ── Context at the crossing bar (all causal per the header) ──
          const approachIdx = Math.max(0, k - approachLookbackBars);
          const approachSpeedAtr = +(d - (isUp ? distAtr[approachIdx] : -distAtr[approachIdx])).toFixed(3);

          const t = bar.time;
          const wtMtf    = featWtMtf(htf, t, isUp, cfg);
          const wtSlow   = featWtSlow(htf, t, isUp, cfg);
          const momAdx   = featMomAdx(htf, t, cfg);
          const htfTrend = featHtfTrend(htf, t, isUp, cfg);

          // ── Outcome — forward-only, capped at this day's last bar ──
          let peakExtAtr = d;
          let touchedVwapAfter = false, barsToVwapTouch = null;
          let didExtendFurtherFirst = false;
          let wentToOppositeSide = false;
          let resolvedDistAtr = d;   // distAtr (same-side sign) at the resolution bar

          for (let j = k + 1; j < bars.length; j++) {
            const bj = bars[j];
            const dj = isUp ? distAtr[j] : -distAtr[j];
            if (dj > peakExtAtr) { peakExtAtr = dj; didExtendFurtherFirst = true; }
            // VWAP touch: opposite-direction extreme of the bar crosses back
            // to (or through) that bar's own cumulative VWAP.
            const touchedThisBar = isUp ? (bj.low <= vwap[j]) : (bj.high >= vwap[j]);
            if (touchedThisBar) {
              touchedVwapAfter = true;
              barsToVwapTouch = j - k;
              resolvedDistAtr = 0;
              // Did it continue THROUGH VWAP to the opposite side's own
              // threshold before day end? (ICT-style "VWAP as pivot, not
              // wall" case.)
              for (let m = j + 1; m < bars.length; m++) {
                const dm = isUp ? -distAtr[m] : distAtr[m];   // opposite side's own signed distance
                if (dm >= thr) { wentToOppositeSide = true; break; }
              }
              break;
            }
            resolvedDistAtr = dj;
          }
          const unresolvedAtDayEnd = !touchedVwapAfter;
          const pctRetraced = peakExtAtr > 0
            ? +Math.max(0, Math.min(1, (peakExtAtr - resolvedDistAtr) / peakExtAtr)).toFixed(3)
            : null;

          rows.push({
            instrument: sym, assetClass, date, side,
            extAtrThreshold: thr,
            crossTime: t, crossHourUtc: hourUtc,
            session: sessionOf(hourUtc), sessionPos: sessionPosOf(hourUtc), dow,
            dayAtr: +dayAtr.toFixed(6),
            distAtrAtCross: +d.toFixed(3),
            approachSpeedAtr,
            rangeConsumedToday: rangeConsumedToday != null ? +rangeConsumedToday.toFixed(3) : null,
            rangeConsumedBucket: volRatioBucket(rangeConsumedToday),
            dayVolRegime,
            dayType: dayType.label, dayTypeT: dayType.T,
            htfTrend: htfTrend.bucket, momAdx: momAdx.bucket, wtMtf: wtMtf.bucket, wtSlow: wtSlow.bucket,
            peakExtAtr: +peakExtAtr.toFixed(3),
            touchedVwapAfter, barsToVwapTouch,
            didExtendFurtherFirst,
            pctRetraced,
            wentToOppositeSide,
            unresolvedAtDayEnd,
          });
        }
      }
    }
  }

  return { rows, coverage: { from: dayKeys[minLookbackDays], to: dayKeys.at(-1), days: dayKeys.length - minLookbackDays } };
}

// ── Not built here (logged per REFERENCE_ENGINE_PLAYBOOK.md's "no silent
// caps" rule, so scope is explicit rather than silently narrow) ──────────
// - Re-arm: only the FIRST crossing per side/threshold/day is captured. A
//   day where price crosses 1.5×ATR, fades, and crosses 1.5×ATR again is
//   only represented once.
// - Confluence with the range-extension ladder / golden pocket / prior-day
//   levels (the "what range are we in" layer beyond a simple range-consumed
//   ratio) — `js/fibProjection.js`'s ladder needs an Asia/Monday reference
//   range wired in separately; left for a follow-up pass, not built.
// - Options/gamma regime, calendar events, cross-asset confirmation — same
//   "not yet built, flagged" status the playbook itself gives these layers
//   for Level Atlas/Session Path.

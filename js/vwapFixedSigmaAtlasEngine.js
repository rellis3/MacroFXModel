/**
 * VWAP Fixed-Sigma Atlas — a faithful port of the owner's own Pine Script
 * indicator ("VWAP Fixed Sigma + MFE MAE"), as a reference-book engine per
 * `MD files/REFERENCE_ENGINE_PLAYBOOK.md`. NOT a signal search — no
 * after-cost gate, no entry/exit rule beyond the indicator's own literal
 * hypothetical-fade definition. This is a DIFFERENT band construction from
 * `js/vwapExtensionAtlasEngine.js` (which used a daily-ATR-normalised
 * distance from a plain cumulative session VWAP) and from
 * `js/vwapReversionEngine.js` (whose already-tested-null ±2σ band used a
 * σ that grows continuously WITHIN the same day) — this one's σ is FIXED
 * for the whole session, set once at session open from real prior history.
 * That's a real mechanism difference, not a relabelling — see the Pine
 * source (owner-authored, not reverse-engineered) for the ground truth.
 *
 * ── THE MECHANISM (ported 1:1 from the Pine, ported not reinvented) ──────
 * 1. Session VWAP: standard cumulative Σ(hlc3·vol)/Σvol, reset at UTC
 *    midnight (`computeSessionVwap` reused, called once per day on that
 *    day's own bar slice — same day-bucketing convention as
 *    `vwapExtensionAtlasEngine.js`, for comparability).
 * 2. Each session, accumulate Σ(hlc3 − runningVWAP)² bar by bar. At that
 *    session's OWN close, `RMS = sqrt(Σ / barsInSession)` — one number per
 *    completed session.
 * 3. Keep the last `historySessions` (default 20) RMS values; `fixedSigma`
 *    for the NEXT session = their MEAN (median is an option in the Pine,
 *    off by the owner's own configuration — mean only, ported that way).
 *    `fixedSigma` is locked at session open and never updates intra-session
 *    — today's own developing volatility never widens today's bands.
 * 4. Bands = runningVWAP(t) ± fixedSigma × {1, 1.5, 2, 2.5, 3}. Only
 *    {2, 2.5, 3}σ get MFE/MAE tracked, matching the Pine's own event slots
 *    (1σ/1.5σ are touch-plotted only, never measured, in the source).
 * 5. A "fresh" touch requires the level ONE bar ago to have contained the
 *    close TWO bars ago, and the level one bar ago to be breached by the
 *    CURRENT bar's wick — ported exactly, including the Pine's own
 *    off-by-one (comparing close[1] against level[2], not level[1]), which
 *    exists to avoid same-bar repaint, not a bug to "fix". Never fires on
 *    the first bar of a new session (`not newSession`, ported).
 * 6. Direction is FIXED by which band: touching an upper band = hypothetical
 *    SHORT (fade), lower = hypothetical LONG (fade) — never the other way.
 * 7. MFE/MAE run for a fixed `measureBars` window (default 20) starting the
 *    bar AFTER the touch, in price AND normalised by `fixedSigma` AT THE
 *    TIME OF THE TOUCH. One active event per (side, level) slot at a time;
 *    a new touch on an already-active slot is ignored until that event
 *    completes (or the session ends, which cancels it outright) — so a
 *    slot CAN re-arm more than once per day, unlike the sibling engine's
 *    first-crossing-only design.
 *
 * ── ADDED HERE, NOT IN THE PINE (the owner's actual ask) ─────────────────
 * Context dimensions the Pine doesn't compute, crossed against the same
 * MFE/MAE outcome: session, day of week, day type, HTF trend/ADX (all
 * reused bricks), fixedSigma's own percentile vs its trailing history, and
 * — the new piece — **multi-timeframe VuManChu divergence agreement** at
 * the touch bar, via `divergenceCore.reversalDecision` on 1m/15m/1h/4h
 * WaveTrend(wt2), reusing `createHtfContext`'s already-computed 15m/1h/4h
 * series and one fresh M1 WaveTrend pass for the base timeframe.
 * `reversalDecision`'s own `side` convention (+1 up-touch looks for a BEAR
 * divergence, -1 down-touch looks for a BULL one) maps directly onto the
 * Pine's own upper=short/lower=long direction — no re-derivation needed.
 *
 * No-lookahead: fixedSigma for session i is built ONLY from sessions
 * strictly before i. Fresh-touch/MFE/MAE only ever read bars at or after
 * the touch bar for the outcome, never before. Divergence reads use
 * `htfIdxAt`'s own causal "last CLOSED HTF bar" contract; the M1 read is
 * gated to `touchIdx` inclusive only (`reversalDecision`'s own contract).
 *
 * Pure: no network, no clock reads, no randomness.
 */

import { bisect } from './barUtils.js';
import { computeSessionVwap } from './vwapReversionEngine.js';
import { computeWaveTrend } from './vumanchuCore.js';
import { createHtfContext, featHtfTrend, featMomAdx, htfIdxAt } from './confluenceFeatures.js';
import { reversalDecision } from './divergenceCore.js';
import { classifyDayType } from './dayTypeCore.js';

function sessionOf(hourUtc) {
  if (hourUtc >= 22 || hourUtc < 7) return 'Asia';
  if (hourUtc < 13) return 'London';
  return 'NY';
}
function dowOf(dateStr) { return new Date(dateStr + 'T00:00:00Z').getUTCDay(); }
function sigmaPctileBucket(ratio) {
  if (ratio == null) return null;
  return ratio < 0.7 ? '1·narrow' : ratio > 1.4 ? '3·wide' : '2·normal';
}
function medianOf(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

const LEVELS_DEFAULT = [2, 2.5, 3];       // matches the Pine's own event slots
const DIV_TFS = ['1m', '15m', '1h', '4h'];

// divergenceCore.reversalDecision rescans from bar 0 to touchIdx on every
// call (fine for occasional calls; this engine can fire thousands of touch
// events over millions of M1 bars). Bound the lookback well beyond the
// default reach(2)/window(5) so no real pivot pair within the decision
// window is ever clipped, while keeping each call O(boundedLookback), not
// O(touchIdx). Same bound applied to HTF arrays for consistency.
const DIV_LOOKBACK_BARS = 200;
function boundedReversalDecision(hi, lo, osc, touchIdx, side) {
  const start = Math.max(0, touchIdx - DIV_LOOKBACK_BARS);
  const end = touchIdx + 1;
  if (start === 0) return reversalDecision(hi.slice(0, end), lo.slice(0, end), osc.slice(0, end), touchIdx, side);
  return reversalDecision(hi.slice(start, end), lo.slice(start, end), osc.slice(start, end), touchIdx - start, side);
}

/**
 * vwapFixedSigmaAtlasWalk(packed, { instrument, assetClass, ... })
 *   -> { rows: [...], coverage: { from, to, sessions } }
 */
export function vwapFixedSigmaAtlasWalk(packed, {
  instrument, assetClass = 'fx',
  historySessions = 20, useMedian = false,   // owner's own config: mean, not median
  measureBars = 20, levels = LEVELS_DEFAULT,
  minLookbackSessions = 25,
} = {}) {
  const sym = String(instrument).toUpperCase();
  const { n, times, opens, highs, lows, closes, volumes } = packed;
  if (!n) return { rows: [], coverage: null };

  // ── 1) Day bucketing (plain UTC calendar day, same convention as
  // vwapExtensionAtlasEngine.js) + an O(1) per-bar day-index lookup table
  // (computed ONCE — avoids any per-bar search/scan in the hot loop below,
  // and avoids the classic "stateful forward-only cursor queried backward
  // for k-1/k-2 within the same iteration" bug). ───────────────────────────
  const dayKeys = [];
  const dayStartIdx = [];
  const dayEndIdx = [];
  {
    let i = 0;
    while (i < n) {
      const dayStart = times[i] - (times[i] % 86400);
      const dayEnd = dayStart + 86400;
      const startIdx = i;
      const endIdx = bisect(times, dayEnd);
      dayKeys.push(new Date(dayStart * 1000).toISOString().slice(0, 10));
      dayStartIdx.push(startIdx);
      dayEndIdx.push(endIdx);
      i = endIdx;
    }
  }
  if (dayKeys.length <= minLookbackSessions) return { rows: [], coverage: null };

  const dayOfBar = new Int32Array(n);
  for (let d = 0; d < dayKeys.length; d++) for (let k = dayStartIdx[d]; k < dayEndIdx[d]; k++) dayOfBar[k] = d;

  // ── 2) M1 bars (whole history) — computeSessionVwap has no day-reset
  // logic of its own, so it's called ONCE PER DAY on that day's own slice,
  // writing into one continuous array (exactly mirrors the sibling engine).
  const m1Bars = [];
  for (let k = 0; k < n; k++) m1Bars.push({ time: times[k], open: opens[k], high: highs[k], low: lows[k], close: closes[k], volume: volumes ? volumes[k] : 1 });
  const vwapArr = new Float64Array(n);
  for (let d = 0; d < dayKeys.length; d++) {
    const s = dayStartIdx[d], e = dayEndIdx[d];
    if (e - s < 2) continue;
    const { vwap: dayVwap } = computeSessionVwap(m1Bars.slice(s, e));
    for (let k = 0; k < dayVwap.length; k++) vwapArr[s + k] = dayVwap[k];
  }

  const { wt2: m1Wt2 } = computeWaveTrend(m1Bars);
  const htf = createHtfContext(packed);
  const cfg = htf.cfg;
  const d1Closes = dayKeys.map((_, d) => closes[dayEndIdx[d] - 1]);

  // Precompute each HTF's own high/low arrays ONCE — divergenceCore is
  // called at every touch event (which, unlike the sibling engine, can fire
  // many times per day per slot), so re-mapping a quarter-million-bar 15m
  // array per touch would be a real cost, not a rounding error.
  const htfHiLo = {};
  for (const tf of DIV_TFS) {
    if (tf === '1m') continue;
    const s2 = htf.byTf[tf];
    if (!s2) continue;
    htfHiLo[tf] = { hi: s2.bars.map(b => b.high), lo: s2.bars.map(b => b.low) };
  }

  // ── 3) Per-day RMS-from-VWAP + trailing-history fixedSigma (causal: day
  // d's fixedSigma comes from sessions strictly before d) ──────────────────
  const dailyRMS = new Array(dayKeys.length).fill(null);
  const fixedSigmaOf = new Array(dayKeys.length).fill(null);
  {
    const historyQueue = [];
    for (let d = 0; d < dayKeys.length; d++) {
      if (historyQueue.length > 0) {
        fixedSigmaOf[d] = useMedian ? medianOf(historyQueue)
          : historyQueue.reduce((s, v) => s + v, 0) / historyQueue.length;
      }
      const s = dayStartIdx[d], e = dayEndIdx[d];
      if (e - s >= 2) {
        let sumSq = 0;
        for (let k = s; k < e; k++) {
          const hlc3 = (highs[k] + lows[k] + closes[k]) / 3;
          const dv = hlc3 - vwapArr[k];
          sumSq += dv * dv;
        }
        const rms = Math.sqrt(sumSq / (e - s));
        dailyRMS[d] = rms;
        historyQueue.push(rms);
        while (historyQueue.length > historySessions) historyQueue.shift();
      }
    }
  }

  // ── 4) The continuous bar-by-bar walk, mirroring the Pine's own
  // execution model (one pass, per-slot event state) ───────────────────────
  const SLOTS = [];
  for (const lv of levels) { SLOTS.push({ side: 'short', level: lv }); SLOTS.push({ side: 'long', level: lv }); }

  function levelAt(k, side, level) {
    const d = dayOfBar[k];
    const fs = fixedSigmaOf[d];
    if (fs == null || !(fs > 0)) return null;
    return side === 'short' ? vwapArr[k] + fs * level : vwapArr[k] - fs * level;
  }

  const active = SLOTS.map(() => null);
  const rows = [];

  for (let k = 2; k < n; k++) {
    const d = dayOfBar[k];
    if (d < minLookbackSessions) continue;
    const newSession = dayOfBar[k - 1] !== d;
    if (newSession) { for (let s = 0; s < SLOTS.length; s++) active[s] = null; }

    const fixedSigma = fixedSigmaOf[d];
    if (fixedSigma == null || !(fixedSigma > 0)) continue;

    // ── update active events (before new events are created — the touch
    // bar itself never contributes to its own MFE/MAE) ─────────────────
    for (let s = 0; s < SLOTS.length; s++) {
      const ev = active[s];
      if (!ev) continue;
      const isShort = SLOTS[s].side === 'short';
      const favourable = isShort ? Math.max(0, ev.entry - lows[k]) : Math.max(0, highs[k] - ev.entry);
      const adverse = isShort ? Math.max(0, highs[k] - ev.entry) : Math.max(0, ev.entry - lows[k]);
      if (favourable > ev.mfe) ev.mfe = favourable;
      if (adverse > ev.mae) ev.mae = adverse;
      ev.age++;
      if (ev.age >= measureBars) {
        rows.push({
          instrument: sym, assetClass, date: dayKeys[dayOfBar[ev.touchIdx]], side: SLOTS[s].side, level: SLOTS[s].level,
          touchTime: times[ev.touchIdx], touchHourUtc: new Date(times[ev.touchIdx] * 1000).getUTCHours(),
          ...ev.context,
          measureBars,
          fixedSigma: +ev.sigma.toFixed(6),
          mfePips: +ev.mfe.toFixed(6), maePips: +ev.mae.toFixed(6),
          mfeSigma: +(ev.mfe / ev.sigma).toFixed(3), maeSigma: +(ev.mae / ev.sigma).toFixed(3),
        });
        active[s] = null;
      }
    }

    // ── fresh-touch detection + new-event creation ─────────────────────
    for (let s = 0; s < SLOTS.length; s++) {
      if (active[s]) continue;
      const { side, level } = SLOTS[s];
      const lvl1 = levelAt(k - 1, side, level);
      const lvl2 = levelAt(k - 2, side, level);
      if (lvl1 == null || lvl2 == null) continue;
      const isShort = side === 'short';
      const wasInside = isShort ? closes[k - 1] < lvl2 : closes[k - 1] > lvl2;
      const breachesNow = isShort ? highs[k] >= lvl1 : lows[k] <= lvl1;
      if (newSession || !(wasInside && breachesNow)) continue;

      const t = times[k];
      const hourUtc = new Date(t * 1000).getUTCHours();
      const htfTrend = featHtfTrend(htf, t, isShort ? -1 : 1, cfg);   // "with"/"against" the FADE direction
      const momAdx = featMomAdx(htf, t, cfg);
      const dayType = classifyDayType({ closes: d1Closes.slice(0, d), idx: d, win: 14 });

      const divSide = isShort ? 1 : -1;
      let divAgree = 0;
      for (const tf of DIV_TFS) {
        let decision;
        if (tf === '1m') {
          decision = boundedReversalDecision(highs, lows, m1Wt2, k, divSide);
        } else {
          const tIdx = htfIdxAt(htf, tf, t);
          if (tIdx < 0 || !htfHiLo[tf]) continue;
          const s2 = htf.byTf[tf];
          decision = boundedReversalDecision(htfHiLo[tf].hi, htfHiLo[tf].lo, s2.wt2, tIdx, divSide);
        }
        if (decision === 'fade') divAgree++;
      }

      const trailStart = Math.max(0, d - historySessions);
      const trailVals = dailyRMS.slice(trailStart, d).filter(v => v != null);
      const medRms = medianOf(trailVals);
      const sigmaPctile = medRms > 0 ? sigmaPctileBucket(fixedSigma / medRms) : null;

      active[s] = {
        entry: lvl1, sigma: fixedSigma, touchIdx: k, mfe: 0, mae: 0, age: 0,
        context: {
          session: sessionOf(hourUtc), dow: dowOf(dayKeys[d]),
          htfTrend: htfTrend.bucket, momAdx: momAdx.bucket,
          dayType: dayType.label, dayTypeT: dayType.T,
          sigmaPctile, divAgree,
        },
      };
    }
  }

  return { rows, coverage: { from: dayKeys[minLookbackSessions], to: dayKeys.at(-1), sessions: dayKeys.length - minLookbackSessions } };
}

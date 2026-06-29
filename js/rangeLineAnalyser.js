/**
 * Range-Line Analyser — the Forecast-Level Strategy (STRATEGY_BUILD.md) applied to
 * RANGE-EXTENSION levels, with the confluence modules STRIPPED OUT.
 *
 * Motivation: the asiaRangeEngine confluence-module stack added noise (the module
 * audit showed most modules don't lift expectancy). This pipeline throws all of
 * that away and tests the clean question: treat each Asia/Monday range-extension
 * fib level as a "line", and learn — per (line × approach) cell, on after-cost
 * expectancy, IS→OOS — whether to FADE / FOLLOW / SKIP it. The exact machinery
 * the vol-forecaster used to reach 33/33 OOS, now fed by range levels instead of
 * the σ-forecast lines.
 *
 * It REUSES the proven bricks, never copies:
 *   • touchFeatures (approachVel etc.)        — the at-the-moment confidence read
 *   • perLineStrategy (extractTouches/buildPolicy/runPerLine) — the policy + book
 *   • barUtils / fibProjection                — ranges + fib projection
 *   • forecastAnalyser.bucketM1IntoSessions    — the 22:00-UTC session split
 *   • forecastCore.volSigmaSeries              — daily σ (for approachVel units)
 *
 * `analyseRangeWindow` emits the SAME line-record shape `perLineStrategy.extractTouches`
 * consumes: { name, side, outcome, level, innerLvl, outerLvl, decidedBy,
 * firstTouchTime, approachVel(bucket) }. Triple-barrier: TP = next line toward the
 * range mid (inner), SL = next away (outer); else mark-to-close. No confluence.
 */

import { bodyRange, extractBars } from './barUtils.js';
import { FIB_LEVELS } from './fibProjection.js';
import { volSigmaSeries } from './forecastCore.js';
import { bucketM1IntoSessions } from './forecastAnalyser.js';
import { createTouchFeatures } from './touchFeatures.js';
import { extractTouches, runPerLine } from './perLineStrategy.js';

// Sparse STRUCTURAL ladder — half-integer fib grid (…−1,−0.5,0,0.5,1,1.5…) so the
// triple-barrier neighbours are real distances, not the 0.25-dense grid.
// Exported so the LIVE v2 producer (levelsV2Engine.js) builds the IDENTICAL ladder
// the offline policy was learned on — same labels → same cell keys → no drift.
export const LADDER_LEVELS = FIB_LEVELS.filter(L => Number.isInteger(L * 2));

// Build the day's line ladder off a range: [{ label, level(price) }] sorted.
export function buildRangeLadder(low, range, srcTag) {
  return LADDER_LEVELS
    .map(L => ({ label: `${srcTag}_${L}`, fibL: L, level: low + range * L }))
    .sort((a, b) => a.level - b.level);
}

// ── Analyse one session's M1 path against one or more range ladders ───────────
// ladders: [{ low, high, levels:[{label,level}] }] (e.g. Asia, Monday). All
// resolved against the SAME intraday path (this session's bars). Emits line
// records in perLineStrategy's shape.
export function analyseRangeWindow({ open, bars }, ladders, ctx = {}) {
  const { sigma = 0, tf = null, pip = 0 } = ctx;
  const n = bars.length;
  if (n < 2) return [];
  const closePx = bars[n - 1].close;
  const wt1 = tf ? tf.wtSeries(bars) : null;
  const out = [];

  for (const lad of ladders) {
    const mid = (lad.low + lad.high) / 2;
    const prices = lad.levels.map(l => l.level);          // sorted ascending
    // NO LOOKAHEAD: a level isn't tradeable until its range is KNOWN. The Asia
    // low/high (A_0/A_1) are defined by the formation window, so a touch DURING
    // formation + "revert to mid" is circular (price is inside its own range by
    // construction). `validFrom` excludes every bar before the range closed.
    const validFrom = lad.validFrom ?? -Infinity;
    for (const ln of lad.levels) {
      const L = ln.level;
      const side = L > mid ? 'up' : 'dn';

      // First intrabar touch of the line, ON OR AFTER the level became known.
      let touchIdx = -1, ftt = null;
      for (let k = 0; k < n; k++) {
        if (bars[k].time < validFrom) continue;            // level not yet known
        const hit = side === 'up' ? bars[k].high >= L : bars[k].low <= L;
        if (hit) { touchIdx = k; ftt = bars[k].time ?? null; break; }
      }
      if (touchIdx < 0) continue;                          // never touched (post-formation) → not a trade

      // Neighbours among the ladder: inner = next toward mid (TP), outer = away (SL).
      let belowP = null, aboveP = null;
      for (const p of prices) {
        if (p < L - 1e-12) belowP = p;
        else if (p > L + 1e-12 && aboveP == null) aboveP = p;
      }
      const inner = side === 'up' ? belowP : aboveP;
      const outer = side === 'up' ? aboveP : belowP;
      if (inner == null || outer == null) continue;        // extreme line, no barrier → skip

      // At-the-moment approach features (approachVel etc.) — bucket, lookahead-free.
      let approachVel = null;
      if (tf) {
        const f = tf.compute({ bars, touchIdx, open, sigma, side, wt1, level: L, pip });
        approachVel = f.approachVel?.bucket ?? null;
      }

      // Triple-barrier walk from the touch: inner first = reverted, outer = continued.
      let outcome = 'undecided', decidedBy = 'close';
      for (let k = touchIdx; k < n; k++) {
        const bar = bars[k];
        if (side === 'up') {
          if (bar.low  <= inner) { outcome = 'reverted';  decidedBy = 'barrier'; break; }
          if (bar.high >= outer) { outcome = 'continued'; decidedBy = 'barrier'; break; }
        } else {
          if (bar.high >= inner) { outcome = 'reverted';  decidedBy = 'barrier'; break; }
          if (bar.low  <= outer) { outcome = 'continued'; decidedBy = 'barrier'; break; }
        }
      }
      if (outcome === 'undecided') {
        outcome = side === 'up' ? (closePx > L ? 'continued' : 'reverted')
                                : (closePx < L ? 'continued' : 'reverted');
      }

      out.push({
        name: ln.label, side, level: +L.toFixed(6),
        innerLvl: +inner.toFixed(6), outerLvl: +outer.toFixed(6),
        decidedBy, firstTouchTime: ftt, outcome, approachVel,
      });
    }
  }
  return out;
}

// Daily OHLC from the M1 sessions (open=first, close=last) — for σ + Monday range.
function sessionsToD1(sessions, dates) {
  return dates.map(date => {
    const b = sessions.get(date);
    let hi = -Infinity, lo = Infinity;
    for (const x of b) { if (x.high > hi) hi = x.high; if (x.low < lo) lo = x.low; }
    return { date, open: b[0].open, high: hi, low: lo, close: b[b.length - 1].close };
  });
}

// Monday-of-week date string for a given session date (UTC).
function mondayOf(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const dow = d.getUTCDay();                                // 0=Sun..6=Sat
  d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return d.toISOString().slice(0, 10);
}

// ── Walk every session → range-line records (no confluence, no modules) ───────
// sessions = Map(date → ordered M1 bars[]) from bucketM1IntoSessions.
// opts: { sources:['asia','monday'], minLookback, minBarsPerSession, asiaHrs:6,
//         dateFrom, dateTo, touchCfg }.
export function runRangeLineAnalyser(sessions, assetClass = 'fx', opts = {}) {
  const { sources = ['asia', 'monday'], minLookback = 20, minBarsPerSession = 30,
          asiaHrs = 6, dateFrom = '', dateTo = '' } = opts;
  const tf = createTouchFeatures(opts.touchCfg);

  const dates = [...sessions.keys()].sort()
    .filter(d => (sessions.get(d)?.length ?? 0) >= minBarsPerSession);
  if (dates.length <= minLookback) return [];

  const d1 = sessionsToD1(sessions, dates);
  const sigD = volSigmaSeries(d1, assetClass);
  const dateIdx = new Map(dates.map((d, i) => [d, i]));

  // Asia range per session = first asiaHrs of that session's bars (5m bodies).
  // Monday range per week = the Monday session's full-day bars (15m bodies).
  const mondayCache = new Map();   // mondayDate → { low, high } | null

  const records = [];
  for (let i = minLookback; i < dates.length; i++) {
    const date = dates[i];
    if (dateFrom && date < dateFrom) continue;
    if (dateTo && date > dateTo) continue;
    const bars = sessions.get(date);
    if (!bars || bars.length < 2) continue;
    const open = bars[0].open;
    const sigma = sigD[i] || 0;

    const ladders = [];
    if (sources.includes('asia')) {
      const t0 = bars[0].time;
      const asiaClose = t0 + asiaHrs * 3600;               // Asia range known only after this
      const asiaBars = bars.filter(b => b.time < asiaClose);
      const ar = bodyRange(asiaBars, 5);
      // Only tradeable if there are post-formation bars left in the session.
      if (ar && bars[bars.length - 1].time >= asiaClose)
        ladders.push({ low: ar.low, high: ar.high, validFrom: asiaClose, levels: buildRangeLadder(ar.low, ar.range, 'A') });
    }
    if (sources.includes('monday')) {
      const monDate = mondayOf(date);
      // The Monday range is only known once Monday closes — never trade it on
      // Monday itself (that would be the same circular formation-window lookahead).
      if (monDate !== date) {
        let mr = mondayCache.get(monDate);
        if (mr === undefined) {
          const monBars = sessions.get(monDate);
          mr = monBars && monBars.length >= minBarsPerSession ? bodyRange(monBars, 15) : null;
          mondayCache.set(monDate, mr);
        }
        if (mr) ladders.push({ low: mr.low, high: mr.high, validFrom: bars[0].time, levels: buildRangeLadder(mr.low, mr.range, 'M') });
      }
    }
    if (!ladders.length) continue;

    const lines = analyseRangeWindow({ open, bars }, ladders, { sigma, tf, pip: opts.pip ?? 0 });
    if (lines.length) records.push({ date, open: +open.toFixed(6), realized: { close: +bars[bars.length - 1].close.toFixed(6) }, lines });
  }
  return records;
}

// ── One pair: packed M1 → range-line touches (the per-pair unit of work) ──────
// Returns the lightweight touch array (perLineStrategy shape). The caller can
// drop `packed` after this — only the small touch list is retained — so a 26-pair
// book never holds all the M1 in memory at once.
export function touchesForPair(packed, assetClass = 'fx', opts = {}) {
  return extractTouches(recordsForPair(packed, assetClass, opts),
                        { conditions: opts.conditions ?? ['approachVel'] });
}

// The EXPENSIVE half (packed M1 → session walk → line records), split out so a
// caller can cache it: the records depend only on the data window + line/cell
// formation, NOT on `conditions` (which only changes how extractTouches keys the
// cell). So a cached records list lets a none↔approachVel toggle re-derive touches
// for free. Pair it with the re-exported `extractTouches` below.
export function recordsForPair(packed, assetClass = 'fx', opts = {}) {
  const sessions = bucketM1IntoSessions(packed, opts.boundaryHour ?? 22);
  return runRangeLineAnalyser(sessions, assetClass, opts);
}

// ── Full book: packed M1 per pair → records → pooled-IS policy → per-pair OOS ──
// packedByPair: { pair: packed }.  assetClassByPair optional. Returns the
// perLineStrategy.runPerLine result (policy + per-pair OOS + book stats + equity).
// NOTE: this holds every pair's packed M1 at once — fine for tests / a few pairs.
// The server route processes pairs one-at-a-time (releasing M1 + yielding) for
// the full 26-pair book; see /api/range-line/run.
export function runRangeLineBook(packedByPair, opts = {}) {
  const { assetClassByPair = {} } = opts;
  const touchesByPair = {};
  for (const [pair, packed] of Object.entries(packedByPair)) {
    touchesByPair[pair] = touchesForPair(packed, assetClassByPair[pair] ?? 'fx', opts);
  }
  return runPerLine(touchesByPair, opts);
}

// Re-export so a streaming caller (the server route) can build touchesByPair
// pair-by-pair and run the pooled policy itself without a second import.
// `costForPair` lets the route price each pair at its real round-trip spread
// (the survivor / cost-sensitivity logic depends on per-pair costs).
// `extractTouches` pairs with `recordsForPair` for cache-then-derive.
// `runRigor`/`runSensitivity`/`deflatedSharpe` are the forecast-engine's proven
// robustness battery (walk-forward / per-year / cost-stress / IS-vs-OOS /
// deflated Sharpe) — the range-line route surfaces them so the strategy is judged
// the same honest way, not by the breadth-inflated headline Sharpe alone.
export { runPerLine, costForPair, runRigor, runSensitivity } from './perLineStrategy.js';
export { extractTouches } from './perLineStrategy.js';
export { deflatedSharpe } from './backtestStats.js';
